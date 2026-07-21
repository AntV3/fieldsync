import { ShieldCheck } from 'lucide-react'

/**
 * SafetyCard - KPI card showing days since the last incident and
 * total/recent injury report counts.
 */
export default function SafetyCard({ projectData }) {
  return (
    <div className="sdx-card sdx-kpi">
      <div className="sdx-kpi-head">
        <span className="sdx-label">Safety</span>
        <ShieldCheck size={15} className={projectData?.recentInjuryCount > 0 ? 'sdx-icon-warn' : 'sdx-icon-ok'} aria-hidden="true" />
      </div>
      <div className="sdx-kpi-figure-row">
        <span className={`sdx-kpi-figure ${projectData?.recentInjuryCount > 0 ? '' : 'ok'}`}>
          {projectData?.daysSinceLastInjury ?? '—'}
        </span>
        <span className="sdx-kpi-unit">
          {projectData?.daysSinceLastInjury != null ? 'days incident-free' : 'no incidents recorded'}
        </span>
      </div>
      <div className="sdx-kpi-sub">
        {projectData?.injuryReportsCount || 0} report{(projectData?.injuryReportsCount || 0) !== 1 ? 's' : ''} total
        {projectData?.recentInjuryCount > 0 && ` · ${projectData.recentInjuryCount} in last 30 days`}
      </div>
    </div>
  )
}
