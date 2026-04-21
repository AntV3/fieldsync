import { supabase, isSupabaseConfigured } from './client'

// Default trade config used when no config exists (backward compatibility)
const DEFAULT_TRADE_CONFIG = {
  trade_template_id: null,
  trade_name: null,
  worker_roles: null,
  document_categories: null,
  field_actions: null,
  dashboard_widgets: null,
  custom_fields: null,
  kpis: null,
  enable_truck_load_tracking: null
}

export const tradeOps = {
  // ============================================
  // Trade Templates (read-only starter presets)
  // ============================================

  async getTradeTemplates() {
    if (!isSupabaseConfigured) {
      return getLocalTradeTemplates()
    }

    const { data, error } = await supabase
      .from('trade_templates')
      .select('*')
      .order('name')

    if (error) {
      console.error('Error fetching trade templates:', error)
      return []
    }
    return data || []
  },

  // ============================================
  // Company Trade Config
  // ============================================

  async getCompanyTradeConfig(companyId) {
    if (!isSupabaseConfigured) {
      const stored = localStorage.getItem(`trade_config_${companyId}`)
      return stored ? JSON.parse(stored) : null
    }

    const { data, error } = await supabase
      .from('company_trade_config')
      .select('*, trade_templates(*)')
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching company trade config:', error)
      return null
    }
    return data
  },

  async setCompanyTradeConfig(companyId, config) {
    if (!isSupabaseConfigured) {
      const stored = { ...DEFAULT_TRADE_CONFIG, ...config, company_id: companyId }
      localStorage.setItem(`trade_config_${companyId}`, JSON.stringify(stored))
      return { success: true, data: stored }
    }

    // Check if config exists
    const { data: existing } = await supabase
      .from('company_trade_config')
      .select('id')
      .eq('company_id', companyId)
      .maybeSingle()

    if (existing) {
      // Update
      const { data, error } = await supabase
        .from('company_trade_config')
        .update(config)
        .eq('company_id', companyId)
        .select('*, trade_templates(*)')
        .single()

      if (error) {
        console.error('Error updating company trade config:', error)
        return { success: false, error: error.message }
      }
      return { success: true, data }
    } else {
      // Insert
      const { data, error } = await supabase
        .from('company_trade_config')
        .insert({ company_id: companyId, ...config })
        .select('*, trade_templates(*)')
        .single()

      if (error) {
        console.error('Error creating company trade config:', error)
        return { success: false, error: error.message }
      }
      return { success: true, data }
    }
  },

  // ============================================
  // Project Trade Overrides
  // ============================================

  async getProjectTradeOverrides(projectId) {
    if (!isSupabaseConfigured) {
      const stored = localStorage.getItem(`trade_overrides_${projectId}`)
      return stored ? JSON.parse(stored) : null
    }

    const { data, error } = await supabase
      .from('project_trade_overrides')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching project trade overrides:', error)
      return null
    }
    return data
  },

  async setProjectTradeOverrides(projectId, overrides) {
    if (!isSupabaseConfigured) {
      const stored = { ...overrides, project_id: projectId }
      localStorage.setItem(`trade_overrides_${projectId}`, JSON.stringify(stored))
      return { success: true, data: stored }
    }

    const { data: existing } = await supabase
      .from('project_trade_overrides')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle()

    if (existing) {
      const { data, error } = await supabase
        .from('project_trade_overrides')
        .update(overrides)
        .eq('project_id', projectId)
        .select()
        .single()

      if (error) {
        console.error('Error updating project trade overrides:', error)
        return { success: false, error: error.message }
      }
      return { success: true, data }
    } else {
      const { data, error } = await supabase
        .from('project_trade_overrides')
        .insert({ project_id: projectId, ...overrides })
        .select()
        .single()

      if (error) {
        console.error('Error creating project trade overrides:', error)
        return { success: false, error: error.message }
      }
      return { success: true, data }
    }
  },

  // ============================================
  // Custom Field Data
  // ============================================

  async saveCustomFieldData(projectId, entityType, entityId, fields) {
    if (!isSupabaseConfigured) {
      const key = `custom_fields_${entityType}_${entityId}`
      localStorage.setItem(key, JSON.stringify(fields))
      return { success: true }
    }

    // Upsert each field value
    const upserts = Object.entries(fields).map(([fieldKey, fieldValue]) => ({
      project_id: projectId,
      entity_type: entityType,
      entity_id: entityId,
      field_key: fieldKey,
      field_value: JSON.stringify(fieldValue)
    }))

    if (upserts.length === 0) return { success: true }

    const { error } = await supabase
      .from('custom_field_data')
      .upsert(upserts, { onConflict: 'entity_id,field_key' })

    if (error) {
      console.error('Error saving custom field data:', error)
      return { success: false, error: error.message }
    }
    return { success: true }
  },

  async getCustomFieldData(entityType, entityId) {
    if (!isSupabaseConfigured) {
      const key = `custom_fields_${entityType}_${entityId}`
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : {}
    }

    const { data, error } = await supabase
      .from('custom_field_data')
      .select('field_key, field_value')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)

    if (error) {
      console.error('Error fetching custom field data:', error)
      return {}
    }

    // Convert array of {field_key, field_value} to object
    const result = {}
    for (const row of (data || [])) {
      result[row.field_key] = typeof row.field_value === 'string'
        ? JSON.parse(row.field_value)
        : row.field_value
    }
    return result
  },

  async getCustomFieldDataBulk(projectId, entityType) {
    if (!isSupabaseConfigured) return {}

    const { data, error } = await supabase
      .from('custom_field_data')
      .select('entity_id, field_key, field_value')
      .eq('project_id', projectId)
      .eq('entity_type', entityType)

    if (error) {
      console.error('Error fetching bulk custom field data:', error)
      return {}
    }

    // Group by entity_id
    const result = {}
    for (const row of (data || [])) {
      if (!result[row.entity_id]) result[row.entity_id] = {}
      result[row.entity_id][row.field_key] = typeof row.field_value === 'string'
        ? JSON.parse(row.field_value)
        : row.field_value
    }
    return result
  }
}

// ============================================
// Local/Demo mode fallback templates
// ============================================
function getLocalTradeTemplates() {
  return [
    {
      id: 'general_contractor',
      name: 'General Contractor',
      description: 'Multi-trade coordination and project management',
      icon: 'Building2',
      default_worker_roles: ['Superintendent', 'Foreman', 'Project Manager', 'Laborer', 'Operator'],
      default_custom_fields: {},
      default_kpis: []
    },
    {
      id: 'electrical',
      name: 'Electrical',
      description: 'Electrical installation, wiring, and panel work',
      icon: 'Zap',
      default_worker_roles: ['Foreman', 'Journeyman', 'Apprentice', 'Superintendent', 'Operator'],
      default_custom_fields: {},
      default_kpis: []
    },
    {
      id: 'hvac',
      name: 'Mechanical / HVAC',
      description: 'HVAC systems, ductwork, and refrigeration',
      icon: 'Wind',
      default_worker_roles: ['Foreman', 'Journeyman', 'Apprentice', 'Sheet Metal Worker', 'Pipefitter'],
      default_custom_fields: {},
      default_kpis: []
    },
    {
      id: 'concrete',
      name: 'Concrete',
      description: 'Concrete placement, forming, and finishing',
      icon: 'Layers',
      default_worker_roles: ['Foreman', 'Finisher', 'Form Carpenter', 'Laborer', 'Pump Operator', 'Rod Buster'],
      default_custom_fields: {},
      default_kpis: [],
      enable_truck_load_tracking: true
    }
  ]
}
