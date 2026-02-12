import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { Truck, Plus, Calendar, RotateCcw, ChevronDown, ChevronUp, Edit2, Trash2 } from 'lucide-react'
import { equipmentOps } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'

// Helper function - defined outside component to avoid recreation
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

/**
 * ProjectEquipmentCard - Equipment tracking card for Financials Overview
 *
 * Shows equipment currently on site with daily rates and costs.
 * Allows adding new equipment and marking equipment as returned.
 */
export default memo(function ProjectEquipmentCard({
  project,
  onAddEquipment,
  onEditEquipment,
  onShowToast
}) {
  const [projectEquipment, setProjectEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [totalCost, setTotalCost] = useState(0)

  // Memoized load function to avoid stale closures
  const loadEquipment = useCallback(async () => {
    if (!project?.id) return

    try {
      setLoading(true)
      const data = await equipmentOps.getProjectEquipment(project.id)
      setProjectEquipment(data || [])

      // Calculate total cost
      const cost = equipmentOps.calculateProjectEquipmentCost(data || [])
      setTotalCost(cost)
    } catch (error) {
      console.error('Error loading equipment:', error)
      onShowToast?.('Failed to load equipment', 'error')
    } finally {
      setLoading(false)
    }
  }, [project?.id]) // onShowToast is stable (memoized in App.jsx)

  // Load project equipment when project changes
  useEffect(() => {
    loadEquipment()
  }, [loadEquipment])

  const handleMarkReturned = useCallback(async (equipmentItem) => {
    try {
      await equipmentOps.markEquipmentReturned(equipmentItem.id)
      onShowToast?.(`${equipmentItem.equipment_name} marked as returned`, 'success')
      loadEquipment()
    } catch (error) {
      console.error('Error marking equipment returned:', error)
      onShowToast?.('Failed to update equipment', 'error')
    }
  }, [loadEquipment]) // onShowToast is stable

  const handleDelete = useCallback(async (equipmentItem) => {
    if (!confirm(`Remove ${equipmentItem.equipment_name} from this project?`)) {
      return
    }

    try {
      await equipmentOps.removeEquipmentFromProject(equipmentItem.id)
      onShowToast?.('Equipment removed', 'success')
      loadEquipment()
    } catch (error) {
      console.error('Error removing equipment:', error)
      onShowToast?.('Failed to remove equipment', 'error')
    }
  }, [loadEquipment]) // onShowToast is stable

  // Memoize derived state to avoid recalculating on every render
  const activeEquipment = useMemo(
    () => projectEquipment.filter(e => !e.end_date),
    [projectEquipment]
  )

  const returnedEquipment = useMemo(
    () => projectEquipment.filter(e => e.end_date),
    [projectEquipment]
  )

  return (
    <div className="project-equipment-card">
      <div className="project-equipment-header">
        <div className="project-equipment-title">
          <Truck size={18} />
          <h3>Equipment on Site</h3>
          {projectEquipment.length > 0 && (
            <span className="equipment-count">{activeEquipment.length} active</span>
          )}
        </div>
        <div className="project-equipment-actions">
          <button
            className="btn btn-sm btn-primary"
            onClick={() => onAddEquipment?.()}
            title="Add equipment"
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
          {projectEquipment.length > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="equipment-loading">
          <div className="loading-spinner small" />
        </div>
      ) : projectEquipment.length === 0 ? (
        <div className="equipment-empty">
          <p>No equipment tracked on this project</p>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => onAddEquipment?.()}
          >
            <Plus size={14} />
            Track Equipment
          </button>
        </div>
      ) : expanded ? (
        <>
          {/* Active Equipment */}
          {activeEquipment.length > 0 && (
            <div className="equipment-list">
              {activeEquipment.map(item => {
                const days = equipmentOps.calculateDaysOnSite(item.start_date, item.end_date)
                const cost = item.daily_rate * days

                return (
                  <div key={item.id} className="equipment-item active">
                    <div className="equipment-item-main">
                      <div className="equipment-item-info">
                        <span className="equipment-name">{item.equipment_name}</span>
                        <span className="equipment-meta">
                          <Calendar size={12} />
                          On-site since {formatDate(item.start_date)}
                        </span>
                      </div>
                      <div className="equipment-item-cost">
                        <span className="equipment-rate">
                          {formatCurrency(item.daily_rate)}/day
                        </span>
                        <span className="equipment-days">{days} days</span>
                        <span className="equipment-total">{formatCurrency(cost)}</span>
                      </div>
                    </div>
                    <div className="equipment-item-actions">
                      <button
                        className="btn btn-xs btn-outline"
                        onClick={() => handleMarkReturned(item)}
                        title="Mark as returned"
                      >
                        <RotateCcw size={12} />
                        Returned
                      </button>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => onEditEquipment?.(item)}
                        title="Edit"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        className="btn btn-xs btn-ghost text-danger"
                        onClick={() => handleDelete(item)}
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Returned Equipment (collapsed by default) */}
          {returnedEquipment.length > 0 && (
            <details className="equipment-returned-section">
              <summary className="equipment-returned-toggle">
                <span>Returned Equipment ({returnedEquipment.length})</span>
              </summary>
              <div className="equipment-list returned">
                {returnedEquipment.map(item => {
                  const days = equipmentOps.calculateDaysOnSite(item.start_date, item.end_date)
                  const cost = item.daily_rate * days

                  return (
                    <div key={item.id} className="equipment-item returned">
                      <div className="equipment-item-main">
                        <div className="equipment-item-info">
                          <span className="equipment-name">{item.equipment_name}</span>
                          <span className="equipment-meta">
                            {formatDate(item.start_date)} - {formatDate(item.end_date)}
                          </span>
                        </div>
                        <div className="equipment-item-cost">
                          <span className="equipment-days">{days} days</span>
                          <span className="equipment-total">{formatCurrency(cost)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          )}

          {/* Total */}
          <div className="equipment-total-row">
            <span>Total Equipment Cost</span>
            <span className="equipment-grand-total">{formatCurrency(totalCost)}</span>
          </div>
        </>
      ) : (
        <div className="equipment-summary-collapsed">
          <span>{activeEquipment.length} active, {returnedEquipment.length} returned</span>
          <span className="equipment-grand-total">{formatCurrency(totalCost)}</span>
        </div>
      )}
    </div>
  )
})
