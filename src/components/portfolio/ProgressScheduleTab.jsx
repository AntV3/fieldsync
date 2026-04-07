import { useState, useEffect } from 'react'
import { Target, CheckCircle, AlertTriangle, TrendingUp, Info } from 'lucide-react'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { MetricSkeleton, ChartSkeleton } from '../ui'
import { tooltipStyle } from '../charts/chartConfig'
import {
  getPortfolioProgressSummary,
  getScheduleVarianceByProject,
  getAreaCompletionRates,
} from '../../lib/services/portfolioAnalyticsService'

export default function ProgressScheduleTab({ companyId }) {
  const [summary, setSummary] = useState(null)
  const [variance, setVariance] = useState(null)
  const [rates, setRates] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    Promise.all([
      getPortfolioProgressSummary(companyId),
      getScheduleVarianceByProject(companyId),
      getAreaCompletionRates(companyId),
    ]).then(([s, v, r]) => {
      setSummary(s)
      setVariance(v)
      setRates(r)
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
        </div>
      </div>
    )
  }

  const scatterData = (variance || [])
    .filter(p => p.hasScheduleData)
    .map(p => ({
      ...p,
      x: p.expected,
      y: p.actual,
    }))

  return (
    <div className="pa-tab-content">
      <SectionDescription text="Progress is calculated from weighted area completion across all active projects. Schedule status compares actual progress against expected progress based on each project's start and end dates. Only projects with valid date ranges are included in schedule tracking." />
      <div className="pa-metrics-row">
        <MetricCard
          icon={<Target size={18} />}
          label="Avg Completion"
          value={`${summary?.avgCompletion || 0}%`}
          sub={`${summary?.totalProjects || 0} active projects`}
          accent="blue"
        />
        <MetricCard
          icon={<CheckCircle size={18} />}
          label="On Track"
          value={summary?.onTrack || 0}
          sub={`${summary?.ahead || 0} ahead of schedule`}
          accent="green"
        />
        <MetricCard
          icon={<AlertTriangle size={18} />}
          label="Behind Schedule"
          value={summary?.behind || 0}
          sub={summary?.projectsWithScheduleData != null ? `${summary.projectsWithScheduleData} of ${summary.totalProjects} with schedule data` : 'Projects need attention'}
          accent={summary?.behind > 0 ? 'red' : 'green'}
        />
      </div>

      <div className="pa-charts-grid">
        <div className="pa-chart-card">
          <h3 className="pa-chart-title">Schedule Variance</h3>
          <p className="pa-chart-subtitle">Each dot is a project. Expected progress is based on calendar time between start and end dates. Actual progress is from weighted area completion. Projects above the diagonal line are ahead of schedule, below are behind.</p>
          {scatterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis type="number" dataKey="x" name="Expected %" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} label={{ value: 'Expected Progress %', position: 'bottom', fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis type="number" dataKey="y" name="Actual %" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} label={{ value: 'Actual Progress %', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 12 }} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="var(--text-tertiary)" strokeDasharray="5 5" />
                <Tooltip
                  {...tooltipStyle}
                  content={({ payload }) => {
                    if (!payload?.[0]) return null
                    const d = payload[0].payload
                    return (
                      <div style={tooltipStyle.contentStyle}>
                        <p style={{ ...tooltipStyle.labelStyle, marginBottom: 4 }}>{d.fullName || d.name}</p>
                        <p style={tooltipStyle.itemStyle}>Expected: {d.expected}%</p>
                        <p style={tooltipStyle.itemStyle}>Actual: {d.actual}%</p>
                        <p style={{ ...tooltipStyle.itemStyle, fontWeight: 600, color: d.variance >= 0 ? '#10b981' : '#ef4444' }}>
                          Variance: {d.variance > 0 ? '+' : ''}{d.variance}%
                        </p>
                      </div>
                    )
                  }}
                />
                <Scatter data={scatterData} fill="#3b82f6">
                  {scatterData.map((entry, i) => (
                    <Cell key={i} fill={entry.variance >= 0 ? '#10b981' : entry.variance >= -10 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : <EmptyChart message="No schedule data available" />}
        </div>
      </div>

      {(rates || []).length > 0 && (
        <div className="pa-chart-card pa-chart-card--wide">
          <h3 className="pa-chart-title">Project Completion Ranking</h3>
          <p className="pa-chart-subtitle">Ranks projects by area completion velocity (areas completed per week since project creation). Completion rate is the percentage of total areas marked complete.</p>
          <div className="pa-table-wrapper">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Areas</th>
                  <th>Completed</th>
                  <th>Completion Rate</th>
                  <th>Velocity</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r, i) => (
                  <tr key={i}>
                    <td className="pa-table-name" title={r.fullName}>{r.name}</td>
                    <td>{r.totalAreas}</td>
                    <td>{r.completedAreas}</td>
                    <td>
                      <div className="pa-progress-bar-cell">
                        <div className="pa-progress-bar">
                          <div className="pa-progress-fill" style={{ width: `${r.completionRate}%` }} />
                        </div>
                        <span>{r.completionRate}%</span>
                      </div>
                    </td>
                    <td>{r.velocity} areas/wk</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function SectionDescription({ text }) {
  return (
    <div className="pa-section-description">
      <Info size={14} className="pa-section-description-icon" />
      <p>{text}</p>
    </div>
  )
}

function EmptyChart({ message }) {
  return <div className="pa-empty-chart"><p>{message}</p></div>
}
