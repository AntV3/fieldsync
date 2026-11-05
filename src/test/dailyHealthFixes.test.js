/**
 * Daily health-check regression suite (2026-10-16)
 *
 * Guards against today's five production bugs so they can't quietly return:
 *
 *   1. portfolioAnalyticsService.ts queried five columns that don't exist in
 *      the Supabase schema (areas.is_complete, change_orders.total_value,
 *      t_and_m_tickets.total_value, crew_checkins.worker_count,
 *      crew_checkins.checkin_date). Each returned $0 to Portfolio Analytics
 *      and the try/catch wrappers swallowed the PostgREST error.
 *   2. aiaBillingExport.js / SageExportPanel.jsx / sageExport.js read a
 *      nonexistent `area.sov_value` and fell back to `area.weight` (a 0–100
 *      percentage) used as a dollar amount — a $600K project printed on
 *      G702/G703 as "$100".
 *   3. src/lib/db/fieldOps.js took `new Date().toISOString().split('T')[0]`
 *      as default "today" for crew check-ins and daily reports, bucketing
 *      evening US entries into tomorrow's UTC date.
 *   4. compileDailyReport filtered `a.completed_at?.startsWith(reportDate)` —
 *      but the `areas` table has no `completed_at` column, so completed-today
 *      was always 0.
 *   5. CORList.jsx passed getCORStats.total_approved_value (already in dollars)
 *      to `formatCurrency` from corCalculations.js (expects cents), rendering
 *      $125,000 as "$1,250.00" — a 100× under-report in the sidebar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoFile = (p) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8')

// ============================================================
// 1. portfolioAnalyticsService: real column names
// ============================================================

describe('portfolioAnalyticsService — Supabase column names match the schema', () => {
  // Capture every .select() column list and every .eq()/.gte() column argument
  // so we can assert against real queries, not source greps.
  const seen = { selects: [], eqs: [], gtes: [] }

  // Only `projects` returns a non-empty row set so the service functions keep
  // going to the second-round table queries (areas, change_orders, …) rather
  // than short-circuiting on `!projects?.length`.
  function makeBuilder(tableName) {
    const resolvedData = tableName === 'projects'
      ? [{ id: 'p1', name: 'P1', contract_value: 1000, status: 'active', created_at: new Date().toISOString() }]
      : []
    const builder = {
      select: vi.fn((cols) => { seen.selects.push(String(cols)); return builder }),
      eq: vi.fn((col, _val) => { seen.eqs.push(String(col)); return builder }),
      gte: vi.fn((col, _val) => { seen.gtes.push(String(col)); return builder }),
      in: vi.fn(() => builder),
      not: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      filter: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn().mockResolvedValue({ data: resolvedData[0] ?? null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData[0] ?? null, error: null }),
      // Thenable so `await supabase.from(…).select(…).in(…)` resolves.
      then: (resolve) => resolve({ data: resolvedData, error: null })
    }
    return builder
  }

  beforeEach(() => {
    seen.selects = []
    seen.eqs = []
    seen.gtes = []
    vi.resetModules()
  })

  afterEach(() => { vi.restoreAllMocks() })

  async function loadService() {
    vi.doMock('../lib/supabaseClient', () => ({
      isSupabaseConfigured: true,
      supabase: { from: vi.fn((table) => makeBuilder(table)) }
    }))
    vi.doMock('../lib/observability', () => ({ observe: { error: vi.fn(), query: vi.fn() } }))
    return await import('../lib/services/portfolioAnalyticsService')
  }

  it('calls every function without crashing and never selects the dead columns', async () => {
    const svc = await loadService()

    await svc.getPortfolioFinancialSummary('co-1')
    await svc.getProjectFinancialComparison('co-1')
    await svc.getMonthlyRevenueTimeline('co-1')
    await svc.getPortfolioLaborSummary('co-1')
    await svc.getCrewDistribution('co-1')
    await svc.getLaborCostByProject('co-1')
    await svc.getPortfolioProgressSummary('co-1')
    await svc.getScheduleVarianceByProject('co-1')
    await svc.getAreaCompletionRates('co-1')
    await svc.getCORSummaryAcrossProjects('co-1')
    await svc.getCORByProject('co-1')
    await svc.getCORTrendByMonth('co-1')
    await svc.getPortfolioRiskMatrix('co-1')

    const allColumnText = [...seen.selects, ...seen.eqs, ...seen.gtes].join(' | ')

    // The old phantoms must never appear.
    expect(allColumnText).not.toMatch(/\bis_complete\b/)
    expect(allColumnText).not.toMatch(/\btotal_value\b/)
    expect(allColumnText).not.toMatch(/\bworker_count\b/)
    // `checkin_date` (no underscore in the middle) is the dead name; `check_in_date` is the real column.
    for (const col of seen.gtes) expect(col).not.toBe('checkin_date')
    for (const col of seen.eqs) expect(col).not.toBe('checkin_date')
  })

  it('selects the real schema columns for every rollup table', async () => {
    const svc = await loadService()

    await svc.getPortfolioFinancialSummary('co-1')
    await svc.getPortfolioLaborSummary('co-1')
    await svc.getCORSummaryAcrossProjects('co-1')

    // At least one query must select the right column for each table.
    const joined = seen.selects.join(' | ')
    expect(joined).toMatch(/\bstatus\b/)        // areas uses status, not is_complete
    expect(joined).toMatch(/\bcor_total\b/)     // change_orders uses cor_total (cents)
    expect(joined).toMatch(/\btotal_amount\b/)  // t_and_m_tickets stores total_amount
    expect(joined).toMatch(/\bworkers\b/)       // crew_checkins has workers JSONB, no worker_count
    expect(joined).toMatch(/\bcheck_in_date\b/) // crew_checkins has check_in_date (with underscore)

    // And the labor rollup must range over `check_in_date` specifically.
    expect(seen.gtes).toContain('check_in_date')
  })
})

// ============================================================
// 2. AIA / Sage SOV reads scheduled_value, never weight
// ============================================================

describe('AIA G702/G703 and Sage exports — SOV reads area.scheduled_value', () => {
  it('aiaBillingExport.buildG703Lines uses scheduled_value and never falls back to weight (a %)', async () => {
    const { buildG703Lines } = await import('../lib/aiaBillingExport')
    const project = { id: 'p1', contract_value: 600000 }
    const areas = [
      { id: 'a1', name: 'Demo',    weight: 25, scheduled_value: 150000, status: 'done'    },
      { id: 'a2', name: 'Install', weight: 75, scheduled_value: 450000, status: 'working' }
    ]
    const lines = buildG703Lines(project, areas)
    expect(lines).toHaveLength(2)
    expect(lines[0].scheduled_value).toBe(150000)
    expect(lines[1].scheduled_value).toBe(450000)
    // Guard against the old weight-as-dollars bug
    expect(lines[0].scheduled_value).not.toBe(25)
    expect(lines[1].scheduled_value).not.toBe(75)
  })

  it('aiaBillingExport does not fall back to weight when scheduled_value is missing', async () => {
    const { buildG703Lines } = await import('../lib/aiaBillingExport')
    // Area has no scheduled_value — the fix must produce $0, never $75.
    const lines = buildG703Lines({ id: 'p', contract_value: 0 }, [
      { id: 'a', name: 'X', weight: 75, status: 'working' }
    ])
    expect(lines[0].scheduled_value).toBe(0)
  })

  it('sageExport.generateProjectExcelData uses scheduled_value for the SOV lines', () => {
    const src = repoFile('src/lib/sageExport.js')
    // Positive assertion: the SOV loop reads scheduled_value.
    expect(src).toMatch(/area\.scheduled_value/)
    // Negative assertion: the dead name is gone, and weight is not a fallback.
    expect(src).not.toMatch(/area\.sov_value/)
    expect(src).not.toMatch(/area\.sov_value \|\| area\.weight/)
  })

  it('SageExportPanel preview uses scheduled_value for the SOV lines', () => {
    const src = repoFile('src/components/SageExportPanel.jsx')
    expect(src).toMatch(/area\.scheduled_value/)
    expect(src).not.toMatch(/area\.sov_value/)
  })
})

// ============================================================
// 3. fieldOps — default "today" is the user's local date, not UTC
// ============================================================

describe('fieldOps — default "today" uses the user local date, not UTC', () => {
  it('does not use toISOString().split(T) as a date default anywhere', () => {
    const src = repoFile('src/lib/db/fieldOps.js')
    // The UTC pattern on a `date ||` line is the specific regression we fixed.
    expect(src).not.toMatch(/date \|\| new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/)
    expect(src).toMatch(/getLocalDateString/)
  })

  it('getLocalDateString returns the local calendar date even late in the evening', async () => {
    const { getLocalDateString } = await import('../lib/utils')
    // Fix the clock at 11:30 PM local on 2026-10-15 — UTC-side, this is 2026-10-16
    // for anyone west of UTC. getLocalDateString must still say 2026-10-15.
    const d = new Date(2026, 9, 15, 23, 30, 0) // local time (month is 0-indexed)
    expect(getLocalDateString(d)).toBe('2026-10-15')
  })
})

// ============================================================
// 4. compileDailyReport — no reference to the nonexistent completed_at column
// ============================================================

describe('compileDailyReport — never reads the nonexistent areas.completed_at column', () => {
  it('source no longer dereferences a.completed_at', () => {
    const src = repoFile('src/lib/db/fieldOps.js')
    // The field doesn't exist in any migration — any read of it is a bug.
    expect(src).not.toMatch(/\.completed_at\?/)
    expect(src).not.toMatch(/a\.completed_at/)
  })

  it('still filters by areas.status and uses a real timestamp column', () => {
    const src = repoFile('src/lib/db/fieldOps.js')
    // Either equality direction is fine so long as the filter keys off status === 'done'
    // (or rejects everything that is not).
    expect(src).toMatch(/status\s*(?:===|!==)\s*'done'/)
    // The fix compares updated_at (TIMESTAMPTZ) via getLocalDateString, not startsWith on UTC strings.
    expect(src).toMatch(/updated_at/)
    expect(src).not.toMatch(/\.startsWith\(reportDate\)/)
  })
})

// ============================================================
// 5. CORList — formats total_approved_value as DOLLARS, not cents
// ============================================================

describe('CORList sidebar — formats getCORStats.total_approved_value as dollars', () => {
  it('does not pass dollars to corCalculations.formatCurrency (which would divide by 100 again)', () => {
    const src = repoFile('src/components/cor/CORList.jsx')
    // The old bug was `formatCurrency(stats.total_approved_value)` using the
    // cents-expecting formatter. The fix routes it through utils.formatCurrency.
    expect(src).not.toMatch(/formatCurrency\(stats\.total_approved_value\)/)
    expect(src).toMatch(/formatDollarsCurrency\(stats\.total_approved_value\)/)
  })

  it('utils.formatCurrency treats its input as dollars', async () => {
    const { formatCurrency } = await import('../lib/utils')
    // $125,000 in → "$125,000" out (no divide-by-100).
    expect(formatCurrency(125000)).toMatch(/125,000/)
  })

  it('corCalculations.formatCurrency treats its input as CENTS (regression anchor)', async () => {
    const { formatCurrency } = await import('../lib/corCalculations')
    // 125000 cents = $1,250 — this is why passing dollars here under-reports 100×.
    expect(formatCurrency(125000)).toMatch(/1,250/)
  })
})
