import { useState, useEffect } from 'react'
import { getConnectionStatus, onConnectionChange, getPendingActionCount } from '../lib/supabase'

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(getConnectionStatus())
  const [pendingCount, setPendingCount] = useState(0)
  const [showSynced, setShowSynced] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    // Subscribe to connection changes
    const unsubscribe = onConnectionChange(async (online) => {
      setIsOnline(online)

      if (online && wasOffline) {
        // Show "synced" message briefly when coming back online
        setShowSynced(true)
        setTimeout(() => setShowSynced(false), 3000)
      }

      if (!online) {
        setWasOffline(true)
      }

      // Update pending count
      const count = await getPendingActionCount()
      setPendingCount(count)
    })

    // Initial pending count check
    getPendingActionCount().then(setPendingCount)

    // Periodically check pending count when offline
    const interval = setInterval(async () => {
      if (!getConnectionStatus()) {
        const count = await getPendingActionCount()
        setPendingCount(count)
      }
    }, 5000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [wasOffline])

  // Don't show anything if online and no pending actions
  if (isOnline && pendingCount === 0 && !showSynced) {
    return null
  }

  return (
    <div className={`offline-indicator ${isOnline ? 'online' : 'offline'} ${showSynced ? 'synced' : ''}`}>
      <div className="offline-indicator-content">
        {!isOnline ? (
          <>
            <span className="offline-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                <line x1="12" y1="20" x2="12.01" y2="20"></line>
              </svg>
            </span>
            <span className="offline-text">
              Offline
              {pendingCount > 0 && (
                <span className="pending-badge">{pendingCount} pending</span>
              )}
            </span>
          </>
        ) : showSynced ? (
          <>
            <span className="online-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span className="offline-text">Changes synced!</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <span className="syncing-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </span>
            <span className="offline-text">Syncing {pendingCount}...</span>
          </>
        ) : null}
      </div>

      <style>{`
        .offline-indicator {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          padding: 10px 16px;
          border-radius: 24px;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }

        .offline-indicator.offline {
          background: #1f2937;
          color: #fbbf24;
        }

        .offline-indicator.online {
          background: #065f46;
          color: #d1fae5;
        }

        .offline-indicator.synced {
          background: #065f46;
          color: #d1fae5;
        }

        .offline-indicator-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .offline-icon,
        .online-icon,
        .syncing-icon {
          display: flex;
          align-items: center;
        }

        .syncing-icon svg {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .offline-text {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pending-badge {
          background: rgba(251, 191, 36, 0.2);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }

        @media (max-width: 480px) {
          .offline-indicator {
            bottom: 70px; /* Above mobile nav */
            left: 16px;
            right: 16px;
            transform: none;
          }
        }
      `}</style>
    </div>
  )
}
