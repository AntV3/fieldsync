import { formatChartDate, chartColors } from './chartConfig'

/**
 * Custom tooltip for financial charts
 * Displays detailed breakdown on hover
 */
export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) {
    return null
  }

  // Format currency
  const formatCurrency = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`
    }
    return `$${value.toFixed(0)}`
  }

  // Get the data point
  const data = payload[0]?.payload || {}

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">
        {formatChartDate(label)}
      </div>

      <div className="chart-tooltip-rows">
        {/* Contract */}
        {data.contract !== undefined && (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-label">
              <span
                className="chart-tooltip-dot"
                style={{ backgroundColor: chartColors.contract }}
              />
              Contract
            </span>
            <span className="chart-tooltip-value">
              {formatCurrency(data.contract)}
            </span>
          </div>
        )}

        {/* Revenue */}
        {data.revenue !== undefined && (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-label">
              <span
                className="chart-tooltip-dot"
                style={{ backgroundColor: chartColors.revenue }}
              />
              Revenue
            </span>
            <span className="chart-tooltip-value">
              {formatCurrency(data.revenue)}
            </span>
          </div>
        )}

        {/* Costs */}
        {data.costs !== undefined && (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-label">
              <span
                className="chart-tooltip-dot"
                style={{ backgroundColor: chartColors.costs }}
              />
              Costs
            </span>
            <span className="chart-tooltip-value">
              {formatCurrency(data.costs)}
            </span>
          </div>
        )}

        {/* T&M Value */}
        {data.tmValue !== undefined && data.tmValue > 0 && (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-label">
              <span
                className="chart-tooltip-dot"
                style={{ backgroundColor: chartColors.tmValue }}
              />
              T&M Value
            </span>
            <span className="chart-tooltip-value">
              {formatCurrency(data.tmValue)}
            </span>
          </div>
        )}

        {/* COR Value */}
        {data.corValue !== undefined && data.corValue > 0 && (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-label">
              <span
                className="chart-tooltip-dot"
                style={{ backgroundColor: chartColors.corValue }}
              />
              COR Approved
            </span>
            <span className="chart-tooltip-value">
              {formatCurrency(data.corValue)}
            </span>
          </div>
        )}

        {/* Profit/Loss */}
        {data.profit !== undefined && (
          <div className="chart-tooltip-row">
            <span className="chart-tooltip-label">
              <span
                className="chart-tooltip-dot"
                style={{
                  backgroundColor: data.profit >= 0
                    ? chartColors.profit
                    : chartColors.loss
                }}
              />
              {data.profit >= 0 ? 'Profit' : 'Loss'}
            </span>
            <span
              className="chart-tooltip-value"
              style={{
                color: data.profit >= 0
                  ? chartColors.profit
                  : chartColors.loss
              }}
            >
              {formatCurrency(Math.abs(data.profit))}
            </span>
          </div>
        )}
      </div>

      {/* Daily breakdown if available */}
      {(data.dailyLabor > 0 || data.dailyHaulOff > 0 || data.dailyTM > 0) && (
        <div className="chart-tooltip-daily">
          <div className="chart-tooltip-daily-label">Today's Activity</div>
          {data.dailyLabor > 0 && (
            <div className="chart-tooltip-daily-row">
              Labor: {formatCurrency(data.dailyLabor)}
            </div>
          )}
          {data.dailyHaulOff > 0 && (
            <div className="chart-tooltip-daily-row">
              Disposal: {formatCurrency(data.dailyHaulOff)}
            </div>
          )}
          {data.dailyTM > 0 && (
            <div className="chart-tooltip-daily-row">
              T&M Added: {formatCurrency(data.dailyTM)}
            </div>
          )}
        </div>
      )}

      <div className="chart-tooltip-hint">
        Click to see details
      </div>
    </div>
  )
}
