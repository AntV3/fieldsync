import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// vi.mock is hoisted; keep mutable shared state in vi.hoisted so the factory
// below can read/write it before the test body runs.
const state = vi.hoisted(() => ({ tablesTouched: [] }))

vi.mock('../lib/supabaseClient', () => {
  const makeChain = (tableName) => {
    state.tablesTouched.push(tableName)
    if (tableName === 'projects') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'p1', name: 'Test Job', job_number: 'J-100' },
              error: null
            })
          })
        })
      }
    }
    if (tableName === 'change_orders') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [
                {
                  id: 'c1',
                  cor_number: 'CO-001',
                  title: 'Added scope',
                  status: 'approved',
                  cor_total: 500000, // $5000.00
                  approved_at: '2026-11-01T12:00:00Z',
                  change_order_labor: [{ total: 100000 }, { total: 50000 }],
                  change_order_materials: [{ total: 80000 }],
                  change_order_equipment: [{ total: 20000 }],
                  change_order_subcontractors: [{ total: 10000 }]
                }
              ],
              error: null
            })
          })
        })
      }
    }
    throw new Error(`Unexpected table in Sage COR exporter: ${tableName}`)
  }
  return {
    isSupabaseConfigured: true,
    supabase: { from: (t) => makeChain(t) }
  }
})

vi.mock('../lib/observability', () => ({
  observe: { query: () => {}, error: () => {} }
}))

beforeEach(() => {
  state.tablesTouched = []
})

const SAGE_SERVICE_SRC = path.resolve(
  __dirname,
  '../lib/services/sageExportService.ts'
)

/**
 * Isolate the exportChangeOrderSummary function's source as a string so the
 * pin-the-source assertions below don't fire on unrelated code in the file
 * (e.g. the T&M job-cost exporter legitimately joins cost_code_id).
 */
function corExporterSource() {
  const full = fs.readFileSync(SAGE_SERVICE_SRC, 'utf8')
  const start = full.indexOf('export async function exportChangeOrderSummary')
  expect(start).toBeGreaterThan(-1)
  // Match braces to find the function's closing brace.
  let depth = 0
  let i = full.indexOf('{', start)
  const open = i
  for (; i < full.length; i++) {
    if (full[i] === '{') depth++
    else if (full[i] === '}') {
      depth--
      if (depth === 0) {
        const body = full.slice(open, i + 1)
        // Strip line comments so the assertions test the real code and
        // don't trip on an explanatory `// cost_code_id ...` note.
        return body.replace(/\/\/[^\n]*/g, '')
      }
    }
  }
  throw new Error('Could not locate end of exportChangeOrderSummary')
}

describe('exportChangeOrderSummary — schema is wired to the real COR table', () => {
  it('reads from change_orders, never from a phantom change_order_requests table', () => {
    const body = corExporterSource()
    // change_orders is the real COR table (migration 20241201000060). The
    // historic alias change_order_requests does not exist in any migration
    // and triggers PostgREST 42P01 "relation does not exist".
    expect(body).not.toMatch(/change_order_requests/)
    expect(body).toMatch(/\.from\(\s*['"]change_orders['"]\s*\)/)
  })

  it('does not reference a cost_code_id / cost_codes relationship that change_orders lacks', () => {
    const body = corExporterSource()
    // change_orders has no cost_code_id FK and no cost_codes PostgREST
    // relationship. Adding one to the select fails the whole query.
    expect(body).not.toMatch(/cost_code_id/)
    expect(body).not.toMatch(/cost_codes\s*\(/)
  })

  it('selects only `(total)` from each line-item relation', () => {
    // change_order_labor has NO `description` column (it stores labor_class
    // instead). The exporter only sums `.total`, so the select stays narrow
    // and we fail loud if a future edit re-widens it to (description, total).
    const body = corExporterSource()
    for (const rel of [
      'change_order_labor',
      'change_order_materials',
      'change_order_equipment',
      'change_order_subcontractors'
    ]) {
      expect(body).toMatch(new RegExp(`${rel}\\s*\\(\\s*total\\s*\\)`))
      expect(body).not.toMatch(new RegExp(`${rel}\\s*\\(\\s*description`))
    }
  })

  it('runs end-to-end against a mocked PostgREST client and returns a Sage-shaped row', async () => {
    const { exportChangeOrderSummary } = await import(
      '../lib/services/sageExportService.ts'
    )
    const result = await exportChangeOrderSummary('p1')

    // The exporter MUST query change_orders. A slip back to the historic
    // change_order_requests alias makes the mock throw from makeChain.
    expect(state.tablesTouched).toContain('change_orders')
    expect(state.tablesTouched).not.toContain('change_order_requests')

    expect(result.rows.length).toBe(1)
    const row = result.rows[0]
    expect(row['Change Order Number']).toBe('CO-001')
    expect(row['Labor']).toBe('1500.00') // (100000 + 50000)/100
    expect(row['Material']).toBe('800.00')
    expect(row['Equipment']).toBe('200.00')
    expect(row['Subcontract']).toBe('100.00')
    // Original = labor + materials + equipment + subs
    expect(row['Original Amount']).toBe('2600.00')
    // Revised = cor_total / 100
    expect(row['Revised Amount']).toBe('5000.00')
    expect(row['Job Number']).toBe('J-100')
    expect(result.summary.jobNumber).toBe('J-100')
  })
})
