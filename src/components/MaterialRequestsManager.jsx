import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function MaterialRequestsManager({ onShowToast }) {
  const { company } = useAuth()
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [projects, setProjects] = useState([])
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [response, setResponse] = useState('')
  const [responding, setResponding] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load all projects
      const projectsData = await db.getProjects()
      setProjects(projectsData)

      // Load all material requests
      const requestsPromises = projectsData.map(p => db.getMaterialRequests(p.id))
      const requestsArrays = await Promise.all(requestsPromises)
      const allRequests = requestsArrays.flat()

      // Sort by priority and date
      allRequests.sort((a, b) => {
        const priorityOrder = { urgent: 0, normal: 1, low: 2 }
        const aPriority = priorityOrder[a.priority] || 1
        const bPriority = priorityOrder[b.priority] || 1

        if (aPriority !== bPriority) return aPriority - bPriority
        return new Date(b.created_at) - new Date(a.created_at)
      })

      setRequests(allRequests)
    } catch (error) {
      console.error('Error loading material requests:', error)
      onShowToast('Error loading material requests', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.id === projectId)
    return project?.name || 'Unknown Project'
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handleRespond = async (requestId, newStatus) => {
    if (newStatus === 'fulfilled' && !response.trim()) {
      onShowToast('Please enter a response message', 'error')
      return
    }

    setResponding(true)
    try {
      await db.updateMaterialRequest(requestId, {
        status: newStatus,
        response_notes: response || null,
        responded_at: new Date().toISOString()
      })

      setRequests(prev => prev.map(r =>
        r.id === requestId
          ? { ...r, status: newStatus, response_notes: response, responded_at: new Date().toISOString() }
          : r
      ))

      setSelectedRequest(null)
      setResponse('')
      onShowToast(`Request ${newStatus}`, 'success')
    } catch (error) {
      console.error('Error responding to request:', error)
      onShowToast('Error updating request', 'error')
    } finally {
      setResponding(false)
    }
  }

  const getPriorityColor = (priority) => {
    const colors = {
      urgent: '#ef4444',
      normal: '#f59e0b',
      low: '#10b981'
    }
    return colors[priority] || '#9ca3af'
  }

  const getStatusColor = (status) => {
    const colors = {
      pending: '#fbbf24',
      fulfilled: '#10b981',
      cancelled: '#9ca3af'
    }
    return colors[status] || '#9ca3af'
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading material requests...
      </div>
    )
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const completedRequests = requests.filter(r => r.status !== 'pending')

  return (
    <div>
      <h1>Material & Equipment Requests</h1>
      <p className="subtitle">Manage incoming requests from field teams</p>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="card">
          <h3>Pending Requests ({pendingRequests.length})</h3>

          <div className="material-requests-list">
            {pendingRequests.map(request => (
              <div key={request.id} className="material-request-card">
                <div className="material-request-header">
                  <div className="material-request-info">
                    <div className="material-request-project">{getProjectName(request.project_id)}</div>
                    <div className="material-request-meta">
                      <span className="material-request-date">
                        Requested {formatDate(request.created_at)}
                      </span>
                      {request.requested_by && (
                        <span className="material-request-requester">
                          by {request.requested_by}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="material-request-badges">
                    <span
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(request.priority), color: 'white' }}
                    >
                      {request.priority}
                    </span>
                    {request.needed_by && (
                      <span className="needed-by-badge">
                        Needed: {formatDate(request.needed_by)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="material-request-items">
                  {request.items?.map((item, idx) => (
                    <div key={idx} className="material-item">
                      <span className="material-item-name">{item.name}</span>
                      <span className="material-item-quantity">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>

                {request.notes && (
                  <div className="material-request-notes">
                    <strong>Notes:</strong> {request.notes}
                  </div>
                )}

                <div className="material-request-actions">
                  <button
                    className="btn-primary btn-small"
                    onClick={() => setSelectedRequest(request)}
                  >
                    Respond
                  </button>
                  <button
                    className="btn-secondary btn-small"
                    onClick={() => handleRespond(request.id, 'cancelled')}
                    disabled={responding}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingRequests.length === 0 && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
            <h3>No Pending Requests</h3>
            <p>All material requests have been handled</p>
          </div>
        </div>
      )}

      {/* Completed Requests */}
      {completedRequests.length > 0 && (
        <div className="card">
          <h3>Completed Requests</h3>

          <div className="material-requests-list">
            {completedRequests.map(request => (
              <div key={request.id} className="material-request-card completed">
                <div className="material-request-header">
                  <div className="material-request-info">
                    <div className="material-request-project">{getProjectName(request.project_id)}</div>
                    <div className="material-request-meta">
                      <span className="material-request-date">
                        {formatDate(request.created_at)}
                      </span>
                    </div>
                  </div>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(request.status), color: 'white' }}
                  >
                    {request.status}
                  </span>
                </div>

                <div className="material-request-items">
                  {request.items?.map((item, idx) => (
                    <div key={idx} className="material-item">
                      <span className="material-item-name">{item.name}</span>
                      <span className="material-item-quantity">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>

                {request.response_notes && (
                  <div className="material-request-response">
                    <strong>Response:</strong> {request.response_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response Modal */}
      {selectedRequest && (
        <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Respond to Material Request</h2>
              <button className="close-btn" onClick={() => setSelectedRequest(null)}>&times;</button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <strong>Project:</strong> {getProjectName(selectedRequest.project_id)}
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <strong>Items Requested:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  {selectedRequest.items?.map((item, idx) => (
                    <li key={idx}>
                      {item.name} - {item.quantity} {item.unit}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="form-group">
                <label>Response Message</label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={4}
                  placeholder="Enter delivery details, ETA, or any notes..."
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setSelectedRequest(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => handleRespond(selectedRequest.id, 'fulfilled')}
                disabled={responding || !response.trim()}
              >
                {responding ? 'Sending...' : 'Mark as Fulfilled'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .material-requests-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .material-request-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.25rem;
          background: #ffffff;
          transition: all 0.2s;
        }

        .material-request-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .material-request-card.completed {
          opacity: 0.7;
        }

        .material-request-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .material-request-info {
          flex: 1;
        }

        .material-request-project {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .material-request-meta {
          display: flex;
          gap: 0.75rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .material-request-badges {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: flex-end;
        }

        .priority-badge,
        .status-badge {
          padding: 0.375rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .needed-by-badge {
          padding: 0.375rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          background: #fef3c7;
          color: #92400e;
          font-weight: 500;
        }

        .material-request-items {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.5rem;
          margin-bottom: 1rem;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 6px;
        }

        .material-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
        }

        .material-item-name {
          font-weight: 500;
          color: #111827;
        }

        .material-item-quantity {
          font-size: 0.875rem;
          color: #6b7280;
          font-weight: 600;
        }

        .material-request-notes,
        .material-request-response {
          padding: 0.75rem;
          background: #eff6ff;
          border-left: 3px solid #3b82f6;
          border-radius: 4px;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .material-request-response {
          background: #f0fdf4;
          border-left-color: #10b981;
        }

        .material-request-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        @media (max-width: 768px) {
          .material-request-header {
            flex-direction: column;
            gap: 1rem;
          }

          .material-request-badges {
            align-items: flex-start;
            flex-direction: row;
          }

          .material-request-items {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
