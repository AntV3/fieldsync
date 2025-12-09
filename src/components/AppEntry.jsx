import { useState } from 'react'
import { db, supabase } from '../lib/supabase'

export default function AppEntry({ onForemanAccess, onOfficeLogin, onShowToast }) {
  const [mode, setMode] = useState(null) // null, 'foreman', 'office', 'join'
  
  // Foreman state
  const [companyCode, setCompanyCode] = useState('')
  const [company, setCompany] = useState(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  // Office state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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

  // Handle office login
  const handleOfficeSubmit = () => {
    if (!email.trim() || !password.trim()) {
      onShowToast('Enter email and password', 'error')
      return
    }
    onOfficeLogin(email, password)
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
      console.log('Starting signup for:', joinEmail)
      console.log('Company:', joinCompany)

      // 1. Try to sign in first (in case user already exists)
      const { data: existingUser, error: signInError } = await supabase.auth.signInWithPassword({
        email: joinEmail,
        password: joinPassword
      })

      let userId

      if (existingUser?.user) {
        // User already exists in auth
        console.log('User already exists in auth:', existingUser.user.id)
        userId = existingUser.user.id
      } else {
        // Create new auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: joinEmail,
          password: joinPassword,
          options: {
            data: {
              full_name: joinName
            }
          }
        })
        
        if (authError) {
          console.error('Auth signup error:', authError)
          throw authError
        }

        userId = authData.user?.id
        console.log('Auth user created with ID:', userId)
      }
      
      if (!userId) throw new Error('Failed to get user ID')

      // 2. Check if user record exists
      const { data: existingRecord } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single()

      if (!existingRecord) {
        // Create user record
        console.log('Creating user record...')
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

        if (userError) {
          console.error('User insert error:', userError)
          throw userError
        }
        console.log('User record created')
      } else {
        console.log('User record already exists')
      }

      // 3. Get full user data with company
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('*, companies(*)')
        .eq('id', userId)
        .single()

      if (fetchError || !userData) {
        console.error('Failed to fetch user:', fetchError)
        throw new Error('Failed to load user data')
      }

      // 4. Success!
      onShowToast('Welcome!', 'success')
      
      // Call the parent login handler directly with the user data
      // We need to pass this up differently
      window.location.reload() // Simple reload to trigger auth check

    } catch (err) {
      console.error('Join error:', err)
      onShowToast(err.message || 'Error creating account', 'error')
    } finally {
      setLoading(false)
    }
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
            <p>New employee?</p>
            <button className="entry-join-link" onClick={() => setMode('join')}>
              Join your company
            </button>
          </div>
        </div>
      </div>
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
            
            <div className="entry-logo">Field<span>Sync</span></div>
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
          
          <div className="entry-logo">Field<span>Sync</span></div>
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

