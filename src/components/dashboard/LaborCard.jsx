import { AlertTriangle } from 'lucide-react'

/**
 * LaborCard - Mini card comparing actual man-days against the plan.
 */
export default function LaborCard({ projectData, selectedProject }) {
  const isOver = projectData?.laborStatus === 'over'
  return (
    <div className={`sdx-card sdx-mini ${isOver ? 'sdx-mini--alert-red' : ''}`}>
      <div className="sdx-mini-head">
        <span className="sdx-label">Labor vs plan</span>
        {isOver && <AlertTriangle size={14} className="sdx-mini-alert-icon red" aria-label="Over labor plan" />}
      </div>
      <div className={`sdx-mini-figure ${isOver ? 'bad sdx-mini-figure--alert' : projectData?.hasLaborData ? 'ok' : ''}`}>
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
