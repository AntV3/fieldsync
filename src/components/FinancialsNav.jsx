import { memo } from 'react'
import { BarChart3, FileText, ClipboardList, ChevronRight, ChevronLeft, PanelLeftOpen } from 'lucide-react'
import { CountBadge } from './ui'

/**
 * FinancialsNav - Collapsible sidebar navigation for Financials tab
 *
 * Design principles:
 * - Workflow order: Overview → CORs → T&M (reflects natural process)
 * - Collapsible to maximize content real estate
 * - Clear visual hierarchy with active states
 * - Badges show pending items requiring attention
 */

const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    description: 'Metrics & trends',
    step: null
  },
  {
    id: 'cors',
    label: 'Change Orders',
    icon: FileText,
    description: 'CORs & approvals',
    step: 1
  },
  {
    id: 'tickets',
    label: 'T&M Tickets',
    icon: ClipboardList,
    description: 'Field data',
    step: 2
  }
]

export default memo(function FinancialsNav({
  activeSection = 'overview',
  onSectionChange,
  collapsed = false,
  onToggleCollapse,
  stats = {}
}) {
  const {
    corCount = 0,
    ticketCount = 0,
    corPending = 0,
    ticketPending = 0
  } = stats

  // Get badge config for each section
  const getBadge = (itemId) => {
    if (itemId === 'cors' && corCount > 0) {
      return {
        count: corCount,
        variant: corPending > 0 ? 'warning' : 'default',
        pending: corPending
      }
    }
    if (itemId === 'tickets' && ticketCount > 0) {
      return {
        count: ticketCount,
        variant: ticketPending > 0 ? 'warning' : 'default',
        pending: ticketPending
      }
    }
    return null
  }

  return (
    <nav
      className={`financials-nav ${collapsed ? 'collapsed' : ''}`}
      aria-label="Financials sections"
    >
      {/* Collapse Toggle */}
      <button
        className="financials-nav-toggle"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeftOpen size={18} />
        ) : (
          <ChevronLeft size={18} />
        )}
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* Navigation Items */}
      <div className="financials-nav-items">
        {NAV_ITEMS.map((item, index) => {
          const isActive = activeSection === item.id
          const Icon = item.icon
          const badge = getBadge(item.id)
          const showConnector = index < NAV_ITEMS.length - 1 && item.step !== null

          return (
            <div key={item.id} className="financials-nav-item-wrapper">
              <button
                className={`financials-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onSectionChange?.(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? `${item.label}${badge ? ` (${badge.count})` : ''}` : undefined}
              >
                {/* Step indicator for workflow items */}
                {item.step && !collapsed && (
                  <span className="financials-nav-step">{item.step}</span>
                )}

                {/* Icon */}
                <div className="financials-nav-icon">
                  <Icon size={20} />
                  {/* Badge dot in collapsed mode */}
                  {collapsed && badge && badge.pending > 0 && (
                    <span className="financials-nav-dot" />
                  )}
                </div>

                {/* Content - hidden when collapsed */}
                {!collapsed && (
                  <>
                    <div className="financials-nav-content">
                      <span className="financials-nav-label">{item.label}</span>
                      <span className="financials-nav-desc">{item.description}</span>
                    </div>

                    {/* Badge */}
                    {badge && (
                      <CountBadge
                        count={badge.count}
                        size="small"
                        variant={badge.variant}
                      />
                    )}

                    {/* Arrow */}
                    <ChevronRight size={16} className="financials-nav-arrow" />
                  </>
                )}
              </button>

              {/* Workflow connector line */}
              {showConnector && !collapsed && (
                <div className="financials-nav-connector">
                  <div className="connector-line" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Expand hint when collapsed */}
      {collapsed && (
        <div className="financials-nav-hint">
          <span>Menu</span>
        </div>
      )}
    </nav>
  )
})
