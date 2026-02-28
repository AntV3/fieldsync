import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const CONSENT_KEY = 'fieldsync-cookie-consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show banner if consent hasn't been given yet
    const consent = localStorage.getItem(CONSENT_KEY)
    if (!consent) {
      // Small delay so it doesn't flash on initial load
      const timer = setTimeout(() => setVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    setVisible(false)
  }

  const handleDecline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined')
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
