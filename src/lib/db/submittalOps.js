/**
 * Submittal tracking operations.
 * Manages shop drawings, product data, samples, and other submittals.
 */

import {
  supabase, isSupabaseConfigured,
  observe,
  getClient,
  sanitize
} from './client'

export const submittalOps = {
  // ============================================
  // Submittal CRUD
  // ============================================

  async getSubmittals(projectId) {
    if (!isSupabaseConfigured || !projectId) return []

    const start = performance.now()
    try {
      const client = getClient()
      const { data, error } = await client
        .from('submittals')
        .select('*, submittal_attachments(*), cost_codes(code, description)')
        .eq('project_id', projectId)
        .order('submittal_number', { ascending: false })

      const duration = Math.round(performance.now() - start)
      observe.query('getSubmittals', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getSubmittals', project_id: projectId })
      throw error
    }
  },

  async getSubmittal(submittalId) {
    if (!isSupabaseConfigured || !submittalId) return null

    const { data, error } = await getClient()
      .from('submittals')
      .select('*, submittal_attachments(*), cost_codes(code, description)')
      .eq('id', submittalId)
      .single()

    if (error) throw error
    return data
  },

  async getNextSubmittalNumber(projectId) {
    if (!isSupabaseConfigured || !projectId) return 1

    const { data, error } = await supabase
      .from('submittals')
      .select('submittal_number')
      .eq('project_id', projectId)
      .order('submittal_number', { ascending: false })
      .limit(1)

    if (error) throw error
    return (data?.[0]?.submittal_number || 0) + 1
  },

  async createSubmittal(projectId, companyId, submittalData) {
    if (!isSupabaseConfigured) return null

    const submittalNumber = await submittalOps.getNextSubmittalNumber(projectId)

    const sanitized = sanitize.object({
      project_id: projectId,
      company_id: companyId,
      submittal_number: submittalNumber,
      revision: 0,
      spec_section: submittalData.spec_section || null,
      title: submittalData.title,
      description: submittalData.description || null,
      status: submittalData.status || 'draft',
      submittal_type: submittalData.submittal_type || 'shop_drawing',
      submitted_to: submittalData.submitted_to || null,
      submitted_by: submittalData.submitted_by || null,
      responsible_contractor: submittalData.responsible_contractor || null,
      lead_time_days: submittalData.lead_time_days || 0,
      required_date: submittalData.required_date || null,
      cost_code_id: submittalData.cost_code_id || null,
      notes: submittalData.notes || null,
      submitted_at: submittalData.status === 'submitted' ? new Date().toISOString() : null
    })

    const { data, error } = await supabase
      .from('submittals')
      .insert(sanitized)
      .select()
      .single()

    if (error) throw error
    observe.query('createSubmittal', { project_id: projectId, submittal_number: submittalNumber })
    return data
  },

  async updateSubmittal(submittalId, updates) {
    if (!isSupabaseConfigured) return null

    const allowed = [
      'spec_section', 'title', 'description', 'status', 'submittal_type',
      'submitted_to', 'responsible_contractor', 'lead_time_days',
      'required_date', 'cost_code_id', 'notes',
      'submitted_at', 'returned_at', 'approved_at'
    ]

    const sanitized = sanitize.object(
      Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
    )
    sanitized.updated_at = new Date().toISOString()

    // Auto-set timestamps based on status
    if (updates.status === 'submitted' && !sanitized.submitted_at) {
      sanitized.submitted_at = new Date().toISOString()
    }
    if ((updates.status === 'approved' || updates.status === 'approved_as_noted') && !sanitized.approved_at) {
      sanitized.approved_at = new Date().toISOString()
    }
    if ((updates.status === 'revise_resubmit' || updates.status === 'rejected') && !sanitized.returned_at) {
      sanitized.returned_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('submittals')
      .update(sanitized)
      .eq('id', submittalId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async createRevision(submittalId, projectId, companyId) {
    if (!isSupabaseConfigured) return null

    // Get original submittal
    const original = await submittalOps.getSubmittal(submittalId)
    if (!original) throw new Error('Submittal not found')

    const sanitized = sanitize.object({
      project_id: projectId,
      company_id: companyId,
      submittal_number: original.submittal_number,
      revision: (original.revision || 0) + 1,
      spec_section: original.spec_section,
      title: original.title,
      description: original.description,
      status: 'draft',
      submittal_type: original.submittal_type,
      submitted_to: original.submitted_to,
      responsible_contractor: original.responsible_contractor,
      lead_time_days: original.lead_time_days,
      required_date: original.required_date,
      cost_code_id: original.cost_code_id,
      notes: `Revision of Submittal #${original.submittal_number} Rev ${original.revision}`
    })

    const { data, error } = await supabase
      .from('submittals')
      .insert(sanitized)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteSubmittal(submittalId) {
    if (!isSupabaseConfigured) return

    const { error } = await supabase
      .from('submittals')
      .delete()
      .eq('id', submittalId)

    if (error) throw error
  },

  // ============================================
  // Submittal Summary Stats
  // ============================================

  async getSubmittalSummary(projectId) {
    if (!isSupabaseConfigured || !projectId) {
      return { total: 0, pending: 0, approved: 0, rejected: 0, overdue: 0 }
    }

    const { data, error } = await supabase
      .from('submittals')
      .select('id, status, required_date')
      .eq('project_id', projectId)

    if (error) throw error

    const today = new Date().toISOString().split('T')[0]
    const items = data || []

    return {
      total: items.length,
      pending: items.filter(s =>
        ['draft', 'submitted', 'under_review'].includes(s.status)
      ).length,
      approved: items.filter(s =>
        ['approved', 'approved_as_noted'].includes(s.status)
      ).length,
      rejected: items.filter(s =>
        ['revise_resubmit', 'rejected'].includes(s.status)
      ).length,
      overdue: items.filter(s =>
        ['draft', 'submitted', 'under_review'].includes(s.status) &&
        s.required_date && s.required_date < today
      ).length
    }
  },

  // Submittal type labels for UI
  SUBMITTAL_TYPES: [
    { value: 'shop_drawing', label: 'Shop Drawing' },
    { value: 'product_data', label: 'Product Data' },
    { value: 'sample', label: 'Sample' },
    { value: 'mock_up', label: 'Mock-Up' },
    { value: 'test_report', label: 'Test Report' },
    { value: 'certificate', label: 'Certificate' },
    { value: 'design_data', label: 'Design Data' },
    { value: 'other', label: 'Other' }
  ],

  // Status labels with colors for UI
  SUBMITTAL_STATUSES: {
    draft: { label: 'Draft', color: 'gray' },
    submitted: { label: 'Submitted', color: 'blue' },
    under_review: { label: 'Under Review', color: 'orange' },
    approved: { label: 'Approved', color: 'green' },
    approved_as_noted: { label: 'Approved as Noted', color: 'green' },
    revise_resubmit: { label: 'Revise & Resubmit', color: 'red' },
    rejected: { label: 'Rejected', color: 'red' },
    closed: { label: 'Closed', color: 'gray' }
  }
}
