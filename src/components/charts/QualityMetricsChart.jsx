import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import {
  Shield, AlertTriangle, CheckCircle2, Clock, Target, TrendingUp, TrendingDown
} from 'lucide-react'
import { chartColors, formatChartCurrency, tooltipStyle } from './chartConfig'

/**
 * QualityMetricsChart
 *
 * Displays quality metrics including defect rates, rework costs,
 * first-time quality, and resolution performance.
 */
export default function QualityMetricsChart({ quality, className = '' }) {
  if (!quality) {
    return (
      <div className={`quality-metrics ${className}`}>
        <div className="chart-empty-state">
          <p>Quality Metrics Unavailable</p>
          <span>Need punch list data to calculate quality metrics</span>
        </div>
      </div>
    )
  }

  const { score, defects, rework, firstTimeQuality, resolution, trend, insights } = quality

  return (
    <div className={`quality-metrics ${className}`}>
      <div className="chart-header">
        <div className="chart-title-section">
          <h3>Quality Metrics</h3>
          <QualityScoreBadge score={score} />
        </div>
      </div>

      {/* Score components grid */}
      <div className="quality-metrics__scores">
        <ScoreComponent
          label="Defect Rate"
          score={score.components.defects}
          detail={`${defects.defectRate}% (benchmark: ${defects.defectRateBenchmark}%)`}
          icon={AlertTriangle}
        />
        <ScoreComponent
          label="Rework Cost"
          score={score.components.rework}
          detail={`${rework.reworkRatio}% of costs`}
          icon={Target}
        />
        <ScoreComponent
          label="First-Time Quality"
          score={score.components.firstTimeQuality}
          detail={firstTimeQuality.rate !== null ? `${firstTimeQuality.rate}%` : 'N/A'}
          icon={CheckCircle2}
        />
        <ScoreComponent
          label="Resolution Speed"
          score={score.components.resolution}
          detail={resolution.avgDays !== null ? `${resolution.avgDays} days avg` : 'N/A'}
          icon={Clock}
        />
      </div>

      {/* Defect summary */}
      <div className="quality-metrics__defects">
        <div className="quality-metrics__defect-summary">
          <div className="quality-defect-stat">
            <span className="quality-defect-stat__value quality-defect-stat__value--open">{defects.open}</span>
            <span className="quality-defect-stat__label">Open</span>
          </div>
          <div className="quality-defect-stat">
            <span className="quality-defect-stat__value quality-defect-stat__value--closed">{defects.closed}</span>
            <span className="quality-defect-stat__label">Closed</span>
          </div>
          <div className="quality-defect-stat">
            <span className="quality-defect-stat__value">{defects.closeRate}%</span>
            <span className="quality-defect-stat__label">Close Rate</span>
          </div>
          <div className="quality-defect-stat">
            <span className="quality-defect-stat__value">{defects.defectFreeRate}%</span>
            <span className="quality-defect-stat__label">Defect-Free Areas</span>
          </div>
        </div>

        {/* Priority breakdown */}
        {defects.total > 0 && (
          <div className="quality-metrics__priority">
            <PriorityBar label="Critical/High" count={defects.byPriority.critical} total={defects.total} color={chartColors.loss} />
            <PriorityBar label="Medium" count={defects.byPriority.medium} total={defects.total} color={chartColors.costs} />
            <PriorityBar label="Low" count={defects.byPriority.low} total={defects.total} color={chartColors.revenue} />
          </div>
        )}
      </div>

      {/* Rework cost card */}
      {rework.estimatedTotal > 0 && (
        <div className={`quality-metrics__rework quality-metrics__rework--${rework.status}`}>
          <div className="quality-rework__header">
            <Target size={16} />
            <span>Estimated Rework Cost</span>
          </div>
          <div className="quality-rework__values">
            <div>
              <span className="quality-rework__label">Total Estimated</span>
              <span className="quality-rework__value">{formatChartCurrency(rework.estimatedTotal)}</span>
            </div>
            <div>
              <span className="quality-rework__label">Outstanding</span>
              <span className="quality-rework__value">{formatChartCurrency(rework.outstandingCost)}</span>
            </div>
            <div>
              <span className="quality-rework__label">% of Costs</span>
              <span className="quality-rework__value">{rework.reworkRatio}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Resolution performance */}
      {resolution.totalResolved > 0 && (
        <div className="quality-metrics__resolution">
          <h4 className="quality-metrics__section-title">Resolution Performance</h4>
          <div className="quality-resolution__bars">
            <ResolutionBar label="Same Day" count={resolution.distribution.sameDay} total={resolution.totalResolved} color={chartColors.revenue} />
            <ResolutionBar label="1-3 Days" count={resolution.distribution.within3Days} total={resolution.totalResolved} color={chartColors.contract} />
            <ResolutionBar label="4-7 Days" count={resolution.distribution.within7Days} total={resolution.totalResolved} color={chartColors.costs} />
            <ResolutionBar label=">7 Days" count={resolution.distribution.over7Days} total={resolution.totalResolved} color={chartColors.loss} />
          </div>
        </div>
      )}

      {/* Quality trend chart */}
      {trend.periods.length > 3 && (
        <div className="quality-metrics__trend">
          <h4 className="quality-metrics__section-title">
            Quality Trend
            <TrendLabel trend={trend.trend} />
          </h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={trend.periods} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartColors.text }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: chartColors.text }} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} />
              <Bar dataKey="opened" fill={chartColors.loss} opacity={0.7} name="Opened" radius={[2, 2, 0, 0]} />
              <Bar dataKey="closed" fill={chartColors.revenue} opacity={0.7} name="Closed" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insights */}
      {insights && insights.length > 0 && (
        <div className="quality-metrics__insights">
          {insights.slice(0, 3).map((insight, i) => (
            <div key={i} className={`quality-insight quality-insight--${insight.type}`}>
              {insight.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <div>
                <strong>{insight.title}</strong>
                <span>{insight.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QualityScoreBadge({ score }) {
  const colors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-danger)',
  }

  return (
    <div className="quality-score-badge" style={{ color: colors[score.status], borderColor: colors[score.status] }}>
      <Shield size={14} />
      <span>{score.score}/100</span>
      <span className="quality-score-badge__label">{score.label}</span>
    </div>
  )
}

function ScoreComponent({ label, score, detail, icon: Icon }) {
  const getColor = (s) => {
    if (s >= 80) return 'var(--status-success)'
    if (s >= 60) return 'var(--status-warning)'
    return 'var(--status-danger)'
  }

  return (
    <div className="quality-score-component">
      <div className="quality-score-component__header">
        <Icon size={14} style={{ color: getColor(score) }} />
        <span>{label}</span>
      </div>
      <div className="quality-score-component__bar">
        <div
          className="quality-score-component__fill"
          style={{ width: `${score}%`, backgroundColor: getColor(score) }}
        />
      </div>
      <div className="quality-score-component__detail">{detail}</div>
    </div>
  )
}

function PriorityBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="quality-priority-bar">
      <span className="quality-priority-bar__label">{label}</span>
      <div className="quality-priority-bar__track">
        <div className="quality-priority-bar__fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="quality-priority-bar__count">{count}</span>
    </div>
  )
}

function ResolutionBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="quality-resolution-bar">
      <span className="quality-resolution-bar__label">{label}</span>
      <div className="quality-resolution-bar__track">
        <div className="quality-resolution-bar__fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="quality-resolution-bar__count">{count} ({pct.toFixed(0)}%)</span>
    </div>
  )
}

function TrendLabel({ trend }) {
  if (trend === 'improving') return <span style={{ color: 'var(--status-success)', fontSize: '0.8rem', marginLeft: '8px' }}><TrendingUp size={12} style={{ verticalAlign: 'middle' }} /> Improving</span>
  if (trend === 'declining') return <span style={{ color: 'var(--status-danger)', fontSize: '0.8rem', marginLeft: '8px' }}><TrendingDown size={12} style={{ verticalAlign: 'middle' }} /> Declining</span>
  return null
}

export { QualityScoreBadge, ScoreComponent }
