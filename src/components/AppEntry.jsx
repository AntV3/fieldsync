import { useState } from 'react'
import { HardHat, Briefcase } from 'lucide-react'
import { db, supabase } from '../lib/supabase'
import Logo from './Logo'

export default function AppEntry({ onForemanAccess, onOfficeLogin, onShowToast }) {
  const [mode, setMode] = useState(null) // null, 'foreman', 'office', 'join'
  
  // Foreman state
  const [companyCode, setCompanyCode] = useState('')
  const [company, setCompany] = useState(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [pinState, setPinState] = useState('') // '', 'error', 'success'

  // Office state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Join state
  const [joinStep, setJoinStep] = useState(1) // 1: company code, 2: office code, 3: create account
  const [joinCompany, setJoinCompany] = useState(null)
  const [officeCode, setOfficeCode] = useState('')
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

  // Submit PIN - uses secure session-based validation with fallback
  const submitPin = async (pinToSubmit) => {
    if (pinToSubmit.length !== 4) return

    setLoading(true)
    setPinState('')

    try {
      // Try secure PIN validation first (creates a session token)
      const result = await db.getProjectByPinSecure(pinToSubmit, company.code)

      if (result.rateLimited) {
        setPinState('error')
        onShowToast('Too many attempts. Please wait 15 minutes.', 'error')
        setTimeout(() => {
          setPin('')
          setPinState('')
        }, 800)
        return
      }

      if (result.success && result.project) {
        onForemanAccess(result.project)
        return
      }

      // If secure method failed but no rate limit, try fallback lookup
      // This handles cases where the RPC function isn't deployed yet
      if (result.error) {
        console.warn('Secure PIN validation failed, trying fallback:', result.error)
        const fallbackProject = await db.getProjectByPinAndCompany(pinToSubmit, company.id)
        if (fallbackProject) {
          onForemanAccess(fallbackProject)
          return
        }
      }

      onShowToast('Invalid PIN', 'error')
      setPin('')
    } catch (err) {
      console.error('PIN validation error:', err)
      // Try fallback on exception
      try {
        const fallbackProject = await db.getProjectByPinAndCompany(pinToSubmit, company.id)
        if (fallbackProject) {
          onForemanAccess(fallbackProject)
          return
        }
      } catch (fallbackErr) {
        console.error('Fallback PIN validation also failed:', fallbackErr)
      }
      onShowToast('Error checking PIN', 'error')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  // Number pad handler
  const handleNumberPad = (num) => {
    if (pin.length < 4 && !loading) {
      const newPin = pin + num
      setPin(newPin)
      setPinState('') // Reset any error state
      if (newPin.length === 4) {
        // Optimized timing - submit immediately after slight visual feedback
        setTimeout(() => submitPin(newPin), 150)
      }
    }
  }

  const handleBackspace = () => {
    if (!loading) {
      setPin(prev => prev.slice(0, -1))
      setPinState('') // Reset any error state
    }
  }

  // Reset to company code entry
  const handleBackToCompany = () => {
    setCompany(null)
    setPin('')
    setPinState('')
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
        setJoinStep(2) // Go to office code step
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

  // Verify office code (secure server-side check)
  const verifyOfficeCode = async () => {
    if (!officeCode.trim()) {
      onShowToast('Enter office code', 'error')
      return
    }

    setLoading(true)
    try {
      // Use secure RPC function - office code never sent back to client
      const { data, error } = await supabase.rpc('verify_office_code', {
        company_id: joinCompany.id,
        code: officeCode.trim()
      })

      if (error) throw error

      if (data === true) {
        setJoinStep(3) // Go to create account step
      } else {
        onShowToast('Invalid office code', 'error')
        setOfficeCode('')
      }
    } catch (err) {
      onShowToast('Error verifying code', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle join submit - supports both new users and existing users joining additional companies
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
      const normalizedEmail = joinEmail.toLowerCase().trim()

      // Try to create a new user first
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: joinPassword
      })

      let userId

      // Check if user already exists (signUp returns error or user with identities = [])
      const userAlreadyExists = authError?.message?.includes('already registered') ||
        (authData?.user && authData.user.identities?.length === 0)

      if (userAlreadyExists) {
        // EXISTING USER - verify their password and add them to the new company
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: joinPassword
        })

        if (signInError) {
          // Password doesn't match their existing account
          onShowToast('Account exists with different password. Use your existing password.', 'error')
          setLoading(false)
          return
        }

        userId = signInData.user.id

        // Check if they're already a member of this company (any status)
        const { data: existingMembership } = await supabase
          .from('user_companies')
          .select('id, status')
          .eq('user_id', userId)
          .eq('company_id', joinCompany.id)
          .maybeSingle()

        if (existingMembership) {
          if (existingMembership.status === 'active') {
            onShowToast('You already belong to this company. Logging you in...', 'success')
            setTimeout(() => window.location.reload(), 1000)
          } else if (existingMembership.status === 'pending') {
            onShowToast('Your request is still pending approval.', 'error')
            await supabase.auth.signOut()
          } else {
            onShowToast('Your membership was removed. Contact the company admin.', 'error')
            await supabase.auth.signOut()
          }
          return
        }

        // Add existing user to new company with PENDING status
        const { error: ucError } = await supabase
          .from('user_companies')
          .insert({
            user_id: userId,
            company_id: joinCompany.id,
            role: 'member',
            status: 'pending'
          })

        if (ucError) {
          console.error('Error adding to user_companies:', ucError)
          await supabase.auth.signOut()
          throw new Error('Failed to submit join request')
        }

        // Sign out so they see the pending screen on next login
        await supabase.auth.signOut()
        onShowToast('Request to join submitted! Awaiting admin approval.', 'success')

      } else if (authError) {
        // Some other signup error
        throw authError

      } else {
        // NEW USER - signup succeeded
        userId = authData.user?.id
        if (!userId) throw new Error('Failed to create user')

        // Create user record (company_id is their first/primary company)
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: normalizedEmail,
            password_hash: 'managed_by_supabase_auth',
            name: joinName.trim(),
            company_id: joinCompany.id,
            role: 'member',
            is_active: true
          })

        if (userError) throw userError

        // Add to user_companies junction table with PENDING status
        const { error: ucError } = await supabase
          .from('user_companies')
          .insert({
            user_id: userId,
            company_id: joinCompany.id,
            role: 'member',
            status: 'pending'
          })

        if (ucError) {
          console.error('Error adding to user_companies:', ucError)
          throw new Error('Failed to submit join request')
        }

        // Sign out - they need admin approval first
        await supabase.auth.signOut()
        onShowToast('Account created! Awaiting admin approval.', 'success')
      }

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
          <Logo className="entry-logo" showPoweredBy={false} />

          <div className="entry-buttons">
            <button 
              className="entry-mode-btn foreman"
              onClick={() => setMode('foreman')}
            >
              <span className="entry-mode-icon"><HardHat size={32} /></span>
              <span className="entry-mode-title">Foreman</span>
              <span className="entry-mode-desc">Enter project PIN</span>
            </button>
            
            <button 
              className="entry-mode-btn office"
              onClick={() => setMode('office')}
            >
              <span className="entry-mode-icon"><Briefcase size={32} /></span>
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
          <div className={`pin-display ${pinState === 'error' ? 'shake' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`pin-dot ${pin.length > i ? 'filled' : ''} ${pinState}`}
              >
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

          <Logo className="entry-logo" showPoweredBy={false} />
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

    // Step 2: Enter office code
    if (joinStep === 2) {
      return (
        <div className="entry-container">
          <div className="entry-card">
            <button className="entry-back" onClick={() => { setJoinStep(1); setJoinCompany(null); setOfficeCode(''); }}>
              ←
            </button>

            <Logo className="entry-logo" showPoweredBy={false} />
            <div className="entry-company-badge">{joinCompany?.name}</div>
            <p className="entry-subtitle">Enter office code</p>
            <p className="entry-hint">This code is only for office staff</p>

            <div className="entry-input-group">
              <input
                type="password"
                value={officeCode}
                onChange={(e) => setOfficeCode(e.target.value)}
                placeholder="Office Code"
                disabled={loading}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') verifyOfficeCode()
                }}
              />
              <button
                className="entry-submit-btn"
                onClick={verifyOfficeCode}
                disabled={loading || !officeCode.trim()}
              >
                {loading ? '...' : '→'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Step 3: Create account
    return (
      <div className="entry-container">
        <div className="entry-card">
          <button className="entry-back" onClick={() => { setJoinStep(2); setOfficeCode(''); }}>
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
