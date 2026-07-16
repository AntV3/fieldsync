import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, FileText, ClipboardList, CheckSquare, Truck,
  FolderOpen, AlertTriangle, BarChart2, ChevronDown, ChevronUp,
  Pin, PinOff, Settings, CheckCircle2, ClipboardCheck,
  MessageSquareText, NotebookPen, RefreshCw, Home, Plus, MoreHorizontal
} from 'lucide-react'
import { useTradeConfig } from '../lib/TradeConfigContext'
import { getPendingActionCount } from '../lib/offlineManager'
import { formatCurrencyCompact } from '../lib/utils'

/**
 * ForemanLanding - Mobile-first landing page for foremen
 *
 * Redesigned around the one-tap Working/Done loop:
 * - Greeting header + offline sync banner
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
  onNavigate,
  onShowToast
}) {
  // Trade config for dynamic actions
  const tradeConfig = useTradeConfig()
  const configuredActions = tradeConfig?.resolvedConfig?.field_actions
  const truckLoadTrackingEnabled = tradeConfig?.resolvedConfig?.enable_truck_load_tracking ?? false

  // Offline sync banner state
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [showAllAreas, setShowAllAreas] = useState(false)

  useEffect(() => {
    let mounted = true
    const refreshPending = () => {
      getPendingActionCount()
        .then(count => { if (mounted) setPendingSyncCount(count || 0) })
        .catch(() => {})
    }
    const handleOnline = () => { setIsOnline(true); refreshPending() }
    const handleOffline = () => { setIsOnline(false); refreshPending() }
    refreshPending()
    const interval = setInterval(refreshPending, 30000)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      mounted = false
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

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
  }, [todayStatus, progress, areasRemaining, punchListOpenCount])

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
      {(!isOnline || pendingSyncCount > 0) && (
        <div className="sdx-fld-sync" role="status">
          <span className="sdx-fld-sync-icon" aria-hidden="true"><RefreshCw size={17} /></span>
          <span className="sdx-fld-sync-text">
            <span className="sdx-fld-sync-title">
              {pendingSyncCount > 0
                ? `${pendingSyncCount} update${pendingSyncCount !== 1 ? 's' : ''} saved offline`
                : 'Working offline'}
            </span>
            <span className="sdx-fld-sync-sub">
              {isOnline ? 'Syncing to office…' : 'Will sync to office when connected'}
            </span>
          </span>
        </div>
      )}

      {/* Today dark card */}
      <button className="sdx-fld-today" onClick={() => onNavigate('metrics')} aria-label="View full project metrics">
        <div className="sdx-fld-today-head">
          <span className="sdx-fld-today-label">Today's progress</span>
          <span className="sdx-fld-today-link">View metrics →</span>
        </div>
        <div className="sdx-fld-today-stats">
          <div className="sdx-fld-today-stat">
            <span className="sdx-fld-today-value">{progress}%</span>
            <span className="sdx-fld-today-sub">complete</span>
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

      {/* Update your areas — one-tap status cycle */}
      <div className="sdx-fld-section">
        <div className="sdx-fld-section-head">
          <span className="sdx-fld-section-title">Update your areas</span>
          <span className="sdx-fld-section-hint">tap to advance</span>
        </div>
        {areasLoading ? (
          <div className="sdx-fld-areas-empty">Loading areas…</div>
        ) : areas.length === 0 ? (
          <div className="sdx-fld-areas-empty">Office will add work areas to this project</div>
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
          {pinnedIds.map(renderPinnedAction)}
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
