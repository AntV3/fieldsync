import { memo, useState, useEffect } from 'react'
import { HardHat, FileText, Wrench, Camera, Link, Lock, Link2, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import { CountBadge } from '../ui'
import { db } from '../../lib/supabase'

/**
 * Memoized T&M Ticket Card component
 * Prevents unnecessary re-renders when parent list updates
 */
const TMTicketCard = memo(function TMTicketCard({
  ticket,
  isExpanded,
  isSelected,
  isLocked,
  lockInfo,
  hasFailedImport,
  isRetrying,
  onToggleExpand,
  onToggleSelect,
  onApprove,
  onUpdateStatus,
  onDelete,
  onOpenCorAssign,
  onRetryImport,
  onShowSignatureLink,
  formatDate,
  calculateTotalHours,
  calculateTicketTotal
}) {
  const totalHours = calculateTotalHours(ticket)
  const totalCost = calculateTicketTotal(ticket)

  // Resolve stored photo paths/public URLs to signed URLs (bucket is private)
  const [signedPhotoUrls, setSignedPhotoUrls] = useState([])
  useEffect(() => {
    if (!ticket.photos?.length) { setSignedPhotoUrls([]); return }
    let cancelled = false
    db.resolvePhotoUrls(ticket.photos).then(resolved => {
      if (!cancelled) setSignedPhotoUrls(resolved)
    })
    return () => { cancelled = true }
  }, [ticket.photos])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggleExpand(ticket.id)
    }
  }

  return (
    <div
      className={`tm-ticket-card hover-lift animate-fade-in-up ${ticket.status} ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
      role="article"
      aria-label={`T&M Ticket for ${formatDate(ticket.work_date)}, ${totalHours} hours, $${totalCost.toFixed(2)}, status: ${ticket.status}`}
    >
      <div
        className="tm-ticket-header"
        onClick={() => onToggleExpand(ticket.id)}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ticket details`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(ticket.id, e)}
          onClick={(e) => e.stopPropagation()}
          className="tm-checkbox"
          aria-label={`Select ticket for ${formatDate(ticket.work_date)}`}
        />
        <div className="tm-ticket-info">
          <span className="tm-ticket-date">{formatDate(ticket.work_date)}</span>
          {ticket.ce_pco_number && (
            <span className="tm-ce-badge">{ticket.ce_pco_number}</span>
          )}
          {ticket.assigned_cor_id && lockInfo?.lockedBy && (
            <span className={`tm-cor-badge ${isLocked ? 'locked' : ''}`} title={lockInfo?.reason}>
              {isLocked && <Lock size={10} />}
              {lockInfo.lockedBy.cor_number}
            </span>
          )}
          {ticket.photos?.length > 0 && (
            <CountBadge
              count={ticket.photos.length}
              icon={Camera}
              size="small"
              variant="default"
            />
          )}
          {hasFailedImport && (
            <span className="tm-import-failed-badge" title="COR data import failed - retry needed">
              <AlertTriangle size={12} /> Import Failed
            </span>
          )}
          {ticket.client_signature_data && (
            <span className="tm-verified-badge" title={`Verified by ${ticket.client_signature_name || 'client'}${ticket.client_signature_date ? ` on ${formatDate(ticket.client_signature_date)}` : ''}`}>
              <CheckCircle size={12} /> Verified
            </span>
          )}
          <span className={`tm-ticket-status ${ticket.status}`}>{ticket.status}</span>
        </div>
        <div className="tm-ticket-summary">
          <span className="tm-ticket-hours">{totalHours} hrs</span>
          <span className="tm-ticket-total">${totalCost.toFixed(2)}</span>
          <span className="tm-expand-arrow" aria-hidden="true">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="tm-ticket-details">
          {ticket.t_and_m_workers?.length > 0 && (
            <div className="tm-detail-section">
              <h4><HardHat size={16} className="inline-icon" /> Workers</h4>
              <div className="tm-detail-list">
                {ticket.t_and_m_workers.map(worker => (
                  <div key={worker.id} className="tm-detail-row">
                    <span>
                      {worker.role && worker.role !== 'Laborer' && (
                        <span className="tm-role-badge">{worker.role}</span>
                      )}
                      {worker.name}
                    </span>
                    <span>
                      {worker.hours} hrs
                      {parseFloat(worker.overtime_hours) > 0 && (
                        <span className="tm-ot-badge"> +{worker.overtime_hours} OT</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ticket.t_and_m_items?.length > 0 && (
            <div className="tm-detail-section">
              <h4><Wrench size={16} className="inline-icon" /> Materials & Equipment</h4>
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
              <h4><FileText size={16} className="inline-icon" /> Description</h4>
              <p className="tm-notes-text">{ticket.notes}</p>
            </div>
          )}

          {ticket.photos && ticket.photos.length > 0 && signedPhotoUrls.length > 0 && (
            <div className="tm-detail-section">
              <h4><Camera size={16} className="inline-icon" /> Photos ({ticket.photos.length})</h4>
              <div className="tm-photos-grid">
                {signedPhotoUrls.filter(Boolean).map((photo, idx) => (
                  <a key={idx} href={photo} target="_blank" rel="noopener noreferrer" className="tm-photo-thumb">
                    <img
                      src={photo}
                      alt={`Photo ${idx + 1}`}
                      onError={(e) => {
                        e.target.onerror = null
                        e.target.classList.add('photo-error')
                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIzIiB5PSIzIiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSIvPjwvc3ZnPg=='
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {ticket.ce_pco_number && ticket.change_order_value > 0 && (
            <div className="tm-change-order-value">
              <span className="tm-co-label">Change Order Value:</span>
              <span className="tm-co-amount">${ticket.change_order_value.toLocaleString()}</span>
            </div>
          )}

          {isLocked && (
            <div className="tm-lock-notice">
              <Lock size={14} />
              <span>{lockInfo?.reason || 'This ticket is locked (COR approved)'}</span>
            </div>
          )}

          <div className="tm-ticket-actions" role="group" aria-label="Ticket actions">
            {ticket.status === 'pending' && !isLocked && (
              <>
                <button
                  className="btn btn-success btn-small"
                  onClick={(e) => { e.stopPropagation(); onApprove(ticket); }}
                  aria-label="Approve this ticket"
                >
                  Approve
                </button>
                <button
                  className="btn btn-warning btn-small"
                  onClick={(e) => { e.stopPropagation(); onUpdateStatus(ticket.id, 'rejected'); }}
                  aria-label="Reject this ticket"
                >
                  Reject
                </button>
              </>
            )}
            {ticket.status === 'approved' && !isLocked && (
              <>
                <button
                  className="btn btn-primary btn-small"
                  onClick={(e) => { e.stopPropagation(); onUpdateStatus(ticket.id, 'billed'); }}
                  aria-label="Mark ticket as billed"
                >
                  Mark Billed
                </button>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={(e) => { e.stopPropagation(); onShowSignatureLink(ticket); }}
                  aria-label="Get signature link for this ticket"
                >
                  <Link size={14} aria-hidden="true" /> Signature Link
                </button>
              </>
            )}
            {ticket.status === 'rejected' && !isLocked && (
              <button
                className="btn btn-secondary btn-small"
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(ticket.id, 'pending'); }}
                aria-label="Restore rejected ticket to pending"
              >
                Restore
              </button>
            )}
            {!isLocked && (
              <button
                className={`btn btn-small ${ticket.assigned_cor_id ? 'btn-ghost' : 'btn-secondary'}`}
                onClick={(e) => { e.stopPropagation(); onOpenCorAssign(ticket); }}
                aria-label={ticket.assigned_cor_id ? 'Change COR link' : 'Link to Change Order'}
              >
                <Link2 size={14} aria-hidden="true" /> {ticket.assigned_cor_id ? 'COR' : 'Link COR'}
              </button>
            )}
            {hasFailedImport && !isLocked && (
              <button
                className="btn btn-warning btn-small"
                onClick={(e) => onRetryImport(ticket, e)}
                disabled={isRetrying}
                aria-label="Retry syncing data to COR"
                aria-busy={isRetrying}
              >
                <RefreshCw size={14} className={isRetrying ? 'spin' : ''} aria-hidden="true" /> {isRetrying ? 'Syncing...' : 'Retry Sync'}
              </button>
            )}
            {!isLocked && (
              <button
                className="btn btn-danger btn-small"
                onClick={(e) => { e.stopPropagation(); onDelete(ticket.id); }}
                aria-label="Delete this ticket"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

export default TMTicketCard
