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

    // The recovery link establishes a session via detectSessionInUrl and
    // fires a PASSWORD_RECOVERY event. Listen for it, and also check for an
    // already-established session in case the event fired before mount.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) markReady()
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) markReady()
    })

    // If no recovery session shows up shortly, treat the link as invalid/expired.
    const timer = setTimeout(() => {
      if (!resolved) setStatus('invalid')
    }, 4000)

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
