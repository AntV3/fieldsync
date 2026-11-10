import { formatCurrency, getOverallStatus, getOverallStatusLabel } from '../../lib/utils'

// Office to-do chips shown on the card, in pipeline order
const QUEUE_CHIPS = [
  ['readyToApprove', 'to review'],
  ['awaitingSignature', 'awaiting signature'],
  ['readyForCOR', 'ready for COR'],
  ['draftCORs', 'to send'],
  ['withClient', 'with client']
]

export default function EnhancedProjectCard({ project, riskScore, riskStatus, newActivityCount = 0, queueCounts = null, onClick }) {
  const status = getOverallStatus(project.areas || [])
  const statusLabel = getOverallStatusLabel(project.areas || [])
  // NULL (raw row) and 0 (summary RPC) both mean "no contract value"
  const contractValue = Number(project.contract_value) || 0
  const hasContract = contractValue > 0
  const billable = Number(project.billable) || 0
  const progress = Number(project.progress) || 0
  const profit = hasContract ? contractValue - billable : 0
  const isAtRisk = hasContract && billable > contractValue * 0.9 && progress < 90

  // Risk badge colors
  const riskColors = {
    healthy: { bg: 'var(--status-success-bg, #064e3b)', color: 'var(--status-success, #059669)' },
    warning: { bg: 'var(--status-warning-bg, #78350f)', color: 'var(--status-warning, #d97706)' },
    critical: { bg: 'var(--status-danger-bg, #7f1d1d)', color: 'var(--status-danger, #dc2626)' }
  }
  const riskStyle = riskColors[riskStatus] || riskColors.healthy
  const queueChips = queueCounts ? QUEUE_CHIPS.filter(([key]) => queueCounts[key] > 0) : []

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
            <div className="project-card-value">{hasContract ? formatCurrency(contractValue) : 'No contract value'}</div>
          </div>
        </div>
        <div className="project-card-header-right">
          {newActivityCount > 0 && (
            <span
              className="project-card-live-badge"
              title={`${newActivityCount} new field update${newActivityCount !== 1 ? 's' : ''}`}
              aria-label={`${newActivityCount} new field updates`}
            >
              <span className="sdx-live-dot" aria-hidden="true" />
              {newActivityCount}
            </span>
          )}
          <span className={`status-badge ${status}`}>{statusLabel}</span>
        </div>
      </div>
      <div className="project-stats-row">
        <div className="project-stat">
          <span className="stat-value">{progress}%</span>
          <span className="stat-label">Complete</span>
        </div>
        <div className="project-stat">
          <span className="stat-value">{formatCurrency(billable)}</span>
          <span className="stat-label">Billable</span>
        </div>
        <div className="project-stat">
          {hasContract ? (
            <>
              <span className={`stat-value ${profit < 0 ? 'negative' : ''}`}>{formatCurrency(Math.abs(profit))}</span>
              <span className="stat-label">{profit >= 0 ? 'Remaining' : 'Over Budget'}</span>
            </>
          ) : (
            <>
              <span className="stat-value" aria-label="Remaining not available: no contract value">—</span>
              <span className="stat-label">Remaining</span>
            </>
          )}
        </div>
      </div>
      <div className="mini-progress-bar">
        <div className="mini-progress-fill" style={{ width: `${progress}%` }}></div>
      </div>
      {queueChips.length > 0 && (
        <div className="project-queue-chips" aria-label="Needs action">
          {queueChips.map(([key, label]) => (
            <span key={key} className={`project-queue-chip project-queue-chip--${key}`}>
              <strong>{queueCounts[key]}</strong> {label}
            </span>
          ))}
        </div>
      )}
      {!queueCounts && (project.pendingTickets > 0 || project.totalTickets > 0) && (
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
