/**
 * ScheduleCard - Mini card showing schedule variance vs. baseline
 * and the planned finish date when schedule dates are set.
 */
export default function ScheduleCard({ projectData, selectedProject }) {
  return (
    <div className="sdx-card sdx-mini">
      <span className="sdx-label">Schedule</span>
      <div className={`sdx-mini-figure ${projectData?.scheduleStatus === 'behind' ? 'bad' : projectData?.scheduleStatus === 'ahead' ? 'ok' : ''}`}>
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
