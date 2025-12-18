import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  calculateProgress,
  getOverallStatus,
  getOverallStatusLabel,
  formatStatus
} from './utils'

describe('formatCurrency', () => {
  it('formats dollar amounts without decimals', () => {
    expect(formatCurrency(1000)).toBe('$1,000')
    expect(formatCurrency(50000)).toBe('$50,000')
    expect(formatCurrency(0)).toBe('$0')
  })

  it('rounds to nearest dollar', () => {
    expect(formatCurrency(1234.56)).toBe('$1,235')
    expect(formatCurrency(999.99)).toBe('$1,000')
  })

  it('handles negative amounts', () => {
    expect(formatCurrency(-500)).toBe('-$500')
  })
})

describe('calculateProgress', () => {
  it('returns 0 for empty areas', () => {
    expect(calculateProgress([])).toBe(0)
    expect(calculateProgress(null)).toBe(0)
  })

  it('calculates progress based on completed area weights', () => {
    const areas = [
      { weight: 30, status: 'done' },
      { weight: 40, status: 'working' },
      { weight: 30, status: 'not_started' }
    ]
    expect(calculateProgress(areas)).toBe(30)
  })

  it('returns 100 when all areas are done', () => {
    const areas = [
      { weight: 50, status: 'done' },
      { weight: 50, status: 'done' }
    ]
    expect(calculateProgress(areas)).toBe(100)
  })

  it('rounds the result', () => {
    const areas = [
      { weight: 33, status: 'done' },
      { weight: 33, status: 'done' },
      { weight: 34, status: 'not_started' }
    ]
    expect(calculateProgress(areas)).toBe(66)
  })
})

describe('getOverallStatus', () => {
  it('returns not_started for empty areas', () => {
    expect(getOverallStatus([])).toBe('not_started')
    expect(getOverallStatus(null)).toBe('not_started')
  })

  it('returns done when all areas are done', () => {
    const areas = [
      { status: 'done' },
      { status: 'done' }
    ]
    expect(getOverallStatus(areas)).toBe('done')
  })

  it('returns working when any area is working or done but not all done', () => {
    const areas1 = [
      { status: 'working' },
      { status: 'not_started' }
    ]
    expect(getOverallStatus(areas1)).toBe('working')

    const areas2 = [
      { status: 'done' },
      { status: 'not_started' }
    ]
    expect(getOverallStatus(areas2)).toBe('working')
  })

  it('returns not_started when no areas have started', () => {
    const areas = [
      { status: 'not_started' },
      { status: 'not_started' }
    ]
    expect(getOverallStatus(areas)).toBe('not_started')
  })
})

describe('getOverallStatusLabel', () => {
  it('returns human-readable status labels', () => {
    expect(getOverallStatusLabel([{ status: 'done' }])).toBe('Complete')
    expect(getOverallStatusLabel([{ status: 'working' }])).toBe('In Progress')
    expect(getOverallStatusLabel([{ status: 'not_started' }])).toBe('Not Started')
  })
})

describe('formatStatus', () => {
  it('formats status strings to human-readable labels', () => {
    expect(formatStatus('not_started')).toBe('Not Started')
    expect(formatStatus('working')).toBe('Working')
    expect(formatStatus('done')).toBe('Done')
  })

  it('returns the status as-is if not recognized', () => {
    expect(formatStatus('unknown')).toBe('unknown')
  })
})
