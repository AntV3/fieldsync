/**
 * Dashboard wiring for the office quick actions: every action id lands on the
 * right view-state call, portfolio actions open the project through
 * handleSelectProject first, and the launcher hides when it should.
 * Data hooks and the two big views are stubbed; useProjectViewState,
 * OfficeQuickActions and officeActions are real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  handleSelectProject: vi.fn(),
  setSelectedProject: vi.fn(),
  initialSelected: null,
  projects: [],
  queue: null,
  editMode: false
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }))
vi.mock('../lib/supabase', () => ({ db: {} }))
vi.mock('../lib/fieldDocumentExport', () => ({
  exportAllFieldDocumentsPDF: vi.fn(),
  exportDailyReportsPDF: vi.fn(),
  exportIncidentReportsPDF: vi.fn(),
  exportCrewCheckinsPDF: vi.fn()
}))
vi.mock('../components/onboarding/OnboardingWizard', () => ({ default: () => null }))
vi.mock('../components/onboarding/ProjectOnboardingTour', () => ({ default: () => null }))
vi.mock('../components/onboarding/onboardingState', () => ({
  isOnboardingComplete: () => true,
  consumePendingProjectTour: () => null
}))

vi.mock('../components/UniversalSearch', async () => {
  const { useState } = await import('react')
  return {
    default: ({ isOpen }) => (isOpen ? <div data-testid="universal-search" /> : null),
    useUniversalSearch: () => {
      const [isOpen, setIsOpen] = useState(false)
      return { isOpen, setIsOpen, close: () => setIsOpen(false) }
    }
  }
})

vi.mock('../hooks/useDashboardData', async () => {
  const { useState } = await import('react')
  return {
    default: function useDashboardDataStub() {
      const [selectedProject, setSelected] = useState(h.initialSelected)
      h.handleSelectProject.mockImplementation((project) => setSelected(project))
      h.setSelectedProject.mockImplementation((project) => setSelected(project))
      return {
        projects: h.projects,
        projectsData: h.projects.map(p => ({ ...p, _detailsLoaded: false })),
        selectedProject,
        setSelectedProject: h.setSelectedProject,
        areas: [], setAreas: () => {}, loading: false, costCodes: [],
        corRefreshKey: 0, bumpCORRefresh: () => {}, debouncedRefresh: () => {},
        loadProjects: () => {}, loadAreas: () => {},
        handleSelectProject: h.handleSelectProject,
        invalidateProjectCache: () => {},
        projectData: null, progressCalculations: {},
        fieldActivity: {}, activityPulse: 0
      }
    }
  }
})
vi.mock('../hooks/usePortfolioMetrics', () => ({
  default: () => ({ portfolioMetrics: {}, projectHealth: {}, scheduleMetrics: {}, riskAnalysis: { allAlerts: [], projectRisks: [] } })
}))
vi.mock('../hooks/useProjectEdit', () => ({
  default: () => ({ editMode: h.editMode, handleCancelEdit: () => {}, handleDeleteProject: () => {} })
}))
vi.mock('../hooks/useOfficeQueue', () => ({ default: () => h.queue }))

// Stand-ins that expose what Dashboard hands them
vi.mock('../components/dashboard/ProjectDetailView', () => ({
  default: ({ selectedProject, view, quickActionsBadge, onOpenQuickActions }) => (
    <div
      data-testid="project-view"
      data-project={selectedProject.id}
      data-tab={view.activeProjectTab}
      data-section={view.financialsSection}
      data-review={view.ticketReviewRequest?.filter ?? ''}
      data-cor-filter={view.corFilterRequest?.filter ?? ''}
      data-cor-list={String(view.corListExpanded)}
      data-cor-form={String(view.showCORForm)}
      data-cor-start={String(view.corFormStartWithTickets)}
      data-cor-display={view.corDisplayMode}
      data-tm-modal={String(view.showTMTicketModal)}
      data-report-modal={String(view.showDailyReportModal)}
      data-badge={String(quickActionsBadge)}
    >
      <button onClick={onOpenQuickActions}>header quick actions</button>
      <button onClick={() => view.setShowCORForm(false)}>close cor form</button>
    </div>
  )
}))
vi.mock('../components/dashboard/PortfolioView', () => ({
  default: ({ queueTotals, onQuickAction, onOpenQuickActions, onAlertAction }) => (
    <div data-testid="portfolio-view" data-to-review={queueTotals ? String(queueTotals.readyToApprove) : 'unknown'}>
      <button onClick={() => onQuickAction('review')}>tile review</button>
      <button onClick={() => onQuickAction('sendCor')}>tile send</button>
      <button onClick={onOpenQuickActions}>portfolio quick actions</button>
      <button onClick={() => onAlertAction({ target: 'approvals', projectId: 'p2' })}>alert approvals</button>
      <button onClick={() => onAlertAction({ target: 'cors', projectId: 'p2' })}>alert cors</button>
    </div>
  )
}))

import Dashboard from '../components/Dashboard'
import { EMPTY_QUEUE_COUNTS } from '../lib/officeActions'

const counts = (overrides = {}) => ({ ...EMPTY_QUEUE_COUNTS, ...overrides })
const p1 = { id: 'p1', name: 'Alpha Tower', job_number: '1001' }
const p2 = { id: 'p2', name: 'Bravo Mall', job_number: '1002' }

function makeQueue(byProject, ready = true) {
  const totals = counts()
  for (const c of Object.values(byProject)) {
    for (const key of ['readyToApprove', 'awaitingSignature', 'readyForCOR', 'draftCORs', 'withClient']) totals[key] += c[key]
  }
  return { byProject, totals, forProject: (id) => byProject[id] || EMPTY_QUEUE_COUNTS, loading: false, ready, refresh: () => {} }
}

const renderDashboard = () => render(<Dashboard company={{ id: 'c1' }} user={{ id: 'u1' }} isAdmin onShowToast={() => {}} />)
const projectView = () => screen.getByTestId('project-view')
const fab = () => screen.getByRole('button', { name: /^Quick actions/ })
const tapRow = (label) => {
  fireEvent.click(fab())
  const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
  fireEvent.click(within(sheet).getByRole('button', { name: new RegExp(`^${label}`) }))
}
const tapFooter = (...labels) => {
  fireEvent.click(fab())
  const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
  for (const label of labels) fireEvent.click(within(sheet).getByRole('button', { name: label }))
}

beforeEach(() => {
  h.navigate.mockReset()
  h.handleSelectProject.mockReset()
  h.setSelectedProject.mockReset()
  h.projects = [p1, p2]
  h.initialSelected = null
  h.editMode = false
  h.queue = makeQueue({
    p1: counts({ readyToApprove: 2, readyForCOR: 1, draftCORs: 1 }),
    p2: counts({ readyToApprove: 3, withClient: 1 })
  })
})

describe('Dashboard quick actions inside a project', () => {
  beforeEach(() => { h.initialSelected = p1 })

  it('passes the project badge to the header and opens the sheet from it', () => {
    renderDashboard()
    expect(projectView()).toHaveAttribute('data-badge', '2')
    fireEvent.click(screen.getByRole('button', { name: 'header quick actions' }))
    const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
    // Project scope: this project's counts, not the company totals
    expect(within(sheet).getByRole('button', { name: /^Review tickets/ })).toHaveTextContent('2')
    expect(within(sheet).getByRole('button', { name: 'Field entry' })).toBeInTheDocument()
  })

  it('review -> ticket review queue', () => {
    renderDashboard()
    tapRow('Review tickets')
    expect(projectView()).toHaveAttribute('data-tab', 'financials')
    expect(projectView()).toHaveAttribute('data-section', 'tickets')
    expect(projectView()).toHaveAttribute('data-review', 'pending')
    expect(h.handleSelectProject).not.toHaveBeenCalled()
  })

  it('buildCor -> COR section with the form on the ticket picker', () => {
    renderDashboard()
    tapRow('Build COR from tickets')
    expect(projectView()).toHaveAttribute('data-tab', 'financials')
    expect(projectView()).toHaveAttribute('data-section', 'cors')
    expect(projectView()).toHaveAttribute('data-cor-form', 'true')
    expect(projectView()).toHaveAttribute('data-cor-start', 'true')
  })

  it('newCor -> blank COR form', () => {
    renderDashboard()
    tapRow('New COR')
    expect(projectView()).toHaveAttribute('data-cor-form', 'true')
    expect(projectView()).toHaveAttribute('data-cor-start', 'false')
  })

  it('sendCor and waiting -> COR list filtered to drafts / with client', () => {
    renderDashboard()
    tapRow('Send COR')
    expect(projectView()).toHaveAttribute('data-section', 'cors')
    expect(projectView()).toHaveAttribute('data-cor-list', 'true')
    expect(projectView()).toHaveAttribute('data-cor-filter', 'draft')
    tapRow('Waiting on client')
    expect(projectView()).toHaveAttribute('data-cor-filter', 'pending_approval')
  })

  it('search -> universal search, which now works inside a project', () => {
    renderDashboard()
    expect(screen.queryByTestId('universal-search')).not.toBeInTheDocument()
    tapRow('Find a ticket or COR')
    expect(screen.getByTestId('universal-search')).toBeInTheDocument()
    // The launcher steps aside while search is open
    expect(screen.queryByRole('button', { name: /^Quick actions/ })).not.toBeInTheDocument()
  })

  it('field entry -> the T&M ticket and daily report modals', () => {
    const { unmount } = renderDashboard()
    tapFooter('Field entry', 'T&M ticket')
    expect(projectView()).toHaveAttribute('data-tm-modal', 'true')
    unmount()

    renderDashboard()
    tapFooter('Field entry', 'Daily report')
    expect(projectView()).toHaveAttribute('data-report-modal', 'true')
  })

  it('corLog -> COR section with the log open', () => {
    renderDashboard()
    tapFooter('COR log')
    expect(projectView()).toHaveAttribute('data-section', 'cors')
    expect(projectView()).toHaveAttribute('data-cor-display', 'log')
  })

  it('hides the launcher while a modal is open and brings it back after', () => {
    renderDashboard()
    tapRow('New COR')
    expect(screen.queryByRole('button', { name: /^Quick actions/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'close cor form' }))
    expect(fab()).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hides the launcher in edit mode', () => {
    h.editMode = true
    renderDashboard()
    expect(screen.queryByRole('button', { name: /^Quick actions/ })).not.toBeInTheDocument()
  })

  it('shows no badge or counts until the queue has loaded', () => {
    h.queue = makeQueue({}, false)
    renderDashboard()
    expect(projectView()).toHaveAttribute('data-badge', 'null')
    fireEvent.click(fab())
    const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
    expect(within(sheet).queryByText("You're caught up")).not.toBeInTheDocument()
  })
})

describe('Dashboard quick actions on the portfolio', () => {
  it('feeds the portfolio the company totals', () => {
    renderDashboard()
    expect(screen.getByTestId('portfolio-view')).toHaveAttribute('data-to-review', '5')
  })

  it('withholds totals until the queue has loaded', () => {
    h.queue = makeQueue({}, false)
    renderDashboard()
    expect(screen.getByTestId('portfolio-view')).toHaveAttribute('data-to-review', 'unknown')
  })

  it('a row with one candidate project opens it through handleSelectProject, then runs the action', () => {
    renderDashboard()
    tapRow('Send COR')
    expect(h.handleSelectProject).toHaveBeenCalledTimes(1)
    expect(h.handleSelectProject.mock.calls[0][0]).toMatchObject({ id: 'p1' })
    expect(h.setSelectedProject).not.toHaveBeenCalled()
    expect(projectView()).toHaveAttribute('data-project', 'p1')
    expect(projectView()).toHaveAttribute('data-cor-filter', 'draft')
  })

  it('a row with several candidates asks for the project first', () => {
    renderDashboard()
    tapRow('Review tickets')
    expect(h.handleSelectProject).not.toHaveBeenCalled()
    const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Bravo Mall/ }))
    expect(h.handleSelectProject.mock.calls[0][0]).toMatchObject({ id: 'p2' })
    expect(projectView()).toHaveAttribute('data-project', 'p2')
    expect(projectView()).toHaveAttribute('data-review', 'pending')
  })

  it('"Needs action" tiles behave like the matching row', () => {
    const { unmount } = renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'tile send' }))
    expect(projectView()).toHaveAttribute('data-project', 'p1')
    expect(projectView()).toHaveAttribute('data-cor-filter', 'draft')
    unmount()

    h.handleSelectProject.mockReset()
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'tile review' }))
    const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
    expect(within(sheet).getByRole('heading', { name: 'Review tickets' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: /Alpha Tower/ }))
    expect(projectView()).toHaveAttribute('data-project', 'p1')
    expect(projectView()).toHaveAttribute('data-review', 'pending')
  })

  it('newProject -> the new project page', () => {
    renderDashboard()
    tapFooter('New project')
    expect(h.navigate).toHaveBeenCalledWith('/projects/new')
  })

  it('opens the sheet from the portfolio header button with company totals', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'portfolio quick actions' }))
    const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
    expect(within(sheet).getByRole('button', { name: /^Review tickets/ })).toHaveTextContent('5')
    expect(within(sheet).getByRole('button', { name: 'New project' })).toBeInTheDocument()
  })

  it('alerts open the project with details loaded; approval alerts go to ticket review', () => {
    const { unmount } = renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'alert approvals' }))
    expect(h.handleSelectProject.mock.calls[0][0]).toMatchObject({ id: 'p2' })
    expect(h.setSelectedProject).not.toHaveBeenCalled()
    expect(projectView()).toHaveAttribute('data-review', 'pending')
    unmount()

    h.handleSelectProject.mockReset()
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'alert cors' }))
    expect(h.handleSelectProject).toHaveBeenCalledTimes(1)
    expect(projectView()).toHaveAttribute('data-section', 'cors')
  })
})
