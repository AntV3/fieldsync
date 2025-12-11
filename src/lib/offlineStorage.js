/**
 * Offline Storage Layer using IndexedDB
 * Provides a local database for offline-first field operations
 */

import { openDB } from 'idb'

const DB_NAME = 'fieldsync-offline'
const DB_VERSION = 1

// IndexedDB store names
const STORES = {
  PROJECTS: 'projects',
  AREAS: 'areas',
  TM_TICKETS: 'tm_tickets',
  TM_WORKERS: 'tm_workers',
  TM_ITEMS: 'tm_items',
  CREW_CHECKINS: 'crew_checkins',
  DAILY_REPORTS: 'daily_reports',
  MATERIAL_REQUESTS: 'material_requests',
  MATERIALS_EQUIPMENT: 'materials_equipment',
  PHOTOS: 'photos', // Compressed photos pending upload
  SYNC_QUEUE: 'sync_queue',
  USER_CONTEXT: 'user_context', // Store current user info for audit trails
}

/**
 * Initialize IndexedDB database
 */
async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Create object stores if they don't exist

      // Projects store
      if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
        const projectStore = db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' })
        projectStore.createIndex('company_id', 'company_id')
        projectStore.createIndex('status', 'status')
      }

      // Areas store
      if (!db.objectStoreNames.contains(STORES.AREAS)) {
        const areaStore = db.createObjectStore(STORES.AREAS, { keyPath: 'id' })
        areaStore.createIndex('project_id', 'project_id')
        areaStore.createIndex('status', 'status')
      }

      // T&M Tickets store
      if (!db.objectStoreNames.contains(STORES.TM_TICKETS)) {
        const tmStore = db.createObjectStore(STORES.TM_TICKETS, { keyPath: 'id' })
        tmStore.createIndex('project_id', 'project_id')
        tmStore.createIndex('status', 'status')
        tmStore.createIndex('work_date', 'work_date')
        tmStore.createIndex('sync_status', 'sync_status') // 'synced', 'pending', 'failed'
      }

      // T&M Workers store
      if (!db.objectStoreNames.contains(STORES.TM_WORKERS)) {
        const workerStore = db.createObjectStore(STORES.TM_WORKERS, { keyPath: 'id' })
        workerStore.createIndex('ticket_id', 'ticket_id')
      }

      // T&M Items store
      if (!db.objectStoreNames.contains(STORES.TM_ITEMS)) {
        const itemStore = db.createObjectStore(STORES.TM_ITEMS, { keyPath: 'id' })
        itemStore.createIndex('ticket_id', 'ticket_id')
      }

      // Crew Check-ins store
      if (!db.objectStoreNames.contains(STORES.CREW_CHECKINS)) {
        const crewStore = db.createObjectStore(STORES.CREW_CHECKINS, { keyPath: 'id' })
        crewStore.createIndex('project_id', 'project_id')
        crewStore.createIndex('check_in_date', 'check_in_date')
        crewStore.createIndex('sync_status', 'sync_status')
      }

      // Daily Reports store
      if (!db.objectStoreNames.contains(STORES.DAILY_REPORTS)) {
        const reportStore = db.createObjectStore(STORES.DAILY_REPORTS, { keyPath: 'id' })
        reportStore.createIndex('project_id', 'project_id')
        reportStore.createIndex('report_date', 'report_date')
        reportStore.createIndex('sync_status', 'sync_status')
      }

      // Material Requests store
      if (!db.objectStoreNames.contains(STORES.MATERIAL_REQUESTS)) {
        const matStore = db.createObjectStore(STORES.MATERIAL_REQUESTS, { keyPath: 'id' })
        matStore.createIndex('project_id', 'project_id')
        matStore.createIndex('status', 'status')
        matStore.createIndex('sync_status', 'sync_status')
      }

      // Materials/Equipment master list store
      if (!db.objectStoreNames.contains(STORES.MATERIALS_EQUIPMENT)) {
        const equipStore = db.createObjectStore(STORES.MATERIALS_EQUIPMENT, { keyPath: 'id' })
        equipStore.createIndex('company_id', 'company_id')
        equipStore.createIndex('category', 'category')
      }

      // Photos store (compressed base64 photos pending upload)
      if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
        const photoStore = db.createObjectStore(STORES.PHOTOS, { keyPath: 'id' })
        photoStore.createIndex('ticket_id', 'ticket_id')
        photoStore.createIndex('upload_status', 'upload_status') // 'pending', 'uploading', 'uploaded', 'failed'
        photoStore.createIndex('created_at', 'created_at')
      }

      // Sync Queue store
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' })
        syncStore.createIndex('category', 'category') // 'field_data', 'photos'
        syncStore.createIndex('priority', 'priority') // 1=high, 2=medium, 3=low
        syncStore.createIndex('status', 'status') // 'pending', 'syncing', 'synced', 'failed'
        syncStore.createIndex('timestamp', 'timestamp')
      }

      // User Context store (for audit trails)
      if (!db.objectStoreNames.contains(STORES.USER_CONTEXT)) {
        db.createObjectStore(STORES.USER_CONTEXT, { keyPath: 'key' })
      }
    },
  })
}

// Singleton DB instance
let dbInstance = null

async function getDB() {
  if (!dbInstance) {
    dbInstance = await initDB()
  }
  return dbInstance
}

/**
 * Generic CRUD operations for offline storage
 */

// Create/Update
export async function saveToStore(storeName, data) {
  const db = await getDB()
  return db.put(storeName, data)
}

// Read one
export async function getFromStore(storeName, id) {
  const db = await getDB()
  return db.get(storeName, id)
}

// Read all
export async function getAllFromStore(storeName) {
  const db = await getDB()
  return db.getAll(storeName)
}

// Read by index
export async function getByIndex(storeName, indexName, value) {
  const db = await getDB()
  return db.getAllFromIndex(storeName, indexName, value)
}

// Delete
export async function deleteFromStore(storeName, id) {
  const db = await getDB()
  return db.delete(storeName, id)
}

// Clear entire store
export async function clearStore(storeName) {
  const db = await getDB()
  return db.clear(storeName)
}

/**
 * User Context Management (for audit trails)
 */

export async function setUserContext(userId, userName, userEmail, role = 'field') {
  const db = await getDB()
  return db.put(STORES.USER_CONTEXT, {
    key: 'current_user',
    userId,
    userName,
    userEmail,
    role,
    lastUpdated: new Date().toISOString(),
  })
}

export async function getUserContext() {
  const db = await getDB()
  const context = await db.get(STORES.USER_CONTEXT, 'current_user')
  return context || null
}

export async function clearUserContext() {
  const db = await getDB()
  return db.delete(STORES.USER_CONTEXT, 'current_user')
}

/**
 * Project-specific operations
 */

export async function saveProject(project) {
  return saveToStore(STORES.PROJECTS, {
    ...project,
    _cached_at: new Date().toISOString(),
  })
}

export async function getProject(projectId) {
  return getFromStore(STORES.PROJECTS, projectId)
}

export async function getAllProjects() {
  return getAllFromStore(STORES.PROJECTS)
}

export async function getProjectsByCompany(companyId) {
  return getByIndex(STORES.PROJECTS, 'company_id', companyId)
}

/**
 * Area operations
 */

export async function saveArea(area) {
  return saveToStore(STORES.AREAS, {
    ...area,
    _cached_at: new Date().toISOString(),
  })
}

export async function getAreasByProject(projectId) {
  return getByIndex(STORES.AREAS, 'project_id', projectId)
}

/**
 * T&M Ticket operations
 */

export async function saveTMTicket(ticket) {
  return saveToStore(STORES.TM_TICKETS, {
    ...ticket,
    sync_status: ticket.sync_status || 'pending',
    _cached_at: new Date().toISOString(),
  })
}

export async function getTMTicket(ticketId) {
  return getFromStore(STORES.TM_TICKETS, ticketId)
}

export async function getTMTicketsByProject(projectId) {
  return getByIndex(STORES.TM_TICKETS, 'project_id', projectId)
}

export async function getPendingTMTickets() {
  return getByIndex(STORES.TM_TICKETS, 'sync_status', 'pending')
}

/**
 * T&M Workers operations
 */

export async function saveTMWorker(worker) {
  return saveToStore(STORES.TM_WORKERS, worker)
}

export async function getTMWorkersByTicket(ticketId) {
  return getByIndex(STORES.TM_WORKERS, 'ticket_id', ticketId)
}

/**
 * T&M Items operations
 */

export async function saveTMItem(item) {
  return saveToStore(STORES.TM_ITEMS, item)
}

export async function getTMItemsByTicket(ticketId) {
  return getByIndex(STORES.TM_ITEMS, 'ticket_id', ticketId)
}

/**
 * Crew Check-in operations
 */

export async function saveCrewCheckin(checkin) {
  return saveToStore(STORES.CREW_CHECKINS, {
    ...checkin,
    sync_status: checkin.sync_status || 'pending',
    _cached_at: new Date().toISOString(),
  })
}

export async function getCrewCheckinsByProject(projectId) {
  return getByIndex(STORES.CREW_CHECKINS, 'project_id', projectId)
}

/**
 * Daily Report operations
 */

export async function saveDailyReport(report) {
  return saveToStore(STORES.DAILY_REPORTS, {
    ...report,
    sync_status: report.sync_status || 'pending',
    _cached_at: new Date().toISOString(),
  })
}

export async function getDailyReportsByProject(projectId) {
  return getByIndex(STORES.DAILY_REPORTS, 'project_id', projectId)
}

/**
 * Material Request operations
 */

export async function saveMaterialRequest(request) {
  return saveToStore(STORES.MATERIAL_REQUESTS, {
    ...request,
    sync_status: request.sync_status || 'pending',
    _cached_at: new Date().toISOString(),
  })
}

export async function getMaterialRequestsByProject(projectId) {
  return getByIndex(STORES.MATERIAL_REQUESTS, 'project_id', projectId)
}

/**
 * Materials/Equipment operations
 */

export async function saveMaterialEquipment(item) {
  return saveToStore(STORES.MATERIALS_EQUIPMENT, {
    ...item,
    _cached_at: new Date().toISOString(),
  })
}

export async function getAllMaterialsEquipment() {
  return getAllFromStore(STORES.MATERIALS_EQUIPMENT)
}

export async function getMaterialsEquipmentByCompany(companyId) {
  return getByIndex(STORES.MATERIALS_EQUIPMENT, 'company_id', companyId)
}

/**
 * Photo operations (compressed photos pending upload)
 */

export async function savePhoto(photo) {
  return saveToStore(STORES.PHOTOS, {
    ...photo,
    upload_status: photo.upload_status || 'pending',
    created_at: photo.created_at || new Date().toISOString(),
  })
}

export async function getPhotosByTicket(ticketId) {
  return getByIndex(STORES.PHOTOS, 'ticket_id', ticketId)
}

export async function getPendingPhotos() {
  return getByIndex(STORES.PHOTOS, 'upload_status', 'pending')
}

export async function updatePhotoStatus(photoId, status) {
  const photo = await getFromStore(STORES.PHOTOS, photoId)
  if (photo) {
    photo.upload_status = status
    if (status === 'uploaded') {
      photo.uploaded_at = new Date().toISOString()
    }
    return saveToStore(STORES.PHOTOS, photo)
  }
}

export async function deletePhoto(photoId) {
  return deleteFromStore(STORES.PHOTOS, photoId)
}

/**
 * Clear all offline data (for logout or reset)
 */
export async function clearAllOfflineData() {
  const db = await getDB()
  const storeNames = Object.values(STORES)

  for (const storeName of storeNames) {
    await db.clear(storeName)
  }
}

/**
 * Get offline storage stats
 */
export async function getStorageStats() {
  const stats = {}

  for (const [key, storeName] of Object.entries(STORES)) {
    const count = (await getAllFromStore(storeName)).length
    stats[key] = count
  }

  return stats
}

export { STORES }
