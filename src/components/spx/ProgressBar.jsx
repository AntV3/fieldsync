/**
 * ProgressBar — Flat progress indicator
 * White fill on dark track, no rounded ends.
 */

export default function ProgressBar({ value = 0, max = 100, label, className = '' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={`flex flex-col gap-[8px] ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-spx-label">{label}</span>
          <span className="text-[13px] font-bold tabular-nums text-text-primary">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-[4px] w-full bg-bg-tertiary">
        <div
          className="h-full bg-text-primary transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
