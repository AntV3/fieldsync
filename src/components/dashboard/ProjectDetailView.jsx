import { useMemo, lazy, Suspense } from 'react'
import { LayoutDashboard, DollarSign, ClipboardList, Info, FolderOpen } from 'lucide-react'
import { TabContentSkeleton, ErrorBoundary } from '../ui'
import ProjectEditForm from './ProjectEditForm'
import ProjectHeader from './ProjectHeader'
import ProjectSummaryBar from './ProjectSummaryBar'
import ProjectTabNav from './ProjectTabNav'
import PendingApprovalsBanner from './PendingApprovalsBanner'
import DashboardModals from './DashboardModals'

// Lazy load tab components - only load the active tab's code
const OverviewTab = lazy(() => import('./tabs/OverviewTab'))
const FinancialsTab = lazy(() => import('./tabs/FinancialsTab'))
const FieldActivityTab = lazy(() => import('./tabs/FieldActivityTab'))
const DocumentsTab = lazy(() => import('../documents/DocumentsTab'))
const ProjectInfoTab = lazy(() => import('./tabs/ProjectInfoTab'))

/**
 * ProjectDetailView - Composes the full project detail screen:
 * sticky header (ProjectHeader + ProjectSummaryBar + ProjectTabNav),
 * the active tab's panel (each wrapped in an ErrorBoundary), and
 * DashboardModals. All state lives in Dashboard's hooks and arrives
 * here via the `view` (useProjectViewState) and `edit` (useProjectEdit)
 * objects.
 */
export default function ProjectDetailView({
  selectedProject,
  projectData,
  areas,
  progressCalculations,
  company,
  user,
  isAdmin,
  projects,
  projectsData,
  costCodes,
  view,
  edit,
  corRefreshKey,
  bumpCORRefresh,
  debouncedRefresh,
  activityPulse = 0,
  onBack,
  onShowToast,
  onExportFieldDocuments,
  onAreaStatusCycle,
  onAreasChanged,
  onDeleteCost,
  onSaveCost,
  onDeleteProject
}) {
  const { progress, billable, changeOrderValue, revisedContractValue } = progressCalculations

  // Memoize stats for FinancialsNav to prevent re-renders from inline object creation
  const financialsNavStats = useMemo(() => ({
    corCount: projectData?.corTotalCount || 0,
    ticketCount: projectData?.totalTickets || 0,
    corPending: projectData?.corPendingCount || 0,
    ticketPending: projectData?.pendingTickets || 0
  }), [projectData?.corTotalCount, projectData?.totalTickets, projectData?.corPendingCount, projectData?.pendingTickets])

  // Edit Mode
  if (edit.editMode && edit.editData) {
    return (
      <ProjectEditForm
        editData={edit.editData}
        saving={edit.saving}
        onCancel={edit.handleCancelEdit}
        onEditChange={edit.handleEditChange}
        onAreaEditChange={edit.handleAreaEditChange}
        onAddArea={edit.handleAddArea}
        onRemoveArea={edit.handleRemoveArea}
        onSave={edit.handleSaveEdit}
        onDelete={onDeleteProject}
      />
    )
  }

  // View Mode - Calculate additional metrics for context
  const areasComplete = areas.filter(a => a.status === 'done').length
  const areasWorking = areas.filter(a => a.status === 'working').length
  const areasNotStarted = areas.filter(a => a.status === 'not_started').length

  // Tab definitions with pending badges - 5 consolidated tabs
  const pendingCount = (projectData?.pendingTickets || 0) + (projectData?.changeOrderPending || 0)
  const tabs = [
    { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { id: 'financials', label: 'Financials', Icon: DollarSign, badge: pendingCount },
    { id: 'field', label: 'Field Activity', Icon: ClipboardList },
    { id: 'documents', label: 'Documents', Icon: FolderOpen },
    { id: 'info', label: 'Project Info', Icon: Info }
  ]

  return (
    <div className="project-view tabbed">
      {/* Sticky Header */}
      <div className="pv-sticky-header">
        <ProjectHeader
          project={selectedProject}
          projectData={projectData}
          onBack={onBack}
          onShare={() => view.setShowShareModal(true)}
          onOpenAlerts={() => view.setShowNotificationSettings(true)}
          onEditClick={edit.handleEditClick}
          onCreateCOR={view.handleCreateCOR}
          onCreateTMTicket={view.handleCreateTMTicket}
          onCreateDailyReport={view.handleCreateDailyReport}
        />
        <ProjectSummaryBar
          progress={progress}
          billable={billable}
          revisedContractValue={revisedContractValue}
          projectData={projectData}
        />
        <ProjectTabNav
          tabs={tabs}
          activeTab={view.activeProjectTab}
          onTabChange={view.setActiveProjectTab}
        />
      </div>

      {/* Pending approvals call-to-action (persistent, dismissable) */}
      <PendingApprovalsBanner
        projectId={selectedProject.id}
        pendingCount={(projectData?.pendingTickets || 0) + (projectData?.corPendingCount || 0)}
        onView={() => view.setProjectTab('financials')}
      />

      {/* Tab Content */}
      <div className="pv-tab-content" role="tabpanel" id={`tabpanel-${view.activeProjectTab}`} aria-labelledby={`tab-${view.activeProjectTab}`}>
        {/* OVERVIEW TAB */}
        {view.activeProjectTab === 'overview' && (
          <ErrorBoundary section="Overview">
            <Suspense fallback={<TabContentSkeleton />}>
              <OverviewTab
                selectedProject={selectedProject}
                projectData={projectData}
                progress={progress}
                billable={billable}
                revisedContractValue={revisedContractValue}
                changeOrderValue={changeOrderValue}
                areas={areas}
                areasComplete={areasComplete}
                areasWorking={areasWorking}
                areasNotStarted={areasNotStarted}
                company={company}
                allProjects={projects}
                onShowToast={onShowToast}
                onSetActiveTab={view.setProjectTab}
                onExportFieldDocuments={onExportFieldDocuments}
                onAreaStatusCycle={onAreaStatusCycle}
                activityPulse={activityPulse}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {/* FINANCIALS TAB */}
        {view.activeProjectTab === 'financials' && (
          <ErrorBoundary section="Financials">
            <Suspense fallback={<TabContentSkeleton />}>
              <FinancialsTab
                selectedProject={selectedProject}
                company={company}
                user={user}
                projectData={projectData}
                progress={progress}
                billable={billable}
                changeOrderValue={changeOrderValue}
                revisedContractValue={revisedContractValue}
                areas={areas}
                financialsSection={view.financialsSection}
                setFinancialsSection={view.setFinancialsSection}
                financialsSidebarCollapsed={view.financialsSidebarCollapsed}
                financialsSidebarMobileOpen={view.financialsSidebarMobileOpen}
                onToggleFinancialsSidebar={view.handleToggleFinancialsSidebar}
                onToggleMobileSidebar={view.handleToggleMobileSidebar}
                onCloseMobileSidebar={view.handleCloseMobileSidebar}
                financialsNavStats={financialsNavStats}
                corListExpanded={view.corListExpanded}
                corRefreshKey={corRefreshKey}
                corDisplayMode={view.corDisplayMode}
                setCORDisplayMode={view.setCORDisplayMode}
                onToggleCORList={view.handleToggleCORList}
                onCreateCOR={view.handleCreateCOR}
                onViewCOR={view.handleViewCOR}
                onEditCOR={view.handleEditCOR}
                tmViewMode={view.tmViewMode}
                onViewAllTickets={view.handleViewAllTickets}
                onBackToTMPreview={view.handleBackToTMPreview}
                equipmentRefreshKey={view.equipmentRefreshKey}
                onAddEquipment={view.handleAddEquipment}
                onEditEquipment={view.handleEditEquipment}
                drawRequestRefreshKey={view.drawRequestRefreshKey}
                onCreateDraw={view.handleCreateDraw}
                onViewDraw={view.handleViewDraw}
                onAddCost={view.handleAddCost}
                onDeleteCost={onDeleteCost}
                costCodes={costCodes}
                allProjects={projects}
                onShowToast={onShowToast}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {/* FIELD ACTIVITY TAB (Reports, RFIs, Submittals, Observations, Punch List) */}
        {view.activeProjectTab === 'field' && (
          <ErrorBoundary section="Field Activity">
            <Suspense fallback={<TabContentSkeleton />}>
              <FieldActivityTab
                selectedProject={selectedProject}
                projectData={projectData}
                areas={areas}
                company={company}
                user={user}
                onShowToast={onShowToast}
                fieldSection={view.fieldSection}
                setFieldSection={view.setFieldSection}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {/* DOCUMENTS TAB */}
        {view.activeProjectTab === 'documents' && (
          <div className="pv-tab-panel documents-tab">
            <ErrorBoundary section="Documents">
              <Suspense fallback={<TabContentSkeleton />}>
                <DocumentsTab
                  project={selectedProject}
                  companyId={company?.id || selectedProject?.company_id}
                  onShowToast={onShowToast}
                  userRole={user?.access_level || 'office'}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* PROJECT INFO TAB (Details, Analytics, Team, Settings) */}
        {view.activeProjectTab === 'info' && (
          <ErrorBoundary section="Project Info">
            <Suspense fallback={<TabContentSkeleton />}>
              <ProjectInfoTab
                selectedProject={selectedProject}
                projectData={projectData}
                company={company}
                user={user}
                isAdmin={isAdmin}
                areas={areas}
                progress={progress}
                billable={billable}
                revisedContractValue={revisedContractValue}
                changeOrderValue={changeOrderValue}
                allProjects={projects}
                onAreasChanged={onAreasChanged}
                onShowToast={onShowToast}
                onEditClick={edit.handleEditClick}
                onOpenAlerts={() => view.setShowNotificationSettings(true)}
                infoSection={view.infoSection}
                setInfoSection={view.setInfoSection}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      <DashboardModals
        selectedProject={selectedProject}
        company={company}
        user={user}
        areas={areas}
        showShareModal={view.showShareModal}
        onCloseShareModal={() => view.setShowShareModal(false)}
        onShareCreated={() => onShowToast('Share link created successfully!', 'success')}
        onShowToast={onShowToast}
        showNotificationSettings={view.showNotificationSettings}
        onCloseNotificationSettings={() => view.setShowNotificationSettings(false)}
        showCORForm={view.showCORForm}
        editingCOR={view.editingCOR}
        onCloseCORForm={() => { view.setShowCORForm(false); view.setEditingCOR(null) }}
        onCORSaved={() => { view.setShowCORForm(false); view.setEditingCOR(null); bumpCORRefresh() }}
        showCORDetail={view.showCORDetail}
        viewingCOR={view.viewingCOR}
        onCloseCORDetail={() => { view.setShowCORDetail(false); view.setViewingCOR(null) }}
        onEditCORFromDetail={(cor) => { view.setShowCORDetail(false); view.setViewingCOR(null); view.setEditingCOR(cor); view.setShowCORForm(true) }}
        onCORStatusChange={() => { bumpCORRefresh(); debouncedRefresh({ refreshCOR: true }) }}
        corDisplayMode={view.corDisplayMode}
        onCloseCORLog={() => view.setCORDisplayMode('list')}
        showTMTicketModal={view.showTMTicketModal}
        onCloseTMTicketModal={() => view.setShowTMTicketModal(false)}
        onTMTicketSaved={() => { view.setShowTMTicketModal(false); debouncedRefresh() }}
        showDailyReportModal={view.showDailyReportModal}
        onCloseDailyReportModal={() => { view.setShowDailyReportModal(false); debouncedRefresh() }}
        showAddCostModal={view.showAddCostModal}
        savingCost={view.savingCost}
        onCloseAddCostModal={() => view.setShowAddCostModal(false)}
        onSaveCost={onSaveCost}
        showEquipmentModal={view.showEquipmentModal}
        editingEquipment={view.editingEquipment}
        onEquipmentSaved={() => { view.setShowEquipmentModal(false); view.setEditingEquipment(null); view.setEquipmentRefreshKey(prev => prev + 1); onShowToast(view.editingEquipment ? 'Equipment updated' : 'Equipment added', 'success') }}
        onCloseEquipmentModal={() => { view.setShowEquipmentModal(false); view.setEditingEquipment(null) }}
        showDrawRequestModal={view.showDrawRequestModal}
        editingDrawRequest={view.editingDrawRequest}
        projectsData={projectsData}
        onDrawRequestSaved={() => { view.setShowDrawRequestModal(false); view.setEditingDrawRequest(null); view.setDrawRequestRefreshKey(prev => prev + 1); onShowToast(view.editingDrawRequest ? 'Draw request updated' : 'Draw request created', 'success') }}
        onCloseDrawRequestModal={() => { view.setShowDrawRequestModal(false); view.setEditingDrawRequest(null) }}
      />
    </div>
  )
}
