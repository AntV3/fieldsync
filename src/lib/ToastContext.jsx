/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo } from 'react'

/**
 * ToastContext - Global toast notification system
 * Eliminates the need to pass onShowToast through props
 *
 * @example
 * // In any component:
 * const { showToast } = useToast()
 * showToast('Operation successful!', 'success')
 */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const [queue, setQueue] = useState([])

  const hideToast = useCallback(() => {
    setToast(null)
  }, [])

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    // If there's already a toast, queue this one
    if (toast) {
      setQueue(prev => [...prev, { message, type, duration }])
      return
    }

    setToast({ message, type, duration })

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        setToast(null)
      }, duration)
    }
  }, [toast])

  // Process queue when current toast is dismissed
  const processQueue = useCallback(() => {
    if (queue.length > 0) {
      const [next, ...rest] = queue
      setQueue(rest)
      setTimeout(() => {
        showToast(next.message, next.type, next.duration)
      }, 300) // Small delay between toasts
    }
  }, [queue, showToast])

  // Handle toast close
  const handleClose = useCallback(() => {
    hideToast()
    processQueue()
  }, [hideToast, processQueue])

  // Convenience methods for different toast types
  const success = useCallback((message, duration) => {
    showToast(message, 'success', duration)
  }, [showToast])

  const error = useCallback((message, duration) => {
    showToast(message, 'error', duration)
  }, [showToast])

  const warning = useCallback((message, duration) => {
    showToast(message, 'warning', duration)
  }, [showToast])

  const info = useCallback((message, duration) => {
    showToast(message, 'info', duration)
  }, [showToast])

  const value = useMemo(() => ({
    toast,
    showToast,
    hideToast: handleClose,
    success,
    error,
    warning,
    info
  }), [toast, showToast, handleClose, success, error, warning, info])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`} onClick={handleClose}>
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

/**
 * useToast - Hook to access toast notifications
 * @returns {Object} Toast controls
 *
 * @example
 * const { showToast, success, error } = useToast()
 *
 * // Generic toast
 * showToast('Message', 'success')
 *
 * // Convenience methods
 * success('Saved successfully!')
 * error('Something went wrong')
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
