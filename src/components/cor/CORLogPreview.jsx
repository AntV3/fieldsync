import { useState, useEffect, useMemo } from 'react'
import { Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Plus, Table, List, Eye, FileDown, Check, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { db } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'

/**
 * CORLogPreview - COR Log view for the Financials tab
 * Shows summary statistics, a value-by-status breakdown bar, and full log table
 * with per-row quick actions (View, Export PDF, Approve/Reject for pending).
 * "Show Full List" expands the card list below (only offered for larger logs).
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

// Value breakdown segments: approved green, pending amber, rejected red
const STATUS_BAR_SEGMENTS = [
  { key: 'approved', label: 'Approved', color: 'var(--accent-green, #10b981)' },
  { key: 'pending', label: 'Pending', color: 'var(--accent-amber, #f59e0b)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--accent-red, #ef4444)' }
]

// Only offer the expandable card list once the log is big enough to need it
const FULL_LIST_THRESHOLD = 10

export default function CORLogPreview({
  project,
  company,
  user,
  onShowToast,
  onToggleList,      // Toggles the full card list below
  showingList,       // Whether the list is currently expanded
  onViewFullLog,     // Opens full COR log modal (with edit capabilities)
  onCreateCOR,
  onViewCOR,         // Opens full COR detail view
}) {
  const [logEntries, setLogEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState(null)

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
      pendingTotal: pending.reduce((sum, e) => sum + (e.changeOrder?.corTotal || 0), 0),
      voidTotal: voided.reduce((sum, e) => sum + (e.changeOrder?.corTotal || 0), 0)
    }
  }, [logEntries, groupedEntries])

  // Value breakdown for the status bar chart
  const statusBreakdown = useMemo(() => {
    const values = {
      approved: summary.approvedTotal,
      pending: summary.pendingTotal,
      rejected: summary.voidTotal
    }
    const total = values.approved + values.pending + values.rejected
    if (total <= 0) return null

    return {
      total,
      segments: STATUS_BAR_SEGMENTS
        .map(seg => ({
          ...seg,
          value: values[seg.key],
          percent: (values[seg.key] / total) * 100
        }))
        .filter(seg => seg.value > 0)
    }
  }, [summary])

  // All entries sorted by most recent
  const sortedEntries = useMemo(() => {
    return [...logEntries]
      .sort((a, b) => new Date(b.changeOrder?.createdAt || 0) - new Date(a.changeOrder?.createdAt || 0))
  }, [logEntries])

  // Map a log entry to the shape onViewCOR expects
  const toCORShape = (entry) => ({
    id: entry.changeOrder?.id,
    cor_number: entry.changeOrder?.corNumber,
    title: entry.changeOrder?.title,
    cor_total: entry.changeOrder?.corTotal,
    status: entry.changeOrder?.status,
    created_at: entry.changeOrder?.createdAt,
    approved_at: entry.changeOrder?.approvedAt,
    approved_by: entry.changeOrder?.approvedBy
  })

  const handleApprove = async (entry, e) => {
    e.stopPropagation()
    const corId = entry.changeOrder?.id
    if (!corId || actionInProgress) return
    if (!confirm(`Approve ${entry.changeOrder?.corNumber || 'this COR'}?`)) return

    setActionInProgress(corId)
    try {
      await db.approveCOR(corId, user?.id)
      onShowToast?.('COR approved', 'success')
      await loadCORLog()
    } catch (error) {
      console.error('Error approving COR:', error)
      onShowToast?.('Error approving COR', 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleReject = async (entry, e) => {
    e.stopPropagation()
    const corId = entry.changeOrder?.id
    if (!corId || actionInProgress) return
    const reason = prompt('Enter rejection reason (optional):')
    if (reason === null) return // User cancelled

    setActionInProgress(corId)
    try {
      await db.rejectCOR(corId, reason, user?.id)
      onShowToast?.('COR rejected', 'success')
      await loadCORLog()
    } catch (error) {
      console.error('Error rejecting COR:', error)
      onShowToast?.('Error rejecting COR', 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleExportPDF = async (entry, e) => {
    e.stopPropagation()
    const corId = entry.changeOrder?.id
    if (!corId || actionInProgress) return

    setActionInProgress(corId)
    try {
      onShowToast?.('Generating PDF...', 'info')
      // Load full COR (line items) and the PDF generator on demand
      const [fullCOR, { exportCORToPDF }] = await Promise.all([
        db.getCORById(corId),
        import('../../lib/corPdfExport')
      ])
      const branding = {
        logoUrl: company?.logo_url,
        primaryColor: company?.branding_color
      }
      await exportCORToPDF(fullCOR, project, company, branding)
      onShowToast?.('PDF downloaded', 'success')
    } catch (error) {
      console.error('Error exporting COR PDF:', error)
      onShowToast?.('Error exporting PDF', 'error')
    } finally {
      setActionInProgress(null)
    }
  }

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

      {/* COR Value Breakdown by Status - horizontal stacked bar */}
      {statusBreakdown && (
        <div className="cor-status-bar-card">
          <div className="cor-status-bar-header">
            <span className="cor-status-bar-title">COR Value by Status</span>
            <span className="cor-status-bar-total">{formatCurrency(statusBreakdown.total)}</span>
          </div>
          <div className="cor-status-bar">
            <ResponsiveContainer width="100%" height={34}>
              <BarChart
                layout="vertical"
                data={[Object.fromEntries(statusBreakdown.segments.map(s => [s.key, s.value]))]}
                margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
              >
                <XAxis type="number" hide domain={[0, statusBreakdown.total]} />
                <YAxis type="category" hide dataKey={() => 'value'} />
                <Tooltip
                  cursor={false}
                  formatter={(value, key) => [
                    formatCurrency(value),
                    STATUS_BAR_SEGMENTS.find(s => s.key === key)?.label || key
                  ]}
                  labelFormatter={() => ''}
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontSize: '0.8rem'
                  }}
                />
                {statusBreakdown.segments.map((seg, i) => (
                  <Bar
                    key={seg.key}
                    dataKey={seg.key}
                    stackId="corValue"
                    fill={seg.color}
                    barSize={14}
                    radius={
                      statusBreakdown.segments.length === 1
                        ? [7, 7, 7, 7]
                        : i === 0
                          ? [7, 0, 0, 7]
                          : i === statusBreakdown.segments.length - 1
                            ? [0, 7, 7, 0]
                            : 0
                    }
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="cor-status-bar-legend">
            {statusBreakdown.segments.map(seg => (
              <span key={seg.key} className="cor-status-bar-legend-item">
                <span className="cor-status-bar-swatch" style={{ background: seg.color }} />
                {seg.label} · {formatCurrency(seg.value)}
              </span>
            ))}
          </div>
        </div>
      )}

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
                <th className="cor-actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map(entry => {
                const status = entry.changeOrder?.status
                const isPending = status === 'pending_approval'
                const isBusy = actionInProgress === entry.changeOrder?.id
                return (
                  <tr key={entry.id} onClick={() => onViewCOR?.(toCORShape(entry))} style={{ cursor: 'pointer' }} className="cor-log-preview-row-clickable">
                    <td className="cor-number">{entry.changeOrder?.corNumber || '—'}</td>
                    <td className="cor-title">{entry.changeOrder?.title || 'Untitled'}</td>
                    <td className="cor-amount">{formatCurrency(entry.changeOrder?.corTotal || 0)}</td>
                    <td>
                      <span className={`cor-status-badge ${STATUS_DISPLAY[status]?.className || ''}`}>
                        {STATUS_DISPLAY[status]?.label || status}
                      </span>
                    </td>
                    <td className="cor-date">
                      {entry.changeOrder?.createdAt
                        ? new Date(entry.changeOrder.createdAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="cor-row-actions-cell">
                      <div className="cor-row-actions">
                        <button
                          className="cor-row-action-btn"
                          onClick={(e) => { e.stopPropagation(); onViewCOR?.(toCORShape(entry)) }}
                          disabled={isBusy}
                          title="View COR detail"
                        >
                          <Eye size={14} />
                          <span>View</span>
                        </button>
                        <button
                          className="cor-row-action-btn icon-only"
                          onClick={(e) => handleExportPDF(entry, e)}
                          disabled={isBusy}
                          title="Export PDF"
                          aria-label="Export PDF"
                        >
                          <FileDown size={14} />
                        </button>
                        {isPending && (
                          <>
                            <button
                              className="cor-row-action-btn approve"
                              onClick={(e) => handleApprove(entry, e)}
                              disabled={isBusy}
                              title="Approve COR"
                            >
                              <Check size={14} />
                              <span>Approve</span>
                            </button>
                            <button
                              className="cor-row-action-btn reject"
                              onClick={(e) => handleReject(entry, e)}
                              disabled={isBusy}
                              title="Reject COR"
                            >
                              <X size={14} />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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

      {/* Show/Hide Full List Toggle - only for larger logs; small logs are fully visible above */}
      {sortedEntries.length >= FULL_LIST_THRESHOLD && (
        <button className="cor-log-preview-view-all" onClick={onToggleList}>
          <List size={14} />
          <span>{showingList ? 'Hide' : 'Show'} Full COR List</span>
          {showingList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      )}
    </div>
  )
}
