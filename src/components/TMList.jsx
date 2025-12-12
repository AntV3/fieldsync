import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import * as XLSX from 'xlsx'
import { exportTMTicketPDF } from '../lib/tmPdfExport'
import SignaturePad from './SignaturePad'

export default function TMList({ project, onShowToast }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedTicket, setExpandedTicket] = useState(null)
  const [showSignature, setShowSignature] = useState(null)

  useEffect(() => {
    loadTickets()
  }, [project.id])

  const loadTickets = async () => {
    try {
      const data = await db.getTMTickets(project.id)
      setTickets(data)
    } catch (error) {
      console.error('Error loading tickets:', error)
      onShowToast('Error loading T&M tickets', 'error')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (ticketId, newStatus) => {
    try {
      await db.updateTMTicketStatus(ticketId, newStatus)
      setTickets(tickets.map(t => 
        t.id === ticketId ? { ...t, status: newStatus } : t
      ))
      onShowToast(`Ticket ${newStatus}`, 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      onShowToast('Error updating status', 'error')
    }
  }

  const deleteTicket = async (ticketId) => {
    if (!confirm('Delete this T&M ticket?')) return
    try {
      await db.deleteTMTicket(ticketId)
      setTickets(tickets.filter(t => t.id !== ticketId))
      onShowToast('Ticket deleted', 'success')
    } catch (error) {
      console.error('Error deleting ticket:', error)
      onShowToast('Error deleting ticket', 'error')
    }
  }

  const handleSignatureOpen = (ticket) => {
    setShowSignature(ticket.id)
  }

  const handleSignatureSave = async (signatureData) => {
    try {
      const ticketId = showSignature
      await db.updateTMTicket(ticketId, {
        client_signature_data: signatureData.signatureData,
        client_signer_name: signatureData.signerName,
        client_signature_date: signatureData.signatureDate,
        approval_status: 'approved'
      })

      // Update local state
      setTickets(tickets.map(t =>
        t.id === ticketId ? {
          ...t,
          client_signature_data: signatureData.signatureData,
          client_signer_name: signatureData.signerName,
          client_signature_date: signatureData.signatureDate,
          approval_status: 'approved'
        } : t
      ))

      setShowSignature(null)
      onShowToast('Signature saved and ticket approved!', 'success')
    } catch (error) {
      console.error('Error saving signature:', error)
      onShowToast('Error saving signature', 'error')
    }
  }

  const handleSignatureCancel = () => {
    setShowSignature(null)
  }

  const handleExportPDF = async (ticket) => {
    try {
      // Get company info (you may need to pass this from parent or fetch it)
      const company = { name: 'Your Company' } // TODO: Get actual company

      const fileName = await exportTMTicketPDF(
        ticket,
        project,
        company,
        ticket.t_and_m_workers || [],
        ticket.t_and_m_items || []
      )

      onShowToast(`PDF exported: ${fileName}`, 'success')
    } catch (error) {
      console.error('Error exporting PDF:', error)
      onShowToast('Error exporting PDF', 'error')
    }
  }

  const calculateTicketTotal = (ticket) => {
    let total = 0
    if (ticket.t_and_m_items) {
      ticket.t_and_m_items.forEach(item => {
        if (item.materials_equipment?.cost_per_unit) {
          total += item.quantity * item.materials_equipment.cost_per_unit
        }
      })
    }
    return total
  }

  const calculateTotalHours = (ticket) => {
    if (!ticket.t_and_m_workers) return 0
    return ticket.t_and_m_workers.reduce((sum, w) => sum + (parseFloat(w.total_hours) || 0), 0)
  }

  const calculateLaborCost = (ticket) => {
    if (!ticket.t_and_m_workers || !project) return 0

    const rates = {
      laborer: parseFloat(project.laborer_rate) || 0,
      operator: parseFloat(project.operator_rate) || 0,
      foreman: parseFloat(project.foreman_rate) || 0
    }

    return ticket.t_and_m_workers.reduce((total, worker) => {
      const hours = parseFloat(worker.total_hours) || 0
      const rate = rates[worker.role] || 0
      return total + (hours * rate)
    }, 0)
  }

  const getLaborCostBreakdown = (ticket) => {
    if (!ticket.t_and_m_workers || !project) return {}

    const rates = {
      laborer: parseFloat(project.laborer_rate) || 0,
      operator: parseFloat(project.operator_rate) || 0,
      foreman: parseFloat(project.foreman_rate) || 0
    }

    const breakdown = {
      laborer: { hours: 0, cost: 0, rate: rates.laborer },
      operator: { hours: 0, cost: 0, rate: rates.operator },
      foreman: { hours: 0, cost: 0, rate: rates.foreman }
    }

    ticket.t_and_m_workers.forEach(worker => {
      const hours = parseFloat(worker.total_hours) || 0
      const role = worker.role
      if (breakdown[role]) {
        breakdown[role].hours += hours
        breakdown[role].cost += hours * rates[role]
      }
    })

    return breakdown
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Export to Excel
  const exportToExcel = () => {
    const exportTickets = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
    
    if (exportTickets.length === 0) {
      onShowToast('No tickets to export', 'error')
      return
    }

    // Create workers sheet
    const workersData = []
    // Create items sheet
    const itemsData = []
    // Create summary sheet
    const summaryData = []

    exportTickets.forEach(ticket => {
      const ticketDate = formatDate(ticket.work_date)
      const ticketStatus = ticket.status
      
      // Workers
      if (ticket.t_and_m_workers) {
        ticket.t_and_m_workers.forEach(worker => {
          workersData.push({
            'Date': ticketDate,
            'Status': ticketStatus,
            'Worker Name': worker.name,
            'Hours': worker.hours
          })
        })
      }
      
      // Items
      if (ticket.t_and_m_items) {
        ticket.t_and_m_items.forEach(item => {
          const itemName = item.custom_name || item.materials_equipment?.name || 'Unknown'
          const category = item.custom_category || item.materials_equipment?.category || 'Unknown'
          const unit = item.materials_equipment?.unit || 'each'
          const costPer = item.materials_equipment?.cost_per_unit || 0
          const total = item.quantity * costPer
          
          itemsData.push({
            'Date': ticketDate,
            'Status': ticketStatus,
            'Category': category,
            'Item': itemName,
            'Quantity': item.quantity,
            'Unit': unit,
            'Cost/Unit': costPer,
            'Total': total
          })
        })
      }
      
      // Summary
      summaryData.push({
        'Date': ticketDate,
        'Status': ticketStatus,
        'Workers': ticket.t_and_m_workers?.length || 0,
        'Total Hours': calculateTotalHours(ticket),
        'Items': ticket.t_and_m_items?.length || 0,
        'Materials Cost': calculateTicketTotal(ticket),
        'Notes': ticket.notes || ''
      })
    })

    // Create workbook
    const wb = XLSX.utils.book_new()
    
    // Add sheets
    const summarySheet = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')
    
    if (workersData.length > 0) {
      const workersSheet = XLSX.utils.json_to_sheet(workersData)
      XLSX.utils.book_append_sheet(wb, workersSheet, 'Workers')
    }
    
    if (itemsData.length > 0) {
      const itemsSheet = XLSX.utils.json_to_sheet(itemsData)
      XLSX.utils.book_append_sheet(wb, itemsSheet, 'Materials & Equipment')
    }
    
    // Download
    const fileName = `${project.name}_TM_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
    onShowToast('Export downloaded!', 'success')
  }

  const filteredTickets = filter === 'all' 
    ? tickets 
    : tickets.filter(t => t.status === filter)

  // Calculate totals for summary
  const totalHours = filteredTickets.reduce((sum, t) => sum + calculateTotalHours(t), 0)
  const totalCost = filteredTickets.reduce((sum, t) => sum + calculateTicketTotal(t), 0)

  if (loading) {
    return <div className="loading">Loading T&M tickets...</div>
  }

  return (
    <div className="tm-list">
      <div className="tm-list-header">
        <div className="tm-list-title">
          <h3>T&M Tickets</h3>
          <button className="btn btn-secondary btn-small" onClick={exportToExcel}>
            📥 Export Excel
          </button>
        </div>
        
        <div className="tm-filter-tabs">
          {['all', 'pending', 'approved', 'billed', 'rejected'].map(status => (
            <button
              key={status}
              className={`tm-filter-tab ${filter === status ? 'active' : ''}`}
              onClick={() => setFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              <span className="tm-filter-count">
                {status === 'all' ? tickets.length : tickets.filter(t => t.status === status).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Summary Bar */}
      {filteredTickets.length > 0 && (
        <div className="tm-summary-bar">
          <div className="tm-summary-stat">
            <span className="tm-summary-label">Tickets</span>
            <span className="tm-summary-value">{filteredTickets.length}</span>
          </div>
          <div className="tm-summary-stat">
            <span className="tm-summary-label">Total Hours</span>
            <span className="tm-summary-value">{totalHours.toFixed(1)}</span>
          </div>
          <div className="tm-summary-stat">
            <span className="tm-summary-label">Materials Cost</span>
            <span className="tm-summary-value">${totalCost.toFixed(2)}</span>
          </div>
        </div>
      )}

      {filteredTickets.length === 0 ? (
        <div className="tm-empty-state">
          <p>No {filter === 'all' ? '' : filter} T&M tickets</p>
        </div>
      ) : (
        <div className="tm-tickets">
          {filteredTickets.map(ticket => (
            <div key={ticket.id} className={`tm-ticket-card ${ticket.status}`}>
              <div
                className="tm-ticket-header"
                onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
              >
                <div className="tm-ticket-info">
                  {ticket.ticket_number && (
                    <span className="tm-ticket-number">#{ticket.ticket_number}</span>
                  )}
                  <span className="tm-ticket-date">{formatDate(ticket.work_date)}</span>
                  <span className={`tm-ticket-status ${ticket.status}`}>{ticket.status}</span>
                </div>
                <div className="tm-ticket-summary">
                  <span className="tm-ticket-hours">{calculateTotalHours(ticket)} hrs</span>
                  <span className="tm-ticket-total">${calculateTicketTotal(ticket).toFixed(2)}</span>
                  <span className="tm-expand-arrow">{expandedTicket === ticket.id ? '▼' : '▶'}</span>
                </div>
              </div>

              {expandedTicket === ticket.id && (
                <div className="tm-ticket-details">
                  {ticket.t_and_m_workers?.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>👷 Workers</h4>
                      <div className="tm-detail-list">
                        {ticket.t_and_m_workers.map(worker => (
                          <div key={worker.id} className="tm-detail-row">
                            <span>
                              {worker.role && worker.role !== 'Laborer' && (
                                <span className="tm-role-badge">{worker.role}</span>
                              )}
                              {worker.name}
                            </span>
                            <span>{worker.total_hours || worker.hours} hrs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ticket.t_and_m_workers?.length > 0 && (project.laborer_rate || project.operator_rate || project.foreman_rate) && (
                    <div className="tm-detail-section">
                      <h4>💵 Labor Costs</h4>
                      <div className="tm-detail-list">
                        {(() => {
                          const breakdown = getLaborCostBreakdown(ticket)
                          return Object.entries(breakdown).map(([role, data]) => {
                            if (data.hours === 0) return null
                            return (
                              <div key={role} className="tm-detail-row">
                                <span>
                                  <span className="tm-role-badge" style={{ textTransform: 'capitalize' }}>{role}</span>
                                  {data.hours} hrs × ${data.rate.toFixed(2)}/hr
                                </span>
                                <span className="tm-cost-value">${data.cost.toFixed(2)}</span>
                              </div>
                            )
                          })
                        })()}
                        <div className="tm-detail-row tm-total-row" style={{ borderTop: '2px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem', fontWeight: 'bold' }}>
                          <span>Total Labor Cost</span>
                          <span className="tm-cost-value">${calculateLaborCost(ticket).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {ticket.t_and_m_items?.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>🔧 Materials & Equipment</h4>
                      <div className="tm-detail-list">
                        {ticket.t_and_m_items.map(item => (
                          <div key={item.id} className="tm-detail-row">
                            <span>
                              {item.custom_name ? (
                                <><span className="tm-custom-badge">Custom</span> {item.custom_name}</>
                              ) : (
                                item.materials_equipment?.name
                              )}
                            </span>
                            <span className="tm-detail-qty">
                              {item.quantity} {item.materials_equipment?.unit || 'each'}
                              {item.materials_equipment?.cost_per_unit > 0 && (
                                <span className="tm-item-cost">
                                  ${(item.quantity * item.materials_equipment.cost_per_unit).toFixed(2)}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ticket.notes && (
                    <div className="tm-detail-section">
                      <h4>📝 Description</h4>
                      <p className="tm-notes-text">{ticket.notes}</p>
                    </div>
                  )}

                  {ticket.photos && ticket.photos.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>📷 Photos ({ticket.photos.length})</h4>
                      <div className="tm-photos-grid">
                        {ticket.photos.map((photo, idx) => (
                          <a key={idx} href={photo} target="_blank" rel="noopener noreferrer" className="tm-photo-thumb">
                            <img src={photo} alt={`Photo ${idx + 1}`} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {ticket.client_signature_data && (
                    <div className="tm-detail-section">
                      <h4>✍️ Client Signature</h4>
                      <div className="signature-display">
                        <img src={ticket.client_signature_data} alt="Client Signature" className="signature-image" />
                        <div className="signature-info">
                          <p><strong>{ticket.client_signer_name}</strong></p>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Signed: {new Date(ticket.client_signature_date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="tm-ticket-actions">
                    <button
                      className="btn btn-primary btn-small"
                      onClick={(e) => { e.stopPropagation(); handleExportPDF(ticket); }}
                    >
                      📄 Export PDF
                    </button>
                    {ticket.status === 'pending' && !ticket.client_signature_data && (
                      <button
                        className="btn btn-success btn-small"
                        onClick={(e) => { e.stopPropagation(); handleSignatureOpen(ticket); }}
                      >
                        ✍️ Sign & Approve
                      </button>
                    )}
                    {ticket.status === 'pending' && (
                      <>
                        <button
                          className="btn btn-success btn-small"
                          onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'approved'); }}
                        >
                          ✓ Approve
                        </button>
                        <button
                          className="btn btn-warning btn-small"
                          onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'rejected'); }}
                        >
                          ✗ Reject
                        </button>
                      </>
                    )}
                    {ticket.status === 'approved' && (
                      <button
                        className="btn btn-primary btn-small"
                        onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'billed'); }}
                      >
                        💰 Mark Billed
                      </button>
                    )}
                    {ticket.status === 'rejected' && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'pending'); }}
                      >
                        ↩ Restore
                      </button>
                    )}
                    <button
                      className="btn btn-danger btn-small"
                      onClick={(e) => { e.stopPropagation(); deleteTicket(ticket.id); }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showSignature && (
        <SignaturePad
          onSave={handleSignatureSave}
          onCancel={handleSignatureCancel}
        />
      )}
    </div>
  )
}
