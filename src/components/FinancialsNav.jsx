import { memo } from 'react'
import { BarChart3, FileText, ClipboardList, Receipt, ChevronRight, ChevronLeft, PanelLeftOpen, X } from 'lucide-react'
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
    shortLabel: 'Overview',
    icon: BarChart3,
    description: 'Metrics & trends',
    step: null
  },
  {
    id: 'cors',
    label: 'Change Orders',
    shortLabel: 'CORs',
    icon: FileText,
    description: 'CORs & approvals',
    step: 1
  },
  {
    id: 'tickets',
    label: 'T&M Tickets',
    shortLabel: 'Tickets',
    icon: ClipboardList,
    description: 'Field data',
    step: 2
  },
  {
    id: 'billing',
    label: 'Billing',
    shortLabel: 'Billing',
    icon: Receipt,
    description: 'Invoices & billing',
    step: 3
  }
]

export default memo(function FinancialsNav({
  activeSection = 'overview',
  onSectionChange,
  collapsed = false,
  onToggleCollapse,
  onMobileClose,
  stats = {}
}) {
  const {
    corCount = 0,
    ticketCount = 0,
    corPending = 0,
    ticketPending = 0,
    billableCount = 0,
    invoiceCount = 0
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
    if (itemId === 'billing' && billableCount > 0) {
      return {
        count: billableCount,
        variant: 'success', // Green to indicate money ready to collect
        pending: billableCount
      }
    }
    return null
  }

  return (
    <nav
      className={`financials-nav ${collapsed ? 'collapsed' : ''}`}
      aria-label="Financials sections"
    >
      {/* Mobile Header with Close Button */}
      {onMobileClose && (
        <div className="financials-nav-mobile-header">
          <span className="financials-nav-mobile-title">Financials</span>
          <button
            className="financials-nav-mobile-close"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Collapse Toggle - hidden on mobile */}
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
                title={`${item.label}${badge ? ` (${badge.count})` : ''}`}
              >
                {/* Step indicator for workflow items - only in expanded mode */}
                {item.step && !collapsed && (
                  <span className="financials-nav-step">{item.step}</span>
                )}

                {/* Icon with optional badge dot */}
                <div className="financials-nav-icon">
                  <Icon size={collapsed ? 22 : 20} />
                  {/* Badge dot for pending items */}
                  {badge && badge.pending > 0 && (
                    <span className="financials-nav-dot" />
                  )}
                </div>

                {/* Collapsed mode: show short label below icon */}
                {collapsed && (
                  <span className="financials-nav-short-label">{item.shortLabel}</span>
                )}

                {/* Expanded mode: show full content */}
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

      {/* Toggle label when collapsed */}
      {collapsed && (
        <button
          className="financials-nav-expand-btn"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
        >
          <ChevronRight size={14} />
          <span>Expand</span>
        </button>
      )}
    </nav>
  )
})
