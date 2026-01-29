import { useState, useEffect, useMemo } from 'react'
import { Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Plus, Table, List } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'

/**
 * CORLogPreview - COR Log view for the Financials tab
 * Shows summary statistics and full log table
 * "Show Full List" expands the card list below
 */

const STATUS_CATEGORIES = {
  pending: ['draft', 'pending_approval'],
  approved: ['approved', 'billed'],
  void: ['rejected', 'closed']
}

const STATUS_DISPLAY = {
  draft: { label: 'Draft', className: 'draft' },
  pending_approval: { label: 'Pending', className: 'pending' },
  approved: { label: 'Approved', className: 'approved' },
  rejected: { label: 'Rejected', className: 'rejected' },
  billed: { label: 'Billed', className: 'billed' },
  closed: { label: 'Closed', className: 'closed' }
}

export default function CORLogPreview({
  project,
  onShowToast,
  onToggleList,      // Toggles the full card list below
  showingList,       // Whether the list is currently expanded
  onViewFullLog,     // Opens full COR log modal (with edit capabilities)
  onCreateCOR,
}) {
  const [logEntries, setLogEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCORLog()

    // Subscribe to COR changes
    const subscription = db.subscribeToCORLog?.(project.id, () => {
      loadCORLog()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id])

  const loadCORLog = async () => {
    try {
      const data = await db.getCORLog(project.id)
      setLogEntries(data || [])
    } catch (error) {
      console.error('Error loading COR log:', error)
      onShowToast?.('Error loading COR log', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Group entries by status category
  const groupedEntries = useMemo(() => {
    const pending = logEntries.filter(e => STATUS_CATEGORIES.pending.includes(e.changeOrder?.status))
    const approved = logEntries.filter(e => STATUS_CATEGORIES.approved.includes(e.changeOrder?.status))
    const voided = logEntries.filter(e => STATUS_CATEGORIES.void.includes(e.changeOrder?.status))

    return { pending, approved, voided }
  }, [logEntries])

  // Calculate summary statistics
  const summary = useMemo(() => {
    const { pending, approved, voided } = groupedEntries

    return {
      totalCORs: logEntries.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      voidCount: voided.length,
      approvedTotal: approved.reduce((sum, e) => sum + (e.changeOrder?.corTotal || 0), 0),
      pendingTotal: pending.reduce((sum, e) => sum + (e.changeOrder?.corTotal || 0), 0)
    }
  }, [logEntries, groupedEntries])

  // All entries sorted by most recent
  const sortedEntries = useMemo(() => {
    return [...logEntries]
      .sort((a, b) => new Date(b.changeOrder?.createdAt || 0) - new Date(a.changeOrder?.createdAt || 0))
  }, [logEntries])

  if (loading) {
    return (
      <div className="cor-log-preview">
        <div className="cor-log-preview-loading">
          <div className="skeleton-stats">
            <div className="skeleton-stat"></div>
            <div className="skeleton-stat"></div>
            <div className="skeleton-stat"></div>
          </div>
          <div className="skeleton-table">
            {[1, 2, 3].map(i => <div key={i} className="skeleton-row"></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="cor-log-preview">
      {/* Header with actions */}
      <div className="cor-log-preview-header">
        <div className="cor-log-preview-title">
          <h3>Change Order Log</h3>
          <span className="cor-log-preview-count">{summary.totalCORs} total</span>
        </div>
        <div className="cor-log-preview-actions">
          <button
            className="btn btn-secondary btn-small"
            onClick={onViewFullLog}
            title="Open full COR log with edit & export"
          >
            <Table size={14} /> Edit Log
          </button>
          <button className="btn btn-primary btn-small" onClick={onCreateCOR}>
            <Plus size={14} /> New COR
          </button>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="cor-log-preview-stats">
        <div className="cor-log-stat approved">
          <div className="cor-log-stat-icon">
            <CheckCircle size={18} />
          </div>
          <div className="cor-log-stat-content">
            <span className="cor-log-stat-value">{formatCurrency(summary.approvedTotal)}</span>
            <span className="cor-log-stat-label">{summary.approvedCount} Approved</span>
          </div>
        </div>

        <div className="cor-log-stat pending">
          <div className="cor-log-stat-icon">
            <Clock size={18} />
          </div>
          <div className="cor-log-stat-content">
            <span className="cor-log-stat-value">{formatCurrency(summary.pendingTotal)}</span>
            <span className="cor-log-stat-label">{summary.pendingCount} Pending</span>
          </div>
        </div>

        {summary.voidCount > 0 && (
          <div className="cor-log-stat void">
            <div className="cor-log-stat-icon">
              <XCircle size={18} />
            </div>
            <div className="cor-log-stat-content">
              <span className="cor-log-stat-value">{summary.voidCount}</span>
              <span className="cor-log-stat-label">Void/Rejected</span>
            </div>
          </div>
        )}
      </div>

      {/* Full Log Table */}
      {sortedEntries.length > 0 ? (
        <div className="cor-log-preview-table-wrapper">
          <table className="cor-log-preview-table">
            <thead>
              <tr>
                <th>COR #</th>
                <th>Title</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map(entry => (
                <tr key={entry.id}>
                  <td className="cor-number">{entry.changeOrder?.corNumber || '—'}</td>
                  <td className="cor-title">{entry.changeOrder?.title || 'Untitled'}</td>
                  <td className="cor-amount">{formatCurrency(entry.changeOrder?.corTotal || 0)}</td>
                  <td>
                    <span className={`cor-status-badge ${STATUS_DISPLAY[entry.changeOrder?.status]?.className || ''}`}>
                      {STATUS_DISPLAY[entry.changeOrder?.status]?.label || entry.changeOrder?.status}
                    </span>
                  </td>
                  <td className="cor-date">
                    {entry.changeOrder?.createdAt
                      ? new Date(entry.changeOrder.createdAt).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cor-log-preview-empty">
          <p>No change orders yet</p>
          <button className="btn btn-primary btn-small" onClick={onCreateCOR}>
            <Plus size={14} /> Create First COR
          </button>
        </div>
      )}

      {/* Show/Hide Full List Toggle */}
      {sortedEntries.length > 0 && (
        <button className="cor-log-preview-view-all" onClick={onToggleList}>
          <List size={14} />
          <span>{showingList ? 'Hide' : 'Show'} Full COR List</span>
          {showingList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      )}
    </div>
  )
}
