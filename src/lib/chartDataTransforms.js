// ============================================
// Chart Data Transformations
// ============================================
// Utilities to transform Dashboard.jsx data into
// chart-friendly formats for Recharts.
// ============================================

import { chartColors, costCategories } from '../components/charts/chartConfig'

/**
 * Build cumulative time-series for the Financial Trend Chart
 * Merges labor, disposal, materials/equipment, T&M, and COR data by date
 * Uses actual area completion dates for revenue tracking
 *
 * @param {Object} projectData - Computed project data from Dashboard
 * @param {Object} project - Selected project
 * @param {Array} tmTickets - T&M tickets for the project
 * @param {Object} corStats - COR statistics
 * @param {Array} areas - Project areas with completion dates
 * @returns {Array} Chart-ready data points
 */
export function buildFinancialTimeSeries(projectData, project, tmTickets = [], corStats = null, areas = []) {
  const contractValue = project?.contract_value || 0
  const laborByDate = projectData?.laborByDate || []
  const haulOffByDate = projectData?.haulOffByDate || []
  const materialsEquipmentByDate = projectData?.materialsEquipmentByDate || []
  const customCosts = projectData?.customCosts || []

  // Collect all unique dates from all sources
  const dateSet = new Set()

  laborByDate.forEach(d => dateSet.add(d.date))
  haulOffByDate.forEach(d => dateSet.add(d.date))
  materialsEquipmentByDate.forEach(d => dateSet.add(d.date))
  customCosts.forEach(c => {
    if (c.cost_date) dateSet.add(c.cost_date)
  })

  // Add T&M ticket dates
  tmTickets.forEach(t => {
    if (t.work_date) dateSet.add(t.work_date)
    if (t.ticket_date) dateSet.add(t.ticket_date)
    if (t.created_at) dateSet.add(t.created_at.split('T')[0])
  })

  // Add area completion dates (for revenue tracking)
  areas.forEach(area => {
    if (area.status === 'done' && area.updated_at) {
      dateSet.add(area.updated_at.split('T')[0])
    }
  })

  // Sort dates chronologically
  const sortedDates = [...dateSet].sort((a, b) => new Date(a) - new Date(b))

  if (sortedDates.length === 0) {
    return []
  }

  // Build revenue by date based on completed areas
  // Each completed area contributes its weight/value to revenue on its completion date
  const revenueByDate = {}
  const totalWeight = areas.reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)

  areas.forEach(area => {
    if (area.status === 'done' && area.updated_at) {
      const completionDate = area.updated_at.split('T')[0]
      const areaWeight = parseFloat(area.weight) || 0
      // Calculate area's contribution to revenue
      // If scheduled_value exists (SOV), use that; otherwise calculate from weight
      const areaValue = area.scheduled_value
        ? parseFloat(area.scheduled_value)
        : (totalWeight > 0 ? (areaWeight / totalWeight) * contractValue : 0)

      if (!revenueByDate[completionDate]) {
        revenueByDate[completionDate] = 0
      }
      revenueByDate[completionDate] += areaValue
    }
  })

  // Build cumulative data
  let cumulativeCost = 0
  let cumulativeTMValue = 0
  let cumulativeCORValue = 0

  // Pre-calculate T&M values by date
  // Use the actual property names from the database: t_and_m_workers, t_and_m_items
  const tmByDate = {}
  tmTickets.forEach(ticket => {
    const date = ticket.work_date || ticket.ticket_date || ticket.created_at?.split('T')[0]
    if (!date) return

    // Calculate ticket value (labor + materials + equipment)
    let ticketValue = 0

    // Labor value - handles both property name variations
    const workers = ticket.t_and_m_workers || ticket.workers || []
    if (Array.isArray(workers)) {
      workers.forEach(w => {
        // Handle both naming conventions: hours/regular_hours, overtime_hours
        const regHours = parseFloat(w.hours) || parseFloat(w.regular_hours) || 0
        const otHours = parseFloat(w.overtime_hours) || 0
        // Use rates if available, otherwise default billing rates
        const regRate = parseFloat(w.regular_rate) || parseFloat(w.rate) || 65
        const otRate = parseFloat(w.overtime_rate) || regRate * 1.5
        ticketValue += (regHours * regRate) + (otHours * otRate)
      })
    }

    // Materials and equipment - handles both property name variations
    const items = ticket.t_and_m_items || ticket.items || []
    if (Array.isArray(items)) {
      items.forEach(item => {
        const qty = parseFloat(item.quantity) || 1
        // Handle different cost property locations
        const unitCost = parseFloat(item.unit_cost) ||
                         parseFloat(item.materials_equipment?.cost_per_unit) || 0
        ticketValue += qty * unitCost
      })
    }

    if (!tmByDate[date]) {
      tmByDate[date] = 0
    }
    tmByDate[date] += ticketValue
  })

  // Pre-calculate custom costs by date
  const customByDate = {}
  customCosts.forEach(cost => {
    const date = cost.cost_date
    if (!date) return
    if (!customByDate[date]) {
      customByDate[date] = 0
    }
    customByDate[date] += parseFloat(cost.amount) || 0
  })

  // Pre-calculate materials/equipment costs by date (for quick lookup)
  const materialsEquipmentByDateMap = {}
  materialsEquipmentByDate.forEach(d => {
    if (d.date) {
      materialsEquipmentByDateMap[d.date] = d.cost || 0
    }
  })

  // Track cumulative revenue based on actual area completions
  let cumulativeRevenue = 0

  // Build the time series
  const timeSeries = sortedDates.map((date) => {
    // Find labor cost for this date
    const laborDay = laborByDate.find(d => d.date === date)
    const laborCost = laborDay?.cost || 0

    // Find haul-off cost for this date
    const haulOffDay = haulOffByDate.find(d => d.date === date)
    const haulOffCost = haulOffDay?.cost || 0

    // Materials/equipment cost for this date (from T&M tickets)
    const materialsEquipmentCost = materialsEquipmentByDateMap[date] || 0

    // Custom costs for this date
    const customCost = customByDate[date] || 0

    // Accumulate all costs (labor + materials/equipment + disposal + custom)
    const dailyTotalCost = laborCost + materialsEquipmentCost + haulOffCost + customCost
    cumulativeCost += dailyTotalCost

    // Accumulate T&M billing value (what we charge client)
    const tmDayValue = tmByDate[date] || 0
    cumulativeTMValue += tmDayValue

    // Accumulate revenue based on actual area completions
    // Revenue increases only when areas are marked complete
    const dailyRevenue = revenueByDate[date] || 0
    cumulativeRevenue += dailyRevenue

    // If we have area completion data, use actual revenue
    // Otherwise fall back to billable (for projects without detailed tracking)
    const hasAreaData = Object.keys(revenueByDate).length > 0
    const revenue = hasAreaData
      ? cumulativeRevenue
      : (projectData?.billable || 0) // Fall back to current billable for projects without area dates

    return {
      date,
      contract: contractValue,
      revenue: Math.round(revenue),
      costs: Math.round(cumulativeCost),
      tmValue: Math.round(cumulativeTMValue),
      corValue: Math.round(corStats?.total_approved_value || 0),
      profit: Math.round(revenue - cumulativeCost),
      // Daily values for tooltips
      dailyLabor: Math.round(laborCost),
      dailyRevenue: Math.round(dailyRevenue),
      dailyMaterials: Math.round(materialsEquipmentCost),
      dailyHaulOff: Math.round(haulOffCost),
      dailyCustom: Math.round(customCost),
      dailyTM: Math.round(tmDayValue),
      dailyTotal: Math.round(dailyTotalCost),
    }
  })

  return timeSeries
}

/**
 * Filter time series by date range
 *
 * @param {Array} data - Full time series data
 * @param {number|null} days - Number of days to include (null = all)
 * @returns {Array} Filtered data
 */
export function filterByTimeRange(data, days) {
  if (!days || !data.length) return data

  const now = new Date()
  const cutoff = new Date()
  cutoff.setDate(now.getDate() - days)

  return data.filter(d => new Date(d.date) >= cutoff)
}

/**
 * Build cost distribution data for donut chart
 *
 * @param {number} laborCost - Total labor cost
 * @param {number} haulOffCost - Total disposal cost
 * @param {Array} customCosts - Array of custom cost entries
 * @returns {Array} Chart-ready segments
 */
export function buildCostDistribution(laborCost = 0, haulOffCost = 0, customCosts = []) {
  const segments = []

  // Add labor if present
  if (laborCost > 0) {
    segments.push({
      name: 'Labor',
      value: laborCost,
      color: chartColors.labor,
      category: 'labor',
    })
  }

  // Add disposal if present
  if (haulOffCost > 0) {
    segments.push({
      name: 'Disposal',
      value: haulOffCost,
      color: chartColors.disposal,
      category: 'disposal',
    })
  }

  // Group custom costs by category
  const grouped = {}
  customCosts.forEach(cost => {
    const cat = cost.category || 'other'
    if (!grouped[cat]) {
      grouped[cat] = {
        items: [],
        total: 0,
      }
    }
    grouped[cat].items.push(cost)
    grouped[cat].total += parseFloat(cost.amount) || 0
  })

  // Add grouped custom costs
  Object.entries(grouped).forEach(([category, data]) => {
    if (data.total > 0) {
      const catConfig = costCategories[category] || costCategories.other
      segments.push({
        name: catConfig.label,
        value: data.total,
        color: catConfig.color,
        category,
        items: data.items,
      })
    }
  })

  // Calculate percentages
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  segments.forEach(s => {
    s.percentage = total > 0 ? Math.round((s.value / total) * 100) : 0
  })

  // Sort by value descending
  segments.sort((a, b) => b.value - a.value)

  return segments
}

/**
 * Build COR funnel data
 *
 * @param {Object} corStats - COR statistics from database
 * @returns {Array} Funnel stages
 */
export function buildCORFunnel(corStats) {
  if (!corStats) return []

  return [
    {
      stage: 'Draft',
      count: corStats.draft_count || 0,
      value: 0, // Draft CORs typically don't have values yet
      color: chartColors.other,
    },
    {
      stage: 'Pending',
      count: corStats.pending_count || 0,
      value: corStats.total_pending_value || 0,
      color: chartColors.costs,
    },
    {
      stage: 'Approved',
      count: corStats.approved_count || 0,
      value: corStats.total_approved_value || 0,
      color: chartColors.revenue,
    },
    {
      stage: 'Billed',
      count: corStats.billed_count || 0,
      value: corStats.total_billed_value || 0,
      color: chartColors.profit,
    },
  ]
}

/**
 * Build daily burn data for sparkline
 *
 * @param {Array} laborByDate - Daily labor costs
 * @param {Array} haulOffByDate - Daily haul-off costs
 * @param {number} limit - Max number of days to include
 * @returns {Array} Sparkline data points
 */
export function buildBurnSparkline(laborByDate = [], haulOffByDate = [], limit = 14) {
  // Merge and sort by date
  const dateMap = {}

  laborByDate.forEach(d => {
    if (!dateMap[d.date]) {
      dateMap[d.date] = { date: d.date, labor: 0, haulOff: 0 }
    }
    dateMap[d.date].labor = d.cost || 0
  })

  haulOffByDate.forEach(d => {
    if (!dateMap[d.date]) {
      dateMap[d.date] = { date: d.date, labor: 0, haulOff: 0 }
    }
    dateMap[d.date].haulOff = d.cost || 0
  })

  // Convert to array and sort
  const data = Object.values(dateMap)
    .map(d => ({
      date: d.date,
      total: d.labor + d.haulOff,
      labor: d.labor,
      haulOff: d.haulOff,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  // Return last N days
  return data.slice(-limit)
}

/**
 * Calculate trend direction from time series
 *
 * @param {Array} data - Time series data
 * @param {string} key - Data key to analyze
 * @returns {Object} Trend info { direction, percentage }
 */
export function calculateTrend(data, key) {
  if (!data || data.length < 2) {
    return { direction: 'flat', percentage: 0 }
  }

  const recent = data.slice(-7)
  if (recent.length < 2) {
    return { direction: 'flat', percentage: 0 }
  }

  const first = recent[0][key] || 0
  const last = recent[recent.length - 1][key] || 0

  if (first === 0) {
    return { direction: last > 0 ? 'up' : 'flat', percentage: 0 }
  }

  const change = ((last - first) / first) * 100

  return {
    direction: change > 5 ? 'up' : change < -5 ? 'down' : 'flat',
    percentage: Math.abs(Math.round(change)),
  }
}
