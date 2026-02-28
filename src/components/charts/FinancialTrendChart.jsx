import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  chartColors,
  animationConfig,
  timeRanges,
  formatChartCurrency,
  formatChartDate,
  gradientDefs,
} from './chartConfig'
import { buildFinancialTimeSeries, filterByTimeRange, calculateTrend } from '../../lib/chartDataTransforms'
import ChartTooltip from './ChartTooltip'

/**
 * Financial Trend Chart
 * Multi-line area chart showing contract, revenue, costs, T&M, and COR values over time
 * Uses actual area completion dates for revenue tracking
 */
export default function FinancialTrendChart({
  projectData,
  project,
  tmTickets = [],
  corStats = null,
  areas = [],
  changeOrderValue = 0,
  onDrillDown,
}) {
  const [timeRange, setTimeRange] = useState('30d')
  const [hoveredLine, setHoveredLine] = useState(null)

  // Build the time series data using actual area completions for revenue
  const chartData = useMemo(() => {
    const allData = buildFinancialTimeSeries(projectData, project, tmTickets, corStats, areas, changeOrderValue)
    const selectedRange = timeRanges.find(r => r.id === timeRange)
    return filterByTimeRange(allData, selectedRange?.days)
  }, [projectData, project, tmTickets, corStats, areas, changeOrderValue, timeRange])

  // Calculate trend indicators
  const costsTrend = useMemo(() => calculateTrend(chartData, 'costs'), [chartData])
  const revenueTrend = useMemo(() => calculateTrend(chartData, 'revenue'), [chartData])

  // Handle click on data point
  const handleClick = (data) => {
    if (data?.activePayload?.[0]) {
      const point = data.activePayload[0].payload
      onDrillDown?.(point.date, point)
    }
  }

  // Trend icon component
  const TrendIcon = ({ trend }) => {
    if (trend.direction === 'up') {
      return <TrendingUp size={14} className="trend-icon up" />
    }
    if (trend.direction === 'down') {
      return <TrendingDown size={14} className="trend-icon down" />
    }
    return <Minus size={14} className="trend-icon flat" />
  }

  if (!chartData.length) {
    return (
      <div className="financial-trend-chart empty">
        <div className="chart-empty-state">
          <p>No financial data available yet.</p>
          <span>Start tracking labor and costs to see trends.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="financial-trend-chart">
      <div className="chart-header">
        <div className="chart-title-section">
          <h3>Financial Trend</h3>
          <div className="chart-trend-indicators">
            <span className="trend-badge">
              <span style={{ color: chartColors.revenue }}>Revenue</span>
              <TrendIcon trend={revenueTrend} />
              {revenueTrend.percentage > 0 && (
                <span className="trend-pct">{revenueTrend.percentage}%</span>
              )}
            </span>
            <span className="trend-badge">
              <span style={{ color: chartColors.costs }}>Costs</span>
              <TrendIcon trend={costsTrend} />
              {costsTrend.percentage > 0 && (
                <span className="trend-pct">{costsTrend.percentage}%</span>
              )}
            </span>
          </div>
        </div>

        <div className="time-range-selector">
          {timeRanges.map(range => (
            <button
              key={range.id}
              className={timeRange === range.id ? 'active' : ''}
              onClick={() => setTimeRange(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={chartData}
            onClick={handleClick}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            {/* Gradient definitions */}
            <defs>
              {Object.values(gradientDefs).map(grad => (
                <linearGradient
                  key={grad.id}
                  id={grad.id}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={grad.color}
                    stopOpacity={grad.startOpacity}
                  />
                  <stop
                    offset="95%"
                    stopColor={grad.color}
                    stopOpacity={grad.endOpacity}
                  />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-color)"
              vertical={false}
            />

            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              stroke="var(--text-secondary)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border-color)' }}
            />

            <YAxis
              tickFormatter={formatChartCurrency}
              stroke="var(--text-secondary)"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />

            <Tooltip content={<ChartTooltip />} />

            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  {value}
                </span>
              )}
            />

            {/* Contract ceiling - dashed reference line */}
            {chartData[0]?.contract > 0 && (
              <ReferenceLine
                y={chartData[0].contract}
                stroke={chartColors.contract}
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: 'Contract',
                  position: 'right',
                  fill: chartColors.contract,
                  fontSize: 11,
                }}
              />
            )}

            {/* Revenue area */}
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke={chartColors.revenue}
              strokeWidth={2}
              fill="url(#revenueGradient)"
              animationDuration={animationConfig.duration}
              onMouseEnter={() => setHoveredLine('revenue')}
              onMouseLeave={() => setHoveredLine(null)}
              style={{
                opacity: hoveredLine && hoveredLine !== 'revenue' ? 0.3 : 1,
              }}
            />

            {/* Costs area */}
            <Area
              type="monotone"
              dataKey="costs"
              name="Costs"
              stroke={chartColors.costs}
              strokeWidth={2}
              fill="url(#costsGradient)"
              animationDuration={animationConfig.duration}
              onMouseEnter={() => setHoveredLine('costs')}
              onMouseLeave={() => setHoveredLine(null)}
              style={{
                opacity: hoveredLine && hoveredLine !== 'costs' ? 0.3 : 1,
              }}
            />

            {/* T&M Value area */}
            {chartData.some(d => d.tmValue > 0) && (
              <Area
                type="monotone"
                dataKey="tmValue"
                name="Time & Material Value"
                stroke={chartColors.tmValue}
                strokeWidth={2}
                fill="url(#tmValueGradient)"
                animationDuration={animationConfig.duration}
                onMouseEnter={() => setHoveredLine('tmValue')}
                onMouseLeave={() => setHoveredLine(null)}
                style={{
                  opacity: hoveredLine && hoveredLine !== 'tmValue' ? 0.3 : 1,
                }}
              />
            )}

            {/* COR Approved Value - shown as reference line (static total) */}
            {(corStats?.total_approved_value || 0) > 0 && (
              <ReferenceLine
                y={corStats.total_approved_value}
                stroke={chartColors.corValue}
                strokeDasharray="4 2"
                strokeWidth={2}
                label={{
                  value: `COR Approved`,
                  position: 'right',
                  fill: chartColors.corValue,
                  fontSize: 11,
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Quick stats below chart */}
      <div className="chart-quick-stats">
        <div className="quick-stat">
          <span className="stat-label">Current Revenue</span>
          <span className="stat-value" style={{ color: chartColors.revenue }}>
            {formatChartCurrency(chartData[chartData.length - 1]?.revenue || 0)}
          </span>
        </div>
        <div className="quick-stat">
          <span className="stat-label">Total Costs</span>
          <span className="stat-value" style={{ color: chartColors.costs }}>
            {formatChartCurrency(chartData[chartData.length - 1]?.costs || 0)}
          </span>
        </div>
        <div className="quick-stat">
          <span className="stat-label">Margin</span>
          <span
            className="stat-value"
            style={{
              color: (chartData[chartData.length - 1]?.profit || 0) >= 0
                ? chartColors.profit
                : chartColors.loss
            }}
          >
            {(() => {
              const last = chartData[chartData.length - 1]
              if (!last || !last.revenue) return '0%'
              const margin = ((last.revenue - last.costs) / last.revenue) * 100
              return `${margin.toFixed(1)}%`
            })()}
          </span>
        </div>
        {chartData[chartData.length - 1]?.tmValue > 0 && (
          <div className="quick-stat">
            <span className="stat-label">Time & Material Pending</span>
            <span className="stat-value" style={{ color: chartColors.tmValue }}>
              {formatChartCurrency(chartData[chartData.length - 1]?.tmValue || 0)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
