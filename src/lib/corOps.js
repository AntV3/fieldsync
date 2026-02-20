// COR (Change Order Request) operations
// Extracted from supabase.js for maintainability
// These methods are spread into the `db` object in supabase.js,
// so all existing `db.createCOR()` etc. calls continue to work unchanged.

import { supabase, isSupabaseConfigured } from './supabaseClient'
import { getClient } from './fieldSession'
import { observe } from './observability'
import { generateTempId } from './offlineManager'
import { getLocalData, setLocalData } from './localStorageHelpers'

export const corOps = {
  // Create a new COR (with retry on conflict)
  async createCOR(corData, retryCount = 0) {
    if (isSupabaseConfigured) {
      // Get a fresh COR number if this is a retry
      let corNumber = corData.cor_number
      if (retryCount > 0) {
        corNumber = await this.getNextCORNumber(corData.project_id)
      }

      const { data, error } = await supabase
        .from('change_orders')
        .insert({
          company_id: corData.company_id,
          project_id: corData.project_id,
          area_id: corData.area_id || null,
          cor_number: corNumber,
          title: corData.title,
          description: corData.description || '',
          scope_of_work: corData.scope_of_work,
          period_start: corData.period_start,
          period_end: corData.period_end,
          status: 'draft',
          // Default markup percentages (basis points)
          labor_markup_percent: corData.labor_markup_percent ?? 1500,
          materials_markup_percent: corData.materials_markup_percent ?? 1500,
          equipment_markup_percent: corData.equipment_markup_percent ?? 1500,
          subcontractors_markup_percent: corData.subcontractors_markup_percent ?? 500,
          // Default fee percentages (basis points)
          liability_insurance_percent: corData.liability_insurance_percent ?? 144,
          bond_percent: corData.bond_percent ?? 100,
          license_fee_percent: corData.license_fee_percent ?? 10,
          created_by: corData.created_by || null
        })
        .select()
        .single()

      // Handle 409 conflict (duplicate COR number) by retrying with fresh number
      // PostgreSQL unique violation = 23505, HTTP conflict = 409
      const isConflict = error?.code === '23505' ||
                         error?.code === 'PGRST116' ||
                         error?.status === 409 ||
                         error?.message?.includes('duplicate') ||
                         error?.message?.includes('unique_cor_number')
      if (isConflict && retryCount < 3) {
        console.warn(`COR number conflict, retrying with fresh number (attempt ${retryCount + 1})`)
        return this.createCOR(corData, retryCount + 1)
      }

      if (error) throw error
      return data
    }
    return null
  },

  // Update COR fields (not line items)
  async updateCOR(corId, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Delete COR (cascade deletes line items and associations)
  async deleteCOR(corId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_orders')
        .delete()
        .eq('id', corId)
      if (error) throw error
    }
  },

  // Bulk update COR group name
  // Requires migration_cor_enhancements.sql to be run for group_name column
  async bulkUpdateCORGroup(corIds, groupName) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_orders')
        .update({ group_name: groupName, updated_at: new Date().toISOString() })
        .in('id', corIds)
      if (error) {
        // Check if the error is due to missing group_name column
        if (error.message?.includes('group_name') || error.code === 'PGRST204') {
          throw new Error('COR grouping requires a database migration. Please run database/migration_cor_enhancements.sql in Supabase SQL Editor.')
        }
        throw error
      }
    }
  },

  // Get all CORs for a project
  async getCORs(projectId, filters = {}) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('change_orders')
        .select(`
          *,
          areas (id, name),
          labor_count:change_order_labor(count),
          materials_count:change_order_materials(count),
          equipment_count:change_order_equipment(count),
          subcontractors_count:change_order_subcontractors(count),
          tickets_count:change_order_ticket_associations(count)
        `)
        .eq('project_id', projectId)

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status)
      }
      if (filters.area_id) {
        query = query.eq('area_id', filters.area_id)
      }
      if (filters.date_start) {
        query = query.gte('period_start', filters.date_start)
      }
      if (filters.date_end) {
        query = query.lte('period_end', filters.date_end)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) throw error
      return data
    }
    return []
  },

  // Get single COR with all line items and full backup documentation
  async getCORById(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .select(`
          *,
          areas (id, name),
          change_order_labor (*),
          change_order_materials (*),
          change_order_equipment (*),
          change_order_subcontractors (*),
          change_order_ticket_associations (
            *,
            t_and_m_tickets (
              *,
              t_and_m_workers (*),
              t_and_m_items (
                *,
                materials_equipment (name, unit, cost_per_unit, category)
              )
            )
          )
        `)
        .eq('id', corId)
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Get all CORs for a specific work area
  async getCORsByArea(projectId, areaId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .select('*')
        .eq('project_id', projectId)
        .eq('area_id', areaId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    return []
  },

  // Get all CORs available for T&M ticket assignment
  // Used by foremen to assign T&M tickets directly to a COR from the field
  // Only returns CORs that can still receive tickets (not billed or archived)
  async getAssignableCORs(projectId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []
      const { data, error } = await client
        .from('change_orders')
        .select('id, cor_number, title, status, cor_total')
        .eq('project_id', projectId)
        .in('status', ['draft', 'pending_approval', 'approved'])
        .order('cor_number', { ascending: true })
      if (error) throw error
      return data || []
    }
    return []
  },

  // Get next available COR number for project
  async getNextCORNumber(projectId) {
    if (isSupabaseConfigured) {
      // Get ALL COR numbers for this project to find the highest
      const { data, error } = await supabase
        .from('change_orders')
        .select('cor_number')
        .eq('project_id', projectId)

      if (error) throw error

      if (data && data.length > 0) {
        // Extract all numbers and find the maximum
        let maxNumber = 0
        for (const cor of data) {
          const match = cor.cor_number?.match(/COR #(\d+)/)
          if (match) {
            const num = parseInt(match[1])
            if (num > maxNumber) maxNumber = num
          }
        }
        return `COR #${maxNumber + 1}`
      }
      return 'COR #1'
    }
    return 'COR #1'
  },

  // ============================================
  // COR Line Items - Labor
  // ============================================

  async addCORLaborItem(corId, laborItem) {
    if (isSupabaseConfigured) {
      // Calculate totals
      const regularTotal = Math.round(laborItem.regular_hours * laborItem.regular_rate)
      const overtimeTotal = Math.round(laborItem.overtime_hours * laborItem.overtime_rate)
      const total = regularTotal + overtimeTotal

      const { data, error } = await supabase
        .from('change_order_labor')
        .insert({
          change_order_id: corId,
          labor_class: laborItem.labor_class,
          wage_type: laborItem.wage_type || 'standard',
          regular_hours: laborItem.regular_hours || 0,
          overtime_hours: laborItem.overtime_hours || 0,
          regular_rate: laborItem.regular_rate || 0,
          overtime_rate: laborItem.overtime_rate || 0,
          regular_total: regularTotal,
          overtime_total: overtimeTotal,
          total: total,
          sort_order: laborItem.sort_order || 0,
          source_ticket_id: laborItem.source_ticket_id || null
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCORLaborItem(itemId, updates) {
    if (isSupabaseConfigured) {
      // Recalculate totals if hours or rates changed
      let updateData = { ...updates }
      if (updates.regular_hours !== undefined || updates.regular_rate !== undefined ||
          updates.overtime_hours !== undefined || updates.overtime_rate !== undefined) {
        // Get current values if not provided
        const { data: current } = await supabase
          .from('change_order_labor')
          .select('regular_hours, overtime_hours, regular_rate, overtime_rate')
          .eq('id', itemId)
          .single()

        const regHours = updates.regular_hours ?? current?.regular_hours ?? 0
        const otHours = updates.overtime_hours ?? current?.overtime_hours ?? 0
        const regRate = updates.regular_rate ?? current?.regular_rate ?? 0
        const otRate = updates.overtime_rate ?? current?.overtime_rate ?? 0

        updateData.regular_total = Math.round(regHours * regRate)
        updateData.overtime_total = Math.round(otHours * otRate)
        updateData.total = updateData.regular_total + updateData.overtime_total
      }

      const { data, error } = await supabase
        .from('change_order_labor')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCORLaborItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_labor')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // COR Line Items - Materials
  // ============================================

  async addCORMaterialItem(corId, materialItem) {
    if (isSupabaseConfigured) {
      const allowedSourceTypes = ['backup_sheet', 'invoice', 'mobilization', 'custom', 'field_ticket', 'rental']
      const sourceType = allowedSourceTypes.includes(materialItem.source_type) ? materialItem.source_type : 'custom'
      const unitCost = Math.round(Number(materialItem.unit_cost) || 0)
      const quantity = Number(materialItem.quantity) || 1
      const total = Math.round(quantity * unitCost)

      const { data, error } = await supabase
        .from('change_order_materials')
        .insert({
          change_order_id: corId,
          description: materialItem.description || '',
          quantity: quantity,
          unit: materialItem.unit || 'each',
          unit_cost: unitCost,
          total: total,
          source_type: sourceType,
          source_reference: materialItem.source_reference || null,
          source_ticket_id: materialItem.source_ticket_id || null,
          sort_order: materialItem.sort_order || 0
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCORMaterialItem(itemId, updates) {
    if (isSupabaseConfigured) {
      let updateData = { ...updates }
      if (updates.quantity !== undefined || updates.unit_cost !== undefined) {
        const { data: current } = await supabase
          .from('change_order_materials')
          .select('quantity, unit_cost')
          .eq('id', itemId)
          .single()

        const qty = updates.quantity ?? current?.quantity ?? 1
        const cost = updates.unit_cost ?? current?.unit_cost ?? 0
        updateData.total = Math.round(qty * cost)
      }

      const { data, error } = await supabase
        .from('change_order_materials')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCORMaterialItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_materials')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // COR Line Items - Equipment
  // ============================================

  async addCOREquipmentItem(corId, equipmentItem) {
    if (isSupabaseConfigured) {
      const allowedSourceTypes = ['backup_sheet', 'invoice', 'custom', 'field_ticket', 'rental']
      const sourceType = allowedSourceTypes.includes(equipmentItem.source_type) ? equipmentItem.source_type : 'custom'
      const unitCost = Math.round(Number(equipmentItem.unit_cost) || 0)
      const quantity = Number(equipmentItem.quantity) || 1
      const total = Math.round(quantity * unitCost)

      const { data, error } = await supabase
        .from('change_order_equipment')
        .insert({
          change_order_id: corId,
          description: equipmentItem.description || '',
          quantity: quantity,
          unit: equipmentItem.unit || 'day',
          unit_cost: unitCost,
          total: total,
          source_type: sourceType,
          source_reference: equipmentItem.source_reference || null,
          source_ticket_id: equipmentItem.source_ticket_id || null,
          sort_order: equipmentItem.sort_order || 0
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCOREquipmentItem(itemId, updates) {
    if (isSupabaseConfigured) {
      let updateData = { ...updates }
      if (updates.quantity !== undefined || updates.unit_cost !== undefined) {
        const { data: current } = await supabase
          .from('change_order_equipment')
          .select('quantity, unit_cost')
          .eq('id', itemId)
          .single()

        const qty = updates.quantity ?? current?.quantity ?? 1
        const cost = updates.unit_cost ?? current?.unit_cost ?? 0
        updateData.total = Math.round(qty * cost)
      }

      const { data, error } = await supabase
        .from('change_order_equipment')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCOREquipmentItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_equipment')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // COR Line Items - Subcontractors
  // ============================================

  async addCORSubcontractorItem(corId, subItem) {
    if (isSupabaseConfigured) {
      const total = Math.round(subItem.quantity * subItem.unit_cost)

      const { data, error } = await supabase
        .from('change_order_subcontractors')
        .insert({
          change_order_id: corId,
          description: subItem.description,
          quantity: subItem.quantity || 1,
          unit: subItem.unit || 'lump sum',
          unit_cost: subItem.unit_cost || 0,
          total: total,
          source_type: subItem.source_type || 'custom',
          source_reference: subItem.source_reference || null,
          sort_order: subItem.sort_order || 0
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCORSubcontractorItem(itemId, updates) {
    if (isSupabaseConfigured) {
      let updateData = { ...updates }
      if (updates.quantity !== undefined || updates.unit_cost !== undefined) {
        const { data: current } = await supabase
          .from('change_order_subcontractors')
          .select('quantity, unit_cost')
          .eq('id', itemId)
          .single()

        const qty = updates.quantity ?? current?.quantity ?? 1
        const cost = updates.unit_cost ?? current?.unit_cost ?? 0
        updateData.total = Math.round(qty * cost)
      }

      const { data, error } = await supabase
        .from('change_order_subcontractors')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCORSubcontractorItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_subcontractors')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // Bulk Line Item Operations
  // ============================================

  async addBulkLaborItems(corId, laborItems) {
    if (isSupabaseConfigured && laborItems.length > 0) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      const items = laborItems.map((item, index) => {
        const regularTotal = Math.round(item.regular_hours * item.regular_rate)
        const overtimeTotal = Math.round(item.overtime_hours * item.overtime_rate)
        return {
          change_order_id: corId,
          labor_class: item.labor_class,
          wage_type: item.wage_type || 'standard',
          regular_hours: item.regular_hours || 0,
          overtime_hours: item.overtime_hours || 0,
          regular_rate: item.regular_rate || 0,
          overtime_rate: item.overtime_rate || 0,
          regular_total: regularTotal,
          overtime_total: overtimeTotal,
          total: regularTotal + overtimeTotal,
          sort_order: item.sort_order ?? index,
          source_ticket_id: item.source_ticket_id || null
        }
      })

      const { data, error } = await client
        .from('change_order_labor')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  async addBulkMaterialItems(corId, materialItems) {
    if (isSupabaseConfigured && materialItems.length > 0) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      // Allowed source_type values for materials
      const allowedSourceTypes = ['backup_sheet', 'invoice', 'mobilization', 'custom', 'field_ticket', 'rental']

      const items = materialItems.map((item, index) => {
        const sourceType = allowedSourceTypes.includes(item.source_type) ? item.source_type : 'custom'
        const unitCost = Math.round(Number(item.unit_cost) || 0)
        const quantity = Number(item.quantity) || 1

        return {
          change_order_id: corId,
          description: item.description || '',
          quantity: quantity,
          unit: item.unit || 'each',
          unit_cost: unitCost,
          total: Math.round(quantity * unitCost),
          source_type: sourceType,
          source_reference: item.source_reference || null,
          source_ticket_id: item.source_ticket_id || null,
          sort_order: item.sort_order ?? index
        }
      })

      const { data, error } = await client
        .from('change_order_materials')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  async addBulkEquipmentItems(corId, equipmentItems) {
    if (isSupabaseConfigured && equipmentItems.length > 0) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      // Allowed source_type values for equipment
      const allowedSourceTypes = ['backup_sheet', 'invoice', 'custom', 'field_ticket', 'rental']

      const items = equipmentItems.map((item, index) => {
        const sourceType = allowedSourceTypes.includes(item.source_type) ? item.source_type : 'custom'
        const unitCost = Math.round(Number(item.unit_cost) || 0)
        const quantity = Number(item.quantity) || 1

        return {
          change_order_id: corId,
          description: item.description || '',
          quantity: quantity,
          unit: item.unit || 'day',
          unit_cost: unitCost,
          total: Math.round(quantity * unitCost),
          source_type: sourceType,
          source_reference: item.source_reference || null,
          source_ticket_id: item.source_ticket_id || null,
          sort_order: item.sort_order ?? index
        }
      })

      const { data, error } = await client
        .from('change_order_equipment')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  async addBulkSubcontractorItems(corId, subItems) {
    if (isSupabaseConfigured && subItems.length > 0) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      // Build items - requires migration_complete_fixes.sql for company_name column
      const items = subItems.map((item, index) => ({
        change_order_id: corId,
        company_name: item.company_name || '',
        description: item.description || '',
        quantity: item.quantity || 1,
        unit: item.unit || 'lump sum',
        unit_cost: item.unit_cost || item.total || item.amount || 0,
        total: item.total || item.amount || 0,
        source_type: item.source_type || 'invoice',
        source_reference: item.source_reference || null,
        sort_order: item.sort_order ?? index
      }))

      const { data, error } = await client
        .from('change_order_subcontractors')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  // Clear all line items for a COR (used when replacing items during update)
  async clearCORLineItems(corId) {
    if (!isSupabaseConfigured) return

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    try {
      // Delete all line items for this COR in parallel
      const results = await Promise.all([
        client.from('change_order_labor').delete().eq('change_order_id', corId),
        client.from('change_order_materials').delete().eq('change_order_id', corId),
        client.from('change_order_equipment').delete().eq('change_order_id', corId),
        client.from('change_order_subcontractors').delete().eq('change_order_id', corId)
      ])

      // Check for any errors
      for (const result of results) {
        if (result.error) {
          throw result.error
        }
      }
    } catch (error) {
      console.error('Error clearing COR line items:', error)
      throw error
    }
  },

  // Save all line items for a COR (clears existing and adds new)
  async saveCORLineItems(corId, { laborItems, materialItems, equipmentItems, subcontractorItems }) {
    if (isSupabaseConfigured) {
      // Clear existing line items first
      await this.clearCORLineItems(corId)

      // Add new line items
      const results = await Promise.all([
        laborItems?.length > 0 ? this.addBulkLaborItems(corId, laborItems) : [],
        materialItems?.length > 0 ? this.addBulkMaterialItems(corId, materialItems) : [],
        equipmentItems?.length > 0 ? this.addBulkEquipmentItems(corId, equipmentItems) : [],
        subcontractorItems?.length > 0 ? this.addBulkSubcontractorItems(corId, subcontractorItems) : []
      ])

      return {
        labor: results[0],
        materials: results[1],
        equipment: results[2],
        subcontractors: results[3]
      }
    }
    return null
  },

  // ============================================
  // Ticket-COR Associations (Atomic Operations)
  // ============================================

  async assignTicketToCOR(ticketId, corId) {
    if (isSupabaseConfigured) {
      // Use atomic database function to ensure both junction table and FK stay in sync
      const { error } = await supabase.rpc('assign_ticket_to_cor', {
        p_ticket_id: ticketId,
        p_cor_id: corId
      })
      if (error) {
        observe.error('database', { message: error.message, operation: 'assignTicketToCOR', extra: { ticketId, corId } })
        throw error
      }
      return { ticket_id: ticketId, change_order_id: corId }
    }
    return null
  },

  async unassignTicketFromCOR(ticketId, corId) {
    if (isSupabaseConfigured) {
      // Use atomic database function to ensure both junction table and FK stay in sync
      const { error } = await supabase.rpc('unassign_ticket_from_cor', {
        p_ticket_id: ticketId,
        p_cor_id: corId
      })
      if (error) {
        observe.error('database', { message: error.message, operation: 'unassignTicketFromCOR', extra: { ticketId, corId } })
        throw error
      }
    }
  },

  // Check for data integrity issues between dual associations
  async checkTicketCORIntegrity() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('check_ticket_cor_integrity')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Fix any existing data integrity issues
  async fixTicketCORIntegrity() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('fix_ticket_cor_integrity')
      if (error) throw error
      return data
    }
    return 0
  },

  async getTicketsForCOR(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_order_ticket_associations')
        .select(`
          *,
          t_and_m_tickets (
            *,
            t_and_m_workers (*),
            t_and_m_items (
              *,
              materials_equipment (name, unit, cost_per_unit, category)
            )
          )
        `)
        .eq('change_order_id', corId)
      if (error) throw error
      return data
    }
    return []
  },

  async getUnassignedTickets(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
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
        .is('assigned_cor_id', null)
        .order('work_date', { ascending: false })
      if (error) throw error
      return data
    }
    return []
  },

  async importTicketDataToCOR(ticketId, corId, companyId, workType, jobType) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      // 1. Get ticket with workers and items
      const { data: ticket, error: ticketError } = await client
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (name, unit, cost_per_unit, category)
          )
        `)
        .eq('id', ticketId)
        .single()
      if (ticketError) throw ticketError

      // 2. Get labor rates for this company/work type/job type
      const { data: rates, error: ratesError } = await client
        .from('labor_rates')
        .select('*')
        .eq('company_id', companyId)
        .eq('work_type', workType || 'demolition')
        .eq('job_type', jobType || 'standard')
      if (ratesError) throw ratesError

      // Create rate lookup
      const rateLookup = {}
      rates?.forEach(rate => {
        rateLookup[rate.role.toLowerCase()] = rate
      })

      // 3. Group workers by role and sum hours
      const laborByRole = {}
      ticket.t_and_m_workers?.forEach(worker => {
        const role = (worker.role || 'laborer').toLowerCase()
        if (!laborByRole[role]) {
          laborByRole[role] = { regular_hours: 0, overtime_hours: 0 }
        }
        laborByRole[role].regular_hours += parseFloat(worker.hours) || 0
        laborByRole[role].overtime_hours += parseFloat(worker.overtime_hours) || 0
      })

      // 4. Create labor items
      const laborItems = Object.entries(laborByRole).map(([role, hours]) => {
        const rate = rateLookup[role] || { regular_rate: 0, overtime_rate: 0 }
        // Convert dollar rates to cents
        const regRate = Math.round((parseFloat(rate.regular_rate) || 0) * 100)
        const otRate = Math.round((parseFloat(rate.overtime_rate) || 0) * 100)
        return {
          labor_class: role.charAt(0).toUpperCase() + role.slice(1),
          wage_type: jobType || 'standard',
          regular_hours: hours.regular_hours,
          overtime_hours: hours.overtime_hours,
          regular_rate: regRate,
          overtime_rate: otRate,
          source_ticket_id: ticketId
        }
      })

      if (laborItems.length > 0) {
        await this.addBulkLaborItems(corId, laborItems)
      }

      // 5. Get materials/equipment from t_and_m_items
      const materialItems = []
      const equipmentItems = []

      ticket.t_and_m_items?.forEach(item => {
        const name = item.custom_name || item.materials_equipment?.name || 'Unknown Item'
        const category = item.custom_category || item.materials_equipment?.category || 'Other'
        const unit = item.materials_equipment?.unit || 'each'
        // Convert dollar cost to cents
        const unitCost = Math.round((parseFloat(item.materials_equipment?.cost_per_unit) || 0) * 100)

        const lineItem = {
          description: name,
          quantity: item.quantity || 1,
          unit: unit,
          unit_cost: unitCost,
          source_type: 'backup_sheet',
          source_ticket_id: ticketId
        }

        if (category === 'Equipment') {
          equipmentItems.push(lineItem)
        } else {
          materialItems.push(lineItem)
        }
      })

      if (materialItems.length > 0) {
        await this.addBulkMaterialItems(corId, materialItems)
      }
      if (equipmentItems.length > 0) {
        await this.addBulkEquipmentItems(corId, equipmentItems)
      }

      // 6. Mark association as data_imported and import_status completed
      const { error: updateError } = await client
        .from('change_order_ticket_associations')
        .update({
          data_imported: true,
          imported_at: new Date().toISOString(),
          import_status: 'completed',
          import_failed_at: null,
          import_error: null
        })
        .eq('change_order_id', corId)
        .eq('ticket_id', ticketId)
      if (updateError) throw updateError

      observe.activity('cor_import_success', { ticket_id: ticketId, cor_id: corId, labor_count: laborItems.length, material_count: materialItems.length, equipment_count: equipmentItems.length })
      return { laborItems, materialItems, equipmentItems }
    }
    return null
  },

  async reimportTicketDataToCOR(ticketId, corId, companyId, workType, jobType) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      // Delete existing line items from this ticket
      await client
        .from('change_order_labor')
        .delete()
        .eq('change_order_id', corId)
        .eq('source_ticket_id', ticketId)

      await client
        .from('change_order_materials')
        .delete()
        .eq('change_order_id', corId)
        .eq('source_ticket_id', ticketId)

      await client
        .from('change_order_equipment')
        .delete()
        .eq('change_order_id', corId)
        .eq('source_ticket_id', ticketId)

      // Re-import fresh data
      return this.importTicketDataToCOR(ticketId, corId, companyId, workType, jobType)
    }
    return null
  },

  // Mark a ticket import as failed (for retry tracking)
  async markImportFailed(ticketId, corId, errorMessage = 'Import failed') {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      const { error } = await client
        .from('change_order_ticket_associations')
        .update({
          import_status: 'failed',
          import_failed_at: new Date().toISOString(),
          import_error: errorMessage
        })
        .eq('change_order_id', corId)
        .eq('ticket_id', ticketId)
      if (error) {
        observe.error('database', { message: error.message, operation: 'markImportFailed', extra: { ticketId, corId } })
        throw error
      }
      observe.error('cor_import_failed', { ticket_id: ticketId, cor_id: corId, error: errorMessage })
    }
  },

  // Get tickets with failed imports for a project (for retry UI)
  async getTicketsNeedingImport(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('t_and_m_tickets')
        .select(`
          id,
          work_date,
          ce_pco_number,
          assigned_cor_id,
          change_order_ticket_associations!inner (
            change_order_id,
            import_status,
            import_failed_at,
            import_error
          )
        `)
        .eq('project_id', projectId)
        .eq('change_order_ticket_associations.import_status', 'failed')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Get import status for a specific ticket-COR association
  async getTicketImportStatus(ticketId, corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_order_ticket_associations')
        .select('import_status, import_failed_at, import_error, data_imported')
        .eq('ticket_id', ticketId)
        .eq('change_order_id', corId)
        .single()
      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
      return data
    }
    return null
  },

  // ============================================
  // COR Calculations
  // ============================================

  async recalculateCOR(corId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('recalculate_cor_totals', { cor_id: corId })
      if (error) throw error

      // Return updated COR
      return this.getCORById(corId)
    }
    return null
  },

  async updateCORMarkupPercentages(corId, percentages) {
    if (isSupabaseConfigured) {
      const updates = {}
      if (percentages.labor !== undefined) updates.labor_markup_percent = percentages.labor
      if (percentages.materials !== undefined) updates.materials_markup_percent = percentages.materials
      if (percentages.equipment !== undefined) updates.equipment_markup_percent = percentages.equipment
      if (percentages.subcontractors !== undefined) updates.subcontractors_markup_percent = percentages.subcontractors

      const { data, error } = await supabase
        .from('change_orders')
        .update(updates)
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error

      // Trigger recalculation happens via database trigger
      return data
    }
    return null
  },

  async updateCORFeePercentages(corId, percentages) {
    if (isSupabaseConfigured) {
      const updates = {}
      if (percentages.liabilityInsurance !== undefined) updates.liability_insurance_percent = percentages.liabilityInsurance
      if (percentages.bond !== undefined) updates.bond_percent = percentages.bond
      if (percentages.licenseFee !== undefined) updates.license_fee_percent = percentages.licenseFee

      const { data, error } = await supabase
        .from('change_orders')
        .update(updates)
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error

      // Trigger recalculation happens via database trigger
      return data
    }
    return null
  },

  // ============================================
  // COR Status & Workflow
  // ============================================

  async submitCORForApproval(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status: 'pending_approval',
          submitted_at: new Date().toISOString()
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async approveCOR(corId, userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString()
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async rejectCOR(corId, reason = null) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status: 'rejected',
          rejection_reason: reason
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async markCORAsBilled(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({ status: 'billed' })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async closeCOR(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({ status: 'closed' })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async saveCORSignature(corId, signatureData, signerName) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          gc_signature_data: signatureData,
          gc_signature_name: signerName,
          gc_signature_date: new Date().toISOString(),
          status: 'approved' // Auto-approve when signed
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // ============================================
  // COR Stats & Analytics
  // ============================================

  async getCORStats(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .select('status, cor_total')
        .eq('project_id', projectId)

      if (error) throw error

      const stats = {
        total_cors: data.length,
        draft_count: 0,
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
        billed_count: 0,
        total_approved_value: 0,
        total_pending_value: 0,
        total_billed_value: 0
      }

      data.forEach(cor => {
        switch (cor.status) {
          case 'draft':
            stats.draft_count++
            break
          case 'pending_approval':
            stats.pending_count++
            stats.total_pending_value += cor.cor_total || 0
            break
          case 'approved':
            stats.approved_count++
            stats.total_approved_value += cor.cor_total || 0
            break
          case 'rejected':
            stats.rejected_count++
            break
          case 'billed':
          case 'closed':
            stats.billed_count++
            stats.total_billed_value += cor.cor_total || 0
            break
        }
      })

      return stats
    }
    return {
      total_cors: 0,
      draft_count: 0,
      pending_count: 0,
      approved_count: 0,
      rejected_count: 0,
      billed_count: 0,
      total_approved_value: 0,
      total_pending_value: 0,
      total_billed_value: 0
    }
  },

  // Subscribe to COR updates for a project
  subscribeToCORs(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`change_orders:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'change_orders', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to T&M ticket associations for a specific COR
  // Fires when tickets are added to or removed from a COR
  subscribeToCorTickets(corId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`cor-tickets:${corId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'change_order_ticket_associations', filter: `change_order_id=eq.${corId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // ============================================
  // COR Log Functions
  // ============================================

  // Get COR Log entries with joined COR data for a project
  async getCORLog(projectId) {
    if (isSupabaseConfigured) {
      // Direct query with join to avoid RPC type issues
      const { data, error } = await supabase
        .from('cor_log_entries')
        .select(`
          id,
          log_number,
          date_sent_to_client,
          ce_number,
          comments,
          created_at,
          updated_at,
          change_order:change_orders (
            id,
            cor_number,
            title,
            cor_total,
            status,
            created_at,
            approved_at,
            approved_by
          )
        `)
        .eq('project_id', projectId)
        .order('log_number', { ascending: true })

      if (error) {
        console.error('Error fetching COR log:', error)
        throw error
      }

      // Transform to match expected format
      return (data || []).map(row => ({
        id: row.id,
        logNumber: row.log_number,
        dateSentToClient: row.date_sent_to_client,
        ceNumber: row.ce_number,
        comments: row.comments,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        changeOrder: {
          id: row.change_order?.id,
          corNumber: row.change_order?.cor_number,
          title: row.change_order?.title,
          corTotal: row.change_order?.cor_total,
          status: row.change_order?.status,
          createdAt: row.change_order?.created_at,
          approvedAt: row.change_order?.approved_at,
          approvedBy: row.change_order?.approved_by
        }
      }))
    }
    return []
  },

  // Update user-editable COR Log entry fields
  async updateCORLogEntry(entryId, updates) {
    if (isSupabaseConfigured) {
      const updateData = {
        updated_at: new Date().toISOString()
      }

      // Only include fields that are provided
      if (updates.dateSentToClient !== undefined) {
        updateData.date_sent_to_client = updates.dateSentToClient || null
      }
      if (updates.ceNumber !== undefined) {
        updateData.ce_number = updates.ceNumber || null
      }
      if (updates.comments !== undefined) {
        updateData.comments = updates.comments || null
      }

      const { data, error } = await supabase
        .from('cor_log_entries')
        .update(updateData)
        .eq('id', entryId)
        .select()
        .single()

      if (error) {
        console.error('Error updating COR log entry:', error)
        throw error
      }

      return data
    }
    return null
  },

  // Update change order status
  async updateChangeOrderStatus(changeOrderId, status) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', changeOrderId)
        .select()
        .single()

      if (error) {
        console.error('Error updating change order status:', error)
        throw error
      }

      return data
    }
    return null
  },

  // Subscribe to COR log changes for a project
  subscribeToCORLog(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`cor-log:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'cor_log_entries', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to document changes for a project
  // Fires when documents are uploaded, updated, or archived
  subscribeToDocuments(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`documents:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'documents', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to document folder changes for a project
  subscribeToDocumentFolders(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`document_folders:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'document_folders', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to materials/equipment changes for a company
  subscribeToMaterialsEquipment(companyId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`materials_equipment:${companyId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'materials_equipment', filter: `company_id=eq.${companyId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to labor rate changes for a company
  subscribeToLaborRates(companyId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`labor_rates:${companyId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'labor_rates', filter: `company_id=eq.${companyId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to project-level changes (name, dates, budget, etc.)
  subscribeToProject(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`project:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // ============================================
  // Signature Workflow Functions
  // ============================================

  // Create a signature request for a document (COR or T&M)
  async createSignatureRequest(documentType, documentId, companyId, projectId, createdBy = null, expiresAt = null) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      // Generate a unique token using the database function
      const { data: tokenResult, error: tokenError } = await client.rpc('generate_signature_token')
      if (tokenError) throw tokenError

      const { data, error } = await client
        .from('signature_requests')
        .insert({
          document_type: documentType,
          document_id: documentId,
          company_id: companyId,
          project_id: projectId,
          signature_token: tokenResult,
          expires_at: expiresAt,
          created_by: createdBy
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Get signature request by token (for public signing page)
  async getSignatureRequestByToken(token) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      // Increment view count
      await client.rpc('increment_signature_view_count', { token })

      const { data, error } = await client
        .from('signature_requests')
        .select(`
          *,
          signatures (*)
        `)
        .eq('signature_token', token)
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Get all signature requests for a document
  async getSignatureRequestsForDocument(documentType, documentId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      const { data, error } = await client
        .from('signature_requests')
        .select(`
          *,
          signatures (*)
        `)
        .eq('document_type', documentType)
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }
    return []
  },

  // Add a signature to a request
  async addSignature(requestId, slot, signatureData) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      const { data, error } = await client
        .from('signatures')
        .insert({
          signature_request_id: requestId,
          signature_slot: slot,
          signature_image: signatureData.signature,
          signer_name: signatureData.signerName,
          signer_title: signatureData.signerTitle || null,
          signer_company: signatureData.signerCompany || null,
          signed_at: signatureData.signedAt || new Date().toISOString(),
          ip_address: signatureData.ipAddress || null,
          user_agent: signatureData.userAgent || null
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Sync signature to the main document table (COR or T&M)
  async syncSignatureToDocument(signature, signatureRequest) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { document_type, document_id } = signatureRequest
    const slot = signature.signature_slot

    // Build update object based on slot
    const updates = {}
    if (slot === 1) {
      // GC signature
      updates.gc_signature_data = signature.signature_image
      updates.gc_signature_name = signature.signer_name
      updates.gc_signature_title = signature.signer_title
      updates.gc_signature_company = signature.signer_company
      updates.gc_signature_date = signature.signed_at
      updates.gc_signature_ip = signature.ip_address
    } else if (slot === 2) {
      // Client signature
      updates.client_signature_data = signature.signature_image
      updates.client_signature_name = signature.signer_name
      updates.client_signature_title = signature.signer_title
      updates.client_signature_company = signature.signer_company
      updates.client_signature_date = signature.signed_at
      updates.client_signature_ip = signature.ip_address
    }

    const tableName = document_type === 'cor' ? 'change_orders' : 't_and_m_tickets'
    const { data, error } = await client
      .from(tableName)
      .update(updates)
      .eq('id', document_id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Revoke a signature request
  async revokeSignatureRequest(requestId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }

      const { data, error } = await client
        .from('signature_requests')
        .update({ status: 'revoked' })
        .eq('id', requestId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Send signature request email to client via Supabase Edge Function
  async sendSignatureEmail({ to, clientName, documentTitle, documentType, signingLink, expiresAt, expiresInDays }) {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured')

    const { data, error } = await supabase.functions.invoke('send-signature-email', {
      body: { to, clientName, documentTitle, documentType, signingLink, expiresAt, expiresInDays }
    })

    if (error) throw error
    return data
  },

  // Get document data for signature page (COR or T&M with project info)
  async getDocumentForSigning(documentType, documentId) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    if (documentType === 'cor') {
      const { data, error } = await client
        .from('change_orders')
        .select(`
          *,
          projects (
            id,
            name,
            job_number,
            companies (
              id,
              name,
              logo_url
            )
          ),
          change_order_labor (*),
          change_order_materials (*),
          change_order_equipment (*),
          change_order_subcontractors (*)
        `)
        .eq('id', documentId)
        .single()
      if (error) throw error
      return data
    } else if (documentType === 'tm_ticket') {
      const { data, error } = await client
        .from('t_and_m_tickets')
        .select(`
          *,
          projects (
            id,
            name,
            job_number,
            companies (
              id,
              name,
              logo_url
            )
          ),
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (
              id,
              name,
              unit,
              cost_per_unit,
              category
            )
          )
        `)
        .eq('id', documentId)
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // ============================================
  // Project Costs (Custom Cost Contributors)
  // ============================================

  // Get all custom costs for a project
  async getProjectCosts(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_costs')
        .select('*')
        .eq('project_id', projectId)
        .order('cost_date', { ascending: false })
      if (error) {
        console.error('Error fetching project costs:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.projectCosts || [])
      .filter(c => c.project_id === projectId)
      .sort((a, b) => new Date(b.cost_date) - new Date(a.cost_date))
  },

  // Add a new custom cost
  async addProjectCost(projectId, companyId, costData) {
    const cost = {
      project_id: projectId,
      company_id: companyId,
      category: costData.category,
      description: costData.description,
      amount: parseFloat(costData.amount),
      cost_date: costData.cost_date || new Date().toISOString().split('T')[0],
      notes: costData.notes || null,
      created_by: costData.created_by || null
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_costs')
        .insert(cost)
        .select()
        .single()
      if (error) {
        console.error('Error adding project cost:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.projectCosts) localData.projectCosts = []
    const newCost = {
      ...cost,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    localData.projectCosts.push(newCost)
    setLocalData(localData)
    return newCost
  },

  // Update an existing cost
  async updateProjectCost(costId, costData) {
    const updates = {
      category: costData.category,
      description: costData.description,
      amount: parseFloat(costData.amount),
      cost_date: costData.cost_date,
      notes: costData.notes || null,
      updated_at: new Date().toISOString()
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_costs')
        .update(updates)
        .eq('id', costId)
        .select()
        .single()
      if (error) {
        console.error('Error updating project cost:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.projectCosts) return null
    const index = localData.projectCosts.findIndex(c => c.id === costId)
    if (index === -1) return null
    localData.projectCosts[index] = { ...localData.projectCosts[index], ...updates }
    setLocalData(localData)
    return localData.projectCosts[index]
  },

  // Delete a cost
  async deleteProjectCost(costId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('project_costs')
        .delete()
        .eq('id', costId)
      if (error) {
        console.error('Error deleting project cost:', error)
        throw error
      }
      return true
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.projectCosts) return true
    localData.projectCosts = localData.projectCosts.filter(c => c.id !== costId)
    setLocalData(localData)
    return true
  },

  // Get costs summary aggregated by category
  async getProjectCostsSummary(projectId) {
    const costs = await this.getProjectCosts(projectId)

    const byCategory = {}
    let totalCost = 0

    costs.forEach(cost => {
      const amount = parseFloat(cost.amount) || 0
      totalCost += amount

      if (!byCategory[cost.category]) {
        byCategory[cost.category] = {
          category: cost.category,
          total: 0,
          count: 0,
          items: []
        }
      }
      byCategory[cost.category].total += amount
      byCategory[cost.category].count++
      byCategory[cost.category].items.push(cost)
    })

    // Calculate percentages
    Object.values(byCategory).forEach(cat => {
      cat.percentage = totalCost > 0 ? (cat.total / totalCost) * 100 : 0
    })

    return {
      totalCost,
      byCategory,
      itemCount: costs.length
    }
  },

  // ============================================
  // Invoices
  // ============================================

  // Get next invoice number for a company
  async getNextInvoiceNumber(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('get_next_invoice_number', {
        p_company_id: companyId
      })
      if (error) {
        console.error('Error getting next invoice number:', error)
        // Fallback: generate locally
        return this._generateLocalInvoiceNumber(companyId)
      }
      return data
    }
    return this._generateLocalInvoiceNumber(companyId)
  },

  async _generateLocalInvoiceNumber(companyId) {
    const invoices = await this.getCompanyInvoices(companyId)
    const maxNum = invoices.reduce((max, inv) => {
      const match = inv.invoice_number?.match(/^INV-(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        return num > max ? num : max
      }
      return max
    }, 0)
    return `INV-${String(maxNum + 1).padStart(4, '0')}`
  },

  // Get billable items for a project (approved CORs and T&M not yet billed)
  async getBillableItems(projectId) {
    if (isSupabaseConfigured) {
      // Get approved CORs that haven't been billed
      const { data: cors, error: corsError } = await supabase
        .from('change_orders')
        .select('id, cor_number, title, cor_total, status, approved_at')
        .eq('project_id', projectId)
        .eq('status', 'approved')
        .order('cor_number', { ascending: true })

      if (corsError) {
        console.error('Error fetching billable CORs:', corsError)
      }

      // Get approved T&M tickets with client signature that haven't been billed
      const { data: tickets, error: ticketsError } = await supabase
        .from('t_and_m_tickets')
        .select('id, work_date, ce_pco_number, change_order_value, status, client_signature_date')
        .eq('project_id', projectId)
        .eq('status', 'approved')
        .not('client_signature_data', 'is', null)
        .order('work_date', { ascending: true })

      if (ticketsError) {
        console.error('Error fetching billable T&M tickets:', ticketsError)
      }

      return {
        cors: cors || [],
        tickets: tickets || []
      }
    }
    // Demo mode
    return { cors: [], tickets: [] }
  },

  // Get all invoices for a project
  async getProjectInvoices(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          invoice_items (*)
        `)
        .eq('project_id', projectId)
        .order('invoice_date', { ascending: false })

      if (error) {
        console.error('Error fetching project invoices:', error)
        throw error
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.invoices || []).filter(i => i.project_id === projectId)
  },

  // Get all invoices for a company
  async getCompanyInvoices(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', companyId)
        .order('invoice_date', { ascending: false })

      if (error) {
        console.error('Error fetching company invoices:', error)
        throw error
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.invoices || []).filter(i => i.company_id === companyId)
  },

  // Create a new invoice with line items
  async createInvoice(invoice, items) {
    if (isSupabaseConfigured) {
      // Start by creating the invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          project_id: invoice.project_id,
          company_id: invoice.company_id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          status: invoice.status || 'draft',
          retention_percent: invoice.retention_percent || 0,
          bill_to_name: invoice.bill_to_name,
          bill_to_address: invoice.bill_to_address,
          bill_to_contact: invoice.bill_to_contact,
          notes: invoice.notes,
          terms: invoice.terms || 'Net 30',
          created_by: invoice.created_by
        })
        .select()
        .single()

      if (invoiceError) {
        console.error('Error creating invoice:', invoiceError)
        throw invoiceError
      }

      // Now add line items
      if (items && items.length > 0) {
        const itemsToInsert = items.map((item, index) => ({
          invoice_id: invoiceData.id,
          item_type: item.item_type,
          reference_id: item.reference_id,
          reference_number: item.reference_number,
          description: item.description,
          amount: item.amount,
          sort_order: index
        }))

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert)

        if (itemsError) {
          console.error('Error creating invoice items:', itemsError)
          // Delete the invoice if items failed
          await supabase.from('invoices').delete().eq('id', invoiceData.id)
          throw itemsError
        }
      }

      // Fetch the complete invoice with items
      return this.getInvoice(invoiceData.id)
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.invoices) localData.invoices = []
    const newInvoice = {
      ...invoice,
      id: generateTempId(),
      created_at: new Date().toISOString(),
      invoice_items: items || []
    }
    localData.invoices.push(newInvoice)
    setLocalData(localData)
    return newInvoice
  },

  // Get a single invoice by ID
  async getInvoice(invoiceId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          invoice_items (*)
        `)
        .eq('id', invoiceId)
        .single()

      if (error) {
        console.error('Error fetching invoice:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.invoices || []).find(i => i.id === invoiceId)
  },

  // Update invoice
  async updateInvoice(invoiceId, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .select()
        .single()

      if (error) {
        console.error('Error updating invoice:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    const index = (localData.invoices || []).findIndex(i => i.id === invoiceId)
    if (index >= 0) {
      localData.invoices[index] = { ...localData.invoices[index], ...updates }
      setLocalData(localData)
      return localData.invoices[index]
    }
    return null
  },

  // Mark invoice as sent
  async markInvoiceSent(invoiceId) {
    return this.updateInvoice(invoiceId, {
      status: 'sent',
      sent_at: new Date().toISOString()
    })
  },

  // Record payment on invoice
  async recordInvoicePayment(invoiceId, paymentAmount) {
    const invoice = await this.getInvoice(invoiceId)
    if (!invoice) throw new Error('Invoice not found')

    const newAmountPaid = (invoice.amount_paid || 0) + paymentAmount
    const isPaidInFull = newAmountPaid >= invoice.total

    return this.updateInvoice(invoiceId, {
      amount_paid: newAmountPaid,
      status: isPaidInFull ? 'paid' : 'partial',
      paid_at: isPaidInFull ? new Date().toISOString() : null
    })
  },

  // Delete invoice (only draft invoices)
  async deleteInvoice(invoiceId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)
        .eq('status', 'draft') // RLS also enforces this

      if (error) {
        console.error('Error deleting invoice:', error)
        throw error
      }
      return true
    }
    // Demo mode
    const localData = getLocalData()
    localData.invoices = (localData.invoices || []).filter(i => i.id !== invoiceId)
    setLocalData(localData)
    return true
  },

  // Mark CORs and T&M tickets as billed after creating invoice
  async markItemsBilled(corIds = [], tmIds = []) {
    if (isSupabaseConfigured) {
      // Update CORs to 'billed' status
      if (corIds.length > 0) {
        const { error: corsError } = await supabase
          .from('change_orders')
          .update({ status: 'billed' })
          .in('id', corIds)

        if (corsError) {
          console.error('Error marking CORs as billed:', corsError)
        }
      }

      // Update T&M tickets to 'billed' status
      if (tmIds.length > 0) {
        const { error: tmError } = await supabase
          .from('t_and_m_tickets')
          .update({ status: 'billed' })
          .in('id', tmIds)

        if (tmError) {
          console.error('Error marking T&M tickets as billed:', tmError)
        }
      }
    }
  },
}
