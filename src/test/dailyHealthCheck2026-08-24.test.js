/**
 * Daily health-check regression tests (2026-08-24).
 *
 * Guards two silent-wrong-answer defects caught during today's review:
 *
 *  A. useFilteredPagination invoked pagination.setTotalItems inside a
 *     useMemo, so React scheduled the state update during render. The
 *     current render returned pagination.totalPages built from the stale
 *     count — a filter that dropped 100 items to 5 briefly rendered
 *     "Page 1 of 10" before settling on "Page 1 of 1".
 *
 *  B. equipmentOps.calculateProjectEquipmentCost / calculateDaysOnSite
 *     used Math.floor((end - start) / MS_PER_DAY) + 1 on local-midnight
 *     Date values. A rental range that crossed a DST spring-forward lost
 *     one hour of ms, floored 12.958 → 12, and under-billed one full
 *     day of daily_rate.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { equipmentOps } from '../lib/equipmentOps.js'
import { useFilteredPagination } from '../hooks/useFilteredPagination.js'

// --------------------------------------------------------------------------
// A. useFilteredPagination — totalPages reflects the filtered length on
//    the same render that returns the new filteredItems
// --------------------------------------------------------------------------

describe('useFilteredPagination totalPages tracks the filtered length', () => {
  it('collapses to the filtered totalPages after a searchTerm change', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: i === 42 ? 'unique-target' : `item-${i}`
    }))

    const { result } = renderHook(() =>
      useFilteredPagination(items, { pageSize: 10, searchFields: ['name'] })
    )

    // Baseline: 100 items across 10 pages of 10.
    expect(result.current.totalPages).toBe(10)
    expect(result.current.paginatedItems).toHaveLength(10)

    // Filter narrows to a single match.
    act(() => result.current.setSearchTerm('unique-target'))

    // Once state settles, both the filtered length AND the derived
    // totalPages must reflect the new, single match. Before the fix,
    // totalPages stayed at 10 for one render tick after the filter.
    expect(result.current.totalItems).toBe(1)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.paginatedItems).toEqual([items[42]])
  })
})

// --------------------------------------------------------------------------
// B. Equipment day-count survives a DST spring-forward
// --------------------------------------------------------------------------

describe('equipmentOps day-count is DST-safe', () => {
  it('calculateDaysOnSite returns the inclusive calendar-day count across a spring-forward', () => {
    // 2026-03-01 → 2026-03-14 = 14 calendar days inclusive.
    // In US Pacific, DST advances on 2026-03-08, so end - start is one
    // hour short of 13 * MS_PER_DAY. Math.floor would return 13; Math.round
    // returns 14.
    const days = equipmentOps.calculateDaysOnSite('2026-03-01', '2026-03-14')
    expect(days).toBe(14)
  })

  it('calculateDaysOnSite returns 1 for a same-day rental', () => {
    expect(equipmentOps.calculateDaysOnSite('2026-06-10', '2026-06-10')).toBe(1)
  })

  it('calculateDaysOnSite returns the expected inclusive count for a range with no DST boundary', () => {
    // 2026-06-01 → 2026-06-10 = 10 inclusive days, no DST transition inside.
    expect(equipmentOps.calculateDaysOnSite('2026-06-01', '2026-06-10')).toBe(10)
  })

  it('calculateProjectEquipmentCost bills the full DST-crossing span', () => {
    // Same span as above, at $100/day: 14 days × $100 = $1,400.
    // Pre-fix would return $1,300.
    const total = equipmentOps.calculateProjectEquipmentCost([
      { start_date: '2026-03-01', end_date: '2026-03-14', daily_rate: 100 }
    ])
    expect(total).toBe(1400)
  })

  it('calculateProjectEquipmentCost is unaffected by ranges outside DST transitions', () => {
    const total = equipmentOps.calculateProjectEquipmentCost([
      { start_date: '2026-06-01', end_date: '2026-06-10', daily_rate: 250 }
    ])
    expect(total).toBe(10 * 250)
  })
})
