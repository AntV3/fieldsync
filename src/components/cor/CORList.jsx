import { useState, useEffect, useMemo } from 'react'
import { FileText, Plus, ChevronDown, ChevronRight, Calendar, Download, Eye, Edit3, Trash2, Send } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency, getStatusInfo, formatDate, formatDateRange, calculateCORTotals } from '../../lib/corCalculations'

export default function CORList({ project, company, areas, refreshKey, onShowToast, onCreateCOR, onViewCOR, onEditCOR }) {
  const [cors, setCORs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
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
  }, [project.id, refreshKey])

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
      console.error('Error submitting COR:', error?.message || error)
      onShowToast?.(error?.message || 'Error submitting COR', 'error')
    }
  }

  // Get unique groups from CORs
  const availableGroups = useMemo(() => {
    const groups = cors
      .map(c => c.group_name)
      .filter(Boolean)
    return [...new Set(groups)].sort()
  }, [cors])

  // Filter CORs by status, area, group, view mode, and date range
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

    // Group filter
    if (groupFilter !== 'all') {
      filtered = filtered.filter(c => c.group_name === groupFilter)
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
  }, [cors, filter, areaFilter, groupFilter, viewMode, dateFilter])

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
    // Allow editing before billed (draft, pending_approval, approved)
    const canEdit = ['draft', 'pending_approval', 'approved'].includes(cor.status)
    // Allow deleting CORs that haven't been approved/billed/closed
    const canDelete = ['draft', 'pending_approval', 'rejected'].includes(cor.status)
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
            {cor.group_name && (
              <span className="cor-group-badge">{cor.group_name}</span>
            )}
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
    <div className="cor-list">
      {/* Clean Header */}
      <div className="cor-list-header">
        <div className="cor-list-info">
          <h3>Change Orders</h3>
          <div className="cor-stats-inline">
            <span className="cor-stat-item">{counts.all} total</span>
            {counts.pending_approval > 0 && (
              <span className="cor-stat-item pending">{counts.pending_approval} pending</span>
            )}
            {stats?.totalApproved > 0 && (
              <span className="cor-stat-item approved">{formatCurrency(stats.totalApproved)}</span>
            )}
          </div>
        </div>
        <button className="btn btn-primary btn-small" onClick={onCreateCOR}>
          <Plus size={14} /> New COR
        </button>
      </div>

      {/* Minimal Filter Row */}
      <div className="cor-controls">
        <div className="cor-filter-pills" role="tablist">
          {[
            { id: 'all', label: 'All' },
            { id: 'draft', label: 'Draft' },
            { id: 'pending_approval', label: 'Pending' },
            { id: 'approved', label: 'Approved' }
          ].map(status => (
            <button
              key={status.id}
              role="tab"
              aria-selected={filter === status.id}
              className={`cor-pill ${filter === status.id ? 'active' : ''}`}
              onClick={() => setFilter(status.id)}
            >
              {status.label}
              {counts[status.id] > 0 && <span className="cor-pill-count">{counts[status.id]}</span>}
            </button>
          ))}
        </div>

        {/* Group Filter */}
        {availableGroups.length > 0 && (
          <select
            className="cor-group-filter"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="all">All Groups</option>
            {availableGroups.map(group => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        )}

        {/* View Toggle */}
        <div className="cor-view-toggle">
          <button
            className={`cor-toggle-btn ${viewMode === 'recent' ? 'active' : ''}`}
            onClick={() => { setViewMode('recent'); setDateFilter({ start: '', end: '' }); }}
          >
            Recent
          </button>
          <button
            className={`cor-toggle-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            All
          </button>
        </div>
      </div>

      {/* Date Filter - Only in All mode */}
      {viewMode === 'all' && (
        <div className="cor-date-filter">
          <Calendar size={14} />
          <input
            type="date"
            value={dateFilter.start}
            onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
          />
          <span className="cor-date-sep">to</span>
          <input
            type="date"
            value={dateFilter.end}
            onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
          />
          {(dateFilter.start || dateFilter.end) && (
            <button className="cor-clear-btn" onClick={() => setDateFilter({ start: '', end: '' })}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* COR List */}
      {filteredCORs.length === 0 ? (
        <div className="cor-empty">
          <FileText size={24} className="cor-empty-icon" />
          <p>No change orders {filter !== 'all' ? `(${filter.replace('_', ' ')})` : ''}</p>
          <button className="btn btn-primary btn-small" onClick={onCreateCOR}>
            <Plus size={14} /> Create COR
          </button>
        </div>
      ) : (
        <div className="cor-cards">
          {viewMode === 'all' && corsByMonth ? (
            corsByMonth.map(([monthKey, monthData]) => (
              <div key={monthKey} className="cor-month-group">
                <button
                  className="cor-month-header"
                  onClick={() => toggleMonthExpand(monthKey)}
                >
                  <div className="cor-month-left">
                    {expandedMonths.has(monthKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>{monthData.label}</span>
                    <span className="cor-month-count">{monthData.cors.length}</span>
                  </div>
                  <span className="cor-month-total">{formatCurrency(monthData.totalAmount)}</span>
                </button>
                {expandedMonths.has(monthKey) && (
                  <div className="cor-month-items">
                    {monthData.cors.map(cor => renderCORCard(cor))}
                  </div>
                )}
              </div>
            ))
          ) : (
            filteredCORs.map(cor => renderCORCard(cor))
          )}
        </div>
      )}
    </div>
  )
}
