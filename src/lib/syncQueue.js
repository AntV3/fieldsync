/**
 * Sync Queue Manager
 * Manages offline operations queue and synchronization with Supabase
 */

import { v4 as uuidv4 } from 'crypto'
import { saveToStore, getAllFromStore, getByIndex, deleteFromStore, STORES } from './offlineStorage'

// Generate UUID (fallback if crypto.randomUUID not available)
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Add operation to sync queue
 */
export async function addToSyncQueue({
  operation, // 'CREATE', 'UPDATE', 'DELETE'
  table,     // Table name (e.g., 't_and_m_tickets')
  data,      // Data to sync
  category = 'field_data', // 'field_data', 'photos'
  priority = 2, // 1=high, 2=medium, 3=low
  metadata = {}, // Additional metadata (e.g., ticket_id, project_id)
}) {
  const queueItem = {
    id: generateId(),
    operation,
    table,
    data,
    category,
    priority,
    metadata,
    status: 'pending',
    timestamp: new Date().toISOString(),
    retries: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  }

  await saveToStore(STORES.SYNC_QUEUE, queueItem)
  return queueItem
}

/**
 * Get all pending sync operations
 */
export async function getPendingSyncOperations() {
  const pending = await getByIndex(STORES.SYNC_QUEUE, 'status', 'pending')
  const failed = await getByIndex(STORES.SYNC_QUEUE, 'status', 'failed')

  // Combine and sort by priority (1=high first), then timestamp
  return [...pending, ...failed].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    return new Date(a.timestamp) - new Date(b.timestamp)
  })
}

/**
 * Get sync queue count
 */
export async function getSyncQueueCount() {
  const pending = await getPendingSyncOperations()
  return pending.length
}

/**
 * Update sync operation status
 */
export async function updateSyncStatus(operationId, status, error = null) {
  const db = await import('./offlineStorage').then(m => m.getDB?.() || m.default?.getDB?.())
  if (!db) return

  const operation = await db.get(STORES.SYNC_QUEUE, operationId)
  if (!operation) return

  operation.status = status
  operation.lastError = error

  if (status === 'failed') {
    operation.retries = (operation.retries || 0) + 1
    operation.lastFailedAt = new Date().toISOString()
  }

  if (status === 'synced') {
    operation.syncedAt = new Date().toISOString()
  }

  await saveToStore(STORES.SYNC_QUEUE, operation)
  return operation
}

/**
 * Remove synced operation from queue
 */
export async function removeSyncedOperation(operationId) {
  return deleteFromStore(STORES.SYNC_QUEUE, operationId)
}

/**
 * Clear all synced operations from queue
 */
export async function clearSyncedOperations() {
  const synced = await getByIndex(STORES.SYNC_QUEUE, 'status', 'synced')
  for (const op of synced) {
    await deleteFromStore(STORES.SYNC_QUEUE, op.id)
  }
  return synced.length
}

/**
 * Retry failed operations (with max retries limit)
 */
export async function getRetryableOperations(maxRetries = 5) {
  const failed = await getByIndex(STORES.SYNC_QUEUE, 'status', 'failed')
  return failed.filter(op => op.retries < maxRetries)
}

/**
 * Get sync queue statistics
 */
export async function getSyncQueueStats() {
  const all = await getAllFromStore(STORES.SYNC_QUEUE)

  const stats = {
    total: all.length,
    pending: all.filter(op => op.status === 'pending').length,
    syncing: all.filter(op => op.status === 'syncing').length,
    synced: all.filter(op => op.status === 'synced').length,
    failed: all.filter(op => op.status === 'failed').length,
    byCategory: {},
    byPriority: {},
    oldestPending: null,
  }

  // Group by category
  all.forEach(op => {
    stats.byCategory[op.category] = (stats.byCategory[op.category] || 0) + 1
    stats.byPriority[op.priority] = (stats.byPriority[op.priority] || 0) + 1
  })

  // Find oldest pending
  const pending = all.filter(op => op.status === 'pending')
  if (pending.length > 0) {
    stats.oldestPending = pending.sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    )[0]
  }

  return stats
}

/**
 * Execute sync operation with the actual database
 */
export async function executeSyncOperation(operation, db) {
  const { table, data, operation: op } = operation

  try {
    switch (op) {
      case 'CREATE': {
        // Use the appropriate db method based on table
        if (table === 't_and_m_tickets') {
          const result = await db.createTMTicket(data)
          return result
        } else if (table === 't_and_m_workers') {
          const result = await db.addTMWorkers(data.ticket_id, [data])
          return result
        } else if (table === 't_and_m_items') {
          const result = await db.addTMItems(data.ticket_id, [data])
          return result
        } else if (table === 'crew_checkins') {
          const result = await db.saveCrewCheckin(
            data.project_id,
            data.workers,
            data.created_by,
            data.check_in_date
          )
          return result
        } else if (table === 'daily_reports') {
          const result = await db.submitDailyReport(
            data.project_id,
            data.submitted_by,
            data.report_date
          )
          return result
        } else if (table === 'material_requests') {
          const result = await db.createMaterialRequest(
            data.project_id,
            data.items,
            data.requested_by,
            data.needed_by,
            data.priority,
            data.notes
          )
          return result
        }
        break
      }

      case 'UPDATE': {
        if (table === 'areas') {
          const result = await db.updateAreaStatus(data.id, data.status)
          return result
        } else if (table === 't_and_m_tickets') {
          // Update photos or other ticket data
          if (data.photos) {
            const result = await db.updateTMTicketPhotos(data.id, data.photos)
            return result
          }
        }
        break
      }

      case 'DELETE': {
        // Handle delete operations if needed
        break
      }

      default:
        throw new Error(`Unknown operation: ${op}`)
    }
  } catch (error) {
    throw error
  }
}

/**
 * Sync all pending operations
 * Returns { synced: number, failed: number, errors: [] }
 */
export async function syncAllPending(db, onProgress = null) {
  const pending = await getPendingSyncOperations()

  const results = {
    total: pending.length,
    synced: 0,
    failed: 0,
    errors: [],
  }

  for (let i = 0; i < pending.length; i++) {
    const operation = pending[i]

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: pending.length,
        operation,
      })
    }

    try {
      // Mark as syncing
      await updateSyncStatus(operation.id, 'syncing')

      // Execute the sync operation
      await executeSyncOperation(operation, db)

      // Mark as synced
      await updateSyncStatus(operation.id, 'synced')

      // Remove from queue
      await removeSyncedOperation(operation.id)

      results.synced++
    } catch (error) {
      console.error('Sync failed for operation:', operation.id, error)

      // Mark as failed
      await updateSyncStatus(operation.id, 'failed', error.message)

      results.failed++
      results.errors.push({
        operationId: operation.id,
        error: error.message,
        operation,
      })
    }
  }

  return results
}

/**
 * Exponential backoff calculator for retries
 */
export function calculateBackoff(retryCount, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  return Math.round(delay + jitter)
}

/**
 * Auto-sync with retry logic
 */
export async function autoSync(db, options = {}) {
  const {
    maxRetries = 3,
    onProgress = null,
    onComplete = null,
    onError = null,
  } = options

  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const results = await syncAllPending(db, onProgress)

      if (onComplete) {
        onComplete(results)
      }

      // If all succeeded, we're done
      if (results.failed === 0) {
        return results
      }

      // If some failed, retry after backoff
      if (attempt < maxRetries - 1) {
        const delay = calculateBackoff(attempt)
        console.log(`Sync partially failed. Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      attempt++
    } catch (error) {
      console.error('Auto-sync error:', error)

      if (onError) {
        onError(error)
      }

      if (attempt < maxRetries - 1) {
        const delay = calculateBackoff(attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      attempt++
    }
  }

  return null
}
