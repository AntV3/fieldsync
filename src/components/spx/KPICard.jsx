/**
 * KPICard — Data readout card with label, value, delta, and optional accent line
 */

const ACCENT_COLORS = {
  green: 'bg-status-green',
  blue: 'bg-status-blue',
  amber: 'bg-status-amber',
  red: 'bg-status-red',
  default: 'bg-accent-blue',
}

export default function KPICard({ label, value, delta, deltaDirection, accent = 'default', className = '' }) {
  const accentColor = ACCENT_COLORS[accent] || ACCENT_COLORS.default

  return (
    <div className={`bg-bg-secondary border border-border-subtle p-[24px] flex flex-col gap-[8px] ${className}`}>
      <span className="text-spx-label">{label}</span>
      <span className="text-spx-data-lg text-text-primary">{value}</span>
      {delta && (
        <span className={`text-[13px] font-medium ${deltaDirection === 'up' ? 'text-status-green' : deltaDirection === 'down' ? 'text-status-red' : 'text-text-secondary'}`}>
          {deltaDirection === 'up' ? '\u25B2' : deltaDirection === 'down' ? '\u25BC' : ''} {delta}
        </span>
      )}
      <div className={`h-[2px] w-full mt-auto ${accentColor}`} />
    </div>
  )
}
