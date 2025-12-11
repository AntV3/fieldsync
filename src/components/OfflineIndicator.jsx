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
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: isOnline ? '#f0f9ff' : '#fef2f2',
        borderTop: `2px solid ${isOnline ? '#3b82f6' : '#ef4444'}`,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '14px',
        zIndex: 1000,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Network Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isOnline ? '#22c55e' : '#ef4444',
              display: 'inline-block',
            }}
          />
          <span style={{ fontWeight: '600', color: '#1f2937' }}>
            {isOnline ? 'Online' : 'Offline Mode'}
          </span>
        </div>

        {/* Pending Count */}
        {pendingCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#6b7280' }}>
              {pendingCount} {pendingCount === 1 ? 'item' : 'items'} pending sync
            </span>
          </div>
        )}

        {/* Syncing Status */}
        {isSyncing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #3b82f6',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ color: '#3b82f6', fontWeight: '500' }}>Syncing...</span>
          </div>
        )}

        {/* Last Sync Time */}
        {lastSyncTime && !isSyncing && (
          <span style={{ color: '#6b7280', fontSize: '12px' }}>
            Last synced {formatLastSyncTime()}
          </span>
        )}

        {/* Sync Error */}
        {syncError && (
          <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: '500' }}>
            {syncError}
          </span>
        )}
      </div>

      {/* Sync Button */}
      {isOnline && pendingCount > 0 && !isSyncing && (
        <button
          onClick={handleSync}
          style={{
            padding: '6px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseOver={(e) => (e.target.style.background = '#2563eb')}
          onMouseOut={(e) => (e.target.style.background = '#3b82f6')}
        >
          Sync Now
        </button>
      )}

      {/* Inline Styles for Animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
