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

      <style>{`
        .confirm-dialog .modal-body {
          padding: 0;
        }

        .confirm-dialog-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: var(--space-xl, 2rem) var(--space-lg, 1.5rem);
          gap: var(--space-sm, 0.5rem);
        }

        .confirm-dialog-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: var(--radius-lg, 12px);
          margin-bottom: var(--space-xs, 0.25rem);
        }

        .confirm-dialog-title {
          font-size: var(--font-size-lg, 1.125rem);
          font-weight: var(--font-weight-semibold, 600);
          color: var(--text-primary);
          margin: 0;
        }

        .confirm-dialog-message {
          font-size: var(--font-size-sm, 0.875rem);
          color: var(--text-secondary);
          margin: 0;
          line-height: var(--line-height-normal, 1.5);
          max-width: 320px;
        }

        .confirm-dialog-actions {
          display: flex;
          gap: var(--space-sm, 0.5rem);
          margin-top: var(--space-md, 1rem);
          width: 100%;
          justify-content: center;
        }

        .confirm-dialog-actions .btn {
          min-width: 100px;
          justify-content: center;
        }
      `}</style>
    </Modal>
  )
})

export default ConfirmDialog
