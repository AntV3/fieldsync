import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { db } from './supabase'
import { WORKER_ROLES, DOCUMENT_CATEGORIES } from './constants'

const TradeConfigContext = createContext()

// Fallback config using existing hardcoded constants
const FALLBACK_CONFIG = {
  trade_template_id: null,
  trade_name: null,
  worker_roles: Object.values(WORKER_ROLES),
  document_categories: DOCUMENT_CATEGORIES,
  field_actions: ['crew', 'tm', 'report', 'progress', 'docs', 'punchlist', 'injury'],
  dashboard_widgets: ['progress_gauge', 'financial_card', 'crew_metrics', 'earned_value'],
  custom_fields: {},
  kpis: [],
  enable_truck_load_tracking: false
}

/**
 * Merges trade config with three-tier priority:
 * trade template defaults → company config (non-null) → project overrides (non-null)
 */
function mergeTradeConfig(template, companyConfig, projectOverrides) {
  const base = { ...FALLBACK_CONFIG }

  // Layer 1: Template defaults
  if (template) {
    if (template.default_worker_roles?.length) base.worker_roles = template.default_worker_roles
    if (template.default_document_categories?.length) base.document_categories = template.default_document_categories
    if (template.default_field_actions?.length) base.field_actions = template.default_field_actions
    if (template.default_dashboard_widgets?.length) base.dashboard_widgets = template.default_dashboard_widgets
    if (template.default_custom_fields && Object.keys(template.default_custom_fields).length) base.custom_fields = template.default_custom_fields
    if (template.default_kpis?.length) base.kpis = template.default_kpis
    if (template.enable_truck_load_tracking != null) base.enable_truck_load_tracking = template.enable_truck_load_tracking
  }

  // Layer 2: Company overrides
  if (companyConfig) {
    base.trade_template_id = companyConfig.trade_template_id
    base.trade_name = companyConfig.trade_name
    if (companyConfig.worker_roles) base.worker_roles = companyConfig.worker_roles
    if (companyConfig.document_categories) base.document_categories = companyConfig.document_categories
    if (companyConfig.field_actions) base.field_actions = companyConfig.field_actions
    if (companyConfig.dashboard_widgets) base.dashboard_widgets = companyConfig.dashboard_widgets
    if (companyConfig.custom_fields) base.custom_fields = companyConfig.custom_fields
    if (companyConfig.kpis) base.kpis = companyConfig.kpis
    if (companyConfig.enable_truck_load_tracking != null) base.enable_truck_load_tracking = companyConfig.enable_truck_load_tracking
  }

  // Layer 3: Project overrides
  if (projectOverrides) {
    if (projectOverrides.field_actions) base.field_actions = projectOverrides.field_actions
    if (projectOverrides.dashboard_widgets) base.dashboard_widgets = projectOverrides.dashboard_widgets
    if (projectOverrides.custom_fields) base.custom_fields = projectOverrides.custom_fields
    if (projectOverrides.kpis) base.kpis = projectOverrides.kpis
    if (projectOverrides.enable_truck_load_tracking != null) base.enable_truck_load_tracking = projectOverrides.enable_truck_load_tracking
  }

  return base
}

export function TradeConfigProvider({ children, companyId, projectId }) {
  const [companyConfig, setCompanyConfig] = useState(null)
  const [projectOverrides, setProjectOverrides] = useState(null)
  const [template, setTemplate] = useState(null)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  // Load company config and templates
  useEffect(() => {
    if (!companyId) {
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        const [config, allTemplates] = await Promise.all([
          db.getCompanyTradeConfig(companyId),
          db.getTradeTemplates()
        ])

        if (cancelled) return

        setCompanyConfig(config)
        setTemplates(allTemplates)

        // Set template from joined data or find it
        if (config?.trade_templates) {
          setTemplate(config.trade_templates)
        } else if (config?.trade_template_id && allTemplates.length) {
          setTemplate(allTemplates.find(t => t.id === config.trade_template_id) || null)
        } else {
          setTemplate(null)
        }
      } catch (error) {
        console.error('Error loading trade config:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [companyId])

  // Load project overrides when projectId changes
  useEffect(() => {
    if (!projectId) {
      setProjectOverrides(null)
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        const overrides = await db.getProjectTradeOverrides(projectId)
        if (!cancelled) setProjectOverrides(overrides)
      } catch (error) {
        console.error('Error loading project trade overrides:', error)
      }
    }

    load()
    return () => { cancelled = true }
  }, [projectId])

  // Compute resolved config
  const resolvedConfig = useMemo(
    () => mergeTradeConfig(template, companyConfig, projectOverrides),
    [template, companyConfig, projectOverrides]
  )

  const updateCompanyConfig = useCallback(async (updates) => {
    if (!companyId) return { success: false, error: 'No company ID' }

    const result = await db.setCompanyTradeConfig(companyId, updates)
    if (result.success && result.data) {
      setCompanyConfig(result.data)
      if (result.data.trade_templates) {
        setTemplate(result.data.trade_templates)
      }
    }
    return result
  }, [companyId])

  const updateProjectOverrides = useCallback(async (updates) => {
    if (!projectId) return { success: false, error: 'No project ID' }

    const result = await db.setProjectTradeOverrides(projectId, updates)
    if (result.success && result.data) {
      setProjectOverrides(result.data)
    }
    return result
  }, [projectId])

  const value = useMemo(() => ({
    resolvedConfig,
    companyConfig,
    projectOverrides,
    template,
    templates,
    loading,
    updateCompanyConfig,
    updateProjectOverrides
  }), [resolvedConfig, companyConfig, projectOverrides, template, templates, loading, updateCompanyConfig, updateProjectOverrides])

  return (
    <TradeConfigContext.Provider value={value}>
      {children}
    </TradeConfigContext.Provider>
  )
}

export function useTradeConfig() {
  const context = useContext(TradeConfigContext)
  if (!context) {
    throw new Error('useTradeConfig must be used within a TradeConfigProvider')
  }
  return context
}
