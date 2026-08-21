/**
 * Regression: Sage 300 CRE Change Order export
 *
 * exportChangeOrderSummary was querying the non-existent `change_order_requests`
 * relation (the real table is `change_orders`) and selecting `cost_code_id` /
 * joining `cost_codes` on it — `change_orders` has no such column. Preview and
 * download of the "Change Orders" Sage export failed with a PostgREST 42P01
 * ("relation does not exist") for every project.
 *
 * This guard mocks the Supabase client so a mistaken table or column name
 * would surface as a failing assertion, not as a silent regression in the UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromSpy, orderSpy, selectSpy, eqSpy, singleSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(),
  orderSpy: vi.fn(),
  selectSpy: vi.fn(),
  eqSpy: vi.fn(),
  singleSpy: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { from: fromSpy },
}))

vi.mock('../lib/observability', () => ({
  observe: { query: vi.fn(), error: vi.fn() },
}))

const projectRow = { id: 'proj-1', name: 'Test Project', job_number: 'JOB-1' }
const corRows = [
  {
    id: 'cor-1',
    cor_number: 'CO-001',
    title: 'Add elevator',
    status: 'approved',
    cor_total: 1_250_000, // cents
    approved_at: '2026-08-01T12:00:00Z',
    change_order_labor: [{ description: 'Install', total: 400_000 }],
    change_order_materials: [{ description: 'Cab', total: 500_000 }],
    change_order_equipment: [{ description: 'Rigging', total: 200_000 }],
    change_order_subcontractors: [{ description: 'Inspector', total: 100_000 }],
  },
]

function buildBuilders() {
  const corBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: corRows, error: null }),
  }
  const projectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: projectRow, error: null }),
  }
  return { corBuilder, projectBuilder }
}

describe('exportChangeOrderSummary → Sage 300 CRE', () => {
  beforeEach(() => {
    fromSpy.mockReset()
    orderSpy.mockReset()
    selectSpy.mockReset()
    eqSpy.mockReset()
    singleSpy.mockReset()
  })

  it('queries the real `change_orders` table, not `change_order_requests`', async () => {
    const { corBuilder, projectBuilder } = buildBuilders()
    fromSpy.mockImplementation((table) => {
      if (table === 'projects') return projectBuilder
      if (table === 'change_orders') return corBuilder
      throw new Error(`Unexpected table queried: ${table}`)
    })

    const { exportChangeOrderSummary } = await import('../lib/services/sageExportService')
    const result = await exportChangeOrderSummary('proj-1')

    const tables = fromSpy.mock.calls.map((c) => c[0])
    expect(tables).toContain('change_orders')
    expect(tables).not.toContain('change_order_requests')
    expect(result.rows).toHaveLength(1)
    expect(result.summary.jobNumber).toBe('JOB-1')
  })

  it('does not select `cost_code_id` or join `cost_codes` (columns not on change_orders)', async () => {
    const { corBuilder, projectBuilder } = buildBuilders()
    fromSpy.mockImplementation((table) =>
      table === 'projects' ? projectBuilder : corBuilder
    )

    const { exportChangeOrderSummary } = await import('../lib/services/sageExportService')
    await exportChangeOrderSummary('proj-1')

    expect(corBuilder.select).toHaveBeenCalledTimes(1)
    const selectSql = corBuilder.select.mock.calls[0][0]
    expect(selectSql).not.toMatch(/\bcost_code_id\b/)
    expect(selectSql).not.toMatch(/\bcost_codes\s*\(/)
    // The line-item joins must still be present — they hold the source amounts.
    expect(selectSql).toMatch(/change_order_labor/)
    expect(selectSql).toMatch(/change_order_materials/)
    expect(selectSql).toMatch(/change_order_equipment/)
    expect(selectSql).toMatch(/change_order_subcontractors/)
  })

  it('rolls up line items and converts cor_total from cents to dollars', async () => {
    const { corBuilder, projectBuilder } = buildBuilders()
    fromSpy.mockImplementation((table) =>
      table === 'projects' ? projectBuilder : corBuilder
    )

    const { exportChangeOrderSummary } = await import('../lib/services/sageExportService')
    const result = await exportChangeOrderSummary('proj-1')

    const row = result.rows[0]
    // Sum of the four line-item categories (in cents) / 100
    expect(row['Original Amount']).toBe('12000.00')
    // cor_total 1_250_000 cents → 12500.00 dollars
    expect(row['Revised Amount']).toBe('12500.00')
    expect(row['Labor']).toBe('4000.00')
    expect(row['Material']).toBe('5000.00')
    expect(row['Equipment']).toBe('2000.00')
    expect(row['Subcontract']).toBe('1000.00')
    expect(result.summary.rowCount).toBe(1)
    expect(result.summary.totalRevised).toBeCloseTo(12500)
  })

  it('propagates Supabase errors so the UI can surface them (no silent zero-row)', async () => {
    const projectBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: projectRow, error: null }),
    }
    const corBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation "change_order_requests" does not exist', code: '42P01' },
      }),
    }
    fromSpy.mockImplementation((table) =>
      table === 'projects' ? projectBuilder : corBuilder
    )

    const { exportChangeOrderSummary } = await import('../lib/services/sageExportService')
    await expect(exportChangeOrderSummary('proj-1')).rejects.toMatchObject({ code: '42P01' })
  })
})
