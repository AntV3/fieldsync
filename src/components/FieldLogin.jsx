import { useState } from 'react'
import { db } from '../lib/supabase'

export default function FieldLogin({ onAccess, onShowToast }) {
  const [loading, setLoading] = useState(false)
  const [companyCode, setCompanyCode] = useState('')
  const [projectPin, setProjectPin] = useState('')
  const [foremanName, setForemanName] = useState('')

  const handleFieldLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Verify field code + project PIN
      const project = await db.verifyFieldAccess(
        companyCode.trim().toUpperCase(),
        projectPin.trim()
      )

      if (!project) {
        onShowToast?.('Invalid company code or project PIN', 'error')
        setLoading(false)
        return
      }

      // Log the access (audit trail)
      await db.logFieldAccess({
        company_id: project.company_id,
        project_id: project.project_id,
        foreman_name: foremanName.trim(),
        company_code_used: companyCode.trim().toUpperCase(),
        project_pin_used: projectPin.trim()
      })

      // Success! Pass foreman info to parent
      onAccess?.({
        project_id: project.project_id,
        project_name: project.project_name,
        company_id: project.company_id,
        company_name: project.company_name,
        foreman_name: foremanName.trim()
      })

      onShowToast?.(
        `Welcome, ${foremanName}! Accessing ${project.project_name}`,
        'success'
      )
    } catch (error) {
      console.error('Error accessing project:', error)
      onShowToast?.('Error accessing project', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <a href="/register" className="small-register-link">
          New company? Register here
        </a>
        <div className="login-header">
          <h1>FieldSync</h1>
          <h2>Field Access</h2>
          <p>Enter your credentials to access your project</p>
        </div>

        <form onSubmit={handleFieldLogin} className="login-form">
          <div className="form-group">
            <label>Company Code</label>
            <input
              type="text"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
              placeholder="e.g., GGG2024"
              required
              disabled={loading}
              autoFocus
              style={{ textTransform: 'uppercase' }}
            />
            <small>Provided by your company</small>
          </div>

          <div className="form-group">
            <label>Project PIN</label>
            <input
              type="password"
              value={projectPin}
              onChange={(e) => setProjectPin(e.target.value)}
              placeholder="••••"
              maxLength={6}
              required
              disabled={loading}
            />
            <small>Unique PIN for your project</small>
          </div>

          <div className="form-group">
            <label>Your Name</label>
            <input
              type="text"
              value={foremanName}
              onChange={(e) => setForemanName(e.target.value)}
              placeholder="John Smith"
              required
              disabled={loading}
            />
            <small>For activity tracking and reports</small>
          </div>

          <button
            type="submit"
            className="btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Accessing...' : 'Enter'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Office user? <a href="/">Sign in here</a>
          </p>
        </div>
      </div>
    </div>
  )
}
