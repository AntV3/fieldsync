import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function TMList({ project, onShowToast }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedTicket, setExpandedTicket] = useState(null)

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
    return ticket.t_and_m_workers.reduce((sum, w) => sum + parseFloat(w.hours), 0)
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const filteredTickets = filter === 'all' 
    ? tickets 
    : tickets.filter(t => t.status === filter)

  if (loading) {
    return <div className="loading">Loading T&M tickets...</div>
  }

  return (
    <div className="tm-list">
      <div className="tm-list-header">
        <h3>T&M Tickets</h3>
        <div className="tm-filter-tabs">
          <button 
            className={`tm-filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({tickets.length})
          </button>
          <button 
            className={`tm-filter-tab ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending ({tickets.filter(t => t.status === 'pending').length})
          </button>
          <button 
            className={`tm-filter-tab ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            Approved ({tickets.filter(t => t.status === 'approved').length})
          </button>
          <button 
            className={`tm-filter-tab ${filter === 'billed' ? 'active' : ''}`}
            onClick={() => setFilter('billed')}
          >
            Billed ({tickets.filter(t => t.status === 'billed').length})
          </button>
        </div>
      </div>

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
                  <span className="tm-ticket-date">{formatDate(ticket.work_date)}</span>
                  <span className={`tm-ticket-status ${ticket.status}`}>{ticket.status}</span>
                </div>
                <div className="tm-ticket-summary">
                  <span>{calculateTotalHours(ticket)} hrs</span>
                  <span className="tm-ticket-total">${calculateTicketTotal(ticket).toFixed(2)}</span>
                  <span className="tm-expand-arrow">{expandedTicket === ticket.id ? '▼' : '▶'}</span>
                </div>
              </div>

              {expandedTicket === ticket.id && (
                <div className="tm-ticket-details">
                  {ticket.t_and_m_workers?.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>Workers</h4>
                      <div className="tm-detail-list">
                        {ticket.t_and_m_workers.map(worker => (
                          <div key={worker.id} className="tm-detail-row">
                            <span>{worker.name}</span>
                            <span>{worker.hours} hrs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ticket.t_and_m_items?.length > 0 && (
                    <div className="tm-detail-section">
                      <h4>Materials & Equipment</h4>
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
                            <span>
                              {item.quantity} {item.materials_equipment?.unit || 'each'}
                              {item.materials_equipment?.cost_per_unit && (
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
                      <h4>Notes</h4>
                      <p className="tm-notes-text">{ticket.notes}</p>
                    </div>
                  )}

                  <div className="tm-ticket-actions">
                    {ticket.status === 'pending' && (
                      <>
                        <button 
                          className="btn btn-success btn-small"
                          onClick={() => updateStatus(ticket.id, 'approved')}
                        >
                          Approve
                        </button>
                        <button 
                          className="btn btn-danger btn-small"
                          onClick={() => updateStatus(ticket.id, 'rejected')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {ticket.status === 'approved' && (
                      <button 
                        className="btn btn-primary btn-small"
                        onClick={() => updateStatus(ticket.id, 'billed')}
                      >
                        Mark Billed
                      </button>
                    )}
                    {ticket.status === 'rejected' && (
                      <button 
                        className="btn btn-secondary btn-small"
                        onClick={() => updateStatus(ticket.id, 'pending')}
                      >
                        Restore
                      </button>
                    )}
                    <button 
                      className="btn btn-danger btn-small"
                      onClick={() => deleteTicket(ticket.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
