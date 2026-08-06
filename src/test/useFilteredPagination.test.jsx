import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useFilteredPagination from '../hooks/useFilteredPagination'

const buildItems = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `item ${i + 1}` }))

describe('useFilteredPagination', () => {
  it('paginates the source list using the configured page size', () => {
    const { result } = renderHook(() =>
      useFilteredPagination(buildItems(30), { pageSize: 10, searchFields: ['name'] })
    )

    expect(result.current.totalItems).toBe(30)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.currentPage).toBe(1)
    expect(result.current.paginatedItems).toHaveLength(10)
    expect(result.current.paginatedItems[0].id).toBe(1)
  })

  it('resets to page 1 when the user types a new search term', () => {
    const { result } = renderHook(() =>
      useFilteredPagination(buildItems(30), { pageSize: 10, searchFields: ['name'] })
    )

    act(() => result.current.goToPage(3))
    expect(result.current.currentPage).toBe(3)

    act(() => result.current.setSearchTerm('item 1'))
    expect(result.current.currentPage).toBe(1)
    expect(result.current.totalItems).toBeGreaterThan(0)
    expect(
      result.current.paginatedItems.every((item) => item.name.includes('item 1'))
    ).toBe(true)
  })

  it('clamps the current page back into range when the source list shrinks', () => {
    let items = buildItems(30)
    const { result, rerender } = renderHook(
      ({ list }) => useFilteredPagination(list, { pageSize: 10, searchFields: ['name'] }),
      { initialProps: { list: items } }
    )

    act(() => result.current.goToPage(3))
    expect(result.current.currentPage).toBe(3)

    // External change: caller trims the list down to 5 items — page 3 is now empty.
    items = buildItems(5)
    rerender({ list: items })

    expect(result.current.totalItems).toBe(5)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.currentPage).toBe(1)
    expect(result.current.paginatedItems).toHaveLength(5)
  })
})
