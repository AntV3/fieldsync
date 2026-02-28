// Draw Request / Progress Billing operations
// Extracted from supabase.js for maintainability

import { supabase, isSupabaseConfigured } from './supabaseClient'
import { observe } from './observability'

export const drawRequestOps = {
  /**
   * Get next draw number for a project
   */
  async getNextDrawNumber(projectId) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return 1
    }

    const { data, error } = await supabase
      .from('draw_requests')
      .select('draw_number')
      .eq('project_id', projectId)
      .order('draw_number', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      observe.error('database', { message: error?.message, operation: 'getNextDrawNumber' })
    }

    return (data?.draw_number || 0) + 1
  },

  /**
   * Get previous billing totals for a project
   */
  async getPreviousBillingTotals(projectId) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return { totalBilled: 0, totalRetention: 0 }
    }

    const { data, error } = await supabase
      .from('draw_requests')
      .select('current_billing, retention_held')
      .eq('project_id', projectId)
      .in('status', ['submitted', 'approved', 'paid'])

    if (error) {
      observe.error('database', { message: error?.message, operation: 'getPreviousBillingTotals' })
      return { totalBilled: 0, totalRetention: 0 }
    }

    const totalBilled = (data || []).reduce((sum, dr) => sum + (dr.current_billing || 0), 0)
    const totalRetention = data?.length > 0 ? Math.max(...data.map(dr => dr.retention_held || 0)) : 0

    return { totalBilled, totalRetention }
  },

  /**
   * Get all draw requests for a project
   */
  async getProjectDrawRequests(projectId) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return []
    }

    const { data, error } = await supabase
      .from('draw_requests')
      .select('*')
      .eq('project_id', projectId)
      .order('draw_number', { ascending: false })

    if (error) {
      observe.error('database', { message: error?.message, operation: 'getDrawRequests' })
      return []
    }

    return data || []
  },

  /**
   * Get a single draw request with its items
   */
  async getDrawRequest(drawRequestId) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return null
    }

    const { data, error } = await supabase
      .from('draw_requests')
      .select(`
        *,
        draw_request_items (
          *
        )
      `)
      .eq('id', drawRequestId)
      .single()

    if (error) {
      observe.error('database', { message: error?.message, operation: 'getDrawRequest' })
      return null
    }

    return data
  },

  /**
   * Create a new draw request with items
   */
  async createDrawRequest(drawRequest, items) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return null
    }

    // Insert draw request
    const { data: dr, error: drError } = await supabase
      .from('draw_requests')
      .insert(drawRequest)
      .select()
      .single()

    if (drError) {
      observe.error('database', { message: drError?.message, operation: 'createDrawRequest' })
      throw drError
    }

    // Insert items if provided
    if (items && items.length > 0) {
      const itemsWithDrawId = items.map((item, index) => ({
        ...item,
        draw_request_id: dr.id,
        sort_order: index
      }))

      const { error: itemsError } = await supabase
        .from('draw_request_items')
        .insert(itemsWithDrawId)

      if (itemsError) {
        observe.error('database', { message: itemsError?.message, operation: 'createDrawRequestItems' })
        // Don't throw - draw request was created, items can be added later
      }
    }

    // Fetch complete draw request with items
    return this.getDrawRequest(dr.id)
  },

  /**
   * Update a draw request
   */
  async updateDrawRequest(drawRequestId, updates) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return null
    }

    const { data, error } = await supabase
      .from('draw_requests')
      .update(updates)
      .eq('id', drawRequestId)
      .select()
      .single()

    if (error) {
      observe.error('database', { message: error?.message, operation: 'updateDrawRequest' })
      throw error
    }

    return data
  },

  /**
   * Update draw request status
   */
  async updateDrawRequestStatus(drawRequestId, status) {
    const updates = { status }

    // Add timestamp based on status
    if (status === 'submitted') {
      updates.submitted_at = new Date().toISOString()
    } else if (status === 'approved') {
      updates.approved_at = new Date().toISOString()
    } else if (status === 'paid') {
      updates.paid_at = new Date().toISOString()
    }

    return this.updateDrawRequest(drawRequestId, updates)
  },

  /**
   * Update draw request items (bulk update)
   */
  async updateDrawRequestItems(drawRequestId, items) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return false
    }

    // Delete existing items
    const { error: deleteError } = await supabase
      .from('draw_request_items')
      .delete()
      .eq('draw_request_id', drawRequestId)

    if (deleteError) {
      observe.error('database', { message: deleteError?.message, operation: 'updateDrawRequestItems' })
      throw deleteError
    }

    // Insert new items
    if (items && items.length > 0) {
      const itemsWithDrawId = items.map((item, index) => ({
        ...item,
        draw_request_id: drawRequestId,
        sort_order: index
      }))

      const { error: insertError } = await supabase
        .from('draw_request_items')
        .insert(itemsWithDrawId)

      if (insertError) {
        observe.error('database', { message: insertError?.message, operation: 'insertDrawRequestItems' })
        throw insertError
      }
    }

    return true
  },

  /**
   * Delete a draft draw request
   */
  async deleteDrawRequest(drawRequestId) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return false
    }

    const { error } = await supabase
      .from('draw_requests')
      .delete()
      .eq('id', drawRequestId)

    if (error) {
      observe.error('database', { message: error?.message, operation: 'deleteDrawRequest' })
      throw error
    }

    return true
  },

  /**
   * Get schedule of values from project areas
   * Returns areas with their scheduled values for use in draw requests
   */
  async getScheduleOfValues(projectId) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return []
    }

    const { data, error } = await supabase
      .from('areas')
      .select('id, name, square_footage, price_per_sqft')
      .eq('project_id', projectId)
      .order('created_at')

    if (error) {
      observe.error('database', { message: error?.message, operation: 'getScheduleOfValues' })
      return []
    }

    // Calculate scheduled value for each area
    return (data || []).map((area, index) => ({
      area_id: area.id,
      item_number: String(index + 1),
      description: area.name,
      scheduled_value: Math.round((area.square_footage || 0) * (area.price_per_sqft || 0) * 100) // Convert to cents
    }))
  },

  /**
   * Get previous draw request items for calculating previous work
   */
  async getPreviousDrawItems(projectId) {
    if (!isSupabaseConfigured) {
      observe.error('general', { message: 'Supabase not configured', severity: 'warning' })
      return {}
    }

    // Get the most recent submitted/approved/paid draw request
    const { data: latestDraw, error: drawError } = await supabase
      .from('draw_requests')
      .select('id')
      .eq('project_id', projectId)
      .in('status', ['submitted', 'approved', 'paid'])
      .order('draw_number', { ascending: false })
      .limit(1)
      .single()

    if (drawError && drawError.code !== 'PGRST116') {
      observe.error('database', { message: drawError?.message, operation: 'getPreviousDrawData' })
      return {}
    }

    if (!latestDraw) {
      return {}
    }

    // Get items from that draw
    const { data: items, error: itemsError } = await supabase
      .from('draw_request_items')
      .select('area_id, total_percent, total_amount')
      .eq('draw_request_id', latestDraw.id)

    if (itemsError) {
      observe.error('database', { message: itemsError?.message, operation: 'getPreviousDrawItems' })
      return {}
    }

    // Return as a map by area_id
    return (items || []).reduce((acc, item) => {
      if (item.area_id) {
        acc[item.area_id] = {
          previous_percent: item.total_percent || 0,
          previous_amount: item.total_amount || 0
        }
      }
      return acc
    }, {})
  },

  /**
   * Calculate completion percentage from amount
   */
  calculatePercentFromAmount(amount, scheduledValue) {
    if (!scheduledValue || scheduledValue === 0) return 0
    return Math.round((amount / scheduledValue) * 10000) // basis points
  },

  /**
   * Calculate amount from percentage
   */
  calculateAmountFromPercent(percent, scheduledValue) {
    return Math.round((percent / 10000) * scheduledValue)
  }
}
