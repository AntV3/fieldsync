import { ArrowLeft, Plus, Zap } from 'lucide-react'

/**
 * ProjectHeader - Top of the project detail view.
 * Back button, action buttons (Share / Alerts / Edit / Quick actions / New COR),
 * project name with schedule status pill, and job metadata line.
 * "Quick actions" opens the office quick-actions sheet and carries its badge
 * (tickets ready to approve, or a dot when something else is waiting). On
 * phones both it and "New COR" give way to the floating quick-actions button
 * (OfficeQuickActions). T&M tickets and daily reports are field entries and
 * are reached from that sheet's footer, not from here.
 */
export default function ProjectHeader({
  project,
  projectData,
  onBack,
  onShare,
  onOpenAlerts,
  onEditClick,
  onCreateCOR,
  onOpenQuickActions,
  quickActionsBadge = null
}) {
  const badgeLabel = typeof quickActionsBadge === 'number'
    ? `Quick actions, ${quickActionsBadge} ticket${quickActionsBadge === 1 ? '' : 's'} to review`
    : quickActionsBadge === 'dot'
      ? 'Quick actions, items waiting'
      : 'Quick actions'

  return (
    <>
      {/* Top Row - Back + Actions */}
      <div className="pv-header-row">
        <button className="pv-back" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="pv-actions">
          <button className="pv-action" onClick={onShare}>Share</button>
          <button className="pv-action" onClick={onOpenAlerts}>Alerts</button>
          <button className="pv-action" onClick={onEditClick}>Edit</button>
          {onOpenQuickActions && (
            <button
              className="pv-action sdx-action-secondary pv-action-quick oqa-header-btn"
              onClick={onOpenQuickActions}
              aria-label={badgeLabel}
              aria-haspopup="dialog"
            >
              <Zap size={14} aria-hidden="true" />
              Quick actions
              {quickActionsBadge !== null && (
                <span className={`oqa-header-badge ${quickActionsBadge === 'dot' ? 'oqa-header-badge--dot' : ''}`} aria-hidden="true">
                  {quickActionsBadge === 'dot' ? '' : quickActionsBadge > 99 ? '99+' : quickActionsBadge}
                </span>
              )}
            </button>
          )}
          <button className="pv-action sdx-action-primary pv-action-quick" onClick={onCreateCOR}>
            <Plus size={14} aria-hidden="true" />
            New COR
          </button>
        </div>
      </div>

      {/* Project Title */}
      <div className="pv-header-title sdx-header-title">
        <div className="sdx-title-row">
          <h1>{project.name}</h1>
          {projectData?.hasScheduleData && (
            <span className={`sdx-status-pill ${projectData.scheduleStatus}`}>
              <span className="sdx-status-dot" aria-hidden="true" />
              {projectData.scheduleStatus === 'behind'
                ? `${Math.abs(projectData.scheduleVariance)}% behind`
                : projectData.scheduleStatus === 'ahead'
                  ? `${Math.abs(projectData.scheduleVariance)}% ahead`
                  : 'On track'}
            </span>
          )}
        </div>
        {(project.job_number || project.work_type || project.general_contractor) && (
          <span className="pv-header-meta sdx-header-meta">
            {[
              project.job_number && `JOB #${project.job_number}`,
              project.work_type,
              project.general_contractor && `GC: ${project.general_contractor}`
            ].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </>
  )
}
