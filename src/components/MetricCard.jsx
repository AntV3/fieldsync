import { useState } from 'react'

export default function MetricCard({ value, label, subtext, breakdown, variant, formatValue }) {
  const [showBreakdown, setShowBreakdown] = useState(false)

  const hasBreakdown = breakdown && breakdown.length > 0

  return (
    <div
      className={`metric-card ${variant ? `metric-${variant}` : ''}`}
      onMouseEnter={() => hasBreakdown && setShowBreakdown(true)}
      onMouseLeave={() => setShowBreakdown(false)}
      style={{ position: 'relative' }}
    >
      <div className="metric-value">{formatValue ? formatValue(value) : value}</div>
      <div className="metric-label">{label}</div>
      {subtext && <div className="metric-subtext">{subtext}</div>}

      {/* Breakdown Tooltip */}
      {showBreakdown && hasBreakdown && (
        <div className="metric-breakdown-tooltip">
          <div className="metric-breakdown-header">
            {label} Breakdown
          </div>
          <div className="metric-breakdown-list">
            {breakdown.map((item, index) => (
              <div key={index} className="metric-breakdown-item">
                <span className="breakdown-project">{item.projectName}</span>
                <span className="breakdown-value">
                  {item.value !== undefined && formatValue
                    ? formatValue(item.value)
                    : item.count !== undefined
                    ? `${item.count} ${item.count === 1 ? 'item' : 'items'}`
                    : item.atRisk !== undefined && formatValue
                    ? `${formatValue(item.atRisk)} (${item.progress}%)`
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
