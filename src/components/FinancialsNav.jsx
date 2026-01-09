import { memo } from 'react'
import { BarChart3, FileText, Receipt, ClipboardList, ChevronRight } from 'lucide-react'
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
    label: 'Change Orders',
    icon: FileText,
    description: 'CORs & client log'
  },
  {
    id: 'tickets',
    label: 'T&M Tickets',
    icon: ClipboardList,
    description: 'Time & materials'
  }
]

export default memo(function FinancialsNav({
  activeSection = 'overview',
  onSectionChange,
  stats = {} // { corCount, ticketCount, pendingCount, corPending, ticketPending }
}) {
  const {
    corCount = 0,
    ticketCount = 0,
    corPending = 0,
    ticketPending = 0
  } = stats

  return (
    <nav className="financials-nav" aria-label="Financials sections">
      {NAV_ITEMS.map(item => {
        const isActive = activeSection === item.id
        const Icon = item.icon

        // Determine badge for this item
        let badge = null
        if (item.id === 'cors' && corCount > 0) {
          badge = (
            <CountBadge
              count={corCount}
              size="small"
              variant={corPending > 0 ? 'warning' : 'default'}
            />
          )
        } else if (item.id === 'tickets' && ticketCount > 0) {
          badge = (
            <CountBadge
              count={ticketCount}
              size="small"
              variant={ticketPending > 0 ? 'warning' : 'default'}
            />
          )
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
    </nav>
  )
})
