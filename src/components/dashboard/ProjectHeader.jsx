import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, X, FileText, ClipboardList, FilePlus2 } from 'lucide-react'

/**
 * ProjectHeader - Top of the project detail view.
 * Back button, action buttons (Share / Alerts / Edit / quick-create trio),
 * project name with schedule status pill, and job metadata line.
 * On mobile the three create actions collapse into a floating action
 * button with a speed dial.
 */
export default function ProjectHeader({
  project,
  projectData,
  onBack,
  onShare,
  onOpenAlerts,
  onEditClick,
  onCreateCOR,
  onCreateTMTicket,
  onCreateDailyReport
}) {
  const [fabOpen, setFabOpen] = useState(false)
  const fabRef = useRef(null)

  // Close the speed dial when tapping anywhere else
  useEffect(() => {
    if (!fabOpen) return
    const handlePointerDown = (e) => {
      if (fabRef.current && !fabRef.current.contains(e.target)) setFabOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [fabOpen])

  const fireFabAction = (action) => {
    setFabOpen(false)
    action?.()
  }

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
          <button className="pv-action sdx-action-secondary pv-action-quick" onClick={onCreateTMTicket}>
            <Plus size={14} aria-hidden="true" />
            T&amp;M Ticket
          </button>
          <button className="pv-action sdx-action-secondary pv-action-quick" onClick={onCreateDailyReport}>
            <Plus size={14} aria-hidden="true" />
            Daily Report
          </button>
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

      {/* Mobile FAB + speed dial (replaces the quick-create buttons above) */}
      <div className="pv-fab-wrap" ref={fabRef}>
        {fabOpen && (
          <div className="pv-fab-dial" role="menu" aria-label="Create new item">
            <button className="pv-fab-option" role="menuitem" onClick={() => fireFabAction(onCreateCOR)}>
              <span className="pv-fab-option-label">New COR</span>
              <span className="pv-fab-option-icon"><FilePlus2 size={18} /></span>
            </button>
            <button className="pv-fab-option" role="menuitem" onClick={() => fireFabAction(onCreateTMTicket)}>
              <span className="pv-fab-option-label">T&amp;M Ticket</span>
              <span className="pv-fab-option-icon"><ClipboardList size={18} /></span>
            </button>
            <button className="pv-fab-option" role="menuitem" onClick={() => fireFabAction(onCreateDailyReport)}>
              <span className="pv-fab-option-label">Daily Report</span>
              <span className="pv-fab-option-icon"><FileText size={18} /></span>
            </button>
          </div>
        )}
        <button
          className={`pv-fab ${fabOpen ? 'open' : ''}`}
          onClick={() => setFabOpen(prev => !prev)}
          aria-expanded={fabOpen}
          aria-haspopup="menu"
          aria-label={fabOpen ? 'Close create menu' : 'Create new item'}
        >
          {fabOpen ? <X size={22} /> : <Plus size={22} />}
        </button>
      </div>
    </>
  )
}
