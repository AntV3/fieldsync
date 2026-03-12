import React from 'react'
import {
  DollarSign, Clock, TrendingUp, TrendingDown, Users,
  CheckCircle2, AlertTriangle, XCircle, Activity, Minus,
  Target, Calendar, Percent
} from 'lucide-react'
import { InfoTooltip } from '../ui'

/**
 * ProjectHealthOverview
 *
 * Top-level dashboard showing the overall health of a project at a glance.
 * Combines budget, schedule, cash flow, and resource signals into one view.
 */
export default function ProjectHealthOverview({
  forecast,
  cashFlow,
  resourceData,
  progress,
  revisedContractValue,
  projectData,
  changeOrderValue,
  selectedProject,
  projections,
}) {
  // ---- Budget Health ----
  const budgetHealth = getBudgetHealth(forecast, revisedContractValue, projectData)

  // ---- Schedule Health ----
  const scheduleHealth = getScheduleHealth(forecast, selectedProject, progress)

  // ---- Cash Flow Health ----
  const cashFlowHealth = getCashFlowHealth(cashFlow)

  // ---- Resource Health ----
  const resourceHealth = getResourceHealth(resourceData)

  // ---- Overall Health ----
  const signals = [budgetHealth, scheduleHealth, cashFlowHealth, resourceHealth].filter(s => s.status !== 'no_data')
  const overallScore = signals.length > 0
    ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
    : null
  const overallStatus = overallScore === null ? 'no_data'
    : overallScore >= 75 ? 'healthy'
    : overallScore >= 50 ? 'warning'
    : 'critical'

  return (
    <div className="health-overview health-overview--executive">
      <div className="health-overview__header">
        <div className="health-overview__title-row">
          <div className="health-overview__title-icon">
            <Activity size={20} />
          </div>
          <div>
            <div className="health-overview__title-with-tooltip">
              <h3 className="health-overview__title">Project Health</h3>
              <InfoTooltip text="Overall score = average of Budget, Schedule, Cash Flow, and Resource scores (0–100). Healthy ≥ 75, Warning ≥ 50, Critical < 50" size={13} />
            </div>
            <span className="health-overview__subtitle">Real-time status across all dimensions</span>
          </div>
        </div>
        {overallScore !== null && (
          <OverallHealthBadge score={overallScore} status={overallStatus} />
        )}
      </div>

      <div className="health-overview__section-divider" />

      <div className="health-overview__signals">
        <HealthSignal
          label="Budget"
          icon={DollarSign}
          status={budgetHealth.status}
          value={budgetHealth.value}
          detail={budgetHealth.detail}
          score={budgetHealth.score}
          tooltip="Projected final cost vs contract value. Healthy = under budget, Warning = 0–10% over, Critical = >10% over"
        />
        <HealthSignal
          label="Schedule"
          icon={Clock}
          status={scheduleHealth.status}
          value={scheduleHealth.value}
          detail={scheduleHealth.detail}
          score={scheduleHealth.score}
          tooltip="Actual progress vs expected progress based on elapsed time. Slippage = projected end date − planned end date"
        />
        <HealthSignal
          label="Cash Flow"
          icon={TrendingUp}
          status={cashFlowHealth.status}
          value={cashFlowHealth.value}
          detail={cashFlowHealth.detail}
          score={cashFlowHealth.score}
          tooltip="Cash Flow Ratio = Total Inflows ÷ Total Outflows. Healthy > 1.1x, Warning 0.8–1.1x, Critical < 0.8x"
        />
        <HealthSignal
          label="Resources"
          icon={Users}
          status={resourceHealth.status}
          value={resourceHealth.value}
          detail={resourceHealth.detail}
          score={resourceHealth.score}
          tooltip="Crew allocated vs estimated need. Critical = <60% staffed, Warning = <85% staffed or scheduling conflicts"
        />
      </div>

      {/* Key Projections — compact row of 3 forward-looking metrics */}
      {projections && (
        <>
          <div className="health-overview__section-divider" />
          <KeyProjectionsRow projections={projections} />
        </>
      )}

      {/* Key alerts - only show if there are actionable issues */}
      {signals.some(s => s.status === 'critical' || s.status === 'warning') && (
        <>
          <div className="health-overview__section-divider" />
          <div className="health-overview__alerts">
            <span className="health-overview__alerts-title">Action Items</span>
            {signals
              .filter(s => s.status === 'critical' || s.status === 'warning')
              .map((s, i) => (
                <div key={i} className={`health-alert health-alert--${s.status}`}>
                  <div className="health-alert__icon-wrap">
                    {s.status === 'critical' && <span className="health-alert__pulse health-alert__pulse--critical" />}
                    {s.status === 'warning' && <span className="health-alert__pulse health-alert__pulse--warning" />}
                    <AlertTriangle size={14} />
                  </div>
                  <span>{s.alert}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

function OverallHealthBadge({ score, status }) {
  const colors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-danger)',
  }
  const labels = {
    healthy: 'Healthy',
    warning: 'Needs Attention',
    critical: 'At Risk',
  }

  const color = colors[status]
  const radius = 36
  const strokeWidth = 5
  const size = 88
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const dashOffset = circumference - progress

  return (
    <div className={`health-badge-v2 health-badge-v2--${status}`}>
      <div className="health-badge-v2__gauge">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background glow */}
          <defs>
            <filter id={`health-glow-${status}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id={`health-grad-${status}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {/* Track circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--bg-secondary)"
            strokeWidth={strokeWidth + 1}
            opacity="0.5"
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#health-grad-${status})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
            filter={`url(#health-glow-${status})`}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
          {/* Score text */}
          <text
            x={center}
            y={center - 4}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize="22"
            fontWeight="700"
            fontFamily="inherit"
          >
            {score}
          </text>
          <text
            x={center}
            y={center + 14}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--text-muted)"
            fontSize="9"
            fontWeight="500"
            fontFamily="inherit"
            letterSpacing="0.05em"
          >
            / 100
          </text>
        </svg>
      </div>
      <div className={`health-badge-v2__label health-badge-v2__label--${status}`}>
        {status === 'critical' && <span className="health-badge-v2__pulse health-badge-v2__pulse--critical" />}
        {status === 'warning' && <span className="health-badge-v2__pulse health-badge-v2__pulse--warning" />}
        {status === 'healthy' ? <CheckCircle2 size={13} /> : status === 'warning' ? <AlertTriangle size={13} /> : <XCircle size={13} />}
        <span>{labels[status]}</span>
      </div>
    </div>
  )
}

function HealthSignal({ label, icon: Icon, status, value, detail, tooltip }) {
  const statusColors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-danger)',
    no_data: 'var(--text-muted)',
  }

  const StatusIcon = status === 'healthy' ? CheckCircle2
    : status === 'warning' ? AlertTriangle
    : status === 'critical' ? XCircle
    : Minus

  return (
    <div className={`health-signal health-signal--${status} health-signal--v2`}>
      <div className="health-signal__gradient-bg" />
      <div className="health-signal__content">
        <div className="health-signal__icon-row">
          <div className="health-signal__icon-badge" style={{ color: statusColors[status] }}>
            <Icon size={16} />
          </div>
          <span className="health-signal__label">{label}</span>
          {tooltip && <InfoTooltip text={tooltip} size={12} />}
          {(status === 'critical' || status === 'warning') && (
            <span className={`health-signal__pulse health-signal__pulse--${status}`} />
          )}
        </div>
        <div className="health-signal__value" style={{ color: statusColors[status] }}>
          {value}
        </div>
        <div className="health-signal__detail">{detail}</div>
        <div className="health-signal__indicator">
          <StatusIcon size={12} style={{ color: statusColors[status] }} />
        </div>
      </div>
    </div>
  )
}

function KeyProjectionsRow({ projections }) {
  const { estimatedCompletionCost, estimatedFinalMargin, estimatedCompletionDate, originalBudget, plannedCompletionDate } = projections

  const costStatus = !estimatedCompletionCost || !originalBudget
    ? 'neutral'
    : estimatedCompletionCost <= originalBudget ? 'better' : 'worse'

  const marginStatus = estimatedFinalMargin == null
    ? 'neutral'
    : estimatedFinalMargin >= 15 ? 'better' : estimatedFinalMargin >= 0 ? 'warning' : 'worse'

  const statusColors = {
    better: 'var(--status-success)',
    worse: 'var(--status-danger)',
    warning: 'var(--status-warning)',
    neutral: 'var(--text-muted)',
  }

  return (
    <div className="health-overview__projections">
      <span className="health-overview__projections-title">Key Projections</span>
      <div className="health-overview__projections-row">
        {estimatedCompletionCost != null && (
          <div className="health-overview__projection-item">
            <Target size={14} style={{ color: statusColors[costStatus] }} />
            <span className="health-overview__projection-label">Est. Cost</span>
            <span className="health-overview__projection-value" style={{ color: statusColors[costStatus] }}>
              ${formatCompact(estimatedCompletionCost)}
            </span>
          </div>
        )}
        {estimatedFinalMargin != null && (
          <div className="health-overview__projection-item">
            <Percent size={14} style={{ color: statusColors[marginStatus] }} />
            <span className="health-overview__projection-label">Margin</span>
            <span className="health-overview__projection-value" style={{ color: statusColors[marginStatus] }}>
              {estimatedFinalMargin.toFixed(1)}%
            </span>
          </div>
        )}
        {estimatedCompletionDate && (
          <div className="health-overview__projection-item">
            <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="health-overview__projection-label">Est. Finish</span>
            <span className="health-overview__projection-value">
              {new Date(estimatedCompletionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Health Calculators ----

function getBudgetHealth(forecast, revisedContractValue, projectData) {
  if (!forecast?.cost?.bestEstimate || !revisedContractValue) {
    const totalCosts = projectData?.allCostsTotal || 0
    if (totalCosts > 0 && revisedContractValue > 0) {
      const spent = (totalCosts / revisedContractValue) * 100
      return {
        status: spent > 90 ? 'critical' : spent > 75 ? 'warning' : 'healthy',
        score: spent > 90 ? 30 : spent > 75 ? 60 : 85,
        value: `${spent.toFixed(0)}% spent`,
        detail: `$${formatCompact(totalCosts)} of $${formatCompact(revisedContractValue)}`,
        alert: spent > 90 ? 'Over 90% of budget spent' : spent > 75 ? 'Over 75% of budget consumed' : null,
      }
    }
    return { status: 'no_data', score: 0, value: 'N/A', detail: 'No budget data', alert: null }
  }

  const estimate = forecast.cost.bestEstimate
  const variance = ((estimate - revisedContractValue) / revisedContractValue) * 100

  if (variance > 10) {
    return {
      status: 'critical',
      score: Math.max(10, 50 - variance),
      value: `${variance.toFixed(0)}% over`,
      detail: `Est. $${formatCompact(estimate)} vs $${formatCompact(revisedContractValue)} budget`,
      alert: `Project is tracking ${variance.toFixed(0)}% over budget`,
    }
  }
  if (variance > 0) {
    return {
      status: 'warning',
      score: Math.max(40, 80 - variance * 4),
      value: `${variance.toFixed(1)}% over`,
      detail: `Est. $${formatCompact(estimate)} vs $${formatCompact(revisedContractValue)} budget`,
      alert: `Budget is trending ${variance.toFixed(1)}% over — monitor spending`,
    }
  }
  return {
    status: 'healthy',
    score: Math.min(100, 85 + Math.abs(variance)),
    value: `${Math.abs(variance).toFixed(1)}% under`,
    detail: `Est. $${formatCompact(estimate)} vs $${formatCompact(revisedContractValue)} budget`,
    alert: null,
  }
}

function getScheduleHealth(forecast, selectedProject, progress) {
  if (!forecast?.schedule) {
    if (!selectedProject) return { status: 'no_data', score: 0, value: 'N/A', detail: 'No schedule data', alert: null }

    const endDate = selectedProject.end_date || selectedProject.endDate
    if (!endDate) return { status: 'no_data', score: 0, value: 'N/A', detail: 'No end date set', alert: null }

    const today = new Date()
    const end = new Date(endDate)
    const start = new Date(selectedProject.start_date || selectedProject.startDate || today)
    const totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24))
    const elapsed = Math.max(0, (today - start) / (1000 * 60 * 60 * 24))
    const expectedProgress = Math.min(100, (elapsed / totalDays) * 100)
    const diff = progress - expectedProgress

    if (diff < -15) {
      return { status: 'critical', score: 30, value: `${Math.abs(diff).toFixed(0)}% behind`, detail: `${progress.toFixed(0)}% done, expected ${expectedProgress.toFixed(0)}%`, alert: `Schedule is ${Math.abs(diff).toFixed(0)}% behind expected progress` }
    }
    if (diff < -5) {
      return { status: 'warning', score: 60, value: `${Math.abs(diff).toFixed(0)}% behind`, detail: `${progress.toFixed(0)}% done, expected ${expectedProgress.toFixed(0)}%`, alert: `Schedule is slightly behind — ${Math.abs(diff).toFixed(0)}% gap` }
    }
    return { status: 'healthy', score: 90, value: 'On track', detail: `${progress.toFixed(0)}% complete`, alert: null }
  }

  const slippage = forecast.schedule.slippage || 0
  if (slippage > 14) {
    return {
      status: 'critical',
      score: Math.max(10, 50 - slippage),
      value: `${slippage}d late`,
      detail: forecast.schedule.projectedEnd
        ? `Est. finish ${new Date(forecast.schedule.projectedEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : `${slippage} days behind schedule`,
      alert: `Project is ${slippage} days behind schedule`,
    }
  }
  if (slippage > 7) {
    return {
      status: 'warning',
      score: Math.max(40, 75 - slippage * 2),
      value: `${slippage}d late`,
      detail: forecast.schedule.projectedEnd
        ? `Est. finish ${new Date(forecast.schedule.projectedEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : `${slippage} days behind`,
      alert: `Schedule slipping by ${slippage} days`,
    }
  }
  if (slippage < -7) {
    return { status: 'healthy', score: 95, value: `${Math.abs(slippage)}d ahead`, detail: 'Ahead of schedule', alert: null }
  }
  return { status: 'healthy', score: 85, value: 'On track', detail: `${progress.toFixed(0)}% complete`, alert: null }
}

function getCashFlowHealth(cashFlow) {
  if (!cashFlow?.metrics) {
    return { status: 'no_data', score: 0, value: 'N/A', detail: 'No cash flow data', alert: null }
  }

  const ratio = cashFlow.metrics.cashFlowRatio
  const net = cashFlow.metrics.netCashFlow

  if (ratio < 0.8) {
    return {
      status: 'critical',
      score: Math.max(10, ratio * 50),
      value: `${ratio.toFixed(1)}x ratio`,
      detail: `Net: $${formatCompact(net)}`,
      alert: `Cash flow ratio at ${ratio.toFixed(1)}x — inflows not covering outflows`,
    }
  }
  if (ratio < 1.1) {
    return {
      status: 'warning',
      score: Math.max(50, ratio * 60),
      value: `${ratio.toFixed(1)}x ratio`,
      detail: `Net: $${formatCompact(net)}`,
      alert: `Cash flow is tight at ${ratio.toFixed(1)}x — monitor receivables`,
    }
  }
  return {
    status: 'healthy',
    score: Math.min(100, 70 + ratio * 10),
    value: `${ratio.toFixed(1)}x ratio`,
    detail: `Net: $${formatCompact(net)}`,
    alert: null,
  }
}

function getResourceHealth(resourceData) {
  if (!resourceData?.utilization) {
    return { status: 'no_data', score: 0, value: 'N/A', detail: 'No crew data', alert: null }
  }

  const { totalAllocated, totalNeeded, utilizationRate } = resourceData.utilization
  const hasConflicts = resourceData.conflicts && resourceData.conflicts.length > 0

  if (totalNeeded > 0 && totalAllocated < totalNeeded * 0.6) {
    return {
      status: 'critical',
      score: 25,
      value: `${totalAllocated}/${totalNeeded}`,
      detail: `${totalNeeded - totalAllocated} crew members short`,
      alert: `Significantly understaffed — need ${totalNeeded - totalAllocated} more crew`,
    }
  }
  if (totalNeeded > 0 && totalAllocated < totalNeeded * 0.85) {
    return {
      status: 'warning',
      score: 55,
      value: `${totalAllocated}/${totalNeeded}`,
      detail: `Could use ${totalNeeded - totalAllocated} more crew`,
      alert: `Crew capacity is ${Math.round((totalAllocated / totalNeeded) * 100)}% of need`,
    }
  }
  if (hasConflicts) {
    return {
      status: 'warning',
      score: 65,
      value: `${totalAllocated} crew`,
      detail: `${resourceData.conflicts.length} scheduling conflicts`,
      alert: `${resourceData.conflicts.length} resource conflicts detected`,
    }
  }
  return {
    status: 'healthy',
    score: 85,
    value: `${totalAllocated} crew`,
    detail: utilizationRate ? `${utilizationRate}% utilized` : 'Fully staffed',
    alert: null,
  }
}

function formatCompact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
  return value.toFixed(0)
}

export { HealthSignal, OverallHealthBadge, KeyProjectionsRow }
