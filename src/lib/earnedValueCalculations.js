/**
 * Earned Value Management (EVM) calculations
 *
 * Standard construction industry metrics:
 * - BCWP (Budgeted Cost of Work Performed) = Earned Value
 * - BCWS (Budgeted Cost of Work Scheduled) = Planned Value
 * - ACWP (Actual Cost of Work Performed) = Actual Cost
 * - CPI (Cost Performance Index) = EV / AC
 * - SPI (Schedule Performance Index) = EV / PV
 * - EAC (Estimate at Completion) = BAC / CPI
 * - ETC (Estimate to Complete) = EAC - AC
 * - VAC (Variance at Completion) = BAC - EAC
 */

/**
 * Calculate earned value metrics for a project
 * @param {Object} params
 * @param {number} params.contractValue - Original contract value (BAC)
 * @param {number} params.changeOrderValue - Approved change order value
 * @param {number} params.progressPercent - Overall completion percentage (0-100)
 * @param {number} params.actualCosts - Total actual costs to date
 * @param {string} params.startDate - Project start date
 * @param {string} params.endDate - Planned end date
 * @param {Array} params.areas - Work areas with status, weight, scheduled_value
 * @returns {Object} Earned value metrics
 */
export function calculateEarnedValue({
  contractValue = 0,
  changeOrderValue = 0,
  progressPercent = 0,
  actualCosts = 0,
  startDate,
  endDate,
  areas = []
}) {
  // BAC = Budget at Completion (revised with change orders)
  const bac = contractValue + changeOrderValue

  // EV = Earned Value (what we've earned based on completion)
  const earnedValue = (progressPercent / 100) * bac

  // PV = Planned Value (what we should have earned by now based on schedule)
  const plannedValue = calculatePlannedValue(bac, startDate, endDate)

  // AC = Actual Cost
  const actualCost = actualCosts

  // CPI = Cost Performance Index (> 1 = under budget, < 1 = over budget)
  const cpi = actualCost > 0 ? earnedValue / actualCost : 1

  // SPI = Schedule Performance Index (> 1 = ahead, < 1 = behind)
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 1

  // CV = Cost Variance (positive = under budget)
  const costVariance = earnedValue - actualCost

  // SV = Schedule Variance (positive = ahead)
  const scheduleVariance = earnedValue - plannedValue

  // EAC = Estimate at Completion
  const eac = cpi > 0 ? bac / cpi : bac * 2

  // ETC = Estimate to Complete
  const etc = Math.max(0, eac - actualCost)

  // VAC = Variance at Completion (positive = under budget)
  const vac = bac - eac

  // TCPI = To-Complete Performance Index (CPI needed to finish on budget)
  const remainingWork = bac - earnedValue
  const remainingBudget = bac - actualCost
  const tcpi = remainingBudget > 0 ? remainingWork / remainingBudget : 999

  // Projected completion date
  const projectedEndDate = calculateProjectedEndDate(startDate, endDate, spi)

  // Health status based on CPI and SPI
  const healthStatus = getHealthStatus(cpi, spi)

  return {
    // Core EV metrics
    bac,
    earnedValue,
    plannedValue,
    actualCost,

    // Performance indices
    cpi: roundTo(cpi, 2),
    spi: roundTo(spi, 2),

    // Variances
    costVariance,
    scheduleVariance,

    // Forecasts
    eac: Math.round(eac),
    etc: Math.round(etc),
    vac: Math.round(vac),
    tcpi: roundTo(tcpi, 2),

    // Projections
    projectedEndDate,
    percentScheduled: calculatePercentScheduled(startDate, endDate),
    percentComplete: progressPercent,

    // Status
    healthStatus,
    cpiLabel: getCPILabel(cpi),
    spiLabel: getSPILabel(spi),

    // For charting
    budgetUtilization: bac > 0 ? roundTo((actualCost / bac) * 100, 1) : 0,
    earnedPercent: bac > 0 ? roundTo((earnedValue / bac) * 100, 1) : 0
  }
}

/**
 * Calculate planned value based on linear schedule
 */
function calculatePlannedValue(bac, startDate, endDate) {
  if (!startDate || !endDate) return 0

  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()

  const totalDuration = end - start
  if (totalDuration <= 0) return bac

  const elapsed = now - start
  const percentElapsed = Math.min(1, Math.max(0, elapsed / totalDuration))

  return percentElapsed * bac
}

/**
 * Calculate what percent of the schedule has elapsed
 */
function calculatePercentScheduled(startDate, endDate) {
  if (!startDate || !endDate) return 0

  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()

  const totalDuration = end - start
  if (totalDuration <= 0) return 100

  const elapsed = now - start
  return roundTo(Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)), 1)
}

/**
 * Project the end date based on SPI
 */
function calculateProjectedEndDate(startDate, endDate, spi) {
  if (!startDate || !endDate || spi <= 0) return null

  const start = new Date(startDate)
  const end = new Date(endDate)
  const totalDays = (end - start) / (1000 * 60 * 60 * 24)

  // Adjusted duration = original duration / SPI
  const adjustedDays = totalDays / spi
  const projected = new Date(start.getTime() + adjustedDays * 24 * 60 * 60 * 1000)

  return projected.toISOString().split('T')[0]
}

function getHealthStatus(cpi, spi) {
  if (cpi >= 0.95 && spi >= 0.95) return 'healthy'
  if (cpi >= 0.85 && spi >= 0.85) return 'watch'
  if (cpi >= 0.70 && spi >= 0.70) return 'warning'
  return 'critical'
}

function getCPILabel(cpi) {
  if (cpi >= 1.05) return 'Under Budget'
  if (cpi >= 0.95) return 'On Budget'
  if (cpi >= 0.85) return 'Slightly Over'
  return 'Over Budget'
}

function getSPILabel(spi) {
  if (spi >= 1.05) return 'Ahead of Schedule'
  if (spi >= 0.95) return 'On Schedule'
  if (spi >= 0.85) return 'Slightly Behind'
  return 'Behind Schedule'
}

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/**
 * Generate S-curve data points for chart
 * Shows Planned Value, Earned Value, and Actual Cost over time
 */
export function generateSCurveData({
  contractValue = 0,
  changeOrderValue = 0,
  progressPercent = 0,
  actualCosts = 0,
  startDate,
  endDate
}) {
  if (!startDate || !endDate) return []

  const bac = contractValue + changeOrderValue
  const start = new Date(startDate)
  const end = new Date(endDate)
  const now = new Date()
  const totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24))

  const points = []
  const numPoints = Math.min(12, Math.ceil(totalDays / 7)) // Weekly points, max 12

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints
    const pointDate = new Date(start.getTime() + fraction * (end - start))
    const label = pointDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    // Planned value follows linear schedule
    const pv = Math.round(fraction * bac)

    // Only show EV and AC for past dates
    const isPast = pointDate <= now
    const isCurrent = i === numPoints || (isPast && i === numPoints - 1)

    const point = {
      date: label,
      plannedValue: pv,
    }

    if (isPast || isCurrent) {
      // Interpolate EV and AC to current point
      const timePercent = Math.min(1, (pointDate - start) / (now - start))
      point.earnedValue = Math.round(timePercent * (progressPercent / 100) * bac)
      point.actualCost = Math.round(timePercent * actualCosts)
    }

    points.push(point)
  }

  return points
}
