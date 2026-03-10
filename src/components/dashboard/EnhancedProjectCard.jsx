import { formatCurrency, getOverallStatus, getOverallStatusLabel } from '../../lib/utils'

export default function EnhancedProjectCard({ project, riskScore, riskStatus, onClick }) {
  const status = getOverallStatus(project.areas || [])
  const statusLabel = getOverallStatusLabel(project.areas || [])
  const profit = project.contract_value - project.billable
  const isAtRisk = project.billable > project.contract_value * 0.9 && project.progress < 90

  // Risk badge colors
  const riskColors = {
    healthy: { bg: 'var(--status-success-bg, #064e3b)', color: 'var(--status-success, #059669)' },
    warning: { bg: 'var(--status-warning-bg, #78350f)', color: 'var(--status-warning, #d97706)' },
    critical: { bg: 'var(--status-danger-bg, #7f1d1d)', color: 'var(--status-danger, #dc2626)' }
  }
  const riskStyle = riskColors[riskStatus] || riskColors.healthy

  return (
    <div className={`project-card enhanced ${isAtRisk ? 'at-risk' : ''}`} onClick={onClick}>
      <div className="project-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {typeof riskScore === 'number' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', fontSize: '0.75rem', fontWeight: 700, background: riskStyle.bg, color: riskStyle.color }} title={`Risk Score: ${riskScore}`} aria-label={`Risk score ${riskScore}, ${riskStatus}`}>
              {riskScore}
            </span>
          )}
          <div>
            <div className="project-card-name">{project.name}</div>
            <div className="project-card-value">{formatCurrency(project.contract_value)}</div>
          </div>
        </div>
        <span className={`status-badge ${status}`}>{statusLabel}</span>
      </div>
      <div className="project-stats-row">
        <div className="project-stat">
          <span className="stat-value">{project.progress}%</span>
          <span className="stat-label">Complete</span>
        </div>
        <div className="project-stat">
          <span className="stat-value">{formatCurrency(project.billable)}</span>
          <span className="stat-label">Billable</span>
        </div>
        <div className="project-stat">
          <span className={`stat-value ${profit < 0 ? 'negative' : ''}`}>{formatCurrency(Math.abs(profit))}</span>
          <span className="stat-label">{profit >= 0 ? 'Remaining' : 'Over Budget'}</span>
        </div>
      </div>
      <div className="mini-progress-bar">
        <div className="mini-progress-fill" style={{ width: `${project.progress}%` }}></div>
      </div>
      {(project.pendingTickets > 0 || project.totalTickets > 0) && (
        <div className="project-badges">
          {project.pendingTickets > 0 && <span className="badge pending">{project.pendingTickets} Pending</span>}
          {project.approvedTickets > 0 && <span className="badge approved">{project.approvedTickets} Approved</span>}
        </div>
      )}
      {project.hasScheduleData && (
        <div className="project-schedule-badge">
          <span className={`schedule-indicator ${project.scheduleStatus}`}>{project.scheduleLabel}</span>
          {project.hasLaborData && project.laborLabel && (
            <span className={`labor-indicator ${project.laborStatus}`}>{project.laborLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
