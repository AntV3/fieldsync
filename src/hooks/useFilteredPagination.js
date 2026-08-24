import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePagination } from './usePagination'

/**
 * useFilteredPagination - Combines search/filter with pagination
 *
 * @param {Array} items - Full array of items to filter and paginate
 * @param {Object} options
 * @param {number} options.pageSize - Items per page (default: 25)
 * @param {string[]} options.searchFields - Object keys to search across
 * @returns {Object} Filtered pagination state and controls
 */
export function useFilteredPagination(items = [], options = {}) {
  const { pageSize: initialPageSize = 25, searchFields = [] } = options

  const [searchTerm, setSearchTermRaw] = useState('')

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim() || searchFields.length === 0) return items
    const lower = searchTerm.toLowerCase()
    return items.filter((item) =>
      searchFields.some((field) => {
        const value = item?.[field]
        if (value == null) return false
        return String(value).toLowerCase().includes(lower)
      })
    )
  }, [items, searchTerm, searchFields])

  const pagination = usePagination({
    itemsPerPage: initialPageSize,
    totalItems: filteredItems.length
  })

  // Keep totalItems in sync with filtered results. Must be an effect, not
  // a memo — pagination.setTotalItems calls setState on usePagination, and
  // running it during render leaves pagination.totalPages one render behind
  // the filtered length (a filter that drops results from 100 → 5 briefly
  // rendered "Page 1 of 10" before settling on "Page 1 of 1").
  useEffect(() => {
    pagination.setTotalItems(filteredItems.length)
  }, [filteredItems.length, pagination.setTotalItems])

  const paginatedItems = useMemo(() => {
    return pagination.paginate(filteredItems)
  }, [filteredItems, pagination.paginate])

  const setSearchTerm = useCallback((term) => {
    setSearchTermRaw(term)
    pagination.goToPage(1)
  }, [pagination.goToPage])

  const setPageSize = useCallback((size) => {
    pagination.setItemsPerPage(size)
  }, [pagination.setItemsPerPage])

  return {
    paginatedItems,
    searchTerm,
    setSearchTerm,
    currentPage: pagination.page,
    totalPages: pagination.totalPages,
    goToPage: pagination.goToPage,
    nextPage: pagination.nextPage,
    prevPage: pagination.prevPage,
    pageSize: pagination.itemsPerPage,
    setPageSize,
    totalItems: filteredItems.length
  }
}

export default useFilteredPagination
