/**
 * FieldSync Offline Manager
 * Handles offline data storage, pending actions queue, and sync
 */

import { detectConflict, stampForOffline, buildConflictSummary, RESOLUTION_STRATEGIES } from './conflictDetection'

const DB_NAME = 'fieldsync-offline'
const DB_VERSION = 2  // Bumped to add T&M tickets, daily reports, messages stores

// Store names
const STORES = {
  PROJECTS: 'projects',
  AREAS: 'areas',
  CREW_CHECKINS: 'crew_checkins',
  TM_TICKETS: 'tm_tickets',
  DAILY_REPORTS: 'daily_reports',
  MESSAGES: 'messages',
  PENDING_ACTIONS: 'pending_actions',
  CACHED_DATA: 'cached_data'
}

let db = null

// Reset the cached connection so the next operation re-opens the database
const resetConnection = () => {
  db = null
}

// Initialize IndexedDB
export const initOfflineDB = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('Failed to open offline database')
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result

      // If the browser closes the connection (e.g. storage pressure), clear
      // the cached reference so the next operation will re-open.
      db.onclose = resetConnection

      // If another tab opens a newer version, close gracefully and reset so
      // the next call to initOfflineDB() will re-open at the new version.
      db.onversionchange = () => {
        db.close()
        resetConnection()
      }

      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = event.target.result

      // Projects store
      if (!database.objectStoreNames.contains(STORES.PROJECTS)) {
        const projectStore = database.createObjectStore(STORES.PROJECTS, { keyPath: 'id' })
        projectStore.createIndex('company_id', 'company_id', { unique: false })
      }

      // Areas store
      if (!database.objectStoreNames.contains(STORES.AREAS)) {
        const areaStore = database.createObjectStore(STORES.AREAS, { keyPath: 'id' })
        areaStore.createIndex('project_id', 'project_id', { unique: false })
      }

      // Crew checkins store
      if (!database.objectStoreNames.contains(STORES.CREW_CHECKINS)) {
        const checkinStore = database.createObjectStore(STORES.CREW_CHECKINS, { keyPath: 'id' })
        checkinStore.createIndex('project_id', 'project_id', { unique: false })
      }

      // T&M tickets store (for offline creation)
      if (!database.objectStoreNames.contains(STORES.TM_TICKETS)) {
        const ticketStore = database.createObjectStore(STORES.TM_TICKETS, { keyPath: 'id' })
        ticketStore.createIndex('project_id', 'project_id', { unique: false })
      }

      // Daily reports store
      if (!database.objectStoreNames.contains(STORES.DAILY_REPORTS)) {
        const reportStore = database.createObjectStore(STORES.DAILY_REPORTS, { keyPath: 'id' })
        reportStore.createIndex('project_id', 'project_id', { unique: false })
      }

      // Messages store
      if (!database.objectStoreNames.contains(STORES.MESSAGES)) {
        const messageStore = database.createObjectStore(STORES.MESSAGES, { keyPath: 'id' })
        messageStore.createIndex('project_id', 'project_id', { unique: false })
      }

      // Pending actions queue - for offline submissions
      if (!database.objectStoreNames.contains(STORES.PENDING_ACTIONS)) {
        const pendingStore = database.createObjectStore(STORES.PENDING_ACTIONS, {
          keyPath: 'id',
          autoIncrement: true
        })
        pendingStore.createIndex('type', 'type', { unique: false })
        pendingStore.createIndex('created_at', 'created_at', { unique: false })
      }

      // Generic cached data store
      if (!database.objectStoreNames.contains(STORES.CACHED_DATA)) {
        database.createObjectStore(STORES.CACHED_DATA, { keyPath: 'key' })
      }
    }
  })
}

// Generic store operations
const getStore = (storeName, mode = 'readonly') => {
  if (!db) throw new Error('Database not initialized')
  const tx = db.transaction(storeName, mode)
  return tx.objectStore(storeName)
}

// Retry helper: if the IDB connection was closed between init and use,
// reset and re-open once, then retry the operation.
const withRetry = async (operation) => {
  try {
    return await operation()
  } catch (err) {
    if (err?.name === 'InvalidStateError') {
      resetConnection()
      await initOfflineDB()
      return await operation()
    }
    throw err
  }
}

// Save item to store
export const saveToStore = async (storeName, data) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const store = getStore(storeName, 'readwrite')
    const request = store.put(data)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

// Save multiple items to store
export const saveAllToStore = async (storeName, items) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)

    items.forEach(item => store.put(item))

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

// Get item from store
export const getFromStore = async (storeName, key) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const store = getStore(storeName)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

// Get all items from store
export const getAllFromStore = async (storeName) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const store = getStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  }))
}

// Get items by index
export const getByIndex = async (storeName, indexName, value) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const store = getStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(value)
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  }))
}

// Delete item from store
export const deleteFromStore = async (storeName, key) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const store = getStore(storeName, 'readwrite')
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  }))
}

// Clear entire store
export const clearStore = async (storeName) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const store = getStore(storeName, 'readwrite')
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  }))
}

// ============================================
// Pending Actions Queue
// ============================================

export const ACTION_TYPES = {
  UPDATE_AREA_STATUS: 'UPDATE_AREA_STATUS',
  CREATE_TM_TICKET: 'CREATE_TM_TICKET',
  SAVE_CREW_CHECKIN: 'SAVE_CREW_CHECKIN',
  SUBMIT_DAILY_REPORT: 'SUBMIT_DAILY_REPORT',
  SEND_MESSAGE: 'SEND_MESSAGE'
}

// Add action to pending queue with idempotency key to prevent double-replay
export const addPendingAction = async (type, payload, metadata = {}) => {
  await initOfflineDB()
  const action = {
    type,
    payload,
    metadata,
    idempotency_key: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null
  }

  return withRetry(() => new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_ACTIONS, 'readwrite')
    const request = store.add(action)
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  }))
}

// Get all pending actions
export const getPendingActions = async () => {
  return getAllFromStore(STORES.PENDING_ACTIONS)
}

// Get pending action count
export const getPendingActionCount = async () => {
  const actions = await getPendingActions()
  return actions.length
}

// Remove completed action
export const removePendingAction = async (id) => {
  return deleteFromStore(STORES.PENDING_ACTIONS, id)
}

// Update action after failed attempt
export const updatePendingAction = async (id, updates) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_ACTIONS, 'readwrite')
    const getRequest = store.get(id)

    getRequest.onsuccess = () => {
      const action = getRequest.result
      if (action) {
        const updated = { ...action, ...updates }
        const putRequest = store.put(updated)
        putRequest.onsuccess = () => resolve(updated)
        putRequest.onerror = () => reject(putRequest.error)
      } else {
        reject(new Error('Action not found'))
      }
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

// ============================================
// Project & Area Caching
// ============================================

// Cache projects for offline access
export const cacheProjects = async (projects) => {
  return saveAllToStore(STORES.PROJECTS, projects)
}

// Get cached projects
export const getCachedProjects = async (companyId) => {
  if (companyId) {
    return getByIndex(STORES.PROJECTS, 'company_id', companyId)
  }
  return getAllFromStore(STORES.PROJECTS)
}

// Cache areas for a project (stamped for conflict detection)
export const cacheAreas = async (areas) => {
  const stamped = areas.map(a => stampForOffline(a, ['status', 'weight', 'name']))
  return saveAllToStore(STORES.AREAS, stamped)
}

// Get cached areas for a project
export const getCachedAreas = async (projectId) => {
  return getByIndex(STORES.AREAS, 'project_id', projectId)
}

// Update cached area status (optimistic update with offline tracking)
export const updateCachedAreaStatus = async (areaId, status) => {
  const area = await getFromStore(STORES.AREAS, areaId)
  if (area) {
    area.status = status
    area.updated_at = new Date().toISOString()
    area._offlineModifiedAt = new Date().toISOString()
    await saveToStore(STORES.AREAS, area)
  }
  return area
}

// Cache crew checkin
export const cacheCrewCheckin = async (checkin) => {
  return saveToStore(STORES.CREW_CHECKINS, checkin)
}

// Get cached crew checkin
export const getCachedCrewCheckin = async (projectId) => {
  const checkins = await getByIndex(STORES.CREW_CHECKINS, 'project_id', projectId)
  // Return the most recent one for today
  const today = new Date().toISOString().split('T')[0]
  return checkins.find(c => c.check_in_date === today) || null
}

// ============================================
// T&M Ticket Caching
// ============================================

// Cache a T&M ticket (for optimistic UI during offline creation)
export const cacheTMTicket = async (ticket) => {
  return saveToStore(STORES.TM_TICKETS, ticket)
}

// Get cached T&M tickets for a project
export const getCachedTMTickets = async (projectId) => {
  return getByIndex(STORES.TM_TICKETS, 'project_id', projectId)
}

// Generate a temporary ID for offline-created tickets
export const generateTempId = () => {
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  const randomPart = Array.from(array, b => b.toString(36)).join('')
  return `temp_${Date.now()}_${randomPart}`
}

// ============================================
// Daily Report Caching
// ============================================

// Cache a daily report
export const cacheDailyReport = async (report) => {
  return saveToStore(STORES.DAILY_REPORTS, report)
}

// Get cached daily report for project/date
export const getCachedDailyReport = async (projectId, date) => {
  const reports = await getByIndex(STORES.DAILY_REPORTS, 'project_id', projectId)
  return reports.find(r => r.report_date === date) || null
}

// ============================================
// Message Caching
// ============================================

// Cache a message (for optimistic UI)
export const cacheMessage = async (message) => {
  return saveToStore(STORES.MESSAGES, message)
}

// Get cached messages for a project
export const getCachedMessages = async (projectId) => {
  return getByIndex(STORES.MESSAGES, 'project_id', projectId)
}

// ============================================
// Connection Status
// ============================================

// Guard for SSR/test environments where navigator is undefined
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
const listeners = new Set()

// Subscribe to connection changes
export const onConnectionChange = (callback) => {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

// Get current connection status
export const getConnectionStatus = () => isOnline

// Notify all listeners of connection change
const notifyConnectionChange = (online) => {
  isOnline = online
  listeners.forEach(callback => callback(online))
}

// Set up connection listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyConnectionChange(true)
  })

  window.addEventListener('offline', () => {
    notifyConnectionChange(false)
  })
}

// ============================================
// Sync Manager
// ============================================

let isSyncing = false
const MAX_ACTION_RETRIES = 10

// Check if an idempotency key was already synced (prevents double-replay after crash)
const wasAlreadySynced = async (idempotencyKey) => {
  if (!idempotencyKey) return false
  try {
    const record = await getFromStore(STORES.CACHED_DATA, `synced_${idempotencyKey}`)
    return !!record
  } catch {
    return false
  }
}

// Mark an idempotency key as synced
const markAsSynced = async (idempotencyKey) => {
  if (!idempotencyKey) return
  try {
    await saveToStore(STORES.CACHED_DATA, {
      key: `synced_${idempotencyKey}`,
      synced_at: new Date().toISOString()
    })
  } catch {
    // Non-critical — worst case we replay once more
  }
}

// Clear a synced marker (used when processAction fails after markAsSynced)
const clearSyncedMarker = async (idempotencyKey) => {
  if (!idempotencyKey) return
  try {
    await deleteFromStore(STORES.CACHED_DATA, `synced_${idempotencyKey}`)
  } catch {
    // Non-critical
  }
}

// Process pending actions queue with conflict detection
// Batches non-conflicting create actions in parallel for faster sync
export const syncPendingActions = async (db, options = {}) => {
  if (isSyncing || !isOnline) return { synced: 0, failed: 0, conflicts: [] }

  const { onConflict } = options
  isSyncing = true
  const results = { synced: 0, failed: 0, conflicts: [] }

  try {
    const actions = await getPendingActions()

    // Separate actions that need conflict detection (updates) from safe-to-batch (creates)
    const updateActions = []
    const createActions = []
    for (const action of actions) {
      if (action.type === ACTION_TYPES.UPDATE_AREA_STATUS) {
        updateActions.push(action)
      } else {
        createActions.push(action)
      }
    }

    // Process update actions sequentially (need conflict detection)
    for (const action of updateActions) {
      try {
        // Skip actions that exceeded max retries
        if ((action.attempts || 0) >= MAX_ACTION_RETRIES) {
          results.failed++
          continue
        }

        if (action.idempotency_key && await wasAlreadySynced(action.idempotency_key)) {
          await removePendingAction(action.id)
          results.synced++
          continue
        }

        // Check for conflicts on update actions
        if (action.payload?.id || action.payload?.areaId) {
          const serverRecord = await fetchServerRecord(db, action.type, action.payload)
          if (serverRecord) {
            const cachedRecord = await getFromStore(STORES.AREAS, action.payload.areaId || action.payload.id)
            if (cachedRecord) {
              const conflict = detectConflict(cachedRecord, serverRecord, ['status'])
              if (conflict.hasConflict) {
                const summary = buildConflictSummary(conflict, 'area')
                results.conflicts.push({ action, conflict, summary })

                if (onConflict) {
                  const resolution = await onConflict({ action, conflict, summary })
                  if (resolution === RESOLUTION_STRATEGIES.KEEP_SERVER) {
                    await removePendingAction(action.id)
                    continue
                  }
                }
              }
            }
          }
        }

        // Mark as synced BEFORE processing to prevent double-replay on crash.
        // If processAction fails, the action is still in the queue (removePendingAction
        // hasn't been called), but the idempotency key prevents re-processing on retry.
        if (action.idempotency_key) {
          await markAsSynced(action.idempotency_key)
        }
        await processAction(action, db)
        await removePendingAction(action.id)
        results.synced++
      } catch (error) {
        results.failed++
        // If we marked as synced but processAction failed, clear the synced marker
        // so the action can be retried on the next sync cycle.
        if (action.idempotency_key) {
          await clearSyncedMarker(action.idempotency_key).catch(markerErr =>
            console.warn('[offlineSync] failed to clear synced marker', action.id, markerErr)
          )
        }
        await updatePendingAction(action.id, {
          attempts: (action.attempts || 0) + 1,
          last_error: error.message,
          last_attempt: new Date().toISOString()
        }).catch(updateErr =>
          console.warn('[offlineSync] failed to record retry metadata', action.id, updateErr)
        )
      }
    }

    // Batch create actions in parallel (no conflict risk, 3-5x faster sync)
    if (createActions.length > 0) {
      // Filter out actions that exceeded max retries
      const retryableActions = createActions.filter(a => (a.attempts || 0) < MAX_ACTION_RETRIES)
      results.failed += createActions.length - retryableActions.length

      // Process in batches of 5 to avoid overwhelming the server
      const BATCH_SIZE = 5
      for (let i = 0; i < retryableActions.length; i += BATCH_SIZE) {
        const batch = retryableActions.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.allSettled(
          batch.map(async (action) => {
            if (action.idempotency_key && await wasAlreadySynced(action.idempotency_key)) {
              await removePendingAction(action.id)
              return { status: 'skipped' }
            }
            await processAction(action, db)
            // Mark as synced BEFORE removing from queue to prevent orphaned actions on crash
            await markAsSynced(action.idempotency_key)
            await removePendingAction(action.id)
            return { status: 'synced' }
          })
        )

        for (let j = 0; j < batchResults.length; j++) {
          if (batchResults[j].status === 'fulfilled') {
            results.synced++
          } else {
            results.failed++
            const action = batch[j]
            await updatePendingAction(action.id, {
              attempts: (action.attempts || 0) + 1,
              last_error: batchResults[j].reason?.message || 'Unknown error',
              last_attempt: new Date().toISOString()
            }).catch(updateErr =>
              console.warn('[offlineSync] failed to record batch retry metadata', action.id, updateErr)
            )
          }
        }
      }
    }
  } finally {
    isSyncing = false
  }

  return results
}

// Fetch a server record for conflict comparison
const fetchServerRecord = async (db, actionType, payload) => {
  try {
    switch (actionType) {
      case ACTION_TYPES.UPDATE_AREA_STATUS:
        return db.getArea ? await db.getArea(payload.areaId) : null
      default:
        return null
    }
  } catch {
    return null
  }
}

// Process individual action
const processAction = async (action, db) => {
  const { type, payload } = action

  switch (type) {
    case ACTION_TYPES.UPDATE_AREA_STATUS:
      return db.updateAreaStatus(payload.areaId, payload.status)

    case ACTION_TYPES.CREATE_TM_TICKET: {
      // Complex action - create ticket, upload photos, add workers/items
      const ticket = await db.createTMTicket(payload.ticket)
      if (payload.workers?.length > 0) {
        await db.addTMWorkers(ticket.id, payload.workers)
      }
      if (payload.items?.length > 0) {
        await db.addTMItems(ticket.id, payload.items)
      }
      // Note: Photos would need separate handling
      return ticket
    }

    case ACTION_TYPES.SAVE_CREW_CHECKIN:
      return db.saveCrewCheckin(
        payload.projectId,
        payload.workers,
        payload.checkInDate
      )

    case ACTION_TYPES.SUBMIT_DAILY_REPORT:
      await db.saveDailyReport(payload.projectId, payload.reportData)
      return db.submitDailyReport(payload.projectId, payload.submittedBy)

    case ACTION_TYPES.SEND_MESSAGE:
      return db.sendMessage(
        payload.projectId,
        payload.senderType,
        payload.senderName,
        payload.content
      )

    default:
      throw new Error(`Unknown action type: ${type}`)
  }
}

// ============================================
// Cached Data Helpers
// ============================================

// Save generic cached data with key
export const setCachedData = async (key, data) => {
  return saveToStore(STORES.CACHED_DATA, { key, data, cached_at: new Date().toISOString() })
}

// Get generic cached data by key
export const getCachedData = async (key) => {
  const result = await getFromStore(STORES.CACHED_DATA, key)
  return result?.data || null
}

// Export store names for external use
export { STORES }
