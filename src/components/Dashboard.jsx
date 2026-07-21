import { useState, useCallback } from 'react'
import { db } from '../lib/supabase'
import { exportAllFieldDocumentsPDF, exportDailyReportsPDF, exportIncidentReportsPDF, exportCrewCheckinsPDF } from '../lib/fieldDocumentExport'
import { ClipboardList, Info, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUniversalSearch } from './UniversalSearch'
import { ErrorBoundary } from './ui'
import OnboardingWizard from './onboarding/OnboardingWizard'
import { isOnboardingComplete } from './onboarding/onboardingState'
import useDashboardData from '../hooks/useDashboardData'
import useProjectViewState from '../hooks/useProjectViewState'
import usePortfolioMetrics from '../hooks/usePortfolioMetrics'
import useProjectEdit from '../hooks/useProjectEdit'
import ProjectDetailView from './dashboard/ProjectDetailView'
import PortfolioView from './dashboard/PortfolioView'

/**
 * Dashboard - Thin orchestrator for the office dashboard.
 *
 * Data loading/caching/subscriptions live in useDashboardData, detail-view
 * UI state in useProjectViewState, and rendering is composed from
 * ProjectDetailView (selected project) and PortfolioView (project list).
 */
export default function Dashboard({ company, user, isAdmin, onShowToast, navigateToProjectId, onProjectNavigated }) {
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete())

  // Data layer: projects, selected project details, areas, subscriptions, cache
  const {
    projects, projectsData, selectedProject, setSelectedProject,
    areas, setAreas, loading, costCodes,
    corRefreshKey, bumpCORRefresh, debouncedRefresh,
    loadProjects, loadAreas, handleSelectProject, invalidateProjectCache,
    projectData, progressCalculations
  } = useDashboardData({ company, onShowToast, navigateToProjectId, onProjectNavigated })

  // Detail-view UI state: tabs, sections, sidebars, and modal visibility
  const view = useProjectViewState()

  // Universal Search (Cmd+K)
  const { isOpen: isSearchOpen, setIsOpen: setSearchOpen, close: closeSearch } = useUniversalSearch()

  // Portfolio metrics (extracted hook)
  const { portfolioMetrics, projectHealth, scheduleMetrics, riskAnalysis } = usePortfolioMetrics(projectsData)

  // Project edit mode (extracted hook)
  const edit = useProjectEdit({ selectedProject, areas, company, onShowToast, loadAreas, setSelectedProject })

  const handleBack = () => {
    setSelectedProject(null)
    setAreas([])
    edit.handleCancelEdit()
    view.resetSections()
    loadProjects()
  }

  // Handler for alert actions
  const handleAlertAction = useCallback(({ target, projectId }) => {
    const project = projects.find(p => p.id === projectId)
    if (project) {
      setSelectedProject(project)
      // Navigate to appropriate tab based on action target
      if (target === 'financials') {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

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

      const exportContext = { company }

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

  // Project Detail View
  if (selectedProject) {
    return (
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
        onBack={handleBack}
        onShowToast={onShowToast}
        onExportFieldDocuments={handleExportFieldDocuments}
        onAreaStatusCycle={handleAreaStatusCycle}
        onAreasChanged={() => loadAreas(selectedProject.id)}
        onDeleteCost={handleDeleteCost}
        onSaveCost={handleSaveCost}
        onDeleteProject={() => edit.handleDeleteProject(loadProjects)}
      />
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
          isSearchOpen={isSearchOpen}
          setSearchOpen={setSearchOpen}
          closeSearch={closeSearch}
          company={company}
          onSelectProject={handleSelectProject}
          onAlertAction={handleAlertAction}
          onShowToast={onShowToast}
          onSelectTicket={(ticket) => {
            const project = projects.find(p => p.id === ticket.project_id)
            if (project) {
              handleSelectProject(project)
              view.setActiveProjectTab('financials')
              view.setFinancialsSection('tickets')
            }
          }}
          onSelectCOR={(cor) => {
            const project = projects.find(p => p.id === cor.project_id)
            if (project) {
              handleSelectProject(project)
              view.setActiveProjectTab('financials')
              view.setFinancialsSection('cors')
              view.setViewingCOR(cor)
              view.setShowCORDetail(true)
            }
          }}
        />
      </ErrorBoundary>
    </>
  )
}
