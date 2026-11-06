import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor, act } from '@testing-library/react'

// Offline T&M submit (launch item 3): the field UI shows tickets saved on the
// phone. Everything below lib/supabase is mocked so these tests do not need
// IndexedDB or a backend.

const supabaseMock = vi.hoisted(() => {
  const syncListeners = new Set()
  const connectionListeners = new Set()
  return {
    syncListeners,
    connectionListeners,
    online: true,
    fieldMode: true,
    summary: { queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 },
    emitSync(event) { syncListeners.forEach(cb => cb(event)) },
    emitConnection(online) {
      this.online = online
      connectionListeners.forEach(cb => cb(online))
    }
  }
})

vi.mock('../lib/supabase', () => ({
  db: {
    getCrewCheckin: vi.fn(),
    getTMTicketCountByDate: vi.fn(() => Promise.resolve(0)),
    getDisposalLoads: vi.fn(() => Promise.resolve([])),
    getTruckCount: vi.fn(() => Promise.resolve(null)),
    getDailyReport: vi.fn(() => Promise.resolve(null)),
    getAreas: vi.fn(() => Promise.resolve([])),
    getPhases: vi.fn(() => Promise.resolve([])),
    unsubscribe: vi.fn()
  },
  isSupabaseConfigured: false,
  getSupabaseClient: vi.fn(),
  getConnectionStatus: vi.fn(() => supabaseMock.online),
  onConnectionChange: vi.fn((cb) => {
    supabaseMock.connectionListeners.add(cb)
    return () => supabaseMock.connectionListeners.delete(cb)
  }),
  getPendingActionCount: vi.fn(() => Promise.resolve(0)),
  getPendingSyncSummary: vi.fn(() => Promise.resolve({ ...supabaseMock.summary })),
  onSyncStateChange: vi.fn((cb) => {
    supabaseMock.syncListeners.add(cb)
    return () => supabaseMock.syncListeners.delete(cb)
  }),
  isFieldMode: vi.fn(() => supabaseMock.fieldMode)
}))

vi.mock('../lib/TradeConfigContext', () => ({
  useTradeConfig: () => ({ resolvedConfig: null, companyConfig: null }),
  TradeConfigProvider: ({ children }) => children
}))

// ForemanView's sub-screens are not under test; keep their import graphs out.
vi.mock('../components/TMForm', () => ({ default: () => null }))
vi.mock('../components/CrewCheckin', () => ({ default: () => null }))
vi.mock('../components/DailyReport', () => ({ default: () => null }))
vi.mock('../components/InjuryReportForm', () => ({ default: () => null }))
vi.mock('../components/DisposalLoadInput', () => ({ default: () => null }))
vi.mock('../components/FieldObservations', () => ({ default: () => null }))
vi.mock('../components/documents/FolderGrid', () => ({ default: () => null }))
vi.mock('../components/ForemanMetrics', () => ({ default: () => null }))
vi.mock('../components/PunchList', () => ({ default: () => null }))
vi.mock('../components/RFIList', () => ({ default: () => null }))

import * as supabase from '../lib/supabase'
import ForemanLanding from '../components/ForemanLanding'
import ForemanView from '../components/ForemanView'
import OfflineIndicator from '../components/OfflineIndicator'

const project = { id: 'proj-1', name: 'Sunrise Apartments' }

const todayStatus = {
  crewCheckedIn: false,
  crewCount: 0,
  tmTicketsToday: 0,
  dailyReportDone: false,
  disposalLoadsToday: 0,
  trucksUsedToday: 0
}

const summary = (overrides = {}) => {
  const s = { queued: 0, syncing: 0, needs_auth: 0, failed: 0, ...overrides }
  return { ...s, total: s.queued + s.syncing + s.needs_auth + s.failed }
}

function renderLanding(props = {}) {
  return render(
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
      onNavigate={() => {}}
      onShowToast={() => {}}
      {...props}
    />
  )
}

const tmCard = () => screen.getByRole('button', { name: /T&M Ticket/ })
const banner = () => document.querySelector('.sdx-fld-sync')

beforeEach(() => {
  localStorage.clear()
  supabaseMock.online = true
  supabaseMock.fieldMode = true
  supabaseMock.summary = summary()
  supabaseMock.syncListeners.clear()
  supabaseMock.connectionListeners.clear()
  vi.clearAllMocks()
})

describe('ForemanLanding pending T&M tickets', () => {
  it('shows "1 waiting to sync" on the T&M card', () => {
    renderLanding({ pendingTmTickets: summary({ queued: 1 }), isOnline: false })
    expect(within(tmCard()).getByText('1 waiting to sync')).toBeInTheDocument()
  })

  it('counts every unsynced ticket on the card, including needs-sign-in and failed', () => {
    renderLanding({ pendingTmTickets: summary({ queued: 1, needs_auth: 1, failed: 1 }) })
    expect(within(tmCard()).getByText('3 waiting to sync')).toBeInTheDocument()
  })

  it('falls back to today\'s count when nothing is waiting', () => {
    renderLanding({ todayStatus: { ...todayStatus, tmTicketsToday: 2 }, pendingTmTickets: summary() })
    expect(within(tmCard()).getByText('2 today')).toBeInTheDocument()
    expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument()
  })

  it('banner: offline with one ticket says "1 ticket saved on phone"', () => {
    renderLanding({ pendingTmTickets: summary({ queued: 1 }), isOnline: false })
    expect(banner()).toHaveTextContent('1 ticket saved on phone')
    expect(banner()).toHaveTextContent('Will sync automatically when you have signal')
  })

  it('banner: offline counts all tickets on the phone, plural', () => {
    renderLanding({ pendingTmTickets: summary({ queued: 1, failed: 1 }), isOnline: false })
    expect(banner()).toHaveTextContent('2 tickets saved on phone')
  })

  it('banner: needs sign-in', () => {
    renderLanding({ pendingTmTickets: summary({ needs_auth: 1 }) })
    expect(banner()).toHaveTextContent('Sign in to sync 1 ticket')
  })

  it('banner: could not sync', () => {
    renderLanding({ pendingTmTickets: summary({ failed: 2 }) })
    expect(banner()).toHaveTextContent('2 tickets could not sync — tell the office')
  })

  it('banner: syncing', () => {
    renderLanding({ pendingTmTickets: summary({ queued: 1, syncing: 1 }), ticketSyncInProgress: true })
    expect(banner()).toHaveTextContent('Syncing 2 tickets…')
  })

  it('banner: online but still queued (radio not routable yet) says saved on phone', () => {
    renderLanding({ pendingTmTickets: summary({ queued: 1 }) })
    expect(banner()).toHaveTextContent('1 ticket saved on phone')
  })

  it('banner: legacy queued updates and plain offline still show', () => {
    const { unmount } = renderLanding({ pendingActionCount: 3 })
    expect(banner()).toHaveTextContent('3 updates saved offline')
    unmount()
    renderLanding({ isOnline: false })
    expect(banner()).toHaveTextContent('Working offline')
  })

  it('banner: hidden when online with nothing pending', () => {
    renderLanding({ pendingTmTickets: summary() })
    expect(banner()).toBeNull()
  })
})

describe('ForemanView pending T&M count', () => {
  const renderView = () => render(
    <ForemanView project={project} companyId="co-1" foremanName="Sam Rivera" onShowToast={toast} onExit={() => {}} />
  )
  let toast

  beforeEach(() => {
    toast = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets the count even when getCrewCheckin rejects (offline), with no refresh toast', async () => {
    supabaseMock.online = false
    supabaseMock.summary = summary({ queued: 1 })
    supabase.db.getCrewCheckin.mockRejectedValue(new TypeError('Failed to fetch'))

    renderView()

    await waitFor(() => {
      expect(within(tmCard()).getByText('1 waiting to sync')).toBeInTheDocument()
    })
    expect(banner()).toHaveTextContent('1 ticket saved on phone')
    expect(supabase.getPendingSyncSummary).toHaveBeenCalledWith({ projectId: 'proj-1' })
    expect(supabase.db.getCrewCheckin).toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalledWith('Unable to refresh today’s status', 'error')
  })

  it('still shows the refresh toast when online', async () => {
    supabase.db.getCrewCheckin.mockRejectedValue(new Error('boom'))
    renderView()
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('Unable to refresh today’s status', 'error')
    })
  })

  it('re-reads the count on sync events', async () => {
    supabase.db.getCrewCheckin.mockResolvedValue(null)
    supabaseMock.summary = summary({ queued: 2 })
    renderView()
    await waitFor(() => {
      expect(within(tmCard()).getByText('2 waiting to sync')).toBeInTheDocument()
    })

    supabaseMock.summary = summary({ queued: 1, syncing: 1 })
    act(() => supabaseMock.emitSync({ type: 'sync_start', count: 2 }))
    await waitFor(() => expect(banner()).toHaveTextContent('Syncing 2 tickets…'))

    supabaseMock.summary = summary()
    act(() => supabaseMock.emitSync({ type: 'sync_complete', synced: 2, failed: 0, remaining: 0 }))
    await waitFor(() => {
      expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument()
    })
  })

  it('keeps zero when the summary read throws (no IndexedDB)', async () => {
    supabase.db.getCrewCheckin.mockResolvedValue(null)
    supabase.getPendingSyncSummary.mockRejectedValueOnce(new Error('indexedDB is not defined'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderView()
    await waitFor(() => expect(supabase.getPendingSyncSummary).toHaveBeenCalled())
    expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument()
  })
})

describe('OfflineIndicator ticket states (field mode)', () => {
  const pill = () => document.querySelector('.offline-indicator')

  it('offline: "Offline · 1 ticket saved on phone"', async () => {
    supabaseMock.online = false
    supabaseMock.summary = summary({ queued: 1 })
    render(<OfflineIndicator />)
    await waitFor(() => expect(pill()).toHaveTextContent('Offline · 1 ticket saved on phone'))
  })

  it('offline with no tickets keeps today\'s offline text', async () => {
    supabaseMock.online = false
    render(<OfflineIndicator />)
    await waitFor(() => expect(supabase.getPendingSyncSummary).toHaveBeenCalled())
    expect(pill()).toHaveTextContent('Offline')
    expect(pill()).not.toHaveTextContent('saved on phone')
  })

  it('needs sign-in', async () => {
    supabaseMock.summary = summary({ needs_auth: 2 })
    render(<OfflineIndicator />)
    await waitFor(() => expect(pill()).toHaveTextContent('Sign in to sync 2 tickets'))
  })

  it('needs sign-in wins over failed', async () => {
    supabaseMock.summary = summary({ needs_auth: 1, failed: 1 })
    render(<OfflineIndicator />)
    await waitFor(() => expect(pill()).toHaveTextContent('Sign in to sync 1 ticket'))
  })

  it('failed', async () => {
    supabaseMock.summary = summary({ failed: 1 })
    render(<OfflineIndicator />)
    await waitFor(() => expect(pill()).toHaveTextContent('1 ticket could not sync — tell the office'))
  })

  it('syncing, then synced after sync_complete, then hides', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      supabaseMock.summary = summary({ queued: 2 })
      render(<OfflineIndicator />)
      await waitFor(() => expect(pill()).toHaveTextContent('2 tickets saved on phone'))

      supabaseMock.summary = summary({ queued: 1, syncing: 1 })
      act(() => supabaseMock.emitSync({ type: 'sync_start', count: 2 }))
      await waitFor(() => expect(pill()).toHaveTextContent('Syncing 2 tickets…'))

      supabaseMock.summary = summary()
      act(() => supabaseMock.emitSync({ type: 'sync_complete', synced: 2, failed: 0, remaining: 0 }))
      await waitFor(() => expect(pill()).toHaveTextContent('Synced 2 tickets'))

      act(() => { vi.advanceTimersByTime(3100) })
      await waitFor(() => expect(pill()).toBeNull())
    } finally {
      vi.useRealTimers()
    }
  })

  it('no "Synced" when sync_complete synced nothing', async () => {
    render(<OfflineIndicator />)
    await waitFor(() => expect(supabase.getPendingSyncSummary).toHaveBeenCalled())
    act(() => supabaseMock.emitSync({ type: 'sync_complete', synced: 0, failed: 0, remaining: 0 }))
    await waitFor(() => expect(supabase.getPendingSyncSummary).toHaveBeenCalledTimes(2))
    expect(pill()).toBeNull()
  })

  it('office mode: no ticket states and no IndexedDB ticket read', async () => {
    supabaseMock.fieldMode = false
    supabaseMock.summary = summary({ failed: 1 })
    render(<OfflineIndicator />)
    await waitFor(() => expect(supabase.getPendingActionCount).toHaveBeenCalled())
    expect(supabase.getPendingSyncSummary).not.toHaveBeenCalled()
    expect(pill()).toBeNull()
  })

  it('renders without crashing when the summary read throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabase.getPendingSyncSummary.mockRejectedValueOnce(new Error('indexedDB is not defined'))
    render(<OfflineIndicator />)
    await waitFor(() => expect(supabase.getPendingSyncSummary).toHaveBeenCalled())
    expect(pill()).toBeNull()
  })
})
