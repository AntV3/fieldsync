import { Search, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import UniversalSearch from '../UniversalSearch'
import { SmartAlerts } from './SmartAlerts'
import EnhancedProjectCard from './EnhancedProjectCard'

export default function PortfolioView({
  projects,
  projectsData,
  portfolioMetrics,
  projectHealth,
  scheduleMetrics,
  riskAnalysis,
  isSearchOpen,
  setSearchOpen,
  closeSearch,
  company,
  onSelectProject,
  onAlertAction,
  onShowToast,
  onSelectTicket,
  onSelectCOR,
}) {
  // Destructure portfolioMetrics
  const {
    totalOriginalContract,
    totalChangeOrders,
    totalPortfolioValue,
    totalEarned,
    _totalRemaining,
    weightedCompletion,
    totalPendingCORValue,
    totalPendingCORCount,
    backlog,
    _totalCosts,
    totalProfit,
    grossMargin,
    hasCostData,
    _totalBilled,
    _unbilledRevenue,
    totalExposure,
    atRiskExposure,
    overBudgetExposure,
  } = portfolioMetrics

  // Destructure projectHealth
  const {
    projectsComplete,
    projectsOnTrack,
    projectsAtRisk,
    projectsOverBudget,
    projectsWithChangeOrders,
  } = projectHealth

  // Destructure scheduleMetrics
  const {
    scheduleAhead,
    scheduleOnTrack,
    scheduleBehind,
    laborOver,
    laborUnder,
    laborOnTrack,
    hasAnyScheduleData,
    hasAnyLaborData,
    behindScheduleExposure,
  } = scheduleMetrics

  return (
    <div>
      {/* Business Overview - High Level Portfolio Health */}
      <div className="business-overview">
        <div className="bo-header">
          <h2 className="bo-title">Portfolio Overview</h2>
          <button className="search-trigger-btn" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>Search</span>
            <span className="shortcut">⌘K</span>
          </button>
          <div className="bo-project-count">{projects.length} Active Project{projects.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Hero Financial Metrics */}
        <div className="bo-financial">
          {/* Portfolio Value Hero */}
          <div className="bo-hero-row">
            <div className="bo-hero-metric">
              <span className="bo-hero-value">{formatCurrency(totalPortfolioValue)}</span>
              <span className="bo-hero-label">Total Portfolio Value</span>
              {totalChangeOrders > 0 && (
                <span className="bo-hero-detail">
                  {formatCurrency(totalOriginalContract)} + {formatCurrency(totalChangeOrders)} COs
                  <span className="bo-hero-detail-count">({projectsWithChangeOrders} project{projectsWithChangeOrders !== 1 ? 's' : ''})</span>
                </span>
              )}
            </div>
          </div>

          {/* Completion Progress */}
          <div className="bo-completion">
            <div className="bo-completion-header">
              <span className="bo-completion-pct">{weightedCompletion}%</span>
              <span className="bo-completion-label">earned</span>
              <span className="bo-completion-amounts">{formatCurrency(totalEarned)} of {formatCurrency(totalPortfolioValue)}</span>
            </div>
            <div className="bo-progress-bar">
              <div
                className="bo-progress-fill"
                style={{ width: `${Math.min(weightedCompletion, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="bo-metrics-grid">
            <div className="bo-kpi backlog">
              <span className="bo-kpi-value">{formatCurrency(backlog)}</span>
              <span className="bo-kpi-label">Backlog</span>
              <span className="bo-kpi-context">remaining to earn</span>
            </div>
            {hasCostData && (
              <div className={`bo-kpi margin ${grossMargin >= 20 ? 'healthy' : grossMargin >= 10 ? 'watch' : 'danger'}`}>
                <span className="bo-kpi-value">{grossMargin}%</span>
                <span className="bo-kpi-label">Gross Margin</span>
                <span className="bo-kpi-context">{formatCurrency(totalProfit)} profit</span>
              </div>
            )}
            {totalExposure > 0 && (
              <div className="bo-kpi exposure">
                <span className="bo-kpi-value">{formatCurrency(totalExposure)}</span>
                <span className="bo-kpi-label">At-Risk Exposure</span>
                <span className="bo-kpi-context">{projectsAtRisk + projectsOverBudget} project{projectsAtRisk + projectsOverBudget !== 1 ? 's' : ''} flagged</span>
              </div>
            )}
            {totalPendingCORCount > 0 && (
              <div className="bo-kpi pending">
                <span className="bo-kpi-value">{formatCurrency(totalPendingCORValue)}</span>
                <span className="bo-kpi-label">Pending CORs</span>
                <span className="bo-kpi-context">{totalPendingCORCount} awaiting approval</span>
              </div>
            )}
          </div>
        </div>

        {/* Project Health + Schedule — Combined Status Strip */}
        <div className="bo-status-strip">
          <div className="bo-status-group">
            <div className="bo-status-title">Project Health</div>
            <div className="bo-health-pills">
              {projectsComplete > 0 && (
                <div className="bo-pill complete">
                  <span className="bo-pill-count">{projectsComplete}</span>
                  <span className="bo-pill-label">Complete</span>
                </div>
              )}
              {projectsOnTrack > 0 && (
                <div className="bo-pill on-track">
                  <span className="bo-pill-count">{projectsOnTrack}</span>
                  <span className="bo-pill-label">On Track</span>
                </div>
              )}
              {projectsAtRisk > 0 && (
                <div className="bo-pill at-risk">
                  <span className="bo-pill-count">{projectsAtRisk}</span>
                  <span className="bo-pill-label">At Risk</span>
                  {atRiskExposure > 0 && <span className="bo-pill-exposure">{formatCurrency(atRiskExposure)}</span>}
                </div>
              )}
              {projectsOverBudget > 0 && (
                <div className="bo-pill over-budget">
                  <span className="bo-pill-count">{projectsOverBudget}</span>
                  <span className="bo-pill-label">Over Budget</span>
                  {overBudgetExposure > 0 && <span className="bo-pill-exposure">{formatCurrency(overBudgetExposure)}</span>}
                </div>
              )}
            </div>
          </div>

          {hasAnyScheduleData && (
            <div className="bo-status-group">
              <div className="bo-status-title">Schedule</div>
              <div className="bo-health-pills">
                {scheduleAhead > 0 && (
                  <div className="bo-pill ahead">
                    <span className="bo-pill-count">{scheduleAhead}</span>
                    <span className="bo-pill-label">Ahead</span>
                  </div>
                )}
                {scheduleOnTrack > 0 && (
                  <div className="bo-pill schedule-on-track">
                    <span className="bo-pill-count">{scheduleOnTrack}</span>
                    <span className="bo-pill-label">On Track</span>
                  </div>
                )}
                {scheduleBehind > 0 && (
                  <div className="bo-pill behind">
                    <span className="bo-pill-count">{scheduleBehind}</span>
                    <span className="bo-pill-label">Behind</span>
                    {behindScheduleExposure > 0 && <span className="bo-pill-exposure">{formatCurrency(behindScheduleExposure)}</span>}
                  </div>
                )}
              </div>
              {hasAnyLaborData && (
                <div className="bo-labor-summary">
                  <span className="bo-labor-label">Man-Days:</span>
                  {laborUnder > 0 && (
                    <span className="bo-labor-badge under">{laborUnder} under</span>
                  )}
                  {laborOnTrack > 0 && (
                    <span className="bo-labor-badge on-track">{laborOnTrack} on track</span>
                  )}
                  {laborOver > 0 && (
                    <span className="bo-labor-badge over">{laborOver} over</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Smart Alerts - Actionable insights requiring attention */}
      {riskAnalysis.allAlerts.length > 0 && (
        <div className={`smart-alerts-section${riskAnalysis.criticalCount > 0 ? ' smart-alerts-section--has-critical' : riskAnalysis.allAlerts.some(a => a.type === 'warning') ? ' smart-alerts-section--has-warning' : ''}`}>
          <div className="smart-alerts-header">
            <div className="smart-alerts-header__left">
              <AlertTriangle className="smart-alerts-header__icon" size={18} />
              <h3 className="smart-alerts-header__title">Needs Attention</h3>
            </div>
            {riskAnalysis.criticalCount > 0 ? (
              <span className="smart-alerts-count-badge smart-alerts-count-badge--critical">
                {riskAnalysis.criticalCount} critical
              </span>
            ) : (
              <span className="smart-alerts-count-badge smart-alerts-count-badge--warning">
                {riskAnalysis.allAlerts.length} item{riskAnalysis.allAlerts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <SmartAlerts
            alerts={riskAnalysis.allAlerts}
            onAction={onAlertAction}
            maxVisible={3}
          />
        </div>
      )}

      {/* Projects Header */}
      <div className="dashboard-header">
        <h2>Projects</h2>
        <span className="project-count">{projects.length} active</span>
      </div>

      {/* Project Grid */}
      <div className="project-list">
        {projectsData.map(project => {
          const projectRisk = riskAnalysis.projectRisks.find(r => r.projectId === project.id)
          return (
            <EnhancedProjectCard
              key={project.id}
              project={project}
              riskScore={projectRisk?.riskScore}
              riskStatus={projectRisk?.riskStatus}
              onClick={() => onSelectProject(project)}
            />
          )
        })}
      </div>

      {/* Universal Search Modal */}
      <UniversalSearch
        isOpen={isSearchOpen}
        onClose={closeSearch}
        companyId={company?.id}
        onSelectProject={(project) => {
          onSelectProject(project)
        }}
        onSelectTicket={onSelectTicket}
        onSelectCOR={onSelectCOR}
        onShowToast={onShowToast}
      />
    </div>
  )
}
