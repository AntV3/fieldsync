import { useState, useEffect, useMemo } from 'react'
import { FileText, Plus, ChevronDown, ChevronRight, Calendar, Download, Eye, Edit3, Trash2, Send } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency, getStatusInfo, formatDate, formatDateRange, calculateCORTotals } from '../../lib/corCalculations'

export default function CORList({ project, company, areas, onShowToast, onCreateCOR, onViewCOR, onEditCOR }) {
  const [cors, setCORs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [expandedCOR, setExpandedCOR] = useState(null)
  const [selectedCORs, setSelectedCORs] = useState(new Set())

  // View mode state
  const [viewMode, setViewMode] = useState('recent') // 'recent' | 'all'
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  // Stats state
  const [stats, setStats] = useState(null)

  useEffect(() => {
    loadCORs()
    loadStats()

    // Subscribe to realtime updates
    const subscription = db.subscribeToCORs?.(project.id, () => {
      loadCORs()
      loadStats()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id])

  const loadCORs = async () => {
    try {
      const data = await db.getCORs(project.id)
      setCORs(data || [])
    } catch (error) {
      console.error('Error loading CORs:', error)
      onShowToast?.('Error loading change order requests', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const data = await db.getCORStats?.(project.id)
      setStats(data)
    } catch (error) {
      console.error('Error loading COR stats:', error)
    }
  }

  const handleDelete = async (corId, e) => {
    e?.stopPropagation()
    if (!confirm('Are you sure you want to delete this COR? This action cannot be undone.')) return

    try {
      await db.deleteCOR(corId)
      setCORs(cors.filter(c => c.id !== corId))
      onShowToast?.('COR deleted', 'success')
      loadStats()
    } catch (error) {
      console.error('Error deleting COR:', error)
      onShowToast?.('Error deleting COR', 'error')
    }
  }

  const handleSubmitForApproval = async (corId, e) => {
    e?.stopPropagation()
    try {
      await db.submitCORForApproval(corId)
      await loadCORs()
      onShowToast?.('COR submitted for approval', 'success')
      loadStats()
    } catch (error) {
      console.error('Error submitting COR:', error)
      onShowToast?.('Error submitting COR', 'error')
    }
  }

  // Filter CORs by status, area, view mode, and date range
  const filteredCORs = useMemo(() => {
    let filtered = [...cors]

    // Status filter
    if (filter !== 'all') {
      filtered = filtered.filter(c => c.status === filter)
    }

    // Area filter
    if (areaFilter !== 'all') {
      filtered = filtered.filter(c => c.area_id === areaFilter)
    }

    // Apply date filter if set
    if (dateFilter.start) {
      const startDate = new Date(dateFilter.start)
      startDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(c => {
        const corDate = new Date(c.created_at)
        return corDate >= startDate
      })
    }
    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(c => {
        const corDate = new Date(c.created_at)
        return corDate <= endDate
      })
    }

    // In recent mode, show only last 7 days
    if (viewMode === 'recent') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      filtered = filtered.filter(c => {
        const corDate = new Date(c.created_at)
        return corDate >= sevenDaysAgo
      })
    }

    // Sort by created_at descending
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return filtered
  }, [cors, filter, areaFilter, viewMode, dateFilter])

  // Group CORs by month for 'all' view
  const corsByMonth = useMemo(() => {
    if (viewMode !== 'all') return null

    const groups = {}
    filteredCORs.forEach(cor => {
      const date = new Date(cor.created_at)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      if (!groups[monthKey]) {
        groups[monthKey] = { label: monthLabel, cors: [], totalAmount: 0 }
      }
      groups[monthKey].cors.push(cor)
      groups[monthKey].totalAmount += cor.cor_total || 0
    })

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredCORs, viewMode])

  // Auto-expand current month
  useEffect(() => {
    if (corsByMonth && corsByMonth.length > 0) {
      const currentMonthKey = corsByMonth[0][0]
      setExpandedMonths(new Set([currentMonthKey]))
    }
  }, [corsByMonth])

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
  const counts = useMemo(() => ({
    all: cors.length,
    draft: cors.filter(c => c.status === 'draft').length,
    pending_approval: cors.filter(c => c.status === 'pending_approval').length,
    approved: cors.filter(c => c.status === 'approved').length,
    rejected: cors.filter(c => c.status === 'rejected').length,
    billed: cors.filter(c => c.status === 'billed').length,
    closed: cors.filter(c => c.status === 'closed').length
  }), [cors])

  const totalCORsCount = filter === 'all' ? cors.length : cors.filter(c => c.status === filter).length

  const getAreaName = (areaId) => {
    const area = areas?.find(a => a.id === areaId)
    return area?.name || 'No Area'
  }

  // Render COR card
  const renderCORCard = (cor) => {
    const statusInfo = getStatusInfo(cor.status)
    const isExpanded = expandedCOR === cor.id
    const canEdit = cor.status === 'draft'
    const canDelete = cor.status === 'draft'
    const canSubmit = cor.status === 'draft'

    return (
      <div
        key={cor.id}
        className={`cor-card ${cor.status}`}
        onClick={() => onViewCOR?.(cor)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewCOR?.(cor) } }}
        tabIndex={0}
        role="button"
        aria-label={`View COR ${cor.cor_number}: ${cor.title || 'Untitled'}, ${statusInfo.label}, ${formatCurrency(cor.cor_total || 0)}`}
      >
        <div className="cor-card-header">
          <div className="cor-card-left">
            <span className="cor-number">{cor.cor_number}</span>
            <span
              className="cor-status-badge"
              style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
            >
              {statusInfo.label}
            </span>
          </div>
          <div className="cor-card-right">
            <span className="cor-total">{formatCurrency(cor.cor_total || 0)}</span>
          </div>
        </div>

        <div className="cor-card-body">
          <h4 className="cor-title">{cor.title || 'Untitled COR'}</h4>
          <div className="cor-meta">
            {cor.area_id && (
              <span className="cor-area">{getAreaName(cor.area_id)}</span>
            )}
            <span className="cor-period">{formatDateRange(cor.period_start, cor.period_end)}</span>
          </div>
        </div>

        <div className="cor-card-footer">
          <span className="cor-created">{formatDate(cor.created_at)}</span>
          <div className="cor-actions" onClick={e => e.stopPropagation()}>
            {canSubmit && (
              <button
                className="cor-action-btn submit"
                onClick={(e) => handleSubmitForApproval(cor.id, e)}
                title="Submit for Approval"
                aria-label={`Submit COR ${cor.cor_number} for approval`}
              >
                <Send size={14} aria-hidden="true" />
              </button>
            )}
            {canEdit && (
              <button
                className="cor-action-btn edit"
                onClick={(e) => { e.stopPropagation(); onEditCOR?.(cor) }}
                title="Edit"
                aria-label={`Edit COR ${cor.cor_number}`}
              >
                <Edit3 size={14} aria-hidden="true" />
              </button>
            )}
            <button
              className="cor-action-btn view"
              onClick={(e) => { e.stopPropagation(); onViewCOR?.(cor) }}
              title="View Details"
              aria-label={`View COR ${cor.cor_number} details`}
            >
              <Eye size={14} aria-hidden="true" />
            </button>
            {canDelete && (
              <button
                className="cor-action-btn delete"
                onClick={(e) => handleDelete(cor.id, e)}
                title="Delete"
                aria-label={`Delete COR ${cor.cor_number}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="loading">Loading change order requests...</div>
  }

  return (
    <div className="cor-list card">
      {/* Quick Stats */}
      <div className="cor-stats">
        <div className="cor-stat">
          <span className="cor-stat-value">{counts.all}</span>
          <span className="cor-stat-label">Total CORs</span>
        </div>
        <div className="cor-stat draft">
          <span className="cor-stat-value">{counts.draft}</span>
          <span className="cor-stat-label">Draft</span>
        </div>
        <div className="cor-stat pending">
          <span className="cor-stat-value">{counts.pending_approval}</span>
          <span className="cor-stat-label">Pending</span>
        </div>
        <div className="cor-stat approved">
          <span className="cor-stat-value">{counts.approved}</span>
          <span className="cor-stat-label">Approved</span>
        </div>
        {stats?.totalApproved > 0 && (
          <div className="cor-stat total-approved">
            <span className="cor-stat-value">{formatCurrency(stats.totalApproved)}</span>
            <span className="cor-stat-label">Total Approved</span>
          </div>
        )}
      </div>

      {/* Header with Create Button */}
      <div className="cor-list-header">
        <div className="cor-list-title">
          <h3>Change Order Requests</h3>
          {counts.pending_approval > 0 && (
            <span className="pending-badge">{counts.pending_approval} pending</span>
          )}
        </div>
        <button className="btn btn-primary" onClick={onCreateCOR}>
          <Plus size={16} /> New COR
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="cor-filter-tabs" role="tablist" aria-label="Filter CORs by status">
        {[
          { id: 'all', label: 'All' },
          { id: 'draft', label: 'Draft' },
          { id: 'pending_approval', label: 'Pending' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
          { id: 'billed', label: 'Billed' }
        ].map(status => (
          <button
            key={status.id}
            role="tab"
            aria-selected={filter === status.id}
            className={`cor-filter-tab ${filter === status.id ? 'active' : ''}`}
            onClick={() => setFilter(status.id)}
          >
            {status.label}
            <span className="cor-filter-count" aria-label={`${counts[status.id]} items`}>{counts[status.id]}</span>
          </button>
        ))}
      </div>

      {/* Area Filter (if areas exist) */}
      {areas && areas.length > 0 && (
        <div className="cor-area-filter">
          <label htmlFor="cor-area-filter" className="sr-only">Filter by area</label>
          <select
            id="cor-area-filter"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="cor-area-select"
            aria-label="Filter CORs by project area"
          >
            <option value="all">All Areas</option>
            {areas.map(area => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
        </div>
      )}

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
            All ({totalCORsCount})
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

      {/* COR List */}
      {filteredCORs.length === 0 ? (
        <div className="cor-empty-state">
          <span className="empty-icon"><FileText size={32} /></span>
          <p>No {filter === 'all' ? '' : filter.replace('_', ' ')} change order requests
            {viewMode === 'recent' ? ' in the last 7 days' : ''}</p>
          {viewMode === 'recent' && totalCORsCount > 0 && (
            <button className="btn btn-secondary btn-small" onClick={() => setViewMode('all')}>
              View All CORs
            </button>
          )}
          <button className="btn btn-primary" onClick={onCreateCOR}>
            <Plus size={16} /> Create Your First COR
          </button>
        </div>
      ) : (
        <div className="cor-cards">
          {/* Render CORs - with month grouping in 'all' mode */}
          {viewMode === 'all' && corsByMonth ? (
            corsByMonth.map(([monthKey, monthData]) => (
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
                    <span className="month-count">{monthData.cors.length} CORs</span>
                  </div>
                  <div className="month-header-right">
                    <span className="month-stat">{formatCurrency(monthData.totalAmount)}</span>
                  </div>
                </div>
                {expandedMonths.has(monthKey) && (
                  <div className="month-cors">
                    {monthData.cors.map(cor => renderCORCard(cor))}
                  </div>
                )}
              </div>
            ))
          ) : (
            // Recent view - simple list
            filteredCORs.map(cor => renderCORCard(cor))
          )}
        </div>
      )}
    </div>
  )
}
