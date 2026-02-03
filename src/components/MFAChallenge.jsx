import { useState } from 'react'
import { Shield, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function MFAChallenge({ factorId, onVerified, onCancel }) {
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState(null)

  const handleVerify = async () => {
    if (code.length !== 6) return
    setVerifying(true)
    setError(null)
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code
      })
      if (verifyError) throw verifyError

      onVerified()
    } catch {
      setError('Invalid code. Please try again.')
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && code.length === 6) handleVerify()
  }

  return (
    <div className="mfa-challenge">
      <div className="mfa-challenge-icon">
        <Shield size={40} />
      </div>
      <h2>Two-Factor Authentication</h2>
      <p>Enter the 6-digit code from your authenticator app</p>
      <div className="mfa-code-input">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={handleKeyDown}
          placeholder="000000"
          maxLength={6}
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          className="mfa-input-large"
          aria-label="MFA verification code"
        />
      </div>
      {error && <p className="mfa-error">{error}</p>}
      <div className="mfa-challenge-actions">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={handleVerify}
          disabled={code.length !== 6 || verifying}
        >
          {verifying ? <><Loader2 size={14} className="spinner" /> Verifying...</> : 'Verify'}
        </button>
      </div>
    </div>
  )
}
