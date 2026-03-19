/**
 * Field Sync Data Accuracy Verification Tests
 *
 * Validates that data remains accurate across the entire field sync pipeline:
 *   1. Currency/percentage conversion round-trips (no precision loss)
 *   2. Progress calculations match between field and office views
 *   3. COR totals are mathematically correct end-to-end
 *   4. Offline queue preserves data integrity
 *   5. Schedule insights compute correctly
 *   6. Earned value metrics are consistent
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest'

// ============================================================
// Imports under test
// ============================================================
import {
  calculateProgress,
  calculateValueProgress,
  getOverallStatus,
  calculateScheduleInsights,
  shouldAutoArchive,
  parseLocalDate,
  getLocalDateString
} from '../lib/utils'

import {
  centsToDollars,
  dollarsToCents,
  basisPointsToPercent,
  percentToBasisPoints,
  calculateLaborItemTotal,
  calculateLineItemTotal,
  calculateMarkup,
  calculateFee,
  calculateCORTotals,
  formatCurrency as formatCORCurrency,
  groupLaborByClassAndType
} from '../lib/corCalculations'

import { calculateEarnedValue } from '../lib/earnedValueCalculations'

import {
  stampForOffline,
  detectConflict,
  resolveConflict,
  RESOLUTION_STRATEGIES
} from '../lib/conflictDetection'

// ============================================================
// 1. Currency Conversion Round-Trip Accuracy
// ============================================================
describe('Currency conversion round-trip accuracy', () => {
  const testAmounts = [0, 0.01, 0.99, 1, 1.50, 99.99, 100, 1234.56, 99999.99]

  testAmounts.forEach(dollars => {
    it(`dollars→cents→dollars round-trip preserves $${dollars}`, () => {
      const cents = dollarsToCents(dollars)
      const backToDollars = parseFloat(centsToDollars(cents))
      expect(backToDollars).toBeCloseTo(dollars, 2)
    })
  })

  it('cents→dollars→cents round-trip preserves integer cents', () => {
    const testCents = [0, 1, 50, 99, 100, 150, 9999, 12345, 9999999]
    testCents.forEach(cents => {
      const dollars = centsToDollars(cents)
      const backToCents = dollarsToCents(dollars)
      expect(backToCents).toBe(cents)
    })
  })

  it('large COR value round-trip: $1,250,000.00', () => {
    const cents = dollarsToCents(1250000)
    expect(cents).toBe(125000000)
    expect(parseFloat(centsToDollars(cents))).toBe(1250000)
  })

  it('sub-cent dollar amounts are rounded via Math.round', () => {
    // Note: 1.005 * 100 = 100.49999... due to IEEE 754, so Math.round gives 100
    // This is a known floating-point behavior, not a bug
    expect(dollarsToCents(1.005)).toBe(100)
    expect(dollarsToCents(1.004)).toBe(100)
    expect(dollarsToCents(1.006)).toBe(101)
  })
})

// ============================================================
// 2. Basis Points Round-Trip Accuracy
// ============================================================
describe('Basis points conversion round-trip accuracy', () => {
  const testPercents = [0, 0.10, 1.44, 5, 15, 50, 100]

  testPercents.forEach(pct => {
    it(`percent→bp→percent round-trip preserves ${pct}%`, () => {
      const bp = percentToBasisPoints(pct)
      const backToPercent = parseFloat(basisPointsToPercent(bp))
      expect(backToPercent).toBeCloseTo(pct, 2)
    })
  })

  it('basis points→percent→basis points preserves integer bp', () => {
    const testBP = [0, 10, 100, 144, 500, 1500, 5000, 10000]
    testBP.forEach(bp => {
      const pct = basisPointsToPercent(bp)
      const backToBP = percentToBasisPoints(pct)
      expect(backToBP).toBe(bp)
    })
  })

  it('default markup percentages survive round-trip', () => {
    // Verify all default basis points survive conversion
    const defaults = { labor: 1500, materials: 1500, equipment: 1500, subs: 500, liability: 144, bond: 100, license: 10 }
    Object.entries(defaults).forEach(([name, bp]) => {
      const pct = basisPointsToPercent(bp)
      const roundTrip = percentToBasisPoints(pct)
      expect(roundTrip).toBe(bp)
    })
  })
})

// ============================================================
// 3. Progress Calculation Consistency (Field ↔ Office)
// ============================================================
describe('Progress calculation consistency across field and office', () => {
  it('weight-based: field marks area done → office sees same progress', () => {
    const areas = [
      { name: 'Foundation', status: 'done', weight: 20 },
      { name: 'Framing', status: 'done', weight: 30 },
      { name: 'Electrical', status: 'working', weight: 25 },
      { name: 'Finishing', status: 'not_started', weight: 25 }
    ]
    // Both field and office use the same calculateProgress
    const fieldProgress = calculateProgress(areas)
    const officeProgress = calculateProgress(areas)
    expect(fieldProgress).toBe(officeProgress)
    expect(fieldProgress).toBe(50) // 20 + 30
  })

  it('SOV-based: value progress matches between sides', () => {
    const areas = [
      { name: 'Phase 1', status: 'done', scheduled_value: 150000 },
      { name: 'Phase 2', status: 'done', scheduled_value: 100000 },
      { name: 'Phase 3', status: 'working', scheduled_value: 250000 }
    ]
    const fieldResult = calculateValueProgress(areas)
    const officeResult = calculateValueProgress(areas)
    expect(fieldResult.progress).toBe(officeResult.progress)
    expect(fieldResult.earnedValue).toBe(officeResult.earnedValue)
    expect(fieldResult.progress).toBe(50) // 250K of 500K
    expect(fieldResult.isValueBased).toBe(true)
  })

  it('weight-based progress handles areas not summing to 100', () => {
    const areas = [
      { name: 'A', status: 'done', weight: 33 },
      { name: 'B', status: 'done', weight: 33 },
      { name: 'C', status: 'done', weight: 33 }
    ]
    // 33+33+33 = 99, not 100
    expect(calculateProgress(areas)).toBe(99)
  })

  it('SOV-based progress with zero total value returns 0', () => {
    const areas = [
      { name: 'A', status: 'done', scheduled_value: 0 },
      { name: 'B', status: 'working', scheduled_value: 0 }
    ]
    const result = calculateValueProgress(areas)
    expect(result.progress).toBe(0)
    expect(result.isValueBased).toBe(false) // no values > 0
  })

  it('mixed SOV areas: some with value, some without → uses SOV mode', () => {
    const areas = [
      { name: 'A', status: 'done', scheduled_value: 50000 },
      { name: 'B', status: 'working', scheduled_value: 0 },
      { name: 'C', status: 'not_started', scheduled_value: 50000 }
    ]
    const result = calculateValueProgress(areas)
    expect(result.isValueBased).toBe(true)
    expect(result.totalValue).toBe(100000)
    expect(result.earnedValue).toBe(50000)
    expect(result.progress).toBe(50)
  })

  it('single area project: 0% or 100% only', () => {
    const notStarted = [{ name: 'Only Area', status: 'not_started', weight: 100 }]
    const done = [{ name: 'Only Area', status: 'done', weight: 100 }]
    expect(calculateProgress(notStarted)).toBe(0)
    expect(calculateProgress(done)).toBe(100)
  })

  it('overall status reflects actual area states', () => {
    expect(getOverallStatus([
      { status: 'done' }, { status: 'done' }
    ])).toBe('done')
    expect(getOverallStatus([
      { status: 'done' }, { status: 'not_started' }
    ])).toBe('working') // mixed = working
    expect(getOverallStatus([
      { status: 'not_started' }, { status: 'not_started' }
    ])).toBe('not_started')
  })
})

// ============================================================
// 4. COR Total Accuracy — End-to-End
// ============================================================
describe('COR total accuracy: line items through final total', () => {
  it('labor line item → subtotal → markup → fees → total is mathematically correct', () => {
    // 1 Foreman: 8 regular hours at $50/hr, 2 OT hours at $75/hr
    const labor = calculateLaborItemTotal(8, 2, 5000, 7500) // rates in cents
    expect(labor.regularTotal).toBe(40000) // 8 * 5000
    expect(labor.overtimeTotal).toBe(15000) // 2 * 7500
    expect(labor.total).toBe(55000)

    // Build COR with just this labor
    const cor = {
      change_order_labor: [{ total: labor.total }],
      change_order_materials: [],
      change_order_equipment: [],
      change_order_subcontractors: [],
      labor_markup_percent: 1500, // 15%
      materials_markup_percent: 0,
      equipment_markup_percent: 0,
      subcontractors_markup_percent: 0,
      liability_insurance_percent: 144,
      bond_percent: 100,
      license_fee_percent: 10
    }

    const totals = calculateCORTotals(cor)
    expect(totals.labor_subtotal).toBe(55000)
    expect(totals.labor_markup_amount).toBe(8250) // 55000 * 15%
    expect(totals.cor_subtotal).toBe(63250) // 55000 + 8250

    // Fees on subtotal
    const expectedLiability = Math.round(63250 * 144 / 10000) // 911
    const expectedBond = Math.round(63250 * 100 / 10000) // 633
    const expectedLicense = Math.round(63250 * 10 / 10000) // 63

    expect(totals.liability_insurance_amount).toBe(expectedLiability)
    expect(totals.bond_amount).toBe(expectedBond)
    expect(totals.license_fee_amount).toBe(expectedLicense)
    expect(totals.cor_total).toBe(63250 + expectedLiability + expectedBond + expectedLicense)
  })

  it('multiple CORs sum correctly for project billing', () => {
    const cor1 = calculateCORTotals({
      change_order_labor: [{ total: 100000 }],
      labor_markup_percent: 1500,
      materials_markup_percent: 0,
      equipment_markup_percent: 0,
      subcontractors_markup_percent: 0,
      liability_insurance_percent: 0,
      bond_percent: 0,
      license_fee_percent: 0
    })

    const cor2 = calculateCORTotals({
      change_order_materials: [{ total: 50000 }],
      labor_markup_percent: 0,
      materials_markup_percent: 1500,
      equipment_markup_percent: 0,
      subcontractors_markup_percent: 0,
      liability_insurance_percent: 0,
      bond_percent: 0,
      license_fee_percent: 0
    })

    const projectTotal = cor1.cor_total + cor2.cor_total
    expect(projectTotal).toBe(115000 + 57500) // (100K + 15K) + (50K + 7.5K)
  })

  it('all-category COR with realistic construction values', () => {
    const cor = {
      change_order_labor: [
        { total: calculateLaborItemTotal(40, 8, 6500, 9750).total }, // Foreman 1 week
        { total: calculateLaborItemTotal(40, 4, 4500, 6750).total }  // Laborer 1 week
      ],
      change_order_materials: [
        { total: calculateLineItemTotal(100, 2500) },  // 100 units @ $25 each
        { total: calculateLineItemTotal(50, 7500) }     // 50 units @ $75 each
      ],
      change_order_equipment: [
        { total: calculateLineItemTotal(5, 35000) }     // 5 days @ $350/day
      ],
      change_order_subcontractors: [
        { total: 250000 }                                // Lump sum $2,500
      ],
      labor_markup_percent: 1500,
      materials_markup_percent: 1500,
      equipment_markup_percent: 1500,
      subcontractors_markup_percent: 500,
      liability_insurance_percent: 144,
      bond_percent: 100,
      license_fee_percent: 10
    }

    const totals = calculateCORTotals(cor)

    // Verify each subtotal independently
    const expectedLaborSub = cor.change_order_labor.reduce((s, i) => s + i.total, 0)
    const expectedMatSub = cor.change_order_materials.reduce((s, i) => s + i.total, 0)
    const expectedEquipSub = cor.change_order_equipment.reduce((s, i) => s + i.total, 0)
    const expectedSubSub = 250000

    expect(totals.labor_subtotal).toBe(expectedLaborSub)
    expect(totals.materials_subtotal).toBe(expectedMatSub)
    expect(totals.equipment_subtotal).toBe(expectedEquipSub)
    expect(totals.subcontractors_subtotal).toBe(expectedSubSub)

    // Verify markups are applied to correct subtotals
    expect(totals.labor_markup_amount).toBe(calculateMarkup(expectedLaborSub, 1500))
    expect(totals.materials_markup_amount).toBe(calculateMarkup(expectedMatSub, 1500))
    expect(totals.equipment_markup_amount).toBe(calculateMarkup(expectedEquipSub, 1500))
    expect(totals.subcontractors_markup_amount).toBe(calculateMarkup(expectedSubSub, 500))

    // Verify total chain
    const expectedCorSub = expectedLaborSub + expectedMatSub + expectedEquipSub + expectedSubSub +
      totals.labor_markup_amount + totals.materials_markup_amount +
      totals.equipment_markup_amount + totals.subcontractors_markup_amount
    expect(totals.cor_subtotal).toBe(expectedCorSub)

    // Fees applied to cor_subtotal
    expect(totals.additional_fees_total).toBe(
      totals.liability_insurance_amount + totals.bond_amount + totals.license_fee_amount
    )
    expect(totals.cor_total).toBe(totals.cor_subtotal + totals.additional_fees_total)
  })

  it('no accumulated rounding error: sum of parts equals total', () => {
    // Use values that are prone to floating-point issues
    const cor = {
      change_order_labor: [{ total: 33333 }],
      change_order_materials: [{ total: 66667 }],
      change_order_equipment: [{ total: 11111 }],
      change_order_subcontractors: [{ total: 77777 }],
      labor_markup_percent: 1500,
      materials_markup_percent: 1500,
      equipment_markup_percent: 1500,
      subcontractors_markup_percent: 500,
      liability_insurance_percent: 144,
      bond_percent: 100,
      license_fee_percent: 10
    }

    const totals = calculateCORTotals(cor)

    // Verify no floating point drift: all intermediate values are integers
    expect(Number.isInteger(totals.labor_subtotal)).toBe(true)
    expect(Number.isInteger(totals.materials_subtotal)).toBe(true)
    expect(Number.isInteger(totals.labor_markup_amount)).toBe(true)
    expect(Number.isInteger(totals.cor_subtotal)).toBe(true)
    expect(Number.isInteger(totals.liability_insurance_amount)).toBe(true)
    expect(Number.isInteger(totals.cor_total)).toBe(true)

    // Total chain is exact
    const manualTotal = totals.labor_subtotal + totals.materials_subtotal +
      totals.equipment_subtotal + totals.subcontractors_subtotal +
      totals.labor_markup_amount + totals.materials_markup_amount +
      totals.equipment_markup_amount + totals.subcontractors_markup_amount +
      totals.liability_insurance_amount + totals.bond_amount + totals.license_fee_amount
    expect(totals.cor_total).toBe(manualTotal)
  })
})

// ============================================================
// 5. Labor Grouping Accuracy
// ============================================================
describe('Labor grouping preserves totals', () => {
  it('grouped labor subtotals sum to ungrouped total', () => {
    const laborItems = [
      { labor_class: 'Foreman', wage_type: 'standard', total: 40000 },
      { labor_class: 'Foreman', wage_type: 'standard', total: 35000 },
      { labor_class: 'Laborer', wage_type: 'prevailing', total: 28000 },
      { labor_class: 'Operator', wage_type: 'pla', total: 52000 }
    ]

    const groups = groupLaborByClassAndType(laborItems)
    const groupedTotal = groups.reduce((sum, g) => sum + g.subtotal, 0)
    const directTotal = laborItems.reduce((sum, i) => sum + i.total, 0)
    expect(groupedTotal).toBe(directTotal)
    expect(groupedTotal).toBe(155000)
  })
})

// ============================================================
// 6. Offline Data Integrity
// ============================================================
describe('Offline sync preserves data values exactly', () => {
  it('stampForOffline preserves all original fields', () => {
    const areaData = {
      id: 'area-123',
      name: 'Floor 2 - East Wing',
      status: 'working',
      weight: 25,
      scheduled_value: 150000,
      updated_at: '2025-06-15T10:30:00Z'
    }

    const stamped = stampForOffline(areaData, ['status', 'weight'])
    expect(stamped.id).toBe(areaData.id)
    expect(stamped.name).toBe(areaData.name)
    expect(stamped.status).toBe(areaData.status)
    expect(stamped.weight).toBe(areaData.weight)
    expect(stamped.scheduled_value).toBe(areaData.scheduled_value)
    expect(stamped.updated_at).toBe(areaData.updated_at)
    expect(stamped._cachedValues.status).toBe('working')
    expect(stamped._cachedValues.weight).toBe(25)
  })

  it('conflict resolution KEEP_LOCAL preserves exact local values', () => {
    const local = { id: 'a1', status: 'done', weight: 25, name: 'Test Area' }
    const server = { id: 'a1', status: 'working', weight: 30, name: 'Test Area Updated' }
    const resolved = resolveConflict(local, server, RESOLUTION_STRATEGIES.KEEP_LOCAL)
    expect(resolved.status).toBe('done')
    expect(resolved.weight).toBe(25)
    expect(resolved.name).toBe('Test Area')
  })

  it('conflict resolution KEEP_SERVER preserves exact server values', () => {
    const local = { id: 'a1', status: 'done', weight: 25 }
    const server = { id: 'a1', status: 'working', weight: 30 }
    const resolved = resolveConflict(local, server, RESOLUTION_STRATEGIES.KEEP_SERVER)
    expect(resolved.status).toBe('working')
    expect(resolved.weight).toBe(30)
  })

  it('conflict resolution MERGE applies field-level selections accurately', () => {
    const local = { id: 'a1', status: 'done', weight: 25, name: 'Local Name' }
    const server = { id: 'a1', status: 'working', weight: 30, name: 'Server Name' }
    const resolved = resolveConflict(local, server, RESOLUTION_STRATEGIES.MERGE, {
      status: 'local',
      weight: 'local'
    })
    expect(resolved.status).toBe('done')
    expect(resolved.weight).toBe(25)
    expect(resolved.name).toBe('Server Name') // unselected fields use server
  })

  it('detect conflict with concurrent field and office edits on same area', () => {
    // Field user cached area at 10:00, changed status AND weight at 10:05
    // Office user also changed both at 10:03
    const fieldRecord = {
      id: 'area-1',
      status: 'done',
      weight: 35, // field changed from 25 to 35
      _cachedAt: '2025-06-15T10:00:00Z',
      _offlineModifiedAt: '2025-06-15T10:05:00Z',
      _cachedValues: { status: 'working', weight: 25 }
    }
    const officeVersion = {
      id: 'area-1',
      status: 'not_started', // server changed status to different value than cached 'working'
      weight: 30, // server changed weight differently
      updated_at: '2025-06-15T10:03:00Z'
    }

    const result = detectConflict(fieldRecord, officeVersion, ['status', 'weight'])
    expect(result.hasConflict).toBe(true)
    // Both status and weight changed by both parties
    expect(result.conflicts.length).toBe(2)
    const statusConflict = result.conflicts.find(c => c.field === 'status')
    const weightConflict = result.conflicts.find(c => c.field === 'weight')
    expect(statusConflict.localValue).toBe('done')
    expect(statusConflict.serverValue).toBe('not_started')
    expect(weightConflict.localValue).toBe(35)
    expect(weightConflict.serverValue).toBe(30)
  })

  it('no conflict when only one side changed a field', () => {
    // Field changed status, office changed weight — no overlap = no conflict
    const fieldRecord = {
      id: 'area-1',
      status: 'done',
      weight: 25, // field did NOT change weight (same as cached)
      _cachedAt: '2025-06-15T10:00:00Z',
      _offlineModifiedAt: '2025-06-15T10:05:00Z',
      _cachedValues: { status: 'working', weight: 25 }
    }
    const officeVersion = {
      id: 'area-1',
      status: 'working', // server kept status same as cached
      weight: 30, // server changed weight
      updated_at: '2025-06-15T10:03:00Z'
    }

    const result = detectConflict(fieldRecord, officeVersion, ['status', 'weight'])
    // status: local changed (working→done), server didn't change (working→working) → no conflict
    // weight: local didn't change (25→25), server changed (25→30) → no conflict
    expect(result.hasConflict).toBe(false)
  })
})

// ============================================================
// 7. Schedule Insights Accuracy
// ============================================================
describe('Schedule insights calculations', () => {
  it('returns default values when no dates provided', () => {
    const result = calculateScheduleInsights({})
    expect(result.scheduleStatus).toBe('on_track')
    expect(result.hasScheduleData).toBe(false)
    expect(result.hasLaborData).toBe(false)
  })

  it('detects behind schedule when progress lags time', () => {
    // Project started 100 days ago, ends 100 days from now → 50% time elapsed
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - 100)
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + 100)

    const project = {
      start_date: getLocalDateString(startDate),
      end_date: getLocalDateString(endDate),
      progress: 20 // only 20% done at 50% of timeline
    }
    const result = calculateScheduleInsights(project)
    expect(result.hasScheduleData).toBe(true)
    expect(result.scheduleStatus).toBe('behind')
    expect(result.scheduleVariance).toBeLessThan(-5)
  })

  it('detects ahead of schedule when progress leads time', () => {
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - 50)
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + 150)

    const project = {
      start_date: getLocalDateString(startDate),
      end_date: getLocalDateString(endDate),
      progress: 60 // 60% done at 25% of timeline
    }
    const result = calculateScheduleInsights(project)
    expect(result.hasScheduleData).toBe(true)
    expect(result.scheduleStatus).toBe('ahead')
    expect(result.scheduleVariance).toBeGreaterThan(5)
  })

  it('labor variance detects over-planned man-days', () => {
    const project = {
      planned_man_days: 100,
      progress: 50 // 50% done → expected 50 man-days
    }
    const result = calculateScheduleInsights(project, 70) // used 70, expected 50
    expect(result.hasLaborData).toBe(true)
    expect(result.laborStatus).toBe('over')
    expect(result.laborVariance).toBe(40) // (70-50)/50 * 100
  })

  it('labor on track within 10% tolerance', () => {
    const project = { planned_man_days: 100, progress: 50 }
    const result = calculateScheduleInsights(project, 52) // 4% over
    expect(result.laborStatus).toBe('on_track')
  })
})

// ============================================================
// 8. Auto-Archive Logic
// ============================================================
describe('Auto-archive accuracy', () => {
  it('does not archive incomplete projects', () => {
    expect(shouldAutoArchive({ progress: 50, status: 'active', areas: [{ status: 'working' }] })).toBe(false)
  })

  it('does not archive already-archived projects', () => {
    expect(shouldAutoArchive({ progress: 100, status: 'archived', areas: [{ status: 'done' }] })).toBe(false)
  })

  it('does not archive when areas are not all done', () => {
    expect(shouldAutoArchive({
      progress: 100,
      status: 'active',
      areas: [{ status: 'done' }, { status: 'working' }]
    })).toBe(false)
  })

  it('archives complete project after threshold days', () => {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    expect(shouldAutoArchive({
      progress: 100,
      status: 'active',
      areas: [
        { status: 'done', updated_at: sixtyDaysAgo.toISOString() },
        { status: 'done', updated_at: sixtyDaysAgo.toISOString() }
      ]
    })).toBe(true)
  })

  it('does not archive recently completed project', () => {
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    expect(shouldAutoArchive({
      progress: 100,
      status: 'active',
      areas: [{ status: 'done', updated_at: twoDaysAgo.toISOString() }]
    })).toBe(false)
  })

  it('respects custom archive threshold', () => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    expect(shouldAutoArchive({
      progress: 100,
      status: 'active',
      areas: [{ status: 'done', updated_at: tenDaysAgo.toISOString() }]
    }, 7)).toBe(true)
    expect(shouldAutoArchive({
      progress: 100,
      status: 'active',
      areas: [{ status: 'done', updated_at: tenDaysAgo.toISOString() }]
    }, 14)).toBe(false)
  })
})

// ============================================================
// 9. Earned Value Cross-Verification
// ============================================================
describe('Earned value metrics internal consistency', () => {
  it('EV = BAC × progress%', () => {
    const result = calculateEarnedValue({
      contractValue: 800000,
      changeOrderValue: 200000,
      progressPercent: 40,
      actualCosts: 350000,
      startDate: '2025-01-01',
      endDate: '2027-01-01'
    })
    expect(result.bac).toBe(1000000)
    expect(result.earnedValue).toBe(400000) // 40% of 1M
  })

  it('CPI × AC ≈ EV (cost performance identity, within rounding from CPI truncation)', () => {
    const result = calculateEarnedValue({
      contractValue: 500000,
      changeOrderValue: 0,
      progressPercent: 60,
      actualCosts: 280000,
      startDate: '2025-01-01',
      endDate: '2026-06-01'
    })
    // CPI is rounded to 2 decimals, so CPI*AC may differ from EV by up to ~1%
    const evFromCPI = result.cpi * result.actualCost
    const tolerance = result.actualCost * 0.01 // 1% tolerance for rounding
    expect(Math.abs(evFromCPI - result.earnedValue)).toBeLessThan(tolerance)
  })

  it('EAC ≈ BAC / CPI (estimate at completion, within rounding)', () => {
    const result = calculateEarnedValue({
      contractValue: 1000000,
      changeOrderValue: 50000,
      progressPercent: 50,
      actualCosts: 600000,
      startDate: '2025-06-01',
      endDate: '2027-06-01'
    })
    if (result.cpi > 0) {
      // EAC is Math.round(BAC/CPI) where CPI is already rounded to 2 decimals
      // So tolerance allows for the compounded rounding
      const expectedEAC = result.bac / result.cpi
      const tolerance = result.bac * 0.01
      expect(Math.abs(result.eac - expectedEAC)).toBeLessThan(tolerance)
    }
  })

  it('ETC = EAC - AC (estimate to complete identity)', () => {
    const result = calculateEarnedValue({
      contractValue: 750000,
      changeOrderValue: 25000,
      progressPercent: 30,
      actualCosts: 200000,
      startDate: '2025-06-01',
      endDate: '2027-06-01'
    })
    expect(result.etc).toBe(result.eac - result.actualCost)
  })

  it('cost variance = EV - AC', () => {
    const result = calculateEarnedValue({
      contractValue: 500000,
      changeOrderValue: 0,
      progressPercent: 50,
      actualCosts: 200000,
      startDate: '2025-01-01',
      endDate: '2026-01-01'
    })
    expect(result.costVariance).toBe(result.earnedValue - result.actualCost)
  })

  it('schedule variance = EV - PV', () => {
    const result = calculateEarnedValue({
      contractValue: 500000,
      changeOrderValue: 0,
      progressPercent: 50,
      actualCosts: 200000,
      startDate: '2025-01-01',
      endDate: '2026-01-01'
    })
    expect(result.scheduleVariance).toBe(result.earnedValue - result.plannedValue)
  })

  it('progress clamped to 0-100 range', () => {
    const over = calculateEarnedValue({
      contractValue: 100000, progressPercent: 150, actualCosts: 0
    })
    expect(over.earnedValue).toBe(100000) // clamped to 100%

    const under = calculateEarnedValue({
      contractValue: 100000, progressPercent: -20, actualCosts: 0
    })
    expect(under.earnedValue).toBe(0) // clamped to 0%
  })
})

// ============================================================
// 10. Date Parsing Accuracy
// ============================================================
describe('Date parsing preserves local timezone', () => {
  it('parseLocalDate treats YYYY-MM-DD as local, not UTC', () => {
    const date = parseLocalDate('2025-06-15')
    expect(date.getDate()).toBe(15)
    expect(date.getMonth()).toBe(5) // June = 5
    expect(date.getFullYear()).toBe(2025)
  })

  it('getLocalDateString round-trips with parseLocalDate', () => {
    const original = new Date(2025, 5, 15) // June 15, 2025 local
    const str = getLocalDateString(original)
    expect(str).toBe('2025-06-15')
    const parsed = parseLocalDate(str)
    expect(parsed.getFullYear()).toBe(2025)
    expect(parsed.getMonth()).toBe(5)
    expect(parsed.getDate()).toBe(15)
  })

  it('ISO datetime strings are parsed correctly', () => {
    const date = parseLocalDate('2025-06-15T14:30:00Z')
    expect(date instanceof Date).toBe(true)
    expect(date.getTime()).not.toBeNaN()
  })

  it('null/undefined returns null', () => {
    expect(parseLocalDate(null)).toBeNull()
    expect(parseLocalDate(undefined)).toBeNull()
    expect(parseLocalDate('')).toBeNull()
  })
})

// ============================================================
// 11. Edge Case: Zero-Value Projects
// ============================================================
describe('Zero-value and empty project edge cases', () => {
  it('empty project has 0 progress and not_started status', () => {
    expect(calculateProgress([])).toBe(0)
    expect(calculateProgress(null)).toBe(0)
    expect(getOverallStatus([])).toBe('not_started')
  })

  it('COR with no line items has $0 total', () => {
    const totals = calculateCORTotals({})
    expect(totals.cor_total).toBe(0)
    expect(totals.cor_subtotal).toBe(0)
    expect(totals.additional_fees_total).toBe(0)
  })

  it('earned value with zero contract returns sensible defaults', () => {
    const result = calculateEarnedValue({
      contractValue: 0, changeOrderValue: 0,
      progressPercent: 50, actualCosts: 0
    })
    expect(result.bac).toBe(0)
    expect(result.earnedValue).toBe(0)
    expect(result.budgetUtilization).toBe(0)
  })

  it('labor item with zero rates returns 0', () => {
    const result = calculateLaborItemTotal(8, 2, 0, 0)
    expect(result.total).toBe(0)
  })

  it('markup on zero subtotal is zero', () => {
    expect(calculateMarkup(0, 1500)).toBe(0)
  })

  it('fee on zero subtotal is zero', () => {
    expect(calculateFee(0, 144)).toBe(0)
  })
})
