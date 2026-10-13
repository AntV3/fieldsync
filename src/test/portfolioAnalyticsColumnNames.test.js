/**
 * Regression: portfolioAnalyticsService must query the real `check_in_date`
 * column on crew_checkins — not the misspelled `checkin_date` — otherwise
 * Supabase rejects the select and Labor Resources shows zeros for Crew Today,
 * Avg Crew, Total Man-Days, Utilization and Crew Distribution.
 *
 * The migration of record is supabase/migrations/20241201000250_performance_indexes.sql
 * (CREATE INDEX ... ON crew_checkins (project_id, check_in_date DESC)).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const selectCalls = []
const gteCalls = []

const makeQueryStub = (resolveWith) => {
  const stub = {
    select: vi.fn((cols) => { selectCalls.push(cols); return stub }),
    in: vi.fn(() => stub),
    eq: vi.fn(() => stub),
    gte: vi.fn((col, val) => { gteCalls.push({ col, val }); return stub }),
    order: vi.fn(() => stub),
    then: (onFulfilled) => Promise.resolve(resolveWith).then(onFulfilled),
  }
  return stub
}

vi.mock('../lib/supabaseClient', () => {
  const projectsRow = [{ id: 'p1', name: 'Alpha', company_id: 'c1', status: 'active', contract_value: 0 }]
  const emptyRows = []
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: vi.fn((table) => {
        if (table === 'projects') return makeQueryStub({ data: projectsRow, error: null })
        return makeQueryStub({ data: emptyRows, error: null })
      }),
    },
  }
})

vi.mock('../lib/observability', () => ({
  observe: (_name, fn) => fn(),
}))

beforeEach(() => {
  selectCalls.length = 0
  gteCalls.length = 0
})

describe('portfolioAnalyticsService crew_checkins column name', () => {
  it('getPortfolioFinancialSummary selects check_in_date, never checkin_date', async () => {
    const { getPortfolioFinancialSummary } = await import('../lib/services/portfolioAnalyticsService.ts')
    await getPortfolioFinancialSummary('c1')
    const checkinSelects = selectCalls.filter(c => c.includes('worker_count'))
    expect(checkinSelects.length).toBeGreaterThan(0)
    for (const cols of checkinSelects) {
      expect(cols).toContain('check_in_date')
      expect(cols).not.toMatch(/\bcheckin_date\b/)
    }
  })

  it('getPortfolioLaborSummary selects check_in_date and filters by check_in_date', async () => {
    const { getPortfolioLaborSummary } = await import('../lib/services/portfolioAnalyticsService.ts')
    await getPortfolioLaborSummary('c1')
    const checkinSelects = selectCalls.filter(c => c.includes('worker_count'))
    expect(checkinSelects.length).toBeGreaterThan(0)
    for (const cols of checkinSelects) {
      expect(cols).toContain('check_in_date')
      expect(cols).not.toMatch(/\bcheckin_date\b/)
    }
    const checkinGtes = gteCalls.filter(g => g.col === 'check_in_date' || g.col === 'checkin_date')
    expect(checkinGtes.length).toBeGreaterThan(0)
    for (const g of checkinGtes) expect(g.col).toBe('check_in_date')
  })

  it('getCrewDistribution selects check_in_date and filters by check_in_date', async () => {
    const { getCrewDistribution } = await import('../lib/services/portfolioAnalyticsService.ts')
    await getCrewDistribution('c1')
    const checkinSelects = selectCalls.filter(c => c.includes('worker_count'))
    expect(checkinSelects.length).toBeGreaterThan(0)
    for (const cols of checkinSelects) {
      expect(cols).toContain('check_in_date')
      expect(cols).not.toMatch(/\bcheckin_date\b/)
    }
    const checkinGtes = gteCalls.filter(g => g.col === 'check_in_date' || g.col === 'checkin_date')
    expect(checkinGtes.length).toBeGreaterThan(0)
    for (const g of checkinGtes) expect(g.col).toBe('check_in_date')
  })
})
