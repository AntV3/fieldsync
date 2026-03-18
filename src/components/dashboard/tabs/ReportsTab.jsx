import { Suspense, lazy } from 'react'
import { ClipboardList, Users, Shield, HardHat, TrendingUp, TrendingDown } from 'lucide-react'
import { TicketSkeleton, CollapsibleSection } from '../../ui'

const DailyReportsList = lazy(() => import('../../DailyReportsList'))
const InjuryReportsList = lazy(() => import('../../InjuryReportsList'))

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
      {/* Hero Metrics - High Level Project Pulse */}
      <div className="reports-hero">
        <div className="reports-hero-grid">
          <div className="reports-metric primary">
            <div className="reports-metric-icon">
              <ClipboardList size={24} />
            </div>
            <div className="reports-metric-content">
              <div className="reports-metric-value">{projectData?.dailyReportsCount || 0}</div>
              <div className="reports-metric-label">Daily Reports</div>
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-value">{projectData?.recentDailyReports || 0}</div>
            <div className="reports-metric-label">This Week</div>
            <div className="reports-metric-bar">
              <div
                className="reports-metric-fill"
                style={{ width: `${Math.min((projectData?.recentDailyReports || 0) / 7 * 100, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-icon">
              <HardHat size={24} />
            </div>
            <div className="reports-metric-content">
              <div className="reports-metric-value">{projectData?.completedAreasCount || 0}/{areas.length}</div>
              <div className="reports-metric-label">Areas Complete</div>
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-value">{projectData?.totalPhotosFromTickets || 0}</div>
            <div className="reports-metric-label">Photos Captured</div>
          </div>
        </div>
        {projectData?.lastDailyReport && (
          <div className="reports-hero-footer">
            <span className="reports-last-filed">
              Last report: {new Date(projectData.lastDailyReport).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' '}({Math.floor((new Date() - new Date(projectData.lastDailyReport)) / (1000 * 60 * 60 * 24))}d ago)
            </span>
          </div>
        )}
      </div>

      {/* Two-Column Layout: Crew + Safety */}
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

      {/* Daily Reports Section */}
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

      {/* Injury Reports Section */}
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
