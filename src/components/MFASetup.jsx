import { useState, useEffect } from 'react'
import { Shield, ShieldCheck, ShieldOff, Copy, Check, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function MFASetup({ onShowToast, onClose }) {
  const [step, setStep] = useState('loading')
  const [factors, setFactors] = useState([])
  const [qrCode, setQrCode] = useState(null)
  const [secret, setSecret] = useState(null)
  const [factorId, setFactorId] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadFactors()
  }, [])

  const loadFactors = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      const totpFactors = (data?.totp || []).filter(f => f.status === 'verified')
      setFactors(totpFactors)
      setStep('overview')
    } catch {
      setStep('overview')
    }
  }

  const startEnrollment = async () => {
    setError(null)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'FieldSync Authenticator'
      })
      if (error) throw error
      if (!data?.totp) throw new Error('MFA enrollment response missing TOTP data')
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
      setStep('enroll')
    } catch (err) {
      setError(err.message)
      onShowToast?.('Failed to start MFA enrollment', 'error')
    }
  }

  const verifyEnrollment = async () => {
    if (verifyCode.length !== 6) return
    setVerifying(true)
    setError(null)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode
      })
      if (verifyError) throw verifyError

      setStep('success')
      onShowToast?.('MFA enabled successfully!', 'success')
      await loadFactors()
    } catch {
      setError('Invalid code. Please try again.')
      setVerifyCode('')
    } finally {
      setVerifying(false)
    }
  }

  const unenroll = async (id) => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
      if (error) throw error
      onShowToast?.('MFA disabled', 'success')
      await loadFactors()
    } catch {
      onShowToast?.('Failed to disable MFA', 'error')
    }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isEnabled = factors.length > 0

  return (
    <div className="mfa-setup">
      <div className="mfa-header">
        <div className="mfa-title">
          {isEnabled ? <ShieldCheck size={20} className="text-success" /> : <Shield size={20} />}
          <h3>Two-Factor Authentication</h3>
        </div>
        {onClose && (
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        )}
      </div>

      {step === 'loading' && (
        <div className="mfa-loading"><Loader2 size={24} className="spinner" /> Loading...</div>
      )}

      {step === 'overview' && (
        <div className="mfa-overview">
          <p className="mfa-description">
            Add an extra layer of security to your account. When enabled, you will need to enter
            a code from your authenticator app each time you sign in.
          </p>
          {isEnabled ? (
            <div className="mfa-status mfa-status-enabled">
              <ShieldCheck size={18} />
              <span>MFA is enabled</span>
              <button className="btn btn-ghost btn-small" onClick={() => unenroll(factors[0].id)}>
                <ShieldOff size={14} /> Disable
              </button>
            </div>
          ) : (
            <div className="mfa-status mfa-status-disabled">
              <ShieldOff size={18} />
              <span>MFA is not enabled</span>
              <button className="btn btn-primary btn-small" onClick={startEnrollment}>
                <Shield size={14} /> Enable MFA
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'enroll' && (
        <div className="mfa-enroll">
          <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password):</p>
          {qrCode && (
            <div className="mfa-qr-container">
              <img src={qrCode} alt="MFA QR Code" className="mfa-qr" />
            </div>
          )}
          <div className="mfa-secret">
            <span className="mfa-secret-label">Or enter this key manually:</span>
            <div className="mfa-secret-value">
              <code>{secret}</code>
              <button className="btn btn-ghost btn-small" onClick={copySecret} aria-label="Copy secret key">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div className="mfa-verify-section">
            <label htmlFor="mfa-verify-code">Enter the 6-digit code from your app:</label>
            <div className="mfa-code-input">
              <input
                id="mfa-verify-code"
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <button
                className="btn btn-primary"
                onClick={verifyEnrollment}
                disabled={verifyCode.length !== 6 || verifying}
              >
                {verifying ? <><Loader2 size={14} className="spinner" /> Verifying...</> : 'Verify & Enable'}
              </button>
            </div>
            {error && <p className="mfa-error">{error}</p>}
          </div>
          <button className="btn btn-ghost btn-small" onClick={() => setStep('overview')}>Cancel</button>
        </div>
      )}

      {step === 'success' && (
        <div className="mfa-success">
          <ShieldCheck size={48} className="text-success" />
          <h4>MFA Enabled</h4>
          <p>Your account is now protected with two-factor authentication.</p>
          <button className="btn btn-primary" onClick={() => setStep('overview')}>Done</button>
        </div>
      )}
    </div>
  )
}
