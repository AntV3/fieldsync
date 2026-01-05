import { memo, useEffect, useState, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus, Check, AlertTriangle, Clock } from 'lucide-react'

/**
 * Micro-Visualizations - Small, informative visual elements
 * Designed to replace mental calculation and clarify status at a glance
 */

// Animated count badge with optional pulse for new items
export const CountBadge = memo(function CountBadge({
  count,
  label,
  variant = 'default', // 'default' | 'primary' | 'success' | 'warning' | 'danger'
  size = 'medium', // 'small' | 'medium' | 'large'
  pulse = false,
  icon: Icon
}) {
  const [prevCount, setPrevCount] = useState(count)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (count !== prevCount) {
      setAnimating(true)
      const timer = setTimeout(() => {
        setAnimating(false)
        setPrevCount(count)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [count, prevCount])

  return (
    <span
      className={`count-badge count-badge-${variant} count-badge-${size} ${pulse ? 'badge-new' : ''} ${animating ? 'animate-count-up' : ''}`}
      title={label}
    >
      {Icon && <Icon size={size === 'small' ? 12 : size === 'large' ? 18 : 14} />}
      <span className="count-badge-value">{count}</span>
      {label && <span className="count-badge-label">{label}</span>}
    </span>
  )
})

// Mini progress bar for inline usage
export const MiniProgress = memo(function MiniProgress({
  value,
  max = 100,
  showLabel = false,
  size = 'medium', // 'small' | 'medium' | 'large'
  variant = 'default', // 'default' | 'success' | 'warning' | 'danger'
  animated = true
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))
  const height = size === 'small' ? '4px' : size === 'large' ? '8px' : '6px'

  // Auto-determine variant based on percentage if not specified
  const autoVariant = variant === 'default'
    ? percentage >= 80 ? 'danger' : percentage >= 60 ? 'warning' : 'success'
    : variant

  return (
    <div className={`mini-progress mini-progress-${size}`}>
      <div className="mini-progress-track" style={{ height }}>
        <div
          className={`mini-progress-fill mini-progress-${autoVariant} ${animated ? 'progress-animate' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="mini-progress-label">{Math.round(percentage)}%</span>
      )}
    </div>
  )
})

// Trend indicator with direction and value
export const TrendIndicator = memo(function TrendIndicator({
  value,
  previousValue,
  format = 'percent', // 'percent' | 'number' | 'currency'
  inverted = false, // If true, down is good (e.g., costs)
  showValue = true
}) {
  const diff = value - previousValue
  const percentChange = previousValue !== 0 ? ((diff / previousValue) * 100) : 0

  let direction = diff === 0 ? 'neutral' : diff > 0 ? 'up' : 'down'
  let status = 'neutral'

  if (diff !== 0) {
    if (inverted) {
      status = diff > 0 ? 'negative' : 'positive'
    } else {
      status = diff > 0 ? 'positive' : 'negative'
    }
  }

  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus

  const formatValue = () => {
    const absChange = Math.abs(diff)
    switch (format) {
      case 'percent':
        return `${Math.abs(percentChange).toFixed(1)}%`
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(absChange)
      default:
        return absChange.toLocaleString()
    }
  }

  return (
    <span className={`trend-indicator trend-${status}`}>
      <Icon size={14} />
      {showValue && <span className="trend-value">{formatValue()}</span>}
    </span>
  )
})

// Status dot with optional label
export const StatusDot = memo(function StatusDot({
  status = 'default', // 'default' | 'success' | 'warning' | 'danger' | 'info'
  label,
  size = 'medium', // 'small' | 'medium' | 'large'
  pulse = false
}) {
  return (
    <span className={`status-dot-container status-dot-${size}`}>
      <span className={`status-dot status-dot-${status} ${pulse ? 'status-dot-pulse' : ''}`} />
      {label && <span className="status-dot-label">{label}</span>}
    </span>
  )
})

// Sparkline - mini line chart
export const Sparkline = memo(function Sparkline({
  data = [],
  width = 80,
  height = 24,
  strokeWidth = 2,
  color = 'var(--accent-blue)',
  showArea = true
}) {
  if (!data.length) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * (height - strokeWidth * 2) - strokeWidth
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg
      width={width}
      height={height}
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
    >
      {showArea && (
        <polygon
          points={areaPoints}
          fill={color}
          fillOpacity="0.15"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
})

// Quick stats row (e.g., "3 workers • 2.5 hrs • $450")
export const QuickStats = memo(function QuickStats({ items = [] }) {
  return (
    <div className="quick-stats">
      {items.map((item, index) => (
        <span key={index} className="quick-stat-item">
          {item.icon && <item.icon size={12} />}
          <span className="quick-stat-value">{item.value}</span>
          {item.label && <span className="quick-stat-label">{item.label}</span>}
        </span>
      ))}
    </div>
  )
})

// Status indicator with icon
export const StatusIndicator = memo(function StatusIndicator({
  status, // 'success' | 'warning' | 'danger' | 'info' | 'pending'
  label,
  size = 'medium'
}) {
  const icons = {
    success: Check,
    warning: AlertTriangle,
    danger: AlertTriangle,
    info: Clock,
    pending: Clock
  }

  const Icon = icons[status] || icons.info

  return (
    <span className={`status-indicator status-indicator-${status} status-indicator-${size}`}>
      <Icon size={size === 'small' ? 12 : size === 'large' ? 18 : 14} />
      {label && <span className="status-indicator-label">{label}</span>}
    </span>
  )
})

// Metric delta (change from previous)
export const MetricDelta = memo(function MetricDelta({
  current,
  previous,
  format = 'number', // 'number' | 'currency' | 'percent'
  label,
  inverted = false
}) {
  const delta = current - previous
  const isPositive = inverted ? delta < 0 : delta > 0
  const isNegative = inverted ? delta > 0 : delta < 0

  const formatValue = (val) => {
    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0
        }).format(Math.abs(val))
      case 'percent':
        return `${Math.abs(val).toFixed(1)}%`
      default:
        return Math.abs(val).toLocaleString()
    }
  }

  return (
    <div className={`metric-delta ${isPositive ? 'positive' : isNegative ? 'negative' : 'neutral'}`}>
      <span className="metric-delta-arrow">
        {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}
      </span>
      <span className="metric-delta-value">{formatValue(delta)}</span>
      {label && <span className="metric-delta-label">{label}</span>}
    </div>
  )
})

// Circular progress (donut style)
export const CircularProgress = memo(function CircularProgress({
  value,
  max = 100,
  size = 40,
  strokeWidth = 4,
  showValue = true,
  color = 'var(--accent-blue)'
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className="circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="circular-progress-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <circle
          className="circular-progress-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      {showValue && (
        <span className="circular-progress-value">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  )
})

export default {
  CountBadge,
  MiniProgress,
  TrendIndicator,
  StatusDot,
  Sparkline,
  QuickStats,
  StatusIndicator,
  MetricDelta,
  CircularProgress
}
