import { memo } from 'react'
import { ChevronRight, ChevronLeft, PanelLeftOpen, X } from 'lucide-react'
import { CountBadge } from '../../ui'

/**
 * TabSubNav - Generic collapsible sidebar navigation for combined dashboard tabs.
 *
 * Same look and behavior as FinancialsNav (reuses the financials-nav CSS),
 * but driven by an items array so Field Activity and Project Info can share it.
 *
 * Item shape: { id, label, shortLabel, icon, description, count, badgeVariant }
 * - count === undefined → no badge, no empty treatment (non-countable section)
 * - count === 0 → item is dimmed with an "(empty)" hint, badge hidden
 * - count > 0 → count badge shown
 */
export default memo(function TabSubNav({
  title,
  ariaLabel,
  items = [],
  activeSection,
  onSectionChange,
  collapsed = false,
  onToggleCollapse,
  onMobileClose
}) {
  return (
    <nav
      className={`financials-nav ${collapsed ? 'collapsed' : ''}`}
      aria-label={ariaLabel || title}
    >
      {/* Mobile Header with Close Button */}
      {onMobileClose && (
        <div className="financials-nav-mobile-header">
          <span className="financials-nav-mobile-title">{title}</span>
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
        {items.map(item => {
          const isActive = activeSection === item.id
          const Icon = item.icon
          const isCountable = typeof item.count === 'number'
          const isEmpty = isCountable && item.count === 0
          const showBadge = isCountable && item.count > 0

          return (
            <div key={item.id} className="financials-nav-item-wrapper">
              <button
                className={`financials-nav-item ${isActive ? 'active' : ''} ${isEmpty ? 'is-empty' : ''}`}
                onClick={() => onSectionChange?.(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={`${item.label}${showBadge ? ` (${item.count})` : isEmpty ? ' (empty)' : ''}`}
              >
                <div className="financials-nav-icon">
                  <Icon size={24} />
                </div>

                {/* Collapsed mode: show short label (with count) below icon */}
                {collapsed && (
                  <span className="financials-nav-short-label">
                    {item.shortLabel || item.label}
                    {showBadge ? ` (${item.count})` : ''}
                  </span>
                )}

                {/* Expanded mode: show full content */}
                {!collapsed && (
                  <>
                    <div className="financials-nav-content">
                      <span className="financials-nav-label">{item.label}</span>
                      <span className="financials-nav-desc">
                        {isEmpty ? '(empty)' : item.description}
                      </span>
                    </div>

                    {showBadge && (
                      <CountBadge
                        count={item.count}
                        size="small"
                        variant={item.badgeVariant || 'default'}
                      />
                    )}

                    <ChevronRight size={16} className="financials-nav-arrow" />
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Toggle label when collapsed */}
      {collapsed && (
        <button
          className="financials-nav-expand-btn"
          onClick={onToggleCollapse}
          aria-label="Expand navigation menu"
          title="Show full navigation labels"
        >
          <ChevronRight size={14} />
          <span>Expand Menu</span>
        </button>
      )}
    </nav>
  )
})
