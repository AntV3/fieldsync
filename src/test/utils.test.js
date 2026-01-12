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
  formatStatus
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
