/**
 * Daily health-check regression (2026-10-26).
 *
 * resourceCalculations.calculateCurrentAllocation and buildAllocationHeatmap
 * both coerced crew_checkins.check_in_date (a bare YYYY-MM-DD DATE string)
 * into a Date via `new Date(c.check_in_date)`, which parses as UTC midnight.
 * For every user west of UTC that landed on the PRIOR local day, and when
 * compared against instant-in-time week boundaries (weekAgo = now - 7d),
 * silently:
 *
 *   - dropped check-ins on the exact 7-day boundary from the "current
 *     allocation" window (currentCrew always 0 for projects whose crew
 *     last showed up 7 days ago at any time west of UTC);
 *
 *   - misbucketed check-ins into the prior week on the heatmap for the
 *     entire grid any time the function ran later in the user's day.
 *
 * These tests freeze the clock at 2 PM Pacific on 2026-10-25 (10 PM UTC) and
 * confirm:
 *   1. A check-in dated 2026-10-18 is still included in the 7-day window.
 *   2. A check-in dated 2026-10-25 bucketed into the w=0 (current) column.
 *   3. A check-in dated 2026-10-18 bucketed into the w=-1 column, not w=-2.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculateCurrentAllocation,
  buildAllocationHeatmap,
} from '../lib/resourceCalculations'

const PST_OFFSET_MIN = 480 // UTC-8 (Pacific Standard Time)
const originalOffset = Date.prototype.getTimezoneOffset

function freezeClockPT(y, mo, d, h, mi) {
  // Build a UTC instant that corresponds to the given local Pacific wall clock,
  // then force Date.prototype.getTimezoneOffset to report Pacific. Together this
  // simulates the Pacific-time environment the bug surfaces in without needing
  // process.env.TZ (which is fiddly on Vitest/JSDOM).
  const utcMs = Date.UTC(y, mo, d, h + PST_OFFSET_MIN / 60, mi)
  vi.setSystemTime(new Date(utcMs))
  Date.prototype.getTimezoneOffset = function () {
    return PST_OFFSET_MIN
  }
}

const activeProject = {
  id: 'proj-1',
  name: 'Downtown Tower',
  progress: 40,
  contract_value: 1_000_000,
  start_date: '2026-01-01',
  end_date: '2027-01-01',
}

describe('resourceCalculations date-boundary bucketing (Pacific @ 2 PM)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 2 PM Pacific on 2026-10-25 → 2026-10-25 22:00 UTC
    freezeClockPT(2026, 9, 25, 14, 0)
  })

  afterEach(() => {
    Date.prototype.getTimezoneOffset = originalOffset
    vi.useRealTimers()
  })

  describe('calculateCurrentAllocation', () => {
    it('includes a check-in exactly 7 local days ago (the boundary case)', () => {
      const checkins = [
        { project_id: 'proj-1', check_in_date: '2026-10-18', workers: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
      ]
      const { projects } = calculateCurrentAllocation([activeProject], checkins)
      const row = projects.find(p => p.projectId === 'proj-1')
      expect(row).toBeDefined()
      // Pre-fix: UTC-midnight parsing dropped the Oct 18 check-in and
      // currentCrew was 0.
      expect(row.currentCrew).toBeGreaterThan(0)
      expect(row.totalWorkerDays).toBe(3)
      expect(row.daysActive).toBe(1)
    })

    it('excludes a check-in 8 local days ago', () => {
      const checkins = [
        { project_id: 'proj-1', check_in_date: '2026-10-17', workers: [{ name: 'A' }] },
      ]
      const { projects } = calculateCurrentAllocation([activeProject], checkins)
      const row = projects.find(p => p.projectId === 'proj-1')
      expect(row.currentCrew).toBe(0)
      expect(row.totalWorkerDays).toBe(0)
    })
  })

  describe('buildAllocationHeatmap', () => {
    it('buckets todays check-in into the current (w=0) week', () => {
      const checkins = [
        { project_id: 'proj-1', check_in_date: '2026-10-25', workers: [{ name: 'A' }, { name: 'B' }] },
      ]
      const weeks = buildAllocationHeatmap([{ id: 'proj-1', name: 'Downtown Tower' }], checkins)
      // The last row in the grid is the current week (w = 0).
      const currentWeek = weeks[weeks.length - 1]
      const cell = currentWeek.cells.find(c => c.projectId === 'proj-1')
      expect(cell.avgCrew).toBeGreaterThan(0)
    })

    it('buckets a 7-day-old check-in into last week (w=-1), not two weeks ago', () => {
      const checkins = [
        // Oct 18 is exactly one week ago in local Pacific time at the frozen clock.
        { project_id: 'proj-1', check_in_date: '2026-10-18', workers: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] },
      ]
      const weeks = buildAllocationHeatmap([{ id: 'proj-1', name: 'Downtown Tower' }], checkins)
      // Rows are w=-3, -2, -1, 0; last-week is the second-from-last entry.
      const lastWeek = weeks[weeks.length - 2]
      const twoWeeksAgo = weeks[weeks.length - 3]
      const lastWeekCell = lastWeek.cells.find(c => c.projectId === 'proj-1')
      const twoWeeksAgoCell = twoWeeksAgo.cells.find(c => c.projectId === 'proj-1')
      expect(lastWeekCell.avgCrew).toBeGreaterThan(0)
      // Pre-fix: the Oct 18 check-in landed in w=-2 because UTC-midnight parsing
      // moved it before the Oct 18 instant that bounded w=-1.
      expect(twoWeeksAgoCell.avgCrew).toBe(0)
    })

    it('does not leak a check-in from before the oldest bucket into any week', () => {
      const checkins = [
        { project_id: 'proj-1', check_in_date: '2026-09-30', workers: [{ name: 'A' }] },
      ]
      const weeks = buildAllocationHeatmap([{ id: 'proj-1', name: 'Downtown Tower' }], checkins)
      for (const w of weeks) {
        const cell = w.cells.find(c => c.projectId === 'proj-1')
        expect(cell.avgCrew).toBe(0)
      }
    })
  })
})
