import { useState } from 'react'
import { Eye, EyeOff, Check } from 'lucide-react'

// Password strength calculator
export function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '' }
  let score = 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++

  if (score <= 1) return { score: 1, label: 'Weak', color: 'var(--accent-red)' }
  if (score <= 2) return { score: 2, label: 'Fair', color: 'var(--accent-orange)' }
  if (score <= 3) return { score: 3, label: 'Good', color: 'var(--accent-amber)' }
  if (score <= 4) return { score: 4, label: 'Strong', color: 'var(--accent-green)' }
  return { score: 5, label: 'Very strong', color: 'var(--accent-green)' }
}

// Generate random alphanumeric code
export function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Excluding confusing chars (0/O, 1/I/L)
  const array = new Uint32Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, v => chars[v % chars.length]).join('')
}

// Email validation
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Step indicator component
export function StepIndicator({ steps, currentStep }) {
  return (
    <div className="onboarding-step-indicator">
      {steps.map((label, i) => {
        const stepNum = i + 1
        const isActive = stepNum === currentStep
        const isCompleted = stepNum < currentStep
        return (
          <div key={i} className="onboarding-step-wrapper">
            {i > 0 && (
              <div className={`onboarding-step-line ${isCompleted ? 'completed' : ''}`} />
            )}
            <div className={`onboarding-step-circle ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {isCompleted ? <Check size={14} /> : stepNum}
            </div>
            <span className={`onboarding-step-label ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Password input with strength bar and visibility toggle
export function PasswordInput({ value, onChange, placeholder, onKeyDown, autoFocus, showStrength }) {
  const [visible, setVisible] = useState(false)
  const strength = getPasswordStrength(value)

  return (
    <div className="password-field">
      <div className="password-input-wrapper">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder || 'Password'}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible(!visible)}
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {showStrength && value && (
        <div className="password-strength">
          <div className="password-strength-bar">
            <div
              className="password-strength-fill"
              style={{
                width: `${(strength.score / 5) * 100}%`,
                background: strength.color
              }}
            />
          </div>
          <span className="password-strength-label" style={{ color: strength.color }}>
            {strength.label}
          </span>
        </div>
      )}
    </div>
  )
}
