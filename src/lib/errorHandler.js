/**
 * FieldSync Error Handling Utility
 *
 * Centralized error handling with proper logging, user feedback, and recovery.
 * Eliminates silent failures and provides consistent error handling patterns.
 *
 * Usage:
 *   import { handleError, withErrorHandling, safeAsync } from './errorHandler'
 *
 *   // Wrap async operations
 *   const data = await safeAsync(
 *     () => db.getTMTickets(projectId),
 *     { fallback: [], context: { operation: 'getTMTickets', projectId } }
 *   )
 *
 *   // Handle errors with toast
 *   try { ... } catch (error) {
 *     handleError(error, { operation: 'saveTicket', showToast: onShowToast })
 *   }
 */

import { observe } from './observability'

// Error severity levels
export const ErrorSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
}

// Error categories
export const ErrorCategory = {
  DATABASE: 'database',
  NETWORK: 'network',
  AUTH: 'auth',
  VALIDATION: 'validation',
  STORAGE: 'storage',
  SYNC: 'sync',
  GENERAL: 'general'
}

/**
 * Determine error category from error object
 */
function categorizeError(error) {
  const message = error?.message?.toLowerCase() || ''
  const code = error?.code?.toLowerCase() || ''

  if (message.includes('fetch') || message.includes('network') || message.includes('offline')) {
    return ErrorCategory.NETWORK
  }
  if (message.includes('auth') || message.includes('unauthorized') || code.includes('auth')) {
    return ErrorCategory.AUTH
  }
  if (message.includes('storage') || message.includes('bucket') || message.includes('upload')) {
    return ErrorCategory.STORAGE
  }
  if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return ErrorCategory.VALIDATION
  }
  if (message.includes('sync') || message.includes('conflict')) {
    return ErrorCategory.SYNC
  }
  if (error?.code || message.includes('database') || message.includes('supabase')) {
    return ErrorCategory.DATABASE
  }

  return ErrorCategory.GENERAL
}

/**
 * Get user-friendly error message
 */
function getUserMessage(error, category, context) {
  // Custom message provided
  if (context?.userMessage) {
    return context.userMessage
  }

  // Network errors
  if (category === ErrorCategory.NETWORK) {
    return 'Network connection issue. Your changes will sync when back online.'
  }

  // Auth errors
  if (category === ErrorCategory.AUTH) {
    return 'Session expired. Please sign in again.'
  }

  // Storage errors
  if (category === ErrorCategory.STORAGE) {
    return 'Failed to upload file. Please try again.'
  }

  // Validation errors - show actual message
  if (category === ErrorCategory.VALIDATION) {
    return error?.message || 'Please check your input and try again.'
  }

  // Sync errors
  if (category === ErrorCategory.SYNC) {
    return 'Sync conflict detected. Please refresh and try again.'
  }

  // Database/general errors with operation context
  if (context?.operation) {
    const operation = context.operation.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
    return `Failed to ${operation}. Please try again.`
  }

  return 'Something went wrong. Please try again.'
}

/**
 * Main error handler
 *
 * @param {Error} error - The error object
 * @param {Object} options - Error handling options
 * @param {string} options.operation - Name of the operation that failed
 * @param {string} options.category - Error category (auto-detected if not provided)
 * @param {string} options.severity - Error severity (default: 'error')
 * @param {Function} options.showToast - Toast function to show user feedback
 * @param {string} options.userMessage - Custom user-facing message
 * @param {string} options.companyId - Company ID for context
 * @param {string} options.projectId - Project ID for context
 * @param {string} options.userId - User ID for context
 * @param {boolean} options.silent - If true, don't show toast (still logs)
 * @param {boolean} options.rethrow - If true, rethrow the error after handling
 */
export function handleError(error, options = {}) {
  const {
    operation = 'unknown',
    category = categorizeError(error),
    severity = ErrorSeverity.ERROR,
    showToast,
    userMessage,
    companyId,
    projectId,
    userId,
    silent = false,
    rethrow = false
  } = options

  // Log to observability system
  observe.error(category, {
    message: error?.message || 'Unknown error',
    code: error?.code,
    severity,
    operation,
    company_id: companyId,
    project_id: projectId,
    user_id: userId,
    extra: {
      stack: error?.stack,
      name: error?.name
    }
  })

  // Show user feedback unless silent
  if (!silent && showToast) {
    const message = getUserMessage(error, category, { operation, userMessage })
    const toastType = severity === ErrorSeverity.WARNING ? 'warning' : 'error'
    showToast(message, toastType)
  }

  // Rethrow if requested
  if (rethrow) {
    throw error
  }

  return null
}

/**
 * Safe async wrapper - executes async function with error handling
 * Returns fallback value on error instead of throwing
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Options
 * @param {any} options.fallback - Value to return on error (default: null)
 * @param {Object} options.context - Context for error logging
 * @param {Function} options.showToast - Toast function
 * @param {boolean} options.silent - Don't show toast on error
 */
export async function safeAsync(fn, options = {}) {
  const { fallback = null, context = {}, showToast, silent = true } = options

  try {
    return await fn()
  } catch (error) {
    handleError(error, {
      ...context,
      showToast,
      silent
    })
    return fallback
  }
}

/**
 * Higher-order function to wrap async functions with error handling
 *
 * @param {Function} fn - Async function to wrap
 * @param {Object} defaultOptions - Default error handling options
 */
export function withErrorHandling(fn, defaultOptions = {}) {
  return async function(...args) {
    try {
      return await fn.apply(this, args)
    } catch (error) {
      handleError(error, defaultOptions)
      return defaultOptions.fallback ?? null
    }
  }
}

/**
 * Create a safe version of a database operation
 * Logs errors and returns fallback instead of throwing
 *
 * @param {string} operation - Operation name for logging
 * @param {any} fallback - Fallback value on error
 */
export function createSafeOperation(operation, fallback = null) {
  return (fn) => async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      observe.error(ErrorCategory.DATABASE, {
        message: error?.message || 'Unknown error',
        operation,
        severity: ErrorSeverity.ERROR
      })
      return fallback
    }
  }
}

/**
 * Batch multiple async operations with individual error handling
 * Returns results array with nulls for failed operations
 *
 * @param {Array<{fn: Function, fallback: any, context: Object}>} operations
 */
export async function safeBatch(operations) {
  return Promise.all(
    operations.map(({ fn, fallback = null, context = {} }) =>
      safeAsync(fn, { fallback, context, silent: true })
    )
  )
}

/**
 * Retry wrapper for flaky operations
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Max retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {Function} options.shouldRetry - Function to determine if error is retryable
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    shouldRetry = (error) => {
      const message = error?.message?.toLowerCase() || ''
      return message.includes('network') || message.includes('fetch') || message.includes('timeout')
    }
  } = options

  let lastError

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (!shouldRetry(error) || attempt === maxRetries - 1) {
        throw error
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export default {
  handleError,
  safeAsync,
  withErrorHandling,
  createSafeOperation,
  safeBatch,
  withRetry,
  ErrorSeverity,
  ErrorCategory
}
