/**
 * T&M Tickets and Photos operations.
 * Extracted from supabase.js for modularity.
 */

import {
  supabase, isSupabaseConfigured,
  observe,
  getClient, getSupabaseClient,
  isFieldMode,
  sanitize
} from './client'
import { TM_COR_STATUSES_ALLOWING_TICKET_EDIT } from '../tmStatus'

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const MAX_SIGNATURE_CHARS = 2000000

const invalidPayloadError = (message) => {
  const err = new Error(message)
  err.code = '22023'
  return err
}

const timeoutError = (timeoutMs) => {
  const err = new Error(`Ticket submit timed out after ${Math.round(timeoutMs / 1000)}s`)
  err.name = 'AbortError'
  err.code = ''
  return err
}

const optionalText = (value) => {
  const text = sanitize.text(value)
  return text ? text : null
}

/**
 * Build the create_tm_ticket_full p_payload from a pending-ticket record
 * (see offlineManager savePendingTMTicket for the record shape). Throws an
 * Error with code '22023' for an invalid record before any request is made.
 * @param {Object} record
 * @returns {Object} p_payload
 */
export function buildTMTicketFullPayload(record) {
  const payload = record?.payload || {}
  const projectId = payload.project_id || record?.project_id
  const clientSubmissionId = payload.client_submission_id || record?.client_submission_id
  if (!projectId || !clientSubmissionId) {
    throw invalidPayloadError('project_id and client_submission_id are required')
  }

  const pPayload = {
    project_id: projectId,
    client_submission_id: clientSubmissionId,
    work_date: payload.work_date,
    ce_pco_number: optionalText(payload.ce_pco_number),
    assigned_cor_id: payload.assigned_cor_id || null,
    notes: optionalText(payload.notes),
    created_by_name: optionalText(payload.created_by_name) || 'Field User',
    workers: (payload.workers || []).map(w => ({
      name: sanitize.text(w.name),
      hours: w.hours,
      overtime_hours: w.overtime_hours || 0,
      time_started: w.time_started || null,
      time_ended: w.time_ended || null,
      role: sanitize.text(w.role || 'Laborer'),
      labor_class_id: w.labor_class_id || null
    })),
    items: (payload.items || []).map(item => ({
      material_equipment_id: item.material_equipment_id || null,
      custom_name: item.custom_name ? sanitize.text(item.custom_name) : null,
      custom_category: item.custom_category ? sanitize.text(item.custom_category) : null,
      quantity: item.quantity
    }))
  }

  const signature = record?.signature
  if (signature) {
    const data = signature.signature
    if (typeof data !== 'string' || !data.startsWith(PNG_DATA_URL_PREFIX)) {
      throw invalidPayloadError('Signature must be a PNG image')
    }
    if (data.length > MAX_SIGNATURE_CHARS) {
      throw invalidPayloadError('Signature image is too large')
    }
    pPayload.foreman_signature = {
      data,
      name: optionalText(signature.signerName),
      title: optionalText(signature.signerTitle),
      date: signature.signedAt || new Date().toISOString()
    }
  }

  return pPayload
}

/**
 * Is `url` a Supabase signed URL whose token is still valid for at least
 * `minTtlMs`? Used so an already-signed URL (for example one the public
 * signing page minted with the signing client) passes through
 * resolvePhotoUrl(s) untouched instead of being re-signed with a client
 * that may not be allowed to read the object. Any parse failure → false.
 * @param {string} url
 * @param {number} [minTtlMs=60000]
 * @returns {boolean}
 */
export function isFreshSignedPhotoUrl(url, minTtlMs = 60000) {
  if (typeof url !== 'string' || !url.startsWith('http')) return false
  try {
    const urlObj = new URL(url)
    if (!/\/storage\/v1\/object\/sign\//.test(urlObj.pathname)) return false
    const token = urlObj.searchParams.get('token')
    if (!token) return false
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    const exp = Number(payload?.exp)
    if (!Number.isFinite(exp)) return false
    return exp * 1000 > Date.now() + minTtlMs
  } catch {
    return false
  }
}

// Nested ticket select shared by the list and single-ticket reads.
// SECURITY: field users never receive cost_per_unit.
const tmTicketNestedSelect = (inFieldMode) => {
  const materialsSelect = inFieldMode
    ? 'materials_equipment (name, unit, category)'
    : 'materials_equipment (name, unit, cost_per_unit, category)'
  return `
            *,
            t_and_m_workers (*),
            t_and_m_items (
              *,
              ${materialsSelect}
            )
          `
}

const numberOrZero = (value) => Number(value) || 0

/**
 * Build the update_tm_ticket_contents arguments from the edit form state.
 * Only content fields are sent: the server derives every audit column
 * (edited_by_name included) itself.
 * @returns {{ p_fields: Object, p_workers: Object[], p_items: Object[], p_edit_note: string|null }}
 */
export function buildTMTicketEditPayload({ fields = {}, workers = [], items = [], editNote = null } = {}) {
  const f = fields || {}
  const pFields = {
    work_date: f.work_date,
    ce_pco_number: optionalText(f.ce_pco_number),
    notes: sanitize.text(f.notes)
  }
  if (Object.prototype.hasOwnProperty.call(f, 'change_order_value') && f.change_order_value !== undefined) {
    const raw = f.change_order_value
    // null or '' clears the value; anything else is sent as a number.
    pFields.change_order_value = raw === null || raw === '' ? null : Number(raw)
  }

  return {
    p_fields: pFields,
    p_workers: (workers || []).map(w => ({
      name: sanitize.text(w.name),
      // Sent as stored (blank -> null). Defaulting here would make a
      // notes-only save on a legacy row read as a crew change server-side.
      role: optionalText(w.role),
      hours: numberOrZero(w.hours),
      overtime_hours: numberOrZero(w.overtime_hours),
      time_started: w.time_started || null,
      time_ended: w.time_ended || null,
      labor_class_id: w.labor_class_id || null
    })),
    p_items: (items || []).map(item => ({
      material_equipment_id: item.material_equipment_id || null,
      custom_name: optionalText(item.custom_name),
      custom_category: optionalText(item.custom_category),
      quantity: Number(item.quantity)
    })),
    p_edit_note: optionalText(editNote)
  }
}

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

      try {
        let query = client
          .from('t_and_m_tickets')
          .select(tmTicketNestedSelect(isFieldMode()), { count: 'exact' })
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1)

        if (Array.isArray(status) && status.length > 0) {
          query = query.in('status', status)
        } else if (status) {
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

  /**
   * One ticket with workers and items, using the same nested select as
   * getTMTicketsPaginated (so a refreshed row drops straight into the list).
   * @param {string} id
   * @returns {Promise<Object|null>}
   * @throws the Supabase error object as-is
   */
  async getTMTicketById(id) {
    if (!isSupabaseConfigured) return null
    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }
    const { data, error } = await client
      .from('t_and_m_tickets')
      .select(tmTicketNestedSelect(isFieldMode()))
      .eq('id', id)
      .single()
    if (error) {
      observe.error('database', {
        message: error.message,
        code: error.code,
        operation: 'getTMTicketById',
        extra: { ticket_id: id }
      })
      throw error
    }
    return data
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

  // Efficient count-only query for tickets on a specific date (avoids loading all ticket data)
  async getTMTicketCountByDate(projectId, date) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return 0
      const { count, error } = await client
        .from('t_and_m_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('work_date', date)
      if (error) return 0
      return count || 0
    }
    return 0
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

  /**
   * Rejected tickets for the foreman's home screen, newest rejection first.
   * Readable with the field session (getClient) and limited to the columns
   * the "needs attention" card shows, so no pricing leaves the server.
   * Never throws: any error is logged and yields [].
   * @param {string} projectId
   * @param {number} [limit=20]
   * @returns {Promise<Array<{ id, work_date, ce_pco_number, rejection_reason,
   *   rejected_at, rejected_by_name, created_by_name, status }>>}
   */
  async getRejectedTMTickets(projectId, limit = 20) {
    if (!isSupabaseConfigured || !projectId) return []
    try {
      const client = getClient()
      if (!client) return []
      const { data, error } = await client
        .from('t_and_m_tickets')
        .select('id, work_date, ce_pco_number, rejection_reason, rejected_at, rejected_by_name, created_by_name, status')
        .eq('project_id', projectId)
        .eq('status', 'rejected')
        .order('rejected_at', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', {
        message: error?.message,
        code: error?.code,
        operation: 'getRejectedTMTickets',
        project_id: projectId
      })
      return []
    }
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

  /**
   * Create a T&M ticket, its workers, items and (optionally) the foreman
   * signature in one idempotent server call. Replaying the same
   * client_submission_id returns the existing row with `replayed: true`.
   *
   * @param {Object} record - pending-ticket record (offlineManager shape)
   * @param {Object} [options]
   * @param {number} [options.timeoutMs=12000] - abort after this long; the
   *   rejection is an AbortError (classifySyncError → 'network')
   * @returns {Promise<Object|null>} the ticket row plus `replayed`
   * @throws the Supabase error object as-is (code preserved)
   */
  async submitTMTicketFull(record, { timeoutMs = 12000 } = {}) {
    if (!isSupabaseConfigured) return null
    const pPayload = buildTMTicketFullPayload(record)

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const controller = new AbortController()
    let timer = null
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(timeoutError(timeoutMs))
      }, timeoutMs)
    })

    try {
      const request = client
        .rpc('create_tm_ticket_full', { p_payload: pPayload })
        .abortSignal(controller.signal)
      const { data, error } = await Promise.race([request, timeout])
      if (error) {
        if (controller.signal.aborted) throw timeoutError(timeoutMs)
        throw error
      }
      return data
    } finally {
      clearTimeout(timer)
    }
  },

  // Plain insert of the ticket row only (workers/items are added separately).
  // Used by the legacy CREATE_TM_TICKET pending action; new T&M submits use
  // submitTMTicketFull.
  async createTMTicket(ticket) {
    if (isSupabaseConfigured) {
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

      if (error) throw error
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

  /**
   * Office correction of a ticket's date, CE/PCO, description, crew and
   * items in one server transaction (update_tm_ticket_contents). The server
   * checks access, billed/invoiced/COR locks, stamps the audit columns and,
   * when crew/items changed on a COR-linked ticket, clears its COR lines and
   * marks the association for re-sync.
   *
   * @param {string} ticketId
   * @param {Object} edit - { fields, workers, items, editNote }
   * @returns {Promise<{ ticket: Object, contents_changed: boolean, cor_resync_required: boolean }|null>}
   * @throws the Supabase error object as-is (code and message preserved)
   */
  async updateTMTicketContents(ticketId, edit = {}) {
    if (!isSupabaseConfigured) return null
    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }
    const { p_fields, p_workers, p_items, p_edit_note } = buildTMTicketEditPayload(edit)

    const { data, error } = await client.rpc('update_tm_ticket_contents', {
      p_ticket_id: ticketId,
      p_fields,
      p_workers,
      p_items,
      p_edit_note
    })
    if (error) {
      observe.error('database', {
        message: error.message,
        code: error.code,
        operation: 'updateTMTicketContents',
        extra: { ticket_id: ticketId }
      })
      throw error
    }
    observe.activity('tm_ticket_edited', {
      ticket_id: ticketId,
      contents_changed: Boolean(data?.contents_changed),
      cor_resync_required: Boolean(data?.cor_resync_required)
    })
    return data
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
        .in('status', ['pending', 'foreman_signed', 'client_signed'])
        // The office may not approve a ticket the client has not signed
        // (same rule as canApproveTicket in tmStatus.js)
        .or('status.eq.client_signed,client_signature_data.not.is.null,gc_signature_data.not.is.null')
        .select()
        .single()
      if (error) {
        // No row matched: not signed by the client, or no longer awaiting approval
        if (error.code === 'PGRST116') {
          const notApprovable = new Error('Ticket is not signed by the client or is no longer awaiting approval')
          notApprovable.code = 'TM_NOT_APPROVABLE'
          throw notApprovable
        }
        throw error
      }
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
        .in('status', ['pending', 'foreman_signed', 'client_signed'])
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
        const isEditable = TM_COR_STATUSES_ALLOWING_TICKET_EDIT.includes(cor.status)

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
      const { error } = await client.storage
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

    const { error } = await client.storage
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

  // Exposed on db for callers that already hold the facade.
  isFreshSignedPhotoUrl(url, minTtlMs = 60000) {
    return isFreshSignedPhotoUrl(url, minTtlMs)
  },

  // Convert a stored photo URL or storage path to a signed URL (1-hour expiry).
  // Handles both old public URLs ("https://…/public/tm-photos/…") and
  // new storage paths ("companyId/projectId/ticketId/file.jpg") transparently.
  // A still-fresh signed URL is returned as-is. `client` lets a caller sign
  // with a specific supabase-js client (e.g. the x-signing-token client of the
  // public signing page); otherwise the current session client is used.
  async resolvePhotoUrl(urlOrPath, client = null) {
    if (!urlOrPath || !isSupabaseConfigured) return urlOrPath
    if (isFreshSignedPhotoUrl(urlOrPath)) return urlOrPath
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
      const storageClient = client || getSupabaseClient()
      const { data, error } = await storageClient.storage.from('tm-photos').createSignedUrl(filePath, 3600)
      if (error || !data?.signedUrl) return null
      return data.signedUrl
    } catch { return null }
  },

  // Batch-convert an array of stored photo URLs/paths to signed URLs (1-hour expiry).
  // Fresh signed URLs pass through untouched; stale ones are re-signed.
  // `client` is optional (see resolvePhotoUrl).
  async resolvePhotoUrls(urlsOrPaths, client = null) {
    if (!isSupabaseConfigured || !urlsOrPaths?.length) return urlsOrPaths || []
    const paths = []
    const indices = []
    for (let i = 0; i < urlsOrPaths.length; i++) {
      const v = urlsOrPaths[i]
      if (!v || typeof v !== 'string') continue
      if (isFreshSignedPhotoUrl(v)) continue
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
      const storageClient = client || getSupabaseClient()
      const { data, error } = await storageClient.storage.from('tm-photos').createSignedUrls(paths, 3600)
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

      // Verify all photos in parallel (10x faster for multi-photo tickets)
      const results = await Promise.all(
        ticket.photos.map(async (photoUrl) => {
          const result = await this.verifyPhotoAccessible(photoUrl)
          return { photoUrl, ...result }
        })
      )
      const issues = results
        .filter(r => !r.accessible)
        .map(r => ({ url: r.photoUrl, error: r.error }))

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
