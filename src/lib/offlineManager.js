/**
 * FieldSync Offline Manager
 * Handles offline data storage, pending actions queue, and sync
 */

import { detectConflict, stampForOffline, buildConflictSummary, RESOLUTION_STRATEGIES } from './conflictDetection'

const DB_NAME = 'fieldsync-offline'
// v2: T&M tickets, daily reports, messages stores
// v3: pending_tm_tickets (offline T&M submit); clears the never-read tm_tickets store
const DB_VERSION = 3

// Store names
const STORES = {
  PROJECTS: 'projects',
  AREAS: 'areas',
  CREW_CHECKINS: 'crew_checkins',
  TM_TICKETS: 'tm_tickets',
  DAILY_REPORTS: 'daily_reports',
  MESSAGES: 'messages',
  PENDING_ACTIONS: 'pending_actions',
  PENDING_TM_TICKETS: 'pending_tm_tickets',
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

    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
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

      // Offline T&M submissions, one record per ticket (v3)
      if (!database.objectStoreNames.contains(STORES.PENDING_TM_TICKETS)) {
        const pendingTicketStore = database.createObjectStore(STORES.PENDING_TM_TICKETS, {
          keyPath: 'client_submission_id'
        })
        pendingTicketStore.createIndex('project_id', 'project_id', { unique: false })
        pendingTicketStore.createIndex('state', 'state', { unique: false })
      }

      // The v1/v2 tm_tickets store only ever held hollow temp tickets that
      // nothing read back; drop its contents on the way to v3.
      if (event.oldVersion > 0 && event.oldVersion < 3 &&
          database.objectStoreNames.contains(STORES.TM_TICKETS)) {
        event.target.transaction.objectStore(STORES.TM_TICKETS).clear()
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

// Cache projects for offline access. The project PIN (and its hash) is never
// written to the device: whoever holds the device could read it.
export const cacheProjects = async (projects) => {
  // eslint-disable-next-line no-unused-vars
  const safe = (projects || []).map(({ pin, pin_hash, ...rest }) => rest)
  return saveAllToStore(STORES.PROJECTS, safe)
}

// Stores that only hold copies of server data (safe to drop: they refill
// from the server). Pending actions and pending tickets are unsent work and
// are never cleared here.
const READ_CACHE_STORES = [
  STORES.PROJECTS, STORES.AREAS, STORES.CREW_CHECKINS, STORES.TM_TICKETS,
  STORES.DAILY_REPORTS, STORES.MESSAGES, STORES.CACHED_DATA
]

/**
 * Remove the copies of company data kept on this device for offline use
 * (projects, crews, tickets, reports, messages). Called when someone signs
 * out on purpose so the next person to pick up the device cannot read them.
 * Unsent tickets, actions and photos are kept so no work is lost. Never throws.
 */
export const clearOfflineCaches = async () => {
  try {
    await initOfflineDB()
    await withRetry(() => new Promise((resolve, reject) => {
      const names = READ_CACHE_STORES.filter(name => db.objectStoreNames.contains(name))
      if (names.length === 0) { resolve(); return }
      const tx = db.transaction(names, 'readwrite')
      names.forEach(name => tx.objectStore(name).clear())
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }))
  } catch (err) {
    console.warn('[offline] could not clear cached data:', err)
  }
  try {
    localStorage.removeItem('fieldsync_foreman_name')
  } catch (_e) {
    // storage unavailable
  }
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
// Generic cached data (key/value in the cached_data store)
// ============================================

// Cache any JSON-serializable value under `key` (e.g. labor classes for an
// offline resume of a T&M draft).
export const cacheData = async (key, data) => {
  return saveToStore(STORES.CACHED_DATA, {
    key,
    data,
    cached_at: new Date().toISOString()
  })
}

// Read a value written by cacheData; null when absent.
export const getCachedData = async (key) => {
  const record = await getFromStore(STORES.CACHED_DATA, key)
  return record ? record.data : null
}

// ============================================
// Pending T&M tickets (offline submit)
// ============================================
//
// One record per ticket, keyed by client_submission_id. State machine:
//   queued -> syncing -> synced -> (deleted)
//                   \-> needs_auth (session expired / no access; requeued on PIN login)
//                   \-> failed (server rejected; retried until MAX_TICKET_ATTEMPTS)
// The server RPC dedupes on client_submission_id, so a retried submit can
// never create a second ticket.

export const PENDING_TICKET_STATES = {
  QUEUED: 'queued',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  NEEDS_AUTH: 'needs_auth',
  FAILED: 'failed'
}

export const MAX_TICKET_ATTEMPTS = 10
const TICKET_SYNC_TIMEOUT_MS = 30000
const RETRY_DELAYS_MS = [5000, 15000, 45000]

// client_submission_id -> server ticket id for tickets synced (and deleted
// locally) during this page session, so a signature captured on the pending
// screen after the record is gone still reaches the right server row.
const recentlySyncedTickets = new Map()

// --- Sync event bus ---
const syncListeners = new Set()

/**
 * Subscribe to offline ticket sync events:
 *   { type: 'summary_changed' }
 *   { type: 'sync_start', count }
 *   { type: 'ticket_synced', client_submission_id, ticket }
 *   { type: 'session_expired', projectId, count }
 *   { type: 'sync_complete', synced, failed, remaining }
 * @returns {() => void} unsubscribe
 */
export const onSyncStateChange = (callback) => {
  syncListeners.add(callback)
  return () => { syncListeners.delete(callback) }
}

const emitSyncEvent = (event) => {
  syncListeners.forEach(callback => {
    try {
      callback(event)
    } catch (err) {
      console.error('[offlineSync] sync listener failed', err)
    }
  })
}

const emitSummaryChanged = () => emitSyncEvent({ type: 'summary_changed' })

// Read-modify-write one pending ticket inside a single readwrite transaction.
// `mutate(current)` returns { write?: record, result }.
const mutatePendingTicket = async (id, mutate) => {
  await initOfflineDB()
  return withRetry(() => new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_TM_TICKETS, 'readwrite')
    const store = tx.objectStore(STORES.PENDING_TM_TICKETS)
    let result
    let failure = null
    const getRequest = store.get(id)
    getRequest.onsuccess = () => {
      try {
        const outcome = mutate(getRequest.result)
        result = outcome.result
        if (outcome.write) store.put(outcome.write)
      } catch (err) {
        failure = err
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(failure || tx.error)
    tx.onabort = () => reject(failure || tx.error || new Error('Transaction aborted'))
  }))
}

/**
 * Save a ticket locally for later sync. Fills state 'queued', attempts 0 and
 * created_at when missing.
 * @returns {Promise<Object>} the stored record
 */
export const savePendingTMTicket = async (record) => {
  if (!record?.client_submission_id) {
    throw new Error('savePendingTMTicket: client_submission_id is required')
  }
  const stored = {
    project_id: record.payload?.project_id ?? null,
    company_id: null,
    last_error: null,
    server_ticket_id: null,
    signature: null,
    custom_field_data: {},
    cor_import: null,
    ...record,
    created_at: record.created_at || new Date().toISOString(),
    state: record.state || PENDING_TICKET_STATES.QUEUED,
    attempts: record.attempts ?? 0,
    photos: record.photos || []
  }
  await saveToStore(STORES.PENDING_TM_TICKETS, stored)
  emitSummaryChanged()
  return stored
}

export const getPendingTMTicket = async (id) => {
  const record = await getFromStore(STORES.PENDING_TM_TICKETS, id)
  return record || null
}

/** All pending tickets (optionally for one project), oldest first. */
export const getPendingTMTickets = async ({ projectId } = {}) => {
  const records = projectId
    ? await getByIndex(STORES.PENDING_TM_TICKETS, 'project_id', projectId)
    : await getAllFromStore(STORES.PENDING_TM_TICKETS)
  return records.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

/** Merge `patch` into a pending ticket in one transaction; null when absent. */
export const updatePendingTMTicket = async (id, patch) => {
  const updated = await mutatePendingTicket(id, (current) => {
    if (!current) return { result: null }
    const next = { ...current, ...patch }
    return { write: next, result: next }
  })
  if (updated) emitSummaryChanged()
  return updated
}

export const deletePendingTMTicket = async (id) => {
  await deleteFromStore(STORES.PENDING_TM_TICKETS, id)
  emitSummaryChanged()
}

/**
 * Attach the foreman signature to a pending ticket.
 * - Not yet synced: written into the record (one readwrite transaction);
 *   the sync applies it to the server row. Returns { saved: true }.
 * - Already synced: nothing is written; returns { synced: true, server_ticket_id }
 *   and the caller saves the signature to the server itself.
 */
export const attachSignatureToPendingTicket = async (id, signature) => {
  const outcome = await mutatePendingTicket(id, (current) => {
    if (!current) {
      if (recentlySyncedTickets.has(id)) {
        return { result: { synced: true, server_ticket_id: recentlySyncedTickets.get(id) } }
      }
      throw new Error('Pending ticket not found')
    }
    if (current.state === PENDING_TICKET_STATES.SYNCED) {
      return { result: { synced: true, server_ticket_id: current.server_ticket_id } }
    }
    return { write: { ...current, signature }, result: { saved: true } }
  })
  if (outcome?.saved) emitSummaryChanged()
  return outcome
}

/**
 * Counts for the field UI. Never throws: zeros when IndexedDB is unavailable.
 * 'syncing' includes records already synced but not yet cleaned up.
 */
export const getPendingSyncSummary = async ({ projectId } = {}) => {
  const summary = { queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 }
  try {
    const records = await getPendingTMTickets({ projectId })
    for (const record of records) {
      summary.total++
      switch (record.state) {
        case PENDING_TICKET_STATES.SYNCING:
        case PENDING_TICKET_STATES.SYNCED:
          summary.syncing++
          break
        case PENDING_TICKET_STATES.NEEDS_AUTH:
          summary.needs_auth++
          break
        case PENDING_TICKET_STATES.FAILED:
          summary.failed++
          break
        default:
          summary.queued++
      }
    }
  } catch {
    return { queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 }
  }
  return summary
}

/** After a PIN login: needs_auth -> queued for that project only. */
export const requeueNeedsAuthTickets = async (projectId) => {
  if (!projectId) return 0
  const records = await getPendingTMTickets({ projectId })
  let count = 0
  for (const record of records) {
    if (record.state === PENDING_TICKET_STATES.NEEDS_AUTH) {
      await updatePendingTMTicket(record.client_submission_id, {
        state: PENDING_TICKET_STATES.QUEUED,
        last_error: null
      })
      count++
    }
  }
  return count
}

/**
 * Classify a sync failure.
 * - 'auth': the session is gone or cannot access the project (retry after PIN login)
 * - 'network': the request never got an answer (retry later, no attempt counted)
 * - 'server': the server answered with a rejection (count an attempt)
 * @returns {'auth'|'network'|'server'}
 */
export const classifySyncError = (err) => {
  const code = err?.code == null ? '' : String(err.code)
  const message = String(err?.message || '')
  const name = String(err?.name || '')

  if (code === '42501' || code === 'PGRST301') return 'auth'
  if (/jwt/i.test(message) && /expired/i.test(message)) return 'auth'

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'network'
  if (name === 'AbortError' || name === 'TimeoutError') return 'network'
  if (!code && /failed to fetch|load failed|networkerror|network|abort|timeout|timed out/i.test(message)) {
    return 'network'
  }
  return 'server'
}

// --- Bounded retry for "online" events that fire before the radio routes ---
let ticketDrain = null
let retryIndex = 0
let retryTimer = null

/** Register the function scheduleRetry() calls (supabase.js drainPendingActions). */
export const registerTicketDrain = (fn) => {
  ticketDrain = typeof fn === 'function' ? fn : null
}

/**
 * Schedule one more drain with bounded backoff: 5 s, 15 s, 45 s, then stop
 * until a successful sync or a new online transition resets it.
 * @returns {boolean} whether a retry was scheduled
 */
export const scheduleRetry = () => {
  if (retryTimer || retryIndex >= RETRY_DELAYS_MS.length) return false
  const delay = RETRY_DELAYS_MS[retryIndex++]
  retryTimer = setTimeout(() => {
    retryTimer = null
    const drain = ticketDrain
    if (!drain) return
    Promise.resolve()
      .then(() => drain())
      .catch(err => console.error('[offlineSync] retry drain failed', err))
  }, delay)
  return true
}

const resetRetryBackoff = () => {
  retryIndex = 0
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
    // A fresh online transition earns a fresh set of ticket-sync retries.
    retryIndex = 0
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
// Pending T&M ticket sync
// ============================================

let ticketSyncInFlight = null

const isSyncEligible = (record) => {
  switch (record.state) {
    case PENDING_TICKET_STATES.QUEUED:
    case PENDING_TICKET_STATES.SYNCING: // left behind by a crash or app kill mid-sync
    case PENDING_TICKET_STATES.SYNCED: // synced but not yet cleaned up; the RPC replays
      return true
    case PENDING_TICKET_STATES.FAILED:
      return (record.attempts || 0) < MAX_TICKET_ATTEMPTS
    default:
      return false
  }
}

const errorMessage = (err) => err?.message || String(err)

// Best-effort follow-ups that the online submit path also treats as optional.
const applyTicketExtras = async (api, record, ticket) => {
  const customFields = record.custom_field_data
  if (customFields && typeof customFields === 'object' && Object.keys(customFields).length > 0) {
    try {
      await api.saveCustomFieldData(record.project_id, 'tm_ticket', ticket.id, customFields)
    } catch (err) {
      console.warn('[offlineSync] custom fields not saved for ticket', ticket.id, err)
    }
  }

  const corImport = record.cor_import
  if (corImport?.cor_id) {
    try {
      await api.importTicketDataToCOR(
        ticket.id,
        corImport.cor_id,
        corImport.company_id,
        corImport.work_type,
        corImport.job_type
      )
    } catch (err) {
      console.warn('[offlineSync] COR import failed for ticket', ticket.id, err)
      try {
        await api.markImportFailed(ticket.id, corImport.cor_id, errorMessage(err) || 'Import failed')
      } catch {
        // Non-critical: the office can re-import from the COR
      }
    }
  }
}

// Sync one record. Returns 'synced' | 'network' | 'auth' | 'server'.
const syncOneTicket = async (api, record) => {
  const id = record.client_submission_id
  try {
    await updatePendingTMTicket(id, { state: PENDING_TICKET_STATES.SYNCING })

    const ticket = await api.submitTMTicketFull(record, { timeoutMs: TICKET_SYNC_TIMEOUT_MS })
    if (!ticket?.id) throw new Error('Ticket sync returned no ticket')

    await updatePendingTMTicket(id, {
      state: PENDING_TICKET_STATES.SYNCED,
      server_ticket_id: ticket.id,
      last_error: null
    })
    recentlySyncedTickets.set(id, ticket.id)
    emitSyncEvent({ type: 'ticket_synced', client_submission_id: id, ticket })

    // A signature may have been attached while the RPC was in flight.
    const fresh = (await getPendingTMTicket(id)) || record
    if (fresh.signature && !ticket.foreman_signature_data) {
      await api.saveTMForemanSignature(ticket.id, fresh.signature)
    }

    // A replay means the first submit already ran these.
    if (!ticket.replayed) {
      await applyTicketExtras(api, fresh, ticket)
    }

    await deletePendingTMTicket(id)
    return 'synced'
  } catch (err) {
    const kind = classifySyncError(err)
    const patch = kind === 'network'
      ? { state: PENDING_TICKET_STATES.QUEUED, last_error: errorMessage(err) }
      : kind === 'auth'
        ? { state: PENDING_TICKET_STATES.NEEDS_AUTH, last_error: errorMessage(err) }
        : {
            state: PENDING_TICKET_STATES.FAILED,
            attempts: (record.attempts || 0) + 1,
            last_error: errorMessage(err)
          }
    try {
      await updatePendingTMTicket(id, patch)
    } catch (updateErr) {
      console.warn('[offlineSync] failed to record ticket sync outcome', id, updateErr)
    }
    return kind
  }
}

const runTicketSync = async (api, projectId) => {
  const results = { synced: 0, failed: 0, remaining: 0 }

  let records
  try {
    records = await getPendingTMTickets()
  } catch {
    return results // IndexedDB unavailable
  }

  const exhausted = records.filter(r =>
    r.state === PENDING_TICKET_STATES.FAILED && (r.attempts || 0) >= MAX_TICKET_ATTEMPTS
  ).length
  const eligible = records.filter(isSyncEligible)
  if (eligible.length === 0) {
    return { ...results, failed: exhausted, remaining: records.length }
  }

  emitSyncEvent({ type: 'sync_start', count: eligible.length })

  const processed = new Set()
  let authForProject = false
  let networkStop = false

  for (;;) {
    // Re-read each time so tickets saved mid-run are picked up.
    const current = await getPendingTMTickets()
    const record = current.find(r => isSyncEligible(r) && !processed.has(r.client_submission_id))
    if (!record) break
    processed.add(record.client_submission_id)

    const outcome = await syncOneTicket(api, record)
    if (outcome === 'synced') {
      results.synced++
      resetRetryBackoff()
    } else if (outcome === 'network') {
      networkStop = true
      break
    } else if (outcome === 'auth') {
      if (projectId && record.project_id === projectId) authForProject = true
    } else {
      results.failed++
    }
  }

  if (networkStop) scheduleRetry()

  let remaining = []
  try {
    remaining = await getPendingTMTickets()
  } catch {
    // ignore
  }

  if (authForProject) {
    const count = remaining.filter(r =>
      r.project_id === projectId && r.state === PENDING_TICKET_STATES.NEEDS_AUTH
    ).length
    emitSyncEvent({ type: 'session_expired', projectId, count })
  }

  results.failed += exhausted
  results.remaining = remaining.length
  emitSyncEvent({ type: 'sync_complete', ...results })
  return results
}

/**
 * Push locally saved T&M tickets to the server, one at a time, through
 * api.submitTMTicketFull (idempotent on client_submission_id).
 * Concurrent calls share the in-flight run.
 *
 * @param {Object} api - the db facade (submitTMTicketFull, saveTMForemanSignature,
 *   saveCustomFieldData, importTicketDataToCOR, markImportFailed)
 * @param {Object} [options]
 * @param {string|null} [options.projectId] - the signed-in field project; an auth
 *   failure on one of its tickets emits 'session_expired'
 * @returns {Promise<{synced: number, failed: number, remaining: number}>}
 */
export const syncPendingTMTickets = (api, { projectId = null } = {}) => {
  if (ticketSyncInFlight) return ticketSyncInFlight
  ticketSyncInFlight = runTicketSync(api, projectId).finally(() => {
    ticketSyncInFlight = null
  })
  return ticketSyncInFlight
}

// Export store names for external use
export { STORES }
