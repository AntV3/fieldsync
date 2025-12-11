/**
 * Simple Bar Chart Component
 * Displays data as vertical bars with labels and values
 */

export default function BarChart({ data, title, valueLabel = 'Value', maxHeight = 200 }) {
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <p>No data available</p>
      </div>
    )
  }

  // Find max value for scaling
  const maxValue = Math.max(...data.map(item => item.value))

  // Calculate bar heights as percentages
  const bars = data.map(item => ({
    ...item,
    heightPercent: maxValue > 0 ? (item.value / maxValue) * 100 : 0
  }))

  return (
    <div className="bar-chart-container">
      {title && <h3 className="chart-title">{title}</h3>}

      <div className="bar-chart" style={{ height: `${maxHeight}px` }}>
        {bars.map((bar, index) => (
          <div key={index} className="bar-chart-item">
            <div className="bar-chart-bar-wrapper">
              <div
                className="bar-chart-bar"
                style={{
                  height: `${bar.heightPercent}%`,
                  backgroundColor: bar.color || 'var(--accent-blue)'
                }}
                role="img"
                aria-label={`${bar.label}: ${bar.value} ${valueLabel}`}
              >
                <span className="bar-chart-value">{bar.value}</span>
              </div>
            </div>
            <span className="bar-chart-label">{bar.label}</span>
          </div>
        ))}
      </div>

      {valueLabel && (
        <div className="chart-legend">
          <span className="chart-legend-label">{valueLabel}</span>
        </div>
      )}
    </div>
  )
}
