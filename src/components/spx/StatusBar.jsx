/**
 * StatusBar — Full-width top strip showing key operational metrics
 */

export default function StatusBar({ projectCount, activeCrews, openAlerts, openCORs, dateTime }) {
  const items = [
    { label: 'Projects', value: String(projectCount).padStart(2, '0') },
    { label: 'Active Crews', value: String(activeCrews).padStart(2, '0') },
    { label: 'Open CORs', value: String(openCORs).padStart(2, '0') },
    { label: 'Alerts', value: String(openAlerts).padStart(2, '0'), alert: openAlerts > 0 },
  ]

  return (
    <div className="w-full bg-bg-secondary border-b border-border-subtle px-[24px] py-[12px] flex flex-wrap items-center justify-between gap-[16px]">
      <div className="flex items-center gap-[32px]">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-[8px]">
            <span className="text-[12px] uppercase tracking-spx-nav text-text-secondary">{item.label}</span>
            <span className={`text-[18px] font-bold tabular-nums ${item.alert ? 'text-status-red' : 'text-text-primary'}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[13px] uppercase tracking-spx-nav text-text-secondary tabular-nums">
        {dateTime}
      </div>
    </div>
  )
}
