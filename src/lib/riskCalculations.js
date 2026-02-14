/**
 * Risk Score Calculation Engine
 *
 * Calculates a composite risk score (0-100) for projects
 * based on multiple factors. Lower score = healthier project.
 *
 * Factors and weights:
 * - Budget Health: 30% - Cost ratio vs earned revenue
 * - Schedule Health: 25% - Progress vs expected progress
 * - COR Exposure: 20% - Pending COR value as % of contract
 * - Activity Cadence: 15% - Days since last daily report
 * - Safety Status: 10% - Recent injury reports
 */

// Default thresholds (can be overridden per company)
export const DEFAULT_THRESHOLDS = {
  budget: {
    healthy: 0.60,   // Green if costs < 60% of revenue
    warning: 0.75,   // Yellow if 60-75%
    critical: 0.85   // Red if > 85%
  },
  schedule: {
    healthy: 0.05,   // Green if within 5% of plan
    warning: 0.15,   // Yellow if 5-15% behind
    critical: 0.25   // Red if > 25% behind
  },
  corExposure: {
    healthy: 0.05,   // Green if pending CORs < 5% of contract
    warning: 0.15,   // Yellow if 5-15%
    critical: 0.25   // Red if > 25%
  },
  activity: {
    healthy: 1,      // Green if report within 1 day
    warning: 3,      // Yellow if 2-3 days
    critical: 5      // Red if > 5 days
  },
  safety: {
    healthy: 0,      // Green if 0 incidents in 30 days
    warning: 1,      // Yellow if 1 incident
    critical: 2      // Red if 2+ incidents
  }
}

// Factor weights (must sum to 1.0)
export const FACTOR_WEIGHTS = {
  budget: 0.30,
  schedule: 0.25,
  corExposure: 0.20,
  activity: 0.15,
  safety: 0.10
}

/**
 * Calculate individual factor score (0-100)
 * 0 = healthy, 100 = critical
 */
function calculateFactorScore(value, thresholds) {
  if (value <= thresholds.healthy) return 0
  if (value >= thresholds.critical) return 100

  // Linear interpolation between healthy and critical
  const range = thresholds.critical - thresholds.healthy
  const excess = value - thresholds.healthy
  return (excess / range) * 100
}

/**
 * Get status label for a factor score
 */
function getFactorStatus(score) {
  if (score <= 25) return 'healthy'
  if (score <= 60) return 'warning'
  return 'critical'
}

/**
 * Calculate budget health factor
 *
 * @param {number} totalCosts - Total costs to date
 * @param {number} earnedRevenue - Earned revenue to date
 * @param {object} thresholds - Custom thresholds (optional)
 */
export function calculateBudgetFactor(totalCosts, earnedRevenue, thresholds = DEFAULT_THRESHOLDS.budget) {
  if (!earnedRevenue || earnedRevenue <= 0) {
    // No revenue yet - can't calculate ratio
    return { score: 0, status: 'healthy', ratio: 0, label: 'No revenue yet' }
  }

  const ratio = totalCosts / earnedRevenue

  const score = calculateFactorScore(ratio, thresholds)
  const status = getFactorStatus(score)

  let label
  if (ratio < thresholds.healthy) {
    label = `Costs at ${(ratio * 100).toFixed(0)}% of revenue`
  } else if (ratio < thresholds.warning) {
    label = `Costs at ${(ratio * 100).toFixed(0)}% - monitor closely`
  } else {
    label = `Costs at ${(ratio * 100).toFixed(0)}% - review immediately`
  }

  return { score, status, ratio, label }
}

/**
 * Calculate schedule health factor
 *
 * @param {number} actualProgress - Actual completion percentage (0-100)
 * @param {number} expectedProgress - Expected completion percentage (0-100)
 * @param {object} thresholds - Custom thresholds (optional)
 */
export function calculateScheduleFactor(actualProgress, expectedProgress, thresholds = DEFAULT_THRESHOLDS.schedule) {
  if (!expectedProgress || expectedProgress <= 0) {
    // No schedule baseline - assume on track
    return { score: 0, status: 'healthy', variance: 0, label: 'No schedule baseline' }
  }

  // Variance as a ratio (negative = behind)
  const variance = (expectedProgress - actualProgress) / expectedProgress
  const absVariance = Math.max(0, variance) // Only penalize being behind

  const score = calculateFactorScore(absVariance, thresholds)
  const status = getFactorStatus(score)

  let label
  if (variance <= 0) {
    label = actualProgress >= 100 ? 'Complete' : 'On or ahead of schedule'
  } else if (variance < thresholds.warning) {
    label = `${(variance * 100).toFixed(0)}% behind schedule`
  } else {
    label = `${(variance * 100).toFixed(0)}% behind - needs attention`
  }

  return { score, status, variance, label }
}

/**
 * Calculate COR exposure factor
 *
 * @param {number} pendingCORValue - Total value of pending CORs
 * @param {number} contractValue - Total contract value
 * @param {object} thresholds - Custom thresholds (optional)
 */
export function calculateCORExposureFactor(pendingCORValue, contractValue, thresholds = DEFAULT_THRESHOLDS.corExposure) {
  if (!contractValue || contractValue <= 0) {
    return { score: 0, status: 'healthy', exposure: 0, label: 'No contract value' }
  }

  const exposure = pendingCORValue / contractValue

  const score = calculateFactorScore(exposure, thresholds)
  const status = getFactorStatus(score)

  let label
  if (exposure < thresholds.healthy) {
    label = pendingCORValue > 0 ? `$${formatNumber(pendingCORValue)} pending` : 'No pending CORs'
  } else if (exposure < thresholds.warning) {
    label = `$${formatNumber(pendingCORValue)} pending (${(exposure * 100).toFixed(0)}% of contract)`
  } else {
    label = `High exposure: $${formatNumber(pendingCORValue)} (${(exposure * 100).toFixed(0)}%)`
  }

  return { score, status, exposure, label }
}

/**
 * Calculate activity cadence factor
 *
 * @param {Date|string} lastReportDate - Date of last daily report
 * @param {object} thresholds - Custom thresholds (optional)
 */
export function calculateActivityFactor(lastReportDate, thresholds = DEFAULT_THRESHOLDS.activity) {
  if (!lastReportDate) {
    return { score: 100, status: 'critical', daysSince: null, label: 'No reports filed' }
  }

  const lastDate = new Date(lastReportDate)
  const now = new Date()
  const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24))

  const score = calculateFactorScore(daysSince, thresholds)
  const status = getFactorStatus(score)

  let label
  if (daysSince === 0) {
    label = 'Report filed today'
  } else if (daysSince === 1) {
    label = 'Report filed yesterday'
  } else if (daysSince <= thresholds.warning) {
    label = `Last report ${daysSince} days ago`
  } else {
    label = `No report in ${daysSince} days - may be stalled`
  }

  return { score, status, daysSince, label }
}

/**
 * Calculate safety factor
 *
 * @param {number} injuryCount - Number of injury reports in last 30 days
 * @param {object} thresholds - Custom thresholds (optional)
 */
export function calculateSafetyFactor(injuryCount, thresholds = DEFAULT_THRESHOLDS.safety) {
  const count = injuryCount || 0

  const score = calculateFactorScore(count, thresholds)
  const status = getFactorStatus(score)

  let label
  if (count === 0) {
    label = 'No incidents'
  } else if (count === 1) {
    label = '1 incident in last 30 days'
  } else {
    label = `${count} incidents - safety review needed`
  }

  return { score, status, count, label }
}

/**
 * Calculate composite risk score
 *
 * @param {object} project - Project data object
 * @param {object} options - Optional custom thresholds and weights
 * @returns {object} Risk score result with breakdown
 */
export function calculateRiskScore(project, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds }
  const weights = { ...FACTOR_WEIGHTS, ...options.weights }

  // Calculate individual factors
  const budgetFactor = calculateBudgetFactor(
    project.totalCosts,
    project.earnedRevenue,
    thresholds.budget
  )

  const scheduleFactor = calculateScheduleFactor(
    project.actualProgress,
    project.expectedProgress,
    thresholds.schedule
  )

  const corFactor = calculateCORExposureFactor(
    project.pendingCORValue,
    project.contractValue,
    thresholds.corExposure
  )

  const activityFactor = calculateActivityFactor(
    project.lastReportDate,
    thresholds.activity
  )

  const safetyFactor = calculateSafetyFactor(
    project.recentInjuryCount,
    thresholds.safety
  )

  // Calculate weighted composite score
  const compositeScore = Math.round(
    budgetFactor.score * weights.budget +
    scheduleFactor.score * weights.schedule +
    corFactor.score * weights.corExposure +
    activityFactor.score * weights.activity +
    safetyFactor.score * weights.safety
  )

  // Determine overall status
  let overallStatus
  if (compositeScore <= 25) {
    overallStatus = 'healthy'
  } else if (compositeScore <= 60) {
    overallStatus = 'warning'
  } else {
    overallStatus = 'critical'
  }

  // Generate summary label
  let summaryLabel
  if (overallStatus === 'healthy') {
    summaryLabel = 'Project is on track'
  } else if (overallStatus === 'warning') {
    summaryLabel = 'Some factors need attention'
  } else {
    summaryLabel = 'Immediate review recommended'
  }

  return {
    score: compositeScore,
    status: overallStatus,
    label: summaryLabel,
    factors: {
      budget: { ...budgetFactor, weight: weights.budget },
      schedule: { ...scheduleFactor, weight: weights.schedule },
      corExposure: { ...corFactor, weight: weights.corExposure },
      activity: { ...activityFactor, weight: weights.activity },
      safety: { ...safetyFactor, weight: weights.safety }
    }
  }
}

/**
 * Generate smart alerts based on risk factors
 *
 * @param {object} riskResult - Result from calculateRiskScore
 * @param {object} project - Project data for context
 * @returns {array} Array of alert objects
 */
export function generateSmartAlerts(riskResult, project) {
  const alerts = []

  const { factors } = riskResult

  // Critical alerts (priority 1)
  if (factors.budget.status === 'critical') {
    alerts.push({
      type: 'critical',
      title: 'Budget Alert',
      description: factors.budget.label,
      action: 'Review costs immediately',
      actionTarget: 'financials',
      projectId: project.id
    })
  }

  if (factors.activity.status === 'critical') {
    alerts.push({
      type: 'critical',
      title: 'Activity Alert',
      description: factors.activity.label,
      action: 'Check project status',
      actionTarget: 'overview',
      projectId: project.id
    })
  }

  if (factors.safety.status === 'critical') {
    alerts.push({
      type: 'critical',
      title: 'Safety Alert',
      description: factors.safety.label,
      action: 'Review safety reports',
      actionTarget: 'reports',
      projectId: project.id
    })
  }

  // Warning alerts (priority 2)
  if (factors.budget.status === 'warning') {
    alerts.push({
      type: 'warning',
      title: 'Budget Watch',
      description: factors.budget.label,
      action: 'Monitor costs',
      actionTarget: 'financials',
      projectId: project.id
    })
  }

  if (factors.schedule.status === 'critical' || factors.schedule.status === 'warning') {
    alerts.push({
      type: factors.schedule.status === 'critical' ? 'critical' : 'warning',
      title: 'Schedule Alert',
      description: factors.schedule.label,
      action: 'Review progress',
      actionTarget: 'overview',
      projectId: project.id
    })
  }

  if (factors.corExposure.status === 'warning' || factors.corExposure.status === 'critical') {
    alerts.push({
      type: factors.corExposure.status === 'critical' ? 'critical' : 'warning',
      title: 'COR Exposure',
      description: factors.corExposure.label,
      action: 'Review pending CORs',
      actionTarget: 'cors',
      projectId: project.id
    })
  }

  // Unbilled work alert (priority 2)
  if (project.unbilledAmount && project.unbilledAmount > 0) {
    const unbilledFormatted = `$${formatNumber(project.unbilledAmount / 100)}`
    const itemCount = (project.unbilledCORCount || 0) + (project.unbilledTicketCount || 0)
    alerts.push({
      type: project.unbilledAmount > 500000 ? 'warning' : 'info', // Warning if over $5,000
      title: 'Unbilled Work',
      description: `${unbilledFormatted} in approved work not yet invoiced (${itemCount} items)`,
      action: 'Create invoice',
      actionTarget: 'billing',
      projectId: project.id
    })
  }

  // Info alerts (priority 3)
  if (factors.activity.status === 'warning') {
    alerts.push({
      type: 'info',
      title: 'Activity Notice',
      description: factors.activity.label,
      action: 'File daily report',
      actionTarget: 'reports',
      projectId: project.id
    })
  }

  // Sort by priority
  const priorityOrder = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type])

  return alerts
}

/**
 * Calculate projections based on current trends
 */
export function calculateProjections(project) {
  const { actualProgress, totalCosts, earnedRevenue, contractValue } = project

  // Guard against division by zero
  if (!actualProgress || actualProgress <= 0) {
    return {
      estimatedCompletionCost: null,
      estimatedFinalMargin: null,
      estimatedCompletionDate: null
    }
  }

  // Project final cost based on current burn rate
  const costPerPercent = totalCosts / actualProgress
  const estimatedCompletionCost = Math.round(costPerPercent * 100)

  // Calculate projected margin
  const estimatedFinalMargin = contractValue > 0
    ? ((contractValue - estimatedCompletionCost) / contractValue) * 100
    : 0

  // If we have start date and progress, estimate completion
  // (This is simplified - real implementation would use more sophisticated projection)
  let estimatedCompletionDate = null
  if (project.startDate && actualProgress > 0 && actualProgress < 100) {
    const startDate = new Date(project.startDate)
    const now = new Date()
    const daysElapsed = Math.max(1, (now - startDate) / (1000 * 60 * 60 * 24))
    const progressPerDay = actualProgress / daysElapsed
    const remainingProgress = 100 - actualProgress
    const daysRemaining = remainingProgress / progressPerDay

    estimatedCompletionDate = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000)
  }

  return {
    estimatedCompletionCost,
    estimatedFinalMargin,
    estimatedCompletionDate,
    costPerPercent
  }
}

// Helper function
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K'
  }
  return num.toFixed(0)
}

export default {
  calculateRiskScore,
  generateSmartAlerts,
  calculateProjections,
  calculateBudgetFactor,
  calculateScheduleFactor,
  calculateCORExposureFactor,
  calculateActivityFactor,
  calculateSafetyFactor,
  DEFAULT_THRESHOLDS,
  FACTOR_WEIGHTS
}
