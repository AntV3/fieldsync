/**
 * Offline-First Database Wrapper
 * Wraps Supabase operations with offline support using IndexedDB
 */

import { db as supabaseDb, isSupabaseConfigured } from './supabase'
import { isOnline } from './networkStatus'
import { addToSyncQueue } from './syncQueue'
import {
  getUserContext,
  saveProject,
  getProject as getOfflineProject,
  getAllProjects,
  saveArea,
  getAreasByProject,
  saveTMTicket,
  getTMTicketsByProject,
  saveTMWorker,
  getTMWorkersByTicket,
  saveTMItem,
  getTMItemsByTicket,
  saveCrewCheckin,
  getCrewCheckinsByProject,
  saveDailyReport,
  getDailyReportsByProject,
  saveMaterialRequest,
  getMaterialRequestsByProject,
  saveMaterialEquipment,
  getAllMaterialsEquipment,
  savePhoto,
  getPhotosByTicket,
  STORES,
} from './offlineStorage'

/**
 * Generate a UUID for new records
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Add audit fields to data
 */
async function addAuditFields(data, isUpdate = false) {
  const userContext = await getUserContext()

  if (!userContext) {
    console.warn('No user context available for audit trail')
    return data
  }

  const auditData = { ...data }

  if (!isUpdate) {
    // Creating new record
    auditData.created_by_id = userContext.userId
    auditData.created_by_name = userContext.userName
    auditData.created_at = new Date().toISOString()
  }

  // Always update these on create or update
  auditData.updated_by_id = userContext.userId
  auditData.updated_by_name = userContext.userName
  auditData.updated_at = new Date().toISOString()

  return auditData
}

/**
 * Offline-enabled database operations
 */
export const offlineDb = {
  /**
   * Projects
   */
  async getProjects(companyId = null, includeArchived = false) {
    // Try online first, fallback to offline cache
    if (isOnline() && isSupabaseConfigured) {
      try {
        const projects = await supabaseDb.getProjects(companyId, includeArchived)

        // Cache projects offline
        for (const project of projects) {
          await saveProject(project)
        }

        return projects
      } catch (error) {
        console.warn('Failed to fetch projects online, using cache:', error)
      }
    }

    // Use offline cache
    const cached = await getAllProjects()
    return cached.filter(p => {
      if (companyId && p.company_id !== companyId) return false
      if (!includeArchived && p.status === 'archived') return false
      return true
    })
  },

  async getProject(id) {
    // Try online first
    if (isOnline() && isSupabaseConfigured) {
      try {
        const project = await supabaseDb.getProject(id)
        await saveProject(project)
        return project
      } catch (error) {
        console.warn('Failed to fetch project online, using cache:', error)
      }
    }

    // Use offline cache
    return getOfflineProject(id)
  },

  async createProject(project) {
    const id = generateId()
    const projectData = await addAuditFields({
      ...project,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Save offline first
    await saveProject(projectData)

    // If online, sync immediately
    if (isOnline() && isSupabaseConfigured) {
      try {
        const result = await supabaseDb.createProject(projectData)
        await saveProject(result) // Update with server version
        return result
      } catch (error) {
        console.warn('Failed to create project online, queued for sync:', error)
      }
    }

    // Queue for sync
    await addToSyncQueue({
      operation: 'CREATE',
      table: 'projects',
      data: projectData,
      priority: 1,
    })

    return projectData
  },

  async updateProject(id, updates) {
    const updatedData = await addAuditFields(updates, true)

    // Update offline first
    const existing = await getOfflineProject(id)
    if (existing) {
      const merged = { ...existing, ...updatedData }
      await saveProject(merged)
    }

    // If online, sync immediately
    if (isOnline() && isSupabaseConfigured) {
      try {
        const result = await supabaseDb.updateProject(id, updatedData)
        await saveProject(result)
        return result
      } catch (error) {
        console.warn('Failed to update project online, queued for sync:', error)
      }
    }

    // Queue for sync
    await addToSyncQueue({
      operation: 'UPDATE',
      table: 'projects',
      data: { id, ...updatedData },
      priority: 1,
    })

    return { ...existing, ...updatedData }
  },

  /**
   * Areas
   */
  async getAreas(projectId) {
    // Try online first
    if (isOnline() && isSupabaseConfigured) {
      try {
        const areas = await supabaseDb.getAreas(projectId)

        // Cache offline
        for (const area of areas) {
          await saveArea(area)
        }

        return areas
      } catch (error) {
        console.warn('Failed to fetch areas online, using cache:', error)
      }
    }

    // Use offline cache
    return getAreasByProject(projectId)
  },

  async updateAreaStatus(id, status) {
    const updatedData = await addAuditFields({ status }, true)

    // Update offline first
    const areas = await getAreasByProject('*') // Get all to find the one
    const area = areas.find(a => a.id === id)

    if (area) {
      const updated = { ...area, ...updatedData }
      await saveArea(updated)

      // If online, sync immediately
      if (isOnline() && isSupabaseConfigured) {
        try {
          await supabaseDb.updateAreaStatus(id, status)
          return updated
        } catch (error) {
          console.warn('Failed to update area online, queued for sync:', error)
        }
      }

      // Queue for sync
      await addToSyncQueue({
        operation: 'UPDATE',
        table: 'areas',
        data: { id, status },
        priority: 1,
        metadata: { project_id: area.project_id },
      })

      return updated
    }

    return null
  },

  /**
   * T&M Tickets (Offline-First)
   */
  async createTMTicket(ticket) {
    const id = generateId()
    const ticketData = await addAuditFields({
      ...ticket,
      id,
      status: 'pending',
      sync_status: 'pending',
      created_at: new Date().toISOString(),
    })

    // Save offline first (always)
    await saveTMTicket(ticketData)

    console.log('✅ T&M Ticket saved offline:', id)

    // If online, try to sync immediately
    if (isOnline() && isSupabaseConfigured) {
      try {
        const result = await supabaseDb.createTMTicket(ticketData)

        // Update sync status
        const synced = { ...ticketData, sync_status: 'synced' }
        await saveTMTicket(synced)

        console.log('✅ T&M Ticket synced to server:', id)
        return result
      } catch (error) {
        console.warn('Failed to sync T&M ticket immediately, queued:', error)
      }
    }

    // Queue for sync
    await addToSyncQueue({
      operation: 'CREATE',
      table: 't_and_m_tickets',
      data: ticketData,
      priority: 1,
      category: 'field_data',
      metadata: { project_id: ticket.project_id, ticket_id: id },
    })

    return ticketData
  },

  async addTMWorkers(ticketId, workers) {
    const savedWorkers = []

    for (const worker of workers) {
      const id = generateId()
      const workerData = {
        ...worker,
        id,
        ticket_id: ticketId,
        created_at: new Date().toISOString(),
      }

      await saveTMWorker(workerData)
      savedWorkers.push(workerData)

      // Queue for sync
      await addToSyncQueue({
        operation: 'CREATE',
        table: 't_and_m_workers',
        data: workerData,
        priority: 1,
        metadata: { ticket_id: ticketId },
      })
    }

    // If online, try to sync immediately
    if (isOnline() && isSupabaseConfigured) {
      try {
        await supabaseDb.addTMWorkers(ticketId, workers)
      } catch (error) {
        console.warn('Failed to sync workers immediately, queued:', error)
      }
    }

    return savedWorkers
  },

  async addTMItems(ticketId, items) {
    const savedItems = []

    for (const item of items) {
      const id = generateId()
      const itemData = {
        ...item,
        id,
        ticket_id: ticketId,
        created_at: new Date().toISOString(),
      }

      await saveTMItem(itemData)
      savedItems.push(itemData)

      // Queue for sync
      await addToSyncQueue({
        operation: 'CREATE',
        table: 't_and_m_items',
        data: itemData,
        priority: 1,
        metadata: { ticket_id: ticketId },
      })
    }

    // If online, try to sync immediately
    if (isOnline() && isSupabaseConfigured) {
      try {
        await supabaseDb.addTMItems(ticketId, items)
      } catch (error) {
        console.warn('Failed to sync items immediately, queued:', error)
      }
    }

    return savedItems
  },

  async getTMTickets(projectId) {
    // Try online first
    if (isOnline() && isSupabaseConfigured) {
      try {
        const tickets = await supabaseDb.getTMTickets(projectId)

        // Cache offline
        for (const ticket of tickets) {
          await saveTMTicket({ ...ticket, sync_status: 'synced' })

          // Cache workers
          if (ticket.workers) {
            for (const worker of ticket.workers) {
              await saveTMWorker(worker)
            }
          }

          // Cache items
          if (ticket.items) {
            for (const item of ticket.items) {
              await saveTMItem(item)
            }
          }
        }

        return tickets
      } catch (error) {
        console.warn('Failed to fetch T&M tickets online, using cache:', error)
      }
    }

    // Use offline cache and reconstruct full tickets
    const tickets = await getTMTicketsByProject(projectId)

    // Fetch workers and items for each ticket
    for (const ticket of tickets) {
      ticket.workers = await getTMWorkersByTicket(ticket.id)
      ticket.items = await getTMItemsByTicket(ticket.id)
    }

    return tickets
  },

  /**
   * Crew Check-ins (Offline-First)
   */
  async saveCrewCheckin(projectId, workers, createdBy, date) {
    const id = generateId()
    const checkinData = await addAuditFields({
      id,
      project_id: projectId,
      workers,
      created_by_name: createdBy,
      check_in_date: date || new Date().toISOString().split('T')[0],
      sync_status: 'pending',
      created_at: new Date().toISOString(),
    })

    // Save offline first
    await saveCrewCheckin(checkinData)

    // If online, try to sync
    if (isOnline() && isSupabaseConfigured) {
      try {
        await supabaseDb.saveCrewCheckin(projectId, workers, createdBy, date)
        const synced = { ...checkinData, sync_status: 'synced' }
        await saveCrewCheckin(synced)
        return synced
      } catch (error) {
        console.warn('Failed to sync crew check-in, queued:', error)
      }
    }

    // Queue for sync
    await addToSyncQueue({
      operation: 'CREATE',
      table: 'crew_checkins',
      data: checkinData,
      priority: 2,
      metadata: { project_id: projectId },
    })

    return checkinData
  },

  /**
   * Daily Reports (Offline-First)
   */
  async submitDailyReport(projectId, submittedBy, date) {
    // For offline, we'll compile what we have cached
    const reportData = await addAuditFields({
      id: generateId(),
      project_id: projectId,
      report_date: date,
      submitted_by_name: submittedBy,
      submitted_at: new Date().toISOString(),
      status: 'submitted',
      sync_status: 'pending',
    })

    // Save offline
    await saveDailyReport(reportData)

    // If online, sync immediately
    if (isOnline() && isSupabaseConfigured) {
      try {
        const result = await supabaseDb.submitDailyReport(projectId, submittedBy, date)
        await saveDailyReport({ ...reportData, sync_status: 'synced' })
        return result
      } catch (error) {
        console.warn('Failed to sync daily report, queued:', error)
      }
    }

    // Queue for sync
    await addToSyncQueue({
      operation: 'CREATE',
      table: 'daily_reports',
      data: reportData,
      priority: 2,
      metadata: { project_id: projectId },
    })

    return reportData
  },

  /**
   * Material Requests (Offline-First)
   */
  async createMaterialRequest(projectId, items, requestedBy, neededBy, priority, notes) {
    const requestData = await addAuditFields({
      id: generateId(),
      project_id: projectId,
      items,
      requested_by_name: requestedBy,
      needed_by: neededBy,
      priority,
      notes,
      status: 'pending',
      sync_status: 'pending',
      requested_at: new Date().toISOString(),
    })

    // Save offline
    await saveMaterialRequest(requestData)

    // If online, sync immediately
    if (isOnline() && isSupabaseConfigured) {
      try {
        const result = await supabaseDb.createMaterialRequest(
          projectId, items, requestedBy, neededBy, priority, notes
        )
        await saveMaterialRequest({ ...requestData, sync_status: 'synced' })
        return result
      } catch (error) {
        console.warn('Failed to sync material request, queued:', error)
      }
    }

    // Queue for sync
    await addToSyncQueue({
      operation: 'CREATE',
      table: 'material_requests',
      data: requestData,
      priority: 2,
      metadata: { project_id: projectId },
    })

    return requestData
  },

  /**
   * Materials/Equipment (Cache for offline use)
   */
  async getMaterialsEquipment(companyId) {
    // Try online first
    if (isOnline() && isSupabaseConfigured) {
      try {
        const items = await supabaseDb.getMaterialsEquipment(companyId)

        // Cache offline
        for (const item of items) {
          await saveMaterialEquipment(item)
        }

        return items
      } catch (error) {
        console.warn('Failed to fetch materials online, using cache:', error)
      }
    }

    // Use offline cache
    const cached = await getAllMaterialsEquipment()
    return cached.filter(item => !companyId || item.company_id === companyId)
  },

  /**
   * Photos (Offline-First with compression)
   */
  async saveOfflinePhoto(ticketId, compressedBase64, fileName) {
    const photoData = {
      id: generateId(),
      ticket_id: ticketId,
      base64: compressedBase64,
      fileName,
      upload_status: 'pending',
      created_at: new Date().toISOString(),
    }

    await savePhoto(photoData)

    // Queue for upload
    await addToSyncQueue({
      operation: 'UPLOAD_PHOTO',
      table: 'photos',
      data: photoData,
      priority: 3, // Lower priority for photos
      category: 'photos',
      metadata: { ticket_id: ticketId, photo_id: photoData.id },
    })

    return photoData
  },

  async getOfflinePhotos(ticketId) {
    return getPhotosByTicket(ticketId)
  },

  // Pass through to original supabase db for operations that don't need offline support
  ...supabaseDb,
}

export default offlineDb
