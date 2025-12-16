import { useState } from 'react'
import { db } from '../lib/supabase'

export default function CompanyRegistration({ onComplete, onShowToast }) {
  const [loading, setLoading] = useState(false)

  // Company info
  const [companyName, setCompanyName] = useState('')
  const [fieldCode, setFieldCode] = useState('')
  const [officePin, setOfficePin] = useState('')

  // Admin account
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  // Auto-generate field code from company name
  const generateFieldCode = () => {
    // Simple code generation - just use company name uppercase, no suffix
    const code = companyName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10) // Allow up to 10 characters
    setFieldCode(code)
  }

  // Generate random office PIN
  const generateOfficePin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString()
    setOfficePin(pin)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validate codes
      if (!fieldCode || !officePin) {
        onShowToast?.('Please generate access codes', 'error')
        setLoading(false)
        return
      }

      // Create company with admin account
      const result = await db.createCompanyWithAdmin({
        company_name: companyName.trim(),
        field_code: fieldCode.trim().toUpperCase(),
        office_pin: officePin.trim(),
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword
      })

      if (result.success) {
        onShowToast?.(
          'Company registered successfully! Check your email for details.',
          'success'
        )

        // Show success screen with codes
        onComplete?.({
          company: result.company,
          codes: {
            field_code: fieldCode,
            office_pin: officePin
          }
        })
      } else {
        onShowToast?.(result.error || 'Failed to register company', 'error')
      }
    } catch (error) {
      console.error('Error registering company:', error)
      onShowToast?.('Failed to register company', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card registration-card">
        <div className="login-header">
          <h1>FieldSync</h1>
          <h2>Register Your Company</h2>
          <p>Set up your company and create your admin account</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {/* Company Information */}
          <div className="form-section">
            <h3>Company Information</h3>

            <div className="form-group">
              <label>Company Name *</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., GGG Construction"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Field Code *</label>
              <div className="input-with-button">
                <input
                  type="text"
                  value={fieldCode}
                  onChange={(e) => setFieldCode(e.target.value.toUpperCase())}
                  placeholder="e.g., GGG2024"
                  required
                  disabled={loading}
                  style={{ textTransform: 'uppercase' }}
                />
                <button
                  type="button"
                  onClick={generateFieldCode}
                  className="btn-secondary"
                  disabled={loading || !companyName}
                >
                  Auto-Generate
                </button>
              </div>
              <small>Your foremen will use this code to access projects</small>
            </div>

            <div className="form-group">
              <label>Office PIN *</label>
              <div className="input-with-button">
                <input
                  type="text"
                  value={officePin}
                  onChange={(e) => setOfficePin(e.target.value)}
                  placeholder="e.g., 8765"
                  maxLength={6}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={generateOfficePin}
                  className="btn-secondary"
                  disabled={loading}
                >
                  Generate
                </button>
              </div>
              <small>Office staff will need this PIN to create accounts</small>
            </div>
          </div>

          {/* Admin Account */}
          <div className="form-section">
            <h3>Your Admin Account</h3>

            <div className="form-group">
              <label>Your Name *</label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="John Smith"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="john@company.com"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                required
                disabled={loading}
              />
              <small>At least 6 characters</small>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Creating Company...' : 'Create Company'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Already have an account? <a href="/">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  )
}

// Success Screen Component
export function RegistrationSuccess({ company, codes, onContinue }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    const text = `
FieldSync Access Codes for ${company.name}

Field Code (for foremen): ${codes.field_code}
Office PIN (for office staff): ${codes.office_pin}

Keep these codes secure!
    `.trim()

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="login-container">
      <div className="login-card success-card">
        <div className="success-icon">✓</div>
        <h1>Company Registered!</h1>
        <h2>{company.name}</h2>

        <div className="codes-display">
          <div className="code-box">
            <h3>🏗️ Field Code</h3>
            <div className="code">{codes.field_code}</div>
            <small>Give this to your foremen</small>
          </div>

          <div className="code-box">
            <h3>💼 Office PIN</h3>
            <div className="code">{codes.office_pin}</div>
            <small>Share this with office staff</small>
          </div>
        </div>

        <div className="success-actions">
          <button onClick={copyToClipboard} className="btn-secondary">
            {copied ? '✓ Copied!' : 'Copy Codes'}
          </button>
          <button onClick={onContinue} className="btn-primary">
            Continue to Dashboard
          </button>
        </div>

        <div className="success-message">
          <p>
            <strong>Important:</strong> Save these codes! You'll need them to:
          </p>
          <ul>
            <li>Give Field Code to foremen for project access</li>
            <li>Share Office PIN with office staff to create accounts</li>
          </ul>
          <p>
            You can change these codes anytime in Company Settings.
          </p>
        </div>
      </div>
    </div>
  )
}
