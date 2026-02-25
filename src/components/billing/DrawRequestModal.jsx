import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { X, FileSpreadsheet, Calendar, Percent, Save, Download } from 'lucide-react'
import { drawRequestOps } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'

/**
 * DrawRequestModal - Create or edit a draw request / pay application
 *
 * Features:
 * - Period selection (start/end dates)
 * - Schedule of values table with % completion entry
 * - Auto-calculates amounts from percentages
 * - Retention calculation
 * - Summary with current payment due
 */
export default memo(function DrawRequestModal({
  project,
  company,
  areas = [],
  corStats = {},
  editDrawRequest = null,
  onSave,
  onClose,
  onDownloadPDF
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Draw request header fields
  const [drawNumber, setDrawNumber] = useState(1)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0])
  const [retentionPercent, setRetentionPercent] = useState(10) // Display as whole number
  const [notes, setNotes] = useState('')

  // Schedule of values items
  const [sovItems, setSovItems] = useState([])

  // Previous billing info
  const [previousBillings, setPreviousBillings] = useState(0)
  const [previousRetention, setPreviousRetention] = useState(0)

  const isEditMode = !!editDrawRequest

  // Calculate contract values
  const originalContract = useMemo(() => {
    return areas.reduce((sum, area) => {
      const value = (area.square_footage || 0) * (area.price_per_sqft || 0)
      return sum + Math.round(value * 100)
    }, 0)
  }, [areas])

  const approvedCOs = corStats?.approvedTotal || 0
  const revisedContract = originalContract + approvedCOs

  // Initialize data
  const initializeDrawRequest = useCallback(async () => {
    if (!project?.id) return

    try {
      setLoading(true)

      if (editDrawRequest) {
        // Edit mode - populate from existing draw request
        setDrawNumber(editDrawRequest.draw_number)
        setPeriodStart(editDrawRequest.period_start || '')
        setPeriodEnd(editDrawRequest.period_end || '')
        setRetentionPercent((editDrawRequest.retention_percent || 1000) / 100)
        setNotes(editDrawRequest.notes || '')
        setPreviousBillings(editDrawRequest.previous_billings || 0)
        setPreviousRetention(editDrawRequest.previous_retention || 0)

        // Load items
        const fullDraw = await drawRequestOps.getDrawRequest(editDrawRequest.id)
        if (fullDraw?.draw_request_items) {
          setSovItems(fullDraw.draw_request_items.map(item => ({
            ...item,
            current_percent_input: (item.current_percent || 0) / 100 // Convert to display %
          })))
        }
      } else {
        // New draw - get next number and previous data
        const nextNum = await drawRequestOps.getNextDrawNumber(project.id)
        setDrawNumber(nextNum)

        // Get previous billing totals
        const { totalBilled, totalRetention } = await drawRequestOps.getPreviousBillingTotals(project.id)
        setPreviousBillings(totalBilled)
        setPreviousRetention(totalRetention)

        // Get previous item progress
        const previousItems = await drawRequestOps.getPreviousDrawItems(project.id)

        // Build SOV items from areas
        const sov = await drawRequestOps.getScheduleOfValues(project.id)
        setSovItems(sov.map(item => {
          const prev = previousItems[item.area_id] || { previous_percent: 0, previous_amount: 0 }
          return {
            ...item,
            previous_percent: prev.previous_percent,
            previous_amount: prev.previous_amount,
            current_percent: 0,
            current_percent_input: 0,
            current_amount: 0
          }
        }))
      }
    } catch (error) {
      console.error('Error initializing draw request:', error)
    } finally {
      setLoading(false)
    }
  }, [project?.id, editDrawRequest])

  useEffect(() => {
    initializeDrawRequest()
  }, [initializeDrawRequest])

  // Handle percentage change for an item
  const handlePercentChange = (index, value) => {
    const percent = parseFloat(value) || 0
    const item = sovItems[index]

    // Calculate remaining available (100% - previous%)
    const previousPct = (item.previous_percent || 0) / 100
    const maxAllowed = 100 - previousPct

    // Clamp to valid range
    const clampedPercent = Math.min(Math.max(0, percent), maxAllowed)

    // Calculate amount from percentage
    const currentAmount = drawRequestOps.calculateAmountFromPercent(
      clampedPercent * 100, // Convert back to basis points
      item.scheduled_value
    )

    setSovItems(prev => prev.map((it, i) =>
      i === index
        ? {
            ...it,
            current_percent_input: clampedPercent,
            current_percent: Math.round(clampedPercent * 100), // Store as basis points
            current_amount: currentAmount
          }
        : it
    ))
  }

  // Calculate totals
  const totals = useMemo(() => {
    const scheduledTotal = sovItems.reduce((sum, item) => sum + (item.scheduled_value || 0), 0)
    const previousTotal = sovItems.reduce((sum, item) => sum + (item.previous_amount || 0), 0)
    const currentTotal = sovItems.reduce((sum, item) => sum + (item.current_amount || 0), 0)
    const completedTotal = previousTotal + currentTotal

    // Retention calculation
    const retentionBasisPoints = retentionPercent * 100
    const totalRetention = Math.round((completedTotal * retentionBasisPoints) / 10000)
    const currentRetentionChange = totalRetention - previousRetention

    // Payment due = current billing - retention increase
    const paymentDue = currentTotal - currentRetentionChange

    // Balance to finish
    const balanceToFinish = scheduledTotal - completedTotal

    return {
      scheduledTotal,
      previousTotal,
      currentTotal,
      completedTotal,
      totalRetention,
      currentRetentionChange,
      paymentDue,
      balanceToFinish
    }
  }, [sovItems, retentionPercent, previousRetention])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (totals.currentTotal === 0) {
      alert('Please enter at least one line item with work completed this period.')
      return
    }

    try {
      setSaving(true)

      const drawRequestData = {
        project_id: project.id,
        company_id: company.id,
        draw_number: drawNumber,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        retention_percent: Math.round(retentionPercent * 100), // Convert to basis points
        original_contract: originalContract,
        approved_changes: approvedCOs,
        previous_billings: previousBillings,
        current_billing: totals.currentTotal,
        retention_held: totals.totalRetention,
        previous_retention: previousRetention,
        notes: notes.trim() || null
      }

      const itemsData = sovItems.map(item => ({
        area_id: item.area_id,
        item_number: item.item_number,
        description: item.description,
        scheduled_value: item.scheduled_value,
        previous_percent: item.previous_percent || 0,
        previous_amount: item.previous_amount || 0,
        current_percent: item.current_percent || 0,
        current_amount: item.current_amount || 0
      }))

      let result
      if (isEditMode) {
        // Update existing
        await drawRequestOps.updateDrawRequest(editDrawRequest.id, drawRequestData)
        await drawRequestOps.updateDrawRequestItems(editDrawRequest.id, itemsData)
        result = await drawRequestOps.getDrawRequest(editDrawRequest.id)
      } else {
        // Create new
        result = await drawRequestOps.createDrawRequest(drawRequestData, itemsData)
      }

      onSave?.(result)
    } catch (error) {
      console.error('Error saving draw request:', error)
      alert('Failed to save draw request. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content draw-request-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <FileSpreadsheet size={20} />
            {isEditMode ? `Edit Draw #${drawNumber}` : `Create Draw #${drawNumber}`}
          </h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="modal-body">
            <div className="draw-request-loading">
              <div className="loading-spinner" />
              <p>Loading schedule of values...</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {/* Period & Retention Row */}
              <div className="draw-request-header-fields">
                <div className="form-group">
                  <label htmlFor="period-start">
                    <Calendar size={14} />
                    Period Start
                  </label>
                  <input
                    id="period-start"
                    type="date"
                    value={periodStart}
                    onChange={e => setPeriodStart(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="period-end">
                    <Calendar size={14} />
                    Period End
                  </label>
                  <input
                    id="period-end"
                    type="date"
                    value={periodEnd}
                    onChange={e => setPeriodEnd(e.target.value)}
                    className="form-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="retention">
                    <Percent size={14} />
                    Retention
                  </label>
                  <div className="input-with-suffix">
                    <input
                      id="retention"
                      type="number"
                      step="0.5"
                      min="0"
                      max="20"
                      value={retentionPercent}
                      onChange={e => setRetentionPercent(parseFloat(e.target.value) || 0)}
                      className="form-input"
                    />
                    <span className="input-suffix">%</span>
                  </div>
                </div>
              </div>

              {/* Contract Summary */}
              <div className="draw-contract-summary">
                <div className="contract-item">
                  <span>Original Contract</span>
                  <span>{formatCurrency(originalContract)}</span>
                </div>
                {approvedCOs > 0 && (
                  <div className="contract-item">
                    <span>Approved COs</span>
                    <span className="positive">+{formatCurrency(approvedCOs)}</span>
                  </div>
                )}
                <div className="contract-item total">
                  <span>Revised Contract</span>
                  <span>{formatCurrency(revisedContract)}</span>
                </div>
              </div>

              {/* Schedule of Values Table */}
              <div className="sov-table-container">
                <table className="sov-table">
                  <thead>
                    <tr>
                      <th className="sov-col-num">#</th>
                      <th className="sov-col-desc">Description</th>
                      <th className="sov-col-scheduled">Scheduled Value</th>
                      <th className="sov-col-prev">Previous %</th>
                      <th className="sov-col-current">This Period %</th>
                      <th className="sov-col-total">Total %</th>
                      <th className="sov-col-amount">This Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sovItems.map((item, index) => {
                      const prevPct = (item.previous_percent || 0) / 100
                      const currPct = item.current_percent_input || 0
                      const totalPct = prevPct + currPct
                      const isComplete = totalPct >= 100

                      return (
                        <tr key={item.area_id || index} className={isComplete ? 'complete' : ''}>
                          <td className="sov-col-num">{item.item_number}</td>
                          <td className="sov-col-desc">{item.description}</td>
                          <td className="sov-col-scheduled">{formatCurrency(item.scheduled_value)}</td>
                          <td className="sov-col-prev">{prevPct.toFixed(0)}%</td>
                          <td className="sov-col-current">
                            {isComplete && prevPct >= 100 ? (
                              <span className="complete-indicator">-</span>
                            ) : (
                              <div className="sov-input-wrapper">
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  max={100 - prevPct}
                                  value={currPct || ''}
                                  onChange={e => handlePercentChange(index, e.target.value)}
                                  className="sov-percent-input"
                                  placeholder="0"
                                />
                                <span className="sov-input-suffix">%</span>
                              </div>
                            )}
                          </td>
                          <td className="sov-col-total">
                            <span className={totalPct >= 100 ? 'complete' : ''}>
                              {totalPct.toFixed(0)}%
                            </span>
                          </td>
                          <td className="sov-col-amount">
                            {item.current_amount > 0 ? formatCurrency(item.current_amount) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="sov-totals">
                      <td colSpan="2">Totals</td>
                      <td>{formatCurrency(totals.scheduledTotal)}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td>{formatCurrency(totals.currentTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Summary */}
              <div className="draw-summary">
                <div className="draw-summary-row">
                  <span>Previous Billings</span>
                  <span>{formatCurrency(totals.previousTotal)}</span>
                </div>
                <div className="draw-summary-row current">
                  <span>Current Billing (This Draw)</span>
                  <span>{formatCurrency(totals.currentTotal)}</span>
                </div>
                <div className="draw-summary-row">
                  <span>Total Completed</span>
                  <span>{formatCurrency(totals.completedTotal)}</span>
                </div>
                <div className="draw-summary-divider" />
                <div className="draw-summary-row retention">
                  <span>Retention ({retentionPercent}%)</span>
                  <span>-{formatCurrency(totals.totalRetention)}</span>
                </div>
                {previousRetention > 0 && (
                  <div className="draw-summary-row">
                    <span>Less Previous Retention</span>
                    <span>+{formatCurrency(previousRetention)}</span>
                  </div>
                )}
                <div className="draw-summary-divider" />
                <div className="draw-summary-row total">
                  <span>Current Payment Due</span>
                  <span>{formatCurrency(totals.paymentDue)}</span>
                </div>
                <div className="draw-summary-row balance">
                  <span>Balance to Finish</span>
                  <span>{formatCurrency(totals.balanceToFinish)}</span>
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label htmlFor="draw-notes">Notes (optional)</label>
                <textarea
                  id="draw-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Additional notes for this draw request..."
                  className="form-textarea"
                  rows={2}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              {isEditMode && onDownloadPDF && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onDownloadPDF?.(editDrawRequest)}
                  disabled={saving}
                >
                  <Download size={16} />
                  Download PDF
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || totals.currentTotal === 0}
              >
                {saving ? (
                  <>
                    <div className="loading-spinner small" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {isEditMode ? 'Update Draw' : 'Create Draw'}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
})
