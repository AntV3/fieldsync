import { memo } from 'react'
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'

/**
 * ErrorState - Reusable error display component for list/data components
 * Provides user-friendly error messages with retry functionality
 */
export const ErrorState = memo(function ErrorState({
  title = 'Unable to load data',
  message = 'Something went wrong. Please try again.',
  error = null,
  onRetry = null,
  retryLabel = 'Try Again',
  variant = 'default', // 'default' | 'inline' | 'compact'
  icon: CustomIcon = null
}) {
  // Determine icon based on error type
  const getIcon = () => {
    if (CustomIcon) return CustomIcon
    if (error?.message?.includes('network') || error?.message?.includes('offline')) {
      return WifiOff
    }
    return AlertTriangle
  }

  const Icon = getIcon()

  if (variant === 'compact') {
    return (
      <div className="error-state error-state-compact" role="alert">
        <Icon size={16} className="error-state-icon" aria-hidden="true" />
        <span className="error-state-message">{message}</span>
        {onRetry && (
          <button
            className="btn btn-ghost btn-small"
            onClick={onRetry}
            aria-label={retryLabel}
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="error-state error-state-inline" role="alert">
        <div className="error-state-content">
          <Icon size={20} className="error-state-icon" aria-hidden="true" />
          <div className="error-state-text">
            <span className="error-state-title">{title}</span>
            <span className="error-state-message">{message}</span>
          </div>
        </div>
        {onRetry && (
          <button className="btn btn-secondary btn-small" onClick={onRetry}>
            <RefreshCw size={14} /> {retryLabel}
          </button>
        )}
      </div>
    )
  }

  // Default variant - centered with full details
  return (
    <div className="error-state" role="alert" aria-live="polite">
      <div className="error-state-icon-wrapper">
        <Icon size={32} className="error-state-icon" aria-hidden="true" />
      </div>
      <h4 className="error-state-title">{title}</h4>
      <p className="error-state-message">{message}</p>

      {/* Show error details in development */}
      {import.meta.env.DEV && error && (
        <details className="error-state-details">
          <summary>Error Details</summary>
          <pre>{error.message || String(error)}</pre>
        </details>
      )}

      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          <RefreshCw size={16} /> {retryLabel}
        </button>
      )}
    </div>
  )
})

/**
 * EmptyState - Reusable empty state component
 * Shows when a list/data is empty (no error, just no data)
 */
export const EmptyState = memo(function EmptyState({
  title = 'No data yet',
  message = 'Items will appear here once added.',
  icon: Icon = null,
  action = null,
  actionLabel = 'Get Started',
  onAction = null
}) {
  return (
    <div className="empty-state" role="status">
      {Icon && (
        <div className="empty-state-icon-wrapper">
          <Icon size={32} className="empty-state-icon" aria-hidden="true" />
        </div>
      )}
      <h4 className="empty-state-title">{title}</h4>
      <p className="empty-state-message">{message}</p>
      {onAction && (
        <button className="btn btn-primary btn-small" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {action && !onAction && action}
    </div>
  )
})

export default ErrorState
