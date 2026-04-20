import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import Toast from '../components/Toast'

/**
 * ToastContext - Global toast notification system
 * Supports stacking multiple toasts with proper animations
 *
 * @example
 * const { showToast } = useToast()
 * showToast('Operation successful!', 'success')
 */

const ToastContext = createContext(null)

let toastIdCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const maxToasts = 3

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message, type = 'info', duration) => {
    const id = ++toastIdCounter
    const newToast = { id, message, type, duration }

    setToasts(prev => {
      // Keep only the most recent toasts
      const updated = [...prev, newToast]
      if (updated.length > maxToasts) {
        return updated.slice(-maxToasts)
      }
      return updated
    })

    return id
  }, [])

  // Convenience methods
  const success = useCallback((message, duration) => showToast(message, 'success', duration), [showToast])
  const error = useCallback((message, duration) => showToast(message, 'error', duration), [showToast])
  const warning = useCallback((message, duration) => showToast(message, 'warning', duration), [showToast])
  const info = useCallback((message, duration) => showToast(message, 'info', duration), [showToast])

  const value = useMemo(() => ({
    toast: toasts[0] || null, // Backward compat
    showToast,
    hideToast: () => toasts.length > 0 && removeToast(toasts[0].id),
    success,
    error,
    warning,
    info
  }), [toasts, showToast, removeToast, success, error, warning, info])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container" role="region" aria-label="Notifications">
          {toasts.map((t) => (
            <Toast
              key={t.id}
              message={t.message}
              type={t.type}
              duration={t.duration}
              onClose={() => removeToast(t.id)}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/**
 * useToast - Hook to access toast notifications
 * @returns {Object} Toast controls
 */
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

/**
 * withToast - HOC to inject toast into class components or legacy code
 * @deprecated Prefer useToast hook
 */
export function withToast(Component) {
  return function WithToastComponent(props) {
    const toast = useToast()
    return <Component {...props} onShowToast={toast.showToast} toast={toast} />
  }
}

export default ToastContext
