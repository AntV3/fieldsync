import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Settings as SettingsIcon, ChevronDown } from 'lucide-react'

const SETTINGS_PATHS = ['/pricing', '/branding', '/team', '/account']

/**
 * SettingsDropdown - Main nav "Settings" menu that consolidates the
 * Pricing, Branding, Team, and Account links. Branding and Team are
 * admin-only. Shows the pending membership request count as a badge.
 */
export default function SettingsDropdown({ isAdmin, pendingRequestCount = 0 }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const goTo = (path) => {
    navigate(path)
    setOpen(false)
  }

  return (
    <div className="nav-settings">
      <button
        className={`nav-tab nav-settings-trigger ${SETTINGS_PATHS.includes(location.pathname) ? 'active' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SettingsIcon size={14} />
        Settings
        {pendingRequestCount > 0 && <span className="nav-tab-badge">{pendingRequestCount}</span>}
        <ChevronDown size={12} className={`nav-settings-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <>
          <div className="nav-settings-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="nav-settings-dropdown" role="menu">
            <button role="menuitem" className={`nav-settings-item ${location.pathname === '/pricing' ? 'active' : ''}`} onClick={() => goTo('/pricing')}>Pricing</button>
            {isAdmin && (
              <button role="menuitem" className={`nav-settings-item ${location.pathname === '/branding' ? 'active' : ''}`} onClick={() => goTo('/branding')}>Branding</button>
            )}
            {isAdmin && (
              <button role="menuitem" className={`nav-settings-item ${location.pathname === '/team' ? 'active' : ''}`} onClick={() => goTo('/team')}>
                Team
                {pendingRequestCount > 0 && <span className="nav-tab-badge">{pendingRequestCount}</span>}
              </button>
            )}
            <button role="menuitem" className={`nav-settings-item ${location.pathname === '/account' ? 'active' : ''}`} onClick={() => goTo('/account')}>Account</button>
          </div>
        </>
      )}
    </div>
  )
}
