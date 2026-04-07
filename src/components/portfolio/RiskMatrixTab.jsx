import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react'
import { MetricSkeleton, ChartSkeleton } from '../ui'
import { getPortfolioRiskMatrix } from '../../lib/services/portfolioAnalyticsService'

const HEALTH_LABELS = { green: 'Healthy', yellow: 'Watch', red: 'At Risk' }
const HEALTH_ICONS = {
  green: <CheckCircle size={14} />,
  yellow: <AlertTriangle size={14} />,
  red: <XCircle size={14} />,
}

export default function RiskMatrixTab({ companyId }) {
  const [matrix, setMatrix] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    getPortfolioRiskMatrix(companyId)
      .then(setMatrix)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [companyId])

  if (loading) {
    return (
      <div className="pa-tab-content">
        <div className="pa-metrics-row">
          {[1, 2, 3].map(i => <div key={i} className="pa-metric-card"><MetricSkeleton /></div>)}
        </div>
        <div className="pa-chart-card"><ChartSkeleton /></div>
      </div>
    )
  }

  const data = matrix || []
  const redCount = data.filter(p => p.budgetHealth === 'red' || p.scheduleHealth === 'red').length
  const greenCount = data.filter(p => p.budgetHealth === 'green' && p.scheduleHealth === 'green').length
  const yellowCount = data.length - redCount - greenCount

  // Build grid cells for the risk matrix
  const gridCells = []
  const scheduleStatuses = ['red', 'yellow', 'green']
  const budgetStatuses = ['green', 'yellow', 'red']

  for (const sched of scheduleStatuses) {
    for (const budget of budgetStatuses) {
      const projects = data.filter(p => p.budgetHealth === budget && p.scheduleHealth === sched)
      gridCells.push({ budget, schedule: sched, projects })
    }
  }

  // Generate recommendations for at-risk projects
  const atRiskProjects = data.filter(p => p.budgetHealth === 'red' || p.scheduleHealth === 'red')
  const recommendations = atRiskProjects.map(p => {
    const issues = []
    if (p.scheduleHealth === 'red' && p.scheduleVariance !== null) issues.push(`${Math.abs(p.scheduleVariance)}% behind schedule`)
    if (p.budgetHealth === 'red') issues.push(`cost at ${p.costRatio}% of budget`)
    return {
      name: p.fullName || p.name,
      issues,
      action: p.scheduleHealth === 'red' && p.budgetHealth === 'red'
        ? 'Schedule urgent project review meeting'
        : p.scheduleHealth === 'red'
        ? 'Review schedule and consider acceleration'
        : 'Review cost controls and change orders',
    }
  })

  return (
    <div className="pa-tab-content">
      <SectionDescription text="Risk assessment combines budget health and schedule health for each active project. Budget health compares T&M costs against total budget (contract value + approved CORs) — green under 70%, yellow under 90%, red at 90%+. Schedule health compares actual weighted area completion against expected time-based progress — green within 5%, yellow within 15%, red beyond 15% behind. Projects without start/end dates are excluded from schedule assessment." />
      <div className="pa-metrics-row">
        <MetricCard
          icon={<CheckCircle size={18} />}
          label="Healthy"
          value={Math.max(0, greenCount)}
          sub="All metrics on track"
          accent="green"
        />
        <MetricCard
          icon={<AlertTriangle size={18} />}
          label="Watch"
          value={Math.max(0, yellowCount)}
          sub="Minor concerns"
          accent="amber"
        />
        <MetricCard
          icon={<Shield size={18} />}
          label="At Risk"
          value={redCount}
          sub="Needs immediate attention"
          accent="red"
        />
      </div>

      <div className="pa-chart-card pa-chart-card--wide">
        <h3 className="pa-chart-title">Risk Matrix — Budget vs Schedule Health</h3>
        <p className="pa-chart-subtitle">Projects are placed in the grid based on their budget health (x-axis) and schedule health (y-axis). Projects in the bottom-left are healthy; top-right indicates highest risk.</p>
        <div className="pa-risk-matrix">
          <div className="pa-risk-matrix-ylabel">Schedule Health</div>
          <div className="pa-risk-matrix-grid">
            <div className="pa-risk-matrix-ylabels">
              <span className="pa-risk-label pa-risk-label--red">Behind</span>
              <span className="pa-risk-label pa-risk-label--yellow">Watch</span>
              <span className="pa-risk-label pa-risk-label--green">Good</span>
            </div>
            <div className="pa-risk-matrix-cells">
              {gridCells.map((cell, i) => {
                const severity = cell.budget === 'red' || cell.schedule === 'red' ? 'red'
                  : cell.budget === 'yellow' || cell.schedule === 'yellow' ? 'yellow' : 'green'
                return (
                  <div key={i} className={`pa-risk-cell pa-risk-cell--${severity}`}>
                    {cell.projects.length > 0 ? (
                      cell.projects.map((p, j) => (
                        <div key={j} className="pa-risk-project" title={p.fullName}>
                          {p.name}
                        </div>
                      ))
                    ) : (
                      <span className="pa-risk-empty">—</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="pa-risk-matrix-xlabels">
              <span className="pa-risk-label pa-risk-label--green">Good</span>
              <span className="pa-risk-label pa-risk-label--yellow">Watch</span>
              <span className="pa-risk-label pa-risk-label--red">Over</span>
            </div>
          </div>
          <div className="pa-risk-matrix-xlabel">Budget Health</div>
        </div>
      </div>

      {data.length > 0 && (
        <div className="pa-chart-card pa-chart-card--wide">
          <h3 className="pa-chart-title">Project Health Scores</h3>
          <p className="pa-chart-subtitle">Health score (2-6) combines budget and schedule ratings. Cost ratio is T&M costs as a percentage of total budget. Sorted by lowest health score first to surface projects needing attention.</p>
          <div className="pa-table-wrapper">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Budget</th>
                  <th>Schedule</th>
                  <th>Progress</th>
                  <th>Cost Ratio</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, i) => (
                  <tr key={i}>
                    <td className="pa-table-name" title={p.fullName}>{p.name}</td>
                    <td><span className={`pa-health-badge pa-health-badge--${p.budgetHealth}`}>{HEALTH_ICONS[p.budgetHealth]} {HEALTH_LABELS[p.budgetHealth]}</span></td>
                    <td>
                      {p.hasScheduleData
                        ? <span className={`pa-health-badge pa-health-badge--${p.scheduleHealth}`}>{HEALTH_ICONS[p.scheduleHealth]} {HEALTH_LABELS[p.scheduleHealth]}</span>
                        : <span className="pa-health-badge" style={{ color: 'var(--text-tertiary)' }}>No dates set</span>
                      }
                    </td>
                    <td>{Math.round(p.progress)}%</td>
                    <td>{p.costRatio}%</td>
                    <td><span className={`pa-score pa-score--${p.healthScore >= 5 ? 'good' : p.healthScore >= 3 ? 'mid' : 'bad'}`}>{p.healthScore}/6</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="pa-chart-card pa-chart-card--wide">
          <h3 className="pa-chart-title">Recommended Actions</h3>
          <p className="pa-chart-subtitle">Auto-generated action items for projects flagged as at-risk in either budget or schedule health.</p>
          <div className="pa-recommendations">
            {recommendations.map((r, i) => (
              <div key={i} className="pa-recommendation">
                <div className="pa-recommendation-header">
                  <AlertTriangle size={16} className="pa-recommendation-icon" />
                  <strong>{r.name}</strong>
                </div>
                <div className="pa-recommendation-issues">
                  {r.issues.map((issue, j) => <span key={j} className="pa-recommendation-issue">{issue}</span>)}
                </div>
                <div className="pa-recommendation-action">{r.action}</div>
              </div>
            ))}
          </div>
        </div>
      )}
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
