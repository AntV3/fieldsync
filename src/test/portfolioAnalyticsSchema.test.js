/**
 * Schema-lock tests for portfolioAnalyticsService.
 *
 * The service consumes real columns on real Supabase tables. When someone
 * types the wrong column here (as they did historically for
 * checkin_date/worker_count/is_complete/total_value), Supabase silently
 * returns null values and every portfolio tab renders 0/wrong health.
 * Lock the mapping in tests so any regression fails loudly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The service reads `supabase as maybeSupabase` from ../lib/supabaseClient
// and only touches it when isSupabaseConfigured is true. Mock both so the
// service takes the live path and hits our stub query builder.
vi.mock('../lib/supabaseClient', () => ({
  supabase: null, // reassigned per-test via installSupabaseStub
  isSupabaseConfigured: true,
}))

vi.mock('../lib/observability', () => ({
  observe: { error: vi.fn(), query: vi.fn() },
}))

const projectId = '00000000-0000-0000-0000-000000000001'
const companyId = '00000000-0000-0000-0000-000000000009'

/** Records every .from(...).select(...) the service issues. */
function makeSupabaseStub(tableFixtures = {}) {
  const selectCalls = []

  function fromTable(table) {
    const data = tableFixtures[table] || []

    const builder = {
      _selectedColumns: null,
      select(cols) {
        this._selectedColumns = cols
        selectCalls.push({ table, cols })
        return this
      },
      eq() { return this },
      in() { return this },
      gte() { return this },
      order() { return this },
      // Awaiting the builder returns { data, error: null }
      then(resolve) {
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return builder
  }

  return {
    stub: { from: fromTable },
    selectCalls,
  }
}

/** Install the stub as the mocked module's `supabase` export. */
async function installSupabaseStub(stub) {
  const mod = await import('../lib/supabaseClient')
  // The service captured the export at import time, so we re-assign the
  // property; the service reads it fresh on every call.
  Object.defineProperty(mod, 'supabase', { value: stub, configurable: true })
}

describe('portfolioAnalyticsService — schema mapping', () => {
  let selectCalls

  beforeEach(async () => {
    vi.resetModules()
  })

  it('reads real columns for financial summary (no phantom checkin_date/worker_count/is_complete/total_value)', async () => {
    const projects = [{ id: projectId, name: 'Alpha', contract_value: 100_000 }]
    const areas = [
      { project_id: projectId, weight: 1, status: 'done' },
      { project_id: projectId, weight: 1, status: 'working' },
    ]
    const change_orders = [
      // cor_total is INTEGER cents; 500000 cents = $5000
      { project_id: projectId, cor_total: 500_000, status: 'approved' },
    ]
    const crew_checkins = [
      { project_id: projectId, workers: [{ name: 'A' }, { name: 'B' }], check_in_date: '2026-09-18' },
    ]

    const { stub, selectCalls: recorded } = makeSupabaseStub({
      projects, areas, change_orders, crew_checkins,
    })
    selectCalls = recorded
    await installSupabaseStub(stub)

    const svc = await import('../lib/services/portfolioAnalyticsService')
    const summary = await svc.getPortfolioFinancialSummary(companyId)

    // Every column referenced must be a real one. Scan the recorded SELECT
    // strings for any of the historic phantom names.
    const banned = ['is_complete', 'checkin_date', 'worker_count', 'total_value']
    for (const call of selectCalls) {
      for (const bad of banned) {
        expect(
          call.cols?.includes?.(bad) ?? false,
          `phantom column ${bad} in SELECT on ${call.table}: ${call.cols}`
        ).toBe(false)
      }
    }

    // Sanity: real columns present
    const areasCall = selectCalls.find(c => c.table === 'areas')
    expect(areasCall.cols).toContain('status')
    const corsCall = selectCalls.find(c => c.table === 'change_orders')
    expect(corsCall.cols).toContain('cor_total')
    const checkinsCall = selectCalls.find(c => c.table === 'crew_checkins')
    expect(checkinsCall.cols).toContain('workers')
    expect(checkinsCall.cols).toContain('check_in_date')

    // Sanity: derived math uses real columns
    // 1 of 2 equal-weight areas done → 50% progress → $50,000 earned
    expect(summary.totalEarned).toBe(50_000)
    // 500,000 cents approved → $5,000 CORs
    expect(summary.totalCORApproved).toBe(5_000)
    // 2 workers on that day → 2 man-days
    expect(summary.totalCrewManDays).toBe(2)
    // Revenue = earned + CORs, no phantom T&M costs
    expect(summary.totalRevenue).toBe(55_000)
    expect(summary.totalCosts).toBe(0)
  })

  it('labor summary reads check_in_date and derives crew from workers[]', async () => {
    const projects = [{ id: projectId }]
    const today = new Date().toISOString().split('T')[0]
    const crew_checkins = [
      { project_id: projectId, workers: [{}, {}, {}], check_in_date: today },
    ]
    const { stub, selectCalls: recorded } = makeSupabaseStub({ projects, crew_checkins })
    await installSupabaseStub(stub)

    const svc = await import('../lib/services/portfolioAnalyticsService')
    const labor = await svc.getPortfolioLaborSummary(companyId)

    const checkinsCall = recorded.find(c => c.table === 'crew_checkins')
    expect(checkinsCall.cols).toMatch(/check_in_date/)
    expect(checkinsCall.cols).toMatch(/workers/)
    expect(checkinsCall.cols).not.toMatch(/checkin_date/)
    expect(checkinsCall.cols).not.toMatch(/worker_count/)

    // 3 workers today
    expect(labor.totalCrewToday).toBe(3)
    expect(labor.totalManDays).toBe(3)
  })

  it('progress summary reads status (not is_complete) and only counts status=done', async () => {
    const projects = [{ id: projectId, contract_value: 100_000, start_date: null, end_date: null }]
    const areas = [
      { project_id: projectId, weight: 3, status: 'done' },
      { project_id: projectId, weight: 1, status: 'working' },
    ]
    const { stub, selectCalls: recorded } = makeSupabaseStub({ projects, areas })
    await installSupabaseStub(stub)

    const svc = await import('../lib/services/portfolioAnalyticsService')
    const progress = await svc.getPortfolioProgressSummary(companyId)

    const areasCall = recorded.find(c => c.table === 'areas')
    expect(areasCall.cols).toMatch(/status/)
    expect(areasCall.cols).not.toMatch(/is_complete/)

    // 3 of 4 weight → 75% avg completion
    expect(progress.avgCompletion).toBe(75)
  })

  it('CoR summary converts cor_total from cents to dollars', async () => {
    const projects = [{ id: projectId }]
    const change_orders = [
      { project_id: projectId, cor_total: 250_000, status: 'approved', created_at: '2026-01-01', updated_at: '2026-01-05' },
      { project_id: projectId, cor_total: 100_000, status: 'pending',  created_at: '2026-01-02' },
      { project_id: projectId, cor_total: 50_000,  status: 'rejected', created_at: '2026-01-03' },
    ]
    const { stub, selectCalls: recorded } = makeSupabaseStub({ projects, change_orders })
    await installSupabaseStub(stub)

    const svc = await import('../lib/services/portfolioAnalyticsService')
    const cor = await svc.getCORSummaryAcrossProjects(companyId)

    const corsCall = recorded.find(c => c.table === 'change_orders')
    expect(corsCall.cols).toMatch(/cor_total/)
    expect(corsCall.cols).not.toMatch(/total_value/)

    expect(cor.approvedValue).toBe(2_500) // 250,000c → $2,500
    expect(cor.pendingValue).toBe(1_000)
    expect(cor.rejectedValue).toBe(500)
    expect(cor.totalValue).toBe(4_000)
  })
})
