/**
 * LaborCard - Mini card comparing actual man-days against the plan.
 */
export default function LaborCard({ projectData, selectedProject }) {
  return (
    <div className="sdx-card sdx-mini">
      <span className="sdx-label">Labor vs plan</span>
      <div className={`sdx-mini-figure ${projectData?.laborStatus === 'over' ? 'bad' : projectData?.hasLaborData ? 'ok' : ''}`}>
        {projectData?.hasLaborData
          ? `${projectData.laborVariance > 0 ? '+' : ''}${projectData.laborVariance}%`
          : '—'}
      </div>
      <div className="sdx-mini-sub">
        {projectData?.hasLaborData
          ? `${projectData.actualManDays || 0} of ${selectedProject?.planned_man_days || '—'} man-days`
          : `${projectData?.actualManDays || 0} man-days logged`}
      </div>
    </div>
  )
}
