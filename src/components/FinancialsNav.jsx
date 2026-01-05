import { memo } from 'react'
import { BarChart3, FileText, Receipt, Clock, ChevronRight } from 'lucide-react'
import { CountBadge } from './ui'

/**
 * FinancialsNav - Sidebar navigation for Financials tab
 * Implements progressive disclosure - overview first, details on demand
 */

const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: BarChart3,
    description: 'Key metrics & trends'
  },
  {
    id: 'cors',
    label: 'CORs & Tickets',
    icon: FileText,
    description: 'Change orders & T&M'
  }
]

export default memo(function FinancialsNav({
  activeSection = 'overview',
  onSectionChange,
  stats = {} // { corCount, ticketCount, pendingCount, photoCount }
}) {
  const {
    corCount = 0,
    ticketCount = 0,
    pendingCount = 0
  } = stats

  return (
    <nav className="financials-nav" aria-label="Financials sections">
      {NAV_ITEMS.map(item => {
        const isActive = activeSection === item.id
        const Icon = item.icon

        // Determine badge for this item
        let badge = null
        if (item.id === 'cors') {
          const totalItems = corCount + ticketCount
          if (totalItems > 0) {
            badge = (
              <CountBadge
                count={totalItems}
                size="small"
                variant={pendingCount > 0 ? 'warning' : 'default'}
              />
            )
          }
        }

        return (
          <button
            key={item.id}
            className={`financials-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onSectionChange?.(item.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="financials-nav-icon">
              <Icon size={18} />
            </div>
            <div className="financials-nav-content">
              <span className="financials-nav-label">{item.label}</span>
              <span className="financials-nav-desc">{item.description}</span>
            </div>
            {badge}
            <ChevronRight size={16} className="financials-nav-arrow" />
          </button>
        )
      })}

      {/* Quick Stats Summary */}
      {(corCount > 0 || ticketCount > 0) && (
        <div className="financials-nav-summary">
          <div className="nav-summary-row">
            <Receipt size={14} />
            <span>{corCount} CORs</span>
          </div>
          <div className="nav-summary-row">
            <Clock size={14} />
            <span>{ticketCount} Tickets</span>
          </div>
          {pendingCount > 0 && (
            <div className="nav-summary-row pending">
              <span className="pending-dot" />
              <span>{pendingCount} pending approval</span>
            </div>
          )}
        </div>
      )}
    </nav>
  )
})
