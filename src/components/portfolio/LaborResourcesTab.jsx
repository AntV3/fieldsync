import { useState, useEffect } from 'react'
import { Users, Clock, Activity, Hammer } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { MetricSkeleton, ChartSkeleton } from '../ui'
import { formatCurrency } from '../../lib/utils'
import { tooltipStyle } from '../charts/chartConfig'
import {
  getPortfolioLaborSummary,
  getCrewDistribution,
  getLaborCostByProject,
} from '../../lib/services/portfolioAnalyticsService'

export default function LaborResourcesTab({ companyId }) {
  const [summary, setSummary] = useState(null)
  const [distribution, setDistribution] = useState(null)
  const [laborCost, setLaborCost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    Promise.all([
      getPortfolioLaborSummary(companyId),
      getCrewDistribution(companyId),
      getLaborCostByProject(companyId),
    ]).then(([s, d, l]) => {
      setSummary(s)
      setDistribution(d)
      setLaborCost(l)
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

  return (
    <div className="pa-tab-content">
      <div className="pa-metrics-row">
        <MetricCard
          icon={<Users size={18} />}
          label="Crew Today"
          value={summary?.totalCrewToday || 0}
          sub="Workers on site"
          accent="blue"
        />
        <MetricCard
          icon={<Activity size={18} />}
          label="Avg Crew (30d)"
          value={summary?.avgCrewLast30Days || 0}
          sub={`7-day avg: ${summary?.avgCrewLast7Days || 0}`}
          accent="teal"
        />
        <MetricCard
          icon={<Clock size={18} />}
          label="Total Man-Days"
          value={summary?.totalManDays || 0}
          sub="Last 30 days"
          accent="purple"
        />
        <MetricCard
          icon={<Hammer size={18} />}
          label="Utilization"
          value={`${summary?.utilization || 0}%`}
          sub="Labor capacity used"
          accent={summary?.utilization >= 70 ? 'green' : 'amber'}
        />
      </div>

      <div className="pa-charts-grid">
        <div className="pa-chart-card">
          <h3 className="pa-chart-title">Crew Distribution by Project</h3>
          {(distribution || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.min(600, Math.max(250, distribution.length * 50))}>
              <BarChart data={distribution} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip {...tooltipStyle} />
                <Legend />
                <Bar dataKey="today" name="Today" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="avg7Days" name="7-Day Avg" fill="#10b981" radius={[0, 4, 4, 0]} />
                <Bar dataKey="avg30Days" name="30-Day Avg" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No crew data available" />}
        </div>

        <div className="pa-chart-card">
          <h3 className="pa-chart-title">Labor Cost by Project</h3>
          {(laborCost || []).filter(l => l.laborCost > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.min(600, Math.max(250, laborCost.length * 50))}>
              <BarChart data={laborCost.filter(l => l.laborCost > 0)} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <Tooltip {...tooltipStyle} formatter={v => formatCurrency(v)} />
                <Bar dataKey="laborCost" name="Labor Cost" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No labor cost data available" />}
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
