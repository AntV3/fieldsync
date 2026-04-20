import { useState, useEffect } from 'react'
import { Save, RotateCcw, ChevronDown, ChevronUp, Truck } from 'lucide-react'
import { useTradeConfig } from '../../lib/TradeConfigContext'
import { WIDGET_REGISTRY } from '../../lib/widgetRegistry'

const FORM_TYPES = [
  { value: 'daily_report', label: 'Daily Report' },
  { value: 'tm_ticket', label: 'Time and Material Ticket' },
  { value: 'crew_checkin', label: 'Crew Check-in' },
  { value: 'injury_report', label: 'Injury Report' }
]

/**
 * ProjectTradeOverrides - Per-project overrides for trade configuration.
 * Shows which settings differ from company defaults.
 *
 * Props:
 * - projectId: UUID
 * - onShowToast: (message, type) => void
 */
export default function ProjectTradeOverrides({ projectId, onShowToast }) {
  const { resolvedConfig, companyConfig, projectOverrides, updateProjectOverrides, loading } = useTradeConfig()
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [localWidgets, setLocalWidgets] = useState(null)
  const [localCustomFields, setLocalCustomFields] = useState(null)
  const [localTruckLoadTracking, setLocalTruckLoadTracking] = useState(null)

  useEffect(() => {
    if (projectOverrides) {
      setLocalWidgets(projectOverrides.dashboard_widgets)
      setLocalCustomFields(projectOverrides.custom_fields)
      setLocalTruckLoadTracking(projectOverrides.enable_truck_load_tracking ?? null)
    }
  }, [projectOverrides])

  const hasOverrides = projectOverrides && (
    projectOverrides.dashboard_widgets ||
    projectOverrides.custom_fields ||
    projectOverrides.field_actions ||
    projectOverrides.kpis ||
    projectOverrides.enable_truck_load_tracking != null
  )

  const handleResetToCompanyDefaults = async () => {
    setSaving(true)
    try {
      const result = await updateProjectOverrides({
        dashboard_widgets: null,
        custom_fields: null,
        field_actions: null,
        kpis: null,
        enable_truck_load_tracking: null
      })
      if (result.success) {
        setLocalWidgets(null)
        setLocalCustomFields(null)
        setLocalTruckLoadTracking(null)
        onShowToast?.('Reset to company defaults', 'success')
      }
    } catch (error) {
      console.error('Error resetting project overrides:', error)
      onShowToast?.('Error resetting overrides', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleWidget = (widgetId) => {
    const current = localWidgets || resolvedConfig?.dashboard_widgets || []
    const updated = current.includes(widgetId)
      ? current.filter(id => id !== widgetId)
      : [...current, widgetId]
    setLocalWidgets(updated)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const overrides = {}
      if (localWidgets) overrides.dashboard_widgets = localWidgets
      if (localCustomFields) overrides.custom_fields = localCustomFields
      if (localTruckLoadTracking != null) overrides.enable_truck_load_tracking = localTruckLoadTracking

      const result = await updateProjectOverrides(overrides)
      if (result.success) {
        onShowToast?.('Project overrides saved', 'success')
      } else {
        onShowToast?.('Error saving overrides', 'error')
      }
    } catch (error) {
      console.error('Error saving project overrides:', error)
      onShowToast?.('Error saving overrides', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  const tradeName = resolvedConfig?.trade_name
  if (!tradeName && !companyConfig) return null

  const activeWidgets = localWidgets || resolvedConfig?.dashboard_widgets || []

  return (
    <div className="project-trade-overrides">
      <button className="trade-section-toggle" onClick={() => setExpanded(!expanded)}>
        <div>
          <h3>Trade Configuration</h3>
          <span className="trade-override-subtitle">
            {tradeName || 'General'} {hasOverrides ? ' (customized)' : ''}
          </span>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded && (
        <div className="trade-section-body">
          {/* Truck & Load Tracking */}
          <div className="trade-override-group">
            <h4><Truck size={16} style={{ marginRight: 6, verticalAlign: -2 }} />Truck & Load Tracking</h4>
            <p className="form-help" style={{ marginBottom: '0.75rem' }}>
              When enabled, foremen and office users can track trucks and loads hauled off site.
            </p>
            <div className="trade-truck-toggle-row">
              <label className="trade-feature-toggle">
                <input
                  type="checkbox"
                  checked={localTruckLoadTracking ?? resolvedConfig?.enable_truck_load_tracking ?? false}
                  onChange={e => setLocalTruckLoadTracking(e.target.checked)}
                />
                <span className="trade-feature-label">Enable for this project</span>
              </label>
              {localTruckLoadTracking != null && (
                <button
                  className="btn-link-sm"
                  onClick={() => setLocalTruckLoadTracking(null)}
                  title="Use company default"
                >
                  Use company default
                </button>
              )}
            </div>
          </div>

          {/* Dashboard Widgets */}
          <div className="trade-override-group">
            <h4>Dashboard Widgets</h4>
            <div className="trade-widget-toggles">
              {Object.values(WIDGET_REGISTRY).map(widget => (
                <label key={widget.id} className="trade-widget-toggle">
                  <input
                    type="checkbox"
                    checked={activeWidgets.includes(widget.id)}
                    onChange={() => handleToggleWidget(widget.id)}
                  />
                  <span>{widget.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Fields Preview */}
          <div className="trade-override-group">
            <h4>Custom Fields</h4>
            {FORM_TYPES.map(ft => {
              const fields = resolvedConfig?.custom_fields?.[ft.value] || []
              if (fields.length === 0) return null
              return (
                <div key={ft.value} className="trade-override-field-group">
                  <span className="trade-override-field-label">{ft.label}:</span>
                  <span className="trade-override-field-count">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
                </div>
              )
            })}
            <p className="form-help">Custom fields are managed in company-level Trade Profile settings.</p>
          </div>

          {/* Actions */}
          <div className="trade-override-actions">
            {hasOverrides && (
              <button className="btn btn-sm btn-secondary" onClick={handleResetToCompanyDefaults} disabled={saving}>
                <RotateCcw size={14} /> Reset to Company Defaults
              </button>
            )}
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving...' : 'Save Overrides'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
