/**
 * Stat Card Component
 * Displays a single statistic with optional trend indicator
 */

export default function StatCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  color = 'var(--accent-blue)',
  onClick
}) {
  const trendUp = trend > 0
  const trendDown = trend < 0
  const trendNeutral = trend === 0

  const cardClass = `stat-card ${onClick ? 'stat-card-clickable' : ''}`

  return (
    <div
      className={cardClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
    >
      <div className="stat-card-header">
        {icon && (
          <div className="stat-card-icon" style={{ color }}>
            {icon}
          </div>
        )}
        <span className="stat-card-label">{label}</span>
      </div>

      <div className="stat-card-body">
        <div className="stat-card-value" style={{ color }}>
          {value}
        </div>

        {trend !== undefined && (
          <div className={`stat-card-trend ${trendUp ? 'trend-up' : trendDown ? 'trend-down' : 'trend-neutral'}`}>
            <span className="stat-card-trend-arrow">
              {trendUp && '↑'}
              {trendDown && '↓'}
              {trendNeutral && '→'}
            </span>
            <span className="stat-card-trend-value">
              {Math.abs(trend)}%
            </span>
            {trendLabel && (
              <span className="stat-card-trend-label">{trendLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
