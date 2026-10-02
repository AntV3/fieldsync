/**
 * Trade KPI System - Calculates trade-specific key performance indicators.
 *
 * Two types of KPIs:
 * 1. Built-in KPIs: Available to all trades (progress, budget, crew)
 * 2. Custom KPIs: Defined per company, aggregating custom field data
 *
 * Custom KPI definition shape:
 * {
 *   id: 'wire_pulls_per_day',
 *   label: 'Wire Pulls / Day',
 *   unit: 'pulls',
 *   icon: 'Zap',
 *   source_field_key: 'wire_pulls',
 *   aggregation: 'avg' | 'sum' | 'count' | 'max',
 *   time_period: 'day' | 'week' | 'month'
 * }
 */

// ============================================
// Built-in KPIs (available to all trades)
// ============================================
export const BUILT_IN_KPIS = {
  progress_pct: {
    id: 'progress_pct',
    label: 'Overall Progress',
    unit: '%',
    icon: 'TrendingUp',
    calculate: (projectData) => {
      if (!projectData?.areas) return null
      const total = projectData.areas.length
      if (total === 0) return null
      const done = projectData.areas.filter(a => a.status === 'done').length
      return Math.round((done / total) * 100)
    }
  },
  budget_burn_rate: {
    id: 'budget_burn_rate',
    label: 'Budget Burn Rate',
    unit: '%',
    icon: 'DollarSign',
    calculate: (projectData) => {
      // Enhanced-project rows flatten the project onto the root (see useDashboardData),
      // so contract_value / totalBilled live at the top level — not under
      // `project.contract_value` / `billedTotal`.
      const contract = projectData?.revised_contract_value
        ?? projectData?.contract_value
        ?? projectData?.project?.contract_value
      const billed = projectData?.totalBilled ?? projectData?.billedTotal
      if (!contract || contract === 0) return null
      return Math.round(((billed || 0) / contract) * 100)
    }
  },
  crew_utilization: {
    id: 'crew_utilization',
    label: 'Crew (Recent Avg)',
    unit: 'workers',
    icon: 'Users',
    calculate: (projectData) => {
      // Fall back through the fields useDashboardData actually sets.
      const v = projectData?.todaysCrewCount
        ?? projectData?.recentCrewAvg
        ?? projectData?.avgCrewSize
      if (v === null || v === undefined) return null
      return Math.round(v * 10) / 10
    }
  },
  tm_ticket_volume: {
    id: 'tm_ticket_volume',
    label: 'T&M Tickets (This Week)',
    unit: 'tickets',
    icon: 'FileText',
    calculate: (projectData) => {
      if (projectData?.weeklyTicketCount !== undefined && projectData?.weeklyTicketCount !== null) {
        return projectData.weeklyTicketCount
      }
      const tickets = projectData?.tmTickets
      if (!Array.isArray(tickets)) return null
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      return tickets.filter(t => {
        const d = new Date(t.ticket_date || t.created_at || 0).getTime()
        return Number.isFinite(d) && d >= cutoff
      }).length
    }
  }
}

// ============================================
// Custom KPI Calculation
// ============================================

/**
 * Calculate a custom KPI from custom field data.
 *
 * @param {Object} kpiDef - KPI definition from trade config
 * @param {Object} customFieldData - Bulk custom field data keyed by entity_id
 * @param {string} timePeriod - Override time period filter
 * @returns {number|null} Calculated value
 */
export function calculateCustomKpi(kpiDef, customFieldData) {
  if (!kpiDef?.source_field_key || !customFieldData) return null

  // Extract all values for the source field
  const values = []
  for (const entityData of Object.values(customFieldData)) {
    const val = entityData[kpiDef.source_field_key]
    if (val !== null && val !== undefined && val !== '') {
      const num = typeof val === 'number' ? val : parseFloat(val)
      if (!isNaN(num)) values.push(num)
    }
  }

  if (values.length === 0) return null

  switch (kpiDef.aggregation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'avg':
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    case 'count':
      return values.length
    case 'max':
      return Math.max(...values)
    default:
      return values.reduce((a, b) => a + b, 0)
  }
}

/**
 * Calculate all KPIs for a project.
 *
 * @param {Array} kpiDefs - Array of KPI definitions from trade config
 * @param {Object} projectData - Project data for built-in KPIs
 * @param {Object} customFieldData - Bulk custom field data
 * @returns {Array} Array of { ...kpiDef, value }
 */
export function calculateAllKpis(kpiDefs, projectData, customFieldData) {
  if (!kpiDefs || kpiDefs.length === 0) return []

  return kpiDefs.map(kpi => {
    // Check if it's a built-in KPI
    const builtin = BUILT_IN_KPIS[kpi.id]
    if (builtin) {
      return {
        ...kpi,
        ...builtin,
        value: builtin.calculate(projectData)
      }
    }

    // Custom KPI - calculate from field data
    return {
      ...kpi,
      value: calculateCustomKpi(kpi, customFieldData)
    }
  })
}
