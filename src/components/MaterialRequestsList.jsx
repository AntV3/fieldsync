import { useState, useEffect } from 'react'
import { Package } from 'lucide-react'
import { db } from '../lib/supabase'

export default function MaterialRequestsList({ project, company, onShowToast }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedRequest, setExpandedRequest] = useState(null)

  useEffect(() => {
    loadRequests()

    // Subscribe to realtime updates
    const subscription = db.subscribeToMaterialRequests?.(project.id, () => {
      loadRequests()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id])

  const loadRequests = async () => {
    try {
      const data = await db.getMaterialRequests(project.id)
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading material requests:', error)
      onShowToast?.('Error loading material requests', 'error')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (requestId, newStatus) => {
    try {
      await db.updateMaterialRequest(requestId, newStatus, 'Office')
      setRequests(requests.map(r =>
        r.id === requestId ? { ...r, status: newStatus } : r
      ))
      onShowToast?.(`Request ${newStatus}`, 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      onShowToast?.('Error updating status', 'error')
    }
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'urgent': return 'priority-urgent'
      case 'low': return 'priority-low'
      default: return 'priority-normal'
    }
  }

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'urgent': return '🔴'
      case 'low': return '🟢'
      default: return '🟡'
    }
  }

  const filteredRequests = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter)

  // Count by status
  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    ordered: requests.filter(r => r.status === 'ordered').length,
    delivered: requests.filter(r => r.status === 'delivered').length,
    cancelled: requests.filter(r => r.status === 'cancelled').length
  }

  if (loading) {
    return <div className="loading">Loading material requests...</div>
  }

  return (
    <div className="material-requests-list card">
      <div className="material-requests-header">
        <div className="material-requests-title">
          <h3>Material Requests</h3>
          {counts.pending > 0 && (
            <span className="pending-badge">{counts.pending} pending</span>
          )}
        </div>

        <div className="material-filter-tabs">
          {['all', 'pending', 'ordered', 'delivered', 'cancelled'].map(status => (
            <button
              key={status}
              className={`material-filter-tab ${filter === status ? 'active' : ''}`}
              onClick={() => setFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              <span className="material-filter-count">{counts[status]}</span>
            </button>
          ))}
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="material-empty-state">
          <span className="empty-icon"><Package size={32} /></span>
          <p>No {filter === 'all' ? '' : filter} material requests</p>
        </div>
      ) : (
        <div className="material-requests">
          {filteredRequests.map(request => (
            <div
              key={request.id}
              className={`material-request-card ${request.status} ${request.priority === 'urgent' ? 'urgent' : ''}`}
            >
              <div
                className="material-request-header-row"
                onClick={() => setExpandedRequest(expandedRequest === request.id ? null : request.id)}
              >
                <div className="material-request-info">
                  <span className={`material-priority-badge ${getPriorityClass(request.priority)}`}>
                    {getPriorityIcon(request.priority)} {request.priority}
                  </span>
                  <span className="material-request-date">{formatDate(request.created_at)}</span>
                  <span className="material-request-time">{formatTime(request.created_at)}</span>
                </div>
                <div className="material-request-summary">
                  <span className="material-items-count">
                    {request.items?.length || 0} item{(request.items?.length || 0) !== 1 ? 's' : ''}
                  </span>
                  <span className={`material-status ${request.status}`}>{request.status}</span>
                  <span className="material-expand-arrow">{expandedRequest === request.id ? '▼' : '▶'}</span>
                </div>
              </div>

              {expandedRequest === request.id && (
                <div className="material-request-details">
                  {/* Requested By */}
                  <div className="material-detail-section">
                    <div className="material-requester">
                      <span className="requester-label">Requested by:</span>
                      <span className="requester-name">{request.requested_by || 'Field'}</span>
                    </div>
                    {request.needed_by && (
                      <div className="material-needed-by">
                        <span className="needed-label">Needed by:</span>
                        <span className="needed-date">{formatDate(request.needed_by)}</span>
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  {request.items?.length > 0 && (
                    <div className="material-detail-section">
                      <h4>Items Requested</h4>
                      <div className="material-items-list">
                        {request.items.map((item, idx) => (
                          <div key={idx} className="material-item-row">
                            <span className="item-name">{item.name}</span>
                            <span className="item-quantity">
                              {item.quantity} {item.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {request.notes && (
                    <div className="material-detail-section">
                      <h4>Notes</h4>
                      <p className="material-notes">{request.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="material-request-actions">
                    {request.status === 'pending' && (
                      <>
                        <button
                          className="btn btn-success btn-small"
                          onClick={(e) => { e.stopPropagation(); updateStatus(request.id, 'ordered'); }}
                        >
                          Mark Ordered
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={(e) => { e.stopPropagation(); updateStatus(request.id, 'cancelled'); }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {request.status === 'ordered' && (
                      <button
                        className="btn btn-success btn-small"
                        onClick={(e) => { e.stopPropagation(); updateStatus(request.id, 'delivered'); }}
                      >
                        Mark Delivered
                      </button>
                    )}
                    {request.status === 'cancelled' && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={(e) => { e.stopPropagation(); updateStatus(request.id, 'pending'); }}
                      >
                        Restore
                      </button>
                    )}
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
