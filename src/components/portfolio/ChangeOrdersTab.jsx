import { useState, useEffect } from 'react'
import { FileText, CheckCircle, Clock, TrendingUp } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { MetricSkeleton, ChartSkeleton } from '../ui'
import { formatCurrency } from '../../lib/utils'
import { tooltipStyle, formatChartCurrency } from '../charts/chartConfig'
import {
  getCORSummaryAcrossProjects,
  getCORByProject,
  getCORTrendByMonth,
} from '../../lib/services/portfolioAnalyticsService'

export default function ChangeOrdersTab({ companyId }) {
  const [summary, setSummary] = useState(null)
  const [byProject, setByProject] = useState(null)
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    Promise.all([
      getCORSummaryAcrossProjects(companyId),
      getCORByProject(companyId),
      getCORTrendByMonth(companyId, 12),
    ]).then(([s, p, t]) => {
      setSummary(s)
      setByProject(p)
      setTrend(t)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [companyId])

  if (loading) {
    return (
      <div className="pa-tab-content">
        <div className="pa-metrics-row">
          {[1, 2, 3].map(i => <div key={i} className="pa-metric-card"><MetricSkeleton /></div>)}
        </div>
        <div className="pa-charts-grid">
          <div className="pa-chart-card"><ChartSkeleton /></div>
          <div className="pa-chart-card"><ChartSkeleton /></div>
        </div>
      </div>
    )
  }

  return (
    <div className="pa-tab-content">
      <div className="pa-metrics-row">
        <MetricCard
          icon={<FileText size={18} />}
          label="Total COR Value"
          value={formatCurrency(summary?.totalValue || 0)}
          sub={`${summary?.total || 0} change orders`}
          accent="purple"
        />
        <MetricCard
          icon={<CheckCircle size={18} />}
          label="Approval Rate"
          value={`${summary?.approvalRate || 0}%`}
          sub={`${summary?.approved || 0} approved, ${summary?.pending || 0} pending`}
          accent="green"
        />
        <MetricCard
          icon={<Clock size={18} />}
          label="Avg Processing"
          value={`${summary?.avgProcessingDays || 0} days`}
          sub="Time to approval"
          accent="amber"
        />
      </div>

      <div className="pa-cor-status-row">
        <div className="pa-cor-status pa-cor-status--approved">
          <span className="pa-cor-status-label">Approved</span>
          <span className="pa-cor-status-value">{formatCurrency(summary?.approvedValue || 0)}</span>
          <span className="pa-cor-status-count">{summary?.approved || 0} CORs</span>
        </div>
        <div className="pa-cor-status pa-cor-status--pending">
          <span className="pa-cor-status-label">Pending</span>
          <span className="pa-cor-status-value">{formatCurrency(summary?.pendingValue || 0)}</span>
          <span className="pa-cor-status-count">{summary?.pending || 0} CORs</span>
        </div>
        <div className="pa-cor-status pa-cor-status--rejected">
          <span className="pa-cor-status-label">Rejected</span>
          <span className="pa-cor-status-value">{formatCurrency(summary?.rejectedValue || 0)}</span>
          <span className="pa-cor-status-count">{summary?.rejected || 0} CORs</span>
        </div>
      </div>

      <div className="pa-charts-grid">
        <div className="pa-chart-card">
          <h3 className="pa-chart-title">COR Count by Status per Project</h3>
          {(byProject || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byProject} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="name" angle={-35} textAnchor="end" height={60} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip {...tooltipStyle} />
                <Legend />
                <Bar dataKey="approved" name="Approved" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" name="Pending" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No change order data available" />}
        </div>

        <div className="pa-chart-card">
          <h3 className="pa-chart-title">Monthly COR Trend</h3>
          {(trend || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatChartCurrency} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip {...tooltipStyle} formatter={(value, name) => name === 'Value' ? formatCurrency(value) : value} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="count" name="Count" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="value" name="Value" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No trend data available" />}
        </div>
      </div>
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
  return <div className="pa-empty-chart"><p>{message}</p></div>
}
