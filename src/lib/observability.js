/**
 * FieldSync Observability Layer
 *
 * Vendor-agnostic metrics collection.
 * Works with Supabase now, can add DataDog/Grafana agents later.
 *
 * Usage:
 *   import { observe } from './observability'
 *
 *   // Track slow queries
 *   observe.query('getTMTickets', { duration: 234, rows: 50, company_id: 'uuid' })
 *
 *   // Track errors
 *   observe.error('database', { message: 'Connection failed', company_id: 'uuid' })
 */

import { supabase, isSupabaseConfigured } from './supabaseClient'

// Configuration
const CONFIG = {
  // Only log queries slower than this (ms)
  slowQueryThreshold: 200,

  // Enable console logging in development
  enableConsole: import.meta.env.DEV,

  // Enable Supabase logging only when configured (production)
  enableSupabase: isSupabaseConfigured,

  // Batch size for sending metrics (future optimization)
  batchSize: 10,
}

// Pending metrics queue (for future batching)
let pendingMetrics = []

/**
 * Main observability interface
 */
export const observe = {
  /**
   * Track database query performance
   *
   * @param {string} operation - Name of the operation (e.g., 'getTMTickets')
   * @param {object} context - Query context
   * @param {number} context.duration - Duration in milliseconds
   * @param {number} [context.rows] - Number of rows returned
   * @param {string} [context.company_id] - Company ID
   * @param {string} [context.project_id] - Project ID
   * @param {string} [context.user_id] - User ID
   */
  query(operation, context) {
    const event = {
      type: 'query',
      operation,
      duration_ms: context.duration,
      rows_returned: context.rows,
      company_id: context.company_id || null,
      project_id: context.project_id || null,
      user_id: context.user_id || null,
      timestamp: new Date().toISOString(),
    }

    // Console logging (dev only)
    if (CONFIG.enableConsole) {
      const icon = context.duration > CONFIG.slowQueryThreshold ? '🐢' : '⚡'
      console.log(`${icon} [query] ${operation}: ${context.duration}ms`,
        context.rows ? `(${context.rows} rows)` : '')
    }

    // Only log slow queries to Supabase to avoid noise
    if (CONFIG.enableSupabase && context.duration >= CONFIG.slowQueryThreshold) {
      logToSupabase('query', event)
    }
  },

  /**
   * Track errors with context
   *
   * @param {string} category - Error category ('database', 'storage', 'auth', 'network', 'sync')
   * @param {object} context - Error context
   * @param {string} context.message - Error message
   * @param {string} [context.code] - Error code
   * @param {string} [context.severity] - 'info', 'warning', 'error', 'critical'
   * @param {string} [context.company_id] - Company ID
   * @param {string} [context.user_id] - User ID
   * @param {string} [context.project_id] - Project ID
   * @param {string} [context.operation] - Operation that failed
   */
  error(category, context) {
    const event = {
      type: 'error',
      category,
      severity: context.severity || 'error',
      error_code: context.code || null,
      message: context.message,
      company_id: context.company_id || null,
      user_id: context.user_id || null,
      project_id: context.project_id || null,
      operation: context.operation || null,
      context: context.extra || {},
      timestamp: new Date().toISOString(),
    }

    // Always log errors to console
    const icon = {
      critical: '🔴',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    }[event.severity] || '❌'

    if (CONFIG.enableConsole) {
      console.error(`${icon} [${category}] ${context.message}`, context)
    }

    // Always log errors to Supabase
    if (CONFIG.enableSupabase) {
      logToSupabase('error', event)
    }
  },

  /**
   * Track storage operations
   *
   * @param {string} operation - 'upload', 'download', 'delete'
   * @param {object} context - Storage context
   */
  storage(operation, context) {
    const event = {
      type: 'storage',
      operation,
      company_id: context.company_id || null,
      project_id: context.project_id || null,
      file_size_bytes: context.size || 0,
      duration_ms: context.duration || 0,
      success: context.success !== false,
      error_message: context.error || null,
      timestamp: new Date().toISOString(),
    }

    if (CONFIG.enableConsole) {
      const icon = event.success ? '📁' : '❌'
      console.log(`${icon} [storage:${operation}] ${context.size ? Math.round(context.size / 1024) + 'KB' : ''}`,
        context.duration ? `${context.duration}ms` : '')
    }

    // Log failed uploads or slow uploads (>5s) to Supabase
    if (CONFIG.enableSupabase && (!event.success || event.duration_ms > 5000)) {
      logToSupabase('storage', event)
    }
  },

  /**
   * Track user activity (lightweight, for health scoring)
   *
   * @param {string} action - Action type
   * @param {object} context - Action context
   */
  activity(action, context) {
    // Only log in development for now
    if (CONFIG.enableConsole) {
      console.log(`📊 [activity] ${action}`, context)
    }
  },
}

/**
 * Send event to Supabase
 */
async function logToSupabase(type, event) {
  // Guard: Don't attempt to log if Supabase isn't configured
  if (!supabase) return

  try {
    if (type === 'error') {
      await supabase.rpc('log_error', {
        p_severity: event.severity,
        p_category: event.category,
        p_message: event.message,
        p_company_id: event.company_id,
        p_user_id: event.user_id,
        p_project_id: event.project_id,
        p_operation: event.operation,
        p_error_code: event.error_code,
        p_context: event.context || {},
      })
    } else if (type === 'query') {
      await supabase.rpc('log_query_metric', {
        p_operation: event.operation,
        p_duration_ms: event.duration_ms,
        p_rows_returned: event.rows_returned,
        p_company_id: event.company_id,
        p_project_id: event.project_id,
        p_user_id: event.user_id,
        p_context: {},
      })
    }
    // Storage metrics logged directly if needed
  } catch (err) {
    // Don't let observability errors break the app
    if (CONFIG.enableConsole) {
      console.warn('[observability] Failed to log to Supabase:', err.message)
    }
  }
}

/**
 * Helper: Wrap a database function with timing
 *
 * Usage:
 *   const getTMTickets = observe.wrapQuery('getTMTickets', async (projectId) => {
 *     // original implementation
 *   })
 */
observe.wrapQuery = function(operationName, fn) {
  return async function(...args) {
    const start = performance.now()
    try {
      const result = await fn.apply(this, args)
      const duration = Math.round(performance.now() - start)

      // Try to extract context from args or result
      const context = {
        duration,
        rows: Array.isArray(result) ? result.length : undefined,
      }

      observe.query(operationName, context)
      return result
    } catch (error) {
      const duration = Math.round(performance.now() - start)
      observe.error('database', {
        message: error.message,
        operation: operationName,
        severity: 'error',
        extra: { duration },
      })
      throw error
    }
  }
}

/**
 * Helper: Time a block of code
 *
 * Usage:
 *   const duration = await observe.time('loadDashboard', async () => {
 *     // code to time
 *   })
 */
observe.time = async function(operationName, fn) {
  const start = performance.now()
  try {
    const result = await fn()
    const duration = Math.round(performance.now() - start)
    observe.query(operationName, { duration })
    return result
  } catch (error) {
    observe.error('general', {
      message: error.message,
      operation: operationName,
    })
    throw error
  }
}

export default observe
