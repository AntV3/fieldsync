import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db, supabase } from '../../lib/supabase'
import { isValidEmail, PasswordInput } from './authUtils'
import Logo from '../Logo'
import { Check, AlertTriangle, Shield, User, Briefcase } from 'lucide-react'

export default function AcceptInvite({ onShowToast }) {
  const { token } = useParams()
  const navigate = useNavigate()

  const [invitation, setInvitation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  // Form state for new users
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')

  useEffect(() => {
    loadInvitation()
    checkCurrentUser()
  }, [token])

  const loadInvitation = async () => {
    try {
      const data = await db.getInvitationByToken(token)
      if (data) {
        setInvitation(data)
      } else {
        setInvalid(true)
      }
    } catch {
      setInvalid(true)
    } finally {
      setLoading(false)
    }
  }

  const checkCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)
  }

  // Authenticated user joining directly
  const handleJoinDirect = async () => {
    setSubmitting(true)
    try {
      const result = await db.acceptInvitation(token, currentUser.id)
      if (result.success) {
        onShowToast('You have joined the company!', 'success')
        window.location.href = '/dashboard'
      } else {
        onShowToast(result.error || 'Failed to join', 'error')
      }
    } catch (error) {
      console.error('Error accepting invitation:', error)
      onShowToast(error.message || 'Error joining company', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // New user signup + accept
  const handleSignUp = async () => {
    if (!name.trim()) { onShowToast('Enter your name', 'error'); return }
    if (!isValidEmail(email)) { onShowToast('Enter a valid email', 'error'); return }
    if (password.length < 6) { onShowToast('Password must be 6+ characters', 'error'); return }

    setSubmitting(true)
    try {
      const normalizedEmail = email.toLowerCase().trim()

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password
      })

      const userAlreadyExists = authError?.message?.includes('already registered') ||
        (authData?.user && authData.user.identities?.length === 0)

      let userId

      if (userAlreadyExists) {
        // Try signing in with provided credentials
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        })

        if (signInError) {
          onShowToast('Account exists with different password. Use "Sign in instead" below.', 'error')
          setSubmitting(false)
          return
        }

        userId = signInData.user.id
      } else if (authError) {
        throw authError
      } else {
        userId = authData.user?.id
        if (!userId) throw new Error('Failed to create user')

        // Create user profile
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: normalizedEmail,
            password_hash: 'managed_by_supabase_auth',
            name: name.trim(),
            company_id: invitation.company_id,
            role: 'member',
            is_active: true
          })

        if (userError) throw userError
      }

      // Accept the invitation (auto-approves membership)
      const result = await db.acceptInvitation(token, userId)

      if (result.success) {
        await supabase.auth.signOut()
        setSuccess(true)
      } else {
        onShowToast(result.error || 'Failed to accept invitation', 'error')
        await supabase.auth.signOut()
      }
    } catch (error) {
      console.error('Signup error:', error)
      onShowToast(error.message || 'Error creating account', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Existing user sign-in + accept
  const handleSignIn = async () => {
    if (!isValidEmail(signInEmail)) { onShowToast('Enter a valid email', 'error'); return }
    if (!signInPassword) { onShowToast('Enter your password', 'error'); return }

    setSubmitting(true)
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: signInEmail.toLowerCase().trim(),
        password: signInPassword
      })

      if (signInError) {
        onShowToast('Invalid email or password', 'error')
        setSubmitting(false)
        return
      }

      const result = await db.acceptInvitation(token, signInData.user.id)

      if (result.success) {
        onShowToast('You have joined the company!', 'success')
        window.location.href = '/dashboard'
      } else {
        onShowToast(result.error || 'Failed to accept invitation', 'error')
      }
    } catch (error) {
      console.error('Sign-in error:', error)
      onShowToast(error.message || 'Error signing in', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="entry-container">
        <div className="entry-card">
          <Logo className="entry-logo" showPoweredBy={false} />
          <div className="loading">
            <div className="spinner"></div>
            Loading invitation...
          </div>
        </div>
      </div>
    )
  }

  if (invalid) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <Logo className="entry-logo" showPoweredBy={false} />
          <div className="invite-invalid">
            <AlertTriangle size={32} />
            <h2>Invalid or Expired Invitation</h2>
            <p>This invite link is no longer valid. It may have expired or already been used.</p>
            <button className="entry-login-btn" onClick={() => navigate('/login/office/join')}>
              Join with Company Code
            </button>
            <button className="entry-login-btn btn-secondary" onClick={() => navigate('/login')} style={{ marginTop: '0.5rem' }}>
              Back to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Success screen after signup
  if (success) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-scale-in">
          <div className="entry-success-icon">
            <Check size={32} />
          </div>
          <h2 className="entry-success-title">You're In!</h2>
          <p className="entry-success-message">
            You've joined <strong>{invitation.companies?.name}</strong>.
            Sign in to get started.
          </p>
          <button
            className="entry-login-btn"
            onClick={() => navigate('/login/office')}
            style={{ marginTop: '1.5rem' }}
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  const companyName = invitation.companies?.name || 'this company'

  // Already authenticated — show simple join button
  if (currentUser) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <Logo className="entry-logo" showPoweredBy={false} />
          <div className="entry-company-badge">{companyName}</div>
          <p className="entry-subtitle">You've been invited to join</p>

          <div className="invite-role-preview">
            {invitation.invited_company_role && (
              <span className="access-badge role"><Briefcase size={12} /> {invitation.invited_company_role}</span>
            )}
            <span className={`access-badge ${invitation.invited_access_level === 'administrator' ? 'admin' : 'member'}`}>
              {invitation.invited_access_level === 'administrator'
                ? <><Shield size={12} /> Administrator</>
                : <><User size={12} /> Member</>
              }
            </span>
          </div>

          <button
            className="entry-login-btn"
            onClick={handleJoinDirect}
            disabled={submitting}
            style={{ marginTop: '1.5rem' }}
          >
            {submitting ? 'Joining...' : `Join ${companyName}`}
          </button>
          <button
            className="entry-login-btn btn-secondary"
            onClick={() => navigate('/dashboard')}
            style={{ marginTop: '0.5rem' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Not authenticated — show signup / sign-in form
  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <Logo className="entry-logo" showPoweredBy={false} />
        <div className="entry-company-badge">{companyName}</div>
        <p className="entry-subtitle">You've been invited to join</p>

        <div className="invite-role-preview">
          {invitation.invited_company_role && (
            <span className="access-badge role"><Briefcase size={12} /> {invitation.invited_company_role}</span>
          )}
          <span className={`access-badge ${invitation.invited_access_level === 'administrator' ? 'admin' : 'member'}`}>
            {invitation.invited_access_level === 'administrator'
              ? <><Shield size={12} /> Administrator</>
              : <><User size={12} /> Member</>
            }
          </span>
        </div>

        {!showSignIn ? (
          <>
            <div className="entry-form">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your Name"
                autoFocus
              />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                className={email && !isValidEmail(email) ? 'input-error' : ''}
              />
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password (6+ characters)"
                onKeyDown={e => { if (e.key === 'Enter') handleSignUp() }}
                showStrength={true}
              />
              <button
                className="entry-login-btn"
                onClick={handleSignUp}
                disabled={submitting || !name.trim() || !isValidEmail(email) || password.length < 6}
              >
                {submitting ? (
                  <span className="btn-loading">
                    <div className="spinner-small" />
                    Creating account...
                  </span>
                ) : 'Create Account & Join'}
              </button>
            </div>
            <p className="entry-join-note">
              Already have an account?{' '}
              <button className="entry-link-btn" onClick={() => setShowSignIn(true)}>
                Sign in instead
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="entry-form">
              <input
                type="email"
                value={signInEmail}
                onChange={e => setSignInEmail(e.target.value)}
                placeholder="Email"
                autoFocus
              />
              <PasswordInput
                value={signInPassword}
                onChange={e => setSignInPassword(e.target.value)}
                placeholder="Password"
                onKeyDown={e => { if (e.key === 'Enter') handleSignIn() }}
              />
              <button
                className="entry-login-btn"
                onClick={handleSignIn}
                disabled={submitting || !isValidEmail(signInEmail) || !signInPassword}
              >
                {submitting ? (
                  <span className="btn-loading">
                    <div className="spinner-small" />
                    Signing in...
                  </span>
                ) : 'Sign In & Join'}
              </button>
            </div>
            <p className="entry-join-note">
              Don't have an account?{' '}
              <button className="entry-link-btn" onClick={() => setShowSignIn(false)}>
                Create one
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
