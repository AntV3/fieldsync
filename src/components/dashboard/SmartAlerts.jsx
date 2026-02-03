import React, { useState, useCallback } from 'react'
import { AlertTriangle, XCircle, Info, X, ArrowRight, Clock } from 'lucide-react'

/**
 * SmartAlerts
 *
 * Container for displaying prioritized actionable alerts.
 * Alerts can be dismissed (snoozed) and are sorted by priority.
 *
 * @param {array} alerts - Array of alert objects (already filtered by preferences)
 * @param {function} onAction - Callback when alert action is clicked
 * @param {function} onSnooze - Callback when alert is snoozed/dismissed
 * @param {string} snoozeDurationLabel - Label for snooze duration (e.g., "1 day")
 * @param {number} totalUnfiltered - Total alert count before filtering (for context)
 * @param {number} maxVisible - Maximum alerts to show (default: 5)
 */
export function SmartAlerts({
  alerts = [],
  onAction,
  onSnooze,
  onDismiss,
  snoozeDurationLabel,
  totalUnfiltered = 0,
  maxVisible = 5,
  className = ''
}) {
  const [dismissedIds, setDismissedIds] = useState(new Set())

  const visibleAlerts = alerts
    .filter(alert => !dismissedIds.has(alert.id || `${alert.projectId}-${alert.type}-${alert.title}`))
    .slice(0, maxVisible)

  const handleDismiss = useCallback((alert) => {
    const alertId = alert.id || `${alert.projectId}-${alert.type}-${alert.title}`
    setDismissedIds(prev => new Set([...prev, alertId]))
    // Use snooze if available, otherwise fall back to plain dismiss
    if (onSnooze) {
      onSnooze(alert)
    } else {
      onDismiss?.(alert)
    }
  }, [onSnooze, onDismiss])

  if (visibleAlerts.length === 0) {
    return null
  }

  const hiddenByFilter = totalUnfiltered > 0 ? totalUnfiltered - alerts.length : 0

  return (
    <div
      className={`smart-alerts ${className}`}
      role="region"
      aria-label="Project alerts"
      aria-live="polite"
    >
      {visibleAlerts.map((alert, index) => (
        <SmartAlertCard
          key={alert.id || `${alert.projectId}-${alert.type}-${index}`}
          alert={alert}
          onAction={onAction}
          onDismiss={() => handleDismiss(alert)}
          snoozeDurationLabel={snoozeDurationLabel}
        />
      ))}

      {alerts.length > maxVisible && (
        <div className="smart-alerts__overflow">
          <span className="smart-alerts__overflow-text">
            +{alerts.length - maxVisible} more alert{alerts.length - maxVisible !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {hiddenByFilter > 0 && (
        <div className="smart-alerts__filtered-note">
          <span className="smart-alerts__filtered-text">
            {hiddenByFilter} alert{hiddenByFilter !== 1 ? 's' : ''} hidden by filters
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * SmartAlertCard
 *
 * Individual alert card with icon, message, action, and dismiss.
 *
 * @param {object} alert - Alert object
 * @param {function} onAction - Action button click handler
 * @param {function} onDismiss - Dismiss button click handler
 */
export function SmartAlertCard({
  alert,
  onAction,
  onDismiss,
  snoozeDurationLabel
}) {
  const {
    type = 'info',
    title,
    description,
    action,
    actionTarget,
    projectId,
    projectName
  } = alert

  const icons = {
    critical: XCircle,
    warning: AlertTriangle,
    info: Info
  }

  const Icon = icons[type] || Info

  const handleAction = () => {
    onAction?.({
      target: actionTarget,
      projectId,
      alert
    })
  }

  const dismissLabel = snoozeDurationLabel
    ? `Snooze for ${snoozeDurationLabel}`
    : 'Dismiss alert'

  return (
    <div
      className={`smart-alert smart-alert--${type}`}
      role="alert"
      aria-live={type === 'critical' ? 'assertive' : 'polite'}
    >
      <Icon className="smart-alert__icon" aria-hidden="true" />

      <div className="smart-alert__content">
        <div className="smart-alert__title">
          {projectName && <span className="smart-alert__project">{projectName}: </span>}
          {title}
        </div>

        {description && (
          <div className="smart-alert__description">{description}</div>
        )}

        {action && (
          <div className="smart-alert__action">
            <button
              type="button"
              className="smart-alert__action-btn"
              onClick={handleAction}
            >
              {action}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          className="smart-alert__dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          {snoozeDurationLabel ? (
            <Clock size={16} aria-hidden="true" />
          ) : (
            <X size={18} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  )
}

/**
 * AlertSummaryBanner
 *
 * Compact banner showing alert counts by type.
 * Useful when space is limited.
 *
 * @param {array} alerts - Array of alert objects
 * @param {function} onClick - Click handler to expand alerts
 */
export function AlertSummaryBanner({ alerts = [], onClick, className = '' }) {
  const counts = {
    critical: alerts.filter(a => a.type === 'critical').length,
    warning: alerts.filter(a => a.type === 'warning').length,
    info: alerts.filter(a => a.type === 'info').length
  }

  const total = alerts.length

  if (total === 0) return null

  return (
    <button
      type="button"
      className={`alert-summary-banner ${className}`}
      onClick={onClick}
      aria-label={`${total} alerts: ${counts.critical} critical, ${counts.warning} warnings, ${counts.info} info. Click to view.`}
    >
      {counts.critical > 0 && (
        <span className="alert-summary-banner__item alert-summary-banner__item--critical">
          <XCircle size={14} aria-hidden="true" />
          {counts.critical}
        </span>
      )}
      {counts.warning > 0 && (
        <span className="alert-summary-banner__item alert-summary-banner__item--warning">
          <AlertTriangle size={14} aria-hidden="true" />
          {counts.warning}
        </span>
      )}
      {counts.info > 0 && (
        <span className="alert-summary-banner__item alert-summary-banner__item--info">
          <Info size={14} aria-hidden="true" />
          {counts.info}
        </span>
      )}
      <ArrowRight size={14} className="alert-summary-banner__arrow" aria-hidden="true" />
    </button>
  )
}

/**
 * NoAlertsMessage
 *
 * Positive message when there are no alerts.
 */
export function NoAlertsMessage({ className = '' }) {
  return (
    <div className={`no-alerts-message ${className}`}>
      <span className="no-alerts-message__icon" aria-hidden="true">✓</span>
      <span className="no-alerts-message__text">All projects on track</span>
    </div>
  )
}

/**
 * Helper to aggregate alerts from multiple projects
 */
export function aggregateAlerts(projectAlerts) {
  // Flatten all alerts from all projects
  const allAlerts = projectAlerts.flatMap(p => p.alerts || [])

  // Sort by priority
  const priorityOrder = { critical: 0, warning: 1, info: 2 }
  allAlerts.sort((a, b) => {
    const priorityDiff = priorityOrder[a.type] - priorityOrder[b.type]
    if (priorityDiff !== 0) return priorityDiff
    // Secondary sort by project name
    return (a.projectName || '').localeCompare(b.projectName || '')
  })

  return allAlerts
}

export default SmartAlerts
