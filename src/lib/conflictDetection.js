/**
 * FieldSync Offline Conflict Detection
 *
 * Detects and reports conflicts when syncing offline changes
 * back to the server. Uses timestamp-based comparison with
 * user notification instead of silent last-write-wins.
 */

/**
 * Compare a local (offline) record with the server version
 * to detect if a conflict exists.
 *
 * @param {object} localRecord - The locally modified record
 * @param {object} serverRecord - The current server version
 * @param {string[]} compareFields - Fields to check for conflicts
 * @returns {object} Conflict result
 */
export function detectConflict(localRecord, serverRecord, compareFields = []) {
  if (!localRecord || !serverRecord) {
    return { hasConflict: false, conflicts: [] }
  }

  // If server record was updated after the local change was made offline,
  // someone else modified it while we were offline
  const localModifiedAt = new Date(localRecord._offlineModifiedAt || localRecord.updated_at || 0)
  const serverUpdatedAt = new Date(serverRecord.updated_at || 0)
  const localCachedAt = new Date(localRecord._cachedAt || 0)

  // No conflict if server hasn't changed since we cached it
  if (serverUpdatedAt <= localCachedAt) {
    return { hasConflict: false, conflicts: [] }
  }

  // Server was modified after we cached — check specific fields
  const conflicts = []
  const fieldsToCheck = compareFields.length > 0
    ? compareFields
    : Object.keys(localRecord).filter(k => !k.startsWith('_') && k !== 'id' && k !== 'created_at')

  for (const field of fieldsToCheck) {
    const localVal = localRecord[field]
    const serverVal = serverRecord[field]

    if (localVal !== undefined && serverVal !== undefined && !deepEqual(localVal, serverVal)) {
      // Check if the local value was actually changed from the cached version
      const cachedVal = localRecord._cachedValues?.[field]
      const localChanged = cachedVal !== undefined ? !deepEqual(localVal, cachedVal) : true
      const serverChanged = cachedVal !== undefined ? !deepEqual(serverVal, cachedVal) : true

      if (localChanged && serverChanged) {
        conflicts.push({
          field,
          localValue: localVal,
          serverValue: serverVal,
          cachedValue: cachedVal
        })
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    localModifiedAt,
    serverUpdatedAt
  }
}

/**
 * Simple deep equality check for JSON-serializable values
 */
function deepEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  return keysA.every(key => deepEqual(a[key], b[key]))
}

/**
 * Resolution strategies for conflicts
 */
export const RESOLUTION_STRATEGIES = {
  KEEP_LOCAL: 'keep_local',
  KEEP_SERVER: 'keep_server',
  MERGE: 'merge'
}

/**
 * Apply a conflict resolution to a record
 *
 * @param {object} localRecord - The local version
 * @param {object} serverRecord - The server version
 * @param {string} strategy - Resolution strategy
 * @param {object} manualMerge - Manual field selections (for MERGE strategy)
 * @returns {object} The resolved record
 */
export function resolveConflict(localRecord, serverRecord, strategy, manualMerge = {}) {
  switch (strategy) {
    case RESOLUTION_STRATEGIES.KEEP_LOCAL:
      return { ...localRecord, _resolved: true, _resolvedAt: new Date().toISOString() }

    case RESOLUTION_STRATEGIES.KEEP_SERVER:
      return { ...serverRecord, _resolved: true, _resolvedAt: new Date().toISOString() }

    case RESOLUTION_STRATEGIES.MERGE: {
      const merged = { ...serverRecord }
      for (const [field, source] of Object.entries(manualMerge)) {
        if (source === 'local') {
          merged[field] = localRecord[field]
        }
        // 'server' is default (already in merged)
      }
      merged._resolved = true
      merged._resolvedAt = new Date().toISOString()
      return merged
    }

    default:
      return serverRecord
  }
}

/**
 * Batch conflict detection for a set of pending actions
 *
 * @param {Array} pendingActions - Actions queued offline
 * @param {Function} fetchServerRecord - Async function to fetch server version by (type, id)
 * @returns {Array} Array of { action, conflict } objects
 */
export async function detectBatchConflicts(pendingActions, fetchServerRecord) {
  const results = []

  for (const action of pendingActions) {
    const recordId = action.payload?.id
    if (!recordId) {
      // New records (creates) can't have conflicts
      results.push({ action, conflict: { hasConflict: false, conflicts: [] } })
      continue
    }

    try {
      const serverRecord = await fetchServerRecord(action.type, recordId)
      if (!serverRecord) {
        // Record was deleted on server
        results.push({
          action,
          conflict: {
            hasConflict: true,
            conflicts: [{ field: '_deleted', localValue: action.payload, serverValue: null }],
            deletedOnServer: true
          }
        })
        continue
      }

      const conflict = detectConflict(action.payload, serverRecord)
      results.push({ action, conflict })
    } catch {
      // Can't fetch server record — skip conflict check, will retry on next sync
      results.push({ action, conflict: { hasConflict: false, conflicts: [], error: true } })
    }
  }

  return results
}

/**
 * Stamp a record with offline metadata before caching.
 * This enables conflict detection when syncing back.
 *
 * @param {object} record - The record to stamp
 * @param {string[]} trackFields - Fields to track for conflict detection
 * @returns {object} Stamped record
 */
export function stampForOffline(record, trackFields = []) {
  const stamped = {
    ...record,
    _cachedAt: new Date().toISOString()
  }

  if (trackFields.length > 0) {
    stamped._cachedValues = {}
    for (const field of trackFields) {
      if (record[field] !== undefined) {
        stamped._cachedValues[field] = JSON.parse(JSON.stringify(record[field]))
      }
    }
  }

  return stamped
}

/**
 * Build a human-readable conflict summary
 *
 * @param {object} conflictResult - Result from detectConflict
 * @param {string} recordType - 'area', 'ticket', 'report', etc.
 * @returns {object} Summary for display
 */
export function buildConflictSummary(conflictResult, recordType = 'record') {
  if (!conflictResult.hasConflict) {
    return null
  }

  if (conflictResult.deletedOnServer) {
    return {
      title: `${capitalize(recordType)} was deleted`,
      description: `This ${recordType} was deleted by another user while you were offline.`,
      severity: 'warning',
      conflictCount: 1
    }
  }

  const fieldNames = conflictResult.conflicts.map(c => c.field).join(', ')
  return {
    title: `${capitalize(recordType)} was modified`,
    description: `The following fields were changed by another user: ${fieldNames}`,
    severity: conflictResult.conflicts.length > 2 ? 'warning' : 'info',
    conflictCount: conflictResult.conflicts.length,
    fields: conflictResult.conflicts
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
