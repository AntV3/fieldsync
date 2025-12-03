import { useState } from 'react'
import { auth } from '../lib/supabase'

export default function Login({ onLogin, onShowToast, onBack }) {
  const [mode, setMode] = useState('signin') // 'signin' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignIn = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await auth.signIn(email, password)
      const profile = await auth.getProfile()
      onLogin(profile)
    } catch (error) {
      console.error('Sign in error:', error)
      onShowToast(error.message || 'Failed to sign in', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await auth.signUp(email, password, fullName, 'office')
      const profile = await auth.getProfile()
      if (profile) {
        onLogin(profile)
      } else {
        onShowToast('Account created! Please check your email to confirm.', 'success')
        setMode('signin')
      }
    } catch (error) {
      console.error('Sign up error:', error)
      onShowToast(error.message || 'Failed to create account', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>

        <div className="login-header">
          <div className="login-logo">Field<span>Sync</span></div>
          <div className="selected-role">📊 Office</div>
          <p className="login-subtitle">
            {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
          </p>
        </div>

        <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
          {mode === 'signup' && (
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="John Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? 'Please wait...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="login-footer">
          {mode === 'signin' ? (
            <p>
              Don't have an account?{' '}
              <button className="link-btn" onClick={() => setMode('signup')}>
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button className="link-btn" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
