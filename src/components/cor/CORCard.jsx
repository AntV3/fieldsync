import { memo } from 'react'
import { Eye, Edit3, Trash2, Send, CheckSquare, Square, CheckCircle } from 'lucide-react'
import { formatCurrency, getStatusInfo, formatDate, formatDateRange } from '../../lib/corCalculations'

/**
 * Memoized COR Card component
 * Prevents unnecessary re-renders when parent list updates
 */
const CORCard = memo(function CORCard({
  cor,
  isSelected,
  selectMode,
  areas,
  onToggleSelect,
  onView,
  onEdit,
  onDelete,
  onSubmitForApproval
}) {
  const statusInfo = getStatusInfo(cor.status)
  const canEdit = ['draft', 'pending_approval', 'approved'].includes(cor.status)
  const canDelete = ['draft', 'pending_approval', 'rejected'].includes(cor.status)
  const canSubmit = cor.status === 'draft'

  const getAreaName = (areaId) => {
    const area = areas?.find(a => a.id === areaId)
    return area?.name || 'No Area'
  }

  const handleClick = () => {
    if (selectMode) {
      onToggleSelect(cor.id)
    } else {
      onView?.(cor)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      className={`cor-card hover-lift animate-fade-in-up ${cor.status} ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${selectMode ? (isSelected ? 'Deselect' : 'Select') : 'View'} COR ${cor.cor_number}: ${cor.title || 'Untitled'}, ${statusInfo.label}, ${formatCurrency(cor.cor_total || 0)}`}
    >
      <div className="cor-card-header">
        <div className="cor-card-left">
          {selectMode && (
            <button
              className="cor-select-checkbox"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(cor.id, e); }}
              aria-label={isSelected ? 'Deselect' : 'Select'}
            >
              {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
          )}
          <span className="cor-number">{cor.cor_number}</span>
          <span
            className="cor-status-badge"
            style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
          >
            {statusInfo.label}
          </span>
          {(cor.gc_signature_data || cor.client_signature_data) && (
            <span className="cor-signed-badge" title={`Signed by ${cor.gc_signature_name || cor.client_signature_name || 'Client'}`}>
              <CheckCircle size={12} /> Signed
            </span>
          )}
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
              onClick={(e) => onSubmitForApproval(cor.id, e)}
              title="Submit for Approval"
              aria-label={`Submit COR ${cor.cor_number} for approval`}
            >
              <Send size={14} aria-hidden="true" />
            </button>
          )}
          {canEdit && (
            <button
              className="cor-action-btn edit"
              onClick={(e) => { e.stopPropagation(); onEdit?.(cor); }}
              title="Edit"
              aria-label={`Edit COR ${cor.cor_number}`}
            >
              <Edit3 size={14} aria-hidden="true" />
            </button>
          )}
          <button
            className="cor-action-btn view"
            onClick={(e) => { e.stopPropagation(); onView?.(cor); }}
            title="View Details"
            aria-label={`View COR ${cor.cor_number} details`}
          >
            <Eye size={14} aria-hidden="true" />
          </button>
          {canDelete && (
            <button
              className="cor-action-btn delete"
              onClick={(e) => onDelete(cor.id, e)}
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
})

export default CORCard
