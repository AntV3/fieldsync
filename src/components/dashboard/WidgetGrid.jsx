import { useState } from 'react'
import { Plus, X, GripVertical, Settings } from 'lucide-react'
import { WIDGET_REGISTRY } from '../../lib/widgetRegistry'

/**
 * WidgetGrid - Configurable dashboard widget grid.
 *
 * Renders widgets based on the resolved trade config's dashboard_widgets array.
 * In edit mode, allows adding/removing/reordering widgets.
 *
 * Props:
 * - widgets: Array of widget IDs to render
 * - renderWidget: (widgetId) => ReactNode - function that renders each widget
 * - onSave: (widgetIds) => void - called when widget list changes
 * - editable: boolean - whether to show edit controls
 */
export default function WidgetGrid({ widgets, renderWidget, onSave, editable = false }) {
  const [editing, setEditing] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [localWidgets, setLocalWidgets] = useState(widgets || [])

  const activeWidgets = editing ? localWidgets : (widgets || [])

  const handleRemoveWidget = (widgetId) => {
    const updated = localWidgets.filter(id => id !== widgetId)
    setLocalWidgets(updated)
  }

  const handleAddWidget = (widgetId) => {
    if (!localWidgets.includes(widgetId)) {
      const updated = [...localWidgets, widgetId]
      setLocalWidgets(updated)
    }
    setShowPicker(false)
  }

  const handleMoveWidget = (fromIndex, direction) => {
    const toIndex = fromIndex + direction
    if (toIndex < 0 || toIndex >= localWidgets.length) return
    const updated = [...localWidgets]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    setLocalWidgets(updated)
  }

  const handleSave = () => {
    if (onSave) onSave(localWidgets)
    setEditing(false)
  }

  const handleCancel = () => {
    setLocalWidgets(widgets || [])
    setEditing(false)
  }

  const handleStartEdit = () => {
    setLocalWidgets(widgets || [])
    setEditing(true)
  }

  // Available widgets not yet added
  const availableWidgets = Object.values(WIDGET_REGISTRY).filter(
    w => !localWidgets.includes(w.id)
  )

  return (
    <div className="widget-grid-container">
      {editable && (
        <div className="widget-grid-toolbar">
          {editing ? (
            <>
              <button className="btn btn-sm btn-secondary" onClick={handleCancel}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={() => setShowPicker(true)}>
                <Plus size={14} /> Add Widget
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleSave}>Save Layout</button>
            </>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={handleStartEdit}>
              <Settings size={14} /> Customize Dashboard
            </button>
          )}
        </div>
      )}

      <div className="widget-grid">
        {activeWidgets.map((widgetId, index) => {
          const meta = WIDGET_REGISTRY[widgetId]
          const content = renderWidget(widgetId)

          if (!content && !editing) return null

          return (
            <div
              key={widgetId}
              className={`widget-grid-item widget-size-${meta?.defaultSize || 'full'} ${editing ? 'widget-editing' : ''}`}
            >
              {editing && (
                <div className="widget-edit-controls">
                  <button
                    className="widget-edit-btn"
                    onClick={() => handleMoveWidget(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <GripVertical size={14} />
                  </button>
                  <span className="widget-edit-label">{meta?.label || widgetId}</span>
                  <button
                    className="widget-edit-btn widget-remove-btn"
                    onClick={() => handleRemoveWidget(widgetId)}
                    title="Remove widget"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {content}
            </div>
          )
        })}
      </div>

      {/* Widget Picker Modal */}
      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal-content widget-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Widget</h3>
              <button className="btn-close" onClick={() => setShowPicker(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="widget-picker-list">
              {availableWidgets.length === 0 && (
                <p className="widget-picker-empty">All available widgets are already on your dashboard.</p>
              )}
              {availableWidgets.map(widget => (
                <button
                  key={widget.id}
                  className="widget-picker-item"
                  onClick={() => handleAddWidget(widget.id)}
                >
                  <div className="widget-picker-item-info">
                    <span className="widget-picker-item-label">{widget.label}</span>
                    <span className="widget-picker-item-desc">{widget.description}</span>
                  </div>
                  <Plus size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
