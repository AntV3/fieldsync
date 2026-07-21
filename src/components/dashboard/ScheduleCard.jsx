import { AlertTriangle } from 'lucide-react'

/**
 * ScheduleCard - Mini card showing schedule variance vs. baseline
 * and the planned finish date when schedule dates are set.
 */
export default function ScheduleCard({ projectData, selectedProject }) {
  const isBehind = projectData?.scheduleStatus === 'behind'
  return (
    <div className={`sdx-card sdx-mini ${isBehind ? 'sdx-mini--alert-amber' : ''}`}>
      <div className="sdx-mini-head">
        <span className="sdx-label">Schedule</span>
        {isBehind && <AlertTriangle size={14} className="sdx-mini-alert-icon amber" aria-label="Behind schedule" />}
      </div>
      <div className={`sdx-mini-figure ${isBehind ? 'bad sdx-mini-figure--alert' : projectData?.scheduleStatus === 'ahead' ? 'ok' : ''}`}>
        {projectData?.hasScheduleData
          ? `${projectData.scheduleVariance > 0 ? '+' : ''}${projectData.scheduleVariance}%`
          : '—'}
      </div>
      <div className="sdx-mini-sub">
        {projectData?.hasScheduleData
          ? `vs. baseline${selectedProject?.end_date ? ` · finish ${new Date(selectedProject.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
          : 'No schedule dates set'}
      </div>
    </div>
  )
}
