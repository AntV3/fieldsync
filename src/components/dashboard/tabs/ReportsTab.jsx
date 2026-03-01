import { Suspense, lazy } from 'react'
import { ClipboardList, Users, Shield, Package, Truck, FileText, Camera, HardHat, DollarSign, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '../../../lib/utils'
import { TicketSkeleton } from '../../ui'

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
            <div className="reports-metric-value">{projectData?.totalTickets || 0}</div>
            <div className="reports-metric-label">Time & Material</div>
            {(projectData?.pendingTickets || 0) > 0 && (
              <div className="reports-metric-status" style={{ background: '#fef3c7', color: '#92400e' }}>
                {projectData.pendingTickets} pending
              </div>
            )}
          </div>
          <div className="reports-metric">
            <div className="reports-metric-value">{projectData?.totalPhotosFromTickets || 0}</div>
            <div className="reports-metric-label">Photos Captured</div>
          </div>
        </div>
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
          </div>
        </div>
      </div>

      {/* Material Requests + Disposal Summary Row */}
      <div className="reports-two-col">
        {/* Material Requests */}
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
              </>
            )}
          </div>
        </div>

        {/* Disposal Trends */}
        <div className="reports-insight-card">
          <div className="reports-insight-header">
            <div className="reports-insight-title">
              <Truck size={18} />
              <h3>Disposal Trends</h3>
            </div>
            <span className="reports-section-count">{projectData?.disposalTotalLoads || 0} loads</span>
          </div>
          <div className="reports-insight-body">
            {(projectData?.weeklyDisposal || []).length === 0 ? (
              <div className="reports-empty-state">
                <Truck size={32} />
                <p>No disposal data yet</p>
                <span>Disposal loads from the field will appear here</span>
              </div>
            ) : (
              <>
                <div className="reports-disposal-chart">
                  <div className="reports-disposal-bars">
                    {(projectData?.weeklyDisposal || []).map((week, i) => {
                      const total = (week.concrete || 0) + (week.trash || 0) + (week.metals || 0) + (week.hazardous_waste || 0)
                      const maxWeek = Math.max(...(projectData?.weeklyDisposal || []).map(w => (w.concrete || 0) + (w.trash || 0) + (w.metals || 0) + (w.hazardous_waste || 0))) || 1
                      return (
                        <div key={i} className="reports-disposal-bar-col">
                          <div className="reports-disposal-bar-stack" style={{ height: `${(total / maxWeek) * 100}%` }}>
                            {week.concrete > 0 && <div className="reports-disposal-seg concrete" style={{ flex: week.concrete }} title={`Concrete: ${week.concrete}`}></div>}
                            {week.trash > 0 && <div className="reports-disposal-seg trash" style={{ flex: week.trash }} title={`Trash: ${week.trash}`}></div>}
                            {week.metals > 0 && <div className="reports-disposal-seg metals" style={{ flex: week.metals }} title={`Metals: ${week.metals}`}></div>}
                            {week.hazardous_waste > 0 && <div className="reports-disposal-seg hazardous" style={{ flex: week.hazardous_waste }} title={`Hazardous: ${week.hazardous_waste}`}></div>}
                          </div>
                          <span className="reports-disposal-bar-label">
                            {new Date(week.week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="reports-disposal-legend">
                    <span className="reports-disposal-legend-item"><span className="reports-disposal-dot concrete"></span>Concrete</span>
                    <span className="reports-disposal-legend-item"><span className="reports-disposal-dot trash"></span>Trash</span>
                    <span className="reports-disposal-legend-item"><span className="reports-disposal-dot metals"></span>Metals</span>
                    <span className="reports-disposal-legend-item"><span className="reports-disposal-dot hazardous"></span>Hazardous</span>
                  </div>
                </div>
                {(projectData?.haulOffCost || 0) > 0 && (
                  <div className="reports-disposal-cost">
                    <span>Total Disposal Cost</span>
                    <strong>{formatCurrency(projectData.haulOffCost)}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Field Activity Summary */}
      <div className="reports-insight-card reports-activity-summary">
        <div className="reports-insight-header">
          <div className="reports-insight-title">
            <ClipboardList size={18} />
            <h3>Field Activity Summary</h3>
          </div>
          <div className="reports-activity-badges">
            {projectData?.lastDailyReport && (
              <span className="reports-last-filed">
                Last report: {new Date(projectData.lastDailyReport).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' '}({Math.floor((new Date() - new Date(projectData.lastDailyReport)) / (1000 * 60 * 60 * 24))}d ago)
              </span>
            )}
          </div>
        </div>
        <div className="reports-insight-body">
          <div className="reports-activity-grid">
            <div className="reports-activity-stat">
              <div className="reports-activity-stat-icon"><ClipboardList size={16} /></div>
              <div className="reports-activity-stat-info">
                <strong>{projectData?.dailyReportsCount || 0}</strong>
                <span>Daily Reports Filed</span>
              </div>
            </div>
            <div className="reports-activity-stat">
              <div className="reports-activity-stat-icon"><FileText size={16} /></div>
              <div className="reports-activity-stat-info">
                <strong>{projectData?.totalTickets || 0}</strong>
                <span>Time & Material Tickets</span>
              </div>
            </div>
            <div className="reports-activity-stat">
              <div className="reports-activity-stat-icon"><Camera size={16} /></div>
              <div className="reports-activity-stat-info">
                <strong>{projectData?.totalPhotosFromTickets || 0}</strong>
                <span>Photos Documented</span>
              </div>
            </div>
            <div className="reports-activity-stat">
              <div className="reports-activity-stat-icon"><HardHat size={16} /></div>
              <div className="reports-activity-stat-info">
                <strong>{projectData?.completedAreasCount || 0}/{areas.length}</strong>
                <span>Work Areas Complete</span>
              </div>
            </div>
            <div className="reports-activity-stat">
              <div className="reports-activity-stat-icon"><DollarSign size={16} /></div>
              <div className="reports-activity-stat-info">
                <strong>{formatCurrency(projectData?.allCostsTotal || 0)}</strong>
                <span>Total Costs Tracked</span>
              </div>
            </div>
            <div className="reports-activity-stat">
              <div className="reports-activity-stat-icon"><Users size={16} /></div>
              <div className="reports-activity-stat-info">
                <strong>{projectData?.laborManDays || 0}</strong>
                <span>Total Man-Days</span>
              </div>
            </div>
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
