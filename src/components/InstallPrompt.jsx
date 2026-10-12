import { useState, useEffect } from 'react'
import { Download, Share, X } from 'lucide-react'
import { isIosSafari, isStandalone } from '../lib/pwaInstall'

const DISMISS_KEY = 'pwa-install-dismissed'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

function recentlyDismissed() {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) return false
    return Date.now() - parseInt(dismissed, 10) < DISMISS_TTL_MS
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [mode, setMode] = useState(null) // null | 'native' | 'ios'

  useEffect(() => {
    if (isStandalone()) return
    if (recentlyDismissed()) return

    if (isIosSafari()) {
      setMode('ios')
      return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setMode('native')
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setMode(null)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setMode(null)
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString())
    } catch {
      // localStorage unavailable (private mode) — just hide for this session
    }
  }

  if (!mode) return null

  if (mode === 'ios') {
    return (
      <div className="install-prompt install-prompt-ios" role="dialog" aria-label="Install FieldSync">
        <div className="install-prompt-content">
          <Download size={20} />
          <div className="install-prompt-text">
            <strong>Install FieldSync</strong>
            <span>
              Tap <Share size={13} className="install-prompt-inline-icon" aria-label="Share" />{' '}
              Share, then <strong>Add to Home Screen</strong>
            </span>
          </div>
        </div>
        <div className="install-prompt-actions">
          <button className="install-prompt-dismiss" onClick={handleDismiss} aria-label="Dismiss">
            <X size={18} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="install-prompt" role="dialog" aria-label="Install FieldSync">
      <div className="install-prompt-content">
        <Download size={20} />
        <div className="install-prompt-text">
          <strong>Install FieldSync</strong>
          <span>Add to home screen for quick access</span>
        </div>
      </div>
      <div className="install-prompt-actions">
        <button className="btn btn-primary btn-small" onClick={handleInstall}>Install</button>
        <button className="install-prompt-dismiss" onClick={handleDismiss} aria-label="Dismiss">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
