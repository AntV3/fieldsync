/**
 * Tests for utility functions
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  calculateProgress,
  calculateValueProgress,
  getOverallStatus,
  formatStatus,
  areaScheduledValueDollars
} from '../lib/utils'

// ============================================
// formatCurrency tests
// ============================================
describe('formatCurrency', () => {
  it('formats positive amounts correctly', () => {
    expect(formatCurrency(1000)).toBe('$1,000')
    expect(formatCurrency(1234567)).toBe('$1,234,567')
  })

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0')
  })

  it('formats negative amounts correctly', () => {
    expect(formatCurrency(-500)).toBe('-$500')
  })
})

// ============================================
// calculateProgress tests
// ============================================
describe('calculateProgress', () => {
  it('returns 0 for empty areas', () => {
    expect(calculateProgress([])).toBe(0)
    expect(calculateProgress(null)).toBe(0)
    expect(calculateProgress(undefined)).toBe(0)
  })

  it('calculates progress from done areas', () => {
    const areas = [
      { name: 'Area 1', status: 'done', weight: 25 },
      { name: 'Area 2', status: 'working', weight: 25 },
      { name: 'Area 3', status: 'not_started', weight: 50 }
    ]
    expect(calculateProgress(areas)).toBe(25)
  })

  it('returns 100 when all areas are done', () => {
    const areas = [
      { name: 'Area 1', status: 'done', weight: 50 },
      { name: 'Area 2', status: 'done', weight: 50 }
    ]
    expect(calculateProgress(areas)).toBe(100)
  })
})

// ============================================
// calculateValueProgress tests
// ============================================
describe('calculateValueProgress', () => {
  it('returns zeros for empty areas', () => {
    const result = calculateValueProgress([])
    expect(result.progress).toBe(0)
    expect(result.isValueBased).toBe(false)
  })

  it('uses value-based calculation when scheduled values exist', () => {
    const areas = [
      { name: 'Area 1', status: 'done', scheduled_value: 10000 },
      { name: 'Area 2', status: 'working', scheduled_value: 10000 }
    ]
    const result = calculateValueProgress(areas)
    expect(result.progress).toBe(50)
    expect(result.earnedValue).toBe(10000)
    expect(result.totalValue).toBe(20000)
    expect(result.isValueBased).toBe(true)
  })

  it('falls back to weight-based when no scheduled values', () => {
    const areas = [
      { name: 'Area 1', status: 'done', weight: 30 },
      { name: 'Area 2', status: 'working', weight: 70 }
    ]
    const result = calculateValueProgress(areas)
    expect(result.progress).toBe(30)
    expect(result.isValueBased).toBe(false)
  })
})

// ============================================
// getOverallStatus tests
// ============================================
describe('getOverallStatus', () => {
  it('returns not_started for empty areas', () => {
    expect(getOverallStatus([])).toBe('not_started')
  })

  it('returns done when all areas are done', () => {
    const areas = [
      { status: 'done' },
      { status: 'done' }
    ]
    expect(getOverallStatus(areas)).toBe('done')
  })

  it('returns working when any area is in progress', () => {
    const areas = [
      { status: 'done' },
      { status: 'working' },
      { status: 'not_started' }
    ]
    expect(getOverallStatus(areas)).toBe('working')
  })
})

// ============================================
// formatStatus tests
// ============================================
describe('formatStatus', () => {
  it('formats status labels correctly', () => {
    expect(formatStatus('not_started')).toBe('Not Started')
    expect(formatStatus('working')).toBe('Working')
    expect(formatStatus('done')).toBe('Done')
  })

  it('returns unknown status as-is', () => {
    expect(formatStatus('unknown')).toBe('unknown')
  })
})

// ============================================
// areaScheduledValueDollars tests
// ============================================
describe('areaScheduledValueDollars', () => {
  it('uses explicit scheduled_value when set', () => {
    expect(areaScheduledValueDollars({ scheduled_value: 125000, weight: 25 }, 500000)).toBe(125000)
  })

  it('falls back to weight percent of contract value when scheduled_value is unset', () => {
    expect(areaScheduledValueDollars({ weight: 25 }, 500000)).toBe(125000)
    expect(areaScheduledValueDollars({ weight: 10 }, 200000)).toBe(20000)
  })

  it('never treats weight as a dollar amount when contract value is missing', () => {
    // Regression: exports previously returned `area.weight` (a percent) as dollars,
    // producing "Scheduled Value $25.00" on AIA G702/G703 pay applications when a
    // $500K project had four areas weighted 25/25/25/25.
    expect(areaScheduledValueDollars({ weight: 25 }, 0)).toBe(0)
    expect(areaScheduledValueDollars({ weight: 25 })).toBe(0)
  })

  it('ignores the nonexistent sov_value field', () => {
    // Regression: aiaBillingExport/sageExport/SageExportPanel read `area.sov_value`,
    // which is never written by the schema. The fallback then landed on weight.
    expect(areaScheduledValueDollars({ sov_value: 999, weight: 25 }, 500000)).toBe(125000)
  })

  it('returns 0 for missing or empty input', () => {
    expect(areaScheduledValueDollars(null, 500000)).toBe(0)
    expect(areaScheduledValueDollars({}, 500000)).toBe(0)
    expect(areaScheduledValueDollars({ scheduled_value: 0, weight: 0 }, 500000)).toBe(0)
  })

  it('rejects non-positive scheduled_value and falls through', () => {
    expect(areaScheduledValueDollars({ scheduled_value: -100, weight: 25 }, 500000)).toBe(125000)
    expect(areaScheduledValueDollars({ scheduled_value: '', weight: 25 }, 500000)).toBe(125000)
  })
})
