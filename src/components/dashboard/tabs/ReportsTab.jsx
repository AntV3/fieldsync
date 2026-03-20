import { Suspense, lazy } from 'react'
import { ClipboardList, Camera, Calendar } from 'lucide-react'
import { TicketSkeleton } from '../../ui'

const DailyReportsList = lazy(() => import('../../DailyReportsList'))
const InjuryReportsList = lazy(() => import('../../InjuryReportsList'))
const PhotoTimeline = lazy(() => import('../../PhotoTimeline'))

export default function ReportsTab({
  selectedProject,
  company,
  user,
  projectData,
  areas,
  onShowToast
}) {
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

      {/* Photo Timeline */}
      <Suspense fallback={<div className="loading-placeholder">Loading photos...</div>}>
        <PhotoTimeline
          projectId={selectedProject?.id}
          projectName={selectedProject?.name}
          areas={areas}
          onShowToast={onShowToast}
        />
      </Suspense>

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
