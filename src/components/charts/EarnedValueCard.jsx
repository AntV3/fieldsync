import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Clock, Target, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import { calculateEarnedValue, generateSCurveData } from '../../lib/earnedValueCalculations'
import { chartColors, tooltipStyle, formatChartCurrency } from './chartConfig'

/**
 * Earned Value Management card for project dashboard.
 * Shows CPI, SPI, EAC, ETC, and S-curve chart.
 */
export default function EarnedValueCard({
  contractValue = 0,
  changeOrderValue = 0,
  progressPercent = 0,
  actualCosts = 0,
  startDate,
  endDate,
  areas = []
}) {
  const ev = useMemo(() =>
    calculateEarnedValue({
      contractValue,
      changeOrderValue,
      progressPercent,
      actualCosts,
      startDate,
      endDate,
      areas
    }),
    [contractValue, changeOrderValue, progressPercent, actualCosts, startDate, endDate, areas]
  )

  const sCurveData = useMemo(() =>
    generateSCurveData({
      contractValue,
      changeOrderValue,
      progressPercent,
      actualCosts,
      startDate,
      endDate
    }),
    [contractValue, changeOrderValue, progressPercent, actualCosts, startDate, endDate]
  )

  const statusColors = {
    healthy: '#10b981',
    watch: '#f59e0b',
    warning: '#f97316',
    critical: '#ef4444'
  }

  const statusColor = statusColors[ev.healthStatus] || statusColors.watch

  return (
    <div className="ev-card">
      <div className="ev-card-header">
        <div className="ev-card-title">
          <Target size={18} />
          <h3>Earned Value Analysis</h3>
        </div>
        <span className="ev-health-badge" style={{ background: `${statusColor}18`, color: statusColor, borderColor: `${statusColor}40` }}>
          {ev.healthStatus === 'healthy' ? 'Healthy' :
           ev.healthStatus === 'watch' ? 'Watch' :
           ev.healthStatus === 'warning' ? 'Warning' : 'Critical'}
        </span>
      </div>

      {/* Performance Indices */}
      <div className="ev-indices-row">
        <div className="ev-index-card">
          <div className="ev-index-header">
            <DollarSign size={14} />
            <span>CPI</span>
          </div>
          <div className="ev-index-value" style={{ color: ev.cpi >= 0.95 ? '#10b981' : ev.cpi >= 0.85 ? '#f59e0b' : '#ef4444' }}>
            {ev.cpi.toFixed(2)}
          </div>
          <div className="ev-index-label">{ev.cpiLabel}</div>
        </div>

        <div className="ev-index-card">
          <div className="ev-index-header">
            <Clock size={14} />
            <span>SPI</span>
          </div>
          <div className="ev-index-value" style={{ color: ev.spi >= 0.95 ? '#10b981' : ev.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>
            {ev.spi.toFixed(2)}
          </div>
          <div className="ev-index-label">{ev.spiLabel}</div>
        </div>

        <div className="ev-index-card">
          <div className="ev-index-header">
            {ev.vac >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>EAC</span>
          </div>
          <div className="ev-index-value">
            {formatCurrency(ev.eac)}
          </div>
          <div className="ev-index-label">Est. at Completion</div>
        </div>

        <div className="ev-index-card">
          <div className="ev-index-header">
            <Target size={14} />
            <span>ETC</span>
          </div>
          <div className="ev-index-value">
            {formatCurrency(ev.etc)}
          </div>
          <div className="ev-index-label">Est. to Complete</div>
        </div>
      </div>

      {/* Variance Summary */}
      <div className="ev-variance-row">
        <div className={`ev-variance-item ${ev.costVariance >= 0 ? 'positive' : 'negative'}`}>
          <span className="ev-variance-label">Cost Variance</span>
          <span className="ev-variance-value">
            {ev.costVariance >= 0 ? '+' : ''}{formatCurrency(ev.costVariance)}
          </span>
        </div>
        <div className={`ev-variance-item ${ev.scheduleVariance >= 0 ? 'positive' : 'negative'}`}>
          <span className="ev-variance-label">Schedule Variance</span>
          <span className="ev-variance-value">
            {ev.scheduleVariance >= 0 ? '+' : ''}{formatCurrency(ev.scheduleVariance)}
          </span>
        </div>
        <div className={`ev-variance-item ${ev.vac >= 0 ? 'positive' : 'negative'}`}>
          <span className="ev-variance-label">Variance at Completion</span>
          <span className="ev-variance-value">
            {ev.vac >= 0 ? '+' : ''}{formatCurrency(ev.vac)}
          </span>
        </div>
      </div>

      {/* S-Curve Chart */}
      {sCurveData.length > 0 && (
        <div className="ev-chart-container">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={sCurveData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-color)' }}
              />
              <YAxis
                tickFormatter={formatChartCurrency}
                tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={tooltipStyle.contentStyle}
                labelStyle={tooltipStyle.labelStyle}
              />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              />
              <Line
                type="monotone"
                dataKey="plannedValue"
                stroke={chartColors.contract}
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
                name="Planned Value"
              />
              <Line
                type="monotone"
                dataKey="earnedValue"
                stroke={chartColors.revenue}
                strokeWidth={2}
                dot={false}
                name="Earned Value"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="actualCost"
                stroke={chartColors.costs}
                strokeWidth={2}
                dot={false}
                name="Actual Cost"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Projected End Date */}
      {ev.projectedEndDate && endDate && (
        <div className="ev-projection-row">
          <div className="ev-projection-item">
            <span className="ev-projection-label">Planned End</span>
            <span className="ev-projection-value">{new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="ev-projection-item">
            <span className="ev-projection-label">Projected End</span>
            <span className="ev-projection-value" style={{ color: ev.spi >= 0.95 ? '#10b981' : '#f59e0b' }}>
              {new Date(ev.projectedEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          {ev.tcpi > 1.1 && (
            <div className="ev-projection-alert">
              <AlertTriangle size={14} />
              <span>Need CPI of {ev.tcpi.toFixed(2)} to finish on budget</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
