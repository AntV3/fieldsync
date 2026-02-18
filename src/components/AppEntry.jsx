import { useState, useEffect, useRef } from 'react'
import { HardHat, Briefcase, Building2, UserPlus, Eye, EyeOff, Check, ChevronRight, ArrowLeft } from 'lucide-react'
import { db, supabase } from '../lib/supabase'
import Logo from './Logo'

// Password strength calculator
function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '' }
  let score = 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++

  if (score <= 1) return { score: 1, label: 'Weak', color: 'var(--accent-red)' }
  if (score <= 2) return { score: 2, label: 'Fair', color: 'var(--accent-orange)' }
  if (score <= 3) return { score: 3, label: 'Good', color: 'var(--accent-amber)' }
  if (score <= 4) return { score: 4, label: 'Strong', color: 'var(--accent-green)' }
  return { score: 5, label: 'Very strong', color: 'var(--accent-green)' }
}

// Generate random alphanumeric code
function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Excluding confusing chars (0/O, 1/I/L)
  const array = new Uint32Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, v => chars[v % chars.length]).join('')
}

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Step indicator component
function StepIndicator({ steps, currentStep }) {
  return (
    <div className="onboarding-step-indicator">
      {steps.map((label, i) => {
        const stepNum = i + 1
        const isActive = stepNum === currentStep
        const isCompleted = stepNum < currentStep
        return (
          <div key={i} className="onboarding-step-wrapper">
            {i > 0 && (
              <div className={`onboarding-step-line ${isCompleted ? 'completed' : ''}`} />
            )}
            <div className={`onboarding-step-circle ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {isCompleted ? <Check size={14} /> : stepNum}
            </div>
            <span className={`onboarding-step-label ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Password input with strength bar and visibility toggle
function PasswordInput({ value, onChange, placeholder, onKeyDown, autoFocus, showStrength }) {
  const [visible, setVisible] = useState(false)
  const strength = getPasswordStrength(value)

  return (
    <div className="password-field">
      <div className="password-input-wrapper">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder || 'Password'}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible(!visible)}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {showStrength && value && (
        <div className="password-strength">
          <div className="password-strength-bar">
            <div
              className="password-strength-fill"
              style={{
                width: `${(strength.score / 5) * 100}%`,
                background: strength.color
              }}
            />
          </div>
          <span className="password-strength-label" style={{ color: strength.color }}>
            {strength.label}
          </span>
        </div>
      )}
    </div>
  )
}

export default function AppEntry({ onForemanAccess, onOfficeLogin, onShowToast }) {
  const [mode, setMode] = useState(null) // null, 'foreman', 'office', 'join', 'register'

  // Foreman state
  const [companyCode, setCompanyCode] = useState('')
  const [company, setCompany] = useState(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [pinState, setPinState] = useState('') // '', 'error', 'success'

  // Refs for timeout cleanup to prevent memory leaks
  const pinResetTimeoutRef = useRef(null)
  const pinSubmitTimeoutRef = useRef(null)

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (pinResetTimeoutRef.current) clearTimeout(pinResetTimeoutRef.current)
      if (pinSubmitTimeoutRef.current) clearTimeout(pinSubmitTimeoutRef.current)
    }
  }, [])

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
  const [joinSuccess, setJoinSuccess] = useState(false) // Show success screen after join

  // Register state
  const [registerStep, setRegisterStep] = useState(1) // 1: company info, 2: admin account, 3: success
  const [registerCompanyName, setRegisterCompanyName] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [createdCompany, setCreatedCompany] = useState(null) // Stores created company info

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
        if (pinResetTimeoutRef.current) clearTimeout(pinResetTimeoutRef.current)
        pinResetTimeoutRef.current = setTimeout(() => {
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
        const fallbackProject = await db.getProjectByPinAndCompany(pinToSubmit, company.id)
        if (fallbackProject) {
          onForemanAccess(fallbackProject)
          return
        }
      }

      onShowToast('Invalid PIN', 'error')
      setPin('')
    } catch (err) {
      // Try fallback on exception
      try {
        const fallbackProject = await db.getProjectByPinAndCompany(pinToSubmit, company.id)
        if (fallbackProject) {
          onForemanAccess(fallbackProject)
          return
        }
      } catch (fallbackErr) {
        // Fallback also failed, silent failure
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
        if (pinSubmitTimeoutRef.current) clearTimeout(pinSubmitTimeoutRef.current)
        pinSubmitTimeoutRef.current = setTimeout(() => submitPin(newPin), 150)
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
    if (loading) return
    if (!joinName.trim()) {
      onShowToast('Enter your name', 'error')
      return
    }
    if (!joinEmail.trim() || !isValidEmail(joinEmail)) {
      onShowToast('Enter a valid email address', 'error')
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
        setJoinSuccess(true)

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
        setJoinSuccess(true)
      }

    } catch (err) {
      console.error('Join error:', err)
      onShowToast(err.message || 'Error creating account', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle company registration
  const handleRegisterCompany = async () => {
    if (loading) return
    if (!registerName.trim()) {
      onShowToast('Enter your name', 'error')
      return
    }
    if (!registerEmail.trim() || !isValidEmail(registerEmail)) {
      onShowToast('Enter a valid email address', 'error')
      return
    }
    if (registerPassword.length < 6) {
      onShowToast('Password must be 6+ characters', 'error')
      return
    }

    setLoading(true)
    try {
      const normalizedEmail = registerEmail.toLowerCase().trim()
      const companyCodeGenerated = generateCode(6)
      const officeCodeGenerated = generateCode(6)

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: registerPassword
      })

      if (authError) {
        if (authError.message?.includes('already registered')) {
          onShowToast('An account with this email already exists. Sign in instead.', 'error')
        } else {
          throw authError
        }
        return
      }

      const userId = authData.user?.id
      if (!userId) throw new Error('Failed to create account')

      // Create company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: registerCompanyName.trim(),
          code: companyCodeGenerated,
          office_code: officeCodeGenerated,
          subscription_tier: 'free',
          owner_user_id: userId
        })
        .select()
        .single()

      if (companyError) {
        console.error('Company creation error:', companyError)
        throw new Error('Failed to create company. Please try again.')
      }

      // Create user record
      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: normalizedEmail,
          password_hash: 'managed_by_supabase_auth',
          name: registerName.trim(),
          company_id: companyData.id,
          role: 'admin',
          is_active: true
        })

      if (userError) {
        console.error('User record error:', userError)
        throw new Error('Failed to set up user profile')
      }

      // Add to user_companies as active administrator
      const { error: ucError } = await supabase
        .from('user_companies')
        .insert({
          user_id: userId,
          company_id: companyData.id,
          role: 'admin',
          access_level: 'administrator',
          status: 'active'
        })

      if (ucError) {
        console.error('User-company link error:', ucError)
        throw new Error('Failed to link account to company')
      }

      // Store the created company info for the success screen
      setCreatedCompany({
        name: companyData.name,
        code: companyCodeGenerated,
        officeCode: officeCodeGenerated
      })
      setRegisterStep(3) // Go to success screen

    } catch (err) {
      console.error('Registration error:', err)
      onShowToast(err.message || 'Error creating company', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Reset all join state when switching modes
  const resetJoinState = () => {
    setJoinStep(1)
    setJoinCompany(null)
    setOfficeCode('')
    setJoinName('')
    setJoinEmail('')
    setJoinPassword('')
    setJoinSuccess(false)
    setCompanyCode('')
  }

  // Reset all register state when switching modes
  const resetRegisterState = () => {
    setRegisterStep(1)
    setRegisterCompanyName('')
    setRegisterName('')
    setRegisterEmail('')
    setRegisterPassword('')
    setCreatedCompany(null)
  }

  // Initial selection screen
  if (mode === null) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in-up">
          <Logo className="entry-logo" showPoweredBy={false} />

          <div className="entry-buttons stagger-children">
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
          <div className="entry-card animate-fade-in">
            <button className="entry-back" onClick={() => setMode(null)}>
              <ArrowLeft size={20} />
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
                {loading ? <div className="spinner-small" /> : <ChevronRight size={20} />}
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Step 2: PIN entry
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <button className="entry-back" onClick={handleBackToCompany}>
            <ArrowLeft size={20} />
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
          <div className="number-pad" role="group" aria-label="PIN entry keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                className="num-btn"
                onClick={() => handleNumberPad(num.toString())}
                disabled={loading}
                aria-label={String(num)}
              >
                {num}
              </button>
            ))}
            <button className="num-btn empty" disabled aria-hidden="true"></button>
            <button
              className="num-btn"
              onClick={() => handleNumberPad('0')}
              disabled={loading}
              aria-label="0"
            >
              0
            </button>
            <button
              className="num-btn backspace"
              onClick={handleBackspace}
              disabled={loading || pin.length === 0}
              aria-label="Delete last digit"
            >
              <ArrowLeft size={18} />
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
        <div className="entry-card animate-fade-in">
          <button className="entry-back" onClick={() => setMode(null)}>
            <ArrowLeft size={20} />
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
            <div className="entry-signup-options">
              <button className="entry-join-link" onClick={() => { resetJoinState(); setMode('join') }}>
                <UserPlus size={16} />
                <span>Join your company</span>
              </button>
              <button className="entry-join-link" onClick={() => { resetRegisterState(); setMode('register') }}>
                <Building2 size={16} />
                <span>Register a new company</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Join Company flow
  if (mode === 'join') {
    // Success screen after joining
    if (joinSuccess) {
      return (
        <div className="entry-container">
          <div className="entry-card animate-scale-in">
            <div className="entry-success-icon">
              <Check size={32} />
            </div>
            <h2 className="entry-success-title">Request Submitted</h2>
            <p className="entry-success-message">
              Your request to join <strong>{joinCompany?.name}</strong> has been submitted.
              A company admin will review and approve your access.
            </p>
            <p className="entry-success-detail">
              You'll be able to sign in once approved.
            </p>
            <button
              className="entry-login-btn"
              onClick={() => {
                resetJoinState()
                setMode('office')
              }}
              style={{ marginTop: '1.5rem' }}
            >
              Back to Sign In
            </button>
          </div>
        </div>
      )
    }

    // Step 1: Enter company code
    if (joinStep === 1) {
      return (
        <div className="entry-container">
          <div className="entry-card animate-fade-in">
            <button className="entry-back" onClick={() => { resetJoinState(); setMode('office') }}>
              <ArrowLeft size={20} />
            </button>

            <Logo className="entry-logo" showPoweredBy={false} />
            <StepIndicator steps={['Company', 'Verify', 'Account']} currentStep={1} />
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
                {loading ? <div className="spinner-small" /> : <ChevronRight size={20} />}
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
          <div className="entry-card animate-fade-in">
            <button className="entry-back" onClick={() => { setJoinStep(1); setJoinCompany(null); setOfficeCode(''); }}>
              <ArrowLeft size={20} />
            </button>

            <Logo className="entry-logo" showPoweredBy={false} />
            <StepIndicator steps={['Company', 'Verify', 'Account']} currentStep={2} />
            <div className="entry-company-badge">{joinCompany?.name}</div>
            <p className="entry-subtitle">Enter office code</p>
            <p className="entry-hint">This verifies your office access</p>

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
                {loading ? <div className="spinner-small" /> : <ChevronRight size={20} />}
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Step 3: Create account
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <button className="entry-back" onClick={() => { setJoinStep(2); setOfficeCode(''); }}>
            <ArrowLeft size={20} />
          </button>

          <Logo className="entry-logo" showPoweredBy={false} />
          <StepIndicator steps={['Company', 'Verify', 'Account']} currentStep={3} />
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
              className={joinEmail && !isValidEmail(joinEmail) ? 'input-error' : ''}
            />
            <PasswordInput
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              placeholder="Password (6+ characters)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinSubmit()
              }}
              showStrength={true}
            />
            <button
              className="entry-login-btn"
              onClick={handleJoinSubmit}
              disabled={loading || !joinName.trim() || !isValidEmail(joinEmail) || joinPassword.length < 6}
            >
              {loading ? (
                <span className="btn-loading">
                  <div className="spinner-small" />
                  Creating account...
                </span>
              ) : 'Join Company'}
            </button>
          </div>

          <p className="entry-join-note">
            You'll join as a team member. Your admin can update your role.
          </p>
        </div>
      </div>
    )
  }

  // Register Company flow
  if (mode === 'register') {
    // Step 3: Success
    if (registerStep === 3 && createdCompany) {
      return (
        <div className="entry-container">
          <div className="entry-card entry-card-wide animate-scale-in">
            <div className="entry-success-icon">
              <Check size={32} />
            </div>
            <h2 className="entry-success-title">Company Created</h2>
            <p className="entry-success-message">
              <strong>{createdCompany.name}</strong> is ready to go.
              Save these codes to share with your team.
            </p>

            <div className="entry-codes-grid">
              <div className="entry-code-card">
                <span className="entry-code-label">Company Code</span>
                <span className="entry-code-value">{createdCompany.code}</span>
                <span className="entry-code-hint">Share with all employees</span>
              </div>
              <div className="entry-code-card">
                <span className="entry-code-label">Office Code</span>
                <span className="entry-code-value">{createdCompany.officeCode}</span>
                <span className="entry-code-hint">Office staff only</span>
              </div>
            </div>

            <p className="entry-codes-warning">
              Save these codes now. You can also find them in your company settings later.
            </p>

            <button
              className="entry-login-btn"
              onClick={() => {
                // Reload the app to sign them in
                window.location.reload()
              }}
              style={{ marginTop: '0.5rem' }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )
    }

    // Step 1: Company info
    if (registerStep === 1) {
      return (
        <div className="entry-container">
          <div className="entry-card animate-fade-in">
            <button className="entry-back" onClick={() => { resetRegisterState(); setMode('office') }}>
              <ArrowLeft size={20} />
            </button>

            <Logo className="entry-logo" showPoweredBy={false} />
            <StepIndicator steps={['Company', 'Your Account']} currentStep={1} />
            <p className="entry-subtitle">Register your company</p>
            <p className="entry-hint">Set up your company on FieldSync</p>

            <div className="entry-form">
              <input
                type="text"
                value={registerCompanyName}
                onChange={(e) => setRegisterCompanyName(e.target.value)}
                placeholder="Company Name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && registerCompanyName.trim()) {
                    setRegisterStep(2)
                  }
                }}
              />
              <button
                className="entry-login-btn"
                onClick={() => setRegisterStep(2)}
                disabled={!registerCompanyName.trim()}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Step 2: Admin account
    if (registerStep === 2) {
      return (
        <div className="entry-container">
          <div className="entry-card animate-fade-in">
            <button className="entry-back" onClick={() => setRegisterStep(1)}>
              <ArrowLeft size={20} />
            </button>

            <Logo className="entry-logo" showPoweredBy={false} />
            <StepIndicator steps={['Company', 'Your Account']} currentStep={2} />
            <div className="entry-company-badge">{registerCompanyName}</div>
            <p className="entry-subtitle">Create your admin account</p>

            <div className="entry-form">
              <input
                type="text"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="Your Name"
                autoFocus
              />
              <input
                type="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="Email"
                className={registerEmail && !isValidEmail(registerEmail) ? 'input-error' : ''}
              />
              <PasswordInput
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Password (6+ characters)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRegisterCompany()
                }}
                showStrength={true}
              />
              <button
                className="entry-login-btn"
                onClick={handleRegisterCompany}
                disabled={loading || !registerName.trim() || !isValidEmail(registerEmail) || registerPassword.length < 6}
              >
                {loading ? (
                  <span className="btn-loading">
                    <div className="spinner-small" />
                    Setting up company...
                  </span>
                ) : 'Create Company'}
              </button>
            </div>

            <p className="entry-join-note">
              You'll be the administrator. Company and office codes will be generated for you.
            </p>
          </div>
        </div>
      )
    }
  }
}
