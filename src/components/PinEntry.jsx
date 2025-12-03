import { useState } from 'react'
import { db } from '../lib/supabase'

export default function PinEntry({ onProjectAccess, onOfficeLogin, onShowToast }) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePinChange = (value) => {
    // Only allow digits, max 4
    const cleaned = value.replace(/\D/g, '').slice(0, 4)
    setPin(cleaned)
  }

  const handleSubmit = async () => {
    if (pin.length !== 4) {
      onShowToast('Enter 4-digit PIN', 'error')
      return
    }

    setLoading(true)

    try {
      const project = await db.getProjectByPin(pin)
      
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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && pin.length === 4) {
      handleSubmit()
    }
  }

  const handleNumberPad = (num) => {
    if (pin.length < 4) {
      const newPin = pin + num
      setPin(newPin)
      
      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        setTimeout(() => {
          handleSubmit()
        }, 200)
      }
    }
  }

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1))
  }

  return (
    <div className="pin-container">
      <div className="pin-card">
        <div className="pin-header">
          <div className="pin-logo">Field<span>Sync</span></div>
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
