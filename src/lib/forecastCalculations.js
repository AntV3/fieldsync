/**
 * Predictive Forecasting & AI-Driven Insights
 *
 * Provides trend-based forecasting for construction projects:
 * - Completion date predictions using weighted moving average
 * - Cost forecasting with confidence intervals
 * - Productivity trend analysis
 * - What-if scenario modeling
 */

// ---- Configuration ----

export const FORECAST_CONFIG = {
  // Minimum data points needed for meaningful forecasts
  minDataPoints: 3,
  // Weights for recent vs older data (exponential decay)
  decayFactor: 0.85,
  // Confidence interval width (68% = 1 std dev, 95% = 2 std dev)
  confidenceLevels: { low: 1, medium: 1.5, high: 2 },
  // Forecast horizon in weeks
  maxForecastWeeks: 26,
  // Minimum acceptable profit margin for scenario pass/fail
  minMarginPercent: 15,
}

// ---- Core Forecasting ----

/**
 * Generate a comprehensive project forecast
 *
 * @param {Object} params
 * @param {number} params.contractValue - Total contract value (BAC)
 * @param {number} params.changeOrderValue - Approved change order value
 * @param {number} params.progressPercent - Current completion (0-100)
 * @param {number} params.actualCosts - Total costs to date
 * @param {string} params.startDate - Project start date
 * @param {string} params.endDate - Planned end date
 * @param {Array} params.costHistory - Array of { date, dailyCost } entries
 * @param {Array} params.progressHistory - Array of { date, progress } entries
 * @returns {Object} Forecast results
 */
export function generateProjectForecast({
  contractValue = 0,
  changeOrderValue = 0,
  progressPercent = 0,
  actualCosts = 0,
  startDate,
  endDate,
  costHistory = [],
  progressHistory = [],
}) {
  const bac = contractValue + changeOrderValue

  // Cost forecast
  const costForecast = forecastCosts({
    actualCosts,
    bac,
    progressPercent,
    costHistory,
    startDate,
    endDate,
  })

  // Schedule forecast
  const scheduleForecast = forecastSchedule({
    progressPercent,
    progressHistory,
    startDate,
    endDate,
  })

  // Productivity analysis
  const productivity = analyzeProductivity({
    progressHistory,
    costHistory,
    bac,
  })

  // Trend-based insights
  const insights = generateInsights({
    costForecast,
    scheduleForecast,
    productivity,
    bac,
    progressPercent,
  })

  return {
    cost: costForecast,
    schedule: scheduleForecast,
    productivity,
    insights,
    confidence: calculateOverallConfidence(costHistory, progressHistory),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Forecast final project cost using multiple methods
 */
export function forecastCosts({
  actualCosts,
  bac,
  progressPercent,
  costHistory = [],
  startDate,
  endDate,
}) {
  if (!bac || bac <= 0 || progressPercent <= 0) {
    return {
      eac: bac,
      etc: bac,
      confidence: 'low',
      methods: {},
      bestEstimate: bac,
      range: { optimistic: bac, pessimistic: bac },
      burnRateTrend: 'stable',
      weeklyForecast: [],
    }
  }

  // Method 1: Linear extrapolation (EAC = AC + (BAC - EV) / CPI)
  const ev = (progressPercent / 100) * bac
  const cpi = actualCosts > 0 ? ev / actualCosts : 1
  const eacCPI = cpi > 0 ? bac / cpi : bac * 2

  // Method 2: Trend-based (weighted moving average of recent burn rate)
  const recentBurnRate = calculateWeightedBurnRate(costHistory)
  const remainingProgress = 100 - progressPercent
  const progressRate = calculateProgressRate(costHistory, progressPercent)
  const eacTrend = progressRate > 0
    ? actualCosts + (recentBurnRate / progressRate) * remainingProgress
    : eacCPI

  // Method 3: Composite SPI×CPI (accounts for schedule slip)
  const pv = calculatePlannedValueAtDate(bac, startDate, endDate)
  const spi = pv > 0 ? ev / pv : 1
  const compositeIndex = cpi * spi
  const eacComposite = compositeIndex > 0 ? bac / compositeIndex : bac * 2

  // Best estimate: weighted average of methods
  const methodWeights = getMethodWeights(costHistory.length)
  const bestEstimate = Math.round(
    eacCPI * methodWeights.cpi +
    eacTrend * methodWeights.trend +
    eacComposite * methodWeights.composite
  )

  // Confidence interval
  const variance = calculateCostVariance([eacCPI, eacTrend, eacComposite])
  const range = {
    optimistic: Math.round(bestEstimate - variance * FORECAST_CONFIG.confidenceLevels.low),
    pessimistic: Math.round(bestEstimate + variance * FORECAST_CONFIG.confidenceLevels.high),
  }

  // Burn rate trend
  const burnRateTrend = analyzeBurnRateTrend(costHistory)

  // Weekly cost forecast
  const weeklyForecast = generateWeeklyCostForecast({
    actualCosts,
    bestEstimate,
    recentBurnRate,
    startDate,
    endDate,
    progressPercent,
  })

  return {
    eac: Math.round(eacCPI),
    etc: Math.round(Math.max(0, bestEstimate - actualCosts)),
    confidence: getConfidenceLevel(costHistory.length, variance, bac),
    methods: {
      cpiMethod: Math.round(eacCPI),
      trendMethod: Math.round(eacTrend),
      compositeMethod: Math.round(eacComposite),
    },
    bestEstimate,
    range,
    burnRateTrend,
    weeklyForecast,
    cpi: roundTo(cpi, 2),
    spi: roundTo(spi, 2),
  }
}

/**
 * Forecast project completion date
 */
export function forecastSchedule({
  progressPercent,
  progressHistory = [],
  startDate,
  endDate,
}) {
  if (!startDate || !endDate) {
    return {
      projectedEnd: null,
      daysRemaining: null,
      slippage: 0,
      confidence: 'low',
      weeklyProgress: [],
      progressTrend: 'stable',
    }
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()
  const totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.max(1, (now - start) / (1000 * 60 * 60 * 24))

  // Calculate progress velocity (weighted recent average)
  const velocity = calculateProgressVelocity(progressHistory, progressPercent, elapsedDays)

  // Project remaining days
  const remainingProgress = 100 - progressPercent
  const daysRemaining = velocity > 0
    ? Math.ceil(remainingProgress / velocity)
    : Math.ceil(remainingProgress * (elapsedDays / Math.max(1, progressPercent)))

  const projectedEnd = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000)
  const plannedRemaining = Math.max(0, (end - now) / (1000 * 60 * 60 * 24))
  const slippage = daysRemaining - plannedRemaining

  // Weekly progress forecast
  const weeklyProgress = generateWeeklyProgressForecast({
    progressPercent,
    velocity,
    startDate,
    projectedEnd,
  })

  // Analyze progress trend
  const progressTrend = analyzeProgressTrend(progressHistory)

  return {
    projectedEnd: projectedEnd.toISOString().split('T')[0],
    plannedEnd: endDate,
    daysRemaining: Math.ceil(daysRemaining),
    slippage: Math.round(slippage),
    confidence: getScheduleConfidence(progressHistory.length, velocity),
    weeklyProgress,
    progressTrend,
    velocity: roundTo(velocity, 2),
    plannedVelocity: roundTo(100 / totalDays, 2),
  }
}

/**
 * Analyze productivity trends
 */
export function analyzeProductivity({ progressHistory = [], costHistory = [], bac }) {
  if (progressHistory.length < FORECAST_CONFIG.minDataPoints) {
    return {
      costPerPercent: null,
      trend: 'insufficient_data',
      efficiency: null,
      weeklyEfficiency: [],
    }
  }

  // Calculate cost per percent of progress
  const costPerPercent = []
  for (let i = 1; i < progressHistory.length; i++) {
    const progressDelta = progressHistory[i].progress - progressHistory[i - 1].progress
    if (progressDelta > 0) {
      // Find cost in same period
      const periodCost = findPeriodCost(
        costHistory,
        progressHistory[i - 1].date,
        progressHistory[i].date
      )
      if (periodCost > 0) {
        costPerPercent.push({
          date: progressHistory[i].date,
          costPer: periodCost / progressDelta,
          progressDelta,
        })
      }
    }
  }

  // Calculate efficiency (planned cost per % vs actual)
  const plannedCostPerPercent = bac > 0 ? bac / 100 : 0
  const recentCostPerPercent = costPerPercent.length > 0
    ? weightedAverage(costPerPercent.map(c => c.costPer))
    : null

  const efficiency = recentCostPerPercent && plannedCostPerPercent > 0
    ? roundTo((plannedCostPerPercent / recentCostPerPercent) * 100, 1)
    : null

  // Trend: improving, declining, or stable
  const trend = costPerPercent.length >= 3
    ? analyzeTrendDirection(costPerPercent.map(c => c.costPer))
    : 'insufficient_data'

  return {
    costPerPercent: recentCostPerPercent ? Math.round(recentCostPerPercent) : null,
    plannedCostPerPercent: Math.round(plannedCostPerPercent),
    trend,
    efficiency,
    weeklyEfficiency: costPerPercent.slice(-12).map(c => ({
      date: c.date,
      efficiency: plannedCostPerPercent > 0
        ? roundTo((plannedCostPerPercent / c.costPer) * 100, 1)
        : 0,
    })),
  }
}

/**
 * Generate human-readable insights from forecast data
 */
export function generateInsights({ costForecast, scheduleForecast, productivity, bac, progressPercent }) {
  const insights = []

  // Cost insights
  if (costForecast.bestEstimate > 0 && bac > 0) {
    const costDelta = costForecast.bestEstimate - bac
    const costDeltaPercent = (costDelta / bac) * 100

    if (costDeltaPercent > 10) {
      insights.push({
        type: 'critical',
        category: 'cost',
        title: 'Significant Cost Overrun Projected',
        description: `At current rate, final cost will be ${formatNumber(costDelta)} (${costDeltaPercent.toFixed(0)}%) over budget.`,
        action: 'Review cost drivers and consider corrective action',
      })
    } else if (costDeltaPercent > 5) {
      insights.push({
        type: 'warning',
        category: 'cost',
        title: 'Cost Trending Over Budget',
        description: `Projected to finish ${formatNumber(costDelta)} over budget if current pace continues.`,
        action: 'Monitor burn rate closely',
      })
    } else if (costDeltaPercent < -5) {
      insights.push({
        type: 'success',
        category: 'cost',
        title: 'Under Budget',
        description: `Tracking ${formatNumber(Math.abs(costDelta))} under budget.`,
        action: null,
      })
    }
  }

  // Schedule insights
  if (scheduleForecast.slippage > 14) {
    insights.push({
      type: 'critical',
      category: 'schedule',
      title: 'Schedule Delay Risk',
      description: `Projected to finish ${scheduleForecast.slippage} days late based on current velocity.`,
      action: 'Evaluate acceleration options or scope adjustment',
    })
  } else if (scheduleForecast.slippage > 7) {
    insights.push({
      type: 'warning',
      category: 'schedule',
      title: 'Schedule Slipping',
      description: `On track to finish about ${scheduleForecast.slippage} days behind plan.`,
      action: 'Review progress bottlenecks',
    })
  } else if (scheduleForecast.slippage < -7) {
    insights.push({
      type: 'success',
      category: 'schedule',
      title: 'Ahead of Schedule',
      description: `Tracking ${Math.abs(scheduleForecast.slippage)} days ahead of plan.`,
      action: null,
    })
  }

  // Burn rate trend insight
  if (costForecast.burnRateTrend === 'accelerating') {
    insights.push({
      type: 'warning',
      category: 'cost',
      title: 'Burn Rate Accelerating',
      description: 'Daily spending is increasing. Costs are ramping up faster than expected.',
      action: 'Verify acceleration is planned (e.g., mobilization) or investigate',
    })
  }

  // Productivity insight
  if (productivity.trend === 'declining') {
    insights.push({
      type: 'warning',
      category: 'productivity',
      title: 'Declining Productivity',
      description: 'Cost per unit of progress is increasing over recent periods.',
      action: 'Check for rework, scope changes, or resource issues',
    })
  } else if (productivity.trend === 'improving') {
    insights.push({
      type: 'success',
      category: 'productivity',
      title: 'Improving Productivity',
      description: 'Cost efficiency is trending better over recent periods.',
      action: null,
    })
  }

  // Low progress warning
  if (progressPercent < 10 && scheduleForecast.projectedEnd) {
    insights.push({
      type: 'info',
      category: 'general',
      title: 'Early Stage - Limited Data',
      description: 'Forecasts will become more accurate as the project progresses past 10% completion.',
      action: null,
    })
  }

  return insights
}

// ---- Scenario Modeling ----

/**
 * Calculate what-if scenarios for different crew sizes / pace changes
 *
 * @param {Object} current - Current project state
 * @param {Array} scenarios - Array of { label, paceMultiplier, costMultiplier }
 * @returns {Array} Scenario results
 */
export function calculateScenarios(current, scenarios = []) {
  const defaultScenarios = [
    { label: 'Current Pace', paceMultiplier: 1.0, costMultiplier: 1.0 },
    { label: 'Add 25% Crew', paceMultiplier: 1.2, costMultiplier: 1.25 },
    { label: 'Reduce 25% Crew', paceMultiplier: 0.7, costMultiplier: 0.75 },
    { label: 'Overtime Push', paceMultiplier: 1.4, costMultiplier: 1.5 },
  ]

  const activeScenarios = scenarios.length > 0 ? scenarios : defaultScenarios
  const { progressPercent, actualCosts, startDate, endDate } = current
  const bac = (current.contractValue || 0) + (current.changeOrderValue || 0)

  if (!startDate || !endDate || progressPercent <= 0) return []

  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()
  const elapsedDays = Math.max(1, (now - start) / (1000 * 60 * 60 * 24))
  const dailyProgress = progressPercent / elapsedDays
  const dailyCost = actualCosts / elapsedDays
  const remainingProgress = 100 - progressPercent

  return activeScenarios.map(scenario => {
    const adjustedDailyProgress = dailyProgress * scenario.paceMultiplier
    const adjustedDailyCost = dailyCost * scenario.costMultiplier
    const daysToComplete = adjustedDailyProgress > 0
      ? Math.ceil(remainingProgress / adjustedDailyProgress)
      : 999

    const projectedEnd = new Date(now.getTime() + daysToComplete * 24 * 60 * 60 * 1000)
    const projectedCost = Math.round(actualCosts + adjustedDailyCost * daysToComplete)
    const slippage = Math.round((projectedEnd - end) / (1000 * 60 * 60 * 24))
    const margin = bac > 0 ? roundTo(((bac - projectedCost) / bac) * 100, 1) : 0

    return {
      label: scenario.label,
      projectedEnd: projectedEnd.toISOString().split('T')[0],
      projectedCost,
      slippage,
      margin,
      daysToComplete,
      meetsDeadline: projectedEnd <= end,
      meetsMargin: margin >= FORECAST_CONFIG.minMarginPercent,
    }
  })
}

// ---- Helper Functions ----

function calculateWeightedBurnRate(costHistory) {
  if (costHistory.length === 0) return 0

  const sorted = [...costHistory].sort((a, b) => new Date(a.date) - new Date(b.date))
  const recent = sorted.slice(-14) // Last 2 weeks

  let weightedSum = 0
  let weightTotal = 0

  for (let i = 0; i < recent.length; i++) {
    const weight = Math.pow(FORECAST_CONFIG.decayFactor, recent.length - 1 - i)
    weightedSum += (recent[i].dailyCost || 0) * weight
    weightTotal += weight
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0
}

function calculateProgressRate(costHistory, progressPercent) {
  if (costHistory.length < 2 || progressPercent <= 0) return 0
  const sorted = [...costHistory].sort((a, b) => new Date(a.date) - new Date(b.date))
  const days = Math.max(1,
    (new Date(sorted[sorted.length - 1].date) - new Date(sorted[0].date)) / (1000 * 60 * 60 * 24)
  )
  return progressPercent / days
}

function calculatePlannedValueAtDate(bac, startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()
  const totalDuration = end - start
  if (totalDuration <= 0) return bac
  const elapsed = now - start
  return Math.min(1, Math.max(0, elapsed / totalDuration)) * bac
}

function getMethodWeights(dataPoints) {
  // More data → trust trend more; less data → trust CPI
  if (dataPoints >= 14) return { cpi: 0.3, trend: 0.5, composite: 0.2 }
  if (dataPoints >= 7) return { cpi: 0.4, trend: 0.35, composite: 0.25 }
  return { cpi: 0.6, trend: 0.15, composite: 0.25 }
}

function calculateCostVariance(estimates) {
  const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length
  const variance = estimates.reduce((sum, e) => sum + Math.pow(e - mean, 2), 0) / estimates.length
  return Math.sqrt(variance)
}

function analyzeBurnRateTrend(costHistory) {
  if (costHistory.length < 7) return 'stable'
  const sorted = [...costHistory].sort((a, b) => new Date(a.date) - new Date(b.date))
  const midpoint = Math.floor(sorted.length / 2)
  const firstHalf = sorted.slice(0, midpoint)
  const secondHalf = sorted.slice(midpoint)

  const avgFirst = firstHalf.reduce((s, c) => s + (c.dailyCost || 0), 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((s, c) => s + (c.dailyCost || 0), 0) / secondHalf.length

  if (avgFirst <= 0) return 'stable'
  const change = (avgSecond - avgFirst) / avgFirst
  if (change > 0.15) return 'accelerating'
  if (change < -0.15) return 'decelerating'
  return 'stable'
}

function calculateProgressVelocity(progressHistory, currentProgress, elapsedDays) {
  if (progressHistory.length >= 3) {
    // Use weighted recent velocity
    const sorted = [...progressHistory].sort((a, b) => new Date(a.date) - new Date(b.date))
    const recent = sorted.slice(-7)
    let totalVelocity = 0
    let weightTotal = 0

    for (let i = 1; i < recent.length; i++) {
      const daysDelta = Math.max(1,
        (new Date(recent[i].date) - new Date(recent[i - 1].date)) / (1000 * 60 * 60 * 24)
      )
      const progressDelta = recent[i].progress - recent[i - 1].progress
      const velocity = progressDelta / daysDelta
      const weight = Math.pow(FORECAST_CONFIG.decayFactor, recent.length - 1 - i)
      totalVelocity += velocity * weight
      weightTotal += weight
    }

    if (weightTotal > 0) return totalVelocity / weightTotal
  }

  // Fallback: average velocity
  return currentProgress > 0 ? currentProgress / elapsedDays : 0
}

function generateWeeklyCostForecast({ actualCosts, bestEstimate, recentBurnRate, startDate, endDate, progressPercent: _progressPercent }) {
  const points = []
  const now = new Date()
  const end = endDate ? new Date(endDate) : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const remainingCost = Math.max(0, bestEstimate - actualCosts)
  const weeksRemaining = Math.max(1, (end - now) / (1000 * 60 * 60 * 24 * 7))
  const weeklyBurn = recentBurnRate > 0 ? recentBurnRate * 7 : remainingCost / weeksRemaining

  let cumCost = actualCosts
  const maxWeeks = Math.min(FORECAST_CONFIG.maxForecastWeeks, Math.ceil(weeksRemaining) + 4)

  for (let w = 0; w <= maxWeeks; w++) {
    const weekDate = new Date(now.getTime() + w * 7 * 24 * 60 * 60 * 1000)
    cumCost = Math.min(bestEstimate, cumCost + weeklyBurn)

    points.push({
      date: weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      projected: Math.round(cumCost),
      budget: Math.round(calculatePlannedValueAtDate(bestEstimate, startDate, endDate) || bestEstimate),
    })

    if (cumCost >= bestEstimate) break
  }

  return points
}

function generateWeeklyProgressForecast({ progressPercent, velocity, startDate: _startDate, projectedEnd }) {
  const points = []
  const now = new Date()
  const end = new Date(projectedEnd)
  let cumProgress = progressPercent
  const maxWeeks = Math.min(FORECAST_CONFIG.maxForecastWeeks, Math.ceil((end - now) / (1000 * 60 * 60 * 24 * 7)) + 2)

  for (let w = 0; w <= maxWeeks; w++) {
    const weekDate = new Date(now.getTime() + w * 7 * 24 * 60 * 60 * 1000)
    cumProgress = Math.min(100, cumProgress + velocity * 7)

    points.push({
      date: weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      projected: roundTo(cumProgress, 1),
    })

    if (cumProgress >= 100) break
  }

  return points
}

function analyzeProgressTrend(progressHistory) {
  if (progressHistory.length < 5) return 'stable'
  return analyzeTrendDirection(progressHistory.map(p => p.progress))
}

function analyzeTrendDirection(values) {
  if (values.length < 3) return 'stable'

  // Calculate deltas
  const deltas = []
  for (let i = 1; i < values.length; i++) {
    deltas.push(values[i] - values[i - 1])
  }

  const midpoint = Math.floor(deltas.length / 2)
  const firstHalf = deltas.slice(0, midpoint)
  const secondHalf = deltas.slice(midpoint)

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

  if (avgFirst <= 0) return 'stable'
  const change = (avgSecond - avgFirst) / Math.abs(avgFirst)
  if (change > 0.2) return 'improving'
  if (change < -0.2) return 'declining'
  return 'stable'
}

function findPeriodCost(costHistory, startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return costHistory
    .filter(c => {
      const d = new Date(c.date)
      return d >= start && d <= end
    })
    .reduce((sum, c) => sum + (c.dailyCost || 0), 0)
}

function weightedAverage(values) {
  if (values.length === 0) return 0
  let sum = 0
  let weightTotal = 0
  for (let i = 0; i < values.length; i++) {
    const weight = Math.pow(FORECAST_CONFIG.decayFactor, values.length - 1 - i)
    sum += values[i] * weight
    weightTotal += weight
  }
  return weightTotal > 0 ? sum / weightTotal : 0
}

function getConfidenceLevel(dataPoints, variance, bac) {
  if (dataPoints < FORECAST_CONFIG.minDataPoints) return 'low'
  const relativeVariance = bac > 0 ? variance / bac : 1
  if (dataPoints >= 14 && relativeVariance < 0.1) return 'high'
  if (dataPoints >= 7 && relativeVariance < 0.2) return 'medium'
  return 'low'
}

function getScheduleConfidence(dataPoints, velocity) {
  if (dataPoints < FORECAST_CONFIG.minDataPoints || velocity <= 0) return 'low'
  if (dataPoints >= 14) return 'high'
  if (dataPoints >= 7) return 'medium'
  return 'low'
}

function calculateOverallConfidence(costHistory, progressHistory) {
  const dataPoints = Math.min(costHistory.length, progressHistory.length)
  if (dataPoints >= 14) return 'high'
  if (dataPoints >= 7) return 'medium'
  return 'low'
}

function formatNumber(num) {
  const abs = Math.abs(num)
  const prefix = num < 0 ? '-' : ''
  if (abs >= 1000000) return `${prefix}$${(abs / 1000000).toFixed(1)}M`
  if (abs >= 1000) return `${prefix}$${(abs / 1000).toFixed(0)}K`
  return `${prefix}$${abs.toFixed(0)}`
}

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export default {
  generateProjectForecast,
  forecastCosts,
  forecastSchedule,
  analyzeProductivity,
  generateInsights,
  calculateScenarios,
  FORECAST_CONFIG,
}
