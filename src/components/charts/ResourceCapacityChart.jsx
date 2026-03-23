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
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            backgroundColor: 'var(--bg-tertiary, rgba(148, 163, 184, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Users size={36} style={{ color: 'var(--text-muted)' }} />
          </div>
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
          accentColor="var(--status-info)"
        />
        <ResourceMetric
          label="Total Crew"
          value={utilization.totalAllocated}
          icon={Users}
          accentColor="var(--status-info)"
        />
        {utilization.totalCrewAvailable && (
          <ResourceMetric
            label="Utilization"
            value={`${utilization.utilizationRate}%`}
            status={utilization.utilizationRate > 90 ? 'warning' : utilization.utilizationRate > 70 ? 'healthy' : 'info'}
            icon={TrendingUp}
            accentColor={utilization.utilizationRate > 90 ? 'var(--status-warning)' : utilization.utilizationRate > 70 ? 'var(--status-success)' : 'var(--status-info)'}
          />
        )}
        <ResourceMetric
          label="Needed"
          value={utilization.totalNeeded}
          status={utilization.totalNeeded > utilization.totalAllocated ? 'warning' : 'healthy'}
          icon={UserPlus}
          accentColor={utilization.totalNeeded > utilization.totalAllocated ? 'var(--status-warning)' : 'var(--status-success)'}
        />
      </div>

      {/* Project allocation bars */}
      {allocation.projects.length > 0 && (
        <div className="resource-capacity__allocation">
          <h4 className="resource-capacity__section-title">
            <span style={{
              display: 'inline-block',
              width: 3,
              height: 16,
              backgroundColor: 'var(--status-info)',
              borderRadius: 2,
              marginRight: 8,
              verticalAlign: 'middle',
            }} />
            Current Allocation
          </h4>
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
          <h4 className="resource-capacity__section-title">
            <span style={{
              display: 'inline-block',
              width: 3,
              height: 16,
              backgroundColor: 'var(--status-warning)',
              borderRadius: 2,
              marginRight: 8,
              verticalAlign: 'middle',
            }} />
            4-Week Demand Forecast
          </h4>
          <ResponsiveContainer width="100%" height={200}>
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
          <h4 className="resource-capacity__section-title" style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 3,
              height: 16,
              backgroundColor: 'var(--status-danger)',
              borderRadius: 2,
              marginRight: 8,
              verticalAlign: 'middle',
            }} />
            Conflicts
          </h4>
          {conflicts.slice(0, 3).map((conflict, i) => (
            <div key={i} className={`resource-conflict resource-conflict--${conflict.type}`}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: conflict.type === 'critical'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(245, 158, 11, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <AlertTriangle size={14} style={{
                  color: conflict.type === 'critical'
                    ? 'var(--status-danger)'
                    : 'var(--status-warning)',
                }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>{conflict.title}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{conflict.description}</span>
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

  const utilizationPct = needed > 0 ? Math.round((current / needed) * 100) : 100

  return (
    <div className="allocation-bar" style={{
      padding: '10px 12px',
      borderRadius: 8,
      transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
      cursor: 'default',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'var(--bg-tertiary, rgba(148, 163, 184, 0.06))'
      e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.06)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent'
      e.currentTarget.style.boxShadow = 'none'
    }}
    >
      <div className="allocation-bar__header">
        <span className="allocation-bar__name" title={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: statusColors[utilizationStatus],
            display: 'inline-block',
            flexShrink: 0,
          }} />
          {name}
        </span>
        <span className="allocation-bar__values" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: statusColors[utilizationStatus], fontWeight: 600 }}>{current}</span>
          <span style={{ color: 'var(--text-muted)' }}> / {needed} needed</span>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            lineHeight: 1,
            padding: '2px 6px',
            borderRadius: 9999,
            backgroundColor: utilizationStatus === 'balanced'
              ? 'rgba(34, 197, 94, 0.1)'
              : utilizationStatus === 'over'
                ? 'rgba(245, 158, 11, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
            color: statusColors[utilizationStatus],
          }}>
            {utilizationPct}%
          </span>
        </span>
      </div>
      <div className="allocation-bar__track" style={{ height: 8, borderRadius: 4 }}>
        <div
          className="allocation-bar__fill allocation-bar__fill--current"
          style={{
            width: `${Math.min(100, currentPct)}%`,
            backgroundColor: statusColors[utilizationStatus],
            height: 8,
            borderRadius: 4,
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

function ResourceMetric({ label, value, status, icon: Icon, accentColor }) {
  const statusColors = {
    healthy: 'var(--status-success)',
    warning: 'var(--status-warning)',
    info: 'var(--status-info)',
  }

  const iconColor = statusColors[status] || accentColor || 'var(--text-secondary)'
  const borderColor = accentColor || statusColors[status] || 'var(--border-color)'

  return (
    <div className="resource-metric" style={{
      borderLeft: `3px solid ${borderColor}`,
      paddingLeft: 10,
    }}>
      <div className="resource-metric__header">
        <span style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          backgroundColor: accentColor
            ? `color-mix(in srgb, ${accentColor} 12%, transparent)`
            : 'var(--bg-tertiary, rgba(148, 163, 184, 0.1))',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={13} style={{ color: iconColor }} />
        </span>
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

  const bgColors = {
    healthy: 'rgba(34, 197, 94, 0.12)',
    warning: 'rgba(245, 158, 11, 0.12)',
    critical: 'rgba(239, 68, 68, 0.12)',
  }

  return (
    <span className="resource-status-badge" style={{
      color: colors[status],
      backgroundColor: bgColors[status] || 'rgba(148, 163, 184, 0.1)',
      borderColor: colors[status],
      fontWeight: 600,
      padding: '3px 10px',
      borderRadius: 9999,
    }}>
      {label}
    </span>
  )
}

export { AllocationBar, ResourceMetric }
