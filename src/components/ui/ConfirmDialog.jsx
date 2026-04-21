import { memo } from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import Modal from './Modal'

/**
 * ConfirmDialog - Reusable confirmation modal for destructive/important actions
 *
 * @example
 * <ConfirmDialog
 *   isOpen={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Item"
 *   message="This action cannot be undone."
 *   variant="danger"
 *   confirmLabel="Delete"
 * />
 */
const VARIANTS = {
  danger: {
    icon: AlertTriangle,
    iconColor: 'var(--accent-red)',
    iconBg: 'var(--red-subtle, rgba(239, 68, 68, 0.08))',
    buttonClass: 'btn btn-danger'
  },
  warning: {
    icon: AlertCircle,
    iconColor: 'var(--accent-amber)',
    iconBg: 'var(--amber-subtle, rgba(245, 158, 11, 0.08))',
    buttonClass: 'btn btn-warning'
  },
  info: {
    icon: Info,
    iconColor: 'var(--accent-blue)',
    iconBg: 'var(--blue-subtle, rgba(59, 130, 246, 0.08))',
    buttonClass: 'btn btn-primary'
  }
}

const ConfirmDialog = memo(function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  variant = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false
}) {
  const config = VARIANTS[variant] || VARIANTS.danger
  const Icon = config.icon

  const handleConfirm = () => {
    onConfirm?.()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="small"
      showCloseButton={false}
      className="confirm-dialog"
    >
      <div className="confirm-dialog-content">
        <div
          className="confirm-dialog-icon"
          style={{ color: config.iconColor, background: config.iconBg }}
        >
          <Icon size={24} />
        </div>
        <h3 className="confirm-dialog-title">{title}</h3>
        {message && <p className="confirm-dialog-message">{message}</p>}
        <div className="confirm-dialog-actions">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            className={config.buttonClass}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
})

export default ConfirmDialog
