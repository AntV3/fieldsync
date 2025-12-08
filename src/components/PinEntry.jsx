import { useState } from 'react'
import { db } from '../lib/supabase'

export default function PinEntry({ onProjectAccess, onOfficeLogin, onShowToast }) {
  const [step, setStep] = useState('company') // 'company' or 'pin'
  const [companyCode, setCompanyCode] = useState('')
  const [company, setCompany] = useState(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  // Handle company code input
  const handleCompanyCodeChange = (value) => {
    // Uppercase, alphanumeric only, max 20
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    setCompanyCode(cleaned)
  }

  // Submit company code
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
        setStep('pin')
      } else {
        onShowToast('Invalid company code', 'error')
        setCompanyCode('')
      }
    } catch (error) {
      console.error('Company lookup error:', error)
      onShowToast('Error checking code', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle PIN input
  const handlePinChange = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4)
    setPin(cleaned)
  }

  // Submit PIN (with company scope)
  const submitPin = async (pinToSubmit) => {
    if (pinToSubmit.length !== 4) {
      onShowToast('Enter 4-digit PIN', 'error')
      return
    }

    setLoading(true)

    try {
      // Look up project by PIN within this company only
      const project = await db.getProjectByPinAndCompany(pinToSubmit, company.id)
      
      if (project) {
        onProjectAccess(project)
      } else {
        onShowToast('Invalid PIN', 'error')
        setPin('')
      }
    } catch (error) {
      console.error('PIN lookup error:', error)
      onShowToast('Error checking PIN', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Number pad handler
  const handleNumberPad = (num) => {
    if (pin.length < 4) {
      const newPin = pin + num
      setPin(newPin)
      
      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        setTimeout(() => {
          submitPin(newPin)
        }, 200)
      }
    }
  }

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1))
  }

  // Go back to company code step
  const handleBack = () => {
    setStep('company')
    setPin('')
    setCompany(null)
  }

  // Step 1: Company Code Entry
  if (step === 'company') {
    return (
      <div className="pin-container">
        <div className="pin-card">
          <div className="pin-header">
            <div className="pin-logo">Field<span>Sync</span></div>
            <p className="pin-subtitle">Enter company code</p>
          </div>

          {/* Company Code Input */}
          <div className="company-code-input">
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
          </div>

          <button
            className="btn btn-primary company-submit-btn"
            onClick={submitCompanyCode}
            disabled={loading || companyCode.length < 2}
          >
            {loading ? 'Checking...' : 'Continue'}
          </button>

          {loading && (
            <div className="pin-loading">
              <div className="spinner"></div>
            </div>
          )}

          <div className="pin-footer">
            <button className="office-link" onClick={onOfficeLogin}>
              Office Login →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: PIN Entry (company already verified)
  return (
    <div className="pin-container">
      <div className="pin-card">
        <div className="pin-header">
          <button className="pin-back-btn" onClick={handleBack}>
            ←
          </button>
          <div className="pin-logo">Field<span>Sync</span></div>
          <div className="pin-company-badge">
            {company?.name || companyCode}
          </div>
          <p className="pin-subtitle">Enter project PIN</p>
        </div>

        {/* PIN Display */}
        <div className="pin-display">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`pin-dot ${pin.length > i ? 'filled' : ''}`}>
              {pin.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {/* Number Pad */}
        <div className="number-pad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              className="num-btn"
              onClick={() => handleNumberPad(num.toString())}
              disabled={loading}
            >
              {num}
            </button>
          ))}
          <button className="num-btn empty" disabled></button>
          <button
            className="num-btn"
            onClick={() => handleNumberPad('0')}
            disabled={loading}
          >
            0
          </button>
          <button
            className="num-btn backspace"
            onClick={handleBackspace}
            disabled={loading || pin.length === 0}
          >
            ←
          </button>
        </div>

        {loading && (
          <div className="pin-loading">
            <div className="spinner"></div>
          </div>
        )}

        <div className="pin-footer">
          <button className="office-link" onClick={onOfficeLogin}>
            Office Login →
          </button>
        </div>
      </div>
    </div>
  )
}

