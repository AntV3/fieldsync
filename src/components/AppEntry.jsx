import { useState } from 'react'
import { db, supabase } from '../lib/supabase'
import Logo from './Logo'
import CompanyRegistration from './CompanyRegistration'
import { RegistrationSuccess } from './CompanyRegistration'
import OfficeLogin from './OfficeLogin'

export default function AppEntry({ onForemanAccess, onOfficeLogin, onShowToast }) {
  const [mode, setMode] = useState(null) // null, 'foreman', 'office', 'join', 'register', 'registration-success'
  const [registrationData, setRegistrationData] = useState(null)

  // Foreman state
  const [companyCode, setCompanyCode] = useState('')
  const [company, setCompany] = useState(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  // Join state
  const [joinStep, setJoinStep] = useState(1) // 1: company code, 2: create account
  const [joinCompany, setJoinCompany] = useState(null)
  const [joinName, setJoinName] = useState('')
  const [joinEmail, setJoinEmail] = useState('')
  const [joinPassword, setJoinPassword] = useState('')

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

  // Verify company code for joining
  const verifyJoinCode = async () => {
    if (companyCode.length < 2) {
      onShowToast('Enter company code', 'error')
      return
    }

    setLoading(true)
    try {
      const foundCompany = await db.getCompanyByCode(companyCode)
      if (foundCompany) {
        setJoinCompany(foundCompany)
        setJoinStep(2)
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

  // Handle join submit
  const handleJoinSubmit = async () => {
    if (!joinName.trim()) {
      onShowToast('Enter your name', 'error')
      return
    }
    if (!joinEmail.trim() || !joinEmail.includes('@')) {
      onShowToast('Enter valid email', 'error')
      return
    }
    if (joinPassword.length < 6) {
      onShowToast('Password must be 6+ characters', 'error')
      return
    }

    setLoading(true)
    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', joinEmail)
        .single()

      if (existingUser) {
        // User exists - check if they're already in this company
        const { data: existingMapping } = await supabase
          .from('user_companies')
          .select('*')
          .eq('user_id', existingUser.id)
          .eq('company_id', joinCompany.id)
          .single()

        if (existingMapping) {
          onShowToast('You already belong to this company! Just sign in.', 'error')
          setMode('office')
          return
        }

        // Add existing user to new company
        const { error: mappingError } = await supabase
          .from('user_companies')
          .insert({
            user_id: existingUser.id,
            company_id: joinCompany.id,
            role: 'member'
          })

        if (mappingError) throw mappingError

        onShowToast(`Added to ${joinCompany.name}! Sign in to continue.`, 'success')
        setMode('office')
        return
      }

      // New user - create account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: joinEmail,
        password: joinPassword
      })

      if (authError) throw authError

      const userId = authData.user?.id
      if (!userId) throw new Error('Failed to create user')

      // Create user record
      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: joinEmail,
          password_hash: 'managed_by_supabase_auth',
          name: joinName.trim(),
          company_id: joinCompany.id,
          role: 'member',
          is_active: true
        })

      if (userError) throw userError

      // Add to user_companies table
      const { error: mappingError } = await supabase
        .from('user_companies')
        .insert({
          user_id: userId,
          company_id: joinCompany.id,
          role: 'member'
        })

      if (mappingError) throw mappingError

      // Show success and reload
      onShowToast('Account created! Logging you in...', 'success')

      // Small delay then reload to trigger auth
      setTimeout(() => {
        window.location.reload()
      }, 1000)

    } catch (err) {
      console.error('Join error:', err)
      onShowToast(err.message || 'Error creating account', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle registration completion
  const handleRegistrationComplete = (data) => {
    setRegistrationData(data)
    setMode('registration-success')
  }

  // Continue to dashboard after registration success
  const handleContinueAfterRegistration = () => {
    // User needs to sign in with their new account
    setMode('office')
    onShowToast('Please sign in with your new account', 'info')
  }

  // Initial selection screen
  if (mode === null) {
    return (
      <div className="entry-container">
        <div className="entry-card">
          <Logo className="entry-logo" showPoweredBy={false} />

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

          <div className="entry-footer">
            <p className="entry-footer-text">New company?</p>
            <button
              className="entry-register-link"
              onClick={() => setMode('register')}
            >
              Register here
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

            <Logo className="entry-logo" showPoweredBy={false} />
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

          <Logo className="entry-logo" showPoweredBy={false} />
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

  // Office flow - with Company Name + Office PIN gate
  if (mode === 'office') {
    return (
      <>
        <button
          className="entry-back-fixed"
          onClick={() => setMode(null)}
          style={{
            position: 'fixed',
            top: '2rem',
            left: '2rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '1rem',
            zIndex: 1000
          }}
        >
          ← Back
        </button>
        <OfficeLogin onLogin={onOfficeLogin} onShowToast={onShowToast} />
      </>
    )
  }

  // Company Registration flow
  if (mode === 'register') {
    return (
      <>
        <button
          className="entry-back-fixed"
          onClick={() => setMode(null)}
          style={{
            position: 'fixed',
            top: '2rem',
            left: '2rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '1rem',
            zIndex: 1000
          }}
        >
          ← Back
        </button>
        <CompanyRegistration
          onComplete={handleRegistrationComplete}
          onShowToast={onShowToast}
        />
      </>
    )
  }

  // Registration Success Screen
  if (mode === 'registration-success' && registrationData) {
    return (
      <RegistrationSuccess
        company={registrationData.company}
        codes={registrationData.codes}
        onContinue={handleContinueAfterRegistration}
      />
    )
  }

  // Join Company flow
  if (mode === 'join') {
    // Step 1: Enter company code
    if (joinStep === 1) {
      return (
        <div className="entry-container">
          <div className="entry-card">
            <button className="entry-back" onClick={() => setMode('office')}>
              ←
            </button>

            <Logo className="entry-logo" showPoweredBy={false} />
            <p className="entry-subtitle">Enter your company code</p>
            <p className="entry-hint">Ask your manager or admin for the code</p>

            <div className="entry-input-group">
              <input
                type="text"
                value={companyCode}
                onChange={(e) => handleCompanyCodeChange(e.target.value)}
                placeholder="Company Code"
                disabled={loading}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') verifyJoinCode()
                }}
              />
              <button
                className="entry-submit-btn"
                onClick={verifyJoinCode}
                disabled={loading || companyCode.length < 2}
              >
                {loading ? '...' : '→'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Step 2: Create account
    return (
      <div className="entry-container">
        <div className="entry-card">
          <button className="entry-back" onClick={() => { setJoinStep(1); setJoinCompany(null); }}>
            ←
          </button>

          <Logo className="entry-logo" showPoweredBy={false} />
          <div className="entry-company-badge">{joinCompany?.name}</div>
          <p className="entry-subtitle">Create your account</p>

          <div className="entry-form">
            <input
              type="text"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="Your Name"
              autoFocus
            />
            <input
              type="email"
              value={joinEmail}
              onChange={(e) => setJoinEmail(e.target.value)}
              placeholder="Email"
            />
            <input
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              placeholder="Password (6+ characters)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinSubmit()
              }}
            />
            <button
              className="entry-login-btn"
              onClick={handleJoinSubmit}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Join Company'}
            </button>
          </div>

          <p className="entry-join-note">
            You'll join as a team member. Your admin can update your role.
          </p>
        </div>
      </div>
    )
  }
}
