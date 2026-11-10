import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Office ticket review: the "To review" queue, the client-signature rule for
// approval, review requests from the project shell, and the COR call to action.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  db: {
    getTMTicketsPaginated: vi.fn(),
    isTicketEditable: vi.fn(),
    getTicketImportStatus: vi.fn(),
    getAllLaborClassRates: vi.fn(),
    subscribeToTMTickets: vi.fn(),
    unsubscribe: vi.fn(),
    resolvePhotoUrls: vi.fn(),
    approveTMTicket: vi.fn(),
    rejectTMTicket: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  db: mocks.db,
  supabase: {},
  isSupabaseConfigured: false
}))
vi.mock('../lib/BrandingContext', () => ({ useBranding: () => ({ branding: {} }) }))
vi.mock('../lib/pdfBranding', () => ({
  resolvePrimaryColor: vi.fn(),
  loadBrandLogo: vi.fn(),
  drawDocumentHeader: vi.fn(),
  drawContinuationAccent: vi.fn(),
  applyDocumentFooters: vi.fn()
}))
vi.mock('../lib/financialExport', () => ({ exportTMTicketsCSV: vi.fn() }))
vi.mock('../lib/safeXlsx', () => ({ loadXLSXSafe: vi.fn() }))
vi.mock('../components/SignatureLinkGenerator', () => ({
  default: ({ documentId }) => <div data-testid="signature-link-generator">{documentId}</div>
}))
vi.mock('../components/tm/TMDashboard', () => ({
  default: () => <div data-testid="tm-dashboard" />
}))

import TMList from '../components/TMList'
import TMTicketCard from '../components/tm/TMTicketCard'

const VIEW_KEY = 'fieldsync-tm-default-view'

const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const makeTicket = (overrides = {}) => ({
  id: 't-1',
  project_id: 'p-1',
  work_date: daysAgo(1),
  ce_pco_number: null,
  notes: '',
  status: 'foreman_signed',
  foreman_signature_data: 'sig',
  change_order_value: null,
  assigned_cor_id: null,
  photos: [],
  t_and_m_workers: [{ id: 'w-1', name: 'Ann Smith', role: 'Laborer', hours: 8, overtime_hours: 0 }],
  t_and_m_items: [],
  ...overrides
})

const project = { id: 'p-1', name: 'Tower A' }
const company = { id: 'c-1' }

// The mocked server filters by status like the real paginated query does.
const serveTickets = (all) => {
  mocks.db.getTMTicketsPaginated.mockImplementation(async (_projectId, { status } = {}) => {
    const wanted = status ? [].concat(status) : null
    const tickets = wanted ? all.filter(t => wanted.includes(t.status)) : all
    return { tickets, hasMore: false, totalCount: tickets.length }
  })
}

const renderList = (props = {}) => {
  const onShowToast = vi.fn()
  const utils = render(<TMList project={project} company={company} onShowToast={onShowToast} {...props} />)
  return { onShowToast, ...utils }
}

const cardFor = (dateLabel) => screen.getByRole('article', { name: new RegExp(dateLabel) })
const cardDates = () => screen.getAllByRole('article').map(card => card.querySelector('.tm-ticket-date').textContent)
const fmt = (dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.db.isTicketEditable.mockResolvedValue({ editable: true })
  mocks.db.getTicketImportStatus.mockResolvedValue({ import_status: 'completed' })
  mocks.db.getAllLaborClassRates.mockResolvedValue([])
  mocks.db.subscribeToTMTickets.mockReturnValue({ id: 'sub' })
  mocks.db.resolvePhotoUrls.mockResolvedValue([])
})

describe('TMList "To review" queue', () => {
  const foremanSigned = makeTicket({ id: 't-foreman', work_date: daysAgo(20) })
  const clientSigned = makeTicket({ id: 't-client', work_date: daysAgo(2), status: 'client_signed', client_signature_data: 'sig' })
  const plainPending = makeTicket({ id: 't-pending', work_date: daysAgo(40), status: 'pending', foreman_signature_data: null })
  const approved = makeTicket({ id: 't-approved', work_date: daysAgo(3), status: 'approved', client_signature_data: 'sig' })

  const openToReview = async () => {
    fireEvent.click(await screen.findByRole('tab', { name: /To review/ }))
    await waitFor(() => expect(mocks.db.getTMTicketsPaginated).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ status: ['pending', 'foreman_signed', 'client_signed'] })
    ))
    await screen.findAllByRole('article')
  }

  beforeEach(() => {
    localStorage.setItem(VIEW_KEY, 'list')
    serveTickets([foremanSigned, clientSigned, plainPending, approved])
  })

  it('labels the tab "To review" and counts every status awaiting approval', async () => {
    renderList()
    const tab = await screen.findByRole('tab', { name: /To review/ })
    expect(tab).toHaveTextContent('To review3')
    expect(screen.queryByRole('tab', { name: /^Pending/ })).toBeNull()
  })

  it('lists foreman-signed and client-signed tickets, with no 7-day cut', async () => {
    renderList()
    await openToReview()
    const dates = cardDates()
    expect(dates).toContain(fmt(foremanSigned.work_date))
    expect(dates).toContain(fmt(clientSigned.work_date))
    expect(dates).toContain(fmt(plainPending.work_date))
    expect(dates).not.toContain(fmt(approved.work_date))
    // Recent / All has no meaning in the review queue
    expect(screen.queryByRole('button', { name: 'Recent' })).toBeNull()
  })

  it('sorts client-signed tickets first, then oldest first', async () => {
    renderList()
    await openToReview()
    expect(cardDates()).toEqual([
      fmt(clientSigned.work_date),
      fmt(plainPending.work_date),
      fmt(foremanSigned.work_date)
    ])
  })

  it('select-all covers the signed tickets in the queue', async () => {
    renderList()
    await openToReview()
    fireEvent.click(screen.getByRole('checkbox', { name: /Select All/ }))
    expect(screen.getByRole('button', { name: 'Clear (3)' })).toBeInTheDocument()
  })

  it('uses pendingTotal for the tab count when provided', async () => {
    renderList({ pendingTotal: 12 })
    expect(await screen.findByRole('tab', { name: /To review/ })).toHaveTextContent('To review12')
  })

  it('a foreman-signed ticket shows "Needs client signature" with no Approve, and offers the signature link', async () => {
    renderList()
    await openToReview()
    const card = cardFor(fmt(foremanSigned.work_date))
    expect(within(card).getByText('Awaiting client signature')).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Expand ticket details' }))

    expect(within(card).getByText('Needs client signature')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /approve/i })).toBeNull()
    expect(within(card).getByRole('button', { name: 'Reject this ticket' })).toBeEnabled()

    const linkButton = within(card).getByRole('button', { name: 'Get signature link for this ticket' })
    expect(linkButton).toHaveClass('btn-primary')
    fireEvent.click(linkButton)
    expect(screen.getByTestId('signature-link-generator')).toHaveTextContent('t-foreman')
  })

  it('a client-signed ticket shows Approve and can be approved', async () => {
    mocks.db.approveTMTicket.mockResolvedValue({ id: 't-client', status: 'approved' })
    const { onShowToast } = renderList({ user: { id: 'u-1', email: 'dana@example.com' } })
    await openToReview()
    const card = cardFor(fmt(clientSigned.work_date))
    expect(within(card).getByText('Client signed')).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Expand ticket details' }))

    expect(within(card).queryByText('Needs client signature')).toBeNull()
    const approve = within(card).getByRole('button', { name: 'Approve this ticket' })
    expect(approve).toBeEnabled()
    fireEvent.click(approve)

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: /^Approve at \$250/ }))
    await waitFor(() => expect(mocks.db.approveTMTicket).toHaveBeenCalledWith('t-client', 'u-1', 'dana@example.com', 250))
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Ticket approved at $250.00', 'success'))
  })
})

describe('TMList review request', () => {
  const oldForemanSigned = makeTicket({ id: 't-old', work_date: daysAgo(30) })
  const recentApproved = makeTicket({ id: 't-approved', work_date: daysAgo(1), status: 'approved', client_signature_data: 'sig' })

  beforeEach(() => {
    serveTickets([oldForemanSigned, recentApproved])
  })

  it('on mount: shows the review queue as a list, all dates, without saving the display mode', async () => {
    localStorage.setItem(VIEW_KEY, 'dashboard')
    renderList({ reviewRequest: { key: 1, filter: 'pending' } })

    expect(await screen.findByRole('article', { name: new RegExp(fmt(oldForemanSigned.work_date)) })).toBeInTheDocument()
    expect(screen.queryByTestId('tm-dashboard')).toBeNull()
    expect(screen.getByRole('tab', { name: /To review/ })).toHaveAttribute('aria-selected', 'true')
    expect(mocks.db.getTMTicketsPaginated).toHaveBeenLastCalledWith(
      'p-1',
      expect.objectContaining({ status: ['pending', 'foreman_signed', 'client_signed'] })
    )
    expect(localStorage.getItem(VIEW_KEY)).toBe('dashboard')
  })

  it('does not save the forced list mode when no preference was stored', async () => {
    renderList({ reviewRequest: { key: 1, filter: 'pending' } })
    await screen.findByRole('article')
    expect(localStorage.getItem(VIEW_KEY)).not.toBe('list')
  })

  it('when the key changes while mounted: switches to the review queue', async () => {
    localStorage.setItem(VIEW_KEY, 'dashboard')
    const { rerender, onShowToast } = renderList()
    expect(await screen.findByTestId('tm-dashboard')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')

    rerender(
      <TMList project={project} company={company} onShowToast={onShowToast} reviewRequest={{ key: 2, filter: 'pending' }} />
    )

    expect(await screen.findByRole('article', { name: new RegExp(fmt(oldForemanSigned.work_date)) })).toBeInTheDocument()
    expect(screen.queryByTestId('tm-dashboard')).toBeNull()
    expect(screen.getByRole('tab', { name: /To review/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(localStorage.getItem(VIEW_KEY)).toBe('dashboard')
  })

  it('applies a request again when its key is incremented', async () => {
    localStorage.setItem(VIEW_KEY, 'list')
    const { rerender, onShowToast } = renderList({ reviewRequest: { key: 1, filter: 'pending' } })
    await screen.findByRole('article')

    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true'))

    // Same key: the user's own choice stands
    rerender(
      <TMList project={project} company={company} onShowToast={onShowToast} reviewRequest={{ key: 1, filter: 'pending' }} />
    )
    await act(async () => {})
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')

    rerender(
      <TMList project={project} company={company} onShowToast={onShowToast} reviewRequest={{ key: 2, filter: 'pending' }} />
    )
    await waitFor(() => expect(screen.getByRole('tab', { name: /To review/ })).toHaveAttribute('aria-selected', 'true'))
  })

  it('lets the user go back to the dashboard, and saves that choice', async () => {
    localStorage.setItem(VIEW_KEY, 'list')
    renderList({ reviewRequest: { key: 1, filter: 'pending' } })
    await screen.findByRole('article')
    fireEvent.click(screen.getByRole('button', { name: /Dashboard/ }))
    expect(await screen.findByTestId('tm-dashboard')).toBeInTheDocument()
    expect(localStorage.getItem(VIEW_KEY)).toBe('dashboard')
  })
})

describe('TMList office actions', () => {
  it('shows "New ticket" only when onCreateTicket is provided', async () => {
    localStorage.setItem(VIEW_KEY, 'list')
    serveTickets([makeTicket()])
    const onCreateTicket = vi.fn()
    const { unmount } = renderList({ onCreateTicket })
    const button = await screen.findByRole('button', { name: 'New ticket' })
    expect(button).toHaveClass('btn-secondary')
    fireEvent.click(button)
    expect(onCreateTicket).toHaveBeenCalledTimes(1)
    unmount()

    renderList()
    await screen.findByRole('article')
    expect(screen.queryByRole('button', { name: 'New ticket' })).toBeNull()
  })

  it('offers "Build COR from N approved tickets" for approved tickets not on a COR', async () => {
    localStorage.setItem(VIEW_KEY, 'list')
    serveTickets([
      makeTicket({ id: 'a-1', status: 'approved' }),
      makeTicket({ id: 'a-2', status: 'approved', work_date: daysAgo(2) }),
      makeTicket({ id: 'a-3', status: 'approved', assigned_cor_id: 'cor-1', work_date: daysAgo(3) }),
      makeTicket({ id: 'p-1', status: 'client_signed', work_date: daysAgo(4) })
    ])
    const onBuildCOR = vi.fn()
    renderList({ onBuildCOR })
    const cta = await screen.findByRole('button', { name: 'Build COR from 2 approved tickets' })
    fireEvent.click(cta)
    expect(onBuildCOR).toHaveBeenCalledTimes(1)
    expect(onBuildCOR).toHaveBeenCalledWith()
  })

  it('hides the COR call to action when nothing is ready or no handler is given', async () => {
    localStorage.setItem(VIEW_KEY, 'list')
    serveTickets([makeTicket({ id: 'a-3', status: 'approved', assigned_cor_id: 'cor-1' }), makeTicket({ id: 'p-1' })])
    const { unmount } = renderList({ onBuildCOR: vi.fn() })
    await screen.findAllByRole('article')
    expect(screen.queryByRole('button', { name: /Build COR/ })).toBeNull()
    unmount()

    serveTickets([makeTicket({ id: 'a-1', status: 'approved' })])
    renderList()
    await screen.findByRole('article')
    expect(screen.queryByRole('button', { name: /Build COR/ })).toBeNull()
  })

  it('says "1 approved ticket" for a single ticket', async () => {
    localStorage.setItem(VIEW_KEY, 'list')
    serveTickets([makeTicket({ id: 'a-1', status: 'approved' })])
    renderList({ onBuildCOR: vi.fn() })
    expect(await screen.findByRole('button', { name: 'Build COR from 1 approved ticket' })).toBeInTheDocument()
  })

  it('shows labor plus materials on the collapsed card, not materials alone', async () => {
    localStorage.setItem(VIEW_KEY, 'list')
    mocks.db.getAllLaborClassRates.mockResolvedValue([
      { id: 'lc-lab', name: 'Laborer', labor_class_rates: [{ work_type: 'demolition', job_type: 'standard', regular_rate: 50, overtime_rate: 75 }] }
    ])
    serveTickets([makeTicket({
      t_and_m_workers: [{ id: 'w-1', name: 'Ann Smith', role: 'Laborer', labor_class_id: 'lc-lab', hours: 8, overtime_hours: 0 }],
      t_and_m_items: [{ id: 'i-1', quantity: 3, materials_equipment: { name: 'Poly', unit: 'roll', cost_per_unit: 10 } }]
    })])
    renderList({ project: { ...project, work_type: 'demolition', job_type: 'standard' } })
    const card = await screen.findByRole('article')
    await waitFor(() => expect(card.querySelector('.tm-ticket-total')).toHaveTextContent('$430.00'))
  })
})

describe('TMTicketCard review actions', () => {
  const renderCard = (ticket, props = {}) => {
    const handlers = {
      onApprove: vi.fn(),
      onReject: vi.fn(),
      onDelete: vi.fn(),
      onShowSignatureLink: vi.fn()
    }
    render(
      <TMTicketCard
        ticket={ticket}
        isExpanded
        isSelected={false}
        isLocked={false}
        lockInfo={undefined}
        hasFailedImport={false}
        isRetrying={false}
        onToggleExpand={vi.fn()}
        onToggleSelect={vi.fn()}
        onUpdateStatus={vi.fn()}
        onOpenCorAssign={vi.fn()}
        onRetryImport={vi.fn()}
        onEdit={vi.fn()}
        formatDate={(d) => String(d).slice(0, 10)}
        calculateTotalHours={() => 8}
        calculateTicketTotal={() => 30}
        {...handlers}
        {...props}
      />
    )
    return handlers
  }

  const actions = () => within(screen.getByRole('group', { name: 'Ticket actions' }))

  it('pending ticket without a client signature: no Approve, signature link is the primary action', () => {
    const handlers = renderCard(makeTicket({ status: 'pending', foreman_signature_data: null }))
    expect(screen.getByText('Needs client signature')).toBeInTheDocument()
    expect(actions().queryByRole('button', { name: /approve/i })).toBeNull()
    fireEvent.click(actions().getByRole('button', { name: 'Get signature link for this ticket' }))
    expect(handlers.onShowSignatureLink).toHaveBeenCalledWith(expect.objectContaining({ id: 't-1' }))
    fireEvent.click(actions().getByRole('button', { name: 'Reject this ticket' }))
    expect(handlers.onReject).toHaveBeenCalledWith(expect.objectContaining({ id: 't-1' }))
    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  it('foreman-signed ticket that already carries a client signature can be approved', () => {
    const handlers = renderCard(makeTicket({ client_signature_data: 'sig' }))
    expect(screen.queryByText('Needs client signature')).toBeNull()
    fireEvent.click(actions().getByRole('button', { name: 'Approve this ticket' }))
    expect(handlers.onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: 't-1' }))
  })

  it('shows no client-signature notice on approved or locked tickets', () => {
    renderCard(makeTicket({ status: 'approved' }))
    expect(screen.queryByText('Needs client signature')).toBeNull()
  })

  it('keeps Delete last and apart from Approve / Reject', () => {
    const handlers = renderCard(makeTicket({ status: 'client_signed', client_signature_data: 'sig' }))
    const buttons = actions().getAllByRole('button')
    const last = buttons[buttons.length - 1]
    expect(last).toHaveAccessibleName('Delete this ticket')
    expect(last).toHaveClass('tm-delete-btn')
    expect(last).not.toHaveClass('btn-danger')
    const names = buttons.map(b => b.getAttribute('aria-label'))
    expect(names.indexOf('Delete this ticket') - names.indexOf('Reject this ticket')).toBeGreaterThan(1)
    fireEvent.click(last)
    expect(handlers.onDelete).toHaveBeenCalledWith('t-1')
  })
})
