/**
 * Offline Indicator Component
 * Shows network status and sync queue status with manual sync button
 */

import { useState, useEffect } from 'react'
import { useNetworkStatus } from '../lib/networkStatus'
import { getSyncQueueCount, syncAllPending } from '../lib/syncQueue'
import { db } from '../lib/supabase'

export default function OfflineIndicator() {
  const isOnline = useNetworkStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [syncError, setSyncError] = useState(null)

  // Check pending count every 5 seconds
  useEffect(() => {
    const updatePendingCount = async () => {
      try {
        const count = await getSyncQueueCount()
        setPendingCount(count)
      } catch (error) {
        console.error('Failed to get sync queue count:', error)
      }
    }

    updatePendingCount()
    const interval = setInterval(updatePendingCount, 5000)

    return () => clearInterval(interval)
  }, [])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      console.log('Network restored - triggering auto-sync')
      handleSync()
    }
  }, [isOnline])

  const handleSync = async () => {
    if (!isOnline) {
      setSyncError('Cannot sync while offline')
      setTimeout(() => setSyncError(null), 3000)
      return
    }

    if (isSyncing) {
      return // Already syncing
    }

    setIsSyncing(true)
    setSyncError(null)

    try {
      console.log('🔄 Starting sync...')

      const results = await syncAllPending(db, (progress) => {
        console.log(`Syncing ${progress.current}/${progress.total}...`)
      })

      console.log('✅ Sync complete:', results)

      // Update pending count
      const count = await getSyncQueueCount()
      setPendingCount(count)

      setLastSyncTime(new Date())

      if (results.failed > 0) {
        setSyncError(`${results.failed} items failed to sync`)
        setTimeout(() => setSyncError(null), 5000)
      }
    } catch (error) {
      console.error('Sync error:', error)
      setSyncError('Sync failed. Will retry automatically.')
      setTimeout(() => setSyncError(null), 5000)
    } finally {
      setIsSyncing(false)
    }
  }

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return null

    const now = new Date()
    const diffMs = now - lastSyncTime
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins === 0) return 'just now'
    if (diffMins === 1) return '1 minute ago'
    if (diffMins < 60) return `${diffMins} minutes ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours === 1) return '1 hour ago'
    return `${diffHours} hours ago`
  }

  return (
    <div
      className="offline-indicator-enhanced"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Network Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            className={isOnline ? '' : 'offline-pulse'}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isOnline ? '#22c55e' : '#ef4444',
              display: 'inline-block',
            }}
            aria-hidden="true"
          />
          <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
            {isOnline ? 'Online' : 'Offline Mode'}
          </span>
        </div>

        {/* Pending Count */}
        {pendingCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {pendingCount} {pendingCount === 1 ? 'item' : 'items'} pending sync
            </span>
          </div>
        )}

        {/* Syncing Status */}
        {isSyncing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} aria-busy="true">
            <div className="syncing-spinner" aria-hidden="true" />
            <span style={{ color: 'var(--accent-blue)', fontWeight: '500' }}>
              Syncing...
            </span>
          </div>
        )}

        {/* Last Sync Time */}
        {lastSyncTime && !isSyncing && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            Last synced {formatLastSyncTime()}
          </span>
        )}

        {/* Sync Error */}
        {syncError && (
          <span
            role="alert"
            style={{ color: 'var(--accent-red)', fontSize: '12px', fontWeight: '500' }}
          >
            {syncError}
          </span>
        )}
      </div>

      {/* Sync Button */}
      {isOnline && pendingCount > 0 && !isSyncing && (
        <button
          onClick={handleSync}
          className="btn btn-primary btn-small"
          aria-label={`Sync ${pendingCount} pending ${pendingCount === 1 ? 'item' : 'items'}`}
        >
          Sync Now
        </button>
      )}
    </div>
  )
}
