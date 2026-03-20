/**
 * Lightweight error reporter for production crash tracking.
 *
 * Sends errors to a configurable endpoint (e.g. Sentry, custom webhook).
 * Falls back to console.error if no endpoint is configured — safe to
 * ship without configuration, then enable later by setting VITE_ERROR_REPORTING_DSN.
 *
 * Usage:
 *   import { reportError } from './errorReporter'
 *   reportError(error, { operation: 'saveTMTicket', userId: '...' })
 */

const DSN = import.meta.env.VITE_ERROR_REPORTING_DSN || ''

/**
 * Report an error to the configured endpoint.
 * Non-blocking — errors in reporting itself are silently caught.
 */
export function reportError(error, context = {}) {
  // Always log to console in development
  if (import.meta.env.DEV) {
    console.error('[ErrorReporter]', error, context)
    return
  }

  if (!DSN) return

  const payload = {
    message: error?.message || String(error),
    stack: error?.stack,
    name: error?.name,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    ...context
  }

  try {
    // Use sendBeacon for reliability (survives page unload)
    const sent = navigator.sendBeacon(DSN, JSON.stringify(payload))
    if (!sent) {
      // Fallback to fetch (non-blocking)
      fetch(DSN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {})
    }
  } catch {
    // Never let error reporting break the app
  }
}

/**
 * Install global unhandled error/rejection handlers.
 * Call once at app startup.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    reportError(event.error || new Error(event.message), {
      type: 'unhandled_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason || new Error('Unhandled promise rejection'), {
      type: 'unhandled_rejection'
    })
  })
}
