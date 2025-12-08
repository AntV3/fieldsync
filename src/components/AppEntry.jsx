import { useState } from 'react'
import { db } from '../lib/supabase'

export default function AppEntry({ onForemanAccess, onOfficeLogin, onShowToast }) {
  const [mode, setMode] = useState(null) // null, 'foreman', 'office'
  
  // Foreman state
  const [companyCode, setCompanyCode] = useState('')
  const [company, setCompany] = useState(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  // Office state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Handle company code
  const handleCompanyCodeChange = (value) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    setCompanyCode(cleaned)
  }

  // Verify company code
  const submitCompanyCode = async () => {
    if (companyCode.length < 2) {
      onShowToast('Enter company code', 'error')
      return
    }

    setLoading(true)
    try {
      const foundCompany = await db.getCompanyByCode(companyCode)
      if (foundCompany) {
        setCompany(foundCompany)
      } else {
        onShowToast('Invalid company code', 'error')
        setCompanyCode('')
      }
    } catch (err) {
      onShowToast('Error checking code', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Submit PIN
  const submitPin = async (pinToSubmit) => {
    if (pinToSubmit.length !== 4) return

    setLoading(true)
    try {
      const project = await db.getProjectByPinAndCompany(pinToSubmit, company.id)
      if (project) {
        onForemanAccess(project)
      } else {
        onShowToast('Invalid PIN', 'error')
        setPin('')
      }
    } catch (err) {
      onShowToast('Error checking PIN', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Number pad handler
  const handleNumberPad = (num) => {
    if (pin.length < 4) {
      const newPin = pin + num
      setPin(newPin)
      if (newPin.length === 4) {
        setTimeout(() => submitPin(newPin), 200)
      }
    }
  }

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1))
  }

  // Reset to company code entry
  const handleBackToCompany = () => {
    setCompany(null)
    setPin('')
  }

  // Handle office login
  const handleOfficeSubmit = () => {
    if (!email.trim() || !password.trim()) {
      onShowToast('Enter email and password', 'error')
      return
    }
    onOfficeLogin(email, password)
  }

  // Initial selection screen
  if (mode === null) {
    return (
      <div className="entry-container">
        <div className="entry-card">
          <div className="entry-logo">Field<span>Sync</span></div>
          
          <div className="entry-buttons">
            <button 
              className="entry-mode-btn foreman"
              onClick={() => setMode('foreman')}
            >
              <span className="entry-mode-icon">👷</span>
              <span className="entry-mode-title">Foreman</span>
              <span className="entry-mode-desc">Enter project PIN</span>
            </button>
            
            <button 
              className="entry-mode-btn office"
              onClick={() => setMode('office')}
            >
              <span className="entry-mode-icon">💼</span>
              <span className="entry-mode-title">Office</span>
              <span className="entry-mode-desc">Sign in to dashboard</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Foreman flow
  if (mode === 'foreman') {
    // Step 1: Company code
    if (!company) {
      return (
        <div className="entry-container">
          <div className="entry-card">
            <button className="entry-back" onClick={() => setMode(null)}>
              ←
            </button>
            
            <div className="entry-logo">Field<span>Sync</span></div>
            <p className="entry-subtitle">Enter company code</p>

            <div className="entry-input-group">
              <input
                type="text"
                value={companyCode}
                onChange={(e) => handleCompanyCodeChange(e.target.value)}
                placeholder="Company Code"
                disabled={loading}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCompanyCode()
                }}
              />
              <button
                className="entry-submit-btn"
                onClick={submitCompanyCode}
                disabled={loading || companyCode.length < 2}
              >
                {loading ? '...' : '→'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Step 2: PIN entry
    return (
      <div className="entry-container">
        <div className="entry-card">
          <button className="entry-back" onClick={handleBackToCompany}>
            ←
          </button>
          
          <div className="entry-logo">Field<span>Sync</span></div>
          <div className="entry-company-badge">{company.name}</div>
          <p className="entry-subtitle">Enter project PIN</p>

          {/* PIN Display */}
          <div className="pin-display">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`pin-dot ${pin.length > i ? 'filled' : ''}`}>
                {pin.length > i ? '•' : ''}
              </div>
            ))}
          </div>

          {/* Number Pad */}
          <div className="number-pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                className="num-btn"
                onClick={() => handleNumberPad(num.toString())}
                disabled={loading}
              >
                {num}
              </button>
            ))}
            <button className="num-btn empty" disabled></button>
            <button
              className="num-btn"
              onClick={() => handleNumberPad('0')}
              disabled={loading}
            >
              0
            </button>
            <button
              className="num-btn backspace"
              onClick={handleBackspace}
              disabled={loading || pin.length === 0}
            >
              ←
            </button>
          </div>

          {loading && (
            <div className="entry-loading">
              <div className="spinner"></div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Office flow
  if (mode === 'office') {
    return (
      <div className="entry-container">
        <div className="entry-card">
          <button className="entry-back" onClick={() => setMode(null)}>
            ←
          </button>
          
          <div className="entry-logo">Field<span>Sync</span></div>
          <p className="entry-subtitle">Sign in to your account</p>

          <div className="entry-form">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOfficeSubmit()
              }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOfficeSubmit()
              }}
            />
            <button
              className="entry-login-btn"
              onClick={handleOfficeSubmit}
            >
              Sign In
            </button>
          </div>

          <div className="entry-signup-hint">
            <p>Don't have an account?</p>
            <a href="https://fieldsync.com" target="_blank" rel="noopener noreferrer">
              Sign up at fieldsync.com
            </a>
          </div>
        </div>
      </div>
    )
  }
}
