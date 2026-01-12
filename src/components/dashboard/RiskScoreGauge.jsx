import React from 'react'
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

/**
 * RiskScoreGauge
 *
 * A visual gauge displaying project risk score (0-100)
 * with color-coded status and optional factor breakdown.
 *
 * @param {number} score - Risk score 0-100 (lower is better)
 * @param {string} status - 'healthy' | 'warning' | 'critical'
 * @param {string} label - Summary label
 * @param {object} factors - Optional breakdown of risk factors
 * @param {boolean} showBreakdown - Whether to show factor breakdown
 * @param {string} size - 'sm' | 'md' | 'lg'
 */
export function RiskScoreGauge({
  score = 0,
  status = 'healthy',
  label,
  factors,
  showBreakdown = false,
  size = 'md',
  className = ''
}) {
  // SVG circle calculations
  const sizes = {
    sm: { width: 80, strokeWidth: 6 },
    md: { width: 120, strokeWidth: 8 },
    lg: { width: 160, strokeWidth: 10 }
  }

  const { width, strokeWidth } = sizes[size]
  const radius = (width - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  // Score is 0-100 where 0 is best, so we show inverse for visual
  // (full circle = bad, empty = good)
  const progressOffset = circumference - (score / 100) * circumference

  // Status icon
  const StatusIcon = {
    healthy: CheckCircle,
    warning: AlertTriangle,
    critical: XCircle
  }[status] || CheckCircle

  // Generate accessible label
  const ariaLabel = `Risk score: ${score} out of 100. Status: ${status}. ${label || ''}`

  return (
    <div
      className={`risk-score risk-score--${status} ${className}`}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div className="risk-score__gauge" style={{ width, height: width }}>
        <svg
          className="risk-score__circle"
          width={width}
          height={width}
          viewBox={`0 0 ${width} ${width}`}
        >
          {/* Background track */}
          <circle
            className="risk-score__track"
            cx={width / 2}
            cy={width / 2}
            r={radius}
          />
          {/* Progress fill */}
          <circle
            className="risk-score__fill"
            cx={width / 2}
            cy={width / 2}
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={progressOffset}
          />
        </svg>

        {/* Center content */}
        <div className="risk-score__value">
          <span className="risk-score__number">{score}</span>
          <span className="risk-score__label">Risk</span>
        </div>
      </div>

      {/* Status label below gauge */}
      {label && (
        <div className="risk-score__status">
          <StatusIcon size={16} aria-hidden="true" />
          <span>{label}</span>
        </div>
      )}

      {/* Factor breakdown */}
      {showBreakdown && factors && (
        <div className="risk-score__breakdown">
          <RiskFactorItem
            name="Budget"
            status={factors.budget?.status}
            label={factors.budget?.label}
          />
          <RiskFactorItem
            name="Schedule"
            status={factors.schedule?.status}
            label={factors.schedule?.label}
          />
          <RiskFactorItem
            name="COR Exposure"
            status={factors.corExposure?.status}
            label={factors.corExposure?.label}
          />
          <RiskFactorItem
            name="Activity"
            status={factors.activity?.status}
            label={factors.activity?.label}
          />
          <RiskFactorItem
            name="Safety"
            status={factors.safety?.status}
            label={factors.safety?.label}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Individual risk factor item
 */
function RiskFactorItem({ name, status, label }) {
  const StatusIcon = {
    healthy: CheckCircle,
    warning: AlertTriangle,
    critical: XCircle
  }[status] || CheckCircle

  const statusColors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-danger)'
  }

  return (
    <div className="risk-score__factor">
      <StatusIcon
        className="risk-score__factor-icon"
        size={16}
        style={{ color: statusColors[status] }}
        aria-hidden="true"
      />
      <span className="risk-score__factor-name">{name}</span>
      <span
        className="risk-score__factor-status"
        style={{ color: statusColors[status] }}
      >
        {label || status}
      </span>
    </div>
  )
}

/**
 * Compact risk score badge (for use in lists/tables)
 */
export function RiskScoreBadge({ score, status, className = '' }) {
  const statusClasses = {
    healthy: 'project-row__risk-score--healthy',
    warning: 'project-row__risk-score--warning',
    critical: 'project-row__risk-score--critical'
  }

  return (
    <span
      className={`project-row__risk-score ${statusClasses[status]} ${className}`}
      role="img"
      aria-label={`Risk score: ${score}`}
    >
      {score}
    </span>
  )
}

/**
 * Risk level text label
 */
export function RiskLevelLabel({ status }) {
  const labels = {
    healthy: 'Low Risk',
    warning: 'Moderate Risk',
    critical: 'High Risk'
  }

  const icons = {
    healthy: CheckCircle,
    warning: AlertTriangle,
    critical: XCircle
  }

  const Icon = icons[status]

  return (
    <span className={`risk-level risk-level--${status}`}>
      <Icon size={14} aria-hidden="true" />
      <span>{labels[status]}</span>
    </span>
  )
}

export default RiskScoreGauge
