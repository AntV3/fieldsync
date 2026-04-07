import { useEffect, useState, useRef, memo } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

/**
 * Toast - Premium notification component
 * Features: type-specific icons, slide-in/out animations, progress countdown,
 * optional action button, glass-morphism styling
 */

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const Toast = memo(function Toast({ message, type = 'info', duration, onClose, action, actionLabel }) {
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)
  const rafRef = useRef(null)

  const effectiveDuration = duration || (type === 'error' ? 5000 : type === 'warning' ? 4000 : 3000)
  const Icon = ICONS[type] || ICONS.info

  useEffect(() => {
    startTimeRef.current = Date.now()

    const animateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, 100 - (elapsed / effectiveDuration) * 100)
      setProgress(remaining)
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(animateProgress)
      }
    }
    rafRef.current = requestAnimationFrame(animateProgress)

    timerRef.current = setTimeout(() => {
      handleClose()
    }, effectiveDuration)

    return () => {
      clearTimeout(timerRef.current)
      cancelAnimationFrame(rafRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDuration])

  const handleClose = () => {
    setExiting(true)
    setTimeout(() => {
      onClose?.()
    }, 200)
  }

  const handleAction = () => {
    action?.()
    handleClose()
  }

  return (
    <div
      className={`toast-notification toast-${type} ${exiting ? 'toast-exit' : 'toast-enter'}`}
      role="alert"
      aria-live="polite"
    >
      <div className="toast-icon-wrapper">
        <Icon size={18} />
      </div>
      <span className="toast-message">{message}</span>
      {action && actionLabel && (
        <button className="toast-action" onClick={handleAction}>
          {actionLabel}
        </button>
      )}
      <button className="toast-close" onClick={handleClose} aria-label="Dismiss notification">
        <X size={14} />
      </button>
      <div className="toast-progress">
        <div className="toast-progress-bar" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
})

export default Toast
