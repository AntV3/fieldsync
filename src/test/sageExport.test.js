/**
 * Regression tests for the Sage 300 WIP-Schedule export.
 *
 * Guards a silent-wrong-answer defect caught by the daily code review:
 * `Profit Margin %` used raw `totalCosts` while the adjacent
 * `Projected Profit` column extrapolated costs to completion, so the two
 * columns disagreed for every in-progress project — a project trending
 * toward a large loss displayed a healthy positive margin next to a
 * negative projected profit.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { exportSageWIPScheduleCSV } from '../lib/sageExport'

beforeAll(() => {
  // jsdom doesn't implement URL.createObjectURL / revokeObjectURL, and the
  // exporter calls downloadFile() as a side effect. Stub them so the
  // exporter can complete and we can inspect the returned rows.
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:stub'
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {}
  }
})

describe('exportSageWIPScheduleCSV — Profit Margin % tracks Projected Profit', () => {
  it('reports a negative margin when projected profit is negative (over-burn project)', () => {
    // $1M contract, 25% complete, $400k costs → burning at 4× planned rate.
    // Projected total cost = $400k / 0.25 = $1.6M → projected profit = -$600k.
    // Margin must reflect the loss, not read a rosy 60%.
    const project = { id: 'p1', name: 'Overbudget', contract_value: 1_000_000 }
    const projectDataMap = {
      p1: { progress: 25, allCostsTotal: 400_000, billable: 250_000, totalBilled: 250_000 },
    }

    const { rows } = exportSageWIPScheduleCSV([project], projectDataMap)
    const row = rows[0]

    expect(row.projectedProfit).toBe('-600000.00')
    // Margin = projectedProfit / revisedContract * 100 = -60%
    expect(row.profitMargin).toBe('-60.0')

    // The two columns must always agree by construction.
    const projected = parseFloat(row.projectedProfit)
    const revised = parseFloat(row.revisedContract)
    const marginPct = parseFloat(row.profitMargin)
    expect(marginPct).toBeCloseTo((projected / revised) * 100, 1)
  })

  it('reports a healthy margin when projected profit is positive (under-budget project)', () => {
    // $1M contract, 50% complete, $300k costs → projected total = $600k,
    // projected profit = $400k, margin = 40%.
    const project = { id: 'p2', name: 'Onbudget', contract_value: 1_000_000 }
    const projectDataMap = {
      p2: { progress: 50, allCostsTotal: 300_000, billable: 500_000, totalBilled: 500_000 },
    }

    const { rows } = exportSageWIPScheduleCSV([project], projectDataMap)
    const row = rows[0]

    expect(row.projectedProfit).toBe('400000.00')
    expect(row.profitMargin).toBe('40.0')
  })

  it('collapses to actual profit at 100% complete (no extrapolation regression)', () => {
    // Completed project: projectedProfit and (revisedContract - totalCosts)
    // are identical, so this row must match under the fix and the old code.
    const project = { id: 'p3', name: 'Done', contract_value: 500_000 }
    const projectDataMap = {
      p3: { progress: 100, allCostsTotal: 380_000, billable: 500_000, totalBilled: 500_000 },
    }

    const { rows } = exportSageWIPScheduleCSV([project], projectDataMap)
    const row = rows[0]

    expect(row.projectedProfit).toBe('120000.00')
    // (500k - 380k) / 500k = 24%
    expect(row.profitMargin).toBe('24.0')
  })

  it('rolls approved change orders into the revised contract used by the margin', () => {
    // Contract $800k + $200k approved COs = $1M revised. 40% complete,
    // $500k costs → projected total = $1.25M → projected profit = -$250k,
    // margin = -25%.
    const project = { id: 'p4', name: 'WithCOs', contract_value: 800_000 }
    const projectDataMap = {
      p4: {
        progress: 40,
        allCostsTotal: 500_000,
        changeOrderValue: 200_000,
        billable: 400_000,
        totalBilled: 400_000,
      },
    }

    const { rows } = exportSageWIPScheduleCSV([project], projectDataMap)
    const row = rows[0]

    expect(row.revisedContract).toBe('1000000.00')
    expect(row.projectedProfit).toBe('-250000.00')
    expect(row.profitMargin).toBe('-25.0')
  })

  it('leaves margin at 100% for a project with 0% progress and no costs', () => {
    // No progress yet → projectedProfit falls back to revisedContract,
    // so margin should be 100% (nothing spent, nothing extrapolated).
    const project = { id: 'p5', name: 'Fresh', contract_value: 250_000 }
    const projectDataMap = {
      p5: { progress: 0, allCostsTotal: 0, billable: 0, totalBilled: 0 },
    }

    const { rows } = exportSageWIPScheduleCSV([project], projectDataMap)
    const row = rows[0]

    expect(row.projectedProfit).toBe('250000.00')
    expect(row.profitMargin).toBe('100.0')
  })
})
