import { Suspense, lazy } from 'react'
import { ClipboardList, Camera, Calendar, Truck, NotebookPen } from 'lucide-react'
import { formatCurrency } from '../../../lib/utils'
import { TicketSkeleton } from '../../ui'
import { useTradeConfig } from '../../../lib/TradeConfigContext'

const DailyReportsList = lazy(() => import('../../DailyReportsList'))
const InjuryReportsList = lazy(() => import('../../InjuryReportsList'))
const PhotoTimeline = lazy(() => import('../../PhotoTimeline'))
const FieldObservationsList = lazy(() => import('../../FieldObservationsList'))

export default function ReportsTab({
  selectedProject,
  company,
  user,
  projectData,
  areas,
  onShowToast
}) {
  const { resolvedConfig } = useTradeConfig()
  const truckLoadTrackingEnabled = resolvedConfig?.enable_truck_load_tracking ?? false

  const daysAgo = projectData?.lastDailyReport
    ? Math.floor((new Date() - new Date(projectData.lastDailyReport)) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="pv-tab-panel reports-tab">
      {/* Hero Metrics */}
      <div className="reports-hero">
        <div className="reports-hero-grid">
          <div className="reports-metric primary">
            <div className="reports-metric-icon">
              <ClipboardList size={20} />
            </div>
            <div className="reports-metric-content">
              <div className="reports-metric-value">{projectData?.dailyReportsCount || 0}</div>
              <div className="reports-metric-label">Total Reports</div>
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-icon-sm">
              <Calendar size={16} />
            </div>
            <div className="reports-metric-value">{projectData?.recentDailyReports || 0}</div>
            <div className="reports-metric-label">This Week</div>
            <div className="reports-metric-bar">
              <div
                className="reports-metric-fill"
                style={{ width: `${Math.min((projectData?.recentDailyReports || 0) / 7 * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="reports-metric">
            <div className="reports-metric-icon-sm">
              <Camera size={16} />
            </div>
            <div className="reports-metric-value">{projectData?.totalPhotosFromTickets || 0}</div>
            <div className="reports-metric-label">Photos Captured</div>
          </div>
        </div>
        {projectData?.lastDailyReport && (
          <div className="reports-hero-footer">
            <span className="reports-last-filed">
              Last report: {new Date(projectData.lastDailyReport).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' '}({daysAgo}d ago)
            </span>
          </div>
        )}
      </div>

      {/* Daily Reports */}
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

      {/* Field Observations (foreman-logged photos + notes, exportable as PDF) */}
      <div className="reports-section-card">
        <div className="reports-section-header">
          <div className="reports-section-title">
            <NotebookPen size={18} />
            <h3>Field Observations</h3>
          </div>
        </div>
        <div className="reports-section-content">
          <Suspense fallback={<TicketSkeleton />}>
            <FieldObservationsList
              project={selectedProject}
              company={company}
              onShowToast={onShowToast}
            />
          </Suspense>
        </div>
      </div>

      {/* Photo Timeline */}
      <Suspense fallback={<div className="loading-placeholder">Loading photos...</div>}>
        <PhotoTimeline
          projectId={selectedProject?.id}
          projectName={selectedProject?.name}
          project={selectedProject}
          company={company}
          areas={areas}
          onShowToast={onShowToast}
        />
      </Suspense>

      {/* Disposal Trends (only when truck load tracking is enabled) */}
      {truckLoadTrackingEnabled && (
        <div className="reports-section-card">
          <div className="reports-section-header">
            <div className="reports-section-title">
              <Truck size={18} />
              <h3>Disposal Trends</h3>
            </div>
            <span className="reports-section-count">{projectData?.disposalTotalLoads || 0} loads</span>
          </div>
          <div className="reports-section-content">
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
      )}

      {/* Safety & Injury Reports */}
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
              ? `${projectData?.injuryReportsCount || 0} incident${projectData?.injuryReportsCount !== 1 ? 's' : ''}`
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
