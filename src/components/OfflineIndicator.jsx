import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getConnectionStatus,
  onConnectionChange,
  getPendingActionCount,
  getPendingSyncSummary,
  onSyncStateChange,
  isFieldMode
} from '../lib/supabase'

const EMPTY_SUMMARY = { queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 }
const SYNCED_VISIBLE_MS = 3000

const tickets = (n) => `${n} ticket${n === 1 ? '' : 's'}`

function safeFieldMode() {
  try {
    return Boolean(isFieldMode())
  } catch {
    return false
  }
}

/**
 * Bottom status pill.
 *
 * Field mode shows the state of T&M tickets saved on this phone (IndexedDB
 * pending_tm_tickets, every project on the device), in this order:
 *   offline → needs sign-in → could not sync → syncing → saved (waiting) → synced
 * Office mode (and field mode with no ticket state) keeps the legacy
 * pending_actions behaviour. Every IndexedDB read is wrapped: tests and some
 * browsers (private mode) have no IndexedDB.
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(() => {
    try { return getConnectionStatus() } catch { return true }
  })
  const [pendingCount, setPendingCount] = useState(0)
  const [showSynced, setShowSynced] = useState(false)
  const [fieldMode, setFieldMode] = useState(safeFieldMode)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [syncInProgress, setSyncInProgress] = useState(false)
  const [syncStartCount, setSyncStartCount] = useState(0)
  const [ticketsSynced, setTicketsSynced] = useState(0)

  // Use ref for wasOffline to avoid dependency cycle in useEffect
  const wasOfflineRef = useRef(false)
  const syncedTimeoutRef = useRef(null)
  const ticketsSyncedTimeoutRef = useRef(null)
  const mountedRef = useRef(true)

  const refreshCounts = useCallback(async () => {
    let legacy = 0
    try {
      legacy = (await getPendingActionCount()) || 0
    } catch (err) {
      console.warn('[OfflineIndicator] failed to read pending count', err)
    }
    const inField = safeFieldMode()
    let next = EMPTY_SUMMARY
    if (inField) {
      try {
        const result = await getPendingSyncSummary()
        if (result) next = { ...EMPTY_SUMMARY, ...result }
      } catch (err) {
        console.warn('[OfflineIndicator] failed to read pending tickets', err)
      }
    }
    if (!mountedRef.current) return
    setPendingCount(legacy)
    setFieldMode(inField)
    setSummary(next)
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // Subscribe to connection changes
    let unsubscribeConnection = null
    try {
      unsubscribeConnection = onConnectionChange((online) => {
        setIsOnline(online)

        if (online && wasOfflineRef.current) {
          // Show "synced" message briefly when coming back online
          setShowSynced(true)
          if (syncedTimeoutRef.current) clearTimeout(syncedTimeoutRef.current)
          syncedTimeoutRef.current = setTimeout(() => setShowSynced(false), SYNCED_VISIBLE_MS)
          wasOfflineRef.current = false
        }

        if (!online) {
          wasOfflineRef.current = true
        }

        refreshCounts()
      })
    } catch (err) {
      console.warn('[OfflineIndicator] connection events unavailable', err)
    }

    // T&M ticket sync events (lib/offlineManager)
    let unsubscribeSync = null
    try {
      unsubscribeSync = onSyncStateChange((event) => {
        if (!mountedRef.current) return
        if (event?.type === 'sync_start') {
          setSyncInProgress(true)
          setSyncStartCount(event.count || 0)
        } else if (event?.type === 'sync_complete') {
          setSyncInProgress(false)
          setSyncStartCount(0)
          if (event.synced > 0) {
            setTicketsSynced(event.synced)
            if (ticketsSyncedTimeoutRef.current) clearTimeout(ticketsSyncedTimeoutRef.current)
            ticketsSyncedTimeoutRef.current = setTimeout(() => setTicketsSynced(0), SYNCED_VISIBLE_MS)
          }
        } else if (event?.type === 'session_expired') {
          setSyncInProgress(false)
          setSyncStartCount(0)
        }
        refreshCounts()
      })
    } catch (err) {
      console.warn('[OfflineIndicator] sync events unavailable', err)
    }

    // Initial count check
    refreshCounts()

    // Periodically check pending counts when offline
    const interval = setInterval(() => {
      let online = true
      try { online = getConnectionStatus() } catch { /* assume online */ }
      if (!online) refreshCounts()
    }, 5000)

    return () => {
      mountedRef.current = false
      if (typeof unsubscribeConnection === 'function') unsubscribeConnection()
      if (typeof unsubscribeSync === 'function') unsubscribeSync()
      clearInterval(interval)
      if (syncedTimeoutRef.current) clearTimeout(syncedTimeoutRef.current)
      if (ticketsSyncedTimeoutRef.current) clearTimeout(ticketsSyncedTimeoutRef.current)
    }
  }, [refreshCounts]) // refreshCounts is stable - runs once on mount

  // Resolve what to show (first match wins).
  const ticketTotal = fieldMode ? summary.total : 0
  const ticketsWaiting = fieldMode ? summary.queued + summary.syncing : 0
  let ticketState = null
  if (fieldMode) {
    if (!isOnline) {
      ticketState = ticketTotal > 0 ? { kind: 'offline', text: `Offline · ${tickets(ticketTotal)} saved on phone` } : null
    } else if (summary.needs_auth > 0) {
      ticketState = { kind: 'warn', text: `Sign in to sync ${tickets(summary.needs_auth)}` }
    } else if (summary.failed > 0) {
      ticketState = { kind: 'error', text: `${tickets(summary.failed)} could not sync — tell the office` }
    } else if (syncInProgress || summary.syncing > 0) {
      const n = ticketsWaiting || syncStartCount
      ticketState = n > 0 ? { kind: 'syncing', text: `Syncing ${tickets(n)}…` } : null
    } else if (ticketsWaiting > 0) {
      ticketState = { kind: 'waiting', text: `${tickets(ticketsWaiting)} saved on phone` }
    } else if (ticketsSynced > 0) {
      ticketState = { kind: 'synced', text: `Synced ${tickets(ticketsSynced)}` }
    }
  }

  // Don't show anything if online and nothing pending
  if (!ticketState && isOnline && pendingCount === 0 && !showSynced) {
    return null
  }

  const offlineIcon = (
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
  )
  const checkIcon = (
    <span className="online-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </span>
  )
  const syncIcon = (
    <span className="syncing-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
    </span>
  )
  const alertIcon = (
    <span className="alert-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    </span>
  )

  const ticketIcons = { offline: offlineIcon, warn: alertIcon, error: alertIcon, syncing: syncIcon, waiting: offlineIcon, synced: checkIcon }
  const stateClass = ticketState
    ? `tickets-${ticketState.kind}${ticketState.kind === 'synced' ? ' synced' : ''}`
    : (showSynced ? 'synced' : '')

  return (
    <div className={`offline-indicator ${isOnline ? 'online' : 'offline'} ${stateClass}`} role="status">
      <div className="offline-indicator-content">
        {ticketState ? (
          <>
            {ticketIcons[ticketState.kind]}
            <span className="offline-text">{ticketState.text}</span>
          </>
        ) : !isOnline ? (
          <>
            {offlineIcon}
            <span className="offline-text">
              Offline
              {pendingCount > 0 && (
                <span className="pending-badge">{pendingCount} pending</span>
              )}
            </span>
          </>
        ) : showSynced ? (
          <>
            {checkIcon}
            <span className="offline-text">Changes synced!</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            {syncIcon}
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

        .offline-indicator.tickets-offline,
        .offline-indicator.tickets-waiting {
          background: #1f2937;
          color: #fbbf24;
        }

        .offline-indicator.tickets-syncing {
          background: #1e3a8a;
          color: #dbeafe;
        }

        .offline-indicator.tickets-warn {
          background: #78350f;
          color: #fef3c7;
        }

        .offline-indicator.tickets-error {
          background: #7f1d1d;
          color: #fee2e2;
        }

        .offline-indicator-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .offline-icon,
        .online-icon,
        .syncing-icon,
        .alert-icon {
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
