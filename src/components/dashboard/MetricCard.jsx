import React from 'react'
import { TrendIndicator } from './TrendIndicator'

/**
 * MetricCard
 *
 * A standardized card for displaying metrics with optional
 * trend indicator, progress bar, and status variant.
 *
 * @param {string} label - The metric label (e.g., "Earned Revenue")
 * @param {string|number} value - The metric value
 * @param {string} subtext - Additional context text
 * @param {number} trend - Trend percentage (optional)
 * @param {string} trendContext - Trend context text (e.g., "vs last week")
 * @param {boolean} trendInverted - If true, down is good for trend
 * @param {number} progress - Progress value 0-100 (optional)
 * @param {string} variant - 'default' | 'success' | 'warning' | 'danger' | 'info'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {ReactNode} icon - Optional icon component
 * @param {function} onClick - Optional click handler
 */
export function MetricCard({
  label,
  value,
  subtext,
  trend,
  trendContext,
  trendInverted = false,
  progress,
  variant = 'default',
  size = 'md',
  icon: Icon,
  onClick,
  className = ''
}) {
  const isClickable = typeof onClick === 'function'

  const sizeClasses = {
    sm: 'metric-card__value--sm',
    md: '',
    lg: 'metric-card__value--lg'
  }

  const variantClasses = {
    default: '',
    success: 'metric-card--success',
    warning: 'metric-card--warning',
    danger: 'metric-card--danger',
    info: 'metric-card--info'
  }

  const Component = isClickable ? 'button' : 'div'

  return (
    <Component
      className={`metric-card ${variantClasses[variant]} ${isClickable ? 'metric-card--clickable' : ''} ${className}`}
      onClick={onClick}
      type={isClickable ? 'button' : undefined}
      aria-label={isClickable ? `${label}: ${value}. Click for details` : undefined}
    >
      <div className="metric-card__header">
        <span className="metric-card__label">{label}</span>
        {Icon && <Icon className="metric-card__icon" aria-hidden="true" />}
      </div>

      <div className={`metric-card__value ${sizeClasses[size]}`}>
        {value}
      </div>

      {subtext && (
        <div className="metric-card__subtext">{subtext}</div>
      )}

      {typeof trend === 'number' && (
        <div className="metric-card__trend">
          <TrendIndicator
            value={trend}
            context={trendContext}
            inverted={trendInverted}
          />
        </div>
      )}

      {typeof progress === 'number' && (
        <div className="metric-card__progress">
          <ProgressBar value={progress} />
        </div>
      )}
    </Component>
  )
}

/**
 * Simple progress bar component
 */
export function ProgressBar({
  value,
  max = 100,
  variant = 'default',
  showLabel = false,
  className = ''
}) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  // Auto-determine variant based on value
  let autoVariant = variant
  if (variant === 'default') {
    if (percentage >= 100) autoVariant = 'success'
    else if (percentage >= 80) autoVariant = 'success'
    else if (percentage >= 50) autoVariant = 'default'
    else autoVariant = 'warning'
  }

  return (
    <div
      className={`progress-bar-v2 ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${percentage.toFixed(0)}% complete`}
    >
      <div className="progress-bar-v2__track">
        <div
          className={`progress-bar-v2__fill progress-bar-v2__fill--${autoVariant}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="progress-bar-v2__label">{percentage.toFixed(0)}%</span>
      )}
    </div>
  )
}

/**
 * MetricGrid - Layout wrapper for multiple MetricCards
 */
export function MetricGrid({ columns = 4, children, className = '' }) {
  return (
    <div className={`metric-grid metric-grid--${columns} ${className}`}>
      {children}
    </div>
  )
}

/**
 * Preset metric cards for common use cases
 */
export function EarnedRevenueCard({ value, trend, trendContext, onClick }) {
  return (
    <MetricCard
      label="Earned Revenue"
      value={formatCurrency(value)}
      trend={trend}
      trendContext={trendContext}
      onClick={onClick}
    />
  )
}

export function TotalCostsCard({ value, percentage, trend, trendContext, onClick }) {
  const variant = percentage > 80 ? 'danger' : percentage > 60 ? 'warning' : 'default'
  return (
    <MetricCard
      label="Total Costs"
      value={formatCurrency(value)}
      subtext={percentage ? `${percentage.toFixed(0)}% of revenue` : undefined}
      trend={trend}
      trendContext={trendContext}
      trendInverted={true} // Lower costs are better
      variant={variant}
      onClick={onClick}
    />
  )
}

export function ProfitMarginCard({ value, amount, trend, trendContext, onClick }) {
  const variant = value < 0 ? 'danger' : value < 20 ? 'warning' : 'success'
  return (
    <MetricCard
      label="Profit Margin"
      value={`${value.toFixed(1)}%`}
      subtext={amount ? formatCurrency(amount) : undefined}
      trend={trend}
      trendContext={trendContext}
      variant={variant}
      onClick={onClick}
    />
  )
}

export function ContractValueCard({ value, originalValue: _originalValue, corsValue, onClick }) {
  return (
    <MetricCard
      label="Contract Value"
      value={formatCurrency(value)}
      subtext={corsValue ? `Incl. ${formatCurrency(corsValue)} in CORs` : undefined}
      onClick={onClick}
    />
  )
}

export function ProgressCard({ value, label = "Progress", onClick }) {
  return (
    <MetricCard
      label={label}
      value={`${value.toFixed(0)}%`}
      progress={value}
      onClick={onClick}
    />
  )
}

/**
 * Format currency helper
 */
function formatCurrency(value) {
  if (value === null || value === undefined) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export default MetricCard
