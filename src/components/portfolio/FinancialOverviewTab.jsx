import { useState, useEffect } from 'react'
import { DollarSign, TrendingUp, Percent, Briefcase } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { MetricSkeleton, ChartSkeleton } from '../ui'
import { formatCurrency } from '../../lib/utils'
import { chartColors, tooltipStyle, formatChartCurrency } from '../charts/chartConfig'
import {
  getPortfolioFinancialSummary,
  getProjectFinancialComparison,
  getMonthlyRevenueTimeline,
} from '../../lib/services/portfolioAnalyticsService'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

export default function FinancialOverviewTab({ companyId }) {
  const [summary, setSummary] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    Promise.all([
      getPortfolioFinancialSummary(companyId),
      getProjectFinancialComparison(companyId),
      getMonthlyRevenueTimeline(companyId, 12),
    ]).then(([s, c, t]) => {
      setSummary(s)
      setComparison(c)
      setTimeline(t)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [companyId])

  if (loading) {
    return (
      <div className="pa-tab-content">
        <div className="pa-metrics-row">
          {[1, 2, 3, 4].map(i => <div key={i} className="pa-metric-card"><MetricSkeleton /></div>)}
        </div>
        <div className="pa-charts-grid">
          <div className="pa-chart-card"><ChartSkeleton /></div>
          <div className="pa-chart-card"><ChartSkeleton /></div>
        </div>
      </div>
    )
  }

  const pieData = (comparison || []).map((p, i) => ({
    name: p.name,
    value: p.earned,
    color: PIE_COLORS[i % PIE_COLORS.length],
  })).filter(p => p.value > 0)

  return (
    <div className="pa-tab-content">
      <div className="pa-metrics-row">
        <MetricCard
          icon={<Briefcase size={18} />}
          label="Total Portfolio Value"
          value={formatCurrency(summary?.totalContractValue || 0)}
          sub={`${summary?.projectCount || 0} active projects`}
          accent="blue"
        />
        <MetricCard
          icon={<DollarSign size={18} />}
          label="Total Earned"
          value={formatCurrency(summary?.totalEarned || 0)}
          sub={`${summary?.totalContractValue ? Math.round((summary.totalEarned / summary.totalContractValue) * 100) : 0}% of contract`}
          accent="green"
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label="Total Revenue"
          value={formatCurrency(summary?.totalRevenue || 0)}
          sub={`Incl. ${formatCurrency(summary?.totalCORApproved || 0)} CORs`}
          accent="teal"
        />
        <MetricCard
          icon={<Percent size={18} />}
          label="Portfolio Margin"
          value={`${summary?.margin || 0}%`}
          sub={`Profit: ${formatCurrency(summary?.totalProfit || 0)}`}
          accent={summary?.margin >= 0 ? 'green' : 'red'}
        />
      </div>

      <div className="pa-charts-grid">
        <div className="pa-chart-card">
          <h3 className="pa-chart-title">Earned vs Budget by Project</h3>
          {(comparison || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparison} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" height={60} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis tickFormatter={formatChartCurrency} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value) => formatCurrency(value)}
                />
                <Legend />
                <Bar dataKey="budget" name="Budget" fill={chartColors.contract} radius={[4, 4, 0, 0]} />
                <Bar dataKey="earned" name="Earned" fill={chartColors.revenue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No project data available" />}
        </div>

        <div className="pa-chart-card">
          <h3 className="pa-chart-title">Monthly Revenue Timeline</h3>
          {(timeline || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeline} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis tickFormatter={formatChartCurrency} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke={chartColors.revenue} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No revenue data available" />}
        </div>
      </div>

      {pieData.length > 0 && (
        <div className="pa-chart-card pa-chart-card--wide">
          <h3 className="pa-chart-title">Revenue Distribution by Project</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} formatter={(value) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, sub, accent = 'blue' }) {
  return (
    <div className={`pa-metric-card pa-metric-card--${accent}`}>
      <div className="pa-metric-icon">{icon}</div>
      <div className="pa-metric-label">{label}</div>
      <div className="pa-metric-value">{value}</div>
      {sub && <div className="pa-metric-sub">{sub}</div>}
    </div>
  )
}

function EmptyChart({ message }) {
  return (
    <div className="pa-empty-chart">
      <p>{message}</p>
    </div>
  )
}
