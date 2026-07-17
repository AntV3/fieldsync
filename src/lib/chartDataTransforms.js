// ============================================
// Chart Data Transformations
// ============================================
// Utilities to transform Dashboard.jsx data into
// chart-friendly formats for Recharts.
// ============================================

import { chartColors, costCategories } from '../components/charts/chartConfig'
import { parseLocalDate } from './utils'

/**
 * Accrue equipment rental cost per calendar day.
 * Mirrors equipmentOps.calculateProjectEquipmentCost (daily_rate × inclusive
 * days on site, open rentals accrue through today) so per-date series sum to
 * the same total shown on the burn rate and cost contributor cards.
 *
 * @param {Array} projectEquipment - project_equipment rows ({ start_date, end_date, daily_rate })
 * @returns {Object} Map of 'YYYY-MM-DD' → accrued cost for that day
 */
export function buildEquipmentCostByDate(projectEquipment = []) {
  const byDate = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  projectEquipment.forEach(eq => {
    const rate = parseFloat(eq?.daily_rate) || 0
    if (!eq?.start_date || rate <= 0) return

    const start = parseLocalDate(eq.start_date)
    start.setHours(0, 0, 0, 0)
    const end = eq.end_date ? parseLocalDate(eq.end_date) : new Date(today)
    end.setHours(0, 0, 0, 0)

    // Inclusive day count, minimum 1 (same rule as calculateProjectEquipmentCost)
    const days = Math.min(3650, Math.max(1, Math.floor((end - start) / 86400000) + 1))
    const cursor = new Date(start)
    for (let i = 0; i < days; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      byDate[key] = (byDate[key] || 0) + rate
      cursor.setDate(cursor.getDate() + 1)
    }
  })

  return byDate
}

/**
 * Build cumulative time-series for the Financial Trend Chart
 * Merges labor, materials/equipment, equipment rental, T&M, and COR data by date
 * Uses actual area completion dates for revenue tracking
 *
 * @param {Object} projectData - Computed project data from Dashboard
 * @param {Object} project - Selected project
 * @param {Array} tmTickets - T&M tickets for the project
 * @param {Object} corStats - COR statistics
 * @param {Array} areas - Project areas with completion dates
 * @param {number} changeOrderValue - Approved change order value to include in revenue
 * @returns {Array} Chart-ready data points
 */
export function buildFinancialTimeSeries(projectData, project, tmTickets = [], corStats = null, areas = [], changeOrderValue = 0) {
  const contractValue = project?.contract_value || 0
  const revisedContractValue = contractValue + changeOrderValue
  const laborByDate = projectData?.laborByDate || []
  const materialsEquipmentByDate = projectData?.materialsEquipmentByDate || []
  const customCosts = projectData?.customCosts || []
  // Equipment rental accrual per day — included so the chart's cumulative
  // "costs" line lands on the same total as allCostsTotal/totalBurn
  const equipmentByDate = buildEquipmentCostByDate(projectData?.projectEquipment || [])

  // Collect all unique dates from all sources
  const dateSet = new Set()

  laborByDate.forEach(d => dateSet.add(d.date))
  materialsEquipmentByDate.forEach(d => dateSet.add(d.date))
  customCosts.forEach(c => {
    if (c.cost_date) dateSet.add(c.cost_date)
  })
  Object.keys(equipmentByDate).forEach(d => dateSet.add(d))

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
      // Use revisedContractValue (includes change orders) for non-SOV projects
      const parsedScheduledValue = area.scheduled_value != null ? parseFloat(area.scheduled_value) : NaN
      const areaValue = !isNaN(parsedScheduledValue)
        ? parsedScheduledValue
        : (totalWeight > 0 ? (areaWeight / totalWeight) * revisedContractValue : 0)

      if (!revenueByDate[completionDate]) {
        revenueByDate[completionDate] = 0
      }
      revenueByDate[completionDate] += areaValue
    }
  })

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

  // Determine if we have area-based revenue data
  const hasAreaData = Object.keys(revenueByDate).length > 0
  const billable = projectData?.billable || 0

  // For fallback revenue (no area completion dates), we need total costs first
  // to distribute billable proportionally based on when work was done
  let totalCostForFallback = 0
  if (!hasAreaData && billable > 0) {
    sortedDates.forEach(date => {
      const laborDay = laborByDate.find(d => d.date === date)
      const laborCost = laborDay?.cost || 0
      const materialsEquipmentCost = materialsEquipmentByDateMap[date] || 0
      const customCost = customByDate[date] || 0
      const equipmentCost = equipmentByDate[date] || 0
      totalCostForFallback += laborCost + materialsEquipmentCost + customCost + equipmentCost
    })
  }

  // Build cumulative data
  let cumulativeCost = 0
  let cumulativeTMValue = 0

  // Track cumulative revenue based on actual area completions
  let cumulativeRevenue = 0

  // Build the time series
  const timeSeries = sortedDates.map((date) => {
    // Find labor cost for this date
    const laborDay = laborByDate.find(d => d.date === date)
    const laborCost = laborDay?.cost || 0

    // Materials/equipment cost for this date (from T&M tickets)
    const materialsEquipmentCost = materialsEquipmentByDateMap[date] || 0

    // Custom costs for this date
    const customCost = customByDate[date] || 0

    // Equipment rental accrued on this date
    const equipmentCost = equipmentByDate[date] || 0

    // Accumulate all costs (labor + materials/equipment + custom + equipment rental)
    // Must match the categories in Dashboard's allCostsTotal so the chart and
    // the burn rate / profitability cards report the same "total costs"
    const dailyTotalCost = laborCost + materialsEquipmentCost + customCost + equipmentCost
    cumulativeCost += dailyTotalCost

    // Accumulate T&M billing value (what we charge client)
    const tmDayValue = tmByDate[date] || 0
    cumulativeTMValue += tmDayValue

    // Calculate revenue
    let revenue
    if (hasAreaData) {
      // Use actual area completion dates for revenue tracking
      const dailyRevenue = revenueByDate[date] || 0
      cumulativeRevenue += dailyRevenue
      revenue = cumulativeRevenue
    } else if (totalCostForFallback > 0) {
      // Fallback: distribute billable proportionally based on cost progression
      // Revenue is earned roughly in proportion to when costs are incurred
      revenue = (cumulativeCost / totalCostForFallback) * billable
    } else {
      // No cost data either - show billable as flat (truly no data to distribute)
      revenue = billable
    }

    const dailyRevenue = hasAreaData ? (revenueByDate[date] || 0) : 0

    return {
      date,
      contract: revisedContractValue,
      revenue: Math.round(revenue),
      costs: Math.round(cumulativeCost),
      tmValue: Math.round(cumulativeTMValue),
      corValue: Math.round(corStats?.total_approved_value || 0),
      profit: Math.round(revenue - cumulativeCost),
      // Daily values for tooltips
      dailyLabor: Math.round(laborCost),
      dailyRevenue: Math.round(dailyRevenue),
      dailyMaterials: Math.round(materialsEquipmentCost),
      dailyEquipment: Math.round(equipmentCost),
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

  // Use date-only comparison to avoid timezone issues where UTC-parsed
  // date strings get compared against local-time cutoffs, potentially
  // excluding one day of data depending on the user's timezone.
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  return data.filter(d => d.date >= cutoffStr)
}

/**
 * Build cost distribution data for donut chart
 *
 * @param {number} laborCost - Total labor cost
 * @param {Array} customCosts - Array of custom cost entries
 * @returns {Array} Chart-ready segments
 */
export function buildCostDistribution(laborCost = 0, _unused = 0, customCosts = [], materialsEquipmentCost = 0, projectEquipmentCost = 0) {
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

  // Add materials from T&M tickets if present
  if (materialsEquipmentCost > 0) {
    segments.push({
      name: 'Materials',
      value: materialsEquipmentCost,
      color: chartColors.materials || '#8b5cf6',
      category: 'materials',
    })
  }

  // Add project equipment rental costs if present
  if (projectEquipmentCost > 0) {
    segments.push({
      name: 'Equipment Rental',
      value: projectEquipmentCost,
      color: chartColors.equipment || '#f59e0b',
      category: 'equipment',
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

  // Merge grouped custom costs into existing segments or add new ones
  Object.entries(grouped).forEach(([category, data]) => {
    if (data.total > 0) {
      const existingSegment = segments.find(s => s.category === category)
      if (existingSegment) {
        // Merge into existing auto-tracked segment to avoid duplicate chart entries
        existingSegment.value += data.total
        existingSegment.items = data.items
      } else {
        const catConfig = costCategories[category] || costCategories.other
        segments.push({
          name: catConfig.label,
          value: data.total,
          color: catConfig.color,
          category,
          items: data.items,
        })
      }
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
 * Calculate trend direction from time series
 * Uses rate-of-change analysis so cumulative metrics (costs, revenue)
 * show whether activity is accelerating, decelerating, or steady
 * rather than always showing "up" because cumulative values only increase.
 *
 * @param {Array} data - Time series data
 * @param {string} key - Data key to analyze (cumulative value)
 * @returns {Object} Trend info { direction, percentage }
 */
export function calculateTrend(data, key) {
  if (!data || data.length < 2) {
    return { direction: 'flat', percentage: 0 }
  }

  // Use up to last 14 points so we can compare two periods
  const window = data.slice(-14)
  if (window.length < 4) {
    return { direction: 'flat', percentage: 0 }
  }

  // Compute daily increments from cumulative values
  const increments = []
  for (let i = 1; i < window.length; i++) {
    increments.push((window[i][key] || 0) - (window[i - 1][key] || 0))
  }

  // Split increments into earlier half and recent half
  const mid = Math.floor(increments.length / 2)
  const earlier = increments.slice(0, mid)
  const recent = increments.slice(mid)

  if (earlier.length === 0 || recent.length === 0) {
    return { direction: 'flat', percentage: 0 }
  }

  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length

  // Both periods have zero activity
  if (earlierAvg === 0 && recentAvg === 0) {
    return { direction: 'flat', percentage: 0 }
  }

  // Activity started from nothing
  if (earlierAvg === 0) {
    return { direction: recentAvg > 0 ? 'up' : 'down', percentage: 0 }
  }

  // Percentage change in daily rate between the two periods
  const change = ((recentAvg - earlierAvg) / Math.abs(earlierAvg)) * 100

  return {
    direction: change > 10 ? 'up' : change < -10 ? 'down' : 'flat',
    percentage: Math.abs(Math.round(change)),
  }
}
