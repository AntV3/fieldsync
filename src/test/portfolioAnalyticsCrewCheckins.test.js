/**
 * Regression: portfolio analytics queries crew_checkins with the real
 * column names (check_in_date, workers), not a phantom `checkin_date`
 * or `worker_count` on the row. Before this fix, every call site in
 * portfolioAnalyticsService.ts selected
 *   `project_id, worker_count, checkin_date`
 * from `crew_checkins`. PostgREST rejects the SELECT with
 * "column crew_checkins.checkin_date does not exist" (every migration
 * and fieldOps writer uses `check_in_date` with an underscore), the
 * `try/catch` swallows the error and the Portfolio Analytics page's
 * Labor Resources / Crew Distribution charts and Financial Overview's
 * totalCrewManDays all read as zero.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn() }
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase,
  isSupabaseConfigured: true,
}))

vi.mock('../lib/observability', () => ({
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), event: vi.fn(), activity: vi.fn() }
}))

import {
  getPortfolioFinancialSummary,
  getPortfolioLaborSummary,
  getCrewDistribution,
} from '../lib/services/portfolioAnalyticsService'

// ----------------------------------------------------------------
// Builder: table -> { capture of every supabase.from(table).select(...) call }
// ----------------------------------------------------------------
function makeClient(tableResponses) {
  const calls = { crew_checkins: [] }

  supabase.from.mockImplementation((table) => {
    const response = tableResponses[table] ?? { data: [], error: null }

    // Capture the select() string on crew_checkins, chain through the rest.
    const chain = {
      select: vi.fn((cols) => {
        if (table === 'crew_checkins') calls.crew_checkins.push(cols)
        return chain
      }),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      // Terminal: either the awaited builder resolves, or it is awaited directly.
      then: (resolve) => resolve(response),
    }
    return chain
  })

  return { calls }
}

describe('portfolio analytics crew_checkins columns', () => {
  beforeEach(() => {
    supabase.from.mockReset()
  })

  it('getPortfolioFinancialSummary selects workers and check_in_date, not worker_count / checkin_date', async () => {
    const { calls } = makeClient({
      projects: { data: [{ id: 'p1', name: 'Alpha', contract_value: 100000, status: 'active', created_at: '2026-01-01' }], error: null },
      areas: { data: [], error: null },
      change_orders: { data: [], error: null },
      t_and_m_tickets: { data: [], error: null },
      crew_checkins: {
        data: [
          { project_id: 'p1', workers: [{}, {}, {}], check_in_date: '2026-11-20' },
          { project_id: 'p1', workers: [{}, {}], check_in_date: '2026-11-19' },
        ],
        error: null,
      },
    })

    const summary = await getPortfolioFinancialSummary('co1')

    expect(calls.crew_checkins.length).toBeGreaterThan(0)
    for (const cols of calls.crew_checkins) {
      expect(cols).toContain('check_in_date')
      expect(cols).toContain('workers')
      expect(cols).not.toMatch(/\bcheckin_date\b/)
      expect(cols).not.toMatch(/\bworker_count\b/)
    }

    // 3 + 2 = 5 man-days from the workers JSONB arrays, not 2 (one-per-row).
    expect(summary.totalCrewManDays).toBe(5)
  })

  it('getPortfolioLaborSummary filters by check_in_date and counts from the workers array', async () => {
    const todayStr = new Date().toISOString().split('T')[0]
    const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7)
    const sevenAgoStr = sevenAgo.toISOString().split('T')[0]

    const { calls } = makeClient({
      projects: { data: [{ id: 'p1' }], error: null },
      crew_checkins: {
        data: [
          { project_id: 'p1', workers: [{}, {}, {}, {}], check_in_date: todayStr },
          { project_id: 'p1', workers: [{}, {}], check_in_date: sevenAgoStr },
        ],
        error: null,
      },
    })

    const summary = await getPortfolioLaborSummary('co1')

    expect(calls.crew_checkins.length).toBe(1)
    const cols = calls.crew_checkins[0]
    expect(cols).toContain('check_in_date')
    expect(cols).toContain('workers')
    expect(cols).not.toMatch(/\bcheckin_date\b/)
    expect(cols).not.toMatch(/\bworker_count\b/)

    expect(summary.totalCrewToday).toBe(4)
    expect(summary.totalManDays).toBe(6)
  })

  it('getCrewDistribution selects check_in_date and workers', async () => {
    const { calls } = makeClient({
      projects: { data: [{ id: 'p1', name: 'Alpha' }], error: null },
      crew_checkins: {
        data: [
          { project_id: 'p1', workers: [{}, {}], check_in_date: '2026-11-19' },
        ],
        error: null,
      },
    })

    const rows = await getCrewDistribution('co1')

    expect(calls.crew_checkins.length).toBe(1)
    const cols = calls.crew_checkins[0]
    expect(cols).toContain('check_in_date')
    expect(cols).toContain('workers')
    expect(cols).not.toMatch(/\bcheckin_date\b/)
    expect(cols).not.toMatch(/\bworker_count\b/)

    // The row has 2 workers on one day; 30-day average is 2.
    expect(rows[0]?.avg30Days).toBe(2)
  })
})
