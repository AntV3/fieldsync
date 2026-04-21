/**
 * NavBar — Fixed top navigation bar (56px)
 * Logo left, nav links center-right, user icon far right.
 */
import { Settings } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/v2' },
  { label: 'Projects', href: '/v2/projects' },
  { label: 'Field', href: '/v2/field' },
  { label: 'Alerts', href: '/v2/alerts' },
]

export default function NavBar({ activePath = '/v2' }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-[56px] bg-[rgba(15,17,18,0.95)] backdrop-blur-[8px] flex items-center px-[24px] border-b border-border-default">
      {/* Logo */}
      <div className="flex items-center gap-[8px] mr-auto">
        <span className="text-[18px] font-bold uppercase tracking-spx-h1 text-text-primary">
          FieldSync
        </span>
      </div>

      {/* Nav Links */}
      <div className="hidden md:flex items-center gap-[32px]">
        {NAV_ITEMS.map((item) => {
          const isActive = activePath === item.href
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`text-[13px] uppercase tracking-spx-nav font-normal transition-colors duration-150 pb-[2px] ${
                isActive
                  ? 'text-text-primary border-b-2 border-accent-blue'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {item.label}
            </a>
          )
        })}
      </div>

      {/* Settings */}
      <button
        type="button"
        aria-label="Settings"
        className="ml-[32px] text-text-secondary hover:text-text-primary transition-colors duration-150"
      >
        <Settings size={20} strokeWidth={1.5} />
      </button>
    </nav>
  )
}
