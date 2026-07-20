/**
 * ProjectTabNav - The project detail tab bar (Overview / Financials /
 * Field Activity / Documents / Project Info) with ARIA tablist semantics
 * and full keyboard navigation (arrows, Home, End).
 */
export default function ProjectTabNav({ tabs, activeTab, onTabChange }) {
  return (
    <div className="pv-tabs" role="tablist" aria-label="Project dashboard tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          id={`tab-${tab.id}`}
          className={`pv-tab ${activeTab === tab.id ? 'active' : ''} ${tab.badge > 0 ? 'has-badge' : ''}`}
          onClick={() => onTabChange(tab.id)}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onKeyDown={(e) => {
            const tabIds = tabs.map(t => t.id)
            const currentIndex = tabIds.indexOf(tab.id)
            let nextIndex = -1
            if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length
            else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length
            else if (e.key === 'Home') nextIndex = 0
            else if (e.key === 'End') nextIndex = tabIds.length - 1
            if (nextIndex !== -1) {
              e.preventDefault()
              onTabChange(tabIds[nextIndex])
              document.getElementById(`tab-${tabIds[nextIndex]}`)?.focus()
            }
          }}
        >
          <tab.Icon size={16} className="pv-tab-icon" aria-hidden="true" />
          <span className="pv-tab-label">{tab.label}</span>
          {tab.badge > 0 && (
            <span className="pv-tab-badge" aria-label={`${tab.badge} items`}>{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
