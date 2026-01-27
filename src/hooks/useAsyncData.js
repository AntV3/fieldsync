import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useAsyncData - Manages async data fetching with loading, error, and caching
 * Replaces the common pattern of useEffect + try/catch + loading state
 *
 * @param {Function} fetchFn - Async function that returns data
 * @param {Object} options
 * @param {Array} options.deps - Dependencies array (like useEffect)
 * @param {boolean} options.immediate - Whether to fetch immediately (default: true)
 * @param {any} options.initialData - Initial data value
 * @param {Function} options.onSuccess - Callback when fetch succeeds
 * @param {Function} options.onError - Callback when fetch fails
 * @param {number} options.cacheTime - Time in ms to cache data (0 = no cache)
 * @returns {Object} Data state and controls
 */
export function useAsyncData(fetchFn, options = {}) {
  const {
    deps = [],
    immediate = true,
    initialData = null,
    onSuccess,
    onError,
    cacheTime = 0
  } = options

  const [state, setState] = useState({
    data: initialData,
    loading: immediate,
    error: null,
    lastFetched: null
  })

  const mountedRef = useRef(true)
  const cacheRef = useRef({ data: null, timestamp: null })

  // Check if cache is valid
  const isCacheValid = useCallback(() => {
    if (!cacheTime || !cacheRef.current.timestamp) return false
    return Date.now() - cacheRef.current.timestamp < cacheTime
  }, [cacheTime])

  const fetch = useCallback(async (forceRefresh = false) => {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && isCacheValid()) {
      setState(prev => ({
        ...prev,
        data: cacheRef.current.data,
        loading: false,
        error: null
      }))
      return { success: true, data: cacheRef.current.data }
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const data = await fetchFn()

      if (!mountedRef.current) return { success: false, cancelled: true }

      // Update cache
      if (cacheTime) {
        cacheRef.current = { data, timestamp: Date.now() }
      }

      setState({
        data,
        loading: false,
        error: null,
        lastFetched: Date.now()
      })

      if (onSuccess) {
        onSuccess(data)
      }

      return { success: true, data }
    } catch (err) {
      if (!mountedRef.current) return { success: false, cancelled: true }

      const errorMessage = err?.message || 'Failed to fetch data'
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))

      if (onError) {
        onError(err)
      }

      return { success: false, error: err }
    }
  }, [fetchFn, onSuccess, onError, cacheTime, isCacheValid])

  const refresh = useCallback(() => fetch(true), [fetch])

  const setData = useCallback((newData) => {
    setState(prev => ({
      ...prev,
      data: typeof newData === 'function' ? newData(prev.data) : newData
    }))
  }, [])

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
      lastFetched: null
    })
    cacheRef.current = { data: null, timestamp: null }
  }, [initialData])

  // Initial fetch and refetch on deps change
  useEffect(() => {
    if (immediate) {
      fetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  return {
    ...state,
    fetch,
    refresh,
    setData,
    reset,
    isLoading: state.loading,
    hasError: !!state.error,
    hasData: state.data !== null && state.data !== undefined
  }
}

/**
 * useAsyncCallback - Like useAsyncData but for on-demand async operations
 * Use when you need to trigger a fetch manually (not on mount)
 */
export function useAsyncCallback(asyncFn, options = {}) {
  return useAsyncData(asyncFn, { ...options, immediate: false })
}

export default useAsyncData
