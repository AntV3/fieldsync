/**
 * Daily health-check regression tests (2026-08-20).
 *
 * Guards four silent-wrong-answer defects caught during today's review:
 *
 *  1. SEND_MESSAGE offline replay: offlineManager.js passed the payload's
 *     senderType/senderName/content into sendMessage's message/senderType/
 *     senderName slots, so the message body landed in the sender_name
 *     column when a queued message finally synced.
 *
 *  2. Sage Job Cost export: every T&M item row was written with cost
 *     type "1 (Material)" no matter what materials_equipment.category
 *     was, so equipment/rental/subcontract spend rolled up as Material
 *     in Sage 300 CRE.
 *
 *  3. Trade KPI card: budget_burn_rate read `projectData.project.contract_value`
 *     and `projectData.billedTotal`, but the enhanced project spreads
 *     project fields at the top level and exposes `totalBilled`. All
 *     three built-in KPIs rendered "--".
 *
 *  4. Portfolio risk-analysis schedule factor: usePortfolioMetrics fed
 *     `p.expectedProgress || p.progress` into calculateScheduleFactor,
 *     but expectedProgress was never emitted. Fallback to actual
 *     progress made variance 0 for every project.
 */
import { describe, it, expect, beforeAll } from 'vitest'

// ------------------------------------------------------------------
// 1. SEND_MESSAGE offline replay argument order
// ------------------------------------------------------------------
describe('SEND_MESSAGE offline replay maps payload into correct slots', () => {
  it('passes payload.content into the message slot, not senderName', async () => {
    const { processAction, ACTION_TYPES } = await import('../lib/offlineManager.js')

    const calls = []
    const db = {
      sendMessage: (...args) => {
        calls.push(args)
        return Promise.resolve({ ok: true })
      },
    }

    await processAction(
      {
        type: ACTION_TYPES.SEND_MESSAGE,
        payload: {
          projectId: 'p1',
          senderType: 'field',
          senderName: 'John',
          content: 'Backhoe broke down at gate 3',
        },
      },
      db,
    )

    expect(calls).toHaveLength(1)
    const [projectId, message, senderType, senderName] = calls[0]
    expect(projectId).toBe('p1')
    expect(message).toBe('Backhoe broke down at gate 3')
    expect(senderType).toBe('field')
    expect(senderName).toBe('John')
  })
})

// ------------------------------------------------------------------
// 2. Sage Job Cost — item cost type follows materials_equipment.category
// ------------------------------------------------------------------
describe('exportSageJobCostCSV routes T&M items by materials_equipment.category', () => {
  beforeAll(() => {
    // sageExport.downloadFile pokes DOM APIs. Stub them so the export
    // runs to completion in jsdom.
    globalThis.URL = globalThis.URL || {}
    globalThis.URL.createObjectURL = () => 'blob:mock'
    globalThis.URL.revokeObjectURL = () => {}
    if (!globalThis.document) {
      globalThis.document = {
        body: { appendChild: () => {}, removeChild: () => {} },
        createElement: () => ({ click: () => {}, style: {} }),
      }
    }
  })

  it('writes equipment/subcontract/rental items with the correct Sage cost type', async () => {
    const { exportSageJobCostCSV } = await import('../lib/sageExport.js')

    const project = { name: 'Test Project', job_number: 'JOB-1' }
    const tickets = [
      {
        id: 'tick-1',
        work_date: '2026-08-20',
        cost_code_id: null,
        t_and_m_workers: [],
        t_and_m_items: [
          { quantity: 8, materials_equipment: { name: 'Backhoe', cost_per_unit: 180, category: 'equipment' } },
          { quantity: 2, materials_equipment: { name: 'Cu wire', cost_per_unit: 250, category: 'material' } },
          { quantity: 4, materials_equipment: { name: 'Sub crew', cost_per_unit: 500, category: 'subcontractor' } },
          { quantity: 1, materials_equipment: { name: 'Skid rental', cost_per_unit: 300, category: 'rental' } },
        ],
      },
    ]

    const { rows } = exportSageJobCostCSV(project, tickets)

    // Find each row by the item name in the description.
    const findByName = (name) => rows.find(r => r.description?.includes(name))
    expect(findByName('Backhoe').costType).toBe('3')       // equipment
    expect(findByName('Cu wire').costType).toBe('1')        // material
    expect(findByName('Sub crew').costType).toBe('4')       // subcontractor
    expect(findByName('Skid rental').costType).toBe('3')    // rental → equipment
  })
})

// ------------------------------------------------------------------
// 3. Trade KPI card built-ins read the enhanced project shape
// ------------------------------------------------------------------
describe('BUILT_IN_KPIS read the enhanced-project shape emitted by useDashboardData', () => {
  it('budget_burn_rate divides totalBilled by contract_value on the flat enhanced project', async () => {
    const { BUILT_IN_KPIS } = await import('../lib/tradeKpis.js')
    const projectData = { contract_value: 500_000, totalBilled: 125_000 }
    expect(BUILT_IN_KPIS.budget_burn_rate.calculate(projectData)).toBe(25)
  })

  it('budget_burn_rate returns null when contract is missing', async () => {
    const { BUILT_IN_KPIS } = await import('../lib/tradeKpis.js')
    expect(BUILT_IN_KPIS.budget_burn_rate.calculate({ totalBilled: 500 })).toBeNull()
  })

  it('crew_utilization falls back to crewByDate[today] when todaysCrewCount is absent', async () => {
    const { BUILT_IN_KPIS } = await import('../lib/tradeKpis.js')
    const today = new Date().toISOString().split('T')[0]
    const projectData = { crewByDate: { [today]: 12 } }
    expect(BUILT_IN_KPIS.crew_utilization.calculate(projectData)).toBe(12)
  })

  it('tm_ticket_volume counts tmTickets within the last 7 days by work_date', async () => {
    const { BUILT_IN_KPIS } = await import('../lib/tradeKpis.js')
    const today = new Date()
    const twoDaysAgo = new Date(today); twoDaysAgo.setDate(today.getDate() - 2)
    const tenDaysAgo = new Date(today); tenDaysAgo.setDate(today.getDate() - 10)
    const projectData = {
      tmTickets: [
        { work_date: today.toISOString().split('T')[0] },
        { work_date: twoDaysAgo.toISOString().split('T')[0] },
        { work_date: tenDaysAgo.toISOString().split('T')[0] },
      ],
    }
    expect(BUILT_IN_KPIS.tm_ticket_volume.calculate(projectData)).toBe(2)
  })
})

// ------------------------------------------------------------------
// 4. Portfolio risk-analysis schedule factor uses a real expectedProgress
// ------------------------------------------------------------------
describe('computeExpectedProgress derives a schedule expectation', () => {
  it('returns ~50 for a project halfway through its planned window', async () => {
    const { computeExpectedProgress } = await import('../hooks/usePortfolioMetrics.js')
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const exp = computeExpectedProgress(start, end)
    expect(exp).toBeGreaterThan(45)
    expect(exp).toBeLessThan(55)
  })

  it('returns null when no dates are set (schedule factor stays "no data" → healthy)', async () => {
    const { computeExpectedProgress } = await import('../hooks/usePortfolioMetrics.js')
    expect(computeExpectedProgress(null, null)).toBeNull()
    expect(computeExpectedProgress(undefined, undefined)).toBeNull()
  })

  it('clamps to 0 before start and 100 after end', async () => {
    const { computeExpectedProgress } = await import('../hooks/usePortfolioMetrics.js')
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeExpectedProgress(future, new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString())).toBe(0)
    expect(computeExpectedProgress(past, new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString())).toBe(100)
  })
})
