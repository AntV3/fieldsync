import { TrendingDown, AlertCircle, CheckCircle } from 'lucide-react'

// Helper to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0)
}

export default function ProfitabilityCard({
  revenue,      // billable amount (earned based on progress)
  totalCosts,   // all costs combined
  contractValue, // total contract value
  progress      // completion percentage
}) {
  // Current profit and margin
  const currentProfit = revenue - totalCosts
  const currentMargin = revenue > 0 ? (currentProfit / revenue) * 100 : 0

  // Projected final values (extrapolate based on current progress)
  const projectedRevenue = contractValue
  const projectedCosts = progress > 0 ? (totalCosts / (progress / 100)) : totalCosts
  const projectedProfit = projectedRevenue - projectedCosts
  const projectedMargin = projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0

  // Determine status
  const isHealthy = currentMargin >= 20
  const isWarning = currentMargin >= 0 && currentMargin < 20
  const isLoss = currentMargin < 0

  const status = isHealthy ? 'healthy' : isWarning ? 'warning' : 'loss'
  const statusLabel = isHealthy ? 'On Track' : isWarning ? 'Watch Margin' : 'Over Cost'
  const StatusIcon = isHealthy ? CheckCircle : isWarning ? AlertCircle : TrendingDown

  return (
    <div className={`profitability-card ${status}`}>
      <div className="profitability-header">
        <h3>Profitability</h3>
        <div className={`profitability-status ${status}`}>
          <StatusIcon size={14} />
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="profitability-metrics">
        {/* Current Margin */}
        <div className="profit-metric">
          <div className="profit-metric-header">
            <span className="profit-metric-label">Current Margin</span>
            <span className={`profit-metric-value ${currentMargin < 0 ? 'negative' : ''}`}>
              {Math.round(currentMargin)}%
            </span>
          </div>
          <div className="profit-bar-container">
            <div
              className={`profit-bar ${currentMargin < 0 ? 'negative' : currentMargin < 20 ? 'warning' : 'healthy'}`}
              style={{ width: `${Math.min(Math.abs(currentMargin), 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Projected Final Margin */}
        {progress > 10 && (
          <div className="profit-metric">
            <div className="profit-metric-header">
              <span className="profit-metric-label">Projected Final</span>
              <span className={`profit-metric-value ${projectedMargin < 0 ? 'negative' : ''}`}>
                {Math.round(projectedMargin)}%
              </span>
            </div>
            <div className="profit-bar-container">
              <div
                className={`profit-bar ${projectedMargin < 0 ? 'negative' : projectedMargin < 20 ? 'warning' : 'healthy'}`}
                style={{ width: `${Math.min(Math.abs(projectedMargin), 100)}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      <div className="profitability-summary">
        <div className="profit-row">
          <span className="profit-label">Revenue Earned</span>
          <span className="profit-value">{formatCurrency(revenue)}</span>
        </div>
        <div className="profit-row">
          <span className="profit-label">Total Costs</span>
          <span className="profit-value negative">- {formatCurrency(totalCosts)}</span>
        </div>
        <div className="profit-row profit-total">
          <span className="profit-label">Current Profit</span>
          <span className={`profit-value ${currentProfit < 0 ? 'negative' : 'positive'}`}>
            {currentProfit >= 0 ? '' : '-'}{formatCurrency(Math.abs(currentProfit))}
          </span>
        </div>
      </div>

      {progress > 10 && (
        <div className="profitability-insight">
          {isHealthy && (
            <p>
              At {Math.round(progress)}% complete, you're at {formatCurrency(currentProfit)} profit.
              {projectedProfit > 0 && ` Projected final profit: ${formatCurrency(projectedProfit)}`}
            </p>
          )}
          {isWarning && (
            <p>
              Margins are thin. Consider reviewing costs or scope.
              {projectedProfit < 0 && ` Trending toward ${formatCurrency(projectedProfit)} loss.`}
            </p>
          )}
          {isLoss && (
            <p>
              Currently over cost by {formatCurrency(Math.abs(currentProfit))}.
              Immediate review recommended.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
