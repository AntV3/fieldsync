/**
 * RFI (Request for Information) operations.
 * Enables field-to-office RFI tracking for Sage parity.
 */

import {
  supabase, isSupabaseConfigured,
  observe,
  getClient,
  sanitize
} from './client'

export const rfiOps = {
  // ============================================
  // RFI CRUD
  // ============================================

  async getRFIs(projectId) {
    if (!isSupabaseConfigured || !projectId) return []

    const start = performance.now()
    try {
      const client = getClient()
      const { data, error } = await client
        .from('rfis')
        .select('*, rfi_attachments(*)')
        .eq('project_id', projectId)
        .order('rfi_number', { ascending: false })

      const duration = Math.round(performance.now() - start)
      observe.query('getRFIs', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getRFIs', project_id: projectId })
      throw error
    }
  },

  async getRFI(rfiId) {
    if (!isSupabaseConfigured || !rfiId) return null

    const { data, error } = await getClient()
      .from('rfis')
      .select('*, rfi_attachments(*)')
      .eq('id', rfiId)
      .single()

    if (error) throw error
    return data
  },

  async getNextRFINumber(projectId) {
    if (!isSupabaseConfigured || !projectId) return 1

    const { data, error } = await supabase
      .from('rfis')
      .select('rfi_number')
      .eq('project_id', projectId)
      .order('rfi_number', { ascending: false })
      .limit(1)

    if (error) throw error
    return (data?.[0]?.rfi_number || 0) + 1
  },

  async createRFI(projectId, companyId, rfiData) {
    if (!isSupabaseConfigured) return null

    const rfiNumber = await rfiOps.getNextRFINumber(projectId)

    const sanitized = sanitize.object({
      project_id: projectId,
      company_id: companyId,
      rfi_number: rfiNumber,
      subject: rfiData.subject,
      question: rfiData.question,
      status: rfiData.status || 'open',
      priority: rfiData.priority || 'normal',
      cost_impact: rfiData.cost_impact || false,
      schedule_impact: rfiData.schedule_impact || false,
      cost_impact_amount: rfiData.cost_impact_amount || 0,
      schedule_impact_days: rfiData.schedule_impact_days || 0,
      assigned_to: rfiData.assigned_to || null,
      submitted_by: rfiData.submitted_by || null,
      due_date: rfiData.due_date || null,
      submitted_at: rfiData.status === 'open' ? new Date().toISOString() : null
    })

    const { data, error } = await supabase
      .from('rfis')
      .insert(sanitized)
      .select()
      .single()

    if (error) throw error
    observe.query('createRFI', { project_id: projectId, rfi_number: rfiNumber })
    return data
  },

  async updateRFI(rfiId, updates) {
    if (!isSupabaseConfigured) return null

    const allowed = [
      'subject', 'question', 'answer', 'status', 'priority',
      'cost_impact', 'schedule_impact', 'cost_impact_amount',
      'schedule_impact_days', 'assigned_to', 'answered_by',
      'due_date', 'submitted_at', 'answered_at', 'closed_at'
    ]

    const sanitized = sanitize.object(
      Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
    )
    sanitized.updated_at = new Date().toISOString()

    // Auto-set timestamps based on status changes
    if (updates.status === 'answered' && !sanitized.answered_at) {
      sanitized.answered_at = new Date().toISOString()
    }
    if (updates.status === 'closed' && !sanitized.closed_at) {
      sanitized.closed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('rfis')
      .update(sanitized)
      .eq('id', rfiId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteRFI(rfiId) {
    if (!isSupabaseConfigured) return

    const { error } = await supabase
      .from('rfis')
      .delete()
      .eq('id', rfiId)

    if (error) throw error
  },

  // ============================================
  // RFI Summary Stats
  // ============================================

  async getRFISummary(projectId) {
    if (!isSupabaseConfigured || !projectId) {
      return { total: 0, open: 0, answered: 0, closed: 0, overdue: 0 }
    }

    const { data, error } = await supabase
      .from('rfis')
      .select('id, status, due_date')
      .eq('project_id', projectId)

    if (error) throw error

    const today = new Date().toISOString().split('T')[0]
    const rfis = data || []

    return {
      total: rfis.length,
      open: rfis.filter(r => r.status === 'open' || r.status === 'draft').length,
      answered: rfis.filter(r => r.status === 'answered').length,
      closed: rfis.filter(r => r.status === 'closed').length,
      overdue: rfis.filter(r =>
        (r.status === 'open' || r.status === 'draft') &&
        r.due_date && r.due_date < today
      ).length
    }
  }
}
