import { useEffect, useRef, useCallback, memo } from 'react'
import { X } from 'lucide-react'

/**
 * Accessible Modal Component
 *
 * Features:
 * - Proper ARIA attributes (role="dialog", aria-modal, aria-labelledby)
 * - Focus trap within modal
 * - Escape key to close
 * - Click outside to close
 * - Focus restoration on close
 *
 * Usage:
 *   <Modal
 *     isOpen={showModal}
 *     onClose={() => setShowModal(false)}
 *     title="Modal Title"
 *     size="medium"
 *   >
 *     <p>Modal content here</p>
 *   </Modal>
 */
const Modal = memo(function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium', // 'small' | 'medium' | 'large' | 'full'
  className = '',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  footer,
  ariaDescribedBy
}) {
  const modalRef = useRef(null)
  const previousActiveElement = useRef(null)
  const titleId = useRef(`modal-title-${Math.random().toString(36).substr(2, 9)}`)

  // Store the previously focused element and focus the modal when it opens
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement
      // Focus the modal container after a brief delay to ensure it's rendered
      const timer = setTimeout(() => {
        modalRef.current?.focus()
      }, 10)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Restore focus when modal closes
  useEffect(() => {
    if (!isOpen && previousActiveElement.current) {
      previousActiveElement.current.focus()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnEscape, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  // Focus trap
  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Tab') return

    const focusableElements = modalRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    if (!focusableElements || focusableElements.length === 0) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }
  }, [])

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  const sizeClasses = {
    small: 'modal-small',
    medium: 'modal-medium',
    large: 'modal-large',
    full: 'modal-full'
  }

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal-content ${sizeClasses[size] || ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId.current : undefined}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal-header">
            <h2 id={titleId.current}>{title}</h2>
            {showCloseButton && (
              <button
                className="close-btn"
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
})

export default Modal
