import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, FileText, ClipboardList, CheckSquare, Truck,
  FolderOpen, AlertTriangle, BarChart2, ChevronDown, ChevronUp,
  Pin, PinOff, Settings, CheckCircle2, ClipboardCheck,
  MessageSquareText, NotebookPen, RefreshCw, Home, Plus, MoreHorizontal
} from 'lucide-react'
import { useTradeConfig } from '../lib/TradeConfigContext'
import { formatCurrencyCompact } from '../lib/utils'

/**
 * ForemanLanding - Mobile-first landing page for foremen
 *
 * Redesigned around the one-tap Working/Done loop:
 * - Greeting header + offline sync banner
 * - Red "needs attention" card for tickets the office rejected
 * - Dark "today" progress card
 * - "Update your areas" tap-to-cycle list (the core field action)
 * - Pinnable quick action cards + collapsible "More Actions"
 * - Bottom tab bar (Home / Reports / + / Team / More)
 */

// Base actions available to all trades
const BASE_ACTIONS = {
  crew: {
    id: 'crew',
    label: 'Crew Check-in',
    icon: Users,
    description: 'Log who\'s on site today'
  },
  tm: {
    id: 'tm',
    label: 'T&M Ticket',
    icon: FileText,
    description: 'Extra work'
  },
  report: {
    id: 'report',
    label: 'Daily Log',
    icon: ClipboardList,
    description: 'End-of-day report'
  },
  observations: {
    id: 'observations',
    label: 'Add Photos',
    icon: NotebookPen,
    description: 'Geo-tagged notes'
  },
  progress: {
    id: 'progress',
    label: 'Update Progress',
    icon: CheckSquare,
    description: 'Work by phase'
  },
  disposal: {
    id: 'disposal',
    label: 'Disposal Loads',
    icon: Truck,
    description: 'Log haul-off loads'
  },
  docs: {
    id: 'docs',
    label: 'Documents',
    icon: FolderOpen,
    description: 'View project files'
  },
  metrics: {
    id: 'metrics',
    label: 'Project Metrics',
    icon: BarChart2,
    description: 'Charts & trends'
  },
  punchlist: {
    id: 'punchlist',
    label: 'Punch List',
    icon: ClipboardCheck,
    description: 'Resolve punch items'
  },
  rfis: {
    id: 'rfis',
    label: 'RFIs',
    icon: MessageSquareText,
    description: 'Ask the office'
  },
  injury: {
    id: 'injury',
    label: 'Report Injury',
    icon: AlertTriangle,
    description: 'Flag now',
    isDanger: true
  }
}

// Fallback default pinned actions
const FALLBACK_PINNED = ['report', 'observations', 'tm', 'injury']

// Storage key generator
const getPinStorageKey = (projectId) => `fm_pinned_${projectId}`

const AREA_STATUS_META = {
  done: { label: 'Done', className: 'done' },
  working: { label: 'Working', className: 'working' },
  not_started: { label: 'Not started', className: 'not-started' }
}

const AREAS_PREVIEW_COUNT = 8

function greetingForNow() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const EMPTY_PENDING_TICKETS = { queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 }

/**
 * Pick the home sync banner for the current pending state, or null when there
 * is nothing to say. Ticket states (IndexedDB pending_tm_tickets) come first;
 * the legacy pending_actions queue and plain "offline" follow.
 */
function syncBannerFor({ isOnline, tickets, syncInProgress, pendingActionCount }) {
  const total = tickets.total || 0
  const waiting = (tickets.queued || 0) + (tickets.syncing || 0)
  if (!isOnline && total > 0) {
    return {
      tone: 'offline',
      title: `${plural(total, 'ticket')} saved on phone`,
      sub: 'Will sync automatically when you have signal'
    }
  }
  if (tickets.needs_auth > 0) {
    return {
      tone: 'warn',
      title: `Sign in to sync ${plural(tickets.needs_auth, 'ticket')}`,
      sub: 'Enter your foreman PIN to send them to the office'
    }
  }
  if (tickets.failed > 0) {
    return {
      tone: 'error',
      title: `${plural(tickets.failed, 'ticket')} could not sync — tell the office`,
      sub: 'They are still saved on this phone'
    }
  }
  if (waiting > 0 && (syncInProgress || tickets.syncing > 0)) {
    return {
      tone: 'syncing',
      title: `Syncing ${plural(waiting, 'ticket')}…`,
      sub: 'Sending to the office'
    }
  }
  if (waiting > 0) {
    return {
      tone: 'offline',
      title: `${plural(waiting, 'ticket')} saved on phone`,
      sub: 'Will sync automatically when you have signal'
    }
  }
  if (pendingActionCount > 0) {
    return {
      tone: 'offline',
      title: `${pendingActionCount} update${pendingActionCount !== 1 ? 's' : ''} saved offline`,
      sub: isOnline ? 'Syncing to office…' : 'Will sync to office when connected'
    }
  }
  if (!isOnline) {
    return { tone: 'offline', title: 'Working offline', sub: 'Will sync to office when connected' }
  }
  return null
}

// Rejections the foreman dismissed on this device: a list of
// `${ticket.id}:${rejected_at}` so a newer rejection of the same ticket shows again.
const getDismissedRejectionsKey = (projectId) => `fm_dismissed_rejections_${projectId}`
const MAX_DISMISSED_REJECTIONS = 100

const rejectionToken = (ticket) => `${ticket?.id}:${ticket?.rejected_at || ''}`

function readDismissedRejections(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
  } catch {
    return []
  }
}

function formatWorkDate(workDate) {
  if (!workDate) return null
  // work_date is a plain YYYY-MM-DD; parse it as a local date (no UTC shift).
  const d = /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? new Date(`${workDate}T00:00:00`) : new Date(workDate)
  if (Number.isNaN(d.getTime())) return String(workDate)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function relativeTimeFrom(timestamp, now = Date.now()) {
  if (!timestamp) return null
  const then = new Date(timestamp).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.max(0, Math.floor((now - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return `on ${new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function initialsOf(name) {
  return String(name || 'FS')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || 'FS'
}

export default function ForemanLanding({
  project,
  foremanName,
  todayStatus,
  progress,
  areas = [],
  areasLoading = false,
  updatingAreaId = null,
  onAreaCycle,
  areasWorking,
  areasRemaining,
  punchListOpenCount,
  // Pending-sync state is owned by ForemanView (one source of truth) and
  // passed in: { queued, syncing, needs_auth, failed, total } for this project.
  pendingTmTickets = EMPTY_PENDING_TICKETS,
  ticketSyncInProgress = false,
  pendingActionCount = 0,
  isOnline = true,
  // T&M tickets the office rejected (db.getRejectedTMTickets), loaded by ForemanView
  rejectedTickets = [],
  onNavigate,
  onShowToast
}) {
  // Trade config for dynamic actions
  const tradeConfig = useTradeConfig()
  const configuredActions = tradeConfig?.resolvedConfig?.field_actions
  const truckLoadTrackingEnabled = tradeConfig?.resolvedConfig?.enable_truck_load_tracking ?? false

  const [showAllAreas, setShowAllAreas] = useState(false)

  const ticketsWaiting = pendingTmTickets?.total || 0
  const syncBanner = syncBannerFor({
    isOnline,
    tickets: { ...EMPTY_PENDING_TICKETS, ...pendingTmTickets },
    syncInProgress: ticketSyncInProgress,
    pendingActionCount
  })

  // Rejected tickets minus the ones dismissed on this device. The stored list
  // is per project; when the project changes the state is re-read from storage.
  const dismissedStorageKey = getDismissedRejectionsKey(project?.id)
  const [dismissedState, setDismissedState] = useState(() => ({
    key: dismissedStorageKey,
    tokens: readDismissedRejections(dismissedStorageKey)
  }))
  const dismissedTokens = dismissedState.key === dismissedStorageKey
    ? dismissedState.tokens
    : readDismissedRejections(dismissedStorageKey)
  const visibleRejections = useMemo(() => {
    const dismissed = new Set(dismissedTokens)
    return (Array.isArray(rejectedTickets) ? rejectedTickets : [])
      .filter(t => t?.id && !dismissed.has(rejectionToken(t)))
  }, [rejectedTickets, dismissedTokens])

  const dismissRejection = (ticket) => {
    const token = rejectionToken(ticket)
    // Keep only tokens for tickets still rejected (bounded storage) plus this one.
    const current = new Set((rejectedTickets || []).map(rejectionToken))
    const next = [...dismissedTokens.filter(t => current.has(t) && t !== token), token]
      .slice(-MAX_DISMISSED_REJECTIONS)
    setDismissedState({ key: dismissedStorageKey, tokens: next })
    try {
      localStorage.setItem(dismissedStorageKey, JSON.stringify(next))
    } catch {
      // Storage unavailable: dismissed for this visit only
    }
  }

  // Resolve available actions: base actions filtered by trade config
  const ALL_ACTIONS = useMemo(() => {
    let actions = BASE_ACTIONS
    if (configuredActions && configuredActions.length > 0) {
      const filtered = {}
      for (const actionId of configuredActions) {
        if (BASE_ACTIONS[actionId]) {
          filtered[actionId] = BASE_ACTIONS[actionId]
        }
      }
      actions = Object.keys(filtered).length > 0 ? filtered : BASE_ACTIONS
    }
    // Field Observations is a trade-agnostic action every foreman needs.
    // Ensure it's present even for configs saved before it was introduced.
    if (!actions.observations) {
      actions = { ...actions, observations: BASE_ACTIONS.observations }
    }
    // Only show disposal action when truck load tracking is enabled
    if (!truckLoadTrackingEnabled) {
      // eslint-disable-next-line no-unused-vars -- `disposal` is extracted to omit it from `rest`
      const { disposal, ...rest } = actions
      return rest
    }
    // If enabled but disposal isn't in the action set, add it
    if (truckLoadTrackingEnabled && !actions.disposal) {
      return { ...actions, disposal: BASE_ACTIONS.disposal }
    }
    return actions
  }, [configuredActions, truckLoadTrackingEnabled])

  const DEFAULT_PINNED = useMemo(() => {
    if (configuredActions?.length >= 4) return configuredActions.slice(0, 4)
    return FALLBACK_PINNED
  }, [configuredActions])

  // Pinned actions state
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const stored = localStorage.getItem(getPinStorageKey(project?.id))
      return stored ? JSON.parse(stored) : DEFAULT_PINNED
    } catch {
      return DEFAULT_PINNED
    }
  })

  // Edit mode for customizing pins
  const [isEditMode, setIsEditMode] = useState(false)

  // More actions collapsed state
  const [moreCollapsed, setMoreCollapsed] = useState(true)

  // Save pinned actions to localStorage
  useEffect(() => {
    if (project?.id) {
      try {
        localStorage.setItem(getPinStorageKey(project.id), JSON.stringify(pinnedIds))
      } catch {
        // Storage unavailable
      }
    }
  }, [pinnedIds, project?.id])

  // Toggle pin status
  const togglePin = useCallback((actionId) => {
    setPinnedIds(prev => {
      if (prev.includes(actionId)) {
        // Don't allow unpinning if only one left
        if (prev.length <= 1) {
          onShowToast?.('Keep at least one pinned action', 'info')
          return prev
        }
        return prev.filter(id => id !== actionId)
      } else {
        // Max 5 pinned
        if (prev.length >= 5) {
          onShowToast?.('Maximum 5 pinned actions', 'info')
          return prev
        }
        return [...prev, actionId]
      }
    })
  }, [onShowToast])

  // Get unpinned actions (for "More Actions" section)
  const unpinnedActions = useMemo(() => {
    return Object.keys(ALL_ACTIONS).filter(id => !pinnedIds.includes(id))
  }, [ALL_ACTIONS, pinnedIds])

  // A project with no work areas (T&M-only) has nothing to mark Working/Done.
  const hasAreas = areas.length > 0

  // Display-only ordering of the pinned cards: with no areas, T&M ticketing is
  // the foreman's main job, so it leads. The stored order (fm_pinned_<id>) is
  // untouched so the user's own arrangement returns once areas exist.
  const displayedPinnedIds = useMemo(() => {
    if (hasAreas || !pinnedIds.includes('tm')) return pinnedIds
    return ['tm', ...pinnedIds.filter(id => id !== 'tm')]
  }, [hasAreas, pinnedIds])

  // Get status info for an action
  const getActionStatus = useCallback((actionId) => {
    switch (actionId) {
      case 'crew':
        return {
          done: todayStatus.crewCheckedIn,
          badge: todayStatus.crewCheckedIn ? `${todayStatus.crewCount} on site` : null,
          status: todayStatus.crewCheckedIn ? 'Done today' : 'Not started'
        }
      case 'tm':
        if (ticketsWaiting > 0) {
          return { done: false, badge: `${ticketsWaiting} waiting to sync`, status: null }
        }
        return {
          done: false,
          badge: todayStatus.tmTicketsToday > 0 ? `${todayStatus.tmTicketsToday} today` : null,
          status: todayStatus.tmTicketsToday > 0 ? `${todayStatus.tmTicketsToday} created` : 'Extra work'
        }
      case 'report':
        return {
          done: todayStatus.dailyReportDone,
          badge: null,
          status: todayStatus.dailyReportDone ? 'Submitted' : 'Due today'
        }
      case 'progress':
        if (!hasAreas) {
          return { done: false, badge: null, status: 'No areas yet' }
        }
        return {
          done: areasRemaining === 0,
          badge: areasRemaining > 0 ? `${areasRemaining} left` : null,
          status: `${progress}% complete`
        }
      case 'disposal': {
        const loadsToday = todayStatus.disposalLoadsToday
        const trucksToday = todayStatus.trucksUsedToday || 0
        const parts = []
        if (loadsToday > 0) parts.push(`${loadsToday} loads`)
        if (trucksToday > 0) parts.push(`${trucksToday} truck${trucksToday !== 1 ? 's' : ''}`)
        return {
          done: false,
          badge: parts.length > 0 ? parts.join(', ') : null,
          status: parts.length > 0 ? parts.join(', ') : 'Log loads'
        }
      }
      case 'punchlist':
        return {
          done: punchListOpenCount !== null && punchListOpenCount === 0,
          badge: punchListOpenCount > 0 ? `${punchListOpenCount} open` : null,
          status: punchListOpenCount === null ? 'Loading...' : punchListOpenCount > 0 ? `${punchListOpenCount} items open` : 'All clear'
        }
      default:
        return { done: false, badge: null, status: null }
    }
  }, [todayStatus, progress, areasRemaining, punchListOpenCount, hasAreas, ticketsWaiting])

  const visibleAreas = showAllAreas ? areas : areas.slice(0, AREAS_PREVIEW_COUNT)

  // Render a pinned action card
  const renderPinnedAction = (actionId) => {
    const action = ALL_ACTIONS[actionId]
    if (!action) return null

    const Icon = action.icon
    const status = getActionStatus(actionId)

    return (
      <div key={actionId} className="sdx-fld-qa-wrapper">
        <button
          className={`sdx-fld-qa ${status.done ? 'completed' : ''} ${action.isDanger ? 'danger' : ''}`}
          onClick={() => !isEditMode && onNavigate(actionId)}
          disabled={isEditMode}
        >
          <span className="sdx-fld-qa-icon" aria-hidden="true">
            <Icon size={19} />
          </span>
          <span className="sdx-fld-qa-text">
            <span className="sdx-fld-qa-label">{action.label}</span>
            <span className="sdx-fld-qa-sub">{status.badge || status.status || action.description}</span>
          </span>
          {status.done && !isEditMode && (
            <CheckCircle2 size={16} className="sdx-fld-qa-check" aria-hidden="true" />
          )}
        </button>
        {isEditMode && (
          <button
            className="sdx-fld-pin-toggle pinned"
            onClick={() => togglePin(actionId)}
            aria-label={`Unpin ${action.label}`}
          >
            <PinOff size={14} />
          </button>
        )}
      </div>
    )
  }

  // Render an unpinned action row
  const renderUnpinnedAction = (actionId) => {
    const action = ALL_ACTIONS[actionId]
    if (!action) return null

    const Icon = action.icon
    const status = getActionStatus(actionId)

    return (
      <div key={actionId} className="sdx-fld-row-wrapper">
        <button
          className={`sdx-fld-action-row ${action.isDanger ? 'danger' : ''}`}
          onClick={() => !isEditMode && onNavigate(actionId)}
          disabled={isEditMode}
        >
          <Icon size={19} />
          <span className="sdx-fld-action-label">{action.label}</span>
          {status.badge && !isEditMode && (
            <span className="sdx-fld-action-badge">{status.badge}</span>
          )}
        </button>
        {isEditMode && (
          <button
            className="sdx-fld-pin-toggle"
            onClick={() => togglePin(actionId)}
            aria-label={`Pin ${action.label}`}
          >
            <Pin size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="fm-landing sdx-fld">
      {/* Greeting */}
      <div className="sdx-fld-greeting">
        <div className="sdx-fld-greeting-text">
          <div className="sdx-fld-project">{project?.name}</div>
          <div className="sdx-fld-hello">
            {greetingForNow()}{foremanName ? `, ${foremanName.split(' ')[0]}` : ''}
          </div>
        </div>
        <div className="sdx-fld-avatar" aria-hidden="true">{initialsOf(foremanName || project?.name)}</div>
      </div>

      {/* Offline sync banner */}
      {syncBanner && (
        <div className={`sdx-fld-sync ${syncBanner.tone}`} role="status">
          <span className="sdx-fld-sync-icon" aria-hidden="true">
            {syncBanner.tone === 'warn' || syncBanner.tone === 'error'
              ? <AlertTriangle size={17} />
              : <RefreshCw size={17} />}
          </span>
          <span className="sdx-fld-sync-text">
            <span className="sdx-fld-sync-title">{syncBanner.title}</span>
            <span className="sdx-fld-sync-sub">{syncBanner.sub}</span>
          </span>
        </div>
      )}

      {/* Needs attention: tickets the office rejected */}
      {visibleRejections.length > 0 && (
        <section className="sdx-fld-alert" aria-labelledby="sdx-fld-alert-title">
          <div className="sdx-fld-alert-head">
            <span className="sdx-fld-alert-icon" aria-hidden="true">
              <AlertTriangle size={17} />
            </span>
            <span className="sdx-fld-alert-text">
              <span className="sdx-fld-alert-title" id="sdx-fld-alert-title">
                {visibleRejections.length === 1
                  ? '1 ticket needs attention'
                  : `${visibleRejections.length} tickets need attention`}
              </span>
              <span className="sdx-fld-alert-sub">Rejected by the office — fix and resubmit</span>
            </span>
          </div>
          <ul className="sdx-fld-alert-list">
            {visibleRejections.map(ticket => {
              const date = formatWorkDate(ticket.work_date)
              const when = relativeTimeFrom(ticket.rejected_at)
              const reason = String(ticket.rejection_reason ?? '').trim()
              const by = String(ticket.rejected_by_name ?? '').trim()
              const label = ['T&M', date, ticket.ce_pco_number ? `PCO ${ticket.ce_pco_number}` : null]
                .filter(Boolean).join(' · ')
              return (
                <li key={rejectionToken(ticket)} className="sdx-fld-alert-item">
                  <div className="sdx-fld-alert-item-body">
                    <span className="sdx-fld-alert-item-label">{label}</span>
                    <span className="sdx-fld-alert-reason">{reason || 'No reason given'}</span>
                    <span className="sdx-fld-alert-meta">
                      {[by ? `Rejected by ${by}` : 'Rejected', when].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sdx-fld-alert-dismiss"
                    onClick={() => dismissRejection(ticket)}
                    aria-label={`Dismiss rejection of ${label}`}
                  >
                    Dismiss
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="sdx-fld-alert-cta" onClick={() => onNavigate('tm')}>
            <FileText size={16} aria-hidden="true" />
            Submit corrected ticket
          </button>
        </section>
      )}

      {/* Today dark card */}
      <button className="sdx-fld-today" onClick={() => onNavigate('metrics')} aria-label="View full project metrics">
        <div className="sdx-fld-today-head">
          <span className="sdx-fld-today-label">Today's progress</span>
          <span className="sdx-fld-today-link">View metrics →</span>
        </div>
        <div className="sdx-fld-today-stats">
          <div className="sdx-fld-today-stat">
            <span className="sdx-fld-today-value">{hasAreas ? `${progress}%` : '—'}</span>
            <span className="sdx-fld-today-sub">{hasAreas ? 'complete' : 'no areas'}</span>
          </div>
          <div className="sdx-fld-today-stat">
            <span className="sdx-fld-today-value">{todayStatus.crewCount || 0}</span>
            <span className="sdx-fld-today-sub">on site</span>
          </div>
          <div className="sdx-fld-today-stat">
            <span className={`sdx-fld-today-value ${areasWorking > 0 ? 'accent' : ''}`}>{areasWorking}</span>
            <span className="sdx-fld-today-sub">working</span>
          </div>
          <div className="sdx-fld-today-stat">
            <span className={`sdx-fld-today-value ${punchListOpenCount > 0 ? 'warn' : 'ok'}`}>{punchListOpenCount ?? '—'}</span>
            <span className="sdx-fld-today-sub">punch open</span>
          </div>
        </div>
      </button>

      {/* Update your areas — one-tap status cycle (hidden for projects with no areas) */}
      {(areasLoading || hasAreas) && (
        <div className="sdx-fld-section">
          <div className="sdx-fld-section-head">
            <span className="sdx-fld-section-title">Update your areas</span>
            <span className="sdx-fld-section-hint">tap to advance</span>
          </div>
          {areasLoading ? (
            <div className="sdx-fld-areas-empty">Loading areas…</div>
          ) : (
            <div className="sdx-fld-areas">
              {visibleAreas.map(area => {
                const meta = AREA_STATUS_META[area.status] || AREA_STATUS_META.not_started
                return (
                  <button
                    key={area.id}
                    className={`sdx-fld-area ${updatingAreaId === area.id ? 'updating' : ''}`}
                    onClick={() => onAreaCycle?.(area)}
                    disabled={updatingAreaId === area.id}
                    aria-label={`${area.name}: ${meta.label}. Tap to advance status.`}
                  >
                    <span className={`sdx-dot ${meta.className}`} aria-hidden="true" />
                    <span className="sdx-fld-area-text">
                      <span className="sdx-fld-area-name">{area.name}</span>
                      <span className="sdx-fld-area-sub">
                        {[
                          area.scheduled_value ? formatCurrencyCompact(area.scheduled_value) : (area.weight ? `${area.weight}%` : null),
                          area.group_name
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className={`sdx-pill ${meta.className}`}>{meta.label}</span>
                  </button>
                )
              })}
              {areas.length > AREAS_PREVIEW_COUNT && (
                <button className="sdx-fld-areas-more" onClick={() => setShowAllAreas(v => !v)}>
                  {showAllAreas ? 'Show fewer' : `Show all ${areas.length} areas`}
                </button>
              )}
              <button className="sdx-fld-areas-phases" onClick={() => onNavigate('progress')}>
                View by phase →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick actions (pinned, customizable) */}
      <div className="sdx-fld-section">
        <div className="sdx-fld-section-head">
          <span className="sdx-fld-section-title">Quick actions</span>
          <button
            className={`sdx-fld-edit-btn ${isEditMode ? 'active' : ''}`}
            onClick={() => setIsEditMode(!isEditMode)}
            aria-label={isEditMode ? 'Done editing' : 'Customize actions'}
          >
            {isEditMode ? 'Done' : <Settings size={16} />}
          </button>
        </div>

        {isEditMode && (
          <p className="sdx-fld-edit-hint">Tap icons to pin/unpin actions</p>
        )}

        <div className="sdx-fld-qa-grid stagger-children">
          {displayedPinnedIds.map(renderPinnedAction)}
        </div>
      </div>

      {/* More Actions Section */}
      {unpinnedActions.length > 0 && (
        <div className="sdx-fld-more" id="sdx-fld-more">
          <button
            className="sdx-fld-more-header"
            onClick={() => setMoreCollapsed(!moreCollapsed)}
            aria-expanded={!moreCollapsed}
          >
            <span>More actions</span>
            {moreCollapsed ? <ChevronDown size={19} /> : <ChevronUp size={19} />}
          </button>

          {!moreCollapsed && (
            <div className="sdx-fld-more-content">
              {unpinnedActions.map(renderUnpinnedAction)}
            </div>
          )}
        </div>
      )}

      {/* Bottom tab bar */}
      <nav className="sdx-fld-tabbar" aria-label="Field navigation">
        <button className="sdx-fld-tab active" aria-current="page">
          <Home size={20} />
          <span>Home</span>
        </button>
        <button className="sdx-fld-tab" onClick={() => onNavigate('report')}>
          <ClipboardList size={20} />
          <span>Reports</span>
        </button>
        <button className="sdx-fld-fab" onClick={() => onNavigate('tm')} aria-label="New T&M ticket">
          <Plus size={23} />
        </button>
        <button className="sdx-fld-tab" onClick={() => onNavigate('crew')}>
          <Users size={20} />
          <span>Team</span>
        </button>
        <button
          className="sdx-fld-tab"
          onClick={() => {
            setMoreCollapsed(false)
            requestAnimationFrame(() => {
              document.getElementById('sdx-fld-more')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
          }}
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>
    </div>
  )
}
