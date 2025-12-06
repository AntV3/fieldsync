import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

export default function AuthPage({ onShowToast }) {
  const { signIn, signUpCompany, joinCompany } = useAuth()
  const [mode, setMode] = useState('login') // login, signup, join
  const [loading, setLoading] = useState(false)

  // Form fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCode, setCompanyCode] = useState('')
  const [promoCode, setPromoCode] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'login') {
        await signIn({ email, password })
        onShowToast('Welcome back!', 'success')
      } else if (mode === 'signup') {
        if (!companyName.trim()) {
          onShowToast('Company name is required', 'error')
          setLoading(false)
          return
        }
        await signUpCompany({ email, password, name, companyName, promoCode })
        onShowToast('Account created! Check your email to verify.', 'success')
      } else if (mode === 'join') {
        if (!companyCode.trim()) {
          onShowToast('Company code is required', 'error')
          setLoading(false)
          return
        }
        await joinCompany({ email, password, name, companyCode })
        onShowToast('Joined company! Check your email to verify.', 'success')
      }
    } catch (error) {
      onShowToast(error.message || 'An error occurred', 'error')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setName('')
    setCompanyName('')
    setCompanyCode('')
    setPromoCode('')
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>FieldSync</h1>
          <p>Construction Project Tracking</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); resetForm() }}
          >
            Login
          </button>
          <button
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); resetForm() }}
          >
            Create Company
          </button>
          <button
            className={`auth-tab ${mode === 'join' ? 'active' : ''}`}
            onClick={() => { setMode('join'); resetForm() }}
          >
            Join Company
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Name field for signup/join */}
          {(mode === 'signup' || mode === 'join') && (
            <div className="auth-field">
              <label>Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
              />
            </div>
          )}

          {/* Email */}
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          {/* Password */}
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {/* Company Name for new company */}
          {mode === 'signup' && (
            <div className="auth-field">
              <label>Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ABC Contractors"
                required
              />
            </div>
          )}

          {/* Company Code for joining */}
          {mode === 'join' && (
            <div className="auth-field">
              <label>Company Code</label>
              <input
                type="text"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                required
                maxLength={6}
              />
              <span className="auth-hint">Get this from your company admin</span>
            </div>
          )}

          {/* Promo Code for new company */}
          {mode === 'signup' && (
            <div className="auth-field">
              <label>Promo Code (Optional)</label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="PROMO2024"
              />
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? 'Please wait...' : (
              mode === 'login' ? 'Sign In' :
              mode === 'signup' ? 'Create Account' :
              'Join Company'
            )}
          </button>
        </form>

        {mode === 'signup' && (
          <div className="auth-info">
            <h4>What you get free:</h4>
            <ul>
              <li>✓ 3 users</li>
              <li>✓ 1 project</li>
              <li>✓ 30 T&M tickets/month</li>
              <li>✓ Upgrade anytime</li>
            </ul>
          </div>
        )}

        {mode === 'join' && (
          <div className="auth-info">
            <p>Ask your company admin for the 6-character code to join your team.</p>
          </div>
        )}
      </div>
    </div>
  )
}
