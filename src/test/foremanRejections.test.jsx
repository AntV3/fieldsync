import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'

// Launch item 5 (rejection part): the office must give a reason when it
// rejects a T&M ticket, and the foreman sees it on the field home screen.
// lib/supabase is mocked for the components; tmOps runs for real against a
// fake client (lib/db/client is mocked separately).

const mocks = vi.hoisted(() => {
  const syncListeners = new Set()
  const connectionListeners = new Set()
  const chain = {
    calls: [],
    result: { data: [], error: null },
    reset() {
      this.calls = []
      this.result = { data: [], error: null }
    }
  }
  const builder = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve, reject) => {
          const r = chain.result
          return (r instanceof Error ? Promise.reject(r) : Promise.resolve(r)).then(resolve, reject)
        }
      }
      return (...args) => {
        chain.calls.push([prop, ...args])
        return builder
      }
    }
  })
  return {
    syncListeners,
    connectionListeners,
    online: true,
    chain,
    fakeClient: { from: (...args) => { chain.calls.push(['from', ...args]); return builder } },
    clientState: { configured: true, client: null },
    observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), activity: vi.fn() },
    db: {
      // ForemanView
      getCrewCheckin: vi.fn(),
      getTMTicketCountByDate: vi.fn(),
      getDisposalLoads: vi.fn(),
      getTruckCount: vi.fn(),
      getDailyReport: vi.fn(),
      getAreas: vi.fn(),
      getPhases: vi.fn(),
      getRejectedTMTickets: vi.fn(),
      // TMList
      getTMTicketsPaginated: vi.fn(),
      isTicketEditable: vi.fn(),
      getTicketImportStatus: vi.fn(),
      getAllLaborClassRates: vi.fn(),
      subscribeToTMTickets: vi.fn(),
      rejectTMTicket: vi.fn(),
      resolvePhotoUrls: vi.fn(),
      unsubscribe: vi.fn()
    }
  }
})

vi.mock('../lib/supabase', () => ({
  db: mocks.db,
  supabase: {},
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
  getConnectionStatus: vi.fn(() => mocks.online),
  onConnectionChange: vi.fn((cb) => {
    mocks.connectionListeners.add(cb)
    return () => mocks.connectionListeners.delete(cb)
  }),
  getPendingActionCount: vi.fn(() => Promise.resolve(0)),
  getPendingSyncSummary: vi.fn(() => Promise.resolve({ queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 })),
  onSyncStateChange: vi.fn((cb) => {
    mocks.syncListeners.add(cb)
    return () => mocks.syncListeners.delete(cb)
  }),
  isFieldMode: vi.fn(() => true)
}))

vi.mock('../lib/db/client', () => ({
  get supabase() { return mocks.clientState.client },
  get isSupabaseConfigured() { return mocks.clientState.configured },
  observe: mocks.observe,
  getClient: () => mocks.clientState.client,
  getSupabaseClient: () => mocks.clientState.client,
  isFieldMode: () => true,
  sanitize: { text: (v) => (v == null ? '' : String(v).trim()) }
}))

vi.mock('../lib/TradeConfigContext', () => ({
  useTradeConfig: () => ({ resolvedConfig: null, companyConfig: null }),
  TradeConfigProvider: ({ children }) => children
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
vi.mock('../components/SignatureLinkGenerator', () => ({ default: () => null }))
vi.mock('../components/tm/TMDashboard', () => ({ default: () => null }))

// ForemanView's sub-screens are not under test; keep their import graphs out.
// TMForm's onSubmit / onCancel are ForemanView's returnHome.
vi.mock('../components/TMForm', () => ({
  default: ({ onSubmit }) => <button type="button" data-testid="tm-form" onClick={onSubmit}>Submit T&M</button>
}))
vi.mock('../components/CrewCheckin', () => ({ default: () => null }))
vi.mock('../components/DailyReport', () => ({ default: () => null }))
vi.mock('../components/InjuryReportForm', () => ({ default: () => null }))
vi.mock('../components/DisposalLoadInput', () => ({ default: () => null }))
vi.mock('../components/FieldObservations', () => ({ default: () => null }))
vi.mock('../components/documents/FolderGrid', () => ({ default: () => null }))
vi.mock('../components/ForemanMetrics', () => ({ default: () => null }))
vi.mock('../components/PunchList', () => ({ default: () => null }))
vi.mock('../components/RFIList', () => ({ default: () => null }))

import { validateRejectionReason } from '../lib/tmStatus'
import { tmOps } from '../lib/db/tmOps'
import ForemanLanding from '../components/ForemanLanding'
import ForemanView from '../components/ForemanView'
import TMList from '../components/TMList'
import TMTicketCard from '../components/tm/TMTicketCard'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const project = { id: 'proj-1', name: 'Sunrise Apartments' }
const DISMISS_KEY = 'fm_dismissed_rejections_proj-1'

const todayStatus = {
  crewCheckedIn: false,
  crewCount: 0,
  tmTicketsToday: 0,
  dailyReportDone: false,
  disposalLoadsToday: 0,
  trucksUsedToday: 0
}

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()

const rejected = (overrides = {}) => ({
  id: 't-1',
  work_date: '2026-11-03',
  ce_pco_number: 'PCO-12',
  rejection_reason: 'Missing hours for J. Smith',
  rejected_at: minutesAgo(5),
  rejected_by_name: 'Dana Office',
  created_by_name: 'Sam Rivera',
  status: 'rejected',
  ...overrides
})

function renderLanding(props = {}) {
  const onNavigate = vi.fn()
  const utils = render(
    <ForemanLanding
      project={project}
      foremanName="Sam Rivera"
      todayStatus={todayStatus}
      progress={0}
      areas={[]}
      areasLoading={false}
      areasWorking={0}
      areasRemaining={0}
      punchListOpenCount={0}
      onNavigate={onNavigate}
      onShowToast={() => {}}
      {...props}
    />
  )
  return { ...utils, onNavigate }
}

const alertCard = () => document.querySelector('.sdx-fld-alert')

beforeEach(() => {
  localStorage.clear()
  mocks.online = true
  mocks.syncListeners.clear()
  mocks.connectionListeners.clear()
  mocks.chain.reset()
  mocks.clientState.configured = true
  mocks.clientState.client = mocks.fakeClient
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// validateRejectionReason
// ---------------------------------------------------------------------------

describe('validateRejectionReason', () => {
  it('treats a cancelled prompt (null / undefined) as cancelled', () => {
    expect(validateRejectionReason(null)).toEqual({ ok: false, cancelled: true })
    expect(validateRejectionReason(undefined)).toEqual({ ok: false, cancelled: true })
  })

  it('rejects an empty or whitespace-only reason', () => {
    const expected = { ok: false, error: 'Enter a reason so the foreman knows what to fix.' }
    expect(validateRejectionReason('')).toEqual(expected)
    expect(validateRejectionReason('   \n\t ')).toEqual(expected)
  })

  it('rejects a reason longer than 500 characters (after trimming)', () => {
    expect(validateRejectionReason('x'.repeat(501))).toEqual({ ok: false, error: 'Keep the reason under 500 characters.' })
    expect(validateRejectionReason(`  ${'x'.repeat(500)}  `)).toEqual({ ok: true, reason: 'x'.repeat(500) })
  })

  it('returns the trimmed reason', () => {
    expect(validateRejectionReason('  Missing hours for J. Smith ')).toEqual({ ok: true, reason: 'Missing hours for J. Smith' })
  })
})

// ---------------------------------------------------------------------------
// tmOps.getRejectedTMTickets
// ---------------------------------------------------------------------------

describe('tmOps.getRejectedTMTickets', () => {
  it('selects only the card columns for rejected tickets, newest rejection first', async () => {
    const rows = [rejected()]
    mocks.chain.result = { data: rows, error: null }

    await expect(tmOps.getRejectedTMTickets('proj-1')).resolves.toEqual(rows)

    const calls = mocks.chain.calls
    expect(calls[0]).toEqual(['from', 't_and_m_tickets'])
    const select = calls.find(c => c[0] === 'select')
    expect(select[1].split(',').map(s => s.trim()).sort()).toEqual([
      'ce_pco_number', 'created_by_name', 'id', 'rejected_at', 'rejected_by_name',
      'rejection_reason', 'status', 'work_date'
    ])
    expect(calls).toContainEqual(['eq', 'project_id', 'proj-1'])
    expect(calls).toContainEqual(['eq', 'status', 'rejected'])
    const order = calls.find(c => c[0] === 'order')
    expect(order[1]).toBe('rejected_at')
    expect(order[2]).toMatchObject({ ascending: false })
    expect(calls).toContainEqual(['limit', 20])
  })

  it('passes a custom limit', async () => {
    await tmOps.getRejectedTMTickets('proj-1', 5)
    expect(mocks.chain.calls).toContainEqual(['limit', 5])
  })

  it('returns [] and logs on a query error', async () => {
    mocks.chain.result = { data: null, error: { message: 'permission denied', code: '42501' } }
    await expect(tmOps.getRejectedTMTickets('proj-1')).resolves.toEqual([])
    expect(mocks.observe.error).toHaveBeenCalledWith('database', expect.objectContaining({
      operation: 'getRejectedTMTickets', message: 'permission denied'
    }))
  })

  it('returns [] when the request throws (offline)', async () => {
    mocks.chain.result = new TypeError('Failed to fetch')
    await expect(tmOps.getRejectedTMTickets('proj-1')).resolves.toEqual([])
    expect(mocks.observe.error).toHaveBeenCalled()
  })

  it('returns [] without a client or when Supabase is not configured', async () => {
    mocks.clientState.client = null
    await expect(tmOps.getRejectedTMTickets('proj-1')).resolves.toEqual([])
    mocks.clientState.client = mocks.fakeClient
    mocks.clientState.configured = false
    await expect(tmOps.getRejectedTMTickets('proj-1')).resolves.toEqual([])
    expect(mocks.chain.calls).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// ForemanLanding "needs attention" card
// ---------------------------------------------------------------------------

describe('ForemanLanding rejected tickets card', () => {
  it('renders date, PCO, reason, rejecter and relative time', () => {
    renderLanding({ rejectedTickets: [rejected()] })
    const card = alertCard()
    expect(card).not.toBeNull()
    const c = within(card)
    expect(c.getByText('1 ticket needs attention')).toBeInTheDocument()
    expect(c.getByText('Missing hours for J. Smith')).toBeInTheDocument()
    expect(c.getByText(/^T&M · Nov 3 · PCO PCO-12$/)).toBeInTheDocument()
    expect(c.getByText('Rejected by Dana Office · 5 min ago')).toBeInTheDocument()
  })

  it('lists every rejected ticket and omits missing parts', () => {
    renderLanding({
      rejectedTickets: [
        rejected(),
        rejected({ id: 't-2', ce_pco_number: null, rejected_by_name: null, rejection_reason: '', rejected_at: minutesAgo(60 * 26) })
      ]
    })
    const c = within(alertCard())
    expect(c.getByText('2 tickets need attention')).toBeInTheDocument()
    expect(c.getAllByRole('listitem')).toHaveLength(2)
    expect(c.getByText(/^T&M · Nov 3$/)).toBeInTheDocument()
    expect(c.getByText('No reason given')).toBeInTheDocument()
    expect(c.getByText('Rejected · yesterday')).toBeInTheDocument()
  })

  it('appears after the offline/sync banner', () => {
    renderLanding({ rejectedTickets: [rejected()], isOnline: false })
    const banner = document.querySelector('.sdx-fld-sync')
    expect(banner).not.toBeNull()
    expect(banner.compareDocumentPosition(alertCard()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('"Submit corrected ticket" navigates to the T&M form', () => {
    const { onNavigate } = renderLanding({ rejectedTickets: [rejected()] })
    fireEvent.click(within(alertCard()).getByRole('button', { name: /Submit corrected ticket/ }))
    expect(onNavigate).toHaveBeenCalledWith('tm')
  })

  it('renders no alert when there are no rejected tickets', () => {
    renderLanding({ rejectedTickets: [] })
    expect(alertCard()).toBeNull()
    renderLanding()
    expect(alertCard()).toBeNull()
  })

  it('Dismiss hides the ticket, stores id:rejected_at and survives a re-mount', () => {
    const ticket = rejected()
    const { unmount } = renderLanding({ rejectedTickets: [ticket] })
    fireEvent.click(within(alertCard()).getByRole('button', { name: /Dismiss/ }))
    expect(alertCard()).toBeNull()
    expect(JSON.parse(localStorage.getItem(DISMISS_KEY))).toEqual([`t-1:${ticket.rejected_at}`])

    unmount()
    renderLanding({ rejectedTickets: [ticket] })
    expect(alertCard()).toBeNull()
  })

  it('a newer rejection of the same ticket shows again', () => {
    const first = rejected({ rejected_at: '2026-11-03T15:00:00.000Z' })
    localStorage.setItem(DISMISS_KEY, JSON.stringify([`t-1:${first.rejected_at}`]))
    renderLanding({ rejectedTickets: [first] })
    expect(alertCard()).toBeNull()

    const again = rejected({ rejected_at: minutesAgo(2), rejection_reason: 'Still missing the lift rental' })
    renderLanding({ rejectedTickets: [again] })
    expect(within(alertCard()).getByText('Still missing the lift rental')).toBeInTheDocument()
  })

  it('dismissing one of two keeps the other visible', () => {
    renderLanding({ rejectedTickets: [rejected(), rejected({ id: 't-2', rejection_reason: 'Wrong date' })] })
    const items = within(alertCard()).getAllByRole('listitem')
    fireEvent.click(within(items[0]).getByRole('button', { name: /Dismiss/ }))
    const c = within(alertCard())
    expect(c.getByText('1 ticket needs attention')).toBeInTheDocument()
    expect(c.getByText('Wrong date')).toBeInTheDocument()
    expect(c.queryByText('Missing hours for J. Smith')).toBeNull()
  })

  it('dismissals are per project', () => {
    const ticket = rejected()
    localStorage.setItem('fm_dismissed_rejections_other-project', JSON.stringify([`t-1:${ticket.rejected_at}`]))
    renderLanding({ rejectedTickets: [ticket] })
    expect(alertCard()).not.toBeNull()
  })

  it('ignores corrupt stored dismissals', () => {
    localStorage.setItem(DISMISS_KEY, '{not json')
    renderLanding({ rejectedTickets: [rejected()] })
    expect(alertCard()).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ForemanView wiring
// ---------------------------------------------------------------------------

describe('ForemanView rejected tickets wiring', () => {
  let toast
  const renderView = () => render(
    <ForemanView project={project} companyId="co-1" foremanName="Sam Rivera" onShowToast={toast} onExit={() => {}} />
  )

  beforeEach(() => {
    toast = vi.fn()
    mocks.db.getCrewCheckin.mockResolvedValue({ workers: [] })
    mocks.db.getTMTicketCountByDate.mockResolvedValue(0)
    mocks.db.getDisposalLoads.mockResolvedValue([])
    mocks.db.getTruckCount.mockResolvedValue(null)
    mocks.db.getDailyReport.mockResolvedValue(null)
    mocks.db.getAreas.mockResolvedValue([])
    mocks.db.getPhases.mockResolvedValue([])
    mocks.db.getRejectedTMTickets.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads rejected tickets for the project on mount and shows the card', async () => {
    mocks.db.getRejectedTMTickets.mockResolvedValue([rejected()])
    renderView()
    await waitFor(() => expect(alertCard()).not.toBeNull())
    expect(mocks.db.getRejectedTMTickets).toHaveBeenCalledWith('proj-1')
    expect(within(alertCard()).getByText('Missing hours for J. Smith')).toBeInTheDocument()
  })

  it('shows the card even when the today-status reads fail', async () => {
    mocks.db.getCrewCheckin.mockRejectedValue(new Error('boom'))
    mocks.db.getRejectedTMTickets.mockResolvedValue([rejected()])
    renderView()
    await waitFor(() => expect(alertCard()).not.toBeNull())
  })

  it('"Submit corrected ticket" opens the T&M form, and returning Home refreshes the list', async () => {
    mocks.db.getRejectedTMTickets.mockResolvedValue([rejected()])
    renderView()
    await waitFor(() => expect(alertCard()).not.toBeNull())

    fireEvent.click(within(alertCard()).getByRole('button', { name: /Submit corrected ticket/ }))
    const form = await screen.findByTestId('tm-form')
    expect(mocks.db.getRejectedTMTickets).toHaveBeenCalledTimes(1)

    // The office restored the ticket meanwhile; submitting returns Home.
    mocks.db.getRejectedTMTickets.mockResolvedValue([])
    fireEvent.click(form)

    await waitFor(() => expect(mocks.db.getRejectedTMTickets).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(alertCard()).toBeNull())
  })

  it('returning Home from another screen re-reads rejected tickets', async () => {
    renderView()
    await waitFor(() => expect(mocks.db.getRejectedTMTickets).toHaveBeenCalledTimes(1))
    expect(alertCard()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Team' }))
    mocks.db.getRejectedTMTickets.mockResolvedValue([rejected()])
    fireEvent.click(document.querySelector('.fm-back'))

    await waitFor(() => expect(alertCard()).not.toBeNull())
    expect(mocks.db.getRejectedTMTickets).toHaveBeenCalledTimes(2)
  })

  it('offline: keeps the previous list and does not query', async () => {
    mocks.db.getRejectedTMTickets.mockResolvedValue([rejected()])
    renderView()
    await waitFor(() => expect(alertCard()).not.toBeNull())

    mocks.online = false
    fireEvent.click(screen.getByRole('button', { name: 'Team' }))
    mocks.db.getRejectedTMTickets.mockResolvedValue([])
    fireEvent.click(document.querySelector('.fm-back'))

    await waitFor(() => expect(mocks.db.getCrewCheckin).toHaveBeenCalledTimes(2))
    expect(mocks.db.getRejectedTMTickets).toHaveBeenCalledTimes(1)
    expect(alertCard()).not.toBeNull()
  })

  it('keeps the previous list when the connection drops during the read', async () => {
    mocks.db.getRejectedTMTickets.mockResolvedValue([rejected()])
    renderView()
    await waitFor(() => expect(alertCard()).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Team' }))
    mocks.db.getRejectedTMTickets.mockImplementation(async () => {
      mocks.online = false
      return []
    })
    fireEvent.click(document.querySelector('.fm-back'))

    await waitFor(() => expect(mocks.db.getRejectedTMTickets).toHaveBeenCalledTimes(2))
    expect(alertCard()).not.toBeNull()
  })

  it('a throwing read is swallowed and leaves no toast for it', async () => {
    mocks.db.getRejectedTMTickets.mockRejectedValue(new Error('nope'))
    renderView()
    await waitFor(() => expect(mocks.db.getRejectedTMTickets).toHaveBeenCalled())
    expect(alertCard()).toBeNull()
    expect(toast).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Office side: TMList reject + TMTicketCard note
// ---------------------------------------------------------------------------

const officeTicket = (overrides = {}) => ({
  id: 't-1',
  project_id: 'proj-1',
  work_date: new Date().toISOString().slice(0, 10),
  ce_pco_number: 'PCO-12',
  notes: 'Demo wall',
  status: 'foreman_signed',
  foreman_signature_data: 'x',
  assigned_cor_id: null,
  photos: [],
  t_and_m_workers: [{ id: 'w-1', name: 'Ann', role: 'Laborer', hours: 8, overtime_hours: 0 }],
  t_and_m_items: [],
  ...overrides
})

describe('TMList handleReject', () => {
  const user = { id: 'u-1', email: 'dana@example.com', user_metadata: { full_name: 'Dana Office' } }
  let promptSpy

  const setup = async () => {
    const ticket = officeTicket()
    mocks.db.getTMTicketsPaginated.mockResolvedValue({ tickets: [ticket], hasMore: false, totalCount: 1 })
    mocks.db.isTicketEditable.mockResolvedValue({ editable: true })
    mocks.db.getTicketImportStatus.mockResolvedValue({ import_status: 'completed', data_imported: true })
    mocks.db.getAllLaborClassRates.mockResolvedValue([])
    mocks.db.subscribeToTMTickets.mockReturnValue({ id: 'sub' })
    mocks.db.resolvePhotoUrls.mockResolvedValue([])
    const onShowToast = vi.fn()
    try { localStorage.setItem('fieldsync-tm-default-view', 'list') } catch (_e) { /* ignore */ }
    render(<TMList project={{ id: 'proj-1' }} company={{ id: 'c-1' }} user={user} onShowToast={onShowToast} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Expand ticket details' }))
    return { ticket, onShowToast }
  }

  const clickReject = () => fireEvent.click(screen.getByRole('button', { name: 'Reject this ticket' }))

  beforeEach(() => {
    promptSpy = vi.spyOn(window, 'prompt')
  })

  afterEach(() => {
    promptSpy.mockRestore()
  })

  it('blocks an empty reason: error toast and no DB call', async () => {
    const { onShowToast } = await setup()
    promptSpy.mockReturnValue('   ')
    clickReject()
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Enter a reason so the foreman knows what to fix.', 'error'))
    expect(mocks.db.rejectTMTicket).not.toHaveBeenCalled()
  })

  it('blocks a reason over 500 characters', async () => {
    const { onShowToast } = await setup()
    promptSpy.mockReturnValue('x'.repeat(501))
    clickReject()
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Keep the reason under 500 characters.', 'error'))
    expect(mocks.db.rejectTMTicket).not.toHaveBeenCalled()
  })

  it('does nothing when the prompt is cancelled', async () => {
    const { onShowToast } = await setup()
    promptSpy.mockReturnValue(null)
    clickReject()
    await act(async () => {})
    expect(mocks.db.rejectTMTicket).not.toHaveBeenCalled()
    expect(onShowToast).not.toHaveBeenCalled()
  })

  it('rejects with the trimmed reason and shows it on the card', async () => {
    const { onShowToast } = await setup()
    mocks.db.rejectTMTicket.mockResolvedValue({ id: 't-1', status: 'rejected', rejected_by_name: 'Dana Office', rejection_reason: 'Missing hours for J. Smith' })
    promptSpy.mockReturnValue('  Missing hours for J. Smith  ')
    clickReject()
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Ticket rejected', 'success'))
    expect(mocks.db.rejectTMTicket).toHaveBeenCalledWith('t-1', 'u-1', 'Dana Office', 'Missing hours for J. Smith')
    expect(await screen.findByText('Rejected by Dana Office: Missing hours for J. Smith')).toBeInTheDocument()
  })
})

describe('TMTicketCard rejected note', () => {
  const renderCard = (ticket) => render(
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
      onApprove={vi.fn()}
      onReject={vi.fn()}
      onUpdateStatus={vi.fn()}
      onDelete={vi.fn()}
      onOpenCorAssign={vi.fn()}
      onRetryImport={vi.fn()}
      onShowSignatureLink={vi.fn()}
      onEdit={vi.fn()}
      formatDate={(d) => String(d).slice(0, 10)}
      calculateTotalHours={() => 8}
      calculateTicketTotal={() => 30}
    />
  )

  beforeEach(() => {
    mocks.db.resolvePhotoUrls.mockResolvedValue([])
  })

  it('shows "Rejected by {name}: {reason}" next to Restore', () => {
    renderCard(officeTicket({ status: 'rejected', rejected_by_name: 'Dana Office', rejection_reason: 'Missing hours' }))
    expect(screen.getByRole('note')).toHaveTextContent('Rejected by Dana Office: Missing hours')
    expect(screen.getByRole('button', { name: 'Restore rejected ticket to pending' })).toBeInTheDocument()
  })

  it('omits the missing parts', () => {
    const { unmount } = renderCard(officeTicket({ status: 'rejected', rejected_by_name: null, rejection_reason: 'Missing hours' }))
    expect(screen.getByRole('note')).toHaveTextContent(/^Rejected: Missing hours$/)
    unmount()
    const second = renderCard(officeTicket({ status: 'rejected', rejected_by_name: 'Dana Office', rejection_reason: '' }))
    expect(screen.getByRole('note')).toHaveTextContent(/^Rejected by Dana Office$/)
    second.unmount()
    renderCard(officeTicket({ status: 'rejected' }))
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('shows no note on tickets that are not rejected', () => {
    renderCard(officeTicket({ status: 'approved', rejected_by_name: 'Dana Office', rejection_reason: 'old' }))
    expect(screen.queryByRole('note')).toBeNull()
  })
})
