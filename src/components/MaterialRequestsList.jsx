import { useState, useEffect, useMemo } from 'react'
import { Package, ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { db } from '../lib/supabase'

export default function MaterialRequestsList({ project, company, onShowToast }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedRequest, setExpandedRequest] = useState(null)

  // View mode state
  const [viewMode, setViewMode] = useState('recent') // 'recent' | 'all'
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

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

  // Filter requests by status, view mode, and date range
  const filteredRequests = useMemo(() => {
    let filtered = filter === 'all'
      ? [...requests]
      : requests.filter(r => r.status === filter)

    // Apply date filter if set
    if (dateFilter.start) {
      const startDate = new Date(dateFilter.start)
      startDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(r => {
        const requestDate = new Date(r.created_at)
        return requestDate >= startDate
      })
    }
    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(r => {
        const requestDate = new Date(r.created_at)
        return requestDate <= endDate
      })
    }

    // In recent mode, show only last 7 days
    if (viewMode === 'recent') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      filtered = filtered.filter(r => {
        const requestDate = new Date(r.created_at)
        return requestDate >= sevenDaysAgo
      })
    }

    return filtered
  }, [requests, filter, viewMode, dateFilter])

  // Group requests by month for 'all' view
  const requestsByMonth = useMemo(() => {
    if (viewMode !== 'all') return null

    const groups = {}
    filteredRequests.forEach(request => {
      const date = new Date(request.created_at)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      if (!groups[monthKey]) {
        groups[monthKey] = { label: monthLabel, requests: [], itemCount: 0 }
      }
      groups[monthKey].requests.push(request)
      groups[monthKey].itemCount += request.items?.length || 0
    })

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredRequests, viewMode])

  // Auto-expand current month
  useEffect(() => {
    if (requestsByMonth && requestsByMonth.length > 0) {
      const currentMonthKey = requestsByMonth[0][0]
      setExpandedMonths(new Set([currentMonthKey]))
    }
  }, [requestsByMonth])

  const toggleMonthExpand = (monthKey) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  // Count by status
  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    ordered: requests.filter(r => r.status === 'ordered').length,
    delivered: requests.filter(r => r.status === 'delivered').length,
    cancelled: requests.filter(r => r.status === 'cancelled').length
  }

  const totalRequestsCount = filter === 'all' ? requests.length : requests.filter(r => r.status === filter).length

  if (loading) {
    return <div className="loading">Loading material requests...</div>
  }

  // Helper function to render a request card
  const renderRequestCard = (request) => (
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
  )

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

        {/* View Mode Bar */}
        <div className="view-mode-bar">
          <div className="view-mode-tabs">
            <button
              className={`view-mode-tab ${viewMode === 'recent' ? 'active' : ''}`}
              onClick={() => { setViewMode('recent'); setDateFilter({ start: '', end: '' }); }}
            >
              Recent (7 days)
            </button>
            <button
              className={`view-mode-tab ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
            >
              All ({totalRequestsCount})
            </button>
          </div>

          {viewMode === 'all' && (
            <div className="date-filter">
              <Calendar size={16} />
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                placeholder="Start date"
              />
              <span>to</span>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                placeholder="End date"
              />
              {(dateFilter.start || dateFilter.end) && (
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => setDateFilter({ start: '', end: '' })}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="material-empty-state">
          <span className="empty-icon"><Package size={32} /></span>
          <p>No {filter === 'all' ? '' : filter} material requests{viewMode === 'recent' ? ' in the last 7 days' : ''}</p>
          {viewMode === 'recent' && totalRequestsCount > 0 && (
            <button className="btn btn-secondary btn-small" onClick={() => setViewMode('all')}>
              View All Requests
            </button>
          )}
        </div>
      ) : (
        <div className="material-requests">
          {/* Render requests - with month grouping in 'all' mode */}
          {viewMode === 'all' && requestsByMonth ? (
            requestsByMonth.map(([monthKey, monthData]) => (
              <div key={monthKey} className="month-group">
                <div
                  className="month-header"
                  onClick={() => toggleMonthExpand(monthKey)}
                >
                  <div className="month-header-left">
                    {expandedMonths.has(monthKey) ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                    <span className="month-label">{monthData.label}</span>
                    <span className="month-count">{monthData.requests.length} requests</span>
                  </div>
                  <div className="month-header-right">
                    <span className="month-stat">{monthData.itemCount} items</span>
                  </div>
                </div>
                {expandedMonths.has(monthKey) && (
                  <div className="month-requests">
                    {monthData.requests.map(request => renderRequestCard(request))}
                  </div>
                )}
              </div>
            ))
          ) : (
            // Recent view - simple list
            filteredRequests.map(request => renderRequestCard(request))
          )}
        </div>
      )}
    </div>
  )
}
