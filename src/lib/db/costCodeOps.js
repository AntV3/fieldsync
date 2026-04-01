/**
 * Cost Code operations — Job costing structure for Sage parity.
 * Maps to Sage's job/phase/cost-code hierarchy.
 */

import {
  supabase, isSupabaseConfigured,
  observe,
  getClient,
  sanitize
} from './client'

export const costCodeOps = {
  // ============================================
  // Cost Codes (Company-level)
  // ============================================

  async getCostCodes(companyId) {
    if (!isSupabaseConfigured || !companyId) return []

    const start = performance.now()
    try {
      const { data, error } = await supabase
        .from('cost_codes')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('code', { ascending: true })

      const duration = Math.round(performance.now() - start)
      observe.query('getCostCodes', { duration, rows: data?.length, company_id: companyId })

      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getCostCodes', company_id: companyId })
      throw error
    }
  },

  async getAllCostCodes(companyId, includeInactive = false) {
    if (!isSupabaseConfigured || !companyId) return []

    let query = supabase
      .from('cost_codes')
      .select('*')
      .eq('company_id', companyId)
      .order('code', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async createCostCode(companyId, costCodeData) {
    if (!isSupabaseConfigured) return null

    const sanitized = sanitize.object({
      company_id: companyId,
      code: costCodeData.code,
      description: costCodeData.description,
      category: costCodeData.category || 'labor',
      parent_code: costCodeData.parent_code || null,
      is_active: true
    })

    const { data, error } = await supabase
      .from('cost_codes')
      .insert(sanitized)
      .select()
      .single()

    if (error) throw error
    observe.query('createCostCode', { company_id: companyId, code: costCodeData.code })
    return data
  },

  async updateCostCode(costCodeId, updates) {
    if (!isSupabaseConfigured) return null

    const allowed = ['code', 'description', 'category', 'parent_code', 'is_active']
    const sanitized = sanitize.object(
      Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
    )
    sanitized.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('cost_codes')
      .update(sanitized)
      .eq('id', costCodeId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteCostCode(costCodeId) {
    if (!isSupabaseConfigured) return

    // Soft delete — just deactivate
    const { error } = await supabase
      .from('cost_codes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', costCodeId)

    if (error) throw error
  },

  // ============================================
  // Cost Code Assignment Queries
  // ============================================

  async getProjectCostSummary(projectId) {
    if (!isSupabaseConfigured || !projectId) return []

    const start = performance.now()
    try {
      // Get T&M tickets grouped by cost code
      const { data: tickets, error } = await supabase
        .from('t_and_m_tickets')
        .select(`
          cost_code_id,
          cost_codes (code, description, category),
          t_and_m_workers (hours, overtime_hours),
          t_and_m_items (quantity, materials_equipment (cost_per_unit))
        `)
        .eq('project_id', projectId)
        .not('cost_code_id', 'is', null)

      const duration = Math.round(performance.now() - start)
      observe.query('getProjectCostSummary', { duration, rows: tickets?.length, project_id: projectId })

      if (error) throw error

      // Aggregate costs by cost code
      const summary = {}
      for (const ticket of (tickets || [])) {
        const codeId = ticket.cost_code_id
        if (!summary[codeId]) {
          summary[codeId] = {
            cost_code_id: codeId,
            code: ticket.cost_codes?.code || 'Unassigned',
            description: ticket.cost_codes?.description || '',
            category: ticket.cost_codes?.category || 'other',
            total_hours: 0,
            overtime_hours: 0,
            material_cost: 0,
            ticket_count: 0
          }
        }

        summary[codeId].ticket_count++

        for (const worker of (ticket.t_and_m_workers || [])) {
          summary[codeId].total_hours += parseFloat(worker.hours) || 0
          summary[codeId].overtime_hours += parseFloat(worker.overtime_hours) || 0
        }

        for (const item of (ticket.t_and_m_items || [])) {
          const qty = parseFloat(item.quantity) || 0
          const cost = item.materials_equipment?.cost_per_unit || 0
          summary[codeId].material_cost += qty * cost
        }
      }

      return Object.values(summary).sort((a, b) => a.code.localeCompare(b.code))
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getProjectCostSummary' })
      throw error
    }
  },

  // Standard CSI cost code templates for quick setup
  getCSITemplates() {
    return [
      { code: '01-000', description: 'General Requirements', category: 'other', parent_code: null },
      { code: '01-100', description: 'Summary of Work', category: 'other', parent_code: '01-000' },
      { code: '01-500', description: 'Temporary Facilities', category: 'other', parent_code: '01-000' },
      { code: '01-700', description: 'Execution & Closeout', category: 'other', parent_code: '01-000' },
      { code: '02-000', description: 'Existing Conditions', category: 'labor', parent_code: null },
      { code: '02-100', description: 'Demolition', category: 'labor', parent_code: '02-000' },
      { code: '03-000', description: 'Concrete', category: 'material', parent_code: null },
      { code: '03-100', description: 'Concrete Formwork', category: 'labor', parent_code: '03-000' },
      { code: '03-200', description: 'Concrete Reinforcing', category: 'material', parent_code: '03-000' },
      { code: '03-300', description: 'Cast-in-Place Concrete', category: 'material', parent_code: '03-000' },
      { code: '04-000', description: 'Masonry', category: 'material', parent_code: null },
      { code: '05-000', description: 'Metals', category: 'material', parent_code: null },
      { code: '05-100', description: 'Structural Steel', category: 'material', parent_code: '05-000' },
      { code: '06-000', description: 'Wood & Plastics', category: 'material', parent_code: null },
      { code: '07-000', description: 'Thermal & Moisture Protection', category: 'material', parent_code: null },
      { code: '08-000', description: 'Doors & Windows', category: 'material', parent_code: null },
      { code: '09-000', description: 'Finishes', category: 'material', parent_code: null },
      { code: '09-200', description: 'Plaster & Gypsum Board', category: 'material', parent_code: '09-000' },
      { code: '09-300', description: 'Tile', category: 'material', parent_code: '09-000' },
      { code: '09-600', description: 'Flooring', category: 'material', parent_code: '09-000' },
      { code: '09-900', description: 'Painting & Coatings', category: 'material', parent_code: '09-000' },
      { code: '10-000', description: 'Specialties', category: 'material', parent_code: null },
      { code: '15-000', description: 'Mechanical', category: 'subcontractor', parent_code: null },
      { code: '15-100', description: 'Plumbing', category: 'subcontractor', parent_code: '15-000' },
      { code: '15-500', description: 'HVAC', category: 'subcontractor', parent_code: '15-000' },
      { code: '16-000', description: 'Electrical', category: 'subcontractor', parent_code: null },
      { code: '16-100', description: 'Electrical Distribution', category: 'subcontractor', parent_code: '16-000' },
      { code: '31-000', description: 'Earthwork', category: 'equipment', parent_code: null },
      { code: '31-100', description: 'Site Clearing', category: 'equipment', parent_code: '31-000' },
      { code: '31-200', description: 'Grading', category: 'equipment', parent_code: '31-000' },
      { code: '32-000', description: 'Exterior Improvements', category: 'other', parent_code: null },
      { code: '33-000', description: 'Utilities', category: 'subcontractor', parent_code: null }
    ]
  },

  async importCSITemplates(companyId) {
    if (!isSupabaseConfigured || !companyId) return []

    const templates = costCodeOps.getCSITemplates()
    const records = templates.map(t => ({
      company_id: companyId,
      code: t.code,
      description: t.description,
      category: t.category,
      parent_code: t.parent_code,
      is_active: true
    }))

    const { data, error } = await supabase
      .from('cost_codes')
      .upsert(records, { onConflict: 'company_id,code' })
      .select()

    if (error) throw error
    return data || []
  }
}
