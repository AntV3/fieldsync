/**
 * Daily FieldSync health-check regressions (2026-10-01).
 *
 * Locks in five discrepancies surfaced in that day's code review:
 *   1. Project equipment cost (cents) was summed with labor/materials/custom (dollars),
 *      inflating `allCostsTotal` and `totalBurn` by ~100× on every project with rentals.
 *   2. cashFlowCalculations.projectReceivables read invoices.amount (nonexistent) and
 *      invoices.date (nonexistent) — every outstanding invoice contributed $0.
 *   3. corOps.addProjectCost defaulted cost_date to UTC today (one-day drift for US PM users).
 *   4. equipmentOps.markEquipmentReturned defaulted end_date to UTC today (billed extra day).
 *   5. offlineManager.getCachedCrewCheckin compared against UTC today (missed cached rows for
 *      US-evening users once sibling writes started stamping local dates).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { equipmentOps } from '../lib/equipmentOps'
import { projectReceivables, CASH_FLOW_CONFIG } from '../lib/cashFlowCalculations'
import { getLocalDateString } from '../lib/utils'

describe('equipmentOps.calculateProjectEquipmentCost — cents semantics', () => {
  it('returns cents when daily_rate is stored in cents (and callers must divide by 100 for dollars)', () => {
    // $500/day for 10 days (inclusive) = $5000 = 500_000 cents
    const rentals = [{
      start_date: '2026-09-22',
      end_date: '2026-10-01',
      daily_rate: 50_000, // cents
    }]
    const cents = equipmentOps.calculateProjectEquipmentCost(rentals)
    expect(cents).toBe(500_000)
    expect(cents / 100).toBe(5_000) // dashboard rollup expects this before summing
  })

  it('still returns 0 for an empty rental list (nothing to inflate)', () => {
    expect(equipmentOps.calculateProjectEquipmentCost([])).toBe(0)
  })
})

describe('projectReceivables — reads invoices.total (cents) and invoices.invoice_date', () => {
  it('converts invoices.total cents to dollars and subtracts amount_paid', () => {
    // Keep this test independent of the parallel status-filter change in PR #337 —
    // use only `sent` (always included) so the assertion holds whether or not that PR
    // has landed. The purpose here is to lock the cents→dollars + invoice_date fix.
    const invoices = [
      {
        id: 'inv-1',
        project_id: 'p-1',
        status: 'sent',
        invoice_date: '2026-09-20',
        total: 120_000_00, // $120,000.00 in cents
        amount_paid: 20_000_00, // $20,000.00 already received
      },
      {
        id: 'inv-2',
        project_id: 'p-1',
        status: 'sent',
        invoice_date: '2026-09-25',
        total: 50_000_00,
        amount_paid: 10_000_00,
      },
    ]

    const result = projectReceivables([], invoices, CASH_FLOW_CONFIG)
    const outstanding = result.entries.filter(e => e.type === 'outstanding')

    expect(outstanding.map(e => e.projectId)).toEqual(['p-1', 'p-1'])
    const byDate = Object.fromEntries(outstanding.map(e => [e.date, e.amount]))
    expect(byDate['2026-09-20']).toBe(100_000) // $120k billed - $20k paid
    expect(byDate['2026-09-25']).toBe(40_000)  // $50k billed - $10k paid
    expect(result.totalOutstanding).toBe(140_000)
  })

  it('falls back to legacy `amount` (dollars) when `total` is absent', () => {
    const invoices = [{
      id: 'legacy',
      project_id: 'p-2',
      status: 'sent',
      invoice_date: '2026-09-15',
      amount: 7_500, // legacy demo rows stored dollars under `amount`
    }]
    const result = projectReceivables([], invoices, CASH_FLOW_CONFIG)
    const outstanding = result.entries.filter(e => e.type === 'outstanding')
    expect(outstanding).toHaveLength(1)
    expect(outstanding[0].amount).toBe(7_500)
  })

  it('never emits negative amounts when paid > total (defensive)', () => {
    const invoices = [{
      id: 'overpaid',
      project_id: 'p-3',
      status: 'sent',
      invoice_date: '2026-09-15',
      total: 100_00,
      amount_paid: 999_99,
    }]
    const result = projectReceivables([], invoices, CASH_FLOW_CONFIG)
    const outstanding = result.entries.filter(e => e.type === 'outstanding')
    expect(outstanding[0].amount).toBe(0)
  })
})

describe('getLocalDateString — defense-in-depth for defaults', () => {
  it('returns a YYYY-MM-DD string in the user’s local timezone, not UTC', () => {
    // 2026-10-01 23:30 US/Pacific is 2026-10-02 06:30 UTC.
    // toISOString().split('T')[0] would yield the UTC date — the bug we removed from
    // corOps.addProjectCost, equipmentOps.markEquipmentReturned, and
    // offlineManager.getCachedCrewCheckin.
    const dt = new Date(2026, 9, 1, 23, 30, 0) // local 2026-10-01 23:30
    expect(getLocalDateString(dt)).toBe('2026-10-01')
  })
})

// Verify the three bug sites no longer reach for toISOString().split('T')[0].
// These are source-level assertions so a future refactor can't silently reintroduce
// the UTC default without failing CI.
describe('UTC-default regressions — source-level', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('corOps.addProjectCost does not default cost_date via toISOString()', async () => {
    const src = await import('fs').then(fs => fs.readFileSync('src/lib/corOps.js', 'utf8'))
    // Scope grep to the addProjectCost method body (search between its signature and the
    // next method). If the pattern comes back inside that slice, the UTC default is back.
    const start = src.indexOf('async addProjectCost(')
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('async ', start + 20)
    const body = src.slice(start, end > -1 ? end : src.length)
    expect(body).not.toMatch(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/)
    expect(body).toMatch(/getLocalDateString\(\)/)
  })

  it('equipmentOps.markEquipmentReturned does not default end_date via toISOString()', async () => {
    const src = await import('fs').then(fs => fs.readFileSync('src/lib/equipmentOps.js', 'utf8'))
    const start = src.indexOf('async markEquipmentReturned(')
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('async ', start + 20)
    const body = src.slice(start, end > -1 ? end : src.length)
    expect(body).not.toMatch(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/)
    expect(body).toMatch(/getLocalDateString\(\)/)
  })

  it('offlineManager.getCachedCrewCheckin compares against the local date, not UTC', async () => {
    const src = await import('fs').then(fs => fs.readFileSync('src/lib/offlineManager.js', 'utf8'))
    const start = src.indexOf('getCachedCrewCheckin')
    expect(start).toBeGreaterThan(-1)
    const end = src.indexOf('\n}\n', start)
    const body = src.slice(start, end > -1 ? end : src.length)
    expect(body).not.toMatch(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/)
    expect(body).toMatch(/getLocalDateString\(\)/)
  })
})
