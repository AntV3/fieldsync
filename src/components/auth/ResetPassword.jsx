import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../Logo'
import { supabase } from '../../lib/supabase'

export default function ResetPassword({ onShowToast }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 'checking' | 'ready' | 'invalid'
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    if (!supabase) {
      setStatus('invalid')
      return
    }

    let resolved = false
    const markReady = () => {
      resolved = true
      setStatus('ready')
    }

    // Only unlock the form if this page was reached via a recovery link, not
    // because the user happens to be signed in. Supabase places the recovery
    // token in the URL hash (type=recovery) before detectSessionInUrl fires
    // the PASSWORD_RECOVERY event and clears the hash. If neither is present,
    // an existing session is a normal login, which must not silently bypass
    // the email-ownership check.
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    const hasRecoveryHash = /(^|&|#)type=recovery(&|$)/.test(hash)

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') markReady()
    })

    if (hasRecoveryHash) {
      // Recovery token was in the URL; the event will fire once the session lands.
      // If detectSessionInUrl already consumed the hash before this effect ran,
      // an active session is safe to treat as the recovery session.
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session) markReady()
      })
    }

    // Give the recovery-session handshake enough time even on slow connections.
    const timer = setTimeout(() => {
      if (!resolved) setStatus('invalid')
    }, 15000)

    return () => {
      sub?.subscription?.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  const handleSubmit = async () => {
    if (!password || !confirm) {
      onShowToast('Enter and confirm your new password', 'error')
      return
    }
    if (password.length < 8) {
      onShowToast('Password must be at least 8 characters', 'error')
      return
    }
    if (password !== confirm) {
      onShowToast('Passwords do not match', 'error')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      onShowToast('Password updated. You are now signed in.', 'success')
      navigate('/dashboard')
    } catch (err) {
      console.error('Error updating password:', err)
      onShowToast(err.message || 'Failed to update password', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'checking') {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <Logo className="entry-logo" showPoweredBy={false} />
          <p className="entry-subtitle">Verifying your reset link…</p>
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <Logo className="entry-logo" showPoweredBy={false} />
          <p className="entry-subtitle">Reset link expired</p>
          <p className="entry-confirm-text">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <button className="entry-login-btn" onClick={() => navigate('/forgot-password')}>
            Request New Link
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <Logo className="entry-logo" showPoweredBy={false} />
        <p className="entry-subtitle">Choose a new password</p>

        <div className="entry-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (8+ characters)"
            autoFocus
            autoComplete="new-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
          />
          <button
            className="entry-login-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  )
}
