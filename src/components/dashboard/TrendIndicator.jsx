/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react'

/**
 * TrendIndicator
 *
 * Shows directional trend with percentage change.
 * Color indicates positive/negative based on context.
 *
 * @param {number} value - The percentage change (e.g., 12 for +12%)
 * @param {string} context - Optional context text (e.g., "vs last week")
 * @param {boolean} inverted - If true, down is good (e.g., for costs)
 * @param {string} format - 'percent' | 'currency' | 'number'
 * @param {string} size - 'sm' | 'md' | 'lg'
 */
export function TrendIndicator({
  value,
  context,
  inverted = false,
  format = 'percent',
  size: _size = 'md',
  className = ''
}) {
  // Determine direction
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral'

  // Select icon
  const icons = {
    up: ArrowUpRight,
    down: ArrowDownRight,
    neutral: ArrowRight
  }
  const Icon = icons[direction]

  // Format the value
  const formatValue = (val) => {
    const absVal = Math.abs(val)
    switch (format) {
      case 'percent':
        return `${absVal.toFixed(1)}%`
      case 'currency':
        return `$${absVal.toLocaleString()}`
      case 'number':
        return absVal.toLocaleString()
      default:
        return absVal.toString()
    }
  }

  // Build aria label
  const trendText = direction === 'up' ? 'increased' : direction === 'down' ? 'decreased' : 'unchanged'
  const ariaLabel = `${trendText} by ${formatValue(value)}${context ? `, ${context}` : ''}`

  return (
    <span
      className={`trend-indicator trend-indicator--${direction} ${inverted ? 'trend-indicator--inverted' : ''} ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <Icon className="trend-indicator__arrow" aria-hidden="true" />
      <span className="trend-indicator__value">{formatValue(value)}</span>
      {context && (
        <span className="trend-indicator__context">{context}</span>
      )}
    </span>
  )
}

/**
 * Calculate trend between two values
 */
export function calculateTrend(current, previous) {
  if (!previous || previous === 0) return 0
  return ((current - previous) / previous) * 100
}

/**
 * TrendIndicatorWithCalculation
 *
 * Automatically calculates trend from current and previous values
 */
export function TrendIndicatorWithCalculation({
  current,
  previous,
  context = 'vs previous',
  inverted = false,
  format = 'percent',
  className = ''
}) {
  const trend = calculateTrend(current, previous)

  return (
    <TrendIndicator
      value={trend}
      context={context}
      inverted={inverted}
      format={format}
      className={className}
    />
  )
}

/**
 * Sparkline - Mini trend visualization
 *
 * Shows a small bar chart of recent values
 */
export function Sparkline({
  values = [],
  highlightLast = true,
  warningThreshold,
  dangerThreshold,
  className = ''
}) {
  if (!values.length) return null

  const max = Math.max(...values)

  return (
    <div
      className={`sparkline ${className}`}
      role="img"
      aria-label={`Trend showing ${values.length} data points, latest value ${values[values.length - 1]}`}
    >
      {values.map((value, index) => {
        const height = max > 0 ? (value / max) * 100 : 0
        const isLast = index === values.length - 1

        let variant = ''
        if (dangerThreshold && value >= dangerThreshold) {
          variant = 'sparkline__bar--danger'
        } else if (warningThreshold && value >= warningThreshold) {
          variant = 'sparkline__bar--warning'
        } else if (highlightLast && isLast) {
          variant = 'sparkline__bar--highlight'
        }

        return (
          <div
            key={index}
            className={`sparkline__bar ${variant}`}
            style={{ height: `${Math.max(height, 4)}%` }}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}

export default TrendIndicator
