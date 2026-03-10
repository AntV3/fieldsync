/**
 * StatusBadge — Sharp-cornered status indicator
 * Maps operational states to semantic colors per SpaceX design spec.
 */

const VARIANTS = {
  active:      { bg: 'bg-status-green',  text: 'text-black' },
  nominal:     { bg: 'bg-status-green',  text: 'text-black' },
  complete:    { bg: 'bg-status-green',  text: 'text-black' },
  'in-progress': { bg: 'bg-status-blue', text: 'text-white' },
  info:        { bg: 'bg-status-blue',   text: 'text-white' },
  pending:     { bg: 'bg-status-amber',  text: 'text-black' },
  warning:     { bg: 'bg-status-amber',  text: 'text-black' },
  'at-risk':   { bg: 'bg-status-amber',  text: 'text-black' },
  alert:       { bg: 'bg-status-red',    text: 'text-white' },
  blocked:     { bg: 'bg-status-red',    text: 'text-white' },
  failed:      { bg: 'bg-status-red',    text: 'text-white' },
  inactive:    { bg: 'bg-bg-tertiary',   text: 'text-text-secondary', border: true },
  draft:       { bg: 'bg-bg-tertiary',   text: 'text-text-secondary', border: true },
}

export default function StatusBadge({ status, label, className = '' }) {
  const key = status?.toLowerCase() || 'inactive'
  const variant = VARIANTS[key] || VARIANTS.inactive
  const displayLabel = label || status

  return (
    <span
      className={`inline-flex items-center h-[22px] px-[10px] text-[11px] uppercase tracking-spx-label font-semibold leading-none ${variant.bg} ${variant.text} ${variant.border ? 'border border-text-secondary' : ''} ${className}`}
    >
      {displayLabel}
    </span>
  )
}
