import React, { useMemo } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Minus, Info, Building2, Factory } from 'lucide-react'

/**
 * BenchmarkComparison
 *
 * Displays project metrics against industry benchmarks and company averages.
 * Helps users understand where their project stands relative to standards.
 *
 * Features:
 * - Visual bar comparisons
 * - Industry benchmark data
 * - Company average comparison
 * - Clear better/worse indicators
 * - Accessible design
 */

// Industry benchmarks for construction projects
// Based on common industry standards
export const INDUSTRY_BENCHMARKS = {
  profitMargin: {
    label: 'Profit Margin',
    industry: 15, // 15% is typical for construction
    unit: '%',
    higherIsBetter: true,
    description: 'Net profit as percentage of revenue'
  },
  costRatio: {
    label: 'Cost-to-Revenue Ratio',
    industry: 75, // 75% costs is healthy
    unit: '%',
    higherIsBetter: false,
    description: 'Total costs as percentage of earned revenue'
  },
  scheduleVariance: {
    label: 'Schedule Variance',
    industry: 5, // 5% variance is acceptable
    unit: '%',
    higherIsBetter: false,
    description: 'Difference between actual and planned progress'
  },
  changeOrderRate: {
    label: 'Change Order Rate',
    industry: 10, // 10% of contract value
    unit: '%',
    higherIsBetter: false,
    description: 'Change orders as percentage of contract value'
  },
  reportingFrequency: {
    label: 'Daily Report Rate',
    industry: 95, // 95% of workdays should have reports
    unit: '%',
    higherIsBetter: true,
    description: 'Percentage of workdays with daily reports filed'
  },
  safetyIncidentRate: {
    label: 'Safety Incidents',
    industry: 0.5, // per month
    unit: '/mo',
    higherIsBetter: false,
    description: 'Average safety incidents per month'
  }
}

/**
 * Calculate performance relative to benchmark
 * Returns a number from -100 to 100 where:
 * - Positive = better than benchmark
 * - Negative = worse than benchmark
 * - 0 = at benchmark
 */
function calculatePerformance(value, benchmark, higherIsBetter) {
  if (value === null || value === undefined || benchmark === 0) return 0

  const diff = value - benchmark
  const percentDiff = (diff / benchmark) * 100

  // Normalize to -100 to 100 range
  const normalized = Math.max(-100, Math.min(100, percentDiff))

  // Flip sign if lower is better
  return higherIsBetter ? normalized : -normalized
}

/**
 * BenchmarkBar
 *
 * Visual bar showing value vs benchmark
 */
function BenchmarkBar({
  label,
  value,
  benchmark,
  companyAverage,
  unit = '',
  higherIsBetter = true,
  description = ''
}) {
  const performance = calculatePerformance(value, benchmark, higherIsBetter)
  const companyPerformance = companyAverage !== undefined
    ? calculatePerformance(companyAverage, benchmark, higherIsBetter)
    : null

  // Determine status
  const getStatus = (perf) => {
    if (perf > 10) return 'better'
    if (perf < -10) return 'worse'
    return 'neutral'
  }

  const status = getStatus(performance)

  const statusColors = {
    better: 'var(--status-success)',
    worse: 'var(--status-danger)',
    neutral: 'var(--status-info)'
  }

  const statusIcons = {
    better: TrendingUp,
    worse: TrendingDown,
    neutral: Minus
  }

  const StatusIcon = statusIcons[status]

  // Format value
  const formatValue = (val) => {
    if (val === null || val === undefined) return 'N/A'
    return `${val.toFixed(1)}${unit}`
  }

  // Calculate bar position (0-100 scale centered at 50)
  const getBarPosition = (val, bench) => {
    if (val === null || val === undefined) return 50
    const ratio = val / bench
    // Map to 0-100 where 50 is benchmark
    return Math.max(10, Math.min(90, 50 * ratio))
  }

  const valuePosition = getBarPosition(value, benchmark)

  return (
    <div className="benchmark-bar" role="group" aria-label={`${label} benchmark comparison`}>
      <div className="benchmark-bar__header">
        <span className="benchmark-bar__label">{label}</span>
        <span
          className="benchmark-bar__status"
          style={{ color: statusColors[status] }}
        >
          <StatusIcon size={14} />
          <span>{formatValue(value)}</span>
        </span>
      </div>

      <div className="benchmark-bar__track">
        {/* Industry benchmark marker */}
        <div
          className="benchmark-bar__marker benchmark-bar__marker--industry"
          style={{ left: '50%' }}
          title={`Industry: ${formatValue(benchmark)}`}
          aria-label={`Industry benchmark: ${formatValue(benchmark)}`}
        >
          <div className="benchmark-bar__marker-line" />
          <span className="benchmark-bar__marker-label">Industry</span>
        </div>

        {/* Company average marker (if available) */}
        {companyAverage !== undefined && (
          <div
            className="benchmark-bar__marker benchmark-bar__marker--company"
            style={{ left: `${getBarPosition(companyAverage, benchmark)}%` }}
            title={`Company Avg: ${formatValue(companyAverage)}`}
            aria-label={`Company average: ${formatValue(companyAverage)}`}
          >
            <div className="benchmark-bar__marker-line benchmark-bar__marker-line--dashed" />
            <span className="benchmark-bar__marker-label">Co. Avg</span>
          </div>
        )}

        {/* Value indicator */}
        <div
          className={`benchmark-bar__value benchmark-bar__value--${status}`}
          style={{ left: `${valuePosition}%` }}
          role="img"
          aria-label={`Project value: ${formatValue(value)}`}
        />
      </div>

      <div className="benchmark-bar__footer">
        <span className="benchmark-bar__scale">
          {higherIsBetter ? 'Lower' : 'Better'}
        </span>
        <span className="benchmark-bar__description">{description}</span>
        <span className="benchmark-bar__scale">
          {higherIsBetter ? 'Better' : 'Lower'}
        </span>
      </div>
    </div>
  )
}

/**
 * BenchmarkSummary
 *
 * Quick summary of how project compares to benchmarks
 */
function BenchmarkSummary({ metrics, benchmarks }) {
  const analysis = useMemo(() => {
    let betterCount = 0
    let worseCount = 0
    let neutralCount = 0

    Object.entries(metrics).forEach(([key, value]) => {
      if (benchmarks[key] && value !== null && value !== undefined) {
        const benchmark = benchmarks[key]
        const perf = calculatePerformance(value, benchmark.industry, benchmark.higherIsBetter)
        if (perf > 10) betterCount++
        else if (perf < -10) worseCount++
        else neutralCount++
      }
    })

    return { betterCount, worseCount, neutralCount }
  }, [metrics, benchmarks])

  const total = analysis.betterCount + analysis.worseCount + analysis.neutralCount
  if (total === 0) return null

  return (
    <div className="benchmark-summary">
      <div className="benchmark-summary__item benchmark-summary__item--better">
        <span className="benchmark-summary__count">{analysis.betterCount}</span>
        <span className="benchmark-summary__label">above benchmark</span>
      </div>
      <div className="benchmark-summary__item benchmark-summary__item--neutral">
        <span className="benchmark-summary__count">{analysis.neutralCount}</span>
        <span className="benchmark-summary__label">at benchmark</span>
      </div>
      <div className="benchmark-summary__item benchmark-summary__item--worse">
        <span className="benchmark-summary__count">{analysis.worseCount}</span>
        <span className="benchmark-summary__label">below benchmark</span>
      </div>
    </div>
  )
}

/**
 * Main BenchmarkComparison component
 */
export function BenchmarkComparison({
  projectMetrics,
  companyAverages = {},
  showSummary = true,
  className = ''
}) {
  // Map project data to benchmark keys
  const metrics = useMemo(() => ({
    profitMargin: projectMetrics.profitMargin ?? projectMetrics.margin,
    costRatio: projectMetrics.costRatio ?? (
      projectMetrics.totalCosts && projectMetrics.earnedRevenue
        ? (projectMetrics.totalCosts / projectMetrics.earnedRevenue) * 100
        : null
    ),
    scheduleVariance: projectMetrics.scheduleVariance ?? Math.abs(
      (projectMetrics.expectedProgress || 0) - (projectMetrics.actualProgress || 0)
    ),
    changeOrderRate: projectMetrics.changeOrderRate ?? (
      projectMetrics.pendingCORValue && projectMetrics.contractValue
        ? (projectMetrics.pendingCORValue / projectMetrics.contractValue) * 100
        : null
    ),
    reportingFrequency: projectMetrics.reportingFrequency,
    safetyIncidentRate: projectMetrics.safetyIncidentRate ?? projectMetrics.recentInjuryCount
  }), [projectMetrics])

  return (
    <div className={`benchmark-comparison ${className}`}>
      <div className="benchmark-comparison__header">
        <div className="benchmark-comparison__title-row">
          <BarChart3 size={20} />
          <h3 className="benchmark-comparison__title">Benchmark Comparison</h3>
        </div>
        <p className="benchmark-comparison__subtitle">
          How this project compares to industry standards
        </p>
      </div>

      {showSummary && (
        <BenchmarkSummary metrics={metrics} benchmarks={INDUSTRY_BENCHMARKS} />
      )}

      <div className="benchmark-comparison__legend">
        <div className="benchmark-comparison__legend-item">
          <Factory size={14} />
          <span>Industry Standard</span>
        </div>
        {Object.keys(companyAverages).length > 0 && (
          <div className="benchmark-comparison__legend-item">
            <Building2 size={14} />
            <span>Company Average</span>
          </div>
        )}
      </div>

      <div className="benchmark-comparison__bars">
        {Object.entries(INDUSTRY_BENCHMARKS).map(([key, benchmark]) => {
          const value = metrics[key]
          if (value === null || value === undefined) return null

          return (
            <BenchmarkBar
              key={key}
              label={benchmark.label}
              value={value}
              benchmark={benchmark.industry}
              companyAverage={companyAverages[key]}
              unit={benchmark.unit}
              higherIsBetter={benchmark.higherIsBetter}
              description={benchmark.description}
            />
          )
        })}
      </div>

      <div className="benchmark-comparison__info">
        <Info size={14} />
        <span>
          Industry benchmarks are based on typical construction project performance.
          Your company averages are calculated from all active projects.
        </span>
      </div>
    </div>
  )
}

/**
 * Compact benchmark indicator for list views
 */
export function BenchmarkIndicator({
  value,
  benchmarkKey,
  showLabel = true,
  className = ''
}) {
  const benchmark = INDUSTRY_BENCHMARKS[benchmarkKey]
  if (!benchmark || value === null || value === undefined) return null

  const performance = calculatePerformance(value, benchmark.industry, benchmark.higherIsBetter)

  const getStatus = (perf) => {
    if (perf > 10) return 'better'
    if (perf < -10) return 'worse'
    return 'neutral'
  }

  const status = getStatus(performance)

  const statusLabels = {
    better: 'Above benchmark',
    worse: 'Below benchmark',
    neutral: 'At benchmark'
  }

  const statusIcons = {
    better: TrendingUp,
    worse: TrendingDown,
    neutral: Minus
  }

  const StatusIcon = statusIcons[status]

  return (
    <div
      className={`benchmark-indicator benchmark-indicator--${status} ${className}`}
      title={`${benchmark.label}: ${value.toFixed(1)}${benchmark.unit} (Industry: ${benchmark.industry}${benchmark.unit})`}
    >
      <StatusIcon size={12} aria-hidden="true" />
      {showLabel && (
        <span className="benchmark-indicator__label">{statusLabels[status]}</span>
      )}
    </div>
  )
}

/**
 * Hook to calculate company averages from project list
 */
export function useCompanyAverages(projects) {
  return useMemo(() => {
    if (!projects || projects.length === 0) return {}

    const totals = {
      profitMargin: { sum: 0, count: 0 },
      costRatio: { sum: 0, count: 0 },
      scheduleVariance: { sum: 0, count: 0 },
      changeOrderRate: { sum: 0, count: 0 },
      safetyIncidentRate: { sum: 0, count: 0 }
    }

    projects.forEach(project => {
      // Profit margin
      if (project.margin !== undefined) {
        totals.profitMargin.sum += project.margin
        totals.profitMargin.count++
      }

      // Cost ratio
      if (project.totalCosts && project.earnedRevenue) {
        totals.costRatio.sum += (project.totalCosts / project.earnedRevenue) * 100
        totals.costRatio.count++
      }

      // Schedule variance
      if (project.expectedProgress !== undefined && project.actualProgress !== undefined) {
        totals.scheduleVariance.sum += Math.abs(project.expectedProgress - project.actualProgress)
        totals.scheduleVariance.count++
      }

      // Change order rate
      if (project.pendingCORValue && project.contractValue) {
        totals.changeOrderRate.sum += (project.pendingCORValue / project.contractValue) * 100
        totals.changeOrderRate.count++
      }

      // Safety incidents
      if (project.recentInjuryCount !== undefined) {
        totals.safetyIncidentRate.sum += project.recentInjuryCount
        totals.safetyIncidentRate.count++
      }
    })

    const averages = {}
    Object.entries(totals).forEach(([key, { sum, count }]) => {
      if (count > 0) {
        averages[key] = sum / count
      }
    })

    return averages
  }, [projects])
}

export default BenchmarkComparison
