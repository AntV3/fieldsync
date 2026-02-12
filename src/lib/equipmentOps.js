// Equipment tracking operations
// Extracted from supabase.js for maintainability

import { supabase, isSupabaseConfigured } from './supabaseClient'

export const equipmentOps = {
  // ----------------------------------------
  // Equipment Catalog (Company-level)
  // ----------------------------------------

  /**
   * Get all equipment in company catalog
   */
  async getCompanyEquipment(companyId, activeOnly = true) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return []
    }

    let query = supabase
      .from('equipment')
      .select('*')
      .eq('company_id', companyId)
      .order('name')

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching company equipment:', error)
      return []
    }

    return data || []
  },

  /**
   * Create equipment in company catalog
   */
  async createEquipment(equipment) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return null
    }

    const { data, error } = await supabase
      .from('equipment')
      .insert(equipment)
      .select()
      .single()

    if (error) {
      console.error('Error creating equipment:', error)
      throw error
    }

    return data
  },

  /**
   * Update equipment in catalog
   */
  async updateEquipment(equipmentId, updates) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return null
    }

    const { data, error } = await supabase
      .from('equipment')
      .update(updates)
      .eq('id', equipmentId)
      .select()
      .single()

    if (error) {
      console.error('Error updating equipment:', error)
      throw error
    }

    return data
  },

  /**
   * Deactivate equipment (soft delete)
   */
  async deactivateEquipment(equipmentId) {
    return this.updateEquipment(equipmentId, { is_active: false })
  },

  // ----------------------------------------
  // Project Equipment
  // ----------------------------------------

  /**
   * Get all equipment on a project
   */
  async getProjectEquipment(projectId) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return []
    }

    const { data, error } = await supabase
      .from('project_equipment')
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          description,
          is_owned
        )
      `)
      .eq('project_id', projectId)
      .order('start_date', { ascending: false })

    if (error) {
      console.error('Error fetching project equipment:', error)
      return []
    }

    return data || []
  },

  /**
   * Get equipment currently on site (no end_date)
   */
  async getActiveProjectEquipment(projectId) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return []
    }

    const { data, error } = await supabase
      .from('project_equipment')
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          description,
          is_owned
        )
      `)
      .eq('project_id', projectId)
      .is('end_date', null)
      .order('start_date', { ascending: false })

    if (error) {
      console.error('Error fetching active project equipment:', error)
      return []
    }

    return data || []
  },

  /**
   * Add equipment to a project
   */
  async addEquipmentToProject(projectEquipment) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return null
    }

    const { data, error } = await supabase
      .from('project_equipment')
      .insert(projectEquipment)
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          description,
          is_owned
        )
      `)
      .single()

    if (error) {
      console.error('Error adding equipment to project:', error)
      throw error
    }

    return data
  },

  /**
   * Update project equipment
   */
  async updateProjectEquipment(projectEquipmentId, updates) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return null
    }

    const { data, error } = await supabase
      .from('project_equipment')
      .update(updates)
      .eq('id', projectEquipmentId)
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          description,
          is_owned
        )
      `)
      .single()

    if (error) {
      console.error('Error updating project equipment:', error)
      throw error
    }

    return data
  },

  /**
   * Mark equipment as returned (set end_date)
   */
  async markEquipmentReturned(projectEquipmentId, endDate = null) {
    return this.updateProjectEquipment(projectEquipmentId, {
      end_date: endDate || new Date().toISOString().split('T')[0]
    })
  },

  /**
   * Delete project equipment record
   */
  async removeEquipmentFromProject(projectEquipmentId) {
    if (!isSupabaseConfigured) {
      console.warn('Supabase not configured')
      return false
    }

    const { error } = await supabase
      .from('project_equipment')
      .delete()
      .eq('id', projectEquipmentId)

    if (error) {
      console.error('Error removing project equipment:', error)
      throw error
    }

    return true
  },

  /**
   * Calculate total equipment cost for a project
   */
  calculateProjectEquipmentCost(projectEquipment) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return projectEquipment.reduce((total, eq) => {
      const startDate = new Date(eq.start_date)
      startDate.setHours(0, 0, 0, 0)

      let endDate
      if (eq.end_date) {
        endDate = new Date(eq.end_date)
        endDate.setHours(0, 0, 0, 0)
      } else {
        endDate = today
      }

      // Calculate days (inclusive)
      const days = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1)

      return total + (eq.daily_rate * days)
    }, 0)
  },

  /**
   * Calculate days on site for a single equipment entry
   */
  calculateDaysOnSite(startDate, endDate = null) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)

    let end
    if (endDate) {
      end = new Date(endDate)
    } else {
      end = new Date()
    }
    end.setHours(0, 0, 0, 0)

    return Math.max(1, Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1)
  }
}
