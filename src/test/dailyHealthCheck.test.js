/**
 * Daily health-check regression tests
 *
 * Guards two silent-wrong-answer defects caught by the daily code review:
 *
 *   1. `getWeeklyDisposalSummary` initialized only 4 buckets
 *      (concrete/trash/metals/hazardous_waste) but the app supports 6
 *      load types — every copper/asphalt row landed on an undefined slot
 *      and made the running total `NaN`.
 *
 *   2. `estimateMonthlyCostRate` fell back from `project.totalCosts` to
 *      `project.billable` when the caller passed portfolio-shape projects
 *      (which carry `allCostsTotal`, not `totalCosts`). `billable` is
 *      earned revenue, not actual cost — using it as a burn-rate proxy
 *      inflated payables on profitable projects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ------------------------------------------------------------------
// 1. Weekly disposal aggregator — must include copper + asphalt
// ------------------------------------------------------------------

const { mockQuery, mockClient } = vi.hoisted(() => {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn(),
  }
  return { mockQuery: q, mockClient: { from: vi.fn(() => q) } }
})

vi.mock('../lib/db/client', () => ({
  supabase: mockClient,
  isSupabaseConfigured: true,
  getClient: () => mockClient,
  getConnectionStatus: () => 'online',
  observe: { query: vi.fn(), error: vi.fn() },
  cacheCrewCheckin: vi.fn(),
  cacheDailyReport: vi.fn(),
  getCachedDailyReport: vi.fn(),
  cacheMessage: vi.fn(),
  addPendingAction: vi.fn(),
  ACTION_TYPES: {},
  generateTempId: () => 'temp',
  getLocalData: () => null,
  setLocalData: vi.fn(),
  sanitizeFormData: (x) => x,
  sanitize: (x) => x,
}))

import { fieldOps } from '../lib/db/fieldOps'

describe('getWeeklyDisposalSummary — all six load types roll up', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rolls up copper and asphalt loads into per-week buckets (no NaN, no drop)', async () => {
    // Rows across one ISO week (2026-08-09 Sunday start)
    const rows = [
      { load_type: 'concrete', load_count: 3, work_date: '2026-08-10' },
      { load_type: 'trash', load_count: 2, work_date: '2026-08-10' },
      { load_type: 'metals', load_count: 1, work_date: '2026-08-11' },
      { load_type: 'hazardous_waste', load_count: 1, work_date: '2026-08-11' },
      { load_type: 'copper', load_count: 5, work_date: '2026-08-12' },
      { load_type: 'asphalt', load_count: 4, work_date: '2026-08-12' },
    ]
    mockQuery.order.mockResolvedValueOnce({ data: rows, error: null })

    const weekly = await fieldOps.getWeeklyDisposalSummary('proj-1', 1)

    expect(weekly).toHaveLength(1)
    const [wk] = weekly
    expect(wk.concrete).toBe(3)
    expect(wk.trash).toBe(2)
    expect(wk.metals).toBe(1)
    expect(wk.hazardous_waste).toBe(1)
    expect(wk.copper).toBe(5)
    expect(wk.asphalt).toBe(4)

    const total = wk.concrete + wk.trash + wk.metals
      + wk.hazardous_waste + wk.copper + wk.asphalt
    expect(total).toBe(16)
    expect(Number.isFinite(total)).toBe(true)
  })

  it('handles copper-only weeks without producing NaN totals', async () => {
    const rows = [
      { load_type: 'copper', load_count: 7, work_date: '2026-08-12' },
    ]
    mockQuery.order.mockResolvedValueOnce({ data: rows, error: null })

    const weekly = await fieldOps.getWeeklyDisposalSummary('proj-1', 1)

    expect(weekly).toHaveLength(1)
    expect(weekly[0].copper).toBe(7)
    // Every other bucket must be numeric zero, never undefined
    for (const key of ['concrete', 'trash', 'metals', 'hazardous_waste', 'asphalt']) {
      expect(weekly[0][key]).toBe(0)
    }
  })

  it('does not drop future new load types silently (defensive init)', async () => {
    const rows = [
      { load_type: 'green_waste', load_count: 2, work_date: '2026-08-12' },
    ]
    mockQuery.order.mockResolvedValueOnce({ data: rows, error: null })

    const weekly = await fieldOps.getWeeklyDisposalSummary('proj-1', 1)

    expect(weekly).toHaveLength(1)
    // Should be 2, not NaN — the aggregator initializes missing keys to 0.
    expect(weekly[0].green_waste).toBe(2)
  })
})

// ------------------------------------------------------------------
// 2. Cash-flow burn rate — must use actual costs, not billable
// ------------------------------------------------------------------

import { projectPayables, CASH_FLOW_CONFIG } from '../lib/cashFlowCalculations'

describe('projectPayables — burn rate driven by actual costs, not earned revenue', () => {
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  it('uses `allCostsTotal` when `totalCosts` is not on the project (portfolio shape)', () => {
    // A profitable project: earned revenue (billable) exceeds actual costs.
    // If the code silently fell back to `billable`, payables would be
    // inflated 2× here.
    const project = {
      id: 'p1',
      name: 'Profitable',
      progress: 50,
      contractValue: 200_000,
      allCostsTotal: 30_000,   // real costs to date
      billable: 60_000,         // earned revenue
      startDate,
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const { entries } = projectPayables([project], [], CASH_FLOW_CONFIG)
    expect(entries.length).toBeGreaterThan(0)

    // Monthly cost rate should reflect $30k over ~3 months = ~$10k/mo,
    // never the ~$20k/mo you'd get if billable ($60k) were used.
    const fullMonth = entries.find(p => p.type === 'projected')
    expect(fullMonth.amount).toBeGreaterThan(6_000)
    expect(fullMonth.amount).toBeLessThan(15_000)
  })

  it('respects `totalCosts` when the caller provides it directly (single-project shape)', () => {
    const project = {
      id: 'p2',
      name: 'Explicit',
      progress: 40,
      contractValue: 100_000,
      totalCosts: 25_000,
      startDate,
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const { entries } = projectPayables([project], [], CASH_FLOW_CONFIG)
    const fullMonth = entries.find(p => p.type === 'projected')
    // $25k over ~3 months elapsed ≈ ~$8k/mo
    expect(fullMonth.amount).toBeGreaterThan(5_000)
    expect(fullMonth.amount).toBeLessThan(12_000)
  })

  it('falls back to contract-value estimate when neither cost field is set', () => {
    // No totalCosts, no allCostsTotal, no billable — must NOT be zero and
    // must not throw. Contract × 0.75 / months = fallback path.
    const project = {
      id: 'p3',
      name: 'No cost data',
      progress: 20,
      contractValue: 120_000,
      startDate,
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const { entries } = projectPayables([project], [], CASH_FLOW_CONFIG)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0].amount).toBeGreaterThan(0)
  })
})
