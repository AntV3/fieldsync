import React, { useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Area, Legend
} from 'recharts'
import { DollarSign, ArrowDownCircle, ArrowUpCircle, AlertTriangle, TrendingUp } from 'lucide-react'
import { chartColors, formatChartCurrency, tooltipStyle, animationConfig } from './chartConfig'

/**
 * CashFlowChart
 *
 * Visualizes cash flow projections with inflows (receivables)
 * vs outflows (payables) and cumulative balance.
 */
export default function CashFlowChart({ cashFlow, className = '' }) {
  if (!cashFlow || !cashFlow.monthlyForecast || cashFlow.monthlyForecast.length === 0) {
    return (
      <div className={`cash-flow-chart ${className}`}>
        <div className="chart-empty-state">
          <p>Cash Flow Projection Unavailable</p>
          <span>Need active projects with financial data</span>
        </div>
      </div>
    )
  }

  const { monthlyForecast, metrics, risks, receivables } = cashFlow

  return (
    <div className={`cash-flow-chart ${className}`}>
      <div className="chart-header">
        <div className="chart-title-section">
          <h3>Cash Flow Projection</h3>
          <span className="chart-subtitle">
            {monthlyForecast.length}-month outlook
          </span>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="cash-flow-chart__metrics">
        <CashFlowMetric
          label="Net Cash Flow"
          value={formatChartCurrency(metrics.netCashFlow)}
          status={metrics.netCashFlow >= 0 ? 'positive' : 'negative'}
          icon={DollarSign}
        />
        <CashFlowMetric
          label="Total Inflows"
          value={formatChartCurrency(metrics.totalInflows)}
          status="positive"
          icon={ArrowDownCircle}
        />
        <CashFlowMetric
          label="Total Outflows"
          value={formatChartCurrency(metrics.totalOutflows)}
          status="neutral"
          icon={ArrowUpCircle}
        />
        <CashFlowMetric
          label="Cash Ratio"
          value={`${metrics.cashFlowRatio}x`}
          status={metrics.cashFlowRatio >= 1.2 ? 'positive' : metrics.cashFlowRatio >= 1.0 ? 'warning' : 'negative'}
          icon={TrendingUp}
        />
      </div>

      {/* Receivables breakdown */}
      {receivables && (
        <div className="cash-flow-chart__receivables">
          <div className="cash-flow-chart__receivable-item">
            <span>Outstanding</span>
            <strong>{formatChartCurrency(receivables.totalOutstanding)}</strong>
          </div>
          <div className="cash-flow-chart__receivable-item">
            <span>Unbilled</span>
            <strong>{formatChartCurrency(receivables.totalUnbilled)}</strong>
          </div>
          {receivables.overdueAmount > 0 && (
            <div className="cash-flow-chart__receivable-item cash-flow-chart__receivable-item--overdue">
              <span>Overdue</span>
              <strong>{formatChartCurrency(receivables.overdueAmount)}</strong>
            </div>
          )}
        </div>
      )}

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={monthlyForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.revenue} stopOpacity={0.2} />
              <stop offset="100%" stopColor={chartColors.revenue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} tickFormatter={formatChartCurrency} />
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            labelStyle={tooltipStyle.labelStyle}
            content={<CashFlowTooltip />}
          />
          <Legend
            formatter={(value) => {
              const labels = { inflows: 'Inflows', outflows: 'Outflows', cumulative: 'Cumulative' }
              return labels[value] || value
            }}
          />
          <ReferenceLine y={0} stroke="var(--border-color)" strokeWidth={2} />
          <Bar dataKey="inflows" fill={chartColors.revenue} radius={[4, 4, 0, 0]} opacity={0.8} animationDuration={animationConfig.duration} />
          <Bar dataKey="outflows" fill={chartColors.costs} radius={[4, 4, 0, 0]} opacity={0.8} animationDuration={animationConfig.duration} />
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke={chartColors.contract}
            strokeWidth={2.5}
            dot={{ r: 4, fill: chartColors.contract }}
            animationDuration={animationConfig.duration}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Risks */}
      {risks && risks.length > 0 && (
        <div className="cash-flow-chart__risks">
          {risks.map((risk, i) => (
            <div key={i} className={`cash-flow-risk cash-flow-risk--${risk.type}`}>
              <AlertTriangle size={14} />
              <div>
                <strong>{risk.title}</strong>
                <span>{risk.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CashFlowMetric({ label, value, status, icon: Icon }) {
  const statusColors = {
    positive: 'var(--status-success)',
    negative: 'var(--status-danger)',
    warning: 'var(--status-warning)',
    neutral: 'var(--text-secondary)',
  }

  return (
    <div className="cash-flow-metric">
      <div className="cash-flow-metric__header">
        <Icon size={14} style={{ color: statusColors[status] }} />
        <span>{label}</span>
      </div>
      <div className="cash-flow-metric__value" style={{ color: statusColors[status] }}>
        {value}
      </div>
    </div>
  )
}

function CashFlowTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0]?.payload
  if (!data) return null

  return (
    <div style={tooltipStyle.contentStyle}>
      <div style={tooltipStyle.labelStyle}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem' }}>
        <div style={{ color: chartColors.revenue }}>
          Inflows: {formatChartCurrency(data.inflows)} ({data.inflowCount} items)
        </div>
        <div style={{ color: chartColors.costs }}>
          Outflows: {formatChartCurrency(data.outflows)} ({data.outflowCount} items)
        </div>
        <div style={{
          color: data.net >= 0 ? chartColors.revenue : chartColors.loss,
          fontWeight: 600,
          borderTop: '1px solid var(--border-color)',
          paddingTop: '4px',
          marginTop: '2px',
        }}>
          Net: {formatChartCurrency(data.net)}
        </div>
        <div style={{ color: chartColors.contract, fontSize: '0.8rem' }}>
          Running Balance: {formatChartCurrency(data.cumulative)}
        </div>
      </div>
    </div>
  )
}

export { CashFlowMetric }
