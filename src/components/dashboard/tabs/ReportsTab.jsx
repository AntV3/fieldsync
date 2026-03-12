import { Suspense, lazy } from 'react'
import { ClipboardList, Users, Shield, Package, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'
import { TicketSkeleton, CollapsibleSection } from '../../ui'

const DailyReportsList = lazy(() => import('../../DailyReportsList'))
const InjuryReportsList = lazy(() => import('../../InjuryReportsList'))

/**
 * ReportsTab
 *
 * Streamlined field reporting — answers "What's happening on-site?"
 * 1. Crew Analytics + Safety Dashboard (side by side)
 * 2. Material Requests pipeline
 * 3. Daily Reports list
 * 4. Injury Reports list
 */
export default function ReportsTab({
  selectedProject,
  company,
  user,
  projectData,
  areas,
  onShowToast
}) {
  return (
    <div className="pv-tab-panel reports-tab">
      {/* Row 1: Crew + Safety side by side */}
      <div className="reports-two-col">
        {/* Crew Analytics Card */}
        <div className="reports-insight-card">
          <div className="reports-insight-header">
            <div className="reports-insight-title">
              <Users size={18} />
              <h3>Crew Analytics</h3>
            </div>
            <span className="reports-section-count">{projectData?.uniqueWorkerCount || 0} workers</span>
          </div>
          <div className="reports-insight-body">
            <div className="reports-stat-grid">
              <div className="reports-stat">
                <span className="reports-stat-value">{projectData?.uniqueWorkerCount || 0}</span>
                <span className="reports-stat-label">Total Workers</span>
              </div>
              <div className="reports-stat">
                <span className="reports-stat-value">{projectData?.avgCrewSize || 0}</span>
                <span className="reports-stat-label">Avg Crew / Day</span>
              </div>
              <div className="reports-stat">
                <span className="reports-stat-value">{projectData?.peakCrewSize || 0}</span>
                <span className="reports-stat-label">Peak Crew Size</span>
              </div>
              <div className="reports-stat">
                <span className="reports-stat-value">{projectData?.crewDaysTracked || 0}</span>
                <span className="reports-stat-label">Days Tracked</span>
              </div>
            </div>
            {(projectData?.crewTrend || 0) !== 0 && (
              <div className={`reports-trend-badge ${projectData.crewTrend > 0 ? 'up' : 'down'}`}>
                {projectData.crewTrend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{Math.abs(Math.round(projectData.crewTrend))}% {projectData.crewTrend > 0 ? 'increase' : 'decrease'} vs prior week</span>
              </div>
            )}
            {projectData?.crewByDate && Object.keys(projectData.crewByDate).length > 0 && (
              <CollapsibleSection
                title="Crew Size Trend"
                variant="compact"
                summary={`Last ${Math.min(Object.keys(projectData.crewByDate).length, 14)} days`}
              >
                <div className="reports-mini-chart">
                  <div className="reports-mini-chart-label">Recent Crew Size</div>
                  <div className="reports-mini-bars">
                    {Object.keys(projectData.crewByDate).sort().slice(-14).map(date => {
                      const count = projectData.crewByDate[date]
                      const max = projectData.peakCrewSize || 1
                      return (
                        <div key={date} className="reports-mini-bar-wrap" title={`${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${count} workers`}>
                          <div className="reports-mini-bar" style={{ height: `${(count / max) * 100}%` }}></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>

        {/* Safety Dashboard Card */}
        <div className="reports-insight-card">
          <div className="reports-insight-header">
            <div className="reports-insight-title">
              <Shield size={18} />
              <h3>Safety Dashboard</h3>
            </div>
            <span className={`reports-section-badge ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
              {(projectData?.injuryReportsCount || 0) > 0
                ? `${projectData.injuryReportsCount} incident${projectData.injuryReportsCount !== 1 ? 's' : ''}`
                : 'No incidents'
              }
            </span>
          </div>
          <div className="reports-insight-body">
            <div className="reports-safety-hero">
              <div className={`reports-safety-days ${(projectData?.daysSinceLastInjury === null || projectData?.daysSinceLastInjury > 30) ? 'excellent' : projectData?.daysSinceLastInjury > 7 ? 'good' : 'caution'}`}>
                <span className="reports-safety-days-value">
                  {projectData?.daysSinceLastInjury !== null ? projectData.daysSinceLastInjury : '--'}
                </span>
                <span className="reports-safety-days-label">
                  {projectData?.daysSinceLastInjury !== null ? 'Days Since Last Incident' : 'No Incidents Recorded'}
                </span>
              </div>
            </div>
            <CollapsibleSection
              title="Safety Breakdown"
              variant="compact"
              summary={`${projectData?.injuryReportsCount || 0} incidents, ${projectData?.oshaRecordable || 0} OSHA`}
            >
              <div className="reports-stat-grid">
                <div className="reports-stat">
                  <span className="reports-stat-value">{projectData?.injuryReportsCount || 0}</span>
                  <span className="reports-stat-label">Total Incidents</span>
                </div>
                <div className="reports-stat">
                  <span className="reports-stat-value">{projectData?.oshaRecordable || 0}</span>
                  <span className="reports-stat-label">OSHA Recordable</span>
                </div>
                <div className="reports-stat">
                  <span className="reports-stat-value">{projectData?.reportsWithIssues || 0}</span>
                  <span className="reports-stat-label">Reports w/ Issues</span>
                </div>
                <div className="reports-stat">
                  <span className="reports-stat-value">{projectData?.laborManDays || 0}</span>
                  <span className="reports-stat-label">Total Man-Days</span>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>

      {/* Row 2: Material Requests pipeline */}
      {(projectData?.totalMaterialRequests || 0) > 0 && (
        <div className="reports-insight-card">
          <div className="reports-insight-header">
            <div className="reports-insight-title">
              <Package size={18} />
              <h3>Material Requests</h3>
            </div>
            <span className="reports-section-count">{projectData?.totalMaterialRequests || 0} total</span>
          </div>
          <div className="reports-insight-body">
            <div className="reports-material-pipeline">
              {projectData?.urgentMaterialRequests > 0 && (
                <div className="reports-material-status urgent">
                  <AlertTriangle size={14} />
                  <span>{projectData.urgentMaterialRequests} Urgent</span>
                </div>
              )}
              <div className="reports-material-status pending">
                <span className="reports-material-dot"></span>
                <span>{projectData?.pendingMaterialRequests || 0} Pending</span>
              </div>
              <div className="reports-material-status ordered">
                <span className="reports-material-dot"></span>
                <span>{projectData?.orderedMaterialRequests || 0} Ordered</span>
              </div>
              <div className="reports-material-status delivered">
                <CheckCircle2 size={14} />
                <span>{projectData?.deliveredMaterialRequests || 0} Delivered</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Row 3: Daily Reports */}
      <div className="reports-section-card">
        <div className="reports-section-header">
          <div className="reports-section-title">
            <ClipboardList size={18} />
            <h3>Daily Reports</h3>
          </div>
          <span className="reports-section-count">{projectData?.dailyReportsCount || 0} total</span>
        </div>
        <div className="reports-section-content">
          <Suspense fallback={<TicketSkeleton />}>
            <DailyReportsList project={selectedProject} company={company} onShowToast={onShowToast} />
          </Suspense>
        </div>
      </div>

      {/* Row 4: Injury Reports */}
      <div className={`reports-section-card ${(projectData?.injuryReportsCount || 0) > 0 ? 'has-warning' : ''}`}>
        <div className="reports-section-header">
          <div className="reports-section-title">
            <span className={`reports-section-icon ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
              {(projectData?.injuryReportsCount || 0) > 0 ? '\u26A0' : '\u2713'}
            </span>
            <h3>Safety & Injury Reports</h3>
          </div>
          <span className={`reports-section-badge ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
            {(projectData?.injuryReportsCount || 0) > 0
              ? `${projectData.injuryReportsCount} incident${projectData.injuryReportsCount !== 1 ? 's' : ''}`
              : 'No incidents'
            }
          </span>
        </div>
        <div className="reports-section-content">
          <Suspense fallback={<TicketSkeleton />}>
            <InjuryReportsList
              project={selectedProject}
              companyId={company?.id || selectedProject?.company_id}
              company={company}
              user={user}
              onShowToast={onShowToast}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
