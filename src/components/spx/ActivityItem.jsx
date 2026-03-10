/**
 * ActivityItem — Feed item for the activity sidebar
 */

export default function ActivityItem({ icon: Icon, title, detail, timestamp }) {
  return (
    <div className="flex items-start gap-[12px] py-[12px] border-b border-border-muted">
      {Icon && (
        <div className="shrink-0 mt-[2px] text-text-secondary">
          <Icon size={16} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] text-text-primary leading-[1.4]">{title}</span>
        {detail && <span className="text-[12px] text-text-secondary leading-[1.4]">{detail}</span>}
      </div>
      {timestamp && (
        <span className="text-[11px] text-text-secondary tabular-nums whitespace-nowrap shrink-0">{timestamp}</span>
      )}
    </div>
  )
}
