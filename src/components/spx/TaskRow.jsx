/**
 * TaskRow — Work order / task list row (64px)
 * Left accent bar colored by status. Title + subtitle. Badge + timestamp right.
 */
import StatusBadge from './StatusBadge'

const ACCENT_COLORS = {
  active: 'bg-status-green',
  nominal: 'bg-status-green',
  complete: 'bg-status-green',
  'in-progress': 'bg-status-blue',
  pending: 'bg-status-amber',
  warning: 'bg-status-amber',
  alert: 'bg-status-red',
  blocked: 'bg-status-red',
  inactive: 'bg-bg-tertiary',
}

export default function TaskRow({ title, subtitle, status, timestamp, onClick }) {
  const accentColor = ACCENT_COLORS[status?.toLowerCase()] || ACCENT_COLORS.inactive

  return (
    <div
      className="flex items-center h-[64px] px-[24px] border-b border-border-muted hover:bg-bg-secondary transition-colors duration-100 cursor-pointer"
      onClick={onClick}
    >
      <div className={`w-[3px] h-[32px] ${accentColor} mr-[16px] shrink-0`} />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[14px] font-medium text-text-primary truncate">{title}</span>
        {subtitle && <span className="text-[12px] text-text-secondary truncate">{subtitle}</span>}
      </div>
      <div className="flex items-center gap-[16px] shrink-0 ml-[16px]">
        <StatusBadge status={status} />
        {timestamp && (
          <span className="text-[12px] text-text-secondary tabular-nums whitespace-nowrap">{timestamp}</span>
        )}
      </div>
    </div>
  )
}
