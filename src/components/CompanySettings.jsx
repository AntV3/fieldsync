import { useState, useEffect } from 'react'
import { db, supabase } from '../lib/supabase'

export default function CompanySettings({ company, onShowToast }) {
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)

  // Current codes
  const [fieldCode, setFieldCode] = useState('')
  const [officePin, setOfficePin] = useState('')

  // Edit mode
  const [newFieldCode, setNewFieldCode] = useState('')
  const [newOfficePin, setNewOfficePin] = useState('')

  useEffect(() => {
    if (company) {
      loadCompanyCodes()
    }
  }, [company])

  const loadCompanyCodes = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('field_code, office_pin')
        .eq('id', company.id)
        .single()

      if (error) throw error

      setFieldCode(data.field_code || 'Not set')
      setOfficePin(data.office_pin || 'Not set')
      setNewFieldCode(data.field_code || '')
      setNewOfficePin(data.office_pin || '')
    } catch (error) {
      console.error('Error loading codes:', error)
      onShowToast('Error loading company codes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!newFieldCode.trim() || !newOfficePin.trim()) {
      onShowToast('Field Code and Office PIN are required', 'error')
      return
    }

    setLoading(true)
    try {
      // Check for duplicates
      const { data: existingField } = await supabase
        .from('companies')
        .select('id')
        .eq('field_code', newFieldCode.trim().toUpperCase())
        .neq('id', company.id)
        .single()

      if (existingField) {
        onShowToast('This Field Code is already in use by another company', 'error')
        setLoading(false)
        return
      }

      const { data: existingPin } = await supabase
        .from('companies')
        .select('id')
        .eq('office_pin', newOfficePin.trim())
        .neq('id', company.id)
        .single()

      if (existingPin) {
        onShowToast('This Office PIN is already in use by another company', 'error')
        setLoading(false)
        return
      }

      // Update codes
      const { error } = await supabase
        .from('companies')
        .update({
          field_code: newFieldCode.trim().toUpperCase(),
          office_pin: newOfficePin.trim()
        })
        .eq('id', company.id)

      if (error) throw error

      setFieldCode(newFieldCode.trim().toUpperCase())
      setOfficePin(newOfficePin.trim())
      setEditing(false)
      onShowToast('Company codes updated successfully!', 'success')
    } catch (error) {
      console.error('Error updating codes:', error)
      onShowToast('Error updating company codes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setNewFieldCode(fieldCode)
    setNewOfficePin(officePin)
    setEditing(false)
  }

  const generateFieldCode = () => {
    const code = company.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6) + '2024'
    setNewFieldCode(code)
  }

  const generateOfficePin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString()
    setNewOfficePin(pin)
  }

  if (loading && !editing) {
    return (
      <div className="settings-container">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Company Settings</h1>
        <p className="settings-subtitle">
          Manage your company's access codes for field workers and office staff
        </p>
      </div>

      <div className="settings-card">
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>Access Codes</h2>
            {!editing && (
              <button
                className="btn-secondary"
                onClick={() => setEditing(true)}
              >
                Edit Codes
              </button>
            )}
          </div>

          <div className="settings-codes">
            <div className="code-item">
              <div className="code-label">
                <span className="code-icon">🏗️</span>
                <div>
                  <h3>Field Code</h3>
                  <p>Foremen use this to access projects</p>
                </div>
              </div>
              {editing ? (
                <div className="code-edit">
                  <input
                    type="text"
                    value={newFieldCode}
                    onChange={(e) => setNewFieldCode(e.target.value.toUpperCase())}
                    placeholder="e.g., GGG2024"
                    disabled={loading}
                    style={{ textTransform: 'uppercase' }}
                  />
                  <button
                    className="btn-secondary"
                    onClick={generateFieldCode}
                    disabled={loading}
                  >
                    Generate
                  </button>
                </div>
              ) : (
                <div className="code-value">{fieldCode}</div>
              )}
            </div>

            <div className="code-item">
              <div className="code-label">
                <span className="code-icon">💼</span>
                <div>
                  <h3>Office PIN</h3>
                  <p>Office staff need this to create accounts</p>
                </div>
              </div>
              {editing ? (
                <div className="code-edit">
                  <input
                    type="text"
                    value={newOfficePin}
                    onChange={(e) => setNewOfficePin(e.target.value)}
                    placeholder="e.g., 8765"
                    maxLength={6}
                    disabled={loading}
                  />
                  <button
                    className="btn-secondary"
                    onClick={generateOfficePin}
                    disabled={loading}
                  >
                    Generate
                  </button>
                </div>
              ) : (
                <div className="code-value">{officePin}</div>
              )}
            </div>
          </div>

          {editing && (
            <div className="settings-actions">
              <button
                className="btn-secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        <div className="settings-info">
          <h3>⚠️ Important</h3>
          <ul>
            <li>
              <strong>Field Code</strong> - Share this with your foremen so they can access project sites
            </li>
            <li>
              <strong>Office PIN</strong> - Share this with office staff so they can create accounts
            </li>
            <li>
              Changing these codes will require everyone to use the new codes for access
            </li>
            <li>
              Keep these codes secure and only share with trusted team members
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
