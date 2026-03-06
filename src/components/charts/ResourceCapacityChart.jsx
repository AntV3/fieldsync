import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'
import { Users, AlertTriangle, TrendingUp, TrendingDown, UserPlus, Minus } from 'lucide-react'
import { chartColors, tooltipStyle, animationConfig } from './chartConfig'

/**
 * ResourceCapacityChart
 *
 * Visualizes resource allocation across projects with
 * utilization indicators and capacity forecasting.
 */
export default function ResourceCapacityChart({ resourceData, className = '' }) {
  if (!resourceData) {
    return (
      <div className={`resource-capacity ${className}`}>
        <div className="chart-empty-state">
          <p>Resource Data Unavailable</p>
          <span>Need active projects with crew data</span>
        </div>
      </div>
    )
  }

  const { allocation, utilization, demandForecast, conflicts, summary } = resourceData

  return (
    <div className={`resource-capacity ${className}`}>
      <div className="chart-header">
        <div className="chart-title-section">
          <h3>Resource Capacity</h3>
          <StatusBadge status={summary.status} label={summary.label} />
        </div>
      </div>

      {/* Summary metrics */}
      <div className="resource-capacity__metrics">
        <ResourceMetric
          label="Active Projects"
          value={summary.activeProjects}
          icon={Users}
        />
        <ResourceMetric
          label="Total Crew"
          value={utilization.totalAllocated}
          icon={Users}
        />
        {utilization.totalCrewAvailable && (
          <ResourceMetric
            label="Utilization"
            value={`${utilization.utilizationRate}%`}
            status={utilization.utilizationRate > 90 ? 'warning' : utilization.utilizationRate > 70 ? 'healthy' : 'info'}
            icon={TrendingUp}
          />
        )}
        <ResourceMetric
          label="Needed"
          value={utilization.totalNeeded}
          status={utilization.totalNeeded > utilization.totalAllocated ? 'warning' : 'healthy'}
          icon={UserPlus}
        />
      </div>

      {/* Project allocation bars */}
      {allocation.projects.length > 0 && (
        <div className="resource-capacity__allocation">
          <h4 className="resource-capacity__section-title">Current Allocation</h4>
          <div className="resource-capacity__projects">
            {allocation.projects.slice(0, 8).map(project => (
              <AllocationBar
                key={project.projectId}
                name={project.projectName}
                current={project.currentCrew}
                needed={project.estimatedNeed}
                progress={project.progress}
                status={project.status}
              />
            ))}
          </div>
        </div>
      )}

      {/* Demand forecast chart */}
      {demandForecast && demandForecast.length > 0 && (
        <div className="resource-capacity__forecast">
          <h4 className="resource-capacity__section-title">4-Week Demand Forecast</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={demandForecast} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.5} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: chartColors.text }} tickLine={false} />
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                labelStyle={tooltipStyle.labelStyle}
                formatter={(val) => [`${val} crew`, 'Demand']}
              />
              {utilization.totalCrewAvailable && (
                <ReferenceLine
                  y={utilization.totalCrewAvailable}
                  stroke={chartColors.loss}
                  strokeDasharray="6 4"
                  label={{ value: 'Capacity', position: 'right', fill: chartColors.loss, fontSize: 11 }}
                />
              )}
              <Bar dataKey="totalDemand" radius={[4, 4, 0, 0]} animationDuration={animationConfig.duration}>
                {demandForecast.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      utilization.totalCrewAvailable && entry.totalDemand > utilization.totalCrewAvailable
                        ? chartColors.loss
                        : chartColors.labor
                    }
                    opacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Conflicts */}
      {conflicts && conflicts.length > 0 && (
        <div className="resource-capacity__conflicts">
          {conflicts.slice(0, 3).map((conflict, i) => (
            <div key={i} className={`resource-conflict resource-conflict--${conflict.type}`}>
              <AlertTriangle size={14} />
              <div>
                <strong>{conflict.title}</strong>
                <span>{conflict.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AllocationBar({ name, current, needed, progress, status }) {
  const maxVal = Math.max(current, needed, 1)
  const currentPct = (current / maxVal) * 100
  const neededPct = (needed / maxVal) * 100

  const utilizationStatus = needed > 0
    ? current >= needed * 0.7 && current <= needed * 1.3
      ? 'balanced'
      : current > needed * 1.3
        ? 'over'
        : 'under'
    : 'balanced'

  const statusColors = {
    balanced: 'var(--status-success)',
    over: 'var(--status-warning)',
    under: 'var(--status-danger)',
  }

  return (
    <div className="allocation-bar">
      <div className="allocation-bar__header">
        <span className="allocation-bar__name" title={name}>
          {name.length > 25 ? name.slice(0, 25) + '...' : name}
        </span>
        <span className="allocation-bar__values">
          <span style={{ color: statusColors[utilizationStatus], fontWeight: 600 }}>{current}</span>
          <span style={{ color: 'var(--text-muted)' }}> / {needed} needed</span>
        </span>
      </div>
      <div className="allocation-bar__track">
        <div
          className="allocation-bar__fill allocation-bar__fill--current"
          style={{
            width: `${Math.min(100, currentPct)}%`,
            backgroundColor: statusColors[utilizationStatus],
          }}
        />
        {needed > 0 && (
          <div
            className="allocation-bar__marker"
            style={{ left: `${Math.min(100, neededPct)}%` }}
            title={`Need: ${needed}`}
          />
        )}
      </div>
      <div className="allocation-bar__footer">
        <span className="allocation-bar__phase">{status}</span>
        <span className="allocation-bar__progress">{progress}% complete</span>
      </div>
    </div>
  )
}

function ResourceMetric({ label, value, status, icon: Icon }) {
  const statusColors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    info: 'var(--status-info)',
  }

  return (
    <div className="resource-metric">
      <div className="resource-metric__header">
        <Icon size={14} style={{ color: statusColors[status] || 'var(--text-secondary)' }} />
        <span>{label}</span>
      </div>
      <div className="resource-metric__value">{value}</div>
    </div>
  )
}

function StatusBadge({ status, label }) {
  const colors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-danger)',
  }

  return (
    <span className="resource-status-badge" style={{ color: colors[status], borderColor: colors[status] }}>
      {label}
    </span>
  )
}

export { AllocationBar, ResourceMetric }
