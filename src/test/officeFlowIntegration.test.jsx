/**
 * Office flows end to end, across the four Phase 1 packages.
 *
 * Dashboard, useProjectViewState, OfficeQuickActions, ProjectDetailView,
 * FinancialsTab, TMList, CORList, DashboardModals, CORForm and TicketSelector
 * are all real, so every shared contract (C1-C4, C6) is exercised on both
 * sides. Only the data hooks, the database and views outside these flows are
 * stubbed.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const h = vi.hoisted(() => ({
  handleSelectProject: vi.fn(),
  initialSelected: null,
  projects: [],
  projectData: null,
  queue: null,
  tickets: [],
  cors: [],
  dailyReportProps: null,
  db: {}
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../lib/supabase', () => ({ db: h.db, supabase: {}, isSupabaseConfigured: true }))
vi.mock('../lib/BrandingContext', () => ({ useBranding: () => ({ branding: {} }) }))
vi.mock('../lib/TradeConfigContext', () => ({ useTradeConfig: () => ({ resolvedConfig: {} }) }))
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
vi.mock('../components/UniversalSearch', () => ({
  default: () => null,
  useUniversalSearch: () => ({ isOpen: false, setIsOpen: () => {}, close: () => {} })
}))

vi.mock('../hooks/useDashboardData', async () => {
  const { useState } = await import('react')
  return {
    default: function useDashboardDataStub() {
      const [selectedProject, setSelected] = useState(h.initialSelected)
      h.handleSelectProject.mockImplementation((project) => setSelected(project))
      return {
        projects: h.projects,
        projectsData: h.projects,
        selectedProject,
        setSelectedProject: setSelected,
        areas: [], setAreas: () => {}, loading: false, costCodes: [],
        corRefreshKey: 0, bumpCORRefresh: () => {}, debouncedRefresh: () => {},
        loadProjects: () => {}, loadAreas: () => {},
        handleSelectProject: h.handleSelectProject,
        invalidateProjectCache: () => {},
        projectData: h.projectData,
        progressCalculations: { progress: 0, billable: 0, changeOrderValue: 0, revisedContractValue: 0 },
        fieldActivity: {}, activityPulse: 0
      }
    }
  }
})
vi.mock('../hooks/usePortfolioMetrics', () => ({
  default: () => ({ portfolioMetrics: {}, projectHealth: {}, scheduleMetrics: {}, riskAnalysis: { allAlerts: [], projectRisks: [] } })
}))
vi.mock('../hooks/useProjectEdit', () => ({
  default: () => ({ editMode: false, handleCancelEdit: () => {}, handleDeleteProject: () => {}, handleEditClick: () => {} })
}))
vi.mock('../hooks/useOfficeQueue', () => ({ default: () => h.queue }))

// Views outside the flows under test
vi.mock('../components/dashboard/PortfolioView', () => ({
  default: ({ onQuickAction }) => (
    <div data-testid="portfolio-view">
      <button onClick={() => onQuickAction('review')}>tile review</button>
    </div>
  )
}))
vi.mock('../components/dashboard/tabs/OverviewTab', () => ({
  default: ({ onOpenTicketReview }) => (
    <div data-testid="overview-tab">
      <button onClick={onOpenTicketReview}>open approvals</button>
    </div>
  )
}))
vi.mock('../components/dashboard/ProjectSummaryBar', () => ({ default: () => null }))
vi.mock('../components/HeroMetrics', () => ({ default: () => null }))
vi.mock('../components/FinancialsNav', () => ({ default: () => null }))
vi.mock('../components/billing/SageExport', () => ({ default: () => null }))
vi.mock('../components/cor/CORLogPreview', () => ({ default: () => <div data-testid="cor-log-preview" /> }))
vi.mock('../components/cor/CORLog', () => ({ default: () => null }))
vi.mock('../components/tm/TMDashboard', () => ({ default: () => <div data-testid="tm-dashboard" /> }))
vi.mock('../components/SignatureLinkGenerator', () => ({
  default: ({ documentId }) => <div data-testid="signature-link-generator">{documentId}</div>
}))
vi.mock('../components/TMForm', () => ({ default: () => <div data-testid="tm-form" /> }))
vi.mock('../components/DailyReport', () => ({
  default: (props) => {
    h.dailyReportProps = props
    return <div data-testid="daily-report-form" />
  }
}))
vi.mock('../components/DailyReportsList', () => ({ default: () => null }))
vi.mock('../components/InjuryReportsList', () => ({ default: () => null }))
vi.mock('../components/PhotoTimeline', () => ({ default: () => null }))
vi.mock('../components/FieldObservationsList', () => ({ default: () => null }))

import Dashboard from '../components/Dashboard'
import { EMPTY_QUEUE_COUNTS } from '../lib/officeActions'

const VIEW_KEY = 'fieldsync-tm-default-view'
const counts = (overrides = {}) => ({ ...EMPTY_QUEUE_COUNTS, ...overrides })
const p1 = { id: 'p1', name: 'Alpha Tower', job_number: '1001', company_id: 'c1' }
const p2 = { id: 'p2', name: 'Bravo Mall', job_number: '1002', company_id: 'c1' }

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const ticket = (overrides = {}) => ({
  id: 't-signed',
  project_id: 'p1',
  work_date: daysAgo(1),
  ce_pco_number: null,
  notes: 'Extra demo',
  status: 'client_signed',
  foreman_signature_data: 'sig',
  client_signature_data: 'sig',
  change_order_value: null,
  assigned_cor_id: null,
  photos: [],
  t_and_m_workers: [{ id: 'w-1', name: 'Ann Smith', role: 'Laborer', hours: 8, overtime_hours: 0 }],
  t_and_m_items: [],
  ...overrides
})

const cor = (overrides = {}) => ({
  id: 'cor-1',
  cor_number: 'COR-001',
  title: 'Draft one',
  scope_of_work: 'Extra demo',
  status: 'draft',
  cor_total: 125000,
  created_at: new Date().toISOString(),
  period_start: '2026-10-01',
  period_end: '2026-10-05',
  ...overrides
})

function makeQueue(byProject) {
  const totals = counts()
  for (const c of Object.values(byProject)) {
    for (const key of ['readyToApprove', 'awaitingSignature', 'readyForCOR', 'draftCORs', 'withClient']) totals[key] += c[key]
  }
  return { byProject, totals, forProject: (id) => byProject[id] || EMPTY_QUEUE_COUNTS, loading: false, ready: true, refresh: () => {} }
}

// Server-side status filter, like getTMTicketsPaginated
const paginated = (_projectId, { status } = {}) => {
  const wanted = status == null ? null : [].concat(status)
  const tickets = h.tickets.filter(t => !wanted || wanted.includes(t.status))
  return Promise.resolve({ tickets, hasMore: false, totalCount: tickets.length })
}

const renderDashboard = () => render(
  <Dashboard company={{ id: 'c1' }} user={{ id: 'u1', name: 'Dana Lee' }} isAdmin onShowToast={() => {}} />
)
const tapRow = (label) => {
  fireEvent.click(screen.getByRole('button', { name: /^Quick actions/, expanded: false }))
  const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
  fireEvent.click(within(sheet).getByRole('button', { name: new RegExp(`^${label}`) }))
}
const tapFooter = (...labels) => {
  fireEvent.click(screen.getByRole('button', { name: /^Quick actions/, expanded: false }))
  const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
  for (const label of labels) fireEvent.click(within(sheet).getByRole('button', { name: label }))
}
const corStatusTab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

// The tabs, lists and modals are React.lazy chunks; load them once up front so
// no test waits on a cold module import
beforeAll(async () => {
  await Promise.all([
    import('../components/dashboard/tabs/FinancialsTab'),
    import('../components/dashboard/tabs/FieldActivityTab'),
    import('../components/dashboard/tabs/ReportsTab'),
    import('../components/TMList'),
    import('../components/cor/CORList'),
    import('../components/cor/CORForm')
  ])
}, 30000)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  h.handleSelectProject.mockReset()
  h.projects = [p1, p2]
  h.initialSelected = p1
  h.projectData = { pendingTickets: 2, corPendingCount: 0 }
  h.dailyReportProps = null
  h.queue = makeQueue({
    p1: counts({ readyToApprove: 1, awaitingSignature: 1, readyForCOR: 1, draftCORs: 1, withClient: 1 })
  })
  h.tickets = [
    ticket(),
    ticket({ id: 't-unsigned', status: 'foreman_signed', client_signature_data: null, notes: 'Unsigned work' }),
    ticket({ id: 't-approved', status: 'approved', notes: 'Approved work', change_order_value: 500 })
  ]
  h.cors = [
    cor(),
    cor({ id: 'cor-2', cor_number: 'COR-002', title: 'Out with client', status: 'pending_approval' }),
    cor({ id: 'cor-3', cor_number: 'COR-003', title: 'Signed off', status: 'approved' })
  ]

  for (const key of Object.keys(h.db)) delete h.db[key]
  Object.assign(h.db, {
    getTMTicketsPaginated: vi.fn(paginated),
    getTMTickets: vi.fn(() => Promise.resolve(h.tickets)),
    isTicketEditable: vi.fn().mockResolvedValue({ editable: true }),
    getTicketImportStatus: vi.fn().mockResolvedValue({ import_status: 'completed' }),
    getAllLaborClassRates: vi.fn().mockResolvedValue([]),
    getLaborRates: vi.fn().mockResolvedValue([]),
    getAllMaterialsEquipment: vi.fn().mockResolvedValue([]),
    getNextCORNumber: vi.fn().mockResolvedValue('COR-004'),
    subscribeToTMTickets: vi.fn(() => ({ id: 'tm-sub' })),
    subscribeToCORs: vi.fn(() => ({ id: 'cor-sub' })),
    unsubscribe: vi.fn(),
    resolvePhotoUrls: vi.fn().mockResolvedValue([]),
    approveTMTicket: vi.fn(),
    rejectTMTicket: vi.fn(),
    getCORs: vi.fn(() => Promise.resolve(h.cors)),
    getCORStats: vi.fn().mockResolvedValue({}),
    getRFISummary: vi.fn().mockResolvedValue(null),
    getSubmittalSummary: vi.fn().mockResolvedValue(null),
    getFieldObservations: vi.fn().mockResolvedValue([])
  })
})

describe('Review tickets', () => {
  it('from inside a project: the ticket list opens on "To review" in list mode, all dates', async () => {
    localStorage.setItem(VIEW_KEY, 'dashboard')
    h.tickets[1] = ticket({ id: 't-unsigned', status: 'foreman_signed', client_signature_data: null, notes: 'Unsigned work', work_date: daysAgo(40) })
    renderDashboard()

    tapRow('Review tickets')

    const toReview = await screen.findByRole('tab', { name: /^To review/ })
    expect(toReview).toHaveClass('active')
    // pendingTotal (C2) feeds the tab count from the project data
    expect(within(toReview).getByText('2')).toBeInTheDocument()
    // List, not the charts dashboard, and the saved preference is untouched
    expect(screen.queryByTestId('tm-dashboard')).toBeNull()
    expect(localStorage.getItem(VIEW_KEY)).toBe('dashboard')
    // The server was asked for every status awaiting approval
    expect(h.db.getTMTicketsPaginated).toHaveBeenLastCalledWith('p1', expect.objectContaining({
      status: ['pending', 'foreman_signed', 'client_signed']
    }))
    // Both unapproved tickets show, including the one older than 7 days
    expect(await screen.findByText('Client signed')).toBeInTheDocument()
    expect(screen.getByText('Awaiting client signature')).toBeInTheDocument()
  })

  it('from the portfolio: picks the project, opens it through handleSelectProject, lands on "To review"', async () => {
    h.initialSelected = null
    h.queue = makeQueue({
      p1: counts({ readyToApprove: 1 }),
      p2: counts({ readyToApprove: 2 })
    })
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: 'tile review' }))
    const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
    expect(within(sheet).getByText('Choose a project')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: /Alpha Tower/ }))

    expect(h.handleSelectProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    expect(await screen.findByRole('tab', { name: /^To review/ })).toHaveClass('active')
    expect(screen.queryByRole('dialog', { name: 'Quick actions' })).toBeNull()
    expect(screen.queryByTestId('tm-dashboard')).toBeNull()
    expect(h.db.getTMTicketsPaginated).toHaveBeenLastCalledWith('p1', expect.objectContaining({
      status: ['pending', 'foreman_signed', 'client_signed']
    }))
  })

  it('an unsigned ticket cannot be approved; a client-signed one can', async () => {
    renderDashboard()
    tapRow('Review tickets')

    // Review order: the client-signed ticket first, then the one still unsigned
    await screen.findByText('Client signed')
    const [signed, unsigned] = screen.getAllByRole('article')

    // Client-signed ticket: Approve is offered
    fireEvent.click(within(signed).getByRole('button', { name: 'Expand ticket details' }))
    expect(within(signed).getByRole('button', { name: 'Approve this ticket' })).toBeInTheDocument()

    // Foreman-signed only: no Approve, a signature link instead
    fireEvent.click(within(unsigned).getByRole('button', { name: 'Expand ticket details' }))
    expect(within(unsigned).getByText('Awaiting client signature')).toBeInTheDocument()
    expect(within(unsigned).queryByRole('button', { name: 'Approve this ticket' })).toBeNull()
    expect(within(unsigned).getByText('Needs client signature')).toBeInTheDocument()
    expect(within(unsigned).getByRole('button', { name: 'Get signature link for this ticket' })).toBeInTheDocument()
    expect(h.db.approveTMTicket).not.toHaveBeenCalled()
  })

  it('offers "Build COR" on the review queue from the server count, and opens the ticket picker', async () => {
    renderDashboard()
    tapRow('Review tickets')

    // "To review" loads no approved tickets; the count comes from the office queue
    const cta = await screen.findByRole('button', { name: 'Build COR from 1 approved ticket' })
    fireEvent.click(cta)

    expect(await screen.findByText('Import from Time & Material Tickets', { selector: 'h2' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Ready for COR/ })).toHaveClass('active')
  })
})

describe('PendingApprovalsBanner "View & Approve"', () => {
  it('goes to the ticket review queue when tickets are waiting', async () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /View & Approve/ }))
    expect(await screen.findByRole('tab', { name: /^To review/ })).toHaveClass('active')
  })

  it('goes to the CORs out for approval when no ticket is waiting', async () => {
    h.projectData = { pendingTickets: 0, corPendingCount: 1 }
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /View & Approve/ }))

    await waitFor(() => expect(corStatusTab('Pending')).toHaveAttribute('aria-selected', 'true'))
    expect(await screen.findByText('Out with client')).toBeInTheDocument()
    expect(screen.queryByText('Draft one')).toBeNull()
  })
})

describe('COR quick actions', () => {
  it('"Build COR from tickets" opens the COR form on the ticket picker, "ready" filter', async () => {
    renderDashboard()
    tapRow('Build COR from tickets')

    expect(await screen.findByText('Import from Time & Material Tickets', { selector: 'h2' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Ready for COR/ })).toHaveClass('active')
    // Only the approved, unassigned ticket is offered
    expect(await screen.findByText(/Approved work/)).toBeInTheDocument()
    expect(screen.queryByText(/Unsigned work/)).toBeNull()
  })

  it('"New COR" opens the blank form without the ticket picker', async () => {
    renderDashboard()
    tapRow('New COR')

    expect(await screen.findByPlaceholderText(/Additional Demolition Work/)).toBeInTheDocument()
    expect(screen.queryByText('Import from Time & Material Tickets', { selector: 'h2' })).toBeNull()
  })

  it('"Send COR" lists the drafts', async () => {
    renderDashboard()
    tapRow('Send COR')

    await waitFor(() => expect(corStatusTab('Draft')).toHaveAttribute('aria-selected', 'true'))
    expect(await screen.findByText('Draft one')).toBeInTheDocument()
    expect(screen.queryByText('Out with client')).toBeNull()
    expect(screen.getByRole('button', { name: /Submit & send for signature/ })).toBeInTheDocument()
  })

  it('"Waiting on client" lists the CORs out for signature, and a second request re-filters the open list', async () => {
    renderDashboard()
    tapRow('Waiting on client')

    await waitFor(() => expect(corStatusTab('Pending')).toHaveAttribute('aria-selected', 'true'))
    expect(await screen.findByText('Out with client')).toBeInTheDocument()

    tapRow('Send COR')
    await waitFor(() => expect(corStatusTab('Draft')).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByText('Draft one')).toBeInTheDocument()
    expect(screen.queryByText('Out with client')).toBeNull()
  })
})

describe('Field entry', () => {
  it('footer "Field entry" opens the T&M ticket modal', async () => {
    renderDashboard()
    tapFooter('Field entry', 'T&M ticket')

    expect(await screen.findByTestId('tm-form')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New T&M ticket (entered by office)' })).toBeInTheDocument()
  })

  it('footer "Field entry" opens the daily report modal with the office props (C5)', async () => {
    renderDashboard()
    tapFooter('Field entry', 'Daily report')

    expect(await screen.findByTestId('daily-report-form')).toBeInTheDocument()
    expect(h.dailyReportProps).toMatchObject({ companyId: 'c1', submittedBy: 'Dana Lee', enteredByOffice: true })
    expect(h.dailyReportProps.project.id).toBe('p1')
  })

  it('"New ticket" in the ticket toolbar and "New daily report" in Reports stay reachable (C2, C6)', async () => {
    renderDashboard()
    tapRow('Review tickets')
    // Not offered on the review queue itself; it sits on the other ticket filters
    await screen.findByRole('tab', { name: /To review/ })
    expect(screen.queryByRole('button', { name: 'New ticket' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'New ticket' }))
    expect(await screen.findByTestId('tm-form')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('tab', { name: /Field Activity/ }))
    fireEvent.click(await screen.findByRole('button', { name: /New daily report/ }))
    expect(await screen.findByTestId('daily-report-form')).toBeInTheDocument()
    expect(h.dailyReportProps.enteredByOffice).toBe(true)
  })
})
