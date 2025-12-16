import { useState } from 'react'
import { db, supabase } from '../lib/supabase'

export default function OfficeLogin({ onLogin, onShowToast }) {
  const [step, setStep] = useState('verify') // 'verify' or 'auth'
  const [loading, setLoading] = useState(false)

  // Step 1: Company verification
  const [companyName, setCompanyName] = useState('')
  const [officePin, setOfficePin] = useState('')
  const [verifiedCompany, setVerifiedCompany] = useState(null)

  // Step 2: Auth (signup or login)
  const [authMode, setAuthMode] = useState('login') // 'login' or 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // ============================================
  // Step 1: Verify Company + Office PIN
  // ============================================

  const handleVerifyCompany = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const company = await db.verifyCompanyOfficePin(
        companyName.trim(),
        officePin.trim()
      )

      if (!company) {
        onShowToast?.('Invalid company name or office PIN', 'error')
        setLoading(false)
        return
      }

      // Success! Move to auth step
      setVerifiedCompany(company)
      setStep('auth')
      onShowToast?.(`Welcome to ${company.name}!`, 'success')
    } catch (error) {
      console.error('Error verifying company:', error)
      onShowToast?.('Error verifying company', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Step 2a: Create New Account
  // ============================================

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await db.createOfficeUser({
        company_id: verifiedCompany.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password,
        role: 'office'
      })

      if (result.success) {
        onShowToast?.('Account created! Logging you in...', 'success')
        // Auto-login after signup
        await handleLoginAfterSignup(email, password)
      } else {
        onShowToast?.(result.error || 'Failed to create account', 'error')
      }
    } catch (error) {
      console.error('Error creating account:', error)
      onShowToast?.('Failed to create account', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Step 2b: Login Existing User
  // ============================================

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password
      })

      if (error) {
        onShowToast?.(error.message || 'Invalid email or password', 'error')
        setLoading(false)
        return
      }

      // Get user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*, companies(*)')
        .eq('id', data.user.id)
        .single()

      if (userError || !userData) {
        onShowToast?.('Error loading profile', 'error')
        setLoading(false)
        return
      }

      // Verify user belongs to verified company
      if (userData.company_id !== verifiedCompany.id) {
        await supabase.auth.signOut()
        onShowToast?.('This account belongs to a different company', 'error')
        setLoading(false)
        return
      }

      // Success!
      onLogin?.(userData, userData.companies)
    } catch (error) {
      console.error('Error logging in:', error)
      onShowToast?.('Failed to log in', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleLoginAfterSignup = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    })

    if (error) {
      onShowToast?.('Account created but auto-login failed. Please sign in.', 'error')
      setAuthMode('login')
      return
    }

    const { data: userData } = await supabase
      .from('users')
      .select('*, companies(*)')
      .eq('id', data.user.id)
      .single()

    if (userData) {
      onLogin?.(userData, userData.companies)
    }
  }

  // ============================================
  // RENDER: Step 1 - Verify Company
  // ============================================

  if (step === 'verify') {
    return (
      <div className="login-container">
        <div className="login-card">
          <a href="/register" className="small-register-link">
            New company? Register here
          </a>
          <div className="login-header">
            <h1>FieldSync</h1>
            <h2>Office Dashboard</h2>
            <p>Enter your company information to continue</p>
          </div>

          <form onSubmit={handleVerifyCompany} className="login-form">
            <div className="form-group">
              <label>Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., GGG Construction"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Company Office PIN</label>
              <input
                type="password"
                value={officePin}
                onChange={(e) => setOfficePin(e.target.value)}
                placeholder="••••"
                maxLength={6}
                required
                disabled={loading}
              />
              <small>Contact your company admin for this PIN</small>
            </div>

            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Continue'}
            </button>
          </form>

          <div className="login-footer">
            <p>
              Field worker? <a href="/field">Enter here</a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Step 2 - Signup or Login
  // ============================================

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>FieldSync</h1>
          <h2>{verifiedCompany?.name}</h2>
          <p className="verified-badge">✓ Company Verified</p>
        </div>

        {/* Toggle between Signup and Login */}
        <div className="auth-mode-toggle">
          <button
            className={authMode === 'signup' ? 'active' : ''}
            onClick={() => setAuthMode('signup')}
            type="button"
          >
            New User
          </button>
          <button
            className={authMode === 'login' ? 'active' : ''}
            onClick={() => setAuthMode('login')}
            type="button"
          >
            Existing User
          </button>
        </div>

        {/* SIGNUP FORM */}
        {authMode === 'signup' && (
          <form onSubmit={handleSignup} className="login-form">
            <div className="form-group">
              <label>Your Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
                disabled={loading}
              />
              <small>At least 6 characters</small>
            </div>

            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* LOGIN FORM */}
        {authMode === 'login' && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@company.com"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={loading}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}

        <div className="login-footer">
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              setStep('verify')
              setVerifiedCompany(null)
              setEmail('')
              setPassword('')
              setName('')
            }}
          >
            ← Back to company verification
          </button>
        </div>
      </div>
    </div>
  )
}
