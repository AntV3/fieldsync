import { Suspense, lazy, useEffect, useState } from 'react'
import { Info, BarChart3, Users, Settings, Menu, Bell, KeyRound, PlayCircle } from 'lucide-react'
import { TicketSkeleton } from '../../ui'
import TabSubNav from './TabSubNav'
import InfoTab from './InfoTab'
import ProjectTeam from '../../ProjectTeam'
import CostCodeManager from '../../CostCodeManager'
import MFASetup from '../../MFASetup'
import ProjectOnboardingTour from '../../onboarding/ProjectOnboardingTour'

const AnalyticsTab = lazy(() => import('./AnalyticsTab'))

const NAV_ITEMS = [
  { id: 'details', label: 'Details', shortLabel: 'Details', icon: Info, description: 'Project info & contacts' },
  { id: 'analytics', label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3, description: 'Forecasts & trends' },
  { id: 'team', label: 'Team', shortLabel: 'Team', icon: Users, description: 'Members & roles' },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings, description: 'Alerts, access & codes' }
]

/**
 * ProjectInfoTab
 *
 * Combined tab for project reference material: details/contacts, full
 * analytics, the project team, and project-level settings.
 * Uses the same collapsible sidebar pattern as the Financials tab.
 */
export default function ProjectInfoTab({
  selectedProject,
  projectData,
  company,
  user,
  isAdmin,
  areas,
  progress,
  billable,
  revisedContractValue,
  changeOrderValue,
  allProjects = [],
  onAreasChanged,
  onShowToast,
  onEditClick,
  onOpenAlerts,
  infoSection,
  setInfoSection
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [showTour, setShowTour] = useState(false)

  // Prevent body scroll when the mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarMobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarMobileOpen])

  const handleSectionChange = (section) => {
    setInfoSection(section)
    setSidebarMobileOpen(false)
  }

  return (
    <div className="pv-tab-panel project-info-tab">
      <div className={`financials-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Mobile Menu Toggle Button */}
        <button
          className="financials-mobile-menu-toggle"
          onClick={() => setSidebarMobileOpen(true)}
          aria-label="Open navigation menu"
          title="Open navigation menu"
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>

        {/* Mobile Overlay/Backdrop */}
        {sidebarMobileOpen && (
          <div
            className="financials-sidebar-overlay"
            onClick={() => setSidebarMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Navigation */}
        <div className={`financials-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarMobileOpen ? 'mobile-open' : ''}`}>
          <TabSubNav
            title="Project Info"
            ariaLabel="Project info sections"
            items={NAV_ITEMS}
            activeSection={infoSection}
            onSectionChange={handleSectionChange}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
            onMobileClose={() => setSidebarMobileOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="financials-main">
          {infoSection === 'details' && (
            <div className="animate-fade-in">
              <InfoTab
                selectedProject={selectedProject}
                company={company}
                user={user}
                isAdmin={isAdmin}
                areas={areas}
                onAreasChanged={onAreasChanged}
                onShowToast={onShowToast}
                onEditClick={onEditClick}
                showTeam={false}
                showSecurity={false}
                showCostCodes={false}
              />
            </div>
          )}

          {infoSection === 'analytics' && (
            <div className="animate-fade-in">
              <Suspense fallback={<TicketSkeleton />}>
                <AnalyticsTab
                  selectedProject={selectedProject}
                  projectData={projectData}
                  progress={progress}
                  billable={billable}
                  revisedContractValue={revisedContractValue}
                  changeOrderValue={changeOrderValue}
                  areas={areas}
                  allProjects={allProjects}
                  crewCheckins={projectData?.crewCheckins || []}
                  invoices={projectData?.invoices || []}
                  punchListItems={projectData?.punchListItems || []}
                  dailyReports={projectData?.dailyReports || []}
                  onShowToast={onShowToast}
                  showHealthOverview={false}
                />
              </Suspense>
            </div>
          )}

          {infoSection === 'team' && (
            <div className="animate-fade-in">
              <ProjectTeam
                project={selectedProject}
                company={company}
                user={user}
                isAdmin={isAdmin}
                onShowToast={onShowToast}
              />
            </div>
          )}

          {infoSection === 'settings' && (
            <div className="animate-fade-in project-settings-section">
              {/* Field access codes */}
              <div className="info-section-card">
                <div className="info-section-header">
                  <KeyRound size={18} />
                  <h3>Field Access</h3>
                </div>
                <div className="info-section-content">
                  {selectedProject?.pin ? (
                    <div className="info-detail-row">
                      <span className="info-detail-label">Foreman PIN</span>
                      <span className="info-detail-value mono">{selectedProject.pin}</span>
                    </div>
                  ) : (
                    <div className="info-detail-row empty">
                      <span className="info-detail-value">No foreman PIN set — edit the project to add one.</span>
                    </div>
                  )}
                  <p className="project-settings-hint">
                    New to FieldSync? Replay the guided setup tour that walks through
                    the PIN, field submissions, and real-time approvals.
                  </p>
                  <button className="btn btn-secondary" onClick={() => setShowTour(true)}>
                    <PlayCircle size={16} />
                    Replay tour
                  </button>
                </div>
              </div>

              {/* Alerts & notification preferences */}
              <div className="info-section-card">
                <div className="info-section-header">
                  <Bell size={18} />
                  <h3>Alerts & Notifications</h3>
                </div>
                <div className="info-section-content">
                  <p className="project-settings-hint">
                    Choose who gets notified about messages, safety reports, and T&M tickets
                    from this project.
                  </p>
                  <button className="btn btn-secondary" onClick={onOpenAlerts}>
                    Configure Alerts
                  </button>
                </div>
              </div>

              {/* Cost Codes (Job Costing) */}
              {(company?.id || selectedProject?.company_id) && (
                <div className="info-section-card">
                  <CostCodeManager
                    companyId={company?.id || selectedProject?.company_id}
                    onShowToast={onShowToast}
                  />
                </div>
              )}

              {/* Account Security */}
              <div className="info-section-card">
                <MFASetup onShowToast={onShowToast} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Replayable guided setup tour */}
      {showTour && (
        <ProjectOnboardingTour
          pin={selectedProject?.pin}
          projectName={selectedProject?.name}
          onShowToast={onShowToast}
          onClose={() => setShowTour(false)}
        />
      )}
    </div>
  )
}
