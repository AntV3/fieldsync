import React from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info, Circle } from 'lucide-react'

/**
 * AccessibleStatusBadge
 *
 * An accessible status badge that uses color, icon, AND text
 * to convey status. Never relies on color alone (WCAG 1.4.1).
 *
 * @param {string} status - 'success' | 'warning' | 'danger' | 'info' | 'neutral'
 * @param {string} label - The text label to display
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} showIcon - Whether to show the status icon (default: true)
 * @param {string} ariaLabel - Custom aria-label (defaults to label)
 */
export function AccessibleStatusBadge({
  status = 'neutral',
  label,
  size = 'md',
  showIcon = true,
  ariaLabel,
  className = ''
}) {
  const icons = {
    success: CheckCircle,
    warning: AlertTriangle,
    danger: XCircle,
    info: Info,
    neutral: Circle
  }

  const Icon = icons[status] || Circle

  const sizeClasses = {
    sm: '',
    md: '',
    lg: 'status-badge-v2--lg'
  }

  return (
    <span
      className={`status-badge-v2 status-badge-v2--${status} ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label={ariaLabel || `${label} - ${status}`}
    >
      {showIcon && (
        <Icon
          className="status-badge-v2__icon"
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </span>
  )
}

/**
 * Preset status badges for common use cases
 */
export function OnTrackBadge({ size, className }) {
  return <AccessibleStatusBadge status="success" label="On Track" size={size} className={className} />
}

export function AtRiskBadge({ size, className }) {
  return <AccessibleStatusBadge status="warning" label="At Risk" size={size} className={className} />
}

export function OverBudgetBadge({ size, className }) {
  return <AccessibleStatusBadge status="danger" label="Over Budget" size={size} className={className} />
}

export function CompleteBadge({ size, className }) {
  return <AccessibleStatusBadge status="success" label="Complete" size={size} className={className} />
}

export function PendingBadge({ size, className }) {
  return <AccessibleStatusBadge status="info" label="Pending" size={size} className={className} />
}

export function DraftBadge({ size, className }) {
  return <AccessibleStatusBadge status="neutral" label="Draft" size={size} className={className} />
}

/**
 * Project health status badge
 * Automatically selects the right variant based on health score
 */
export function ProjectHealthBadge({ health, size, className }) {
  if (health === 'complete') {
    return <CompleteBadge size={size} className={className} />
  }
  if (health === 'on_track' || health === 'healthy') {
    return <OnTrackBadge size={size} className={className} />
  }
  if (health === 'at_risk' || health === 'warning') {
    return <AtRiskBadge size={size} className={className} />
  }
  if (health === 'over_budget' || health === 'critical') {
    return <OverBudgetBadge size={size} className={className} />
  }
  return <AccessibleStatusBadge status="neutral" label={health || 'Unknown'} size={size} className={className} />
}

export default AccessibleStatusBadge
