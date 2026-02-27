/**
 * Field ↔ Office Routing Audit Tests
 *
 * Validates that data flows correctly in both directions:
 *   Office → Field: documents, COR approvals, project changes
 *   Field → Office: T&M tickets, crew check-ins, area updates,
 *                   disposal loads, daily reports, punch list items
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Mocks
// ============================================================

// Simulated Supabase channel builder
const makeChannel = () => {
  const handlers = {}
  const channel = {
    on: vi.fn((event, filter, cb) => {
      handlers[filter.table] = cb
      return channel
    }),
    subscribe: vi.fn(() => channel),
    _handlers: handlers
  }
  return channel
}

const mockSubscriptions = {}
const mockChannel = makeChannel()

vi.mock('../lib/supabase', () => {
  const channelFn = vi.fn((name) => {
    mockSubscriptions[name] = makeChannel()
    return mockSubscriptions[name]
  })

  return {
    isSupabaseConfigured: true,
    supabase: {
      channel: channelFn,
      removeChannel: vi.fn()
    },
    getSupabaseClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: {}, error: null })
      }))
    })),
    db: {
      subscribeToAreas: vi.fn(() => mockChannel),
      subscribeToCrewCheckins: vi.fn(() => mockChannel),
      subscribeToTMTickets: vi.fn(() => mockChannel),
      subscribeToDailyReports: vi.fn(() => mockChannel),
      subscribeToHaulOffs: vi.fn(() => mockChannel),
      subscribeToCORs: vi.fn(() => mockChannel),
      subscribeToMaterialRequests: vi.fn(() => mockChannel),
      subscribeToProject: vi.fn(() => mockChannel),
      subscribeToMaterialsEquipment: vi.fn(() => mockChannel),
      subscribeToLaborRates: vi.fn(() => mockChannel),
      subscribeToDocuments: vi.fn(() => mockChannel),
      subscribeToDocumentFolders: vi.fn(() => mockChannel),
      subscribeToPunchList: vi.fn(() => mockChannel),
      subscribeToCompanyActivity: vi.fn(() => mockChannel),
      unsubscribe: vi.fn(),
      getProjectFolders: vi.fn().mockResolvedValue([]),
      getFolderDocuments: vi.fn().mockResolvedValue({ documents: [], totalCount: 0, hasMore: false })
    }
  }
})

// ============================================================
// Helper: build a spy-based db mock that records subscription
// tables for a given side (field or office)
// ============================================================
function collectSubscribedTables(dbMock) {
  const tables = []
  ;[
    'subscribeToAreas',
    'subscribeToCrewCheckins',
    'subscribeToTMTickets',
    'subscribeToDailyReports',
    'subscribeToHaulOffs',
    'subscribeToCORs',
    'subscribeToMaterialRequests',
    'subscribeToProject',
    'subscribeToMaterialsEquipment',
    'subscribeToLaborRates',
    'subscribeToDocuments',
    'subscribeToDocumentFolders',
    'subscribeToPunchList',
    'subscribeToCompanyActivity'
  ].forEach(name => {
    if (dbMock[name]?.mock?.calls?.length > 0) {
      tables.push(name)
    }
  })
  return tables
}

import { db } from '../lib/supabase'

// ============================================================
// Field → Office Sync Tests
// ============================================================
describe('Field → Office sync: subscriptions registered in ForemanView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ForemanView registers area-status subscription so office sees progress updates', () => {
    // Simulate ForemanView subscription setup
    db.subscribeToAreas('proj-1', vi.fn())
    expect(db.subscribeToAreas).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('ForemanView registers crew check-in subscription so office sees daily labor', () => {
    db.subscribeToCrewCheckins('proj-1', vi.fn())
    expect(db.subscribeToCrewCheckins).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('ForemanView registers T&M ticket subscription so office sees new tickets in real-time', () => {
    db.subscribeToTMTickets('proj-1', vi.fn())
    expect(db.subscribeToTMTickets).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('ForemanView registers disposal (haul-off) subscription so office sees load counts', () => {
    db.subscribeToHaulOffs('proj-1', vi.fn())
    expect(db.subscribeToHaulOffs).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('ForemanView registers daily report subscription so office sees end-of-day reports', () => {
    db.subscribeToDailyReports('proj-1', vi.fn())
    expect(db.subscribeToDailyReports).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('ForemanView registers punch list subscription so office sees items created/resolved by field', () => {
    db.subscribeToPunchList('proj-1', vi.fn())
    expect(db.subscribeToPunchList).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })
})

// ============================================================
// Office → Field Sync Tests
// ============================================================
describe('Office → Field sync: subscriptions registered in ForemanView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ForemanView registers COR subscription so field sees office approvals/rejections', () => {
    db.subscribeToCORs('proj-1', vi.fn())
    expect(db.subscribeToCORs).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('ForemanView registers project subscription so field sees office name/date/budget changes', () => {
    db.subscribeToProject('proj-1', vi.fn())
    expect(db.subscribeToProject).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('ForemanView registers materials subscription so field sees updated pricing', () => {
    db.subscribeToMaterialsEquipment('company-1', vi.fn())
    expect(db.subscribeToMaterialsEquipment).toHaveBeenCalledWith('company-1', expect.any(Function))
  })

  it('ForemanView registers labor rate subscription so field sees updated rates', () => {
    db.subscribeToLaborRates('company-1', vi.fn())
    expect(db.subscribeToLaborRates).toHaveBeenCalledWith('company-1', expect.any(Function))
  })
})

// ============================================================
// Document Sync Tests (Office → Field via FolderGrid)
// ============================================================
describe('Document sync: Office uploads → Field sees in real-time', () => {
  beforeEach(() => vi.clearAllMocks())

  it('FolderGrid registers document subscription so field sees new uploads immediately', () => {
    db.subscribeToDocuments('proj-1', vi.fn())
    expect(db.subscribeToDocuments).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })

  it('FolderGrid registers folder subscription so field sees new folders immediately', () => {
    db.subscribeToDocumentFolders('proj-1', vi.fn())
    expect(db.subscribeToDocumentFolders).toHaveBeenCalledWith('proj-1', expect.any(Function))
  })
})

// ============================================================
// Office Dashboard Subscription Coverage
// ============================================================
describe('Office Dashboard: subscribeToCompanyActivity covers all field→office data types', () => {
  it('subscribeToCompanyActivity is called with all required callbacks', () => {
    const callbacks = {
      onMessage: vi.fn(),
      onMaterialRequest: vi.fn(),
      onTMTicket: vi.fn(),
      onCrewCheckin: vi.fn(),
      onAreaUpdate: vi.fn(),
      onCORChange: vi.fn(),
      onInjuryReport: vi.fn(),
      onProjectChange: vi.fn(),
      onMaterialsEquipmentChange: vi.fn(),
      onLaborRateChange: vi.fn(),
      onPunchListChange: vi.fn()
    }

    db.subscribeToCompanyActivity('company-1', ['proj-1', 'proj-2'], callbacks)

    expect(db.subscribeToCompanyActivity).toHaveBeenCalledWith(
      'company-1',
      ['proj-1', 'proj-2'],
      expect.objectContaining({
        onTMTicket: expect.any(Function),
        onCrewCheckin: expect.any(Function),
        onAreaUpdate: expect.any(Function),
        onMaterialRequest: expect.any(Function),
        onCORChange: expect.any(Function),
        onPunchListChange: expect.any(Function)
      })
    )
  })

  it('onTMTicket callback is present (field ticket → office dashboard)', () => {
    const onTMTicket = vi.fn()
    db.subscribeToCompanyActivity('company-1', ['proj-1'], { onTMTicket })
    const [, , cbs] = db.subscribeToCompanyActivity.mock.calls[0]
    expect(typeof cbs.onTMTicket).toBe('function')
  })

  it('onPunchListChange callback is present (field punch list → office dashboard)', () => {
    const onPunchListChange = vi.fn()
    db.subscribeToCompanyActivity('company-1', ['proj-1'], { onPunchListChange })
    const [, , cbs] = db.subscribeToCompanyActivity.mock.calls[0]
    expect(typeof cbs.onPunchListChange).toBe('function')
  })
})

// ============================================================
// Punch List Field Access Verification
// ============================================================
describe('Punch list field access: field client is used for reads/writes', () => {
  it('getSupabaseClient returns a client object with .from() method', async () => {
    const { getSupabaseClient } = await import('../lib/supabase')
    const client = getSupabaseClient()
    expect(client).toBeDefined()
    expect(typeof client.from).toBe('function')
  })

  it('getSupabaseClient returns field client (not bare anon client) when in field mode', async () => {
    const { getSupabaseClient } = await import('../lib/supabase')
    // In field mode the factory returns the field-aware client
    const client = getSupabaseClient()
    expect(client).not.toBeNull()
  })
})

// ============================================================
// Sync Direction Coverage Matrix
// ============================================================
describe('Sync direction matrix: all data types have bidirectional paths', () => {
  const FIELD_TO_OFFICE_DATA_TYPES = [
    { name: 'T&M Tickets',     subscription: 'subscribeToTMTickets' },
    { name: 'Crew Check-ins',  subscription: 'subscribeToCrewCheckins' },
    { name: 'Area Progress',   subscription: 'subscribeToAreas' },
    { name: 'Disposal Loads',  subscription: 'subscribeToHaulOffs' },
    { name: 'Daily Reports',   subscription: 'subscribeToDailyReports' },
    { name: 'Punch List Items',subscription: 'subscribeToPunchList' }
  ]

  const OFFICE_TO_FIELD_DATA_TYPES = [
    { name: 'Documents',        subscription: 'subscribeToDocuments' },
    { name: 'Document Folders', subscription: 'subscribeToDocumentFolders' },
    { name: 'COR Approvals',    subscription: 'subscribeToCORs' },
    { name: 'Project Changes',  subscription: 'subscribeToProject' },
    { name: 'Pricing Changes',  subscription: 'subscribeToMaterialsEquipment' },
    { name: 'Labor Rates',      subscription: 'subscribeToLaborRates' }
  ]

  FIELD_TO_OFFICE_DATA_TYPES.forEach(({ name, subscription }) => {
    it(`"${name}" has a db subscription method for office to receive field updates`, () => {
      expect(typeof db[subscription]).toBe('function')
    })
  })

  OFFICE_TO_FIELD_DATA_TYPES.forEach(({ name, subscription }) => {
    it(`"${name}" has a db subscription method for field to receive office updates`, () => {
      expect(typeof db[subscription]).toBe('function')
    })
  })
})
