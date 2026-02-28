import { useState, useEffect } from 'react'
import { MessageSquare, Package, AlertCircle, ClipboardList } from 'lucide-react'
import { db } from '../lib/supabase'

const NOTIFICATION_TYPES = [
  { id: 'message', label: 'Messages', Icon: MessageSquare, description: 'Chat messages from field' },
  { id: 'material_request', label: 'Material Requests', Icon: Package, description: 'Equipment and material requests' },
  { id: 'injury_report', label: 'Safety Reports', Icon: AlertCircle, description: 'Injury and safety incident reports' },
  { id: 'tm_ticket', label: 'Time & Material', Icon: ClipboardList, description: 'Time & Material tickets' }
]

export default function NotificationSettings({ project, company, onShowToast, onClose }) {
  const [users, setUsers] = useState([])
  const [preferences, setPreferences] = useState({}) // { userId: { types: [], presetId: null } }
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [project?.id, company?.id])

  const loadData = async () => {
    if (!project?.id || !company?.id) return

    try {
      setLoading(true)

      // Load company users
      const companyUsers = await db.getCompanyUsers(company.id)
      setUsers(companyUsers)

      // Load existing preferences for this project
      const existingPrefs = await db.getProjectNotificationPreferences(project.id)
      const prefsMap = {}
      existingPrefs.forEach(pref => {
        prefsMap[pref.user_id] = {
          types: pref.notification_types || [],
          presetId: null
        }
      })
      setPreferences(prefsMap)

      // Load notification presets
      const companyPresets = await db.getNotificationPresets(company.id)
      setPresets(companyPresets)

    } catch (error) {
      console.error('Error loading notification settings:', error)
      onShowToast?.('Error loading notification settings', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleType = (userId, typeId) => {
    setPreferences(prev => {
      const userPrefs = prev[userId] || { types: [], presetId: null }
      const types = userPrefs.types.includes(typeId)
        ? userPrefs.types.filter(t => t !== typeId)
        : [...userPrefs.types, typeId]

      return {
        ...prev,
        [userId]: { types, presetId: null } // Clear preset when manually changing
      }
    })
  }

  const handleApplyPreset = (userId, presetId) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return

    setPreferences(prev => ({
      ...prev,
      [userId]: {
        types: [...preset.notification_types],
        presetId
      }
    }))
  }

  const handleToggleAll = (userId, enable) => {
    setPreferences(prev => ({
      ...prev,
      [userId]: {
        types: enable ? NOTIFICATION_TYPES.map(t => t.id) : [],
        presetId: null
      }
    }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // Build the preferences array for bulk update
      const userPreferences = Object.entries(preferences).map(([userId, pref]) => ({
        userId,
        notificationTypes: pref.types
      }))

      await db.setProjectNotificationPreferences(project.id, userPreferences)

      onShowToast?.('Notification settings saved', 'success')
      onClose?.()
    } catch (error) {
      console.error('Error saving notification settings:', error)
      onShowToast?.('Error saving notification settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="notification-settings">
        <div className="notification-settings-header">
          <h3>Notification Settings</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="loading-message">Loading...</div>
      </div>
    )
  }

  return (
    <div className="notification-settings">
      <div className="notification-settings-header">
        <h3>Notification Settings for {project?.name}</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <p className="settings-description">
        Choose who receives notifications when field workers send messages, request materials,
        submit safety reports, or create Time & Material tickets for this project.
      </p>

      {users.length === 0 ? (
        <div className="no-users-message">
          <p>No users found in this company.</p>
          <small>Users need to be added to the company to receive notifications.</small>
        </div>
      ) : (
        <div className="notification-users-list">
          {users.map(user => {
            const userPrefs = preferences[user.id] || { types: [], presetId: null }
            const allSelected = userPrefs.types.length === NOTIFICATION_TYPES.length
            const someSelected = userPrefs.types.length > 0 && !allSelected

            return (
              <div key={user.id} className="notification-user-row">
                <div className="user-info">
                  <div className="user-avatar">
                    {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                  </div>
                  <div className="user-details">
                    <span className="user-name">{user.name || user.email}</span>
                    {user.role && <span className="user-role">{user.role}</span>}
                  </div>
                </div>

                <div className="notification-controls">
                  {/* Preset dropdown */}
                  <select
                    className="preset-select"
                    value={userPrefs.presetId || ''}
                    onChange={(e) => e.target.value && handleApplyPreset(user.id, e.target.value)}
                  >
                    <option value="">Apply preset...</option>
                    {presets.map(preset => (
                      <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                  </select>

                  {/* Toggle all */}
                  <button
                    className={`toggle-all-btn ${allSelected ? 'all-on' : someSelected ? 'some-on' : ''}`}
                    onClick={() => handleToggleAll(user.id, !allSelected)}
                    title={allSelected ? 'Disable all' : 'Enable all'}
                  >
                    {allSelected ? 'All On' : someSelected ? 'Some' : 'None'}
                  </button>
                </div>

                <div className="notification-types">
                  {NOTIFICATION_TYPES.map(type => (
                    <label
                      key={type.id}
                      className={`notification-type-toggle ${userPrefs.types.includes(type.id) ? 'active' : ''}`}
                      title={type.description}
                    >
                      <input
                        type="checkbox"
                        checked={userPrefs.types.includes(type.id)}
                        onChange={() => handleToggleType(user.id, type.id)}
                      />
                      <span className="type-icon"><type.Icon size={16} /></span>
                      <span className="type-label">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="notification-settings-footer">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
