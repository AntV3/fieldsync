import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowLeft, FileText, Clock, CheckCircle2, XCircle, DollarSign, ChevronDown, ChevronRight, Users, Package, Link2, Unlink, AlertCircle } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency, getStatusInfo, formatDate, formatDateRange } from '../../lib/corCalculations'

/**
 * ForemanCORList - Read-only COR list for foremen
 *
 * Allows foremen to:
 * - View all CORs for the project with status and amounts
 * - Expand a COR to see linked T&M tickets
 * - Link unassigned T&M tickets to a COR
 * - Unlink tickets from a COR (only if COR is not billed/closed)
 */
export default function ForemanCORList({ project, companyId, onBack, onShowToast }) {
  const [cors, setCORs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCOR, setExpandedCOR] = useState(null)
  const [corTickets, setCORTickets] = useState({}) // { corId: [tickets] }
  const [unassignedTickets, setUnassignedTickets] = useState([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [linkingTicket, setLinkingTicket] = useState(null)
  const [filter, setFilter] = useState('all')

  const loadCORs = useCallback(async () => {
    try {
      const data = await db.getCORs(project.id)
      setCORs(data || [])
    } catch (error) {
      console.error('Error loading CORs:', error)
      onShowToast?.('Error loading change orders', 'error')
    } finally {
      setLoading(false)
    }
  }, [project.id])

  const loadUnassignedTickets = useCallback(async () => {
    try {
      const allTickets = await db.getTMTickets?.(project.id) || []
      const unassigned = allTickets.filter(t => !t.assigned_cor_id)
      setUnassignedTickets(unassigned)
    } catch (error) {
      console.error('Error loading unassigned tickets:', error)
    }
  }, [project.id])

  useEffect(() => {
    loadCORs()
    loadUnassignedTickets()

    const subscription = db.subscribeToCORs?.(project.id, () => {
      loadCORs()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id, loadCORs, loadUnassignedTickets])

  // Load tickets for an expanded COR
  const loadCORTickets = useCallback(async (corId) => {
    setLoadingTickets(true)
    try {
      const tickets = await db.getCORTickets?.(corId) || []
      setCORTickets(prev => ({ ...prev, [corId]: tickets }))
    } catch (error) {
      console.error('Error loading COR tickets:', error)
    } finally {
      setLoadingTickets(false)
    }
  }, [])

  const toggleExpand = (corId) => {
    if (expandedCOR === corId) {
      setExpandedCOR(null)
    } else {
      setExpandedCOR(corId)
      if (!corTickets[corId]) {
        loadCORTickets(corId)
      }
    }
  }

  // Link a ticket to a COR
  const handleLinkTicket = async (ticketId, corId) => {
    setLinkingTicket(ticketId)
    try {
      await db.assignTicketToCOR(ticketId, corId)
      onShowToast?.('Ticket linked to COR', 'success')
      // Refresh data
      loadCORTickets(corId)
      loadUnassignedTickets()
    } catch (error) {
      console.error('Error linking ticket:', error)
      onShowToast?.('Error linking ticket to COR', 'error')
    } finally {
      setLinkingTicket(null)
    }
  }

  // Filter CORs
  const filteredCORs = useMemo(() => {
    let filtered = [...cors]
    if (filter !== 'all') {
      filtered = filtered.filter(c => c.status === filter)
    }
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return filtered
  }, [cors, filter])

  // Counts
  const counts = useMemo(() => ({
    all: cors.length,
    draft: cors.filter(c => c.status === 'draft').length,
    pending_approval: cors.filter(c => c.status === 'pending_approval').length,
    approved: cors.filter(c => c.status === 'approved').length,
    billed: cors.filter(c => c.status === 'billed').length,
  }), [cors])

  const getStatusIcon = (status) => {
    switch (status) {
      case 'draft': return <FileText size={16} />
      case 'pending_approval': return <Clock size={16} />
      case 'approved': return <CheckCircle2 size={16} />
      case 'rejected': return <XCircle size={16} />
      case 'billed': return <DollarSign size={16} />
      default: return <FileText size={16} />
    }
  }

  if (loading) {
    return (
      <div className="fm-view">
        <div className="fm-subheader">
          <button className="fm-back" onClick={onBack}><ArrowLeft size={20} /></button>
          <h2>Change Orders</h2>
        </div>
        <div className="fm-loading">
          <div className="spinner"></div>
          <span>Loading CORs...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="fm-view">
      <div className="fm-subheader">
        <button className="fm-back" onClick={onBack}><ArrowLeft size={20} /></button>
        <h2>Change Orders</h2>
        <span className="fm-subheader-badge">{cors.length}</span>
      </div>

      {/* Filter pills */}
      <div className="fm-cor-filters">
        {[
          { id: 'all', label: 'All' },
          { id: 'draft', label: 'Draft' },
          { id: 'pending_approval', label: 'Pending' },
          { id: 'approved', label: 'Approved' },
        ].map(f => (
          <button
            key={f.id}
            className={`fm-cor-pill ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {counts[f.id] > 0 && <span className="fm-cor-pill-count">{counts[f.id]}</span>}
          </button>
        ))}
      </div>

      {filteredCORs.length === 0 ? (
        <div className="fm-empty">
          <FileText size={48} />
          <h3>No change orders {filter !== 'all' ? `(${filter.replace('_', ' ')})` : ''}</h3>
          <p>Change orders will appear here when created by the office</p>
        </div>
      ) : (
        <div className="fm-cor-list">
          {filteredCORs.map(cor => {
            const statusInfo = getStatusInfo(cor.status)
            const isExpanded = expandedCOR === cor.id
            const tickets = corTickets[cor.id] || []
            const canLink = ['draft', 'pending_approval', 'approved'].includes(cor.status)

            return (
              <div key={cor.id} className="fm-cor-card">
                <button
                  className="fm-cor-card-header"
                  onClick={() => toggleExpand(cor.id)}
                >
                  <div className="fm-cor-card-toggle">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                  <div className="fm-cor-card-info">
                    <div className="fm-cor-card-top">
                      <span className="fm-cor-number">{cor.cor_number}</span>
                      <span
                        className="fm-cor-status"
                        style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
                      >
                        {getStatusIcon(cor.status)}
                        {statusInfo.label}
                      </span>
                    </div>
                    <h3 className="fm-cor-title">{cor.title || 'Untitled COR'}</h3>
                    <div className="fm-cor-card-meta">
                      <span className="fm-cor-amount">{formatCurrency(cor.cor_total || 0)}</span>
                      <span className="fm-cor-date">{formatDateRange(cor.period_start, cor.period_end)}</span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="fm-cor-expanded">
                    {/* Scope of work */}
                    {cor.scope_of_work && (
                      <div className="fm-cor-scope">
                        <strong>Scope:</strong> {cor.scope_of_work}
                      </div>
                    )}

                    {/* Line item counts */}
                    <div className="fm-cor-counts">
                      {(cor.labor_count?.[0]?.count || 0) > 0 && (
                        <span><Users size={14} /> {cor.labor_count[0].count} labor</span>
                      )}
                      {(cor.materials_count?.[0]?.count || 0) > 0 && (
                        <span><Package size={14} /> {cor.materials_count[0].count} materials</span>
                      )}
                      {(cor.tickets_count?.[0]?.count || 0) > 0 && (
                        <span><FileText size={14} /> {cor.tickets_count[0].count} tickets</span>
                      )}
                    </div>

                    {/* Linked Tickets */}
                    <div className="fm-cor-tickets-section">
                      <h4>Linked T&M Tickets</h4>
                      {loadingTickets && !corTickets[cor.id] ? (
                        <div className="fm-cor-tickets-loading">Loading tickets...</div>
                      ) : tickets.length === 0 ? (
                        <p className="fm-cor-no-tickets">No tickets linked yet</p>
                      ) : (
                        <div className="fm-cor-tickets">
                          {tickets.map(ticket => (
                            <div key={ticket.id} className="fm-cor-ticket-row">
                              <div className="fm-cor-ticket-info">
                                <span className="fm-cor-ticket-date">{formatDate(ticket.work_date)}</span>
                                {ticket.ce_pco_number && <span className="fm-cor-ticket-pco">#{ticket.ce_pco_number}</span>}
                                <span className="fm-cor-ticket-workers">
                                  <Users size={12} /> {ticket.t_and_m_workers?.length || 0}
                                </span>
                              </div>
                              <span className={`fm-cor-ticket-status ${ticket.status}`}>{ticket.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Link unassigned tickets */}
                      {canLink && unassignedTickets.length > 0 && (
                        <div className="fm-cor-link-section">
                          <h4><Link2 size={14} /> Link a Ticket</h4>
                          <div className="fm-cor-unassigned">
                            {unassignedTickets.slice(0, 10).map(ticket => (
                              <button
                                key={ticket.id}
                                className="fm-cor-link-btn"
                                onClick={() => handleLinkTicket(ticket.id, cor.id)}
                                disabled={linkingTicket === ticket.id}
                              >
                                <div className="fm-cor-link-info">
                                  <span>{formatDate(ticket.work_date)}</span>
                                  {ticket.ce_pco_number && <span>#{ticket.ce_pco_number}</span>}
                                  <span><Users size={12} /> {ticket.t_and_m_workers?.length || 0}</span>
                                </div>
                                <Link2 size={14} />
                              </button>
                            ))}
                            {unassignedTickets.length > 10 && (
                              <p className="fm-cor-more-tickets">+{unassignedTickets.length - 10} more unassigned tickets</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .fm-cor-filters {
          display: flex;
          gap: 0.5rem;
          padding: 0 1rem;
          margin-bottom: 1rem;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .fm-cor-pill {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.875rem;
          border-radius: 20px;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-secondary);
          font-size: 0.8rem;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .fm-cor-pill.active {
          background: var(--primary-color, #3b82f6);
          color: white;
          border-color: var(--primary-color, #3b82f6);
        }

        .fm-cor-pill-count {
          background: rgba(0,0,0,0.1);
          padding: 0.125rem 0.375rem;
          border-radius: 10px;
          font-size: 0.7rem;
        }

        .fm-cor-pill.active .fm-cor-pill-count {
          background: rgba(255,255,255,0.25);
        }

        .fm-cor-list {
          padding: 0 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .fm-cor-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
        }

        .fm-cor-card-header {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 1rem;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          color: var(--text-primary);
        }

        .fm-cor-card-header:active {
          background: var(--bg-elevated);
        }

        .fm-cor-card-toggle {
          padding-top: 2px;
          color: var(--text-secondary);
          flex-shrink: 0;
        }

        .fm-cor-card-info {
          flex: 1;
          min-width: 0;
        }

        .fm-cor-card-top {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .fm-cor-number {
          font-weight: 600;
          font-size: 0.85rem;
          color: var(--primary-color, #3b82f6);
        }

        .fm-cor-status {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .fm-cor-title {
          font-size: 0.95rem;
          font-weight: 500;
          margin: 0 0 0.375rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .fm-cor-card-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .fm-cor-amount {
          font-weight: 600;
          color: var(--text-primary);
        }

        .fm-cor-expanded {
          border-top: 1px solid var(--border-color);
          padding: 1rem;
          background: var(--bg-elevated);
        }

        .fm-cor-scope {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
          line-height: 1.4;
        }

        .fm-cor-counts {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 1rem;
        }

        .fm-cor-counts span {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .fm-cor-tickets-section h4 {
          font-size: 0.85rem;
          font-weight: 600;
          margin: 0 0 0.5rem;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }

        .fm-cor-tickets-loading,
        .fm-cor-no-tickets {
          font-size: 0.8rem;
          color: var(--text-secondary);
          padding: 0.5rem 0;
        }

        .fm-cor-tickets {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          margin-bottom: 0.75rem;
        }

        .fm-cor-ticket-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          background: var(--bg-card);
          border-radius: 8px;
          font-size: 0.8rem;
        }

        .fm-cor-ticket-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
        }

        .fm-cor-ticket-date {
          font-weight: 500;
          color: var(--text-primary);
        }

        .fm-cor-ticket-workers {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .fm-cor-ticket-status {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          text-transform: capitalize;
        }

        .fm-cor-ticket-status.pending {
          background: #fef3c7;
          color: #92400e;
        }

        .fm-cor-ticket-status.approved {
          background: #d1fae5;
          color: #065f46;
        }

        .fm-cor-link-section {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-color);
        }

        .fm-cor-unassigned {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .fm-cor-link-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: var(--bg-card);
          border: 1px dashed var(--border-color);
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-primary);
          font-size: 0.8rem;
          transition: all 0.15s ease;
        }

        .fm-cor-link-btn:active:not(:disabled) {
          background: var(--primary-color, #3b82f6);
          color: white;
          border-style: solid;
          border-color: var(--primary-color, #3b82f6);
        }

        .fm-cor-link-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .fm-cor-link-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .fm-cor-more-tickets {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-align: center;
          padding: 0.375rem;
          margin: 0;
        }
      `}</style>
    </div>
  )
}
