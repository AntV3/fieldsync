/**
 * FieldSync Offline Manager
 * Handles offline data storage, pending actions queue, and sync
 */

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

// Save item to store
export const saveToStore = async (storeName, data) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const store = getStore(storeName, 'readwrite')
    const request = store.put(data)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Save multiple items to store
export const saveAllToStore = async (storeName, items) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)

    items.forEach(item => store.put(item))

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Get item from store
export const getFromStore = async (storeName, key) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const store = getStore(storeName)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Get all items from store
export const getAllFromStore = async (storeName) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const store = getStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// Get items by index
export const getByIndex = async (storeName, indexName, value) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const store = getStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(value)
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

// Delete item from store
export const deleteFromStore = async (storeName, key) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const store = getStore(storeName, 'readwrite')
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Clear entire store
export const clearStore = async (storeName) => {
  await initOfflineDB()
  return new Promise((resolve, reject) => {
    const store = getStore(storeName, 'readwrite')
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// ============================================
// Pending Actions Queue
// ============================================

export const ACTION_TYPES = {
  UPDATE_AREA_STATUS: 'UPDATE_AREA_STATUS',
  CREATE_TM_TICKET: 'CREATE_TM_TICKET',
  SAVE_CREW_CHECKIN: 'SAVE_CREW_CHECKIN',
  SUBMIT_DAILY_REPORT: 'SUBMIT_DAILY_REPORT',
  SEND_MESSAGE: 'SEND_MESSAGE',
  CREATE_MATERIAL_REQUEST: 'CREATE_MATERIAL_REQUEST'
}

// Add action to pending queue
export const addPendingAction = async (type, payload, metadata = {}) => {
  await initOfflineDB()
  const action = {
    type,
    payload,
    metadata,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null
  }

  return new Promise((resolve, reject) => {
    const store = getStore(STORES.PENDING_ACTIONS, 'readwrite')
    const request = store.add(action)
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
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

// Cache areas for a project
export const cacheAreas = async (areas) => {
  return saveAllToStore(STORES.AREAS, areas)
}

// Get cached areas for a project
export const getCachedAreas = async (projectId) => {
  return getByIndex(STORES.AREAS, 'project_id', projectId)
}

// Update cached area status (optimistic update)
export const updateCachedAreaStatus = async (areaId, status) => {
  const area = await getFromStore(STORES.AREAS, areaId)
  if (area) {
    area.status = status
    area.updated_at = new Date().toISOString()
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

// Process pending actions queue
export const syncPendingActions = async (db) => {
  if (isSyncing || !isOnline) return { synced: 0, failed: 0 }

  isSyncing = true
  const results = { synced: 0, failed: 0 }

  try {
    const actions = await getPendingActions()

    for (const action of actions) {
      try {
        await processAction(action, db)
        await removePendingAction(action.id)
        results.synced++
      } catch (error) {
        console.error(`Failed to sync action ${action.type}:`, error)
        results.failed++

        // Update attempt count
        await updatePendingAction(action.id, {
          attempts: (action.attempts || 0) + 1,
          last_error: error.message,
          last_attempt: new Date().toISOString()
        })
      }
    }
  } finally {
    isSyncing = false
  }

  return results
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

    case ACTION_TYPES.CREATE_MATERIAL_REQUEST:
      return db.createMaterialRequest(
        payload.projectId,
        payload.items,
        payload.requestedBy,
        payload.neededBy,
        payload.priority,
        payload.notes
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
