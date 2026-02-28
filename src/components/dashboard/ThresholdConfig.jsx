/* eslint-disable react-refresh/only-export-components */
import React, { useState, useCallback, useMemo } from 'react'
import { Settings, RotateCcw, Save, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { DEFAULT_THRESHOLDS } from '../../lib/riskCalculations'

/**
 * ThresholdConfig
 *
 * Admin component for configuring risk score thresholds.
 * Allows customization of when projects are flagged as warning/critical.
 *
 * Features:
 * - Editable thresholds per category
 * - Preset configurations (conservative, balanced, aggressive)
 * - Validation with helpful error messages
 * - Accessible slider and input controls
 */

// Preset configurations for different risk appetites
const PRESETS = {
  conservative: {
    name: 'Conservative',
    description: 'Flag issues early. Better for high-stakes or regulated projects.',
    thresholds: {
      budget: { healthy: 0.50, warning: 0.65, critical: 0.80 },
      schedule: { healthy: 5, warning: 10, critical: 20 },
      corExposure: { healthy: 0.03, warning: 0.08, critical: 0.15 },
      activity: { healthy: 1, warning: 2, critical: 5 },
      safety: { healthy: 0, warning: 1, critical: 2 }
    }
  },
  balanced: {
    name: 'Balanced',
    description: 'Standard thresholds for typical construction projects.',
    thresholds: DEFAULT_THRESHOLDS
  },
  aggressive: {
    name: 'Aggressive',
    description: 'Higher tolerance. Only flag significant issues.',
    thresholds: {
      budget: { healthy: 0.70, warning: 0.85, critical: 0.95 },
      schedule: { healthy: 15, warning: 25, critical: 40 },
      corExposure: { healthy: 0.10, warning: 0.20, critical: 0.30 },
      activity: { healthy: 3, warning: 5, critical: 10 },
      safety: { healthy: 1, warning: 2, critical: 4 }
    }
  }
}

// Category metadata for display
const CATEGORY_META = {
  budget: {
    label: 'Budget (Cost/Revenue Ratio)',
    description: 'Flags when costs approach or exceed earned revenue',
    unit: '%',
    multiplier: 100,
    min: 0,
    max: 100,
    step: 5
  },
  schedule: {
    label: 'Schedule (% Behind)',
    description: 'Flags when actual progress falls behind expected progress',
    unit: '%',
    multiplier: 1,
    min: 0,
    max: 50,
    step: 5
  },
  corExposure: {
    label: 'COR Exposure (% of Contract)',
    description: 'Flags pending change orders as percentage of contract value',
    unit: '%',
    multiplier: 100,
    min: 0,
    max: 50,
    step: 1
  },
  activity: {
    label: 'Activity (Days Since Report)',
    description: 'Flags projects with stale daily reports',
    unit: ' days',
    multiplier: 1,
    min: 0,
    max: 14,
    step: 1
  },
  safety: {
    label: 'Safety (Injury Count)',
    description: 'Flags projects based on recent injury reports',
    unit: ' injuries',
    multiplier: 1,
    min: 0,
    max: 10,
    step: 1
  }
}

/**
 * ThresholdSlider
 *
 * Accessible slider input for a single threshold value
 */
function ThresholdSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  multiplier = 1,
  status = 'healthy',
  disabled = false
}) {
  const displayValue = (value * multiplier).toFixed(multiplier >= 100 ? 0 : 1)

  const statusColors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-danger)'
  }

  const statusLabels = {
    healthy: 'Healthy threshold',
    warning: 'Warning threshold',
    critical: 'Critical threshold'
  }

  return (
    <div className="threshold-slider">
      <div className="threshold-slider__header">
        <label
          className="threshold-slider__label"
          htmlFor={`threshold-${status}`}
        >
          {label}
        </label>
        <span
          className="threshold-slider__value"
          style={{ color: statusColors[status] }}
          aria-live="polite"
        >
          {displayValue}{unit}
        </span>
      </div>
      <div className="threshold-slider__control">
        <input
          id={`threshold-${status}`}
          type="range"
          min={min}
          max={max}
          step={step / multiplier}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          aria-label={statusLabels[status]}
          className="threshold-slider__range"
          style={{
            '--slider-color': statusColors[status]
          }}
        />
      </div>
    </div>
  )
}

/**
 * ThresholdCategory
 *
 * Card for configuring a single risk category's thresholds
 */
function ThresholdCategory({
  categoryKey,
  thresholds,
  onChange,
  disabled = false
}) {
  const meta = CATEGORY_META[categoryKey]

  const handleChange = (level, value) => {
    onChange(categoryKey, { ...thresholds, [level]: value })
  }

  // Validation: ensure healthy < warning < critical
  const isValid = thresholds.healthy <= thresholds.warning &&
                  thresholds.warning <= thresholds.critical

  return (
    <div className={`threshold-category ${!isValid ? 'threshold-category--invalid' : ''}`}>
      <div className="threshold-category__header">
        <h4 className="threshold-category__title">{meta.label}</h4>
        <p className="threshold-category__description">{meta.description}</p>
      </div>

      <div className="threshold-category__sliders">
        <ThresholdSlider
          label="Healthy up to"
          value={thresholds.healthy}
          onChange={(v) => handleChange('healthy', v)}
          min={meta.min / meta.multiplier}
          max={meta.max / meta.multiplier}
          step={meta.step}
          unit={meta.unit}
          multiplier={meta.multiplier}
          status="healthy"
          disabled={disabled}
        />
        <ThresholdSlider
          label="Warning up to"
          value={thresholds.warning}
          onChange={(v) => handleChange('warning', v)}
          min={meta.min / meta.multiplier}
          max={meta.max / meta.multiplier}
          step={meta.step}
          unit={meta.unit}
          multiplier={meta.multiplier}
          status="warning"
          disabled={disabled}
        />
        <ThresholdSlider
          label="Critical above"
          value={thresholds.critical}
          onChange={(v) => handleChange('critical', v)}
          min={meta.min / meta.multiplier}
          max={meta.max / meta.multiplier}
          step={meta.step}
          unit={meta.unit}
          multiplier={meta.multiplier}
          status="critical"
          disabled={disabled}
        />
      </div>

      {!isValid && (
        <div className="threshold-category__error" role="alert">
          <AlertTriangle size={14} />
          <span>Thresholds must be in order: healthy ≤ warning ≤ critical</span>
        </div>
      )}
    </div>
  )
}

/**
 * PresetSelector
 *
 * Radio buttons for selecting a preset configuration
 */
function PresetSelector({ selectedPreset, onSelect, disabled }) {
  return (
    <div className="preset-selector" role="radiogroup" aria-label="Risk threshold presets">
      {Object.entries(PRESETS).map(([key, preset]) => (
        <button
          key={key}
          type="button"
          className={`preset-selector__option ${selectedPreset === key ? 'preset-selector__option--selected' : ''}`}
          onClick={() => onSelect(key)}
          disabled={disabled}
          role="radio"
          aria-checked={selectedPreset === key}
        >
          <span className="preset-selector__name">{preset.name}</span>
          <span className="preset-selector__description">{preset.description}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Main ThresholdConfig component
 */
export function ThresholdConfig({
  initialThresholds = DEFAULT_THRESHOLDS,
  onSave,
  className = ''
}) {
  const [thresholds, setThresholds] = useState(initialThresholds)
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // 'saving' | 'saved' | 'error' | null

  // Check if current thresholds match a preset
  const detectPreset = useCallback((th) => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      const matches = Object.keys(preset.thresholds).every(cat => {
        const p = preset.thresholds[cat]
        const t = th[cat]
        return p.healthy === t.healthy &&
               p.warning === t.warning &&
               p.critical === t.critical
      })
      if (matches) return key
    }
    return null
  }, [])

  // Handle preset selection
  const handlePresetSelect = useCallback((presetKey) => {
    setSelectedPreset(presetKey)
    setThresholds({ ...PRESETS[presetKey].thresholds })
    setHasChanges(true)
  }, [])

  // Handle individual category change
  const handleCategoryChange = useCallback((category, newValues) => {
    setThresholds(prev => {
      const updated = { ...prev, [category]: newValues }
      setSelectedPreset(detectPreset(updated))
      return updated
    })
    setHasChanges(true)
  }, [detectPreset])

  // Reset to defaults
  const handleReset = useCallback(() => {
    setThresholds(DEFAULT_THRESHOLDS)
    setSelectedPreset('balanced')
    setHasChanges(true)
  }, [])

  // Save changes
  const handleSave = useCallback(async () => {
    setSaveStatus('saving')
    try {
      if (onSave) {
        await onSave(thresholds)
      }
      // Also save to localStorage for persistence
      localStorage.setItem('fieldsync_thresholds', JSON.stringify(thresholds))
      setSaveStatus('saved')
      setHasChanges(false)
      setTimeout(() => setSaveStatus(null), 2000)
    } catch (error) {
      console.error('Failed to save thresholds:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(null), 3000)
    }
  }, [thresholds, onSave])

  // Validation
  const isValid = useMemo(() => {
    return Object.values(thresholds).every(cat =>
      cat.healthy <= cat.warning && cat.warning <= cat.critical
    )
  }, [thresholds])

  return (
    <div className={`threshold-config ${className}`}>
      <div className="threshold-config__header">
        <div className="threshold-config__title-row">
          <Settings size={20} />
          <h3 className="threshold-config__title">Risk Thresholds</h3>
        </div>
        <p className="threshold-config__subtitle">
          Customize when projects are flagged as warning or critical
        </p>
      </div>

      <div className="threshold-config__info" role="note">
        <Info size={16} />
        <span>
          These thresholds determine risk scores across all projects.
          Lower values flag issues earlier.
        </span>
      </div>

      <div className="threshold-config__presets">
        <h4 className="threshold-config__section-title">Quick Presets</h4>
        <PresetSelector
          selectedPreset={selectedPreset}
          onSelect={handlePresetSelect}
          disabled={saveStatus === 'saving'}
        />
      </div>

      <div className="threshold-config__categories">
        <h4 className="threshold-config__section-title">Custom Thresholds</h4>
        {Object.keys(CATEGORY_META).map(key => (
          <ThresholdCategory
            key={key}
            categoryKey={key}
            thresholds={thresholds[key]}
            onChange={handleCategoryChange}
            disabled={saveStatus === 'saving'}
          />
        ))}
      </div>

      <div className="threshold-config__actions">
        <button
          type="button"
          className="threshold-config__btn threshold-config__btn--secondary"
          onClick={handleReset}
          disabled={saveStatus === 'saving'}
        >
          <RotateCcw size={16} />
          Reset to Defaults
        </button>
        <button
          type="button"
          className="threshold-config__btn threshold-config__btn--primary"
          onClick={handleSave}
          disabled={!hasChanges || !isValid || saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? (
            <>Saving...</>
          ) : saveStatus === 'saved' ? (
            <>
              <CheckCircle size={16} />
              Saved
            </>
          ) : (
            <>
              <Save size={16} />
              Save Changes
            </>
          )}
        </button>
      </div>

      {saveStatus === 'error' && (
        <div className="threshold-config__error" role="alert">
          <AlertTriangle size={16} />
          <span>Failed to save. Please try again.</span>
        </div>
      )}
    </div>
  )
}

/**
 * Hook to load saved thresholds from localStorage
 */
export function useSavedThresholds() {
  const [thresholds, setThresholds] = useState(() => {
    try {
      const saved = localStorage.getItem('fieldsync_thresholds')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.warn('Failed to load saved thresholds:', e)
    }
    return DEFAULT_THRESHOLDS
  })

  const updateThresholds = useCallback((newThresholds) => {
    setThresholds(newThresholds)
    localStorage.setItem('fieldsync_thresholds', JSON.stringify(newThresholds))
  }, [])

  return [thresholds, updateThresholds]
}

/**
 * Compact version for use in settings sidebar
 */
export function ThresholdConfigCompact({ onExpand, className = '' }) {
  const [thresholds] = useSavedThresholds()

  // Detect current preset
  let currentPreset = null
  for (const [_key, preset] of Object.entries(PRESETS)) {
    const matches = Object.keys(preset.thresholds).every(cat => {
      const p = preset.thresholds[cat]
      const t = thresholds[cat]
      return p.healthy === t.healthy &&
             p.warning === t.warning &&
             p.critical === t.critical
    })
    if (matches) {
      currentPreset = preset.name
      break
    }
  }

  return (
    <button
      type="button"
      className={`threshold-config-compact ${className}`}
      onClick={onExpand}
    >
      <Settings size={16} />
      <span className="threshold-config-compact__label">Risk Thresholds</span>
      <span className="threshold-config-compact__value">
        {currentPreset || 'Custom'}
      </span>
    </button>
  )
}

export default ThresholdConfig
