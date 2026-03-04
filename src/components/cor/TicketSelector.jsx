import { useState, useEffect, useMemo } from 'react'
import { X, Check, Search, FileText, Users, Package, Truck, ChevronDown, ChevronRight } from 'lucide-react'
import { db } from '../../lib/supabase'
import { dollarsToCents } from '../../lib/corCalculations'

// Generate secure random ID suffix
const generateRandomId = () => {
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(36)).join('')
}

export default function TicketSelector({ projectId, companyId, corId, onImport, onClose, onShowToast }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTickets, setSelectedTickets] = useState(new Set())
  const [expandedTicket, setExpandedTicket] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('unassigned') // 'all' | 'unassigned' | 'approved'

  useEffect(() => {
    loadTickets()
  }, [projectId])

  const loadTickets = async () => {
    try {
      // Get all tickets for the project
      const allTickets = await db.getTMTickets(projectId)
      setTickets(allTickets || [])
    } catch (error) {
      console.error('Error loading tickets:', error)
      onShowToast?.('Error loading tickets', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Filter tickets
  const filteredTickets = useMemo(() => {
    let filtered = [...tickets]

    // Status filter
    if (filter === 'unassigned') {
      filtered = filtered.filter(t => !t.assigned_cor_id)
    } else if (filter === 'approved') {
      filtered = filtered.filter(t => t.status === 'approved')
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(t =>
        t.work_description?.toLowerCase().includes(term) ||
        t.ce_pco_number?.toLowerCase().includes(term) ||
        (t.work_date || t.ticket_date)?.includes(term)
      )
    }

    // Sort by date descending
    filtered.sort((a, b) => new Date(b.work_date || b.ticket_date) - new Date(a.work_date || a.ticket_date))

    return filtered
  }, [tickets, filter, searchTerm])

  const toggleTicket = (ticketId) => {
    const newSelected = new Set(selectedTickets)
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId)
    } else {
      newSelected.add(ticketId)
    }
    setSelectedTickets(newSelected)
  }

  const toggleAll = () => {
    if (selectedTickets.size === filteredTickets.length) {
      setSelectedTickets(new Set())
    } else {
      setSelectedTickets(new Set(filteredTickets.map(t => t.id)))
    }
  }

  const formatDate = (dateStr) => {
    const s = String(dateStr)
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Calculate ticket totals
  const getTicketSummary = (ticket) => {
    // Use correct field names from Supabase join
    const workers = ticket.t_and_m_workers || ticket.workers || []
    const items = ticket.t_and_m_items || ticket.items || []

    const workerCount = workers.length
    const itemCount = items.length

    // Count equipment items based on category
    const equipmentCount = items.filter(item => {
      const category = (item.materials_equipment?.category || item.category || '').toLowerCase()
      return category === 'equipment' || category === 'rental'
    }).length

    // Calculate total labor hours
    let laborHours = 0
    workers.forEach(w => {
      laborHours += (parseFloat(w.regular_hours) || parseFloat(w.hours) || 0) + (parseFloat(w.overtime_hours) || 0)
    })

    return { workerCount, itemCount, equipmentCount, laborHours }
  }

  // Import selected tickets' data
  const handleImport = async () => {
    if (selectedTickets.size === 0) {
      onShowToast?.('Please select at least one ticket', 'error')
      return
    }

    const ticketsToImport = tickets.filter(t => selectedTickets.has(t.id))

    // Look up labor rates for the company so imported items have correct costs
    const rateLookup = {}
    const classRateLookup = {}
    try {
      if (companyId) {
        const rates = await db.getLaborRates?.(companyId)
        if (rates) {
          rates.forEach(rate => {
            rateLookup[(rate.role || '').toLowerCase()] = rate
          })
        }
        // Also try to get class-based rates
        const classRates = await db.getLaborClassRates?.(companyId)
        if (classRates) {
          classRates.forEach(rate => {
            classRateLookup[rate.labor_class_id] = rate
          })
        }
      }
    } catch (err) {
      console.warn('Could not load labor rates for import:', err)
    }

    // Aggregate data from selected tickets
    const laborItems = []
    const materialsItems = []
    const equipmentItems = []

    ticketsToImport.forEach(ticket => {
      // Extract labor from t_and_m_workers (correct table name from Supabase join)
      const workers = ticket.t_and_m_workers || ticket.workers || []
      workers.forEach(worker => {
        const role = (worker.role || worker.labor_class || 'laborer').toLowerCase()
        // Look up rates: first try class-based, then role-based
        const classRate = worker.labor_class_id ? classRateLookup[worker.labor_class_id] : null
        const roleRate = rateLookup[role] || {}
        const regRate = dollarsToCents(parseFloat(classRate?.regular_rate || roleRate.regular_rate) || 0)
        const otRate = dollarsToCents(parseFloat(classRate?.overtime_rate || roleRate.overtime_rate) || 0)

        laborItems.push({
          id: `import-${ticket.id}-${worker.id || Date.now()}-${generateRandomId()}`,
          worker_name: worker.name || worker.worker_name || '',
          labor_class: worker.labor_classes?.name || worker.role || worker.labor_class || 'Laborer',
          wage_type: 'standard',
          regular_hours: parseFloat(worker.regular_hours) || parseFloat(worker.hours) || 0,
          overtime_hours: parseFloat(worker.overtime_hours) || 0,
          regular_rate: regRate,
          overtime_rate: otRate,
          total: 0,
          source_ticket_id: ticket.id,
          source_ticket_date: ticket.work_date || ticket.ticket_date
        })
      })

      // Extract materials from t_and_m_items (correct table name from Supabase join)
      const items = ticket.t_and_m_items || ticket.items || []
      items.forEach(item => {
        // Get material info from nested materials_equipment if available
        const materialInfo = item.materials_equipment || {}
        // Priority: custom_name (user override) > library name > fallback
        const itemDescription = item.custom_name || materialInfo.name || item.description || item.name || 'Unnamed item'
        const itemUnit = item.unit || materialInfo.unit || 'each'
        const itemCost = parseFloat(item.unit_cost) || parseFloat(materialInfo.cost_per_unit) || 0
        const itemQty = parseFloat(item.quantity) || 1

        // Determine if this is equipment or material based on category
        const category = (materialInfo.category || item.category || '').toLowerCase()
        const isEquipment = category === 'equipment' || category === 'rental'

        if (isEquipment) {
          equipmentItems.push({
            id: `import-${ticket.id}-${item.id || Date.now()}-${generateRandomId()}`,
            description: itemDescription,
            source_type: 'field_ticket',
            source_reference: `TM #${ticket.id?.slice(-6) || ''} - ${formatDate(ticket.ticket_date || ticket.work_date)}`,
            quantity: itemQty,
            unit: itemUnit,
            unit_cost: dollarsToCents(itemCost),
            total: dollarsToCents(itemQty * itemCost),
            source_ticket_id: ticket.id
          })
        } else {
          materialsItems.push({
            id: `import-${ticket.id}-${item.id || Date.now()}-${generateRandomId()}`,
            description: itemDescription,
            source_type: 'field_ticket',
            source_reference: `TM #${ticket.id?.slice(-6) || ''} - ${formatDate(ticket.ticket_date || ticket.work_date)}`,
            quantity: itemQty,
            unit: itemUnit,
            unit_cost: dollarsToCents(itemCost),
            total: dollarsToCents(itemQty * itemCost),
            source_ticket_id: ticket.id
          })
        }
      })
    })

    onImport?.({
      ticketIds: Array.from(selectedTickets),
      laborItems,
      materialsItems,
      equipmentItems
    })

    onClose?.()
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Loading tickets">
        <div className="modal-content ticket-selector-modal" onClick={e => e.stopPropagation()}>
          <div className="loading" role="status" aria-live="polite">Loading tickets...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="ticket-selector-title">
      <div className="modal-content ticket-selector-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="ticket-selector-title">Import from Time & Material Tickets</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close ticket selector"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="ticket-selector-controls">
          <div className="ticket-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search tickets"
            />
          </div>

          <div className="ticket-filters" role="group" aria-label="Filter tickets by status">
            <button
              className={`filter-btn ${filter === 'unassigned' ? 'active' : ''}`}
              onClick={() => setFilter('unassigned')}
              aria-pressed={filter === 'unassigned'}
            >
              Unassigned
            </button>
            <button
              className={`filter-btn ${filter === 'approved' ? 'active' : ''}`}
              onClick={() => setFilter('approved')}
              aria-pressed={filter === 'approved'}
            >
              Approved
            </button>
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              aria-pressed={filter === 'all'}
            >
              All
            </button>
          </div>
        </div>

        <div className="ticket-selector-header">
          <label className="select-all">
            <input
              type="checkbox"
              checked={selectedTickets.size === filteredTickets.length && filteredTickets.length > 0}
              onChange={toggleAll}
              aria-label={`Select all ${filteredTickets.length} tickets`}
            />
            <span>Select All ({filteredTickets.length})</span>
          </label>
          <span className="selected-count">
            {selectedTickets.size} selected
          </span>
        </div>

        <div className="modal-body ticket-selector-body">
          {filteredTickets.length === 0 ? (
            <div className="ticket-empty">
              <FileText size={32} />
              <p>No tickets found</p>
              {filter === 'unassigned' && (
                <button className="btn btn-ghost btn-small" onClick={() => setFilter('all')}>
                  Show all tickets
                </button>
              )}
            </div>
          ) : (
            <div className="ticket-list">
              {filteredTickets.map(ticket => {
                const summary = getTicketSummary(ticket)
                const isSelected = selectedTickets.has(ticket.id)
                const isExpanded = expandedTicket === ticket.id

                return (
                  <div
                    key={ticket.id}
                    className={`ticket-item ${isSelected ? 'selected' : ''} ${ticket.assigned_cor_id ? 'assigned' : ''}`}
                  >
                    <div className="ticket-item-main">
                      <label className="ticket-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTicket(ticket.id)}
                          disabled={ticket.assigned_cor_id && ticket.assigned_cor_id !== corId}
                        />
                      </label>

                      <div className="ticket-item-info" onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}>
                        <div className="ticket-item-header">
                          <span className="ticket-date">{formatDate(ticket.work_date || ticket.ticket_date)}</span>
                          <span className={`ticket-status ${ticket.status}`}>{ticket.status}</span>
                          {ticket.ce_pco_number && (
                            <span className="ticket-pco">CE/PCO: {ticket.ce_pco_number}</span>
                          )}
                        </div>

                        <div className="ticket-item-desc">
                          {ticket.work_description || 'No description'}
                        </div>

                        <div className="ticket-item-summary">
                          {summary.workerCount > 0 && (
                            <span><Users size={12} /> {summary.workerCount} workers</span>
                          )}
                          {summary.itemCount > 0 && (
                            <span><Package size={12} /> {summary.itemCount} items</span>
                          )}
                          {summary.equipmentCount > 0 && (
                            <span><Truck size={12} /> {summary.equipmentCount} equipment</span>
                          )}
                          {summary.laborHours > 0 && (
                            <span>{summary.laborHours} hrs</span>
                          )}
                        </div>
                      </div>

                      <button
                        className="ticket-expand-btn"
                        onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                      >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="ticket-item-details">
                        {(ticket.t_and_m_workers || ticket.workers)?.length > 0 && (
                          <div className="ticket-detail-section">
                            <h5>Workers</h5>
                            <ul>
                              {(ticket.t_and_m_workers || ticket.workers).map((w, i) => (
                                <li key={i}>
                                  {w.name || w.role} - {w.regular_hours || 0} reg hrs
                                  {w.overtime_hours > 0 && `, ${w.overtime_hours} OT hrs`}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(ticket.t_and_m_items || ticket.items)?.length > 0 && (
                          <div className="ticket-detail-section">
                            <h5>Materials</h5>
                            <ul>
                              {(ticket.t_and_m_items || ticket.items).map((item, i) => (
                                <li key={i}>
                                  {item.description || item.name} - {item.quantity} {item.unit}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {ticket.materials_equipment?.filter(m => m.type === 'equipment').length > 0 && (
                          <div className="ticket-detail-section">
                            <h5>Equipment</h5>
                            <ul>
                              {ticket.materials_equipment.filter(m => m.type === 'equipment').map((e, i) => (
                                <li key={i}>
                                  {e.description || e.name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={selectedTickets.size === 0}
          >
            <Check size={16} /> Import {selectedTickets.size} Ticket{selectedTickets.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
