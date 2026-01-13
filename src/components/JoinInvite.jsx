import { useState, useEffect } from 'react'
import { isSupabaseConfigured, supabase, db, auth } from '../lib/supabase'
import Logo from './Logo'

export default function JoinInvite({ token, user, onComplete, onShowToast }) {
  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)
  const [accepting, setAccepting] = useState(false)

  // Auth form state (if not logged in)
  const [authMode, setAuthMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    loadInvite()
  }, [token])

  const loadInvite = async () => {
    if (!isSupabaseConfigured) {
      setError('System not configured')
      setLoading(false)
      return
    }

    try {
      const inviteData = await db.getInviteByToken(token)

      if (!inviteData || !inviteData.valid) {
        setError(inviteData?.error || 'Invalid invite link')
        setLoading(false)
        return
      }

      setInvite(inviteData)

      // Pre-fill email if available
      if (inviteData.email) {
        setEmail(inviteData.email)
      }
    } catch (err) {
      console.error('Error loading invite:', err)
      setError('Failed to load invite')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptInvite = async () => {
    if (!user) {
      onShowToast('Please sign in first', 'error')
      return
    }

    setAccepting(true)
    try {
      const result = await db.acceptInviteToken(token, user.id)

      if (result?.success) {
        onComplete(result)
      } else {
        onShowToast(result?.error || 'Failed to accept invite', 'error')
      }
    } catch (err) {
      console.error('Error accepting invite:', err)
      onShowToast(err.message || 'Failed to accept invite', 'error')
    } finally {
      setAccepting(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        onShowToast(error.message, 'error')
        return
      }

      // After login, accept the invite
      const result = await db.acceptInviteToken(token, data.user.id)

      if (result?.success) {
        onComplete(result)
      } else {
        onShowToast(result?.error || 'Failed to accept invite', 'error')
      }
    } catch (err) {
      console.error('Login error:', err)
      onShowToast('Login failed', 'error')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()

    if (!name.trim()) {
      onShowToast('Please enter your name', 'error')
      return
    }

    setAuthLoading(true)

    try {
      // Create auth account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name }
        }
      })

      if (error) {
        onShowToast(error.message, 'error')
        return
      }

      if (!data.user) {
        onShowToast('Check your email to confirm your account', 'info')
        return
      }

      // Create user record
      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          email: email.toLowerCase(),
          name: name.trim()
        })

      if (userError && !userError.message.includes('duplicate')) {
        console.error('User record error:', userError)
      }

      // Accept the invite
      const result = await db.acceptInviteToken(token, data.user.id)

      if (result?.success) {
        onShowToast('Account created! Welcome to the team.', 'success')
        onComplete(result)
      } else {
        onShowToast(result?.error || 'Failed to accept invite', 'error')
      }
    } catch (err) {
      console.error('Signup error:', err)
      onShowToast('Signup failed', 'error')
    } finally {
      setAuthLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="join-invite loading">
        <Logo className="join-logo" />
        <div className="spinner"></div>
        <p>Loading invite...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="join-invite error-state">
        <Logo className="join-logo" />
        <div className="invite-error">
          <h2>Invalid Invite</h2>
          <p>{error}</p>
          <p className="error-help">
            This invite link may have expired or already been used.
            Please ask your administrator for a new invite.
          </p>
          <a href="/" className="btn btn-primary">
            Go to Home
          </a>
        </div>
      </div>
    )
  }

  // User is already logged in
  if (user) {
    return (
      <div className="join-invite">
        <Logo className="join-logo" />
        <div className="invite-card">
          <h2>You're Invited!</h2>
          <p className="invite-company">
            Join <strong>{invite.company_name}</strong>
          </p>
          <div className="invite-details">
            <div className="detail-row">
              <span className="label">Role:</span>
              <span className="value">{invite.access_level === 'administrator' ? 'Administrator' : invite.access_level === 'office' ? 'Office Staff' : 'Field Worker'}</span>
            </div>
            <div className="detail-row">
              <span className="label">Signed in as:</span>
              <span className="value">{user.email}</span>
            </div>
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={handleAcceptInvite}
            disabled={accepting}
          >
            {accepting ? 'Joining...' : 'Accept & Join'}
          </button>

          <p className="invite-note">
            By accepting, you'll join {invite.company_name} and gain access to their projects.
          </p>
        </div>
      </div>
    )
  }

  // User needs to login or signup
  return (
    <div className="join-invite">
      <Logo className="join-logo" />
      <div className="invite-card">
        <h2>You're Invited!</h2>
        <p className="invite-company">
          Join <strong>{invite.company_name}</strong>
        </p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => setAuthMode('login')}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`}
            onClick={() => setAuthMode('signup')}
          >
            Create Account
          </button>
        </div>

        {authMode === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={authLoading}
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                disabled={authLoading}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={authLoading}
            >
              {authLoading ? 'Signing in...' : 'Sign In & Join'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="auth-form">
            <div className="form-group">
              <label>Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
                disabled={authLoading}
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={authLoading}
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                minLength={6}
                required
                disabled={authLoading}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={authLoading}
            >
              {authLoading ? 'Creating account...' : 'Create Account & Join'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
