import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { FileSpreadsheet, Plus, ChevronRight } from 'lucide-react'
import { drawRequestOps } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'

/**
 * ProgressBillingCard - Summary card for progress billing / draw requests
 *
 * Shows:
 * - Contract summary (original + COs = revised)
 * - Billing progress (billed to date, retention held)
 * - Quick action to create new draw request
 * - Recent draw requests
 */
export default memo(function ProgressBillingCard({
  project,
  areas = [],
  corStats = {},
  onCreateDraw,
  onViewDraw,
  onShowToast: _onShowToast
}) {
  const [drawRequests, setDrawRequests] = useState([])
  const [loading, setLoading] = useState(true)

  // Calculate contract values
  const originalContract = useMemo(() => {
    return areas.reduce((sum, area) => {
      const value = (area.square_footage || 0) * (area.price_per_sqft || 0)
      return sum + Math.round(value * 100) // Convert to cents
    }, 0)
  }, [areas])

  const approvedCOs = useMemo(() => {
    return (corStats?.approvedTotal || 0)
  }, [corStats?.approvedTotal])

  const revisedContract = originalContract + approvedCOs

  // Load draw requests
  const loadDrawRequests = useCallback(async () => {
    if (!project?.id) return

    try {
      setLoading(true)
      const data = await drawRequestOps.getProjectDrawRequests(project.id)
      setDrawRequests(data || [])
    } catch (error) {
      console.error('Error loading draw requests:', error)
    } finally {
      setLoading(false)
    }
  }, [project?.id])

  useEffect(() => {
    loadDrawRequests()
  }, [loadDrawRequests])

  // Calculate billing totals from draw requests
  const billingTotals = useMemo(() => {
    const completedDraws = drawRequests.filter(dr =>
      ['submitted', 'approved', 'paid'].includes(dr.status)
    )

    const billedToDate = completedDraws.reduce((sum, dr) =>
      sum + (dr.previous_billings || 0) + (dr.current_billing || 0), 0
    )

    // Get the most recent retention amount
    const latestDraw = completedDraws[0]
    const retentionHeld = latestDraw?.retention_held || 0

    return { billedToDate, retentionHeld }
  }, [drawRequests])

  const progress = revisedContract > 0
    ? Math.round((billingTotals.billedToDate / revisedContract) * 100)
    : 0

  const nextDrawNumber = drawRequests.length > 0
    ? Math.max(...drawRequests.map(dr => dr.draw_number)) + 1
    : 1

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return <span className="badge badge-muted">Draft</span>
      case 'submitted':
        return <span className="badge badge-warning">Submitted</span>
      case 'approved':
        return <span className="badge badge-success">Approved</span>
      case 'paid':
        return <span className="badge badge-info">Paid</span>
      case 'rejected':
        return <span className="badge badge-danger">Rejected</span>
      default:
        return null
    }
  }

  return (
    <div className="progress-billing-card">
      <div className="progress-billing-header">
        <div className="progress-billing-title">
          <FileSpreadsheet size={18} />
          <h3>Progress Billing</h3>
        </div>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => onCreateDraw?.()}
          disabled={originalContract === 0}
          title={originalContract === 0 ? 'Add areas with contract values first' : `Create Draw #${nextDrawNumber}`}
        >
          <Plus size={14} />
          <span>Draw #{nextDrawNumber}</span>
        </button>
      </div>

      {/* Contract Summary */}
      <div className="progress-billing-contract">
        <div className="contract-row">
          <span className="contract-label">Original Contract</span>
          <span className="contract-value">{formatCurrency(originalContract)}</span>
        </div>
        {approvedCOs > 0 && (
          <div className="contract-row co">
            <span className="contract-label">Approved COs</span>
            <span className="contract-value positive">+{formatCurrency(approvedCOs)}</span>
          </div>
        )}
        <div className="contract-row revised">
          <span className="contract-label">Revised Contract</span>
          <span className="contract-value">{formatCurrency(revisedContract)}</span>
        </div>
      </div>

      {/* Billing Progress */}
      <div className="progress-billing-status">
        <div className="billing-progress-bar">
          <div
            className="billing-progress-fill"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="billing-stats">
          <div className="billing-stat">
            <span className="billing-stat-value">{formatCurrency(billingTotals.billedToDate)}</span>
            <span className="billing-stat-label">Billed to Date ({progress}%)</span>
          </div>
          {billingTotals.retentionHeld > 0 && (
            <div className="billing-stat retention">
              <span className="billing-stat-value">-{formatCurrency(billingTotals.retentionHeld)}</span>
              <span className="billing-stat-label">Retention Held</span>
            </div>
          )}
          <div className="billing-stat remaining">
            <span className="billing-stat-value">{formatCurrency(revisedContract - billingTotals.billedToDate)}</span>
            <span className="billing-stat-label">Balance to Finish</span>
          </div>
        </div>
      </div>

      {/* Recent Draw Requests */}
      {loading ? (
        <div className="progress-billing-loading">
          <div className="loading-spinner small" />
        </div>
      ) : drawRequests.length === 0 ? (
        <div className="progress-billing-empty">
          <p>No draw requests yet</p>
          {originalContract > 0 && (
            <button
              className="btn btn-sm btn-outline"
              onClick={() => onCreateDraw?.()}
            >
              <Plus size={14} />
              Create First Draw Request
            </button>
          )}
        </div>
      ) : (
        <div className="progress-billing-draws">
          <div className="draws-header">
            <span>Recent Draws</span>
          </div>
          <div className="draws-list">
            {drawRequests.slice(0, 3).map(dr => (
              <button
                key={dr.id}
                className="draw-item"
                onClick={() => onViewDraw?.(dr)}
              >
                <div className="draw-item-info">
                  <span className="draw-number">Draw #{dr.draw_number}</span>
                  <span className="draw-date">{formatDate(dr.period_end || dr.created_at)}</span>
                </div>
                <div className="draw-item-amount">
                  {formatCurrency(dr.current_billing || 0)}
                </div>
                {getStatusBadge(dr.status)}
                <ChevronRight size={16} className="draw-item-arrow" />
              </button>
            ))}
          </div>
          {drawRequests.length > 3 && (
            <button className="btn btn-sm btn-ghost view-all-draws">
              View all {drawRequests.length} draws
            </button>
          )}
        </div>
      )}
    </div>
  )
})
