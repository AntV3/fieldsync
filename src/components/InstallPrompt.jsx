import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Check if user dismissed recently
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return
    }

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowBanner(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  if (!showBanner) return null

  return (
    <div className="install-prompt">
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
