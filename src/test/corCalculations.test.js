import { describe, it, expect } from 'vitest'
import {
  centsToDollars,
  formatCurrency,
  dollarsToCents,
  basisPointsToPercent,
  formatPercent,
  percentToBasisPoints,
  calculateLaborItemTotal,
  calculateLineItemTotal,
  calculateMarkup,
  calculateFee,
  calculateCORTotals,
  validateCOR,
  getStatusInfo,
  formatDate,
  formatDateRange,
  DEFAULT_PERCENTAGES,
  LABOR_CLASSES,
  WAGE_TYPES,
  SOURCE_TYPES,
  COMMON_UNITS
} from '../lib/corCalculations'

// ============================================
// Currency Conversions
// ============================================

describe('centsToDollars', () => {
  it('converts cents to dollars string', () => {
    expect(centsToDollars(10000)).toBe('100.00')
    expect(centsToDollars(150)).toBe('1.50')
    expect(centsToDollars(1)).toBe('0.01')
  })

  it('handles zero', () => {
    expect(centsToDollars(0)).toBe('0.00')
  })

  it('handles null/undefined as zero', () => {
    expect(centsToDollars(null)).toBe('0.00')
    expect(centsToDollars(undefined)).toBe('0.00')
  })

  it('handles negative cents', () => {
    expect(centsToDollars(-500)).toBe('-5.00')
  })

  it('handles very large values', () => {
    expect(centsToDollars(99999999)).toBe('999999.99')
  })
})

describe('formatCurrency', () => {
  it('formats cents as USD currency string', () => {
    expect(formatCurrency(10000)).toBe('$100.00')
    expect(formatCurrency(150)).toBe('$1.50')
  })

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('handles null/undefined', () => {
    expect(formatCurrency(null)).toBe('$0.00')
    expect(formatCurrency(undefined)).toBe('$0.00')
  })

  it('formats large values with commas', () => {
    expect(formatCurrency(1000000)).toBe('$10,000.00')
  })

  it('handles negative values', () => {
    expect(formatCurrency(-500)).toMatch(/-?\$5\.00/)
  })
})

describe('dollarsToCents', () => {
  it('converts dollars to cents', () => {
    expect(dollarsToCents(100)).toBe(10000)
    expect(dollarsToCents(1.50)).toBe(150)
    expect(dollarsToCents(0.01)).toBe(1)
  })

  it('rounds to nearest cent', () => {
    expect(dollarsToCents(1.999)).toBe(200)
    expect(dollarsToCents(1.001)).toBe(100)
  })

  it('handles zero', () => {
    expect(dollarsToCents(0)).toBe(0)
  })

  it('handles null/undefined', () => {
    expect(dollarsToCents(null)).toBe(0)
    expect(dollarsToCents(undefined)).toBe(0)
  })

  it('handles string input', () => {
    expect(dollarsToCents('25.50')).toBe(2550)
  })

  it('handles non-numeric string', () => {
    expect(dollarsToCents('abc')).toBe(0)
  })
})

// ============================================
// Basis Points Conversions
// ============================================

describe('basisPointsToPercent', () => {
  it('converts basis points to percent string', () => {
    expect(basisPointsToPercent(1500)).toBe('15.00')
    expect(basisPointsToPercent(500)).toBe('5.00')
    expect(basisPointsToPercent(144)).toBe('1.44')
    expect(basisPointsToPercent(10)).toBe('0.10')
  })

  it('handles zero', () => {
    expect(basisPointsToPercent(0)).toBe('0.00')
  })

  it('handles null/undefined', () => {
    expect(basisPointsToPercent(null)).toBe('0.00')
    expect(basisPointsToPercent(undefined)).toBe('0.00')
  })
})

describe('formatPercent', () => {
  it('formats basis points as percentage string', () => {
    expect(formatPercent(1500)).toBe('15.00%')
    expect(formatPercent(500)).toBe('5.00%')
  })

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0.00%')
  })
})

describe('percentToBasisPoints', () => {
  it('converts percentage to basis points', () => {
    expect(percentToBasisPoints(15)).toBe(1500)
    expect(percentToBasisPoints(5)).toBe(500)
    expect(percentToBasisPoints(1.44)).toBe(144)
  })

  it('rounds to nearest basis point', () => {
    expect(percentToBasisPoints(15.005)).toBe(1501)
  })

  it('handles zero', () => {
    expect(percentToBasisPoints(0)).toBe(0)
  })

  it('handles null/undefined', () => {
    expect(percentToBasisPoints(null)).toBe(0)
    expect(percentToBasisPoints(undefined)).toBe(0)
  })

  it('handles string input', () => {
    expect(percentToBasisPoints('15')).toBe(1500)
  })
})

// ============================================
// Labor Item Totals
// ============================================

describe('calculateLaborItemTotal', () => {
  it('calculates regular hours only', () => {
    const result = calculateLaborItemTotal(8, 0, 5000, 7500)
    expect(result.regularTotal).toBe(40000) // 8 * 5000
    expect(result.overtimeTotal).toBe(0)
    expect(result.total).toBe(40000)
  })

  it('calculates regular + overtime', () => {
    const result = calculateLaborItemTotal(8, 2, 5000, 7500)
    expect(result.regularTotal).toBe(40000)
    expect(result.overtimeTotal).toBe(15000)
    expect(result.total).toBe(55000)
  })

  it('handles zero hours', () => {
    const result = calculateLaborItemTotal(0, 0, 5000, 7500)
    expect(result.total).toBe(0)
  })

  it('handles null/undefined inputs', () => {
    const result = calculateLaborItemTotal(null, undefined, null, undefined)
    expect(result.total).toBe(0)
  })

  it('handles string inputs', () => {
    const result = calculateLaborItemTotal('8', '2', '5000', '7500')
    expect(result.regularTotal).toBe(40000)
    expect(result.overtimeTotal).toBe(15000)
    expect(result.total).toBe(55000)
  })

  it('rounds fractional hours correctly', () => {
    const result = calculateLaborItemTotal(8.5, 0, 5000, 7500)
    expect(result.regularTotal).toBe(42500) // 8.5 * 5000
  })
})

// ============================================
// Line Item Totals
// ============================================

describe('calculateLineItemTotal', () => {
  it('calculates quantity * unit cost', () => {
    expect(calculateLineItemTotal(10, 500)).toBe(5000)
  })

  it('handles fractional quantities', () => {
    expect(calculateLineItemTotal(2.5, 1000)).toBe(2500)
  })

  it('handles zero', () => {
    expect(calculateLineItemTotal(0, 500)).toBe(0)
    expect(calculateLineItemTotal(10, 0)).toBe(0)
  })

  it('handles null/undefined', () => {
    expect(calculateLineItemTotal(null, 500)).toBe(0)
    expect(calculateLineItemTotal(10, null)).toBe(0)
  })

  it('rounds result', () => {
    // 3.33 * 100 = 333 (rounded from 333.0)
    expect(calculateLineItemTotal(3.33, 100)).toBe(333)
  })
})

// ============================================
// Markup and Fee Calculations
// ============================================

describe('calculateMarkup', () => {
  it('calculates markup from subtotal and basis points', () => {
    // 100000 cents ($1000) at 1500bp (15%) = 15000 cents ($150)
    expect(calculateMarkup(100000, 1500)).toBe(15000)
  })

  it('handles 5% markup on subcontractors', () => {
    expect(calculateMarkup(50000, 500)).toBe(2500)
  })

  it('handles zero subtotal', () => {
    expect(calculateMarkup(0, 1500)).toBe(0)
  })

  it('handles zero basis points', () => {
    expect(calculateMarkup(100000, 0)).toBe(0)
  })

  it('handles null inputs', () => {
    expect(calculateMarkup(null, 1500)).toBe(0)
    expect(calculateMarkup(100000, null)).toBe(0)
  })

  it('rounds correctly', () => {
    // 333 * 1500 / 10000 = 49.95 -> rounds to 50
    expect(calculateMarkup(333, 1500)).toBe(50)
  })
})

describe('calculateFee', () => {
  it('calculates fee from subtotal and basis points', () => {
    // 100000 * 144 / 10000 = 1440
    expect(calculateFee(100000, 144)).toBe(1440)
  })

  it('handles bond fee at 1%', () => {
    expect(calculateFee(100000, 100)).toBe(1000)
  })

  it('handles license fee at 0.10%', () => {
    expect(calculateFee(100000, 10)).toBe(100)
  })

  it('handles zero inputs', () => {
    expect(calculateFee(0, 144)).toBe(0)
    expect(calculateFee(100000, 0)).toBe(0)
  })
})

// ============================================
// Full COR Totals
// ============================================

describe('calculateCORTotals', () => {
  const baseCOR = {
    change_order_labor: [
      { total: 40000 },
      { total: 55000 }
    ],
    change_order_materials: [
      { total: 25000 }
    ],
    change_order_equipment: [
      { total: 10000 }
    ],
    change_order_subcontractors: [
      { total: 30000 }
    ],
    labor_markup_percent: 1500,
    materials_markup_percent: 1500,
    equipment_markup_percent: 1500,
    subcontractors_markup_percent: 500,
    liability_insurance_percent: 144,
    bond_percent: 100,
    license_fee_percent: 10
  }

  it('calculates subtotals correctly', () => {
    const result = calculateCORTotals(baseCOR)
    expect(result.labor_subtotal).toBe(95000)
    expect(result.materials_subtotal).toBe(25000)
    expect(result.equipment_subtotal).toBe(10000)
    expect(result.subcontractors_subtotal).toBe(30000)
  })

  it('calculates markup amounts correctly', () => {
    const result = calculateCORTotals(baseCOR)
    expect(result.labor_markup_amount).toBe(14250)       // 95000 * 15%
    expect(result.materials_markup_amount).toBe(3750)     // 25000 * 15%
    expect(result.equipment_markup_amount).toBe(1500)     // 10000 * 15%
    expect(result.subcontractors_markup_amount).toBe(1500) // 30000 * 5%
  })

  it('calculates COR subtotal (costs + markups)', () => {
    const result = calculateCORTotals(baseCOR)
    // 95000 + 25000 + 10000 + 30000 + 14250 + 3750 + 1500 + 1500 = 181000
    expect(result.cor_subtotal).toBe(181000)
  })

  it('calculates additional fees on COR subtotal', () => {
    const result = calculateCORTotals(baseCOR)
    // liability: 181000 * 144/10000 = 2606.4 -> 2606
    expect(result.liability_insurance_amount).toBe(2606)
    // bond: 181000 * 100/10000 = 1810
    expect(result.bond_amount).toBe(1810)
    // license: 181000 * 10/10000 = 181
    expect(result.license_fee_amount).toBe(181)
    expect(result.additional_fees_total).toBe(2606 + 1810 + 181)
  })

  it('calculates final COR total', () => {
    const result = calculateCORTotals(baseCOR)
    expect(result.cor_total).toBe(result.cor_subtotal + result.additional_fees_total)
  })

  it('uses default percentages when not specified', () => {
    const cor = {
      change_order_labor: [{ total: 10000 }],
      // No markup percentages specified - defaults apply via ??
    }
    const result = calculateCORTotals(cor)
    expect(result.labor_markup_amount).toBe(1500) // 10000 * 15%
  })

  it('allows 0% markup when explicitly set', () => {
    const cor = {
      change_order_labor: [{ total: 10000 }],
      labor_markup_percent: 0,
      materials_markup_percent: 0,
      equipment_markup_percent: 0,
      subcontractors_markup_percent: 0,
      liability_insurance_percent: 0,
      bond_percent: 0,
      license_fee_percent: 0
    }
    const result = calculateCORTotals(cor)
    expect(result.labor_markup_amount).toBe(0)
    expect(result.additional_fees_total).toBe(0)
    expect(result.cor_total).toBe(10000)
  })

  it('handles empty line item arrays', () => {
    const cor = {
      change_order_labor: [],
      change_order_materials: [],
      change_order_equipment: [],
      change_order_subcontractors: []
    }
    const result = calculateCORTotals(cor)
    expect(result.cor_total).toBe(0)
  })

  it('handles missing line item arrays', () => {
    const cor = {}
    const result = calculateCORTotals(cor)
    expect(result.cor_total).toBe(0)
  })
})

// ============================================
// COR Validation
// ============================================

describe('validateCOR', () => {
  it('returns valid for complete COR', () => {
    const cor = {
      title: 'Test COR',
      scope_of_work: 'Do the work'
    }
    const result = validateCOR(cor)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('requires title', () => {
    const result = validateCOR({ scope_of_work: 'Work' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Title is required')
  })

  it('requires non-empty title', () => {
    const result = validateCOR({ title: '  ', scope_of_work: 'Work' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Title is required')
  })

  it('requires description (scope_of_work)', () => {
    const result = validateCOR({ title: 'Test' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Description is required')
  })

  it('validates end date after start date', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      period_start: '2025-06-15',
      period_end: '2025-06-01'
    }
    const result = validateCOR(cor)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('End date must be after start date')
  })

  it('allows valid date range', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      period_start: '2025-06-01',
      period_end: '2025-06-15'
    }
    const result = validateCOR(cor)
    expect(result.valid).toBe(true)
  })

  it('skips date validation when only one date provided', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      period_start: '2025-06-01'
    }
    const result = validateCOR(cor)
    expect(result.valid).toBe(true)
  })

  it('flags high labor markup', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      labor_markup_percent: 6000 // 60%
    }
    const result = validateCOR(cor)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Labor markup percentage seems too high (>50%)')
  })

  it('flags high materials markup', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      materials_markup_percent: 5001
    }
    const result = validateCOR(cor)
    expect(result.valid).toBe(false)
  })

  it('flags high equipment markup', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      equipment_markup_percent: 7000
    }
    const result = validateCOR(cor)
    expect(result.errors.some(e => e.includes('Equipment markup'))).toBe(true)
  })

  it('flags high subcontractors markup', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      subcontractors_markup_percent: 10000
    }
    const result = validateCOR(cor)
    expect(result.errors.some(e => e.includes('Subcontractors markup'))).toBe(true)
  })

  it('allows markup at exactly 50%', () => {
    const cor = {
      title: 'Test',
      scope_of_work: 'Work',
      labor_markup_percent: 5000
    }
    const result = validateCOR(cor)
    expect(result.valid).toBe(true)
  })

  it('collects multiple errors', () => {
    const cor = {}
    const result = validateCOR(cor)
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})

// ============================================
// Status Info
// ============================================

describe('getStatusInfo', () => {
  it('returns correct info for each known status', () => {
    const statuses = ['draft', 'pending_approval', 'approved', 'rejected', 'billed', 'closed']
    statuses.forEach(status => {
      const info = getStatusInfo(status)
      expect(info.label).toBeTruthy()
      expect(info.color).toBeTruthy()
      expect(info.bgColor).toBeTruthy()
    })
  })

  it('returns draft info for approved status', () => {
    expect(getStatusInfo('approved').label).toBe('Approved')
    expect(getStatusInfo('approved').color).toBe('#059669')
  })

  it('returns draft as default for unknown status', () => {
    const info = getStatusInfo('unknown')
    expect(info.label).toBe('Draft')
  })

  it('handles null/undefined', () => {
    expect(getStatusInfo(null).label).toBe('Draft')
    expect(getStatusInfo(undefined).label).toBe('Draft')
  })
})

// ============================================
// Date Formatting
// ============================================

describe('formatDate', () => {
  it('formats date string', () => {
    const result = formatDate('2025-06-15')
    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })

  it('returns empty string for null/undefined', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
  })
})

describe('formatDateRange', () => {
  it('formats both dates', () => {
    const result = formatDateRange('2025-06-01', '2025-06-15')
    expect(result).toMatch(/Jun/)
    expect(result).toContain(' - ')
  })

  it('returns only start if no end', () => {
    const result = formatDateRange('2025-06-01', null)
    expect(result).toMatch(/Jun/)
    expect(result).not.toContain(' - ')
  })

  it('returns only end if no start', () => {
    const result = formatDateRange(null, '2025-06-15')
    expect(result).toMatch(/Jun/)
  })

  it('returns empty string if neither provided', () => {
    expect(formatDateRange(null, null)).toBe('')
  })
})

// ============================================
// Constants / Exports
// ============================================

describe('DEFAULT_PERCENTAGES', () => {
  it('has all expected keys', () => {
    expect(DEFAULT_PERCENTAGES.labor_markup).toBe(1500)
    expect(DEFAULT_PERCENTAGES.materials_markup).toBe(1500)
    expect(DEFAULT_PERCENTAGES.equipment_markup).toBe(1500)
    expect(DEFAULT_PERCENTAGES.subcontractors_markup).toBe(500)
    expect(DEFAULT_PERCENTAGES.liability_insurance).toBe(144)
    expect(DEFAULT_PERCENTAGES.bond).toBe(100)
    expect(DEFAULT_PERCENTAGES.license_fee).toBe(10)
  })
})

describe('LABOR_CLASSES', () => {
  it('contains expected labor classes', () => {
    expect(LABOR_CLASSES).toContain('Foreman')
    expect(LABOR_CLASSES).toContain('Laborer')
    expect(LABOR_CLASSES.length).toBe(4)
  })
})

describe('WAGE_TYPES', () => {
  it('contains standard, pla, prevailing', () => {
    const values = WAGE_TYPES.map(w => w.value)
    expect(values).toContain('standard')
    expect(values).toContain('pla')
    expect(values).toContain('prevailing')
  })
})

describe('SOURCE_TYPES', () => {
  it('has materials, equipment, subcontractors categories', () => {
    expect(SOURCE_TYPES.materials).toBeDefined()
    expect(SOURCE_TYPES.equipment).toBeDefined()
    expect(SOURCE_TYPES.subcontractors).toBeDefined()
  })
})

describe('COMMON_UNITS', () => {
  it('includes common construction units', () => {
    expect(COMMON_UNITS).toContain('each')
    expect(COMMON_UNITS).toContain('lump sum')
    expect(COMMON_UNITS).toContain('cy')
  })
})
