/**
 * T&M Tickets and Photos operations.
 * Extracted from supabase.js for modularity.
 */

import {
  supabase, isSupabaseConfigured,
  observe,
  getClient, getFieldClient, getSupabaseClient,
  isFieldMode, getFieldProjectId, getFieldCompanyId,
  getConnectionStatus,
  cacheTMTicket, getCachedTMTickets,
  addPendingAction, ACTION_TYPES,
  generateTempId,
  getLocalData, setLocalData, validateAmount, sanitize, sanitizeFormData
} from './client'

export const tmOps = {
  // ============================================
  // T&M Tickets
  // ============================================

  async getTMTickets(projectId) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      const client = getClient()
      const inFieldMode = isFieldMode()

      // SECURITY: Exclude cost_per_unit for field users to protect pricing data
      const materialsSelect = inFieldMode
        ? 'materials_equipment (name, unit, category)' // No cost_per_unit for field users
        : 'materials_equipment (name, unit, cost_per_unit, category)' // Full data for office

      try {
        const { data, error } = await client
          .from('t_and_m_tickets')
          .select(`
            *,
            t_and_m_workers (*),
            t_and_m_items (
              *,
              ${materialsSelect}
            )
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })

        const duration = Math.round(performance.now() - start)
        observe.query('getTMTickets', { duration, rows: data?.length, project_id: projectId })

        if (error) throw error
        return data
      } catch (error) {
        observe.error('database', {
          message: error.message,
          operation: 'getTMTickets',
          project_id: projectId
        })
        throw error
      }
    }
    return []
  },

  // Get T&M tickets with pagination for scalability
  async getTMTicketsPaginated(projectId, { page = 0, limit = 25, status = null } = {}) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      const client = getClient()
      const inFieldMode = isFieldMode()

      // SECURITY: Exclude cost_per_unit for field users to protect pricing data
      const materialsSelect = inFieldMode
        ? 'materials_equipment (name, unit, category)'
        : 'materials_equipment (name, unit, cost_per_unit, category)'

      try {
        let query = client
          .from('t_and_m_tickets')
          .select(`
            *,
            t_and_m_workers (*),
            t_and_m_items (
              *,
              ${materialsSelect}
            )
          `, { count: 'exact' })
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1)

        if (status) {
          query = query.eq('status', status)
        }

        const { data, error, count } = await query

        const duration = Math.round(performance.now() - start)
        observe.query('getTMTicketsPaginated', { duration, rows: data?.length, page, project_id: projectId })

        if (error) throw error

        return {
          tickets: data || [],
          totalCount: count || 0,
          hasMore: (page + 1) * limit < (count || 0),
          page,
          limit
        }
      } catch (error) {
        observe.error('database', {
          message: error.message,
          operation: 'getTMTicketsPaginated',
          project_id: projectId
        })
        throw error
      }
    }
    return { tickets: [], totalCount: 0, hasMore: false, page: 0, limit: 25 }
  },

  // Get change order totals for a project
  async getChangeOrderTotals(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('t_and_m_tickets')
        .select('ce_pco_number, change_order_value, status')
        .eq('project_id', projectId)
        .not('ce_pco_number', 'is', null)
        .neq('ce_pco_number', '')

      if (error) throw error

      // Group by CE/PCO number
      const changeOrders = {}
      let totalApproved = 0
      let totalPending = 0

      data?.forEach(ticket => {
        const ceNumber = ticket.ce_pco_number
        if (!changeOrders[ceNumber]) {
          changeOrders[ceNumber] = { approved: 0, pending: 0, count: 0 }
        }
        changeOrders[ceNumber].count++

        if (ticket.status === 'approved' || ticket.status === 'billed') {
          const value = parseFloat(ticket.change_order_value) || 0
          changeOrders[ceNumber].approved += value
          totalApproved += value
        } else if (ticket.status === 'pending') {
          totalPending++
        }
      })

      return {
        changeOrders,
        totalApprovedValue: totalApproved,
        pendingCount: totalPending
      }
    }
    return { changeOrders: {}, totalApprovedValue: 0, pendingCount: 0 }
  },

  // Get T&M tickets for a specific date (lightweight query for field status checks)
  // Only fetches minimal columns needed for counting/display, not full ticket data
  async getTMTicketsByDate(projectId, date) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []

      const { data, error } = await client
        .from('t_and_m_tickets')
        .select('id, work_date, status, created_at')
        .eq('project_id', projectId)
        .eq('work_date', date)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }
    return []
  },

  async getTMTicketsByStatus(projectId, status) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []

      const { data, error } = await client
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (name, unit, cost_per_unit, category)
          )
        `)
        .eq('project_id', projectId)
        .eq('status', status)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    return []
  },

  // Get T&M tickets associated with a COR (for backup documentation)
  async getCORTickets(corId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []

      const { data, error } = await client
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (name, unit, cost_per_unit, category)
          )
        `)
        .eq('assigned_cor_id', corId)
        .order('work_date', { ascending: true })
      if (error) throw error
      return data || []
    }
    return []
  },

  async createTMTicket(ticket) {
    if (isSupabaseConfigured) {
      // If offline, cache ticket and queue action
      if (!getConnectionStatus()) {
        const tempTicket = {
          id: generateTempId(),
          project_id: ticket.project_id,
          work_date: ticket.work_date,
          ce_pco_number: ticket.ce_pco_number || null,
          assigned_cor_id: ticket.assigned_cor_id || null,
          notes: ticket.notes,
          photos: ticket.photos || [],
          status: 'pending_sync',
          created_by_name: ticket.created_by_name || 'Field User',
          created_at: new Date().toISOString(),
          _offline: true
        }
        await cacheTMTicket(tempTicket)
        await addPendingAction(ACTION_TYPES.CREATE_TM_TICKET, {
          ticket: tempTicket,
          workers: ticket._workers || [],
          items: ticket._items || []
        })
        return tempTicket
      }

      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .insert({
          project_id: ticket.project_id,
          work_date: ticket.work_date,
          ce_pco_number: sanitize.text(ticket.ce_pco_number) || null,
          assigned_cor_id: ticket.assigned_cor_id || null,
          notes: sanitize.text(ticket.notes),
          photos: ticket.photos || [],
          status: 'pending',
          created_by_name: sanitize.text(ticket.created_by_name) || 'Field User'
        })
        .select()
        .single()

      if (error) {
        // If network error, queue for later
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          const tempTicket = {
            id: generateTempId(),
            ...ticket,
            status: 'pending_sync',
            _offline: true
          }
          await cacheTMTicket(tempTicket)
          await addPendingAction(ACTION_TYPES.CREATE_TM_TICKET, {
            ticket: tempTicket,
            workers: ticket._workers || [],
            items: ticket._items || []
          })
          return tempTicket
        }
        throw error
      }
      return data
    }
    return null
  },

  async addTMWorkers(ticketId, workers) {
    if (isSupabaseConfigured) {
      const workersData = workers.map(w => ({
        ticket_id: ticketId,
        name: sanitize.text(w.name),
        hours: w.hours,
        overtime_hours: w.overtime_hours || 0,
        time_started: w.time_started || null,
        time_ended: w.time_ended || null,
        role: sanitize.text(w.role || 'Laborer'),
        labor_class_id: w.labor_class_id || null
      }))
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { error } = await client
        .from('t_and_m_workers')
        .insert(workersData)
      if (error) throw error
    }
  },

  async addTMItems(ticketId, items) {
    if (isSupabaseConfigured) {
      const itemsData = items.map(item => ({
        ticket_id: ticketId,
        material_equipment_id: item.material_equipment_id || null,
        custom_name: item.custom_name ? sanitize.text(item.custom_name) : null,
        custom_category: item.custom_category ? sanitize.text(item.custom_category) : null,
        quantity: item.quantity
      }))
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { error } = await client
        .from('t_and_m_items')
        .insert(itemsData)
      if (error) throw error
    }
  },

  // Get the most recent ticket's crew for "Same as Yesterday" feature
  async getPreviousTicketCrew(projectId, beforeDate) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) return null

    // Find the most recent ticket on or before the given date
    // Use lte so users can copy from an earlier ticket created on the same day
    const { data: ticket, error } = await client
      .from('t_and_m_tickets')
      .select(`
        id,
        work_date,
        t_and_m_workers (*)
      `)
      .eq('project_id', projectId)
      .lte('work_date', beforeDate)
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !ticket) return null

    // Group workers by role
    const workers = ticket.t_and_m_workers || []

    // Check if any workers have labor_class_id (indicates custom labor classes)
    const hasCustomClasses = workers.some(w => w.labor_class_id)

    // Build dynamic workers structure for custom labor classes
    const dynamicWorkers = {}
    if (hasCustomClasses) {
      workers.forEach(w => {
        if (w.labor_class_id) {
          if (!dynamicWorkers[w.labor_class_id]) {
            dynamicWorkers[w.labor_class_id] = []
          }
          dynamicWorkers[w.labor_class_id].push({
            name: w.name,
            hours: w.hours?.toString() || '',
            overtimeHours: w.overtime_hours?.toString() || '',
            timeStarted: w.time_started || '',
            timeEnded: w.time_ended || ''
          })
        }
      })
    }

    // Build legacy worker arrays
    const supervision = workers
      .filter(w => ['Foreman', 'General Foreman', 'Superintendent'].includes(w.role))
      .map(w => ({
        name: w.name,
        hours: w.hours?.toString() || '',
        overtimeHours: w.overtime_hours?.toString() || '',
        timeStarted: w.time_started || '',
        timeEnded: w.time_ended || '',
        role: w.role
      }))

    const operators = workers
      .filter(w => w.role === 'Operator')
      .map(w => ({
        name: w.name,
        hours: w.hours?.toString() || '',
        overtimeHours: w.overtime_hours?.toString() || '',
        timeStarted: w.time_started || '',
        timeEnded: w.time_ended || ''
      }))

    const laborers = workers
      .filter(w => w.role === 'Laborer')
      .map(w => ({
        name: w.name,
        hours: w.hours?.toString() || '',
        overtimeHours: w.overtime_hours?.toString() || '',
        timeStarted: w.time_started || '',
        timeEnded: w.time_ended || ''
      }))

    return {
      workDate: ticket.work_date,
      supervision: supervision.length > 0 ? supervision : null,
      operators: operators.length > 0 ? operators : null,
      laborers: laborers.length > 0 ? laborers : null,
      dynamicWorkers: Object.keys(dynamicWorkers).length > 0 ? dynamicWorkers : null,
      totalWorkers: workers.length
    }
  },

  async updateTMTicketStatus(ticketId, status) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({ status })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Approve T&M ticket (with certification and optional change order value)
  async approveTMTicket(ticketId, userId, userName, changeOrderValue = null) {
    if (isSupabaseConfigured) {
      const updateData = {
        status: 'approved',
        approved_by_user_id: userId,
        approved_by_name: userName,
        approved_at: new Date().toISOString(),
        // Clear any previous rejection
        rejected_by_user_id: null,
        rejected_by_name: null,
        rejected_at: null,
        rejection_reason: null
      }

      // Add change order value if provided (for tickets with CE/PCO)
      if (changeOrderValue !== null) {
        updateData.change_order_value = parseFloat(changeOrderValue) || 0
      }

      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Reject T&M ticket (with reason)
  async rejectTMTicket(ticketId, userId, userName, reason = '') {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({
          status: 'rejected',
          rejected_by_user_id: userId,
          rejected_by_name: userName,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
          // Clear any previous approval
          approved_by_user_id: null,
          approved_by_name: null,
          approved_at: null
        })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateTMTicketPhotos(ticketId, photos, photoLocations = null) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const updateData = { photos }
      if (photoLocations) {
        updateData.photo_locations = photoLocations
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Save foreman signature directly to T&M ticket (on-site signing before client)
  async saveTMForemanSignature(ticketId, signatureData) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({
          foreman_signature_data: signatureData.signature,
          foreman_signature_name: signatureData.signerName,
          foreman_signature_title: signatureData.signerTitle,
          foreman_signature_date: signatureData.signedAt,
          status: 'foreman_signed' // Update status to indicate foreman has signed
        })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Save client signature directly to T&M ticket (on-site signing)
  async saveTMClientSignature(ticketId, signatureData) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({
          client_signature_data: signatureData.signature,
          client_signature_name: signatureData.signerName,
          client_signature_title: signatureData.signerTitle,
          client_signature_company: signatureData.signerCompany,
          client_signature_date: signatureData.signedAt,
          client_signature_ip: null, // Not available in on-site signing
          status: 'client_signed' // Update status to indicate client has signed
        })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteTMTicket(ticketId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      // Workers and items cascade delete automatically
      const { error } = await client
        .from('t_and_m_tickets')
        .delete()
        .eq('id', ticketId)
      if (error) throw error
    }
  },

  // Check if a T&M ticket can be edited
  // Tickets are locked once their associated COR is approved/billed/closed
  async isTicketEditable(ticket) {
    // If no assigned COR, ticket is editable
    if (!ticket?.assigned_cor_id) {
      return { editable: true }
    }

    if (isSupabaseConfigured) {
      try {
        const { data: cor, error } = await supabase
          .from('change_orders')
          .select('id, status, cor_number')
          .eq('id', ticket.assigned_cor_id)
          .single()

        if (error || !cor) {
          // COR not found - allow editing
          return { editable: true }
        }

        // Only draft and pending_approval CORs allow ticket editing
        const editableStatuses = ['draft', 'pending_approval']
        const isEditable = editableStatuses.includes(cor.status)

        return {
          editable: isEditable,
          lockedBy: isEditable ? null : cor,
          reason: isEditable ? null : `This ticket is linked to ${cor.cor_number} which has been ${cor.status === 'approved' ? 'approved' : cor.status}`
        }
      } catch (err) {
        console.error('Error checking ticket editability:', err)
        // On error, allow editing to avoid blocking users
        return { editable: true }
      }
    }

    return { editable: true }
  },

  // ============================================
  // Photos
  // ============================================

  async uploadPhoto(companyId, projectId, ticketId, file) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const start = performance.now()
    const fileSize = file.size || 0

    // Create unique filename with secure random ID
    const timestamp = Date.now()
    const array = new Uint8Array(6)
    crypto.getRandomValues(array)
    const randomId = Array.from(array, b => b.toString(36)).join('')
    const extension = file.name?.split('.').pop() || 'jpg'
    const fileName = `${timestamp}-${randomId}.${extension}`

    // Path: company/project/ticket/filename
    const filePath = `${companyId}/${projectId}/${ticketId}/${fileName}`

    try {
      const { data, error } = await client.storage
        .from('tm-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      const duration = Math.round(performance.now() - start)
      observe.storage('upload', {
        company_id: companyId,
        project_id: projectId,
        size: fileSize,
        duration,
        success: !error
      })

      if (error) throw error

      // Return the storage path. Callers store this in the DB.
      // Use db.resolvePhotoUrl(path) to get a displayable signed URL.
      return filePath
    } catch (error) {
      observe.error('storage', {
        message: error.message,
        operation: 'uploadPhoto',
        company_id: companyId,
        project_id: projectId
      })
      throw error
    }
  },

  async uploadPhotoBase64(companyId, projectId, ticketId, base64Data, fileName = 'photo.jpg') {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    // Convert base64 to blob
    const base64Response = await fetch(base64Data)
    const blob = await base64Response.blob()

    // Create unique filename with secure random ID
    const timestamp = Date.now()
    const array = new Uint8Array(6)
    crypto.getRandomValues(array)
    const randomId = Array.from(array, b => b.toString(36)).join('')
    const extension = fileName.split('.').pop() || 'jpg'
    const newFileName = `${timestamp}-${randomId}.${extension}`

    // Path: company/project/ticket/filename
    const filePath = `${companyId}/${projectId}/${ticketId}/${newFileName}`

    const { data, error } = await client.storage
      .from('tm-photos')
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: blob.type
      })

    if (error) throw error

    // Return the storage path (bucket is now private; use resolvePhotoUrl for display).
    return filePath
  },

  // Convert a stored photo URL or storage path to a signed URL (1-hour expiry).
  // Handles both old public URLs ("https://…/public/tm-photos/…") and
  // new storage paths ("companyId/projectId/ticketId/file.jpg") transparently.
  async resolvePhotoUrl(urlOrPath) {
    if (!urlOrPath || !isSupabaseConfigured) return urlOrPath
    let filePath
    if (urlOrPath.startsWith('http')) {
      try {
        const urlObj = new URL(urlOrPath)
        const match = urlObj.pathname.match(/\/(?:public\/)?tm-photos\/(.+)$/)
        if (!match) return urlOrPath
        filePath = decodeURIComponent(match[1])
      } catch { return urlOrPath }
    } else {
      filePath = urlOrPath
    }
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.storage.from('tm-photos').createSignedUrl(filePath, 3600)
      if (error || !data?.signedUrl) return null
      return data.signedUrl
    } catch { return null }
  },

  // Batch-convert an array of stored photo URLs/paths to signed URLs (1-hour expiry).
  async resolvePhotoUrls(urlsOrPaths) {
    if (!isSupabaseConfigured || !urlsOrPaths?.length) return urlsOrPaths || []
    const paths = []
    const indices = []
    for (let i = 0; i < urlsOrPaths.length; i++) {
      const v = urlsOrPaths[i]
      if (!v) continue
      let fp
      if (v.startsWith('http')) {
        try {
          const urlObj = new URL(v)
          const match = urlObj.pathname.match(/\/(?:public\/)?tm-photos\/(.+)$/)
          if (match) fp = decodeURIComponent(match[1])
        } catch { /* skip */ }
      } else {
        fp = v
      }
      if (fp) { paths.push(fp); indices.push(i) }
    }
    if (!paths.length) return urlsOrPaths
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.storage.from('tm-photos').createSignedUrls(paths, 3600)
      if (error || !data) return urlsOrPaths
      const result = [...urlsOrPaths]
      data.forEach((item, j) => {
        result[indices[j]] = item.signedUrl || null
      })
      return result
    } catch { return urlsOrPaths }
  },

  async deletePhoto(photoUrlOrPath) {
    if (!isSupabaseConfigured || !photoUrlOrPath) return

    let filePath
    if (photoUrlOrPath.startsWith('http')) {
      // Legacy: extract path from a full public URL
      try {
        const url = new URL(photoUrlOrPath)
        const pathMatch = url.pathname.match(/\/tm-photos\/(.+)$/)
        if (!pathMatch) return
        filePath = pathMatch[1]
      } catch { return }
    } else {
      // New format: already a storage path
      filePath = photoUrlOrPath
    }

    const { error } = await supabase.storage
      .from('tm-photos')
      .remove([filePath])

    if (error) throw error
  },

  // ============================================
  // Photo Verification & Reliability
  // ============================================

  // Verify that a photo path/URL exists in storage.
  // Uses createSignedUrl (works with private bucket) instead of a HEAD request.
  async verifyPhotoAccessible(photoUrlOrPath) {
    if (!isSupabaseConfigured || !photoUrlOrPath) return { accessible: false, error: 'Invalid input' }

    let filePath
    if (photoUrlOrPath.startsWith('http')) {
      try {
        const urlObj = new URL(photoUrlOrPath)
        const match = urlObj.pathname.match(/\/(?:public\/)?tm-photos\/(.+)$/)
        if (!match) return { accessible: false, error: 'Not a tm-photos URL' }
        filePath = decodeURIComponent(match[1])
      } catch {
        return { accessible: false, error: 'Invalid URL' }
      }
    } else {
      filePath = photoUrlOrPath
    }

    try {
      const { data, error } = await supabase.storage
        .from('tm-photos')
        .createSignedUrl(filePath, 60)
      if (error) return { accessible: false, error: error.message }
      return { accessible: !!data?.signedUrl, status: 200 }
    } catch (error) {
      return { accessible: false, error: error.message || 'Verification failed' }
    }
  },

  // Verify all photos for a ticket and update verification status
  async verifyTicketPhotos(ticketId) {
    if (!isSupabaseConfigured) return { verified: false, issues: [] }

    try {
      // Get ticket with photos
      const { data: ticket, error: ticketError } = await supabase
        .from('t_and_m_tickets')
        .select('photos')
        .eq('id', ticketId)
        .single()

      if (ticketError) throw ticketError
      if (!ticket?.photos || ticket.photos.length === 0) {
        // No photos - mark as empty
        await supabase
          .from('t_and_m_tickets')
          .update({
            photos_verified_at: new Date().toISOString(),
            photos_verification_status: 'empty',
            photos_issue_count: 0
          })
          .eq('id', ticketId)

        return { verified: true, status: 'empty', issues: [] }
      }

      // Verify each photo
      const issues = []
      for (const photoUrl of ticket.photos) {
        const result = await this.verifyPhotoAccessible(photoUrl)
        if (!result.accessible) {
          issues.push({ url: photoUrl, error: result.error })
        }
      }

      // Update verification status
      const status = issues.length === 0 ? 'verified' : 'issues'
      await supabase
        .from('t_and_m_tickets')
        .update({
          photos_verified_at: new Date().toISOString(),
          photos_verification_status: status,
          photos_issue_count: issues.length
        })
        .eq('id', ticketId)

      return {
        verified: issues.length === 0,
        status,
        totalPhotos: ticket.photos.length,
        issues
      }
    } catch (error) {
      console.error('Error verifying ticket photos:', error)
      return { verified: false, error: error.message, issues: [] }
    }
  },

  // Add entry to photo upload queue for reliable upload tracking
  async queuePhotoUpload(ticketId, tempId, fileName, fileSize) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('photo_upload_queue')
      .insert({
        ticket_id: ticketId,
        temp_id: tempId,
        file_name: fileName,
        file_size_bytes: fileSize,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error queueing photo upload:', error)
      return null
    }
    return data
  },

  // Confirm a queued photo upload (calls database function)
  async confirmQueuedUpload(queueId, uploadedUrl, storagePath) {
    if (!isSupabaseConfigured) return false

    const { data, error } = await supabase.rpc('confirm_photo_upload', {
      p_queue_id: queueId,
      p_uploaded_url: uploadedUrl,
      p_storage_path: storagePath
    })

    if (error) {
      console.error('Error confirming photo upload:', error)
      return false
    }
    return data === true
  },

  // Mark a queued photo upload as failed
  async markQueuedUploadFailed(queueId, errorMessage) {
    if (!isSupabaseConfigured) return false

    const { data, error } = await supabase.rpc('mark_photo_upload_failed', {
      p_queue_id: queueId,
      p_error: errorMessage
    })

    if (error) {
      console.error('Error marking photo upload failed:', error)
      return false
    }
    return data === true
  },

  // Get pending photo uploads for a ticket
  async getPendingPhotoUploads(ticketId) {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase.rpc('get_pending_photo_uploads', {
      p_ticket_id: ticketId
    })

    if (error) {
      console.error('Error getting pending photo uploads:', error)
      return []
    }
    return data || []
  },

  // Log photo operation for audit trail
  async logPhotoOperation(ticketId, operation, details = {}) {
    if (!isSupabaseConfigured) return

    try {
      await supabase
        .from('photo_audit_log')
        .insert({
          ticket_id: ticketId,
          cor_id: details.corId || null,
          operation,
          photo_url: details.photoUrl || null,
          storage_path: details.storagePath || null,
          details: details.metadata ? details.metadata : null,
          error_message: details.error || null,
          triggered_by: details.triggeredBy || 'system'
        })
    } catch (error) {
      // Don't fail the main operation if logging fails
      console.error('Error logging photo operation:', error)
    }
  }
}
