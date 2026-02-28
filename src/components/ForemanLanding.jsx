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
          done: punchListOpenCount === 0 && punchListOpenCount !== undefined,
          badge: punchListOpenCount > 0 ? `${punchListOpenCount} open` : null,
          status: punchListOpenCount > 0 ? `${punchListOpenCount} items open` : 'All clear'
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

        /* Metrics Snapshot - Premium Hero Card */
        .fm-metrics-snapshot {
          width: 100%;
          background: var(--gradient-blue, linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8));
          border: none;
          border-radius: 16px;
          padding: 1.25rem;
          color: white;
          text-align: left;
          cursor: pointer;
          margin-bottom: 1.5rem;
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.25), 0 2px 8px rgba(0,0,0,0.15);
          position: relative;
          overflow: hidden;
        }

        .fm-metrics-snapshot::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%);
          pointer-events: none;
          border-radius: 16px 16px 0 0;
        }

        .fm-metrics-snapshot::after {
          content: '';
          position: absolute;
          bottom: -40px;
          right: -40px;
          width: 160px;
          height: 160px;
          background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%);
          pointer-events: none;
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
          margin-bottom: 0.875rem;
          font-weight: 500;
          position: relative;
          z-index: 1;
        }

        .fm-snapshot-arrow {
          margin-left: auto;
          opacity: 0.7;
        }

        .fm-snapshot-stats {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          position: relative;
          z-index: 1;
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
          font-size: 1.625rem;
          font-weight: 700;
          line-height: 1.2;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
        }

        .fm-snapshot-stat.main .fm-snapshot-value {
          font-size: 2.25rem;
        }

        .fm-snapshot-label {
          font-size: 0.68rem;
          opacity: 0.85;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
          margin-top: 0.1rem;
        }

        .fm-snapshot-divider {
          width: 1px;
          height: 44px;
          background: rgba(255,255,255,0.25);
        }

        .fm-snapshot-today {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.875rem;
          padding-top: 0.875rem;
          border-top: 1px solid rgba(255,255,255,0.15);
          font-size: 0.8rem;
          opacity: 0.9;
          font-weight: 500;
          position: relative;
          z-index: 1;
        }

        /* Section Header */
        .fm-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.875rem;
        }

        .fm-section-header h2 {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
          letter-spacing: -0.01em;
        }

        .fm-edit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          background: var(--gradient-card-dark, var(--bg-elevated));
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.8rem;
          min-width: 36px;
          min-height: 36px;
          transition: all 0.2s ease;
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.1));
        }

        .fm-edit-btn:hover {
          border-color: var(--accent-blue, #3b82f6);
        }

        .fm-edit-btn.active {
          background: var(--gradient-blue, var(--primary-color, #3b82f6));
          border-color: transparent;
          color: white;
          padding: 0.5rem 1rem;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }

        .fm-edit-hint {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin: 0 0 0.75rem;
          text-align: center;
          font-weight: 500;
        }

        /* Pinned Actions Grid */
        .fm-pinned-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.875rem;
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
          padding: 1.375rem 1rem;
          background: var(--gradient-card-dark, var(--bg-card));
          border: 1px solid var(--border-color);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          min-height: 114px;
          position: relative;
          box-shadow: var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1));
          overflow: hidden;
        }

        .fm-pinned-card::before {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--gradient-blue, linear-gradient(90deg, #3b82f6, #2563eb));
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .fm-pinned-card:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-card-hover, 0 8px 25px rgba(0,0,0,0.15));
          border-color: rgba(59, 130, 246, 0.3);
        }

        .fm-pinned-card:hover:not(:disabled)::before {
          opacity: 1;
        }

        .fm-pinned-card:active:not(:disabled) {
          transform: scale(0.97);
        }

        .fm-pinned-card:disabled {
          opacity: 0.7;
          cursor: default;
        }

        .fm-pinned-card.completed {
          border-color: rgba(34, 197, 94, 0.4);
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 100%);
        }

        .fm-pinned-card.completed::before {
          background: linear-gradient(90deg, #22c55e, #16a34a);
          opacity: 1;
        }

        .fm-pinned-card.danger {
          border-color: rgba(245, 158, 11, 0.4);
        }

        .fm-pinned-card.danger::before {
          background: linear-gradient(90deg, #f59e0b, #d97706);
        }

        .fm-pinned-card.danger .fm-pinned-icon {
          color: #f59e0b;
        }

        .fm-pinned-icon {
          color: var(--primary-color, #3b82f6);
          margin-bottom: 0.625rem;
          transition: transform 0.2s ease;
        }

        .fm-pinned-card:hover:not(:disabled) .fm-pinned-icon {
          transform: scale(1.08);
        }

        .fm-pinned-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
          text-align: center;
          letter-spacing: -0.01em;
        }

        .fm-pinned-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: var(--gradient-blue, var(--primary-color, #3b82f6));
          color: white;
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.2rem 0.55rem;
          border-radius: 10px;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
        }

        .fm-pinned-check {
          position: absolute;
          top: 8px;
          right: 8px;
          color: #22c55e;
          filter: drop-shadow(0 1px 3px rgba(34, 197, 94, 0.3));
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
          transition: all 0.2s ease;
          z-index: 10;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        .fm-pin-toggle:hover {
          background: var(--bg-elevated);
          transform: scale(1.1);
        }

        .fm-pin-toggle.pinned {
          background: #ef4444;
          border-color: #ef4444;
          color: white;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
        }

        /* More Actions Section */
        .fm-more-section {
          background: var(--gradient-card-dark, var(--bg-card));
          border: 1px solid var(--border-color);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1));
        }

        .fm-more-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.125rem;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
          transition: background 0.15s ease;
        }

        .fm-more-header:hover {
          background: var(--bg-secondary, rgba(255,255,255,0.02));
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
          gap: 0.875rem;
          padding: 1.125rem;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          text-align: left;
          color: var(--text-primary);
          transition: all 0.2s ease;
        }

        .fm-action-row:last-child {
          border-bottom: none;
        }

        .fm-action-row:hover:not(:disabled) {
          background: var(--bg-secondary, rgba(255,255,255,0.02));
          padding-left: 1.25rem;
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

        .fm-action-row svg {
          transition: color 0.15s ease;
        }

        .fm-action-row:hover:not(:disabled) svg {
          color: var(--accent-blue, #3b82f6);
        }

        .fm-action-row.danger:hover:not(:disabled) svg {
          color: #f59e0b;
        }

        .fm-action-label {
          flex: 1;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .fm-action-badge {
          font-size: 0.72rem;
          color: var(--text-secondary);
          background: var(--bg-elevated);
          padding: 0.25rem 0.625rem;
          border-radius: 20px;
          font-weight: 600;
        }

        /* Dark mode adjustments */
        [data-theme="dark"] .fm-metrics-snapshot {
          background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 60%, #172554 100%);
          box-shadow: 0 4px 20px rgba(30, 64, 175, 0.3), 0 2px 8px rgba(0,0,0,0.2);
        }

        [data-theme="dark"] .fm-pinned-card.completed {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.04) 100%);
        }
      `}</style>
    </div>
  )
}
