/**
 * Regression tests for the 2026-09-20 daily health check.
 * Each block anchors on the concrete bug it prevents from silently returning.
 */
import { describe, it, expect } from 'vitest'
import { buildFinancialTimeSeries } from '../lib/chartDataTransforms'
import { getLocalDateString } from '../lib/utils'

describe('Daily health check 2026-09-20', () => {
  describe('buildFinancialTimeSeries labor rates', () => {
    // Regression: chartDataTransforms.js used to fall back to $65/hr when a
    // worker had no rate, silently inventing revenue and hiding real data
    // problems on the dashboard. Missing rates must contribute $0.
    it('does not invent revenue when a worker has no configured rate', () => {
      const tmTickets = [{
        work_date: '2026-09-19',
        t_and_m_workers: [
          { hours: 8, overtime_hours: 0 } // no rate at all
        ],
        t_and_m_items: []
      }]
      const series = buildFinancialTimeSeries({}, {}, tmTickets, null, [])
      // tmValue is cumulative; the last row carries the running total.
      const finalTM = series[series.length - 1].tmValue
      expect(finalTM).toBe(0)
    })

    it('still values workers who do have a rate', () => {
      const tmTickets = [{
        work_date: '2026-09-19',
        t_and_m_workers: [
          { hours: 8, overtime_hours: 2, regular_rate: 50, overtime_rate: 75 }
        ],
        t_and_m_items: []
      }]
      const series = buildFinancialTimeSeries({}, {}, tmTickets, null, [])
      const finalTM = series[series.length - 1].tmValue
      // 8 * 50 + 2 * 75 = 550
      expect(finalTM).toBe(550)
    })
  })

  describe('getLocalDateString', () => {
    // Anchor: field ops used to default to `new Date().toISOString().split('T')[0]`
    // which returns the UTC date. This test locks in the local-timezone helper
    // that field ops now use in its place.
    it('returns YYYY-MM-DD in local time, not UTC', () => {
      const local = new Date(2026, 8, 20, 22, 30) // Sept 20, 22:30 local
      expect(getLocalDateString(local)).toBe('2026-09-20')
    })
  })
})
