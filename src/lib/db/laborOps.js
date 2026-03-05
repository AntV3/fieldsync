/**
 * Materials/Equipment, Labor Categories, Labor Classes, and Rates operations.
 * Extracted from supabase.js for modularity.
 */

import { supabase, isSupabaseConfigured, getClient, sanitizeFormData, sanitize } from './client'

export const laborOps = {
  // ============================================
  // Materials & Equipment
  // ============================================

  async getMaterialsEquipment(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('materials_equipment')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('category')
        .order('name')
      if (error) throw error
      return data
    }
    return []
  },

  async getMaterialsEquipmentByCategory(companyId, category) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []
      const { data, error } = await client
        .from('materials_equipment')
        .select('*')
        .eq('company_id', companyId)
        .eq('category', category)
        .eq('active', true)
        .order('name')
      if (error) throw error
      return data
    }
    return []
  },

  async getAllMaterialsEquipment(companyId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []
      const { data, error } = await client
        .from('materials_equipment')
        .select('*')
        .eq('company_id', companyId)
        .order('category')
        .order('name')
      if (error) throw error
      return data
    }
    return []
  },

  async createMaterialEquipment(item) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('materials_equipment')
        .insert(sanitizeFormData(item))
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateMaterialEquipment(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('materials_equipment')
        .update(sanitizeFormData(updates))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteMaterialEquipment(id) {
    if (isSupabaseConfigured) {
      // Soft delete - just deactivate
      const { error } = await supabase
        .from('materials_equipment')
        .update({ active: false })
        .eq('id', id)
      if (error) throw error
    }
  },

  // ============================================
  // Labor Categories & Classes (Company-specific)
  // ============================================

  // Get all labor categories for a company
  async getLaborCategories(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_categories')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Create a new labor category
  async createLaborCategory(companyId, name, sortOrder = 0) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_categories')
        .insert({
          company_id: companyId,
          name: sanitize.text(name),
          sort_order: sortOrder
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Update a labor category
  async updateLaborCategory(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_categories')
        .update(sanitizeFormData(updates))
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Delete (soft) a labor category
  async deleteLaborCategory(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('labor_categories')
        .update({ active: false })
        .eq('id', id)
      if (error) throw error
    }
  },

  // Get all labor classes for a company (with category info)
  async getLaborClasses(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .select(`
          *,
          labor_categories (id, name)
        `)
        .eq('company_id', companyId)
        .eq('active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Get labor classes with categories in one call (office use - includes all data)
  async getLaborClassesWithCategories(companyId) {
    if (isSupabaseConfigured) {
      const [categoriesResult, classesResult] = await Promise.all([
        supabase
          .from('labor_categories')
          .select('*')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('sort_order')
          .order('name'),
        supabase
          .from('labor_classes')
          .select('*')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('sort_order')
          .order('name')
      ])

      if (categoriesResult.error) throw categoriesResult.error
      if (classesResult.error) throw classesResult.error

      return {
        categories: categoriesResult.data || [],
        classes: classesResult.data || []
      }
    }
    return { categories: [], classes: [] }
  },

  // Get labor classes for field users (NO RATES - names and categories only)
  // Use this for CrewCheckin and TMForm to prevent rate exposure
  async getLaborClassesForField(companyId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return { categories: [], classes: [] }

      // Use the secure RPC function that only returns non-sensitive fields
      const { data, error } = await client
        .rpc('get_labor_classes_for_field', { p_company_id: companyId })

      if (error) {
        console.error('Error loading field labor classes:', error)
        // Fallback to direct query if RPC not available (pre-migration)
        const [categoriesResult, classesResult] = await Promise.all([
          client
            .from('labor_categories')
            .select('id, name')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('name'),
          client
            .from('labor_classes')
            .select('id, name, category_id')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('name')
        ])

        return {
          categories: categoriesResult.data || [],
          classes: classesResult.data || []
        }
      }

      // Transform RPC result into categories + classes format
      const categoriesMap = new Map()
      const classes = []

      for (const row of (data || [])) {
        if (row.category_id && row.category_name && !categoriesMap.has(row.category_id)) {
          categoriesMap.set(row.category_id, { id: row.category_id, name: row.category_name })
        }
        classes.push({
          id: row.id,
          name: row.name,
          category_id: row.category_id
        })
      }

      return {
        categories: Array.from(categoriesMap.values()),
        classes
      }
    }
    return { categories: [], classes: [] }
  },

  // Create a new labor class
  async createLaborClass(companyId, categoryId, name, sortOrder = 0) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .insert({
          company_id: companyId,
          category_id: categoryId,
          name: sanitize.text(name),
          sort_order: sortOrder
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Update a labor class
  async updateLaborClass(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Delete (soft) a labor class
  async deleteLaborClass(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('labor_classes')
        .update({ active: false })
        .eq('id', id)
      if (error) throw error
    }
  },

  // Get rates for a specific labor class
  async getLaborClassRates(laborClassId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_class_rates')
        .select('*')
        .eq('labor_class_id', laborClassId)
      if (error) throw error
      return data || []
    }
    return []
  },

  // Get all rates for all classes in a company
  async getAllLaborClassRates(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .select(`
          id,
          name,
          labor_class_rates (*)
        `)
        .eq('company_id', companyId)
        .eq('active', true)
      if (error) throw error
      return data || []
    }
    return []
  },

  // Save rates for a labor class (upsert)
  async saveLaborClassRates(laborClassId, rates) {
    if (isSupabaseConfigured) {
      // rates is an array of { work_type, job_type, regular_rate, overtime_rate }
      const ratesWithClassId = rates.map(r => ({
        ...r,
        labor_class_id: laborClassId
      }))

      // Upsert rates - will insert or update based on unique constraint
      const { error } = await supabase
        .from('labor_class_rates')
        .upsert(ratesWithClassId, {
          onConflict: 'labor_class_id,work_type,job_type'
        })
      if (error) throw error
    }
  },

  // Get rate for a specific class/work_type/job_type combo (for cost calculations)
  async getLaborClassRate(laborClassId, workType, jobType) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_class_rates')
        .select('regular_rate, overtime_rate')
        .eq('labor_class_id', laborClassId)
        .eq('work_type', workType)
        .eq('job_type', jobType)
        .single()
      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
      return data || null
    }
    return null
  },
}
