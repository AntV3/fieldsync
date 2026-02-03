import React, { useState } from 'react'
import { Settings, X, RotateCcw, Bell, BellOff, Filter, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import {
  ALERT_CATEGORIES,
  SEVERITY_LEVELS,
  SNOOZE_DURATIONS
} from '../../hooks/useAlertPreferences'

/**
 * AlertPreferences
 *
 * Panel for configuring which alert types to show, minimum severity,
 * and snooze behavior. Integrates with useAlertPreferences hook.
 */
export function AlertPreferences({
  preferences,
  onToggleCategory,
  onSetSeverity,
  onSetSnoozeDuration,
  onResetDefaults,
  onClearSnoozes,
  snoozedCount = 0,
  onClose,
  className = ''
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`alert-preferences ${className}`}>
      <button
        type="button"
        className="alert-preferences__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label="Alert preferences"
        title="Customize alerts"
      >
        <Filter size={16} />
        {!expanded && preferences.enabledCategories.length < 5 && (
          <span className="alert-preferences__filter-badge">
            {preferences.enabledCategories.length}/5
          </span>
        )}
      </button>

      {expanded && (
        <div className="alert-preferences__panel" role="dialog" aria-label="Alert Preferences">
          <div className="alert-preferences__header">
            <h4 className="alert-preferences__title">
              <Bell size={16} />
              Alert Preferences
            </h4>
            <button
              type="button"
              className="alert-preferences__close"
              onClick={() => setExpanded(false)}
              aria-label="Close preferences"
            >
              <X size={16} />
            </button>
          </div>

          {/* Alert Categories */}
          <div className="alert-preferences__section">
            <h5 className="alert-preferences__section-title">Alert Types</h5>
            <p className="alert-preferences__section-desc">Choose which alerts matter to you</p>
            <div className="alert-preferences__categories">
              {Object.entries(ALERT_CATEGORIES).map(([key, category]) => {
                const enabled = preferences.enabledCategories.includes(key)
                return (
                  <label
                    key={key}
                    className={`alert-preferences__category ${enabled ? 'alert-preferences__category--enabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => onToggleCategory(key)}
                      className="alert-preferences__checkbox"
                    />
                    <div className="alert-preferences__category-info">
                      <span className="alert-preferences__category-label">{category.label}</span>
                      <span className="alert-preferences__category-desc">{category.description}</span>
                    </div>
                    {enabled ? <Bell size={14} /> : <BellOff size={14} />}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Severity Filter */}
          <div className="alert-preferences__section">
            <h5 className="alert-preferences__section-title">Minimum Severity</h5>
            <p className="alert-preferences__section-desc">Filter out lower-priority alerts</p>
            <div className="alert-preferences__severity-options">
              {Object.entries(SEVERITY_LEVELS).map(([key, level]) => (
                <label
                  key={key}
                  className={`alert-preferences__severity ${preferences.minimumSeverity === key ? 'alert-preferences__severity--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="severity"
                    value={key}
                    checked={preferences.minimumSeverity === key}
                    onChange={() => onSetSeverity(key)}
                    className="alert-preferences__radio"
                  />
                  <span className="alert-preferences__severity-label">{level.label}</span>
                  <span className="alert-preferences__severity-desc">{level.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Snooze Duration */}
          <div className="alert-preferences__section">
            <h5 className="alert-preferences__section-title">
              <Clock size={14} />
              Snooze Duration
            </h5>
            <p className="alert-preferences__section-desc">
              How long dismissed alerts stay hidden
            </p>
            <div className="alert-preferences__snooze-options">
              {Object.entries(SNOOZE_DURATIONS).map(([key, duration]) => (
                <button
                  key={key}
                  type="button"
                  className={`alert-preferences__snooze-btn ${preferences.snoozeDuration === key ? 'alert-preferences__snooze-btn--selected' : ''}`}
                  onClick={() => onSetSnoozeDuration(key)}
                >
                  {duration.label}
                </button>
              ))}
            </div>
            {snoozedCount > 0 && (
              <div className="alert-preferences__snoozed-info">
                <span>{snoozedCount} alert{snoozedCount !== 1 ? 's' : ''} snoozed</span>
                <button
                  type="button"
                  className="alert-preferences__clear-snoozes"
                  onClick={onClearSnoozes}
                >
                  Show all
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="alert-preferences__actions">
            <button
              type="button"
              className="alert-preferences__reset"
              onClick={onResetDefaults}
            >
              <RotateCcw size={14} />
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Compact inline summary of active filters for the alert header
 */
export function AlertFilterSummary({ preferences, snoozedCount = 0 }) {
  const activeFilters = []

  if (preferences.enabledCategories.length < 5) {
    activeFilters.push(`${preferences.enabledCategories.length}/5 types`)
  }

  if (preferences.minimumSeverity !== 'all') {
    activeFilters.push(SEVERITY_LEVELS[preferences.minimumSeverity]?.label || preferences.minimumSeverity)
  }

  if (snoozedCount > 0) {
    activeFilters.push(`${snoozedCount} snoozed`)
  }

  if (activeFilters.length === 0) return null

  return (
    <span className="alert-filter-summary">
      <Filter size={12} />
      {activeFilters.join(' · ')}
    </span>
  )
}

export default AlertPreferences
