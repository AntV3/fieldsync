import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, FileText, ClipboardList, CheckSquare, Truck,
  FolderOpen, AlertTriangle, BarChart2, ChevronDown, ChevronUp,
  Pin, PinOff, Settings, TrendingUp, Clock, CheckCircle2
} from 'lucide-react'

/**
 * ForemanLanding - Mobile-first landing page for foremen
 *
 * Features:
 * - Metrics snapshot (tappable for full view)
 * - Pinnable action cards
 * - Collapsible "More Actions" section
 * - Zero training required UX
 */

// All available actions with their config
const ALL_ACTIONS = {
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
    description: 'Create time & materials ticket'
  },
  report: {
    id: 'report',
    label: 'Daily Report',
    icon: ClipboardList,
    description: 'Submit end-of-day report'
  },
  progress: {
    id: 'progress',
    label: 'Update Progress',
    icon: CheckSquare,
    description: 'Mark tasks complete'
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
    description: 'View charts & trends'
  },
  injury: {
    id: 'injury',
    label: 'Report Injury',
    icon: AlertTriangle,
    description: 'Log safety incident',
    isDanger: true
  }
}

// Default pinned actions (sensible defaults for new users)
const DEFAULT_PINNED = ['crew', 'tm', 'report', 'progress']

// Storage key generators
const getPinStorageKey = (projectId) => `fm_pinned_${projectId}`
const getMoreCollapsedKey = (projectId) => `fm_more_collapsed_${projectId}`

export default function ForemanLanding({
  project,
  todayStatus,
  progress,
  areasWorking,
  areasDone,
  areasRemaining,
  onNavigate,
  onShowToast
}) {
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

  // More actions collapsed state — open by default on first visit, then persisted
  const [moreCollapsed, setMoreCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(getMoreCollapsedKey(project?.id))
      return stored === null ? false : stored === 'true'
    } catch {
      return false
    }
  })

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

  // Persist more-section collapsed state
  const toggleMoreCollapsed = useCallback(() => {
    setMoreCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(getMoreCollapsedKey(project?.id), String(next))
      } catch {
        // Storage unavailable
      }
      return next
    })
  }, [project?.id])

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
  }, [pinnedIds])

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
          status: todayStatus.tmTicketsToday > 0 ? `${todayStatus.tmTicketsToday} created` : 'Create new'
        }
      case 'report':
        return {
          done: todayStatus.dailyReportDone,
          badge: null,
          status: todayStatus.dailyReportDone ? 'Submitted' : 'Not submitted'
        }
      case 'progress':
        return {
          done: areasRemaining === 0,
          badge: areasRemaining > 0 ? `${areasRemaining} left` : null,
          status: `${progress}% complete`
        }
      case 'disposal':
        return {
          done: false,
          badge: todayStatus.disposalLoadsToday > 0 ? `${todayStatus.disposalLoadsToday} today` : null,
          status: todayStatus.disposalLoadsToday > 0 ? `${todayStatus.disposalLoadsToday} logged` : 'Log loads'
        }
      default:
        return { done: false, badge: null, status: null }
    }
  }, [todayStatus, progress, areasRemaining])

  // Render a pinned action card
  const renderPinnedAction = (actionId) => {
    const action = ALL_ACTIONS[actionId]
    if (!action) return null

    const Icon = action.icon
    const status = getActionStatus(actionId)

    return (
      <div key={actionId} className="fm-pinned-card-wrapper">
        <button
          className={`fm-pinned-card ${status.done ? 'completed' : ''} ${action.isDanger ? 'danger' : ''}`}
          onClick={() => !isEditMode && onNavigate(actionId)}
          disabled={isEditMode}
        >
          <div className="fm-pinned-icon">
            <Icon size={28} />
          </div>
          <span className="fm-pinned-label">{action.label}</span>
          {status.badge && !isEditMode && (
            <span className="fm-pinned-badge">{status.badge}</span>
          )}
          {status.done && !isEditMode && (
            <div className="fm-pinned-check">
              <CheckCircle2 size={18} />
            </div>
          )}
        </button>
        {isEditMode && (
          <button
            className="fm-pin-toggle pinned"
            onClick={() => togglePin(actionId)}
            aria-label={`Unpin ${action.label}`}
          >
            <PinOff size={16} />
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
      <div key={actionId} className="fm-action-row-wrapper">
        <button
          className={`fm-action-row ${action.isDanger ? 'danger' : ''}`}
          onClick={() => !isEditMode && onNavigate(actionId)}
          disabled={isEditMode}
        >
          <Icon size={20} />
          <span className="fm-action-label">{action.label}</span>
          {status.badge && !isEditMode && (
            <span className="fm-action-badge">{status.badge}</span>
          )}
        </button>
        {isEditMode && (
          <button
            className="fm-pin-toggle"
            onClick={() => togglePin(actionId)}
            aria-label={`Pin ${action.label}`}
          >
            <Pin size={16} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="fm-landing">
      {/* Metrics Snapshot - Tappable */}
      <button
        className="fm-metrics-snapshot"
        onClick={() => onNavigate('metrics')}
        aria-label="View full project metrics"
      >
        <div className="fm-snapshot-header">
          <TrendingUp size={18} />
          <span>Project Overview</span>
          <ChevronDown size={16} className="fm-snapshot-arrow" />
        </div>
        <div className="fm-snapshot-stats">
          <div className="fm-snapshot-stat main">
            <span className="fm-snapshot-value">{progress}%</span>
            <span className="fm-snapshot-label">Complete</span>
          </div>
          <div className="fm-snapshot-divider" />
          <div className="fm-snapshot-stat">
            <span className="fm-snapshot-value">{areasWorking}</span>
            <span className="fm-snapshot-label">In Progress</span>
          </div>
          <div className="fm-snapshot-stat">
            <span className="fm-snapshot-value">{areasDone}</span>
            <span className="fm-snapshot-label">Done</span>
          </div>
          <div className="fm-snapshot-stat">
            <span className="fm-snapshot-value">{areasRemaining}</span>
            <span className="fm-snapshot-label">Remaining</span>
          </div>
        </div>
        {todayStatus.crewCheckedIn && (
          <div className="fm-snapshot-today">
            <Clock size={14} />
            <span>{todayStatus.crewCount} crew on site today</span>
          </div>
        )}
      </button>

      {/* Pinned Actions Header */}
      <div className="fm-section-header">
        <h2>Quick Actions</h2>
        <button
          className={`fm-edit-btn ${isEditMode ? 'active' : ''}`}
          onClick={() => setIsEditMode(!isEditMode)}
          aria-label={isEditMode ? 'Done editing' : 'Customize actions'}
        >
          {isEditMode ? 'Done' : <Settings size={18} />}
        </button>
      </div>

      {isEditMode && (
        <div className="fm-edit-banner" role="status">
          <Settings size={14} />
          <span>Tap the pin icon on any card to add or remove it from Quick Actions</span>
        </div>
      )}

      {/* Pinned Actions Grid */}
      <div className={`fm-pinned-grid${isEditMode ? ' edit-mode' : ''}`}>
        {pinnedIds.map(renderPinnedAction)}
      </div>

      {/* More Actions Section */}
      {unpinnedActions.length > 0 && (
        <div className="fm-more-section">
          <button
            className="fm-more-header"
            onClick={toggleMoreCollapsed}
            aria-expanded={!moreCollapsed}
            aria-controls="fm-more-content"
          >
            <span>More Actions</span>
            {moreCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>

          {!moreCollapsed && (
            <div className="fm-more-content" id="fm-more-content">
              {unpinnedActions.map(renderUnpinnedAction)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
