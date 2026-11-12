import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { db } from '../lib/supabase'
import { exportAllFieldDocumentsPDF, exportDailyReportsPDF, exportIncidentReportsPDF, exportCrewCheckinsPDF } from '../lib/fieldDocumentExport'
import { ClipboardList, Info, Plus, BellRing, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import UniversalSearch, { useUniversalSearch } from './UniversalSearch'
import { ErrorBoundary } from './ui'
import OnboardingWizard from './onboarding/OnboardingWizard'
import ProjectOnboardingTour from './onboarding/ProjectOnboardingTour'
import { isOnboardingComplete, consumePendingProjectTour } from './onboarding/onboardingState'
import useDashboardData from '../hooks/useDashboardData'
import useProjectViewState from '../hooks/useProjectViewState'
import usePortfolioMetrics from '../hooks/usePortfolioMetrics'
import useProjectEdit from '../hooks/useProjectEdit'
import useOfficeQueue from '../hooks/useOfficeQueue'
import { getOfficeQuickActions, pickProjectForRow, EMPTY_QUEUE_COUNTS } from '../lib/officeActions'
import { parseOfficeLink, takeRememberedOfficeLink } from '../lib/officeLinks'
import { ticketNoticeFromEvent, ticketNoticeText } from '../lib/ticketNotices'
import ProjectDetailView from './dashboard/ProjectDetailView'
import PortfolioView from './dashboard/PortfolioView'
import OfficeQuickActions from './dashboard/OfficeQuickActions'

/**
 * Dashboard - Thin orchestrator for the office dashboard.
 *
 * Data loading/caching/subscriptions live in useDashboardData, detail-view
 * UI state in useProjectViewState, and rendering is composed from
 * ProjectDetailView (selected project) and PortfolioView (project list).
 * Both views share the office quick actions (OfficeQuickActions), fed by
 * useOfficeQueue, and the universal search.
 */
export default function Dashboard({ company, user, isAdmin, onShowToast, navigateToProjectId, onProjectNavigated }) {
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete())
  // Guided setup tour queued by the project creation wizard (shows once)
  const [projectTour, setProjectTour] = useState(() => consumePendingProjectTour())

  // In-app notice: a ticket arrived from the field, or the client signed one
  const [ticketNotice, setTicketNotice] = useState(null)
  const seenNoticesRef = useRef(new Set())
  const officeEntryOpenRef = useRef(false)
  const handleTicketEvent = useCallback((payload) => {
    const notice = ticketNoticeFromEvent(payload, seenNoticesRef.current)
    // A ticket the office is entering itself is not news
    if (!notice || (notice.kind === 'new' && officeEntryOpenRef.current)) return
    setTicketNotice(notice)
  }, [])

  // Data layer: projects, selected project details, areas, subscriptions, cache
  const {
    projects, projectsData, selectedProject, setSelectedProject,
    areas, setAreas, loading, costCodes,
    corRefreshKey, bumpCORRefresh, debouncedRefresh,
    loadProjects, loadAreas, handleSelectProject, invalidateProjectCache,
    projectData, progressCalculations,
    fieldActivity, activityPulse
  } = useDashboardData({ company, onShowToast, navigateToProjectId, onProjectNavigated, onTicketEvent: handleTicketEvent })

  // Detail-view UI state: tabs, sections, sidebars, and modal visibility
  const view = useProjectViewState()

  // Universal Search (Cmd+K)
  const { isOpen: isSearchOpen, setIsOpen: setSearchOpen, close: closeSearch } = useUniversalSearch()

  // Portfolio metrics (extracted hook)
  const { portfolioMetrics, projectHealth, scheduleMetrics, riskAnalysis } = usePortfolioMetrics(projectsData)

  // Project edit mode (extracted hook)
  const edit = useProjectEdit({ selectedProject, areas, company, onShowToast, loadAreas, setSelectedProject })

  // Office work queue: what is waiting on the office, per project and in total.
  // Every realtime ticket/COR event ends in a project list reload (a new
  // `projects` array), so that is the refresh signal; a COR saved here bumps
  // corRefreshKey first.
  const queue = useOfficeQueue({ company, projects, refreshKey: projects })
  const { refresh: refreshQueue } = queue
  useEffect(() => {
    if (corRefreshKey > 0) refreshQueue()
  }, [corRefreshKey, refreshQueue])

  // Quick-actions sheet: open state, plus the row whose project picker it opens on
  const [quickActions, setQuickActions] = useState({ open: false, pickerRowId: null })
  const openQuickActions = useCallback(() => setQuickActions({ open: true, pickerRowId: null }), [])
  const handleQuickActionsOpenChange = useCallback((open) => setQuickActions({ open, pickerRowId: null }), [])

  const queueProjects = useMemo(() => projects.map(p => ({
    id: p.id,
    name: p.name,
    job_number: p.job_number,
    counts: queue.byProject[p.id] || EMPTY_QUEUE_COUNTS
  })), [projects, queue.byProject])

  // Open a project by id with its details loaded (search results and queue
  // entries are partial rows, so resolve the full one first)
  const openProject = (project) => {
    if (!project?.id) return
    handleSelectProject(projectsData.find(p => p.id === project.id) || projects.find(p => p.id === project.id) || project)
  }

  const handleSelectTicket = (ticket) => {
    const project = projects.find(p => p.id === ticket.project_id)
    if (project) {
      openProject(project)
      view.setActiveProjectTab('financials')
      view.setFinancialsSection('tickets')
    }
  }

  const handleSelectCOR = (cor) => {
    const project = projects.find(p => p.id === cor.project_id)
    if (project) {
      openProject(project)
      view.setActiveProjectTab('financials')
      view.setFinancialsSection('cors')
      view.setViewingCOR(cor)
      view.setShowCORDetail(true)
    }
  }

  // Deep links: /dashboard?project=...&view=review (see lib/officeLinks).
  // Applied once the projects are loaded, then removed from the address bar.
  const location = useLocation()
  const appliedSearchRef = useRef(null)
  useEffect(() => {
    if (loading || projects.length === 0) return
    let link = null
    if (location.search && location.search !== appliedSearchRef.current) {
      appliedSearchRef.current = location.search
      link = parseOfficeLink(location.search)
      if (link) takeRememberedOfficeLink()
    } else if (appliedSearchRef.current === null) {
      appliedSearchRef.current = ''
      link = takeRememberedOfficeLink()
    }
    if (!link) return

    const project = projects.find(p => p.id === link.projectId)
    if (location.search) navigate('/dashboard', { replace: true })
    if (!project) {
      onShowToast?.('That project is not available in this company', 'error')
      return
    }
    if (link.corId) {
      Promise.resolve(db.getCORById?.(link.corId))
        .then(cor => {
          if (cor && cor.project_id === project.id) handleSelectCOR(cor)
          else { openProject(project); view.openCORs(link.filter || undefined) }
        })
        .catch(() => { openProject(project); onShowToast?.('Could not open that change order', 'error') })
      return
    }
    openProject(project)
    if (link.view === 'review') view.openTicketReview()
    else if (link.view === 'tickets') { view.setActiveProjectTab('financials'); view.setFinancialsSection('tickets') }
    else if (link.view === 'cors') {
      if (link.filter) view.openCORs(link.filter)
      else { view.setActiveProjectTab('financials'); view.setFinancialsSection('cors') }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, projects.length, location.search])

  // Quick actions: every row and footer link of the sheet lands here. From the
  // portfolio the action carries the project to open first.
  const handleQuickAction = (actionId, project) => {
    if (project) openProject(project)
    switch (actionId) {
      case 'review':
        view.openTicketReview()
        break
      case 'buildCor':
        view.setActiveProjectTab('financials')
        view.setFinancialsSection('cors')
        view.handleBuildCORFromTickets()
        break
      case 'sendCor':
        view.openCORs('draft')
        break
      case 'returned':
        view.openCORs('rejected')
        break
      case 'waiting':
        view.openCORs('pending_approval')
        break
      case 'newCor':
        view.handleCreateCOR()
        break
      case 'search':
        setSearchOpen(true)
        break
      case 'tmTicket':
        view.handleCreateTMTicket()
        break
      case 'dailyReport':
        view.handleCreateDailyReport()
        break
      case 'corLog':
        view.setActiveProjectTab('financials')
        view.setFinancialsSection('cors')
        view.setCORDisplayMode('log')
        break
      case 'newProject':
        navigate('/projects/new')
        break
      default:
        break
    }
  }

  // Portfolio "Needs action" tile: same as the matching row, with the project
  // picker when more than one project could be meant
  const handlePortfolioQuickAction = (rowId) => {
    const project = pickProjectForRow(rowId, queueProjects)
    if (project) handleQuickAction(rowId, project)
    else setQuickActions({ open: true, pickerRowId: rowId })
  }

  const handleBack = () => {
    setSelectedProject(null)
    setAreas([])
    edit.handleCancelEdit()
    view.resetSections()
    loadProjects()
  }

  // Handler for alert actions
  const handleAlertAction = ({ target, projectId }) => {
    const project = projects.find(p => p.id === projectId)
    if (project) {
      openProject(project)
      // Navigate to appropriate tab based on action target
      if (target === 'tickets' || target === 'approvals') {
        view.openTicketReview()
      } else if (target === 'financials') {
        view.setActiveProjectTab('financials')
      } else if (target === 'reports') {
        view.setActiveProjectTab('field')
        view.setFieldSection('reports')
      } else if (target === 'cors') {
        view.setActiveProjectTab('financials')
        view.setFinancialsSection('cors')
      } else {
        view.setActiveProjectTab('overview')
      }
    }
  }

  // Field document export handler
  const handleExportFieldDocuments = useCallback(async (type = 'all') => {
    if (!selectedProject) return
    onShowToast('Gathering field data...', 'info')
    try {
      const [dailyReports, injuryReports, crewCheckins] = await Promise.all([
        db.getDailyReports(selectedProject.id, 365),
        db.getInjuryReports(selectedProject.id),
        db.getCrewCheckinHistory(selectedProject.id, 365)
      ])

      const exportContext = { company, companySettings: await db.getCompanySettings(company?.id) }

      if (type === 'daily') {
        await exportDailyReportsPDF(dailyReports || [], selectedProject, exportContext)
      } else if (type === 'incidents') {
        await exportIncidentReportsPDF(injuryReports || [], selectedProject, exportContext)
      } else if (type === 'crew') {
        await exportCrewCheckinsPDF(crewCheckins || [], selectedProject, exportContext)
      } else {
        await exportAllFieldDocumentsPDF({
          dailyReports: dailyReports || [],
          incidentReports: injuryReports || [],
          crewCheckins: crewCheckins || [],
          project: selectedProject,
          context: exportContext
        })
      }
      onShowToast('PDF exported!', 'success')
    } catch (error) {
      console.error('Error exporting field documents:', error)
      onShowToast('Error generating PDF', 'error')
    }
  }, [selectedProject, company, onShowToast])

  // Cycle an area's field status from the SOV panel: not_started → working → done → not_started
  // Mirrors the field app's one-tap update; optimistic flip with rollback on failure.
  const handleAreaStatusCycle = useCallback(async (area) => {
    const order = ['not_started', 'working', 'done']
    const next = order[(order.indexOf(area.status) + 1) % order.length]
    const previous = area.status
    setAreas(prev => prev.map(a => a.id === area.id ? { ...a, status: next } : a))
    try {
      await db.updateAreaStatus(area.id, next)
    } catch (error) {
      console.error('Error updating area status:', error)
      setAreas(prev => prev.map(a => a.id === area.id ? { ...a, status: previous } : a))
      onShowToast?.(`Couldn't update "${area.name}" — try again`, 'error')
    }
  }, [setAreas, onShowToast])

  const handleDeleteCost = useCallback(async (costId) => {
    try {
      await db.deleteProjectCost(costId)
      // Invalidate cache for this project so fresh data is loaded
      invalidateProjectCache(selectedProject?.id)
      loadProjects()
      onShowToast?.('Cost deleted', 'success')
    } catch (_err) {
      onShowToast?.('Error deleting cost', 'error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]) // onShowToast is stable (memoized in App.jsx)

  const handleSaveCost = async (costData) => {
    try {
      view.setSavingCost(true)
      await db.addProjectCost(selectedProject.id, company.id, costData)
      view.setShowAddCostModal(false)
      invalidateProjectCache(selectedProject.id)
      loadProjects()
      onShowToast('Cost added successfully', 'success')
    } catch (err) {
      console.error('Error adding cost:', err)
      onShowToast('Error adding cost', 'error')
    } finally {
      view.setSavingCost(false)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        Loading projects...
      </div>
    )
  }

  // Guided setup tour overlays whichever view is active after creation
  const projectTourOverlay = projectTour ? (
    <ProjectOnboardingTour
      pin={projectTour.pin}
      projectName={projects.find(p => p.id === projectTour.projectId)?.name}
      onShowToast={onShowToast}
      onClose={() => setProjectTour(null)}
    />
  ) : null

  // Ticket notice: one line with a way straight to the review queue
  officeEntryOpenRef.current = view.showTMTicketModal
  const noticeProject = ticketNotice ? projects.find(p => p.id === ticketNotice.projectId) : null
  const ticketNoticeBanner = ticketNotice && noticeProject && !view.isModalOpen && !edit.editMode ? (
    <div className="office-notice" role="status" aria-live="polite">
      <BellRing size={16} className="office-notice-icon" aria-hidden="true" />
      <span className="office-notice-text">{ticketNoticeText(ticketNotice, noticeProject.name)}</span>
      <button
        className="office-notice-action"
        onClick={() => { setTicketNotice(null); openProject(noticeProject); view.openTicketReview() }}
      >
        Review
      </button>
      <button className="office-notice-dismiss" onClick={() => setTicketNotice(null)} aria-label="Dismiss notice">
        <X size={15} />
      </button>
    </div>
  ) : null

  // Project Detail View
  if (selectedProject) {
    const projectCounts = queue.ready ? queue.forProject(selectedProject.id) : null
    return (
      <>
      {projectTourOverlay}
      {ticketNoticeBanner}
      <ProjectDetailView
        selectedProject={selectedProject}
        projectData={projectData}
        areas={areas}
        progressCalculations={progressCalculations}
        company={company}
        user={user}
        isAdmin={isAdmin}
        projects={projects}
        projectsData={projectsData}
        costCodes={costCodes}
        view={view}
        edit={edit}
        corRefreshKey={corRefreshKey}
        bumpCORRefresh={bumpCORRefresh}
        debouncedRefresh={debouncedRefresh}
        activityPulse={activityPulse}
        onBack={handleBack}
        onShowToast={onShowToast}
        onExportFieldDocuments={handleExportFieldDocuments}
        onAreaStatusCycle={handleAreaStatusCycle}
        onAreasChanged={() => loadAreas(selectedProject.id)}
        onDeleteCost={handleDeleteCost}
        onSaveCost={handleSaveCost}
        onDeleteProject={() => edit.handleDeleteProject(loadProjects)}
        onOpenQuickActions={openQuickActions}
        quickActionsBadge={getOfficeQuickActions({ scope: 'project', counts: projectCounts }).badge}
        readyForCORCount={projectCounts?.readyForCOR}
        queueCounts={projectCounts}
        onQuickAction={handleQuickAction}
      />
      <OfficeQuickActions
        scope="project"
        counts={projectCounts}
        isAdmin={isAdmin}
        open={quickActions.open}
        onOpenChange={handleQuickActionsOpenChange}
        onAction={handleQuickAction}
        hidden={view.isModalOpen || edit.editMode || Boolean(projectTour) || isSearchOpen}
      />
      {/* Universal Search (the portfolio renders its own) */}
      {/* Not while a form is open: jumping projects would save it onto the wrong one */}
      <UniversalSearch
        isOpen={isSearchOpen && !view.isModalOpen && !edit.editMode}
        onClose={closeSearch}
        companyId={company?.id}
        onSelectProject={openProject}
        onSelectTicket={handleSelectTicket}
        onSelectCOR={handleSelectCOR}
        onShowToast={onShowToast}
      />
      </>
    )
  }

  // Project List View - empty state with onboarding for new users
  if (projects.length === 0) {
    return (
      <>
        {showOnboarding && (
          <OnboardingWizard
            company={company}
            user={user}
            onShowToast={onShowToast}
            onDismiss={() => setShowOnboarding(false)}
          />
        )}
        <div className="empty-state">
          <ClipboardList size={48} className="empty-state-icon" />
          <h3>No Projects Yet</h3>
          <p>Create your first project to get started</p>
          <button className="btn btn-primary" onClick={() => navigate('/projects/new')}>
            <Plus size={16} />
            Create Project
          </button>
          {!showOnboarding && (
            <button className="empty-state-guide-btn" onClick={() => setShowOnboarding(true)}>
              <Info size={16} />
              Review Getting Started Guide
            </button>
          )}
        </div>
      </>
    )
  }

  // Portfolio overview
  return (
    <>
      {projectTourOverlay}
      {ticketNoticeBanner}
      {showOnboarding && (
        <OnboardingWizard
          company={company}
          user={user}
          onShowToast={onShowToast}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}
      <ErrorBoundary section="Portfolio">
        <PortfolioView
          projects={projects}
          projectsData={projectsData}
          portfolioMetrics={portfolioMetrics}
          projectHealth={projectHealth}
          scheduleMetrics={scheduleMetrics}
          riskAnalysis={riskAnalysis}
          fieldActivity={fieldActivity}
          isSearchOpen={isSearchOpen}
          setSearchOpen={setSearchOpen}
          closeSearch={closeSearch}
          company={company}
          onSelectProject={openProject}
          onAlertAction={handleAlertAction}
          onShowToast={onShowToast}
          onSelectTicket={handleSelectTicket}
          onSelectCOR={handleSelectCOR}
          queueTotals={queue.ready ? queue.totals : null}
          queueByProject={queue.ready ? queue.byProject : null}
          onQuickAction={handlePortfolioQuickAction}
          onOpenQuickActions={openQuickActions}
        />
      </ErrorBoundary>
      <OfficeQuickActions
        scope="portfolio"
        counts={queue.ready ? queue.totals : null}
        projects={queueProjects}
        isAdmin={isAdmin}
        open={quickActions.open}
        pickerRowId={quickActions.pickerRowId}
        onOpenChange={handleQuickActionsOpenChange}
        onAction={handleQuickAction}
        hidden={showOnboarding || Boolean(projectTour) || isSearchOpen}
      />
    </>
  )
}
