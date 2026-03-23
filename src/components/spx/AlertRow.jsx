/**
 * AlertRow — Single alert item with semantic color border
 */
import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react'

const SEVERITY_CONFIG = {
  critical: { border: 'border-l-status-red', icon: AlertCircle, iconColor: 'text-status-red' },
  warning: { border: 'border-l-status-amber', icon: AlertTriangle, iconColor: 'text-status-amber' },
  info: { border: 'border-l-status-blue', icon: Info, iconColor: 'text-status-blue' },
}

export default function AlertRow({ severity = 'info', title, detail, project, timestamp, onDismiss }) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info
  const Icon = config.icon

  return (
    <div className={`flex items-start gap-[12px] px-[20px] py-[16px] border-l-[3px] ${config.border} border-b border-border-muted`}>
      <Icon size={16} strokeWidth={1.5} className={`${config.iconColor} shrink-0 mt-[2px]`} />
      <div className="flex flex-col min-w-0 flex-1 gap-[4px]">
        <span className="text-[14px] font-medium text-text-primary">{title}</span>
        {detail && <span className="text-[12px] text-text-secondary leading-[1.5]">{detail}</span>}
        {project && <span className="text-[11px] text-accent-blue-light uppercase tracking-spx-label">{project}</span>}
      </div>
      <div className="flex items-center gap-[12px] shrink-0">
        {timestamp && <span className="text-[11px] text-text-secondary tabular-nums">{timestamp}</span>}
        {onDismiss && (
          <button onClick={onDismiss} className="text-text-secondary hover:text-text-primary transition-colors duration-150">
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  )
}
