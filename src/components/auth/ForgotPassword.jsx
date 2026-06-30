import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import Logo from '../Logo'
import { supabase } from '../../lib/supabase'

export default function ForgotPassword({ onShowToast }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      onShowToast('Enter your email', 'error')
      return
    }
    if (!supabase) {
      onShowToast('Password reset is unavailable in demo mode', 'error')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) throw error
      // Always show success — don't reveal whether an account exists.
      setSent(true)
    } catch (err) {
      console.error('Error sending reset email:', err)
      // Still show the neutral success state to avoid account enumeration.
      setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <Logo className="entry-logo" showPoweredBy={false} />
          <div className="entry-confirm-icon">
            <MailCheck size={40} />
          </div>
          <p className="entry-subtitle">Check your email</p>
          <p className="entry-confirm-text">
            If an account exists for <strong>{email.trim().toLowerCase()}</strong>, we&apos;ve sent a
            link to reset your password. The link expires after a short time, so use it soon.
          </p>
          <button className="entry-login-btn" onClick={() => navigate('/login/office')}>
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <button className="entry-back" onClick={() => navigate('/login/office')}>
          <ArrowLeft size={20} />
        </button>

        <Logo className="entry-logo" showPoweredBy={false} />
        <p className="entry-subtitle">Reset your password</p>

        <div className="entry-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            autoComplete="email"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
          />
          <button
            className="entry-login-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send Reset Link'}
          </button>
        </div>

        <div className="entry-signup-hint">
          <p>Remembered it?</p>
          <div className="entry-signup-options">
            <button className="entry-join-link" onClick={() => navigate('/login/office')}>
              <span>Back to Sign In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
