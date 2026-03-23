/**
 * Quality Metrics Engine
 *
 * Tracks construction quality indicators:
 * - Punch list / defect rate tracking
 * - Rework cost estimation
 * - First-time quality rate
 * - Quality trend analysis
 * - Inspection pass rates
 */

// ---- Configuration ----

export const QUALITY_CONFIG = {
  // Industry benchmarks
  benchmarks: {
    punchListRate: 5,        // Items per 100 areas (good)
    firstTimeQuality: 95,   // % areas done right first time
    reworkCostRatio: 0.02,  // 2% of contract = acceptable rework
    resolutionDays: 3,      // Target days to close punch items
  },
}

/**
 * Calculate comprehensive quality metrics for a project
 *
 * @param {Object} params
 * @param {Array} params.punchListItems - Punch list items { status, created_at, resolved_at, area_id, priority }
 * @param {Array} params.areas - Project areas { id, name, status, weight }
 * @param {Array} params.dailyReports - Daily reports (for quality observations)
 * @param {number} params.contractValue - Contract value for rework % calculation
 * @param {number} params.totalCosts - Actual costs to date
 * @returns {Object} Quality metrics
 */
export function calculateQualityMetrics({
  punchListItems = [],
  areas = [],
  dailyReports: _dailyReports = [],
  contractValue = 0,
  totalCosts = 0,
}) {
  // Core defect metrics
  const defects = analyzeDefects(punchListItems, areas)

  // Rework estimation
  const rework = estimateRework(punchListItems, contractValue, totalCosts)

  // First-time quality
  const ftq = calculateFirstTimeQuality(areas, punchListItems)

  // Resolution performance
  const resolution = analyzeResolutionPerformance(punchListItems)

  // Quality trend over time
  const trend = analyzeQualityTrend(punchListItems)

  // Quality score (composite)
  const score = calculateQualityScore(defects, rework, ftq, resolution)

  // Insights
  const insights = generateQualityInsights(score, defects, rework, ftq, resolution)

  return {
    score,
    defects,
    rework,
    firstTimeQuality: ftq,
    resolution,
    trend,
    insights,
  }
}

/**
 * Analyze defect rates and distribution
 */
export function analyzeDefects(punchListItems, areas) {
  const total = punchListItems.length
  const open = punchListItems.filter(p => p.status === 'open' || p.status === 'pending').length
  const closed = punchListItems.filter(p => p.status === 'closed' || p.status === 'resolved' || p.status === 'done').length
  const totalAreas = areas.length

  // Defect rate per area
  const defectRate = totalAreas > 0 ? roundTo((total / totalAreas) * 100, 1) : 0

  // Priority distribution
  const byPriority = {
    critical: punchListItems.filter(p => p.priority === 'critical' || p.priority === 'high').length,
    medium: punchListItems.filter(p => p.priority === 'medium' || p.priority === 'normal').length,
    low: punchListItems.filter(p => p.priority === 'low').length,
  }

  // Areas with defects
  const affectedAreaIds = new Set(punchListItems.map(p => p.area_id).filter(Boolean))
  const areasWithDefects = affectedAreaIds.size
  const defectFreeAreas = totalAreas - areasWithDefects
  const defectFreeRate = totalAreas > 0 ? roundTo((defectFreeAreas / totalAreas) * 100, 1) : 100

  // Defect density (items per affected area)
  const defectDensity = areasWithDefects > 0
    ? roundTo(total / areasWithDefects, 1)
    : 0

  return {
    total,
    open,
    closed,
    closeRate: total > 0 ? roundTo((closed / total) * 100, 1) : 100,
    defectRate,
    defectRateBenchmark: QUALITY_CONFIG.benchmarks.punchListRate,
    byPriority,
    areasWithDefects,
    defectFreeAreas,
    defectFreeRate,
    defectDensity,
    status: getDefectStatus(defectRate),
  }
}

/**
 * Estimate rework costs
 */
export function estimateRework(punchListItems, contractValue, totalCosts) {
  // Heuristic: each punch item has an average rework cost
  // Critical = 2x avg, Medium = 1x, Low = 0.5x
  const avgReworkCostPerItem = contractValue > 0
    ? contractValue * 0.003 // 0.3% of contract per item avg
    : 500

  let estimatedReworkCost = 0
  for (const item of punchListItems) {
    const multiplier = item.priority === 'critical' || item.priority === 'high'
      ? 2.0
      : item.priority === 'low'
        ? 0.5
        : 1.0
    estimatedReworkCost += avgReworkCostPerItem * multiplier
  }

  const reworkRatio = totalCosts > 0
    ? roundTo((estimatedReworkCost / totalCosts) * 100, 2)
    : 0

  const openItems = punchListItems.filter(p => p.status === 'open' || p.status === 'pending')
  let outstandingReworkCost = 0
  for (const item of openItems) {
    const multiplier = item.priority === 'critical' || item.priority === 'high'
      ? 2.0
      : item.priority === 'low'
        ? 0.5
        : 1.0
    outstandingReworkCost += avgReworkCostPerItem * multiplier
  }

  return {
    estimatedTotal: Math.round(estimatedReworkCost),
    outstandingCost: Math.round(outstandingReworkCost),
    reworkRatio,
    benchmarkRatio: QUALITY_CONFIG.benchmarks.reworkCostRatio * 100,
    status: reworkRatio > QUALITY_CONFIG.benchmarks.reworkCostRatio * 100 * 1.5
      ? 'critical'
      : reworkRatio > QUALITY_CONFIG.benchmarks.reworkCostRatio * 100
        ? 'warning'
        : 'healthy',
  }
}

/**
 * Calculate first-time quality rate
 * (% of areas completed without any punch list items)
 */
export function calculateFirstTimeQuality(areas, punchListItems) {
  const completedAreas = areas.filter(a => a.status === 'done')
  if (completedAreas.length === 0) {
    return { rate: null, status: 'no_data', completedAreas: 0, cleanAreas: 0 }
  }

  const areasWithPunch = new Set(
    punchListItems.map(p => p.area_id).filter(Boolean)
  )

  const cleanAreas = completedAreas.filter(a => !areasWithPunch.has(a.id)).length
  const rate = roundTo((cleanAreas / completedAreas.length) * 100, 1)

  return {
    rate,
    completedAreas: completedAreas.length,
    cleanAreas,
    withDefects: completedAreas.length - cleanAreas,
    benchmark: QUALITY_CONFIG.benchmarks.firstTimeQuality,
    status: rate >= QUALITY_CONFIG.benchmarks.firstTimeQuality
      ? 'healthy'
      : rate >= QUALITY_CONFIG.benchmarks.firstTimeQuality - 10
        ? 'warning'
        : 'critical',
  }
}

/**
 * Analyze punch item resolution performance
 */
export function analyzeResolutionPerformance(punchListItems) {
  const resolved = punchListItems.filter(p =>
    (p.status === 'closed' || p.status === 'resolved' || p.status === 'done') &&
    p.created_at && p.resolved_at
  )

  if (resolved.length === 0) {
    return {
      avgDays: null,
      medianDays: null,
      benchmark: QUALITY_CONFIG.benchmarks.resolutionDays,
      status: 'no_data',
      distribution: { sameDay: 0, within3Days: 0, within7Days: 0, over7Days: 0 },
    }
  }

  // Calculate resolution times
  const resolutionDays = resolved.map(p => {
    const created = new Date(p.created_at)
    const resolvedDate = new Date(p.resolved_at)
    return Math.max(0, (resolvedDate - created) / (1000 * 60 * 60 * 24))
  })

  const avg = roundTo(resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length, 1)

  // Median
  const sorted = [...resolutionDays].sort((a, b) => a - b)
  const median = sorted.length % 2 === 0
    ? roundTo((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, 1)
    : roundTo(sorted[Math.floor(sorted.length / 2)], 1)

  // Distribution
  const distribution = {
    sameDay: resolutionDays.filter(d => d < 1).length,
    within3Days: resolutionDays.filter(d => d >= 1 && d <= 3).length,
    within7Days: resolutionDays.filter(d => d > 3 && d <= 7).length,
    over7Days: resolutionDays.filter(d => d > 7).length,
  }

  return {
    avgDays: avg,
    medianDays: median,
    benchmark: QUALITY_CONFIG.benchmarks.resolutionDays,
    status: avg <= QUALITY_CONFIG.benchmarks.resolutionDays
      ? 'healthy'
      : avg <= QUALITY_CONFIG.benchmarks.resolutionDays * 2
        ? 'warning'
        : 'critical',
    totalResolved: resolved.length,
    distribution,
  }
}

/**
 * Analyze quality trends over time
 */
export function analyzeQualityTrend(punchListItems) {
  if (punchListItems.length < 3) {
    return { periods: [], trend: 'insufficient_data' }
  }

  // Group by week
  const weeklyData = {}
  for (const item of punchListItems) {
    if (!item.created_at) continue
    const date = new Date(item.created_at)
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekKey = weekStart.toISOString().split('T')[0]

    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { opened: 0, closed: 0 }
    }
    weeklyData[weekKey].opened++
  }

  // Count closures by week
  for (const item of punchListItems) {
    if (!item.resolved_at) continue
    const date = new Date(item.resolved_at)
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekKey = weekStart.toISOString().split('T')[0]

    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { opened: 0, closed: 0 }
    }
    weeklyData[weekKey].closed++
  }

  // Build periods array
  const periods = Object.entries(weeklyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12) // Last 12 weeks
    .map(([date, data]) => ({
      date,
      label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      opened: data.opened,
      closed: data.closed,
      net: data.opened - data.closed,
    }))

  // Determine trend
  let trend = 'stable'
  if (periods.length >= 4) {
    const recentNetAvg = periods.slice(-3).reduce((s, p) => s + p.net, 0) / 3
    const olderNetAvg = periods.slice(0, -3).reduce((s, p) => s + p.net, 0) / Math.max(1, periods.length - 3)
    if (recentNetAvg < olderNetAvg - 0.5) trend = 'improving'
    else if (recentNetAvg > olderNetAvg + 0.5) trend = 'declining'
  }

  return { periods, trend }
}

/**
 * Calculate composite quality score (0-100, higher = better)
 */
export function calculateQualityScore(defects, rework, ftq, resolution) {
  let score = 100
  const weights = { defects: 0.30, rework: 0.25, ftq: 0.25, resolution: 0.20 }

  // Defect component (lower defect rate = higher score)
  const defectScore = defects.defectRate <= QUALITY_CONFIG.benchmarks.punchListRate
    ? 100
    : Math.max(0, 100 - (defects.defectRate - QUALITY_CONFIG.benchmarks.punchListRate) * 10)

  // Rework component
  const reworkBenchmark = QUALITY_CONFIG.benchmarks.reworkCostRatio * 100
  const reworkScore = defects.total === 0 ? 100
    : rework.reworkRatio <= reworkBenchmark
      ? 100
      : Math.max(0, 100 - (rework.reworkRatio - reworkBenchmark) * 20)

  // FTQ component
  const ftqScore = ftq.rate !== null
    ? Math.min(100, (ftq.rate / QUALITY_CONFIG.benchmarks.firstTimeQuality) * 100)
    : 80 // Assume decent if no data

  // Resolution component
  const resScore = resolution.avgDays !== null
    ? resolution.avgDays <= QUALITY_CONFIG.benchmarks.resolutionDays
      ? 100
      : Math.max(0, 100 - (resolution.avgDays - QUALITY_CONFIG.benchmarks.resolutionDays) * 15)
    : 80

  score = Math.round(
    defectScore * weights.defects +
    reworkScore * weights.rework +
    ftqScore * weights.ftq +
    resScore * weights.resolution
  )

  let status = 'healthy'
  let label = 'Quality is excellent'
  if (score < 60) { status = 'critical'; label = 'Quality needs immediate attention' }
  else if (score < 80) { status = 'warning'; label = 'Quality could improve' }

  return {
    score,
    status,
    label,
    components: {
      defects: Math.round(defectScore),
      rework: Math.round(reworkScore),
      firstTimeQuality: Math.round(ftqScore),
      resolution: Math.round(resScore),
    },
  }
}

/**
 * Generate quality insights
 */
export function generateQualityInsights(score, defects, rework, ftq, resolution) {
  const insights = []

  if (defects.open > 5) {
    insights.push({
      type: defects.byPriority.critical > 0 ? 'critical' : 'warning',
      category: 'defects',
      title: `${defects.open} Open Punch Items`,
      description: defects.byPriority.critical > 0
        ? `Including ${defects.byPriority.critical} critical items requiring immediate attention.`
        : `${defects.open} items pending resolution.`,
      action: 'Review and assign punch list items',
    })
  }

  if (rework.status === 'critical') {
    insights.push({
      type: 'critical',
      category: 'rework',
      title: 'High Rework Cost',
      description: `Estimated rework at ${rework.reworkRatio}% of costs (benchmark: ${rework.benchmarkRatio}%).`,
      action: 'Investigate root causes of rework',
    })
  }

  if (ftq.rate !== null && ftq.status !== 'healthy') {
    insights.push({
      type: ftq.status === 'critical' ? 'critical' : 'warning',
      category: 'quality',
      title: 'First-Time Quality Below Target',
      description: `${ftq.rate}% of areas completed without defects (target: ${ftq.benchmark}%).`,
      action: 'Improve QC inspections before marking areas done',
    })
  }

  if (resolution.status === 'critical') {
    insights.push({
      type: 'warning',
      category: 'resolution',
      title: 'Slow Defect Resolution',
      description: `Average resolution time is ${resolution.avgDays} days (target: ${resolution.benchmark} days).`,
      action: 'Expedite punch list closures',
    })
  }

  if (defects.defectFreeRate > 90 && score.score >= 80) {
    insights.push({
      type: 'success',
      category: 'quality',
      title: 'Strong Quality Performance',
      description: `${defects.defectFreeRate}% of areas are defect-free.`,
      action: null,
    })
  }

  return insights
}

// ---- Helpers ----

function getDefectStatus(defectRate) {
  if (defectRate <= QUALITY_CONFIG.benchmarks.punchListRate) return 'healthy'
  if (defectRate <= QUALITY_CONFIG.benchmarks.punchListRate * 2) return 'warning'
  return 'critical'
}

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export default {
  calculateQualityMetrics,
  analyzeDefects,
  estimateRework,
  calculateFirstTimeQuality,
  analyzeResolutionPerformance,
  analyzeQualityTrend,
  calculateQualityScore,
  generateQualityInsights,
  QUALITY_CONFIG,
}
