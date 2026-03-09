import { Suspense, lazy } from 'react'
import { ClipboardList, Users, Package, HardHat, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'
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

      {/* Two-Column Layout: Crew Analytics + Material Requests (paired) */}
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

        {/* Material Requests Card (now paired with Crew Analytics) */}
        <div className="reports-insight-card">
          <div className="reports-insight-header">
            <div className="reports-insight-title">
              <Package size={18} />
              <h3>Material Requests</h3>
            </div>
            <span className="reports-section-count">{projectData?.totalMaterialRequests || 0} total</span>
          </div>
          <div className="reports-insight-body">
            {(projectData?.totalMaterialRequests || 0) === 0 ? (
              <div className="reports-empty-state">
                <Package size={32} />
                <p>No material requests yet</p>
                <span>Requests from the field will appear here</span>
              </div>
            ) : (
              <>
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
                <CollapsibleSection
                  title="Recent Requests"
                  variant="compact"
                  badge={`${(projectData?.materialRequests || []).length}`}
                >
                  <div className="reports-recent-list">
                    {(projectData?.materialRequests || []).slice(0, 3).map(req => (
                      <div key={req.id} className={`reports-recent-item ${req.status}`}>
                        <div className="reports-recent-item-main">
                          <span className={`reports-recent-item-status ${req.status}`}>{req.status}</span>
                          <span className="reports-recent-item-date">
                            {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="reports-recent-item-detail">
                          {(req.items || []).slice(0, 2).map((item, i) => (
                            <span key={i}>{item.name}{item.quantity ? ` (${item.quantity})` : ''}</span>
                          ))}
                          {(req.items || []).length > 2 && (
                            <span className="reports-recent-more">+{(req.items || []).length - 2} more</span>
                          )}
                        </div>
                        {req.priority === 'urgent' && (
                          <span className="reports-urgent-tag">URGENT</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Daily Reports Section (collapsible) */}
      <CollapsibleSection
        title="Daily Reports"
        defaultOpen={true}
        badge={`${projectData?.dailyReportsCount || 0}`}
        variant="card"
      >
        <div className="reports-section-content">
          <Suspense fallback={<TicketSkeleton />}>
            <DailyReportsList project={selectedProject} company={company} onShowToast={onShowToast} />
          </Suspense>
        </div>
      </CollapsibleSection>

      {/* Safety & Injury Reports Section (collapsible, with safety stat in header) */}
      <CollapsibleSection
        title="Safety & Injury Reports"
        defaultOpen={true}
        badge={
          (projectData?.injuryReportsCount || 0) > 0
            ? `${projectData.injuryReportsCount} incident${projectData.injuryReportsCount !== 1 ? 's' : ''}`
            : 'No incidents'
        }
        variant="card"
        summary={
          projectData?.daysSinceLastInjury !== null
            ? `${projectData.daysSinceLastInjury} days since last incident`
            : 'No incidents recorded'
        }
      >
        {/* Safety stats inline */}
        <div className="reports-safety-inline">
          <div className={`reports-safety-days-compact ${(projectData?.daysSinceLastInjury === null || projectData?.daysSinceLastInjury > 30) ? 'excellent' : projectData?.daysSinceLastInjury > 7 ? 'good' : 'caution'}`}>
            <span className="reports-safety-days-value">
              {projectData?.daysSinceLastInjury !== null ? projectData.daysSinceLastInjury : '--'}
            </span>
            <span className="reports-safety-days-label">
              {projectData?.daysSinceLastInjury !== null ? 'Days Safe' : 'No Incidents'}
            </span>
          </div>
          <div className="reports-safety-stats-row">
            <span className="reports-safety-stat">{projectData?.injuryReportsCount || 0} total</span>
            <span className="reports-safety-stat">{projectData?.oshaRecordable || 0} OSHA</span>
            <span className="reports-safety-stat">{projectData?.laborManDays || 0} man-days</span>
          </div>
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
      </CollapsibleSection>
    </div>
  )
}
