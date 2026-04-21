import { useId, useState, memo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * CollapsibleSection - Progressive disclosure component for reducing visual clutter.
 * Shows a header with key summary info; detail content is revealed on expand.
 *
 * @param {string} title - Section heading
 * @param {React.ReactNode} [badge] - Optional badge/count shown next to title
 * @param {React.ReactNode} [icon] - Optional icon before title
 * @param {React.ReactNode} [summary] - Inline summary shown when collapsed (key metric preview)
 * @param {boolean} [defaultOpen=false] - Start expanded
 * @param {string} [variant='default'] - 'default' | 'compact' | 'card'
 * @param {React.ReactNode} children - Content revealed on expand
 */
const CollapsibleSection = memo(function CollapsibleSection({
  title,
  badge,
  icon,
  summary,
  defaultOpen = false,
  variant = 'default',
  className = '',
  children
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div className={`collapsible-section collapsible-${variant} ${isOpen ? 'is-open' : 'is-closed'} ${className}`}>
      <button
        className="collapsible-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        type="button"
      >
        <div className="collapsible-header-left">
          <span className="collapsible-chevron" aria-hidden="true">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          {icon && <span className="collapsible-icon">{icon}</span>}
          <span className="collapsible-title">{title}</span>
          {badge && <span className="collapsible-badge">{badge}</span>}
        </div>
        {!isOpen && summary && (
          <div className="collapsible-summary">{summary}</div>
        )}
      </button>
      <div
        id={panelId}
        className="collapsible-body"
        hidden={!isOpen}
      >
        {isOpen && children}
      </div>
    </div>
  )
})

export default CollapsibleSection
