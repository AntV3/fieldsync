import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import { TrendingUp, TrendingDown, Target, AlertTriangle, Clock, Zap } from 'lucide-react'
import { chartColors, formatChartCurrency, tooltipStyle, animationConfig } from './chartConfig'

/**
 * ForecastChart
 *
 * Displays predictive cost and schedule forecasts with confidence intervals.
 * Shows trend-based projections alongside planned values.
 */
export default function ForecastChart({ forecast, contractValue, className = '' }) {
  const [activeView, setActiveView] = useState('cost')

  if (!forecast) {
    return (
      <div className={`forecast-chart ${className}`}>
        <div className="chart-empty-state">
          <p>Forecasting Unavailable</p>
          <span>Need more project data to generate forecasts</span>
        </div>
      </div>
    )
  }

  const { cost, schedule, insights, confidence } = forecast

  return (
    <div className={`forecast-chart ${className}`}>
      <div className="chart-header">
        <div className="chart-title-section">
          <h3>Predictive Forecast</h3>
          <ConfidenceBadge level={confidence} />
        </div>
        <div className="forecast-chart__tabs">
          <button
            className={`forecast-chart__tab ${activeView === 'cost' ? 'forecast-chart__tab--active' : ''}`}
            onClick={() => setActiveView('cost')}
          >
            Cost
          </button>
          <button
            className={`forecast-chart__tab ${activeView === 'schedule' ? 'forecast-chart__tab--active' : ''}`}
            onClick={() => setActiveView('schedule')}
          >
            Schedule
          </button>
        </div>
      </div>

      {activeView === 'cost' ? (
        <CostForecastView cost={cost} contractValue={contractValue} />
      ) : (
        <ScheduleForecastView schedule={schedule} />
      )}

      {/* Insights */}
      {insights && insights.length > 0 && (
        <div className="forecast-chart__insights">
          {insights.slice(0, 3).map((insight, i) => (
            <InsightCard key={i} insight={insight} />
          ))}
        </div>
      )}
    </div>
  )
}

function CostForecastView({ cost, contractValue }) {
  if (!cost || !cost.weeklyForecast || cost.weeklyForecast.length === 0) {
    return <div className="chart-empty-state"><span>Insufficient data for cost forecast</span></div>
  }

  return (
    <div>
      {/* Summary metrics */}
      <div className="forecast-chart__metrics">
        <ForecastMetric
          label="Best Estimate"
          value={formatChartCurrency(cost.bestEstimate)}
          comparison={contractValue ? formatChartCurrency(contractValue) : null}
          comparisonLabel="budget"
          status={cost.bestEstimate <= contractValue ? 'better' : 'worse'}
          icon={Target}
        />
        <ForecastMetric
          label="Remaining"
          value={formatChartCurrency(cost.etc)}
          status="neutral"
          icon={Clock}
        />
        <ForecastMetric
          label="Confidence Range"
          value={`${formatChartCurrency(cost.range.optimistic)} - ${formatChartCurrency(cost.range.pessimistic)}`}
          status="neutral"
          icon={TrendingUp}
        />
        <ForecastMetric
          label="Burn Rate"
          value={cost.burnRateTrend === 'accelerating' ? 'Accelerating' : cost.burnRateTrend === 'decelerating' ? 'Decelerating' : 'Stable'}
          status={cost.burnRateTrend === 'accelerating' ? 'worse' : cost.burnRateTrend === 'decelerating' ? 'better' : 'neutral'}
          icon={Zap}
        />
      </div>

      {/* Forecast methods comparison */}
      <div className="forecast-chart__methods">
        <span className="forecast-chart__methods-label">Forecast Methods:</span>
        <span className="forecast-chart__method">CPI: {formatChartCurrency(cost.methods.cpiMethod)}</span>
        <span className="forecast-chart__method">Trend: {formatChartCurrency(cost.methods.trendMethod)}</span>
        <span className="forecast-chart__method">Composite: {formatChartCurrency(cost.methods.compositeMethod)}</span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={cost.weeklyForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.costs} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.costs} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} tickFormatter={formatChartCurrency} />
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            labelStyle={tooltipStyle.labelStyle}
            formatter={(val) => [formatChartCurrency(val)]}
          />
          {contractValue && (
            <ReferenceLine
              y={contractValue}
              stroke={chartColors.contract}
              strokeDasharray="6 4"
              label={{ value: 'Budget', position: 'right', fill: chartColors.contract, fontSize: 11 }}
            />
          )}
          <Area
            type="monotone"
            dataKey="projected"
            stroke={chartColors.costs}
            fill="url(#forecastGradient)"
            strokeWidth={2}
            name="Projected Cost"
            animationDuration={animationConfig.duration}
          />
          <Line
            type="monotone"
            dataKey="budget"
            stroke={chartColors.contract}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            dot={false}
            name="Planned"
            animationDuration={animationConfig.duration}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ScheduleForecastView({ schedule }) {
  if (!schedule || !schedule.weeklyProgress || schedule.weeklyProgress.length === 0) {
    return <div className="chart-empty-state"><span>Insufficient data for schedule forecast</span></div>
  }

  const slippageStatus = schedule.slippage > 14 ? 'worse' : schedule.slippage > 7 ? 'warning' : schedule.slippage < -7 ? 'better' : 'neutral'

  return (
    <div>
      <div className="forecast-chart__metrics">
        <ForecastMetric
          label="Projected End"
          value={schedule.projectedEnd ? new Date(schedule.projectedEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
          comparison={schedule.plannedEnd ? new Date(schedule.plannedEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null}
          comparisonLabel="planned"
          status={slippageStatus}
          icon={Clock}
        />
        <ForecastMetric
          label="Slippage"
          value={`${schedule.slippage > 0 ? '+' : ''}${schedule.slippage} days`}
          status={slippageStatus}
          icon={schedule.slippage > 0 ? TrendingDown : TrendingUp}
        />
        <ForecastMetric
          label="Daily Velocity"
          value={`${schedule.velocity}%/day`}
          comparison={`${schedule.plannedVelocity}%/day planned`}
          status={schedule.velocity >= schedule.plannedVelocity ? 'better' : 'worse'}
          icon={Zap}
        />
        <ForecastMetric
          label="Progress Trend"
          value={schedule.progressTrend === 'improving' ? 'Improving' : schedule.progressTrend === 'declining' ? 'Slowing' : 'Steady'}
          status={schedule.progressTrend === 'improving' ? 'better' : schedule.progressTrend === 'declining' ? 'worse' : 'neutral'}
          icon={TrendingUp}
        />
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={schedule.weeklyProgress} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            labelStyle={tooltipStyle.labelStyle}
            formatter={(val) => [`${val}%`]}
          />
          <ReferenceLine y={100} stroke={chartColors.revenue} strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="projected"
            stroke={chartColors.revenue}
            strokeWidth={2}
            dot={schedule.weeklyProgress.length <= 15}
            name="Projected Progress"
            animationDuration={animationConfig.duration}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ForecastMetric({ label, value, comparison, comparisonLabel, status = 'neutral', icon: Icon }) {
  const statusColors = {
    better: 'var(--status-success)',
    worse: 'var(--status-danger)',
    warning: 'var(--status-warning)',
    neutral: 'var(--text-muted)',
  }

  return (
    <div className="forecast-metric">
      <div className="forecast-metric__header">
        <Icon size={14} style={{ color: statusColors[status] }} />
        <span className="forecast-metric__label">{label}</span>
      </div>
      <div className="forecast-metric__value" style={{ color: statusColors[status] }}>{value}</div>
      {comparison && (
        <div className="forecast-metric__comparison">
          {comparisonLabel}: {comparison}
        </div>
      )}
    </div>
  )
}

function ConfidenceBadge({ level }) {
  const colors = {
    high: 'var(--status-success)',
    medium: 'var(--status-warning)',
    low: 'var(--text-muted)',
  }

  return (
    <span
      className="confidence-badge"
      style={{ color: colors[level], borderColor: colors[level] }}
    >
      {level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low'} Confidence
    </span>
  )
}

function InsightCard({ insight }) {
  const iconMap = {
    critical: AlertTriangle,
    warning: AlertTriangle,
    success: TrendingUp,
    info: Target,
  }
  const colorMap = {
    critical: 'var(--status-danger)',
    warning: 'var(--status-warning)',
    success: 'var(--status-success)',
    info: 'var(--status-info)',
  }

  const Icon = iconMap[insight.type] || Target

  return (
    <div className={`forecast-insight forecast-insight--${insight.type}`}>
      <Icon size={14} style={{ color: colorMap[insight.type], flexShrink: 0 }} />
      <div>
        <strong>{insight.title}</strong>
        <span>{insight.description}</span>
        {insight.action && <span className="forecast-insight__action">{insight.action}</span>}
      </div>
    </div>
  )
}

export { ForecastMetric, ConfidenceBadge, InsightCard }
