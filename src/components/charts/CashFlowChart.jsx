import React, { useMemo } from 'react'
import {
  Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Line, Legend
} from 'recharts'
import { DollarSign, ArrowDownCircle, ArrowUpCircle, AlertTriangle, TrendingUp, Banknote, Wallet } from 'lucide-react'
import { chartColors, formatChartCurrency, tooltipStyle, animationConfig } from './chartConfig'

/**
 * CashFlowChart
 *
 * Visualizes cash flow projections with inflows (receivables)
 * vs outflows (payables) and cumulative balance.
 */
export default function CashFlowChart({ cashFlow, className = '' }) {
  const monthlyForecast = useMemo(() => cashFlow?.monthlyForecast || [], [cashFlow])
  const trendDirection = useMemo(() => {
    if (monthlyForecast.length < 2) return 'stable'
    const lastNet = monthlyForecast[monthlyForecast.length - 1]?.net ?? 0
    const prevNet = monthlyForecast[monthlyForecast.length - 2]?.net ?? 0
    if (lastNet > prevNet) return 'improving'
    if (lastNet < prevNet) return 'declining'
    return 'stable'
  }, [monthlyForecast])

  if (!cashFlow || monthlyForecast.length === 0) {
    return (
      <div className={`cash-flow-chart ${className}`}>
        <div className="chart-empty-state">
          <Banknote size={32} className="chart-empty-state__icon" />
          <p>Cash Flow Projection Unavailable</p>
          <span>Need active projects with financial data</span>
        </div>
      </div>
    )
  }

  const { metrics, risks, receivables } = cashFlow

  return (
    <div className={`cash-flow-chart ${className}`}>
      <div className="chart-header">
        <div className="chart-title-section">
          <h3>Cash Flow Projection</h3>
          <span className="chart-subtitle">
            {monthlyForecast.length}-month outlook
            <span className={`cash-flow-chart__trend-indicator cash-flow-chart__trend-indicator--${trendDirection}`}>
              <TrendingUp size={12} />
              {trendDirection === 'improving' ? 'Improving' : trendDirection === 'declining' ? 'Declining' : 'Stable'}
            </span>
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
          <div className="cash-flow-chart__receivable-card">
            <Wallet size={14} className="cash-flow-chart__receivable-icon" />
            <div className="cash-flow-chart__receivable-content">
              <span className="cash-flow-chart__receivable-label">Outstanding</span>
              <strong className="cash-flow-chart__receivable-value">{formatChartCurrency(receivables.totalOutstanding)}</strong>
            </div>
          </div>
          <div className="cash-flow-chart__receivable-divider" />
          <div className="cash-flow-chart__receivable-card">
            <Wallet size={14} className="cash-flow-chart__receivable-icon" />
            <div className="cash-flow-chart__receivable-content">
              <span className="cash-flow-chart__receivable-label">Unbilled</span>
              <strong className="cash-flow-chart__receivable-value">{formatChartCurrency(receivables.totalUnbilled)}</strong>
            </div>
          </div>
          {receivables.overdueAmount > 0 && (
            <>
              <div className="cash-flow-chart__receivable-divider" />
              <div className="cash-flow-chart__receivable-card cash-flow-chart__receivable-card--overdue">
                <AlertTriangle size={14} className="cash-flow-chart__receivable-icon cash-flow-chart__receivable-icon--overdue" />
                <div className="cash-flow-chart__receivable-content">
                  <span className="cash-flow-chart__receivable-label">Overdue</span>
                  <strong className="cash-flow-chart__receivable-value">{formatChartCurrency(receivables.overdueAmount)}</strong>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={320}>
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
          <Bar dataKey="inflows" fill={chartColors.revenue} radius={[6, 6, 0, 0]} opacity={0.8} animationDuration={animationConfig.duration} />
          <Bar dataKey="outflows" fill={chartColors.costs} radius={[6, 6, 0, 0]} opacity={0.8} animationDuration={animationConfig.duration} />
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
              <div className="cash-flow-risk__icon-wrapper">
                <AlertTriangle size={14} />
              </div>
              <div className="cash-flow-risk__body">
                <strong className="cash-flow-risk__title">{risk.title}</strong>
                <span className="cash-flow-risk__description">{risk.description}</span>
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
    <div className={`cash-flow-metric cash-flow-metric--${status}`}>
      <div className="cash-flow-metric__header">
        <div className="cash-flow-metric__icon-bg" style={{ backgroundColor: statusColors[status] }}>
          <Icon size={14} />
        </div>
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

  const netPositive = data.net >= 0
  const netBarPercent = Math.min(Math.abs(data.net) / (Math.max(Math.abs(data.inflows), Math.abs(data.outflows)) || 1) * 100, 100)

  return (
    <div className="cashflow-tooltip">
      <div className="cashflow-tooltip__label">{label}</div>
      <div className="cashflow-tooltip__rows">
        <div className="cashflow-tooltip__row cashflow-tooltip__row--inflows">
          <span className="cashflow-tooltip__row-dot" />
          <span className="cashflow-tooltip__row-label">Inflows</span>
          <span className="cashflow-tooltip__row-value">{formatChartCurrency(data.inflows)}</span>
          <span className="cashflow-tooltip__row-count">({data.inflowCount} items)</span>
        </div>
        <div className="cashflow-tooltip__row cashflow-tooltip__row--outflows">
          <span className="cashflow-tooltip__row-dot" />
          <span className="cashflow-tooltip__row-label">Outflows</span>
          <span className="cashflow-tooltip__row-value">{formatChartCurrency(data.outflows)}</span>
          <span className="cashflow-tooltip__row-count">({data.outflowCount} items)</span>
        </div>
        <div className="cashflow-tooltip__divider" />
        <div className={`cashflow-tooltip__net ${netPositive ? 'cashflow-tooltip__net--positive' : 'cashflow-tooltip__net--negative'}`}>
          <span className="cashflow-tooltip__net-label">Net</span>
          <span className="cashflow-tooltip__net-value">{formatChartCurrency(data.net)}</span>
        </div>
        <div className="cashflow-tooltip__net-bar">
          <div
            className={`cashflow-tooltip__net-bar-fill ${netPositive ? 'cashflow-tooltip__net-bar-fill--positive' : 'cashflow-tooltip__net-bar-fill--negative'}`}
            style={{ width: `${netBarPercent}%` }}
          />
        </div>
        <div className="cashflow-tooltip__balance">
          Running Balance: {formatChartCurrency(data.cumulative)}
        </div>
      </div>
    </div>
  )
}

export { CashFlowMetric }
