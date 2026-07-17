/**
 * Financial Consistency Tests
 *
 * Guards the "single source of truth" contract: every view that reports a
 * financial figure must agree with the others.
 *   1. The Financial Trend Chart's cumulative "costs" line must end at the
 *      same total as allCostsTotal / totalBurn (labor + T&M materials +
 *      custom costs + equipment rental).
 *   2. Per-day equipment accrual must sum to the same total as
 *      equipmentOps.calculateProjectEquipmentCost.
 *   3. EVM earned value must match the app-wide earned revenue (billable)
 *      when provided.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest'

import { buildFinancialTimeSeries, buildEquipmentCostByDate } from '../lib/chartDataTransforms'
import { equipmentOps } from '../lib/equipmentOps'
import { calculateEarnedValue } from '../lib/earnedValueCalculations'

// ---- Fixtures ----

const laborByDate = [
  { date: '2026-01-05', cost: 2000, workers: 4 },
  { date: '2026-01-06', cost: 2500, workers: 5 },
]

const materialsEquipmentByDate = [
  { date: '2026-01-06', cost: 800 },
  { date: '2026-01-07', cost: 400 },
]

const customCosts = [
  { cost_date: '2026-01-08', amount: '1500', category: 'permits' },
  { cost_date: '2026-01-05', amount: '250', category: 'other' },
]

// Closed rental: 3 inclusive days (Jan 5–7) @ $100/day = $300
const projectEquipment = [
  { start_date: '2026-01-05', end_date: '2026-01-07', daily_rate: 100 },
]

const laborTotal = laborByDate.reduce((s, d) => s + d.cost, 0)
const materialsTotal = materialsEquipmentByDate.reduce((s, d) => s + d.cost, 0)
const customTotal = customCosts.reduce((s, c) => s + parseFloat(c.amount), 0)

function buildProjectData(overrides = {}) {
  return {
    laborByDate,
    materialsEquipmentByDate,
    customCosts,
    projectEquipment,
    billable: 0,
    ...overrides,
  }
}

const project = { contract_value: 100000 }

// ============================================================
// 1. Equipment accrual matches the total cost calculation
// ============================================================
describe('buildEquipmentCostByDate consistency with calculateProjectEquipmentCost', () => {
  it('per-day accrual sums to the same total for closed rentals', () => {
    const byDate = buildEquipmentCostByDate(projectEquipment)
    const accrued = Object.values(byDate).reduce((s, v) => s + v, 0)
    const total = equipmentOps.calculateProjectEquipmentCost(projectEquipment)
    expect(accrued).toBe(total)
    expect(accrued).toBe(300)
  })

  it('per-day accrual matches total for open rentals (accrues through today)', () => {
    const start = new Date()
    start.setDate(start.getDate() - 4) // 5 inclusive days through today
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const openRental = [{ start_date: startStr, end_date: null, daily_rate: 80 }]

    const byDate = buildEquipmentCostByDate(openRental)
    const accrued = Object.values(byDate).reduce((s, v) => s + v, 0)
    const total = equipmentOps.calculateProjectEquipmentCost(openRental)
    expect(accrued).toBe(total)
  })

  it('charges at least one day, mirroring the min-1-day total rule', () => {
    const sameDay = [{ start_date: '2026-01-05', end_date: '2026-01-05', daily_rate: 120 }]
    const byDate = buildEquipmentCostByDate(sameDay)
    const accrued = Object.values(byDate).reduce((s, v) => s + v, 0)
    expect(accrued).toBe(equipmentOps.calculateProjectEquipmentCost(sameDay))
    expect(accrued).toBe(120)
  })

  it('ignores rows without a start date or rate', () => {
    expect(buildEquipmentCostByDate([{ daily_rate: 100 }, { start_date: '2026-01-05' }])).toEqual({})
    expect(buildEquipmentCostByDate([])).toEqual({})
  })
})

// ============================================================
// 2. Trend chart total costs === burn rate total (allCostsTotal)
// ============================================================
describe('Financial trend chart agrees with burn rate totals', () => {
  it('cumulative costs line ends at labor + materials + custom + equipment', () => {
    const equipmentTotal = equipmentOps.calculateProjectEquipmentCost(projectEquipment)
    const allCostsTotal = laborTotal + materialsTotal + customTotal + equipmentTotal

    const series = buildFinancialTimeSeries(buildProjectData(), project, [], null, [], 0)
    expect(series.length).toBeGreaterThan(0)
    const finalCosts = series[series.length - 1].costs
    expect(finalCosts).toBe(Math.round(allCostsTotal))
  })

  it('daily equipment accrual appears on days with no other activity', () => {
    // Equipment-only project: rental runs Jan 5–7, nothing else recorded
    const data = buildProjectData({
      laborByDate: [],
      materialsEquipmentByDate: [],
      customCosts: [],
    })
    const series = buildFinancialTimeSeries(data, project, [], null, [], 0)
    expect(series.map(p => p.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(series.every(p => p.dailyEquipment === 100)).toBe(true)
    expect(series[series.length - 1].costs).toBe(300)
  })

  it('daily totals in tooltips include equipment rental', () => {
    const series = buildFinancialTimeSeries(buildProjectData(), project, [], null, [], 0)
    const jan5 = series.find(p => p.date === '2026-01-05')
    // Jan 5: labor 2000 + custom 250 + equipment 100
    expect(jan5.dailyLabor).toBe(2000)
    expect(jan5.dailyCustom).toBe(250)
    expect(jan5.dailyEquipment).toBe(100)
    expect(jan5.dailyTotal).toBe(2350)
  })
})

// ============================================================
// 3. EVM earned value matches app-wide earned revenue
// ============================================================
describe('EVM earned value consistency with billable', () => {
  const baseParams = {
    contractValue: 100000,
    changeOrderValue: 10000,
    progressPercent: 50,
    actualCosts: 40000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }

  it('uses the actual earned revenue when provided', () => {
    const ev = calculateEarnedValue({ ...baseParams, earnedValueOverride: 52500 })
    expect(ev.earnedValue).toBe(52500)
    // CPI derives from the same EV
    expect(ev.cpi).toBe(Math.round((52500 / 40000) * 100) / 100)
  })

  it('falls back to progress-based EV when no override is provided', () => {
    const ev = calculateEarnedValue(baseParams)
    expect(ev.earnedValue).toBe(0.5 * 110000)
  })

  it('clamps override to BAC so EV never exceeds the budget', () => {
    const ev = calculateEarnedValue({ ...baseParams, earnedValueOverride: 500000 })
    expect(ev.earnedValue).toBe(110000)
  })

  it('ignores zero/null overrides', () => {
    expect(calculateEarnedValue({ ...baseParams, earnedValueOverride: 0 }).earnedValue).toBe(55000)
    expect(calculateEarnedValue({ ...baseParams, earnedValueOverride: null }).earnedValue).toBe(55000)
  })
})
