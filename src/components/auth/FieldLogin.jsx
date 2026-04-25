import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { db, getFieldSession, clearFieldSession } from '../../lib/supabase'
import Logo from '../Logo'

export default function FieldLogin({ onForemanAccess, onShowToast }) {
  const navigate = useNavigate()

  // State
  const [companyCode, setCompanyCode] = useState('')
  const [company, setCompany] = useState(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [pinState, setPinState] = useState('') // '', 'error', 'success'
  const [foundProject, setFoundProject] = useState(null)
  const [foremanName, setForemanName] = useState(() => {
    try { return localStorage.getItem('fieldsync_foreman_name') || '' } catch { return '' }
  })
  const [rememberMe, setRememberMe] = useState(true)

  // Refs for timeout cleanup
  const pinResetTimeoutRef = useRef(null)
  const pinSubmitTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pinResetTimeoutRef.current) clearTimeout(pinResetTimeoutRef.current)
      if (pinSubmitTimeoutRef.current) clearTimeout(pinSubmitTimeoutRef.current)
    }
  }, [])

  // Auto-skip company code + PIN entry if a remember-me session exists.
  // The session token already authorizes API calls; we just rebuild the
  // company/project shapes the UI expects so the foreman lands on the
  // name confirmation step (or straight onto /field if name is saved).
  useEffect(() => {
    const session = getFieldSession()
    if (!session?.remembered) return
    if (!session.projectId || !session.companyId) return

    const remembered = {
      id: session.projectId,
      name: session.projectName,
      company_id: session.companyId,
      status: 'active'
    }
    setCompany({
      id: session.companyId,
      name: session.companyName,
      code: session.companyCode || ''
    })
    setFoundProject(remembered)

    const savedName = (() => {
      try { return localStorage.getItem('fieldsync_foreman_name') || '' } catch { return '' }
    })()
    if (savedName.trim()) {
      onForemanAccess(remembered, savedName.trim())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Forget the remembered session and start the login flow over.
  const forgetRememberedSession = async () => {
    try { await clearFieldSession() } catch (_e) { /* ignore */ }
    setFoundProject(null)
    setCompany(null)
    setCompanyCode('')
    setPin('')
    setPinState('')
    setRememberMe(true)
  }

  // Handle company code
  const handleCompanyCodeChange = (value) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    setCompanyCode(cleaned)
  }

  // Verify company code
  const submitCompanyCode = async () => {
    if (companyCode.length < 2) {
      onShowToast('Enter company code', 'error')
      return
    }

    setLoading(true)
    try {
      const foundCompany = await db.getCompanyByCode(companyCode)
      if (foundCompany) {
        setCompany(foundCompany)
      } else {
        onShowToast('Invalid company code', 'error')
        setCompanyCode('')
      }
    } catch (_err) {
      onShowToast('Error checking code', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Submit PIN
  const submitPin = async (pinToSubmit) => {
    if (pinToSubmit.length !== 4) return

    setLoading(true)
    setPinState('')

    try {
      const result = await db.getProjectByPinSecure(pinToSubmit, company.code, { remember: rememberMe })

      if (result.rateLimited) {
        setPinState('error')
        onShowToast('Too many attempts. Please wait 15 minutes.', 'error')
        if (pinResetTimeoutRef.current) clearTimeout(pinResetTimeoutRef.current)
        pinResetTimeoutRef.current = setTimeout(() => {
          setPin('')
          setPinState('')
        }, 800)
        return
      }

      if (result.success && result.project) {
        setFoundProject(result.project)
        return
      }

      if (result.error) {
        console.error('[Foreman Auth] PIN validation failed:', result.error)
        onShowToast(result.error, 'error')
        setPin('')
        return
      }

      onShowToast('Invalid PIN', 'error')
      setPin('')
    } catch (_err) {
      onShowToast('Error checking PIN. Please check your connection.', 'error')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  // Submit foreman name
  const handleForemanNameSubmit = () => {
    if (!foremanName.trim()) {
      onShowToast('Enter your name to continue', 'error')
      return
    }
    try { localStorage.setItem('fieldsync_foreman_name', foremanName.trim()) } catch { /* ignore */ }
    onForemanAccess(foundProject, foremanName.trim())
  }

  // Number pad handler
  const handleNumberPad = (num) => {
    if (pin.length < 4 && !loading) {
      const newPin = pin + num
      setPin(newPin)
      setPinState('')
      if (newPin.length === 4) {
        if (pinSubmitTimeoutRef.current) clearTimeout(pinSubmitTimeoutRef.current)
        pinSubmitTimeoutRef.current = setTimeout(() => submitPin(newPin), 150)
      }
    }
  }

  const handleBackspace = () => {
    if (!loading) {
      setPin(prev => prev.slice(0, -1))
      setPinState('')
    }
  }

  const handleBackToCompany = () => {
    setCompany(null)
    setPin('')
    setPinState('')
  }

  // Step 3: Name entry (after PIN success)
  if (foundProject) {
    const fromRemembered = Boolean(getFieldSession()?.remembered)
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <Logo className="entry-logo" showPoweredBy={false} />
          <div className="entry-company-badge">{foundProject.name}</div>
          <p className="entry-subtitle">Who's checking in?</p>

          <div className="entry-form">
            <input
              type="text"
              value={foremanName}
              onChange={(e) => setForemanName(e.target.value)}
              placeholder="Your name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleForemanNameSubmit()
              }}
              style={{ fontSize: '1.1rem', textAlign: 'center' }}
            />
            <button
              className="entry-login-btn"
              onClick={handleForemanNameSubmit}
              disabled={!foremanName.trim()}
            >
              Enter Site
            </button>
          </div>

          <p className="entry-hint" style={{ marginTop: '0.75rem' }}>
            Your name will appear on reports and submissions
          </p>

          <button
            className="entry-join-link"
            style={{ marginTop: '0.5rem', display: 'flex', alignSelf: 'center' }}
            onClick={fromRemembered ? forgetRememberedSession : () => {
              setFoundProject(null)
              setPin('')
              setPinState('')
            }}
          >
            <ArrowLeft size={16} />
            <span>{fromRemembered ? 'Switch project' : 'Back'}</span>
          </button>
        </div>
      </div>
    )
  }

  // Step 1: Company code
  if (!company) {
    return (
      <div className="entry-container">
        <div className="entry-card animate-fade-in">
          <button className="entry-back" onClick={() => navigate('/login')}>
            <ArrowLeft size={20} />
          </button>

          <Logo className="entry-logo" showPoweredBy={false} />
          <p className="entry-subtitle">Enter company code</p>

          <div className="entry-input-group">
            <input
              type="text"
              value={companyCode}
              onChange={(e) => handleCompanyCodeChange(e.target.value)}
              placeholder="Company Code"
              disabled={loading}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCompanyCode()
              }}
            />
            <button
              className="entry-submit-btn"
              onClick={submitCompanyCode}
              disabled={loading || companyCode.length < 2}
            >
              {loading ? <div className="spinner-small" /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: PIN entry
  return (
    <div className="entry-container">
      <div className="entry-card animate-fade-in">
        <button className="entry-back" onClick={handleBackToCompany}>
          <ArrowLeft size={20} />
        </button>

        <Logo className="entry-logo" showPoweredBy={false} />
        <div className="entry-company-badge">{company.name}</div>
        <p className="entry-subtitle">Enter project PIN</p>

        {/* PIN Display */}
        <div className={`pin-display ${pinState === 'error' ? 'shake' : ''}`}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`pin-dot ${pin.length > i ? 'filled' : ''} ${pinState}`}
            >
              {pin.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {/* Number Pad */}
        <div className="number-pad" role="group" aria-label="PIN entry keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              className="num-btn"
              onClick={() => handleNumberPad(num.toString())}
              disabled={loading}
              aria-label={String(num)}
            >
              {num}
            </button>
          ))}
          <button className="num-btn empty" disabled aria-hidden="true"></button>
          <button
            className="num-btn"
            onClick={() => handleNumberPad('0')}
            disabled={loading}
            aria-label="0"
          >
            0
          </button>
          <button
            className="num-btn backspace"
            onClick={handleBackspace}
            disabled={loading || pin.length === 0}
            aria-label="Delete last digit"
          >
            <ArrowLeft size={18} />
          </button>
        </div>

        <label
          className="checkbox-label"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            marginTop: '1rem',
            fontSize: '0.9rem',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={loading}
            style={{ cursor: 'pointer' }}
          />
          <span>Remember me on this device</span>
        </label>

        {loading && (
          <div className="entry-loading">
            <div className="spinner"></div>
          </div>
        )}
      </div>
    </div>
  )
}
