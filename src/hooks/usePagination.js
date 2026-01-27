import { useState, useCallback, useMemo } from 'react'

/**
 * usePagination - Manages pagination state for lists
 * Replaces the common pattern of page/hasMore/totalCount state
 *
 * @param {Object} options
 * @param {number} options.itemsPerPage - Items per page (default: 50)
 * @param {number} options.initialPage - Starting page (default: 1)
 * @param {number} options.totalItems - Total number of items (if known)
 * @returns {Object} Pagination state and controls
 */
export function usePagination(options = {}) {
  const {
    itemsPerPage = 50,
    initialPage = 1,
    totalItems = 0
  } = options

  const [state, setState] = useState({
    page: initialPage,
    totalItems,
    itemsPerPage
  })

  const totalPages = useMemo(() => {
    return Math.ceil(state.totalItems / state.itemsPerPage) || 1
  }, [state.totalItems, state.itemsPerPage])

  const hasNextPage = useMemo(() => {
    return state.page < totalPages
  }, [state.page, totalPages])

  const hasPrevPage = useMemo(() => {
    return state.page > 1
  }, [state.page])

  const offset = useMemo(() => {
    return (state.page - 1) * state.itemsPerPage
  }, [state.page, state.itemsPerPage])

  const range = useMemo(() => {
    const start = offset
    const end = offset + state.itemsPerPage - 1
    return { start, end }
  }, [offset, state.itemsPerPage])

  const goToPage = useCallback((page) => {
    setState(prev => ({
      ...prev,
      page: Math.max(1, Math.min(page, totalPages || page))
    }))
  }, [totalPages])

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setState(prev => ({ ...prev, page: prev.page + 1 }))
    }
  }, [hasNextPage])

  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      setState(prev => ({ ...prev, page: prev.page - 1 }))
    }
  }, [hasPrevPage])

  const firstPage = useCallback(() => {
    setState(prev => ({ ...prev, page: 1 }))
  }, [])

  const lastPage = useCallback(() => {
    setState(prev => ({ ...prev, page: totalPages }))
  }, [totalPages])

  const setTotalItems = useCallback((total) => {
    setState(prev => ({ ...prev, totalItems: total }))
  }, [])

  const setItemsPerPage = useCallback((perPage) => {
    setState(prev => ({
      ...prev,
      itemsPerPage: perPage,
      page: 1 // Reset to first page when changing page size
    }))
  }, [])

  const reset = useCallback(() => {
    setState({
      page: initialPage,
      totalItems: 0,
      itemsPerPage
    })
  }, [initialPage, itemsPerPage])

  /**
   * Paginate an array of items client-side
   * @param {Array} items - Full array of items
   * @returns {Array} Paginated slice of items
   */
  const paginate = useCallback((items) => {
    if (!Array.isArray(items)) return []
    return items.slice(offset, offset + state.itemsPerPage)
  }, [offset, state.itemsPerPage])

  /**
   * Get Supabase range for server-side pagination
   * @returns {Object} { from, to } for .range() query
   */
  const getSupabaseRange = useCallback(() => {
    return {
      from: offset,
      to: offset + state.itemsPerPage - 1
    }
  }, [offset, state.itemsPerPage])

  return {
    // State
    page: state.page,
    totalItems: state.totalItems,
    itemsPerPage: state.itemsPerPage,
    totalPages,
    offset,
    range,

    // Computed
    hasNextPage,
    hasPrevPage,
    isFirstPage: state.page === 1,
    isLastPage: state.page === totalPages,

    // Actions
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    setTotalItems,
    setItemsPerPage,
    reset,

    // Utilities
    paginate,
    getSupabaseRange
  }
}

export default usePagination
