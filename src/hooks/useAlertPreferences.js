import { useState, useCallback } from 'react'

const STORAGE_KEY = 'fieldsync_alert_preferences'
const SNOOZED_KEY = 'fieldsync_snoozed_alerts'

// Alert categories that map to risk factors
export const ALERT_CATEGORIES = {
  budget: {
    id: 'budget',
    label: 'Budget Alerts',
    description: 'Cost overruns and budget warnings',
    alertTitles: ['Budget Alert', 'Budget Watch']
  },
  schedule: {
    id: 'schedule',
    label: 'Schedule Alerts',
    description: 'Projects falling behind schedule',
    alertTitles: ['Schedule Alert']
  },
  corExposure: {
    id: 'corExposure',
    label: 'Change Order Alerts',
    description: 'Pending COR exposure warnings',
    alertTitles: ['COR Exposure']
  },
  activity: {
    id: 'activity',
    label: 'Activity Alerts',
    description: 'Stale daily reports and inactivity',
    alertTitles: ['Activity Alert', 'Activity Notice']
  },
  safety: {
    id: 'safety',
    label: 'Safety Alerts',
    description: 'Injury reports and safety incidents',
    alertTitles: ['Safety Alert']
  }
}

export const SEVERITY_LEVELS = {
  all: { id: 'all', label: 'All Alerts', description: 'Critical, warning, and informational' },
  warning: { id: 'warning', label: 'Warnings & Critical', description: 'Only warnings and critical alerts' },
  critical: { id: 'critical', label: 'Critical Only', description: 'Only the most urgent alerts' }
}

export const SNOOZE_DURATIONS = {
  '1h': { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  '4h': { id: '4h', label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  '1d': { id: '1d', label: '1 day', ms: 24 * 60 * 60 * 1000 },
  '1w': { id: '1w', label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 }
}

const DEFAULT_PREFERENCES = {
  enabledCategories: ['budget', 'schedule', 'corExposure', 'activity', 'safety'],
  minimumSeverity: 'all',
  snoozeDuration: '1d'
}

function loadPreferences() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...DEFAULT_PREFERENCES, ...parsed }
    }
  } catch (e) {
    console.warn('Failed to load alert preferences:', e)
  }
  return { ...DEFAULT_PREFERENCES }
}

function savePreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch (e) {
    console.warn('Failed to save alert preferences:', e)
  }
}

function loadSnoozedAlerts() {
  try {
    const saved = localStorage.getItem(SNOOZED_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const now = Date.now()
      // Clean up expired snoozes
      const active = {}
      for (const [key, expiresAt] of Object.entries(parsed)) {
        if (expiresAt > now) {
          active[key] = expiresAt
        }
      }
      if (Object.keys(active).length !== Object.keys(parsed).length) {
        localStorage.setItem(SNOOZED_KEY, JSON.stringify(active))
      }
      return active
    }
  } catch (e) {
    console.warn('Failed to load snoozed alerts:', e)
  }
  return {}
}

function saveSnoozedAlerts(snoozed) {
  try {
    localStorage.setItem(SNOOZED_KEY, JSON.stringify(snoozed))
  } catch (e) {
    console.warn('Failed to save snoozed alerts:', e)
  }
}

/**
 * Generate a stable key for an alert to track snooze state
 */
function getAlertKey(alert) {
  return `${alert.projectId}-${alert.title}`
}

/**
 * Hook to manage alert preferences and snooze state.
 *
 * Returns preferences, setters, and a filterAlerts function
 * that applies all preferences + snooze state to an alert array.
 */
export function useAlertPreferences() {
  const [preferences, setPreferencesState] = useState(loadPreferences)
  const [snoozedAlerts, setSnoozedAlertsState] = useState(loadSnoozedAlerts)

  const setPreferences = useCallback((updater) => {
    setPreferencesState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      savePreferences(next)
      return next
    })
  }, [])

  const toggleCategory = useCallback((categoryId) => {
    setPreferences(prev => {
      const enabled = prev.enabledCategories.includes(categoryId)
        ? prev.enabledCategories.filter(c => c !== categoryId)
        : [...prev.enabledCategories, categoryId]
      return { ...prev, enabledCategories: enabled }
    })
  }, [setPreferences])

  const setMinimumSeverity = useCallback((severity) => {
    setPreferences(prev => ({ ...prev, minimumSeverity: severity }))
  }, [setPreferences])

  const setSnoozeDuration = useCallback((duration) => {
    setPreferences(prev => ({ ...prev, snoozeDuration: duration }))
  }, [setPreferences])

  const snoozeAlert = useCallback((alert) => {
    const key = getAlertKey(alert)
    const duration = SNOOZE_DURATIONS[preferences.snoozeDuration]?.ms || SNOOZE_DURATIONS['1d'].ms
    const expiresAt = Date.now() + duration

    setSnoozedAlertsState(prev => {
      const next = { ...prev, [key]: expiresAt }
      saveSnoozedAlerts(next)
      return next
    })
  }, [preferences.snoozeDuration])

  const unsnoozeAlert = useCallback((alert) => {
    const key = getAlertKey(alert)
    setSnoozedAlertsState(prev => {
      const next = { ...prev }
      delete next[key]
      saveSnoozedAlerts(next)
      return next
    })
  }, [])

  const clearAllSnoozes = useCallback(() => {
    setSnoozedAlertsState({})
    saveSnoozedAlerts({})
  }, [])

  const resetToDefaults = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES)
    clearAllSnoozes()
  }, [setPreferences, clearAllSnoozes])

  // Build a reverse map: alert title -> category id
  const titleToCategoryMap = {}
  for (const [catId, cat] of Object.entries(ALERT_CATEGORIES)) {
    for (const title of cat.alertTitles) {
      titleToCategoryMap[title] = catId
    }
  }

  const filterAlerts = useCallback((alerts) => {
    const now = Date.now()
    const { enabledCategories, minimumSeverity } = preferences

    return alerts.filter(alert => {
      // 1. Check if category is enabled
      const category = titleToCategoryMap[alert.title]
      if (category && !enabledCategories.includes(category)) {
        return false
      }

      // 2. Check minimum severity
      if (minimumSeverity === 'critical' && alert.type !== 'critical') {
        return false
      }
      if (minimumSeverity === 'warning' && alert.type === 'info') {
        return false
      }

      // 3. Check if snoozed
      const key = getAlertKey(alert)
      const snoozeExpiry = snoozedAlerts[key]
      if (snoozeExpiry && snoozeExpiry > now) {
        return false
      }

      return true
    })
  }, [preferences, snoozedAlerts])

  const snoozedCount = Object.values(snoozedAlerts).filter(exp => exp > Date.now()).length

  return {
    preferences,
    toggleCategory,
    setMinimumSeverity,
    setSnoozeDuration,
    snoozeAlert,
    unsnoozeAlert,
    clearAllSnoozes,
    resetToDefaults,
    filterAlerts,
    snoozedCount
  }
}
