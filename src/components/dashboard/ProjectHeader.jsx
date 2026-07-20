import { ArrowLeft, Plus } from 'lucide-react'

/**
 * ProjectHeader - Top of the project detail view.
 * Back button, action buttons (Share / Alerts / Edit / New COR),
 * project name with schedule status pill, and job metadata line.
 */
export default function ProjectHeader({
  project,
  projectData,
  onBack,
  onShare,
  onOpenAlerts,
  onEditClick,
  onCreateCOR
}) {
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
          <button className="pv-action sdx-action-primary" onClick={onCreateCOR}>
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
