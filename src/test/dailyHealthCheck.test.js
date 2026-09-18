/**
 * Daily health-check regressions (2026-09-18).
 *
 * Anchors two bug fixes so they don't quietly regress:
 *
 *   1. drawRequestOps.getPreviousBillingTotals uses the LATEST draw's
 *      retention_held, not Math.max across draws. When the retention rate
 *      steps down mid-project (10% → 5% at 50% complete), the newest draw
 *      holds LESS cumulative retention than an older one, and Math.max
 *      would release retention that was never actually held.
 *
 *   2. sageExport.exportSageJobCostCSV honors the classification's
 *      configured overtime_rate (prevailing wage / PLA / union scale)
 *      instead of blindly writing rate × 1.5 for every OT hour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// 1. Draw request "previous retention" — latest-draw semantics
// ---------------------------------------------------------------------------

describe('drawRequestOps.getPreviousBillingTotals', () => {
  let capturedOrder
  const mockChain = (rows) => {
    capturedOrder = null
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn((col, opts) => {
                capturedOrder = { col, opts }
                return Promise.resolve({ data: rows, error: null })
              })
            })
          })
        })
      })
    }
  }

  beforeEach(() => {
    vi.resetModules()
  })

  it('returns the latest draw\'s retention_held even when older draws held more', async () => {
    // Cumulative retention over the life of the project:
    //   Draw 1: $25k billed @ 10% → retention_held = $2,500
    //   Draw 2: $50k billed @ 10% → retention_held = $5,000
    //   Draw 3: $60k billed @  5% → retention_held = $3,000  (rate stepped down)
    const rows = [
      { current_billing: 10_000, retention_held: 3_000, draw_number: 3 },
      { current_billing: 25_000, retention_held: 5_000, draw_number: 2 },
      { current_billing: 25_000, retention_held: 2_500, draw_number: 1 }
    ]

    vi.doMock('../lib/supabaseClient', () => ({
      supabase: mockChain(rows),
      isSupabaseConfigured: true
    }))

    const { drawRequestOps } = await import('../lib/drawRequestOps')
    const result = await drawRequestOps.getPreviousBillingTotals('proj-1')

    expect(result.totalBilled).toBe(60_000)
    // Not Math.max ($5,000) — the latest draw's cumulative retention ($3,000).
    expect(result.totalRetention).toBe(3_000)
    expect(capturedOrder).toEqual({ col: 'draw_number', opts: { ascending: false } })
  })

  it('returns zeros when the project has no accepted draws', async () => {
    vi.doMock('../lib/supabaseClient', () => ({
      supabase: mockChain([]),
      isSupabaseConfigured: true
    }))

    const { drawRequestOps } = await import('../lib/drawRequestOps')
    const result = await drawRequestOps.getPreviousBillingTotals('proj-1')

    expect(result).toEqual({ totalBilled: 0, totalRetention: 0 })
  })

  it('short-circuits when Supabase is not configured', async () => {
    vi.doMock('../lib/supabaseClient', () => ({
      supabase: null,
      isSupabaseConfigured: false
    }))

    const { drawRequestOps } = await import('../lib/drawRequestOps')
    const result = await drawRequestOps.getPreviousBillingTotals('proj-1')

    expect(result).toEqual({ totalBilled: 0, totalRetention: 0 })
  })
})

// ---------------------------------------------------------------------------
// 2. Sage 300 job-cost OT rate — honor configured OT rate
// ---------------------------------------------------------------------------

describe('exportSageJobCostCSV overtime rate', () => {
  let originalCreateObjectURL
  let originalRevokeObjectURL

  beforeEach(() => {
    // exportSageJobCostCSV writes a file via a hidden <a>; stub URL APIs so it
    // doesn't blow up in jsdom.
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = () => 'blob:mock'
    URL.revokeObjectURL = () => {}
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  const buildTicket = () => ({
    id: 'ticket-1234abcd',
    work_date: '2026-09-18',
    cost_code_id: null,
    t_and_m_workers: [
      {
        name: 'Sam',
        classification: 'Foreman',
        hours: 8,
        overtime_hours: 4,
        rate: 70
      }
    ],
    t_and_m_items: []
  })

  it('uses configured overtime_rate for prevailing-wage classifications', async () => {
    const { exportSageJobCostCSV } = await import('../lib/sageExport')
    const project = { id: 'p1', name: 'Test', job_number: 'JOB-1' }
    const overtimeRates = { foreman: 120 } // PLA agreement, not 1.5×
    const { rows } = exportSageJobCostCSV(
      project,
      [buildTicket()],
      [],
      {},
      overtimeRates
    )

    const otRow = rows.find(r => String(r.description).startsWith('OT Labor'))
    expect(otRow).toBeDefined()
    expect(otRow.unitCost).toBe('120.00')
    expect(otRow.amount).toBe('480.00') // 4 × $120, not 4 × ($70 × 1.5) = $420
  })

  it('falls back to 1.5× when the classification is not in the OT lookup', async () => {
    const { exportSageJobCostCSV } = await import('../lib/sageExport')
    const project = { id: 'p1', name: 'Test', job_number: 'JOB-1' }
    const { rows } = exportSageJobCostCSV(project, [buildTicket()], [], {}, {})

    const otRow = rows.find(r => String(r.description).startsWith('OT Labor'))
    expect(otRow).toBeDefined()
    expect(otRow.unitCost).toBe('105.00') // 70 × 1.5
    expect(otRow.amount).toBe('420.00')
  })

  it('ignores non-positive OT rates and falls back to 1.5×', async () => {
    const { exportSageJobCostCSV } = await import('../lib/sageExport')
    const project = { id: 'p1', name: 'Test', job_number: 'JOB-1' }
    const { rows } = exportSageJobCostCSV(
      project,
      [buildTicket()],
      [],
      {},
      { foreman: 0 } // misconfigured; should not overwrite the fallback
    )

    const otRow = rows.find(r => String(r.description).startsWith('OT Labor'))
    expect(otRow.unitCost).toBe('105.00')
  })
})
