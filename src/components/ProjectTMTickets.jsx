import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function ProjectTMTickets({ project, tickets, currentUser, onRefresh }) {
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [ticketDetails, setTicketDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  // Filter tickets
  const filteredTickets = filterStatus === 'all'
    ? tickets
    : tickets.filter(t => t.status === filterStatus)

  // Sort by date (most recent first)
  const sortedTickets = [...filteredTickets].sort((a, b) =>
    new Date(b.work_date) - new Date(a.work_date)
  )

  // Calculate summary stats
  const approvedTickets = tickets.filter(t => t.status === 'approved')
  const pendingTickets = tickets.filter(t => t.status === 'pending')

  const calculateTicketTotal = (ticket) => {
    let subtotal = 0

    // Calculate labor costs
    if (ticket.workers) {
      ticket.workers.forEach(worker => {
        const regularPay = (worker.hours || 0) * 50 // $50/hr base rate
        const overtimePay = (worker.overtime_hours || 0) * 75 // $75/hr OT
        subtotal += regularPay + overtimePay
      })
    }

    // Calculate material/equipment costs
    if (ticket.items) {
      ticket.items.forEach(item => {
        // Simplified - in production would lookup actual material prices
        const itemCost = (item.quantity || 0) * 50 // Placeholder
        subtotal += itemCost
      })
    }

    // Apply 20% markup
    const markup = subtotal * 0.2
    const total = subtotal + markup

    return { subtotal, markup, total }
  }

  const approvedTotal = approvedTickets.reduce((sum, t) => sum + calculateTicketTotal(t).total, 0)
  const pendingTotal = pendingTickets.reduce((sum, t) => sum + calculateTicketTotal(t).total, 0)

  async function loadTicketDetails(ticket) {
    setSelectedTicket(ticket)
    setLoadingDetails(true)

    try {
      // Load workers and items
      const [workers, items] = await Promise.all([
        db.getTMWorkers(ticket.id),
        db.getTMItems(ticket.id)
      ])

      setTicketDetails({
        ...ticket,
        workers,
        items
      })
    } catch (error) {
      console.error('Error loading ticket details:', error)
      alert('Failed to load ticket details')
    } finally {
      setLoadingDetails(false)
    }
  }

  async function handleApprove() {
    if (!selectedTicket || !currentUser) return

    if (confirm(`Approve T&M Ticket #${selectedTicket.id.slice(0, 8)}?`)) {
      try {
        await db.approveTMTicket(
          selectedTicket.id,
          currentUser.id,
          currentUser.name || currentUser.email
        )
        alert('Ticket approved successfully')
        setSelectedTicket(null)
        setTicketDetails(null)
        onRefresh()
      } catch (error) {
        console.error('Error approving ticket:', error)
        alert('Failed to approve ticket')
      }
    }
  }

  async function handleReject() {
    if (!selectedTicket || !currentUser || !rejectionReason.trim()) {
      alert('Please provide a reason for rejection')
      return
    }

    try {
      await db.rejectTMTicket(
        selectedTicket.id,
        currentUser.id,
        currentUser.name || currentUser.email,
        rejectionReason
      )
      alert('Ticket rejected')
      setShowRejectModal(false)
      setRejectionReason('')
      setSelectedTicket(null)
      setTicketDetails(null)
      onRefresh()
    } catch (error) {
      console.error('Error rejecting ticket:', error)
      alert('Failed to reject ticket')
    }
  }

  function getStatusBadge(status) {
    const badges = {
      'pending': { label: 'PENDING', className: 'status-pending', icon: '⏳' },
      'approved': { label: 'APPROVED', className: 'status-approved', icon: '✓' },
      'rejected': { label: 'REJECTED', className: 'status-rejected', icon: '✗' },
      'billed': { label: 'BILLED', className: 'status-billed', icon: '💰' }
    }
    return badges[status] || badges['pending']
  }

  function handleExport() {
    // Create CSV export
    let csv = 'Date,Ticket #,CE/PCO,Status,Workers,Items,Total\n'

    sortedTickets.forEach(ticket => {
      const { total } = calculateTicketTotal(ticket)
      const workerCount = ticket.workers?.length || 0
      const itemCount = ticket.items?.length || 0

      csv += `${ticket.work_date},"${ticket.id.slice(0, 8)}","${ticket.ce_pco_number || ''}","${ticket.status}",${workerCount},${itemCount},$${Math.round(total)}\n`
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}-tm-tickets-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // If a ticket is selected, show detail view
  if (selectedTicket) {
    return <TicketDetailView
      ticket={ticketDetails || selectedTicket}
      loading={loadingDetails}
      onBack={() => {
        setSelectedTicket(null)
        setTicketDetails(null)
      }}
      onApprove={handleApprove}
      onReject={() => setShowRejectModal(true)}
      calculateTotal={calculateTicketTotal}
      showRejectModal={showRejectModal}
      rejectionReason={rejectionReason}
      setRejectionReason={setRejectionReason}
      handleRejectSubmit={handleReject}
      closeRejectModal={() => setShowRejectModal(false)}
    />
  }

  // List view
  return (
    <div className="project-tm-tickets">
      {/* Header */}
      <div className="tm-tickets-header">
        <div className="tm-summary">
          <div className="tm-summary-item">
            <span className="tm-summary-label">Total Tickets:</span>
            <span className="tm-summary-value">{tickets.length}</span>
          </div>
          <div className="tm-summary-item">
            <span className="tm-summary-label">Approved:</span>
            <span className="tm-summary-value">${Math.round(approvedTotal).toLocaleString()}</span>
          </div>
          <div className="tm-summary-item">
            <span className="tm-summary-label">Pending:</span>
            <span className="tm-summary-value">${Math.round(pendingTotal).toLocaleString()}</span>
          </div>
        </div>

        <div className="tm-controls">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Tickets</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="billed">Billed</option>
          </select>
          <button className="btn-secondary btn-small" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>

      {/* Ticket List */}
      <div className="tm-ticket-list">
        {sortedTickets.length === 0 ? (
          <div className="empty-state">
            <p>No T&M tickets found</p>
          </div>
        ) : (
          sortedTickets.map(ticket => {
            const { total } = calculateTicketTotal(ticket)
            const statusBadge = getStatusBadge(ticket.status)
            const workerCount = ticket.workers?.length || 0
            const itemCount = ticket.items?.length || 0

            return (
              <div
                key={ticket.id}
                className="tm-ticket-card"
                onClick={() => loadTicketDetails(ticket)}
              >
                <div className="tm-ticket-header">
                  <div className="tm-ticket-id">
                    <strong>#{ticket.id.slice(0, 8)}</strong>
                    {ticket.ce_pco_number && (
                      <span className="tm-ticket-ce"> | CE-{ticket.ce_pco_number}</span>
                    )}
                  </div>
                  <div className={`tm-ticket-status ${statusBadge.className}`}>
                    <span className="status-icon">{statusBadge.icon}</span>
                    <span className="status-label">{statusBadge.label}</span>
                  </div>
                </div>

                <div className="tm-ticket-content">
                  <div className="tm-ticket-info">
                    <span className="tm-ticket-date">
                      {new Date(ticket.work_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    <span className="tm-ticket-details">
                      {workerCount} worker{workerCount !== 1 ? 's' : ''}, {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    {ticket.created_by_name && (
                      <span className="tm-ticket-creator">
                        Submitted by {ticket.created_by_name}
                      </span>
                    )}
                  </div>
                  <div className="tm-ticket-amount">
                    ${Math.round(total).toLocaleString()}
                  </div>
                </div>

                <div className="tm-ticket-footer">
                  <button className="btn-link">Review →</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// Ticket Detail View Component
function TicketDetailView({
  ticket,
  loading,
  onBack,
  onApprove,
  onReject,
  calculateTotal,
  showRejectModal,
  rejectionReason,
  setRejectionReason,
  handleRejectSubmit,
  closeRejectModal
}) {
  const { subtotal, markup, total } = calculateTotal(ticket)
  const statusBadge = ticket.status === 'pending'
    ? { label: 'PENDING', className: 'status-pending', icon: '⏳' }
    : ticket.status === 'approved'
    ? { label: 'APPROVED', className: 'status-approved', icon: '✓' }
    : ticket.status === 'rejected'
    ? { label: 'REJECTED', className: 'status-rejected', icon: '✗' }
    : { label: 'BILLED', className: 'status-billed', icon: '💰' }

  // Calculate labor totals
  const totalRegularHours = ticket.workers?.reduce((sum, w) => sum + (w.hours || 0), 0) || 0
  const totalOTHours = ticket.workers?.reduce((sum, w) => sum + (w.overtime_hours || 0), 0) || 0
  const laborCost = (totalRegularHours * 50) + (totalOTHours * 75) // Simplified rates

  // Calculate materials/equipment total
  const materialsCost = ticket.items?.reduce((sum, item) => sum + ((item.quantity || 0) * 50), 0) || 0

  return (
    <div className="tm-ticket-detail">
      {/* Header */}
      <div className="ticket-detail-header">
        <button className="btn-back" onClick={onBack}>
          ← Back to List
        </button>
        <div className={`ticket-status-badge ${statusBadge.className}`}>
          <span className="status-icon">{statusBadge.icon}</span>
          <span className="status-label">{statusBadge.label}</span>
        </div>
      </div>

      {/* Title */}
      <div className="ticket-detail-title">
        <h2>T&M Ticket #{ticket.id.slice(0, 8)}</h2>
        <div className="ticket-meta">
          <span>
            Date: {new Date(ticket.work_date).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
          {ticket.ce_pco_number && (
            <span>CE/PCO: CE-{ticket.ce_pco_number}</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading ticket details...</p>
        </div>
      ) : (
        <>
          {/* Labor Section */}
          <div className="ticket-section">
            <h3 className="section-title">👷 LABOR</h3>
            {ticket.workers && ticket.workers.length > 0 ? (
              <div className="labor-table">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Reg</th>
                      <th>OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticket.workers.map((worker, index) => (
                      <tr key={index}>
                        <td>{worker.name}</td>
                        <td>{worker.role || 'Laborer'}</td>
                        <td>{worker.time_started || '-'}</td>
                        <td>{worker.time_ended || '-'}</td>
                        <td>{worker.hours || 0}</td>
                        <td>{worker.overtime_hours || 0}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan="4"><strong>TOTAL LABOR:</strong></td>
                      <td><strong>{totalRegularHours} hrs</strong></td>
                      <td><strong>{totalOTHours} hrs</strong></td>
                    </tr>
                  </tbody>
                </table>
                <div className="section-total">
                  <strong>${laborCost.toLocaleString()}</strong>
                </div>
              </div>
            ) : (
              <p className="empty-message">No labor recorded</p>
            )}
          </div>

          {/* Materials & Equipment Section */}
          <div className="ticket-section">
            <h3 className="section-title">📦 MATERIALS & EQUIPMENT</h3>
            {ticket.items && ticket.items.length > 0 ? (
              <div className="materials-table">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticket.items.map((item, index) => (
                      <tr key={index}>
                        <td>{item.custom_name || item.name}</td>
                        <td>{item.custom_category || item.category}</td>
                        <td>{item.quantity}</td>
                        <td>each</td>
                        <td>${((item.quantity || 0) * 50).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan="4"><strong>TOTAL MATERIALS/EQUIPMENT:</strong></td>
                      <td><strong>${materialsCost.toLocaleString()}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-message">No materials or equipment recorded</p>
            )}
          </div>

          {/* Notes Section */}
          {ticket.notes && (
            <div className="ticket-section">
              <h3 className="section-title">📝 NOTES</h3>
              <div className="notes-content">
                {ticket.notes}
              </div>
            </div>
          )}

          {/* Photos Section */}
          {ticket.photos && ticket.photos.length > 0 && (
            <div className="ticket-section">
              <h3 className="section-title">📸 PHOTOS ({ticket.photos.length})</h3>
              <div className="photo-grid">
                {ticket.photos.map((photo, index) => (
                  <img
                    key={index}
                    src={photo}
                    alt={`Photo ${index + 1}`}
                    className="ticket-photo"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Certification */}
          <div className="ticket-certification">
            <h4>CERTIFICATION</h4>
            <div className="cert-info">
              {ticket.created_by_name && (
                <span>Created by: {ticket.created_by_name}</span>
              )}
              {ticket.created_at && (
                <span>
                  {new Date(ticket.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Total Summary */}
          <div className="ticket-total-summary">
            <div className="total-line">
              <span>SUBTOTAL:</span>
              <span>${Math.round(subtotal).toLocaleString()}</span>
            </div>
            <div className="total-line">
              <span>MARKUP (20%):</span>
              <span>${Math.round(markup).toLocaleString()}</span>
            </div>
            <div className="total-line grand-total">
              <span><strong>TOTAL:</strong></span>
              <span><strong>${Math.round(total).toLocaleString()}</strong></span>
            </div>
          </div>

          {/* Actions */}
          {ticket.status === 'pending' && (
            <div className="ticket-actions">
              <button className="btn-success" onClick={onApprove}>
                ✓ Approve
              </button>
              <button className="btn-danger" onClick={onReject}>
                ✗ Reject
              </button>
              <button className="btn-secondary">
                Generate Invoice
              </button>
            </div>
          )}

          {ticket.status === 'approved' && ticket.approved_by_name && (
            <div className="ticket-approval-info">
              <p>
                ✓ Approved by {ticket.approved_by_name} on{' '}
                {new Date(ticket.approved_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          )}

          {ticket.status === 'rejected' && ticket.rejected_by_name && (
            <div className="ticket-rejection-info">
              <p>
                ✗ Rejected by {ticket.rejected_by_name} on{' '}
                {new Date(ticket.rejected_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
              {ticket.rejection_reason && (
                <p><strong>Reason:</strong> {ticket.rejection_reason}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={closeRejectModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Reject T&M Ticket</h3>
            <p>Please provide a reason for rejecting this ticket:</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows="4"
              className="rejection-textarea"
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeRejectModal}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleRejectSubmit}
                disabled={!rejectionReason.trim()}
              >
                Reject Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
