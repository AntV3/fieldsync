import React from 'react'
import { TrendingUp, Calendar, DollarSign, Target } from 'lucide-react'

/**
 * ProjectionCard
 *
 * Displays future projections based on current trends.
 * Helps users understand where the project is heading.
 *
 * @param {string} title - Card title
 * @param {string} value - Main projected value
 * @param {string} comparison - Comparison text (e.g., "was 35% planned")
 * @param {string} status - 'better' | 'worse' | 'neutral'
 * @param {ReactNode} icon - Icon component
 */
export function ProjectionCard({
  title,
  value,
  comparison,
  status = 'neutral',
  icon: Icon = TrendingUp,
  className = ''
}) {
  const statusColors = {
    better: 'var(--status-success)',
    worse: 'var(--status-danger)',
    neutral: 'var(--text-muted)'
  }

  return (
    <div className={`projection-card ${className}`}>
      <div className="projection-card__header">
        <Icon className="projection-card__header-icon" size={16} />
        <span className="projection-card__title">{title}</span>
      </div>
      <div className="projection-card__value">{value}</div>
      {comparison && (
        <div
          className={`projection-card__comparison projection-card__comparison--${status}`}
          style={{ color: statusColors[status] }}
        >
          {comparison}
        </div>
      )}
    </div>
  )
}

/**
 * ProjectionsPanel
 *
 * Panel displaying multiple projections for a project.
 */
export function ProjectionsPanel({
  estimatedCompletionCost,
  estimatedFinalMargin,
  estimatedCompletionDate,
  originalBudget,
  plannedMargin,
  plannedCompletionDate,
  className = ''
}) {
  // Format currency
  const formatCurrency = (val) => {
    if (!val && val !== 0) return 'N/A'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val)
  }

  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Determine cost status
  const costStatus = !estimatedCompletionCost || !originalBudget
    ? 'neutral'
    : estimatedCompletionCost <= originalBudget
      ? 'better'
      : 'worse'

  // Determine margin status
  const marginStatus = !estimatedFinalMargin || !plannedMargin
    ? 'neutral'
    : estimatedFinalMargin >= plannedMargin
      ? 'better'
      : 'worse'

  // Cost comparison text
  const costComparison = originalBudget
    ? estimatedCompletionCost > originalBudget
      ? `${formatCurrency(estimatedCompletionCost - originalBudget)} over budget`
      : estimatedCompletionCost < originalBudget
        ? `${formatCurrency(originalBudget - estimatedCompletionCost)} under budget`
        : 'On budget'
    : null

  // Margin comparison text
  const marginComparison = plannedMargin
    ? estimatedFinalMargin < plannedMargin
      ? `was ${plannedMargin.toFixed(0)}% planned`
      : estimatedFinalMargin > plannedMargin
        ? `${(estimatedFinalMargin - plannedMargin).toFixed(0)}% better than planned`
        : 'As planned'
    : null

  return (
    <div className={`projections-panel ${className}`}>
      <div className="projections-panel__header">
        <Target size={16} />
        <span>Projections</span>
        <span className="projections-panel__subtitle">At current rate</span>
      </div>

      <div className="projections-panel__grid">
        {estimatedCompletionCost !== null && (
          <ProjectionCard
            title="Estimated Final Cost"
            value={formatCurrency(estimatedCompletionCost)}
            comparison={costComparison}
            status={costStatus}
            icon={DollarSign}
          />
        )}

        {estimatedFinalMargin !== null && (
          <ProjectionCard
            title="Projected Margin"
            value={`${estimatedFinalMargin?.toFixed(1) || 'N/A'}%`}
            comparison={marginComparison}
            status={marginStatus}
            icon={TrendingUp}
          />
        )}

        {estimatedCompletionDate && (
          <ProjectionCard
            title="Est. Completion"
            value={formatDate(estimatedCompletionDate)}
            comparison={plannedCompletionDate ? `planned: ${formatDate(plannedCompletionDate)}` : null}
            status="neutral"
            icon={Calendar}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Simple projection summary for compact display
 */
export function ProjectionSummary({
  estimatedCompletionCost,
  originalBudget,
  estimatedFinalMargin,
  className = ''
}) {
  const overBudget = estimatedCompletionCost && originalBudget && estimatedCompletionCost > originalBudget
  const underMargin = estimatedFinalMargin !== null && estimatedFinalMargin < 20

  if (!overBudget && !underMargin) {
    return (
      <div className={`projection-summary projection-summary--good ${className}`}>
        <span className="projection-summary__icon">✓</span>
        <span>Projections look healthy</span>
      </div>
    )
  }

  return (
    <div className={`projection-summary projection-summary--warning ${className}`}>
      <span className="projection-summary__icon">!</span>
      <span>
        {overBudget && `Tracking ${((estimatedCompletionCost / originalBudget - 1) * 100).toFixed(0)}% over budget`}
        {overBudget && underMargin && ' • '}
        {underMargin && `Margin projected at ${estimatedFinalMargin.toFixed(0)}%`}
      </span>
    </div>
  )
}

export default ProjectionCard
