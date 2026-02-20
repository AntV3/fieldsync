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

// Storage key generator
const getPinStorageKey = (projectId) => `fm_pinned_${projectId}`

export default function ForemanLanding({
  project,
  todayStatus,
  progress,
  areasWorking,
  areasDone,
  areasRemaining,
  onNavigate,
  onShowToast,
  showDisposal = true,
  fieldSupervisorLabel = 'Foreman'
}) {
  // Build the available actions list based on trade profile modules
  const availableActions = useMemo(() => {
    if (showDisposal) return ALL_ACTIONS
    const { disposal: _removed, ...rest } = ALL_ACTIONS
    return rest
  }, [showDisposal])

  // Pinned actions state
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      const stored = localStorage.getItem(getPinStorageKey(project?.id))
      if (stored) return JSON.parse(stored)
      // Default pinned: skip disposal if not in this trade
      return showDisposal ? DEFAULT_PINNED : DEFAULT_PINNED.filter(id => id !== 'disposal')
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
    return Object.keys(availableActions).filter(id => !pinnedIds.includes(id))
  }, [pinnedIds, availableActions])

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
    const action = availableActions[actionId]
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
    const action = availableActions[actionId]
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

      <style>{`
        .fm-landing {
          padding: 0 1rem 2rem;
        }

        /* Metrics Snapshot */
        .fm-metrics-snapshot {
          width: 100%;
          background: linear-gradient(135deg, var(--primary-color, #3b82f6) 0%, #2563eb 100%);
          border: none;
          border-radius: 16px;
          padding: 1rem;
          color: white;
          text-align: left;
          cursor: pointer;
          margin-bottom: 1.5rem;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .fm-metrics-snapshot:active {
          transform: scale(0.98);
        }

        .fm-snapshot-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          opacity: 0.9;
          margin-bottom: 0.75rem;
        }

        .fm-snapshot-arrow {
          margin-left: auto;
          opacity: 0.7;
        }

        .fm-snapshot-stats {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .fm-snapshot-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .fm-snapshot-stat.main {
          flex: 1.5;
          align-items: flex-start;
        }

        .fm-snapshot-value {
          font-size: 1.5rem;
          font-weight: 700;
          line-height: 1.2;
        }

        .fm-snapshot-stat.main .fm-snapshot-value {
          font-size: 2rem;
        }

        .fm-snapshot-label {
          font-size: 0.7rem;
          opacity: 0.85;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .fm-snapshot-divider {
          width: 1px;
          height: 40px;
          background: rgba(255,255,255,0.3);
        }

        .fm-snapshot-today {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255,255,255,0.2);
          font-size: 0.8rem;
          opacity: 0.9;
        }

        /* Section Header */
        .fm-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .fm-section-header h2 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .fm-edit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.8rem;
          min-width: 36px;
          min-height: 36px;
          transition: all 0.15s ease;
        }

        .fm-edit-btn.active {
          background: var(--primary-color, #3b82f6);
          border-color: var(--primary-color, #3b82f6);
          color: white;
          padding: 0.5rem 1rem;
        }

        .fm-edit-hint {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin: 0 0 0.75rem;
          text-align: center;
        }

        /* Pinned Actions Grid */
        .fm-pinned-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .fm-pinned-card-wrapper {
          position: relative;
        }

        .fm-pinned-card {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1.25rem 1rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          min-height: 110px;
          position: relative;
        }

        .fm-pinned-card:active:not(:disabled) {
          transform: scale(0.97);
          background: var(--bg-elevated);
        }

        .fm-pinned-card:disabled {
          opacity: 0.7;
          cursor: default;
        }

        .fm-pinned-card.completed {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.08);
        }

        .fm-pinned-card.danger {
          border-color: #f59e0b;
        }

        .fm-pinned-card.danger .fm-pinned-icon {
          color: #f59e0b;
        }

        .fm-pinned-icon {
          color: var(--primary-color, #3b82f6);
          margin-bottom: 0.5rem;
        }

        .fm-pinned-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary);
          text-align: center;
        }

        .fm-pinned-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: var(--primary-color, #3b82f6);
          color: white;
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.2rem 0.5rem;
          border-radius: 10px;
        }

        .fm-pinned-check {
          position: absolute;
          top: 8px;
          right: 8px;
          color: #22c55e;
        }

        .fm-pin-toggle {
          position: absolute;
          top: -8px;
          right: -8px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.15s ease;
          z-index: 10;
        }

        .fm-pin-toggle:hover {
          background: var(--bg-elevated);
        }

        .fm-pin-toggle.pinned {
          background: #ef4444;
          border-color: #ef4444;
          color: white;
        }

        /* More Actions Section */
        .fm-more-section {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
        }

        .fm-more-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .fm-more-header:active {
          background: var(--bg-elevated);
        }

        .fm-more-content {
          border-top: 1px solid var(--border-color);
        }

        .fm-action-row-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .fm-action-row-wrapper .fm-pin-toggle {
          position: static;
          margin-right: 0.75rem;
          flex-shrink: 0;
        }

        .fm-action-row {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          text-align: left;
          color: var(--text-primary);
          transition: background 0.15s ease;
        }

        .fm-action-row:last-child {
          border-bottom: none;
        }

        .fm-action-row:active:not(:disabled) {
          background: var(--bg-elevated);
        }

        .fm-action-row:disabled {
          opacity: 0.7;
          cursor: default;
        }

        .fm-action-row.danger {
          color: #f59e0b;
        }

        .fm-action-label {
          flex: 1;
          font-size: 0.9rem;
        }

        .fm-action-badge {
          font-size: 0.75rem;
          color: var(--text-secondary);
          background: var(--bg-elevated);
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
        }

        /* Dark mode adjustments */
        [data-theme="dark"] .fm-metrics-snapshot {
          background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
        }

        [data-theme="dark"] .fm-pinned-card.completed {
          background: rgba(34, 197, 94, 0.15);
        }
      `}</style>
    </div>
  )
}
