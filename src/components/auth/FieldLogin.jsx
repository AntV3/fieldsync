import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import Logo from '../Logo'

export default function FieldLogin({ onForemanAccess }) {
  const navigate = useNavigate()
  const { showToast } = useToast()

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

  // Refs for timeout cleanup
  const pinResetTimeoutRef = useRef(null)
  const pinSubmitTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pinResetTimeoutRef.current) clearTimeout(pinResetTimeoutRef.current)
      if (pinSubmitTimeoutRef.current) clearTimeout(pinSubmitTimeoutRef.current)
    }
  }, [])

  // Handle company code
  const handleCompanyCodeChange = (value) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    setCompanyCode(cleaned)
  }

  // Verify company code
  const submitCompanyCode = async () => {
    if (companyCode.length < 2) {
      showToast('Enter company code', 'error')
      return
    }

    setLoading(true)
    try {
      const foundCompany = await db.getCompanyByCode(companyCode)
      if (foundCompany) {
        setCompany(foundCompany)
      } else {
        showToast('Invalid company code', 'error')
        setCompanyCode('')
      }
    } catch (err) {
      showToast('Error checking code', 'error')
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
      const result = await db.getProjectByPinSecure(pinToSubmit, company.code)

      if (result.rateLimited) {
        setPinState('error')
        showToast('Too many attempts. Please wait 15 minutes.', 'error')
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
        showToast(result.error, 'error')
        setPin('')
        return
      }

      showToast('Invalid PIN', 'error')
      setPin('')
    } catch (err) {
      showToast('Error checking PIN. Please check your connection.', 'error')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  // Submit foreman name
  const handleForemanNameSubmit = () => {
    if (!foremanName.trim()) {
      showToast('Enter your name to continue', 'error')
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
            onClick={() => {
              setFoundProject(null)
              setPin('')
              setPinState('')
            }}
          >
            <ArrowLeft size={16} />
            <span>Back</span>
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

        {loading && (
          <div className="entry-loading">
            <div className="spinner"></div>
          </div>
        )}
      </div>
    </div>
  )
}
