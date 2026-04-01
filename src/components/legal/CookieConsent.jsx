import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const CONSENT_KEY = 'fieldsync-cookie-consent'

export default function CookieConsent() {
  // Read consent synchronously on mount so the banner never flickers back
  const [consent, setConsent] = useState(() => localStorage.getItem(CONSENT_KEY))
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show the banner if no consent decision has been stored
    if (consent) return
    const timer = setTimeout(() => setVisible(true), 1000)
    return () => clearTimeout(timer)
  }, [consent])

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    setConsent('accepted')
    setVisible(false)
  }

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined')
    setConsent('declined')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-content">
        <p>
          We use cookies and local storage to keep you signed in, remember your preferences,
          and support offline functionality.{' '}
          <Link to="/privacy" className="cookie-banner-link">Privacy Policy</Link>
        </p>
        <div className="cookie-banner-actions">
          <button className="cookie-btn-decline" onClick={handleDecline}>Decline</button>
          <button className="cookie-btn-accept" onClick={handleAccept}>Accept</button>
        </div>
      </div>
    </div>
  )
}
