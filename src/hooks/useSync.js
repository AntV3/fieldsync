/**
 * Custom React Hook for Sync Management
 * Provides sync state and operations to components
 */

import { useState, useEffect, useCallback } from 'react'
import { useNetworkStatus } from '../lib/networkStatus'
import {
  getSyncQueueCount,
  getSyncQueueStats,
  syncAllPending,
  clearSyncedOperations,
} from '../lib/syncQueue'
import { db } from '../lib/supabase'

export function useSync() {
  const isOnline = useNetworkStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStats, setSyncStats] = useState(null)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [lastError, setLastError] = useState(null)

  // Update stats periodically
  const updateStats = useCallback(async () => {
    try {
      const count = await getSyncQueueCount()
      setPendingCount(count)

      const stats = await getSyncQueueStats()
      setSyncStats(stats)
    } catch (error) {
      console.error('Failed to update sync stats:', error)
    }
  }, [])

  useEffect(() => {
    updateStats()
    const interval = setInterval(updateStats, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [updateStats])

  // Trigger manual sync
  const sync = useCallback(async () => {
    if (!isOnline) {
      throw new Error('Cannot sync while offline')
    }

    if (isSyncing) {
      console.warn('Sync already in progress')
      return null
    }

    setIsSyncing(true)
    setLastError(null)

    try {
      const results = await syncAllPending(db)

      // Update stats
      await updateStats()

      setLastSyncTime(new Date())

      // Clean up synced operations
      await clearSyncedOperations()

      return results
    } catch (error) {
      console.error('Sync failed:', error)
      setLastError(error.message)
      throw error
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, updateStats])

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      console.log('Auto-syncing on network restoration...')
      sync().catch(error => {
        console.error('Auto-sync failed:', error)
      })
    }
  }, [isOnline])

  return {
    isOnline,
    isSyncing,
    pendingCount,
    syncStats,
    lastSyncTime,
    lastError,
    sync,
    updateStats,
  }
}

export default useSync
