import { useState, useRef, useEffect } from 'react'
import { Edit3, Check, X, Loader2 } from 'lucide-react'
import { formatCurrency } from '../../lib/corCalculations'

export default function CORLogRow({
  entry,
  isEditing,
  isSaving,
  onEdit,
  onSave,
  onCancel,
  statusDisplay
}) {
  const [editValues, setEditValues] = useState({
    dateSentToClient: entry.dateSentToClient || '',
    ceNumber: entry.ceNumber || '',
    comments: entry.comments || ''
  })

  const dateSentRef = useRef(null)

  // Focus first editable field when entering edit mode
  useEffect(() => {
    if (isEditing && dateSentRef.current) {
      dateSentRef.current.focus()
    }
  }, [isEditing])

  // Reset edit values when entry changes
  useEffect(() => {
    setEditValues({
      dateSentToClient: entry.dateSentToClient || '',
      ceNumber: entry.ceNumber || '',
      comments: entry.comments || ''
    })
  }, [entry])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleSave = () => {
    onSave(editValues)
  }

  const handleCancel = () => {
    setEditValues({
      dateSentToClient: entry.dateSentToClient || '',
      ceNumber: entry.ceNumber || '',
      comments: entry.comments || ''
    })
    onCancel()
  }

  const status = statusDisplay[entry.changeOrder.status] || { label: entry.changeOrder.status, className: '' }

  // Format date for display
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '-'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  // Format date for input
  const formatDateInput = (dateStr) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      return date.toISOString().split('T')[0]
    } catch {
      return dateStr
    }
  }

  if (isEditing) {
    return (
      <tr className="cor-log-row editing">
        <td className="col-log-num">{entry.logNumber}</td>
        <td className="col-date-sent">
          <input
            ref={dateSentRef}
            type="date"
            value={formatDateInput(editValues.dateSentToClient)}
            onChange={(e) => setEditValues(prev => ({ ...prev, dateSentToClient: e.target.value }))}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="cor-log-input"
          />
        </td>
        <td className="col-ce-num">
          <input
            type="text"
            value={editValues.ceNumber}
            onChange={(e) => setEditValues(prev => ({ ...prev, ceNumber: e.target.value }))}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            placeholder="CE-XXX"
            className="cor-log-input"
            maxLength={50}
          />
        </td>
        <td className="col-description">
          <span className="cor-log-title">{entry.changeOrder.title || 'Untitled'}</span>
          <span className="cor-log-number">{entry.changeOrder.corNumber}</span>
        </td>
        <td className="col-amount">{formatCurrency(entry.changeOrder.corTotal || 0)}</td>
        <td className="col-status">
          <span className={`cor-log-status ${status.className}`}>{status.label}</span>
        </td>
        <td className="col-comments">
          <textarea
            value={editValues.comments}
            onChange={(e) => setEditValues(prev => ({ ...prev, comments: e.target.value }))}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            placeholder="Add comments..."
            className="cor-log-textarea"
            rows={2}
          />
        </td>
        <td className="col-actions">
          {isSaving ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <div className="cor-log-edit-actions">
              <button
                className="btn btn-icon btn-success"
                onClick={handleSave}
                title="Save"
              >
                <Check size={14} />
              </button>
              <button
                className="btn btn-icon btn-ghost"
                onClick={handleCancel}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <tr className="cor-log-row">
      <td className="col-log-num">{entry.logNumber}</td>
      <td className="col-date-sent editable" onClick={onEdit}>
        {formatDateDisplay(entry.dateSentToClient)}
      </td>
      <td className="col-ce-num editable" onClick={onEdit}>
        {entry.ceNumber || '-'}
      </td>
      <td className="col-description">
        <span className="cor-log-title">{entry.changeOrder.title || 'Untitled'}</span>
        <span className="cor-log-number">{entry.changeOrder.corNumber}</span>
      </td>
      <td className="col-amount">{formatCurrency(entry.changeOrder.corTotal || 0)}</td>
      <td className="col-status">
        <span className={`cor-log-status ${status.className}`}>{status.label}</span>
      </td>
      <td className="col-comments editable" onClick={onEdit}>
        {entry.comments || <span className="placeholder">Click to add...</span>}
      </td>
      <td className="col-actions">
        <button
          className="btn btn-icon btn-ghost"
          onClick={onEdit}
          title="Edit"
        >
          <Edit3 size={14} />
        </button>
      </td>
    </tr>
  )
}
