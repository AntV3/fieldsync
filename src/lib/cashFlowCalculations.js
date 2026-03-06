/**
 * Cash Flow Projection Engine
 *
 * Projects cash flow based on:
 * - Billing schedule (receivables)
 * - Cost commitments (payables)
 * - Payment terms and collection rates
 * - Progress-based revenue recognition
 */

// ---- Configuration ----

export const CASH_FLOW_CONFIG = {
  // Default payment terms (days)
  receivableDays: 30,   // How long clients take to pay
  payableDays: 15,      // How long to pay vendors
  retentionPercent: 10,  // Retention held until completion
  // Billing frequency
  billingCycleWeeks: 4,  // Monthly billing
  // Forecast horizon
  forecastMonths: 6,
}

/**
 * Generate comprehensive cash flow projection
 *
 * @param {Object} params
 * @param {Array} params.projects - Active projects with financial data
 * @param {Array} params.invoices - Existing invoices with status and dates
 * @param {Array} params.costHistory - Historical cost data
 * @param {Object} params.config - Override default config
 * @returns {Object} Cash flow projection
 */
export function generateCashFlowProjection({
  projects = [],
  invoices = [],
  costHistory = [],
  config = {},
}) {
  const cfg = { ...CASH_FLOW_CONFIG, ...config }

  // Calculate receivables pipeline
  const receivables = projectReceivables(projects, invoices, cfg)

  // Calculate payables pipeline
  const payables = projectPayables(projects, costHistory, cfg)

  // Build monthly cash flow forecast
  const monthlyForecast = buildMonthlyCashFlow(receivables, payables, cfg)

  // Calculate key metrics
  const metrics = calculateCashFlowMetrics(monthlyForecast, receivables, payables)

  // Identify cash flow risks
  const risks = identifyCashFlowRisks(monthlyForecast, metrics)

  return {
    monthlyForecast,
    receivables,
    payables,
    metrics,
    risks,
    config: cfg,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Project future receivables based on progress and billing schedule
 */
export function projectReceivables(projects, invoices, config) {
  const now = new Date()
  const entries = []

  // Outstanding invoices (already billed, awaiting payment)
  const outstanding = invoices.filter(inv =>
    inv.status === 'sent' || inv.status === 'pending' || inv.status === 'overdue'
  )

  for (const inv of outstanding) {
    const invoiceDate = new Date(inv.date || inv.created_at)
    const dueDate = new Date(invoiceDate.getTime() + config.receivableDays * 24 * 60 * 60 * 1000)
    const isOverdue = dueDate < now

    entries.push({
      type: 'outstanding',
      projectId: inv.project_id,
      projectName: inv.project_name || 'Unknown',
      amount: inv.amount || 0,
      date: invoiceDate.toISOString().split('T')[0],
      expectedDate: dueDate.toISOString().split('T')[0],
      status: isOverdue ? 'overdue' : 'pending',
      source: 'invoice',
    })
  }

  // Projected future billings based on remaining contract value
  for (const project of projects) {
    const contractValue = (project.contractValue || project.contract_value || 0) +
      (project.changeOrderValue || project.approved_cor_value || 0)
    const progress = project.progress || project.progressPercent || 0
    const earned = (progress / 100) * contractValue
    const billed = project.totalBilled || project.billed || 0
    const unbilled = Math.max(0, earned - billed)
    const remaining = Math.max(0, contractValue - earned)

    // Unbilled earned revenue (bill next cycle)
    if (unbilled > 100) {
      const nextBillDate = getNextBillingDate(now, config.billingCycleWeeks)
      const expectedPayDate = new Date(nextBillDate.getTime() + config.receivableDays * 24 * 60 * 60 * 1000)

      entries.push({
        type: 'unbilled_earned',
        projectId: project.id,
        projectName: project.name,
        amount: Math.round(unbilled),
        date: nextBillDate.toISOString().split('T')[0],
        expectedDate: expectedPayDate.toISOString().split('T')[0],
        status: 'projected',
        source: 'progress',
      })
    }

    // Future billings based on projected progress
    if (remaining > 0 && progress < 100) {
      const monthlyRate = estimateMonthlyEarningRate(project)
      let cumEarned = earned

      for (let m = 1; m <= config.forecastMonths; m++) {
        const monthEarned = Math.min(remaining - (cumEarned - earned), monthlyRate)
        if (monthEarned <= 0) break

        cumEarned += monthEarned
        const billDate = new Date(now.getFullYear(), now.getMonth() + m, 1)
        const payDate = new Date(billDate.getTime() + config.receivableDays * 24 * 60 * 60 * 1000)
        const netAmount = Math.round(monthEarned * (1 - config.retentionPercent / 100))

        entries.push({
          type: 'projected',
          projectId: project.id,
          projectName: project.name,
          amount: netAmount,
          grossAmount: Math.round(monthEarned),
          retentionAmount: Math.round(monthEarned * config.retentionPercent / 100),
          date: billDate.toISOString().split('T')[0],
          expectedDate: payDate.toISOString().split('T')[0],
          status: 'forecast',
          source: 'projection',
        })
      }
    }
  }

  // Sort by expected date
  entries.sort((a, b) => new Date(a.expectedDate) - new Date(b.expectedDate))

  return {
    entries,
    totalOutstanding: entries.filter(e => e.type === 'outstanding').reduce((s, e) => s + e.amount, 0),
    totalUnbilled: entries.filter(e => e.type === 'unbilled_earned').reduce((s, e) => s + e.amount, 0),
    totalProjected: entries.filter(e => e.type === 'projected').reduce((s, e) => s + e.amount, 0),
    overdueAmount: entries.filter(e => e.status === 'overdue').reduce((s, e) => s + e.amount, 0),
  }
}

/**
 * Project future payables (costs)
 */
export function projectPayables(projects, costHistory, config) {
  const now = new Date()
  const entries = []

  for (const project of projects) {
    const progress = project.progress || project.progressPercent || 0
    if (progress >= 100) continue

    const monthlyCost = estimateMonthlyCostRate(project, costHistory)
    if (monthlyCost <= 0) continue

    for (let m = 0; m < config.forecastMonths; m++) {
      const costDate = new Date(now.getFullYear(), now.getMonth() + m, 15)
      const payDate = new Date(costDate.getTime() + config.payableDays * 24 * 60 * 60 * 1000)

      // Break down by category
      const breakdown = estimateCostBreakdown(project, monthlyCost)

      entries.push({
        type: m === 0 ? 'committed' : 'projected',
        projectId: project.id,
        projectName: project.name,
        amount: Math.round(monthlyCost),
        date: costDate.toISOString().split('T')[0],
        payDate: payDate.toISOString().split('T')[0],
        status: m === 0 ? 'committed' : 'forecast',
        breakdown,
      })
    }
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date))

  return {
    entries,
    totalCommitted: entries.filter(e => e.type === 'committed').reduce((s, e) => s + e.amount, 0),
    totalProjected: entries.filter(e => e.type === 'projected').reduce((s, e) => s + e.amount, 0),
  }
}

/**
 * Build month-by-month cash flow forecast
 */
export function buildMonthlyCashFlow(receivables, payables, config) {
  const now = new Date()
  const months = []
  let runningBalance = 0

  for (let m = 0; m < config.forecastMonths; m++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0)
    const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

    // Sum inflows for this month (by expected payment date)
    const inflows = receivables.entries
      .filter(e => {
        const d = new Date(e.expectedDate)
        return d >= monthStart && d <= monthEnd
      })
      .reduce((s, e) => s + e.amount, 0)

    // Sum outflows for this month
    const outflows = payables.entries
      .filter(e => {
        const d = new Date(e.payDate || e.date)
        return d >= monthStart && d <= monthEnd
      })
      .reduce((s, e) => s + e.amount, 0)

    const netCashFlow = inflows - outflows
    runningBalance += netCashFlow

    months.push({
      month: monthLabel,
      date: monthStart.toISOString().split('T')[0],
      inflows: Math.round(inflows),
      outflows: Math.round(outflows),
      net: Math.round(netCashFlow),
      cumulative: Math.round(runningBalance),
      inflowCount: receivables.entries.filter(e => {
        const d = new Date(e.expectedDate)
        return d >= monthStart && d <= monthEnd
      }).length,
      outflowCount: payables.entries.filter(e => {
        const d = new Date(e.payDate || e.date)
        return d >= monthStart && d <= monthEnd
      }).length,
    })
  }

  return months
}

/**
 * Calculate summary cash flow metrics
 */
export function calculateCashFlowMetrics(monthlyForecast, receivables, payables) {
  const totalInflows = monthlyForecast.reduce((s, m) => s + m.inflows, 0)
  const totalOutflows = monthlyForecast.reduce((s, m) => s + m.outflows, 0)

  // Average monthly net
  const avgMonthlyNet = monthlyForecast.length > 0
    ? Math.round(monthlyForecast.reduce((s, m) => s + m.net, 0) / monthlyForecast.length)
    : 0

  // Months with negative cash flow
  const negativeMonths = monthlyForecast.filter(m => m.net < 0).length

  // Cash conversion cycle (simplified)
  const dso = receivables.totalOutstanding > 0
    ? Math.round((receivables.totalOutstanding / totalInflows) * monthlyForecast.length * 30)
    : 0

  // Lowest cumulative point (max cash need)
  const minCumulative = Math.min(...monthlyForecast.map(m => m.cumulative), 0)

  return {
    totalInflows: Math.round(totalInflows),
    totalOutflows: Math.round(totalOutflows),
    netCashFlow: Math.round(totalInflows - totalOutflows),
    avgMonthlyNet,
    negativeMonths,
    daysReceivable: dso,
    peakCashNeed: Math.abs(Math.round(minCumulative)),
    outstandingReceivables: receivables.totalOutstanding,
    overdueReceivables: receivables.overdueAmount,
    cashFlowRatio: totalOutflows > 0 ? roundTo(totalInflows / totalOutflows, 2) : 0,
  }
}

/**
 * Identify cash flow risks
 */
export function identifyCashFlowRisks(monthlyForecast, metrics) {
  const risks = []

  if (metrics.negativeMonths >= 2) {
    risks.push({
      type: 'critical',
      title: 'Sustained Negative Cash Flow',
      description: `${metrics.negativeMonths} months projected with negative cash flow.`,
      action: 'Accelerate billing or negotiate faster payment terms',
    })
  }

  if (metrics.overdueReceivables > 0) {
    risks.push({
      type: 'warning',
      title: 'Overdue Receivables',
      description: `$${formatCompact(metrics.overdueReceivables)} in overdue invoices.`,
      action: 'Follow up on overdue payments',
    })
  }

  if (metrics.peakCashNeed > 0) {
    risks.push({
      type: 'warning',
      title: 'Cash Reserve Needed',
      description: `Peak cash shortfall of $${formatCompact(metrics.peakCashNeed)} projected.`,
      action: 'Ensure sufficient credit line or reserves',
    })
  }

  if (metrics.cashFlowRatio < 1.1) {
    risks.push({
      type: 'info',
      title: 'Tight Cash Flow Ratio',
      description: `Inflow/outflow ratio is ${metrics.cashFlowRatio}x (healthy > 1.2x).`,
      action: 'Monitor closely and consider billing acceleration',
    })
  }

  return risks
}

// ---- Helper Functions ----

function getNextBillingDate(from, cycleWeeks) {
  const next = new Date(from)
  next.setDate(next.getDate() + cycleWeeks * 7)
  // Align to 1st of month
  next.setDate(1)
  if (next <= from) next.setMonth(next.getMonth() + 1)
  return next
}

function estimateMonthlyEarningRate(project) {
  const contractValue = (project.contractValue || project.contract_value || 0) +
    (project.changeOrderValue || project.approved_cor_value || 0)
  const progress = project.progress || project.progressPercent || 0
  const startDate = project.startDate || project.start_date
  const endDate = project.endDate || project.end_date

  if (!startDate || !endDate || contractValue <= 0) {
    return contractValue * 0.1 // Assume 10% per month as fallback
  }

  const totalMonths = Math.max(1,
    (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30)
  )

  // If project is active, use actual pace
  if (progress > 5) {
    const elapsed = (new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30)
    const monthlyRate = elapsed > 0 ? (progress / 100 * contractValue) / elapsed : contractValue / totalMonths
    return monthlyRate
  }

  return contractValue / totalMonths
}

function estimateMonthlyCostRate(project, costHistory) {
  const totalCosts = project.totalCosts || project.billable || 0
  const progress = project.progress || project.progressPercent || 0
  const startDate = project.startDate || project.start_date

  // Use actual burn rate if available
  if (totalCosts > 0 && startDate) {
    const months = Math.max(1,
      (new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30)
    )
    return totalCosts / months
  }

  // Fallback: estimate from contract value and typical margin
  const contractValue = (project.contractValue || project.contract_value || 0)
  const endDate = project.endDate || project.end_date
  if (contractValue > 0 && startDate && endDate) {
    const totalMonths = Math.max(1,
      (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30)
    )
    return (contractValue * 0.75) / totalMonths // Assume 75% cost ratio
  }

  return 0
}

function estimateCostBreakdown(project, monthlyCost) {
  // Use project's actual ratio if available, else use industry typical
  const laborRatio = 0.55
  const materialsRatio = 0.25
  const equipmentRatio = 0.12
  const otherRatio = 0.08

  return {
    labor: Math.round(monthlyCost * laborRatio),
    materials: Math.round(monthlyCost * materialsRatio),
    equipment: Math.round(monthlyCost * equipmentRatio),
    other: Math.round(monthlyCost * otherRatio),
  }
}

function formatCompact(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
  return num.toFixed(0)
}

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export default {
  generateCashFlowProjection,
  projectReceivables,
  projectPayables,
  buildMonthlyCashFlow,
  calculateCashFlowMetrics,
  identifyCashFlowRisks,
  CASH_FLOW_CONFIG,
}
