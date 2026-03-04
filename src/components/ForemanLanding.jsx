import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, FileText, ClipboardList, CheckSquare, Truck,
  FolderOpen, AlertTriangle, BarChart2, ChevronDown, ChevronUp,
  Pin, PinOff, Settings, TrendingUp, Clock, CheckCircle2, ClipboardCheck
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
    label: 'Time & Material',
    icon: FileText,
    description: 'Create time & material ticket'
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
  punchlist: {
    id: 'punchlist',
    label: 'Punch List',
    icon: ClipboardCheck,
    description: 'View & resolve punch items'
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

// Storage key generator
const getPinStorageKey = (projectId) => `fm_pinned_${projectId}`

export default function ForemanLanding({
  project,
  todayStatus,
  progress,
  areasWorking,
  areasDone,
  areasRemaining,
  punchListOpenCount,
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

      {/* Daily Workflow Checklist */}
      <div className="fm-daily-checklist">
        {(() => {
          const steps = [
            { id: 'crew', label: 'Crew', done: todayStatus.crewCheckedIn, detail: todayStatus.crewCheckedIn ? `${todayStatus.crewCount}` : null },
            { id: 'progress', label: 'Progress', done: areasRemaining === 0, detail: `${progress}%` },
            { id: 'tm', label: 'T&M', done: false, detail: todayStatus.tmTicketsToday > 0 ? `${todayStatus.tmTicketsToday}` : null },
            { id: 'disposal', label: 'Loads', done: false, detail: todayStatus.disposalLoadsToday > 0 ? `${todayStatus.disposalLoadsToday}` : null },
            { id: 'report', label: 'Report', done: todayStatus.dailyReportDone, detail: null }
          ]
          const doneCount = steps.filter(s => s.done || s.detail).length
          return (
            <>
              <div className="fm-checklist-header">
                <span className="fm-checklist-title">Today</span>
                <span className="fm-checklist-count">{doneCount} of {steps.length}</span>
              </div>
              <div className="fm-checklist-items">
                {steps.map(step => (
                  <button
                    key={step.id}
                    className={`fm-checklist-item ${step.done ? 'done' : step.detail ? 'active' : ''}`}
                    onClick={() => onNavigate(step.id)}
                  >
                    {step.done ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    <span className="fm-checklist-label">{step.label}</span>
                    {step.detail && <span className="fm-checklist-detail">{step.detail}</span>}
                  </button>
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* End-of-day reminder */}
      {new Date().getHours() >= 15 && !todayStatus.dailyReportDone && (
        <button className="fm-eod-reminder" onClick={() => onNavigate('report')}>
          <AlertTriangle size={16} />
          <span>Daily report not submitted — Tap to submit before end of day</span>
        </button>
      )}

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
        <p className="fm-edit-hint">Tap icons to pin/unpin actions</p>
      )}

      {/* Pinned Actions Grid */}
      <div className="fm-pinned-grid">
        {pinnedIds.map(renderPinnedAction)}
      </div>

      {/* More Actions Section */}
      {unpinnedActions.length > 0 && (
        <div className="fm-more-section">
          <button
            className="fm-more-header"
            onClick={() => setMoreCollapsed(!moreCollapsed)}
            aria-expanded={!moreCollapsed}
          >
            <span>More Actions</span>
            {moreCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>

          {!moreCollapsed && (
            <div className="fm-more-content">
              {unpinnedActions.map(renderUnpinnedAction)}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
