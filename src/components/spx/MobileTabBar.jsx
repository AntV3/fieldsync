/**
 * MobileTabBar — Bottom-pinned mobile navigation for field workers
 * Max 5 tabs. Thumb-friendly. Glove-compatible tap targets.
 */
import { LayoutDashboard, FolderKanban, HardHat, Bell, Settings } from 'lucide-react'

const TABS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/v2' },
  { label: 'Projects', icon: FolderKanban, href: '/v2/projects' },
  { label: 'Field', icon: HardHat, href: '/v2/field' },
  { label: 'Alerts', icon: Bell, href: '/v2/alerts' },
  { label: 'Settings', icon: Settings, href: '/v2/settings' },
]

export default function MobileTabBar({ activePath = '/v2', alertCount = 0 }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-bg-primary border-t border-border-default flex items-stretch h-[64px]">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = activePath === tab.href
        const hasAlert = tab.label === 'Alerts' && alertCount > 0

        const ariaLabel = hasAlert
          ? `${tab.label}, ${alertCount} unread alert${alertCount === 1 ? '' : 's'}`
          : tab.label

        return (
          <a
            key={tab.href}
            href={tab.href}
            aria-label={ariaLabel}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-[4px] transition-colors duration-150 min-h-[44px] ${
              isActive ? 'text-text-primary' : 'text-text-secondary'
            }`}
          >
            <div className="relative">
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              {hasAlert && (
                <span className="absolute -top-[4px] -right-[6px] w-[8px] h-[8px] bg-status-red" aria-hidden="true" />
              )}
            </div>
            <span className={`text-[10px] uppercase tracking-spx-label ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
              {tab.label}
            </span>
          </a>
        )
      })}
    </nav>
  )
}
