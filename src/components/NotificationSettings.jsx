import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

const EVENT_TYPES = [
  {
    type: 'material_request',
    icon: '📦',
    title: 'Material Requests',
    description: 'When field submits a material request'
  },
  {
    type: 'tm_submitted',
    icon: '📋',
    title: 'T&M Tickets Submitted',
    description: 'When field submits a Time & Material ticket'
  },
  {
    type: 'tm_approved',
    icon: '✅',
    title: 'T&M Tickets Approved',
    description: 'When office approves a T&M ticket'
  },
  {
    type: 'tm_rejected',
    icon: '❌',
    title: 'T&M Tickets Rejected',
    description: 'When office rejects a T&M ticket'
  },
  {
    type: 'daily_report',
    icon: '📊',
    title: 'Daily Reports',
    description: 'When field submits a daily report'
  },
  {
    type: 'message',
    icon: '💬',
    title: 'Messages from Field',
    description: 'When field sends a message'
  },
  {
    type: 'material_approved',
    icon: '✅',
    title: 'Material Approved',
    description: 'When office approves a material request'
  },
  {
    type: 'material_rejected',
    icon: '❌',
    title: 'Material Rejected',
    description: 'When office rejects a material request'
  },
  {
    type: 'crew_checkin',
    icon: '👷',
    title: 'Crew Check-ins',
    description: 'When crew checks in for the day'
  }
]

const AVAILABLE_ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'office', label: 'Office' },
  { value: 'foreman', label: 'Foreman' }
]

export default function NotificationSettings({ companyId, companyUsers, onClose, onShowToast }) {
  const [settings, setSettings] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [companyId])

  const loadSettings = async () => {
    if (!companyId) return

    setIsLoading(true)
    try {
      // Load all settings for company
      const allSettings = await db.getNotificationSettings(companyId)

      // Convert to object keyed by event_type
      const settingsObj = {}
      allSettings.forEach(setting => {
        settingsObj[setting.event_type] = setting
      })

      setSettings(settingsObj)
    } catch (error) {
      console.error('Error loading notification settings:', error)
      onShowToast('Error loading notification settings', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleRole = (eventType, role) => {
    setSettings(prev => {
      const current = prev[eventType] || {
        notify_roles: [],
        notify_user_ids: [],
        in_app_enabled: true,
        email_enabled: false,
        push_enabled: false
      }

      const roles = current.notify_roles || []
      const isSelected = roles.includes(role)

      return {
        ...prev,
        [eventType]: {
          ...current,
          notify_roles: isSelected
            ? roles.filter(r => r !== role)
            : [...roles, role]
        }
      }
    })
  }

  const handleToggleUser = (eventType, userId) => {
    setSettings(prev => {
      const current = prev[eventType] || {
        notify_roles: [],
        notify_user_ids: [],
        in_app_enabled: true,
        email_enabled: false,
        push_enabled: false
      }

      const userIds = current.notify_user_ids || []
      const isSelected = userIds.includes(userId)

      return {
        ...prev,
        [eventType]: {
          ...current,
          notify_user_ids: isSelected
            ? userIds.filter(id => id !== userId)
            : [...userIds, userId]
        }
      }
    })
  }

  const handleToggleChannel = (eventType, channel) => {
    setSettings(prev => {
      const current = prev[eventType] || {
        notify_roles: [],
        notify_user_ids: [],
        in_app_enabled: true,
        email_enabled: false,
        push_enabled: false
      }

      return {
        ...prev,
        [eventType]: {
          ...current,
          [channel]: !current[channel]
        }
      }
    })
  }

  const handleToggleInApp = (eventType) => {
    setSettings(prev => {
      const current = prev[eventType] || {
        notify_roles: [],
        notify_user_ids: [],
        in_app_enabled: true,
        email_enabled: false,
        push_enabled: false
      }

      return {
        ...prev,
        [eventType]: {
          ...current,
          in_app_enabled: !current.in_app_enabled
        }
      }
    })
  }

  const handleSave = async () => {
    if (!companyId) return

    setIsSaving(true)
    try {
      // Save each setting
      for (const eventType of Object.keys(settings)) {
        await db.upsertNotificationSetting(companyId, eventType, settings[eventType])
      }

      onShowToast('Notification settings saved successfully', 'success')
      if (onClose) onClose()
    } catch (error) {
      console.error('Error saving notification settings:', error)
      onShowToast('Error saving notification settings', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleInitializeDefaults = async () => {
    if (!companyId) return

    try {
      await db.initializeDefaultNotificationSettings(companyId)
      onShowToast('Default notification settings initialized', 'success')
      loadSettings()
    } catch (error) {
      console.error('Error initializing defaults:', error)
      onShowToast('Error initializing defaults', 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="notification-settings">
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="notification-settings">
      <div className="notification-settings-header">
        <h2>Notification Preferences</h2>
        <p>Configure who gets notified for different events in your company.</p>
      </div>

      {Object.keys(settings).length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 1rem 0' }}>No notification settings configured yet.</p>
          <button className="btn" onClick={handleInitializeDefaults}>
            Initialize Default Settings
          </button>
        </div>
      )}

      {EVENT_TYPES.map(event => {
        const setting = settings[event.type] || {
          notify_roles: [],
          notify_user_ids: [],
          in_app_enabled: false,
          email_enabled: false,
          push_enabled: false
        }

        return (
          <div key={event.type} className="notification-setting-card">
            <div className="notification-setting-header">
              <div className="notification-setting-info">
                <div className="notification-setting-title">
                  <span>{event.icon}</span>
                  <span>{event.title}</span>
                </div>
                <p className="notification-setting-description">{event.description}</p>
              </div>
              <div className="notification-setting-toggle">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={setting.in_app_enabled}
                    onChange={() => handleToggleInApp(event.type)}
                  />
                  <span style={{ fontSize: '0.85rem' }}>Enabled</span>
                </label>
              </div>
            </div>

            {setting.in_app_enabled && (
              <div className="notification-setting-body">
                <div className="notification-recipients">
                  <div>
                    <div className="notification-recipients-label">Notify by Role:</div>
                    <div className="notification-roles">
                      {AVAILABLE_ROLES.map(role => (
                        <label key={role.value} className="role-checkbox">
                          <input
                            type="checkbox"
                            checked={(setting.notify_roles || []).includes(role.value)}
                            onChange={() => handleToggleRole(event.type, role.value)}
                          />
                          <span>{role.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {companyUsers && companyUsers.length > 0 && (
                    <div>
                      <div className="notification-recipients-label">Notify Specific Users:</div>
                      <div className="notification-users">
                        {companyUsers.map(user => (
                          <label key={user.id} className="user-checkbox">
                            <input
                              type="checkbox"
                              checked={(setting.notify_user_ids || []).includes(user.id)}
                              onChange={() => handleToggleUser(event.type, user.id)}
                            />
                            <span>{user.name || user.email}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="notification-channels">
                  <div className="channel-checkbox">
                    <input
                      type="checkbox"
                      id={`${event.type}-in-app`}
                      checked={setting.in_app_enabled}
                      disabled
                    />
                    <label htmlFor={`${event.type}-in-app`}>In-App</label>
                  </div>
                  <div className="channel-checkbox">
                    <input
                      type="checkbox"
                      id={`${event.type}-email`}
                      checked={setting.email_enabled}
                      onChange={() => handleToggleChannel(event.type, 'email_enabled')}
                      disabled
                      title="Email notifications coming soon"
                    />
                    <label htmlFor={`${event.type}-email`}>Email (Coming Soon)</label>
                  </div>
                  <div className="channel-checkbox">
                    <input
                      type="checkbox"
                      id={`${event.type}-push`}
                      checked={setting.push_enabled}
                      onChange={() => handleToggleChannel(event.type, 'push_enabled')}
                      disabled
                      title="Push notifications coming soon"
                    />
                    <label htmlFor={`${event.type}-push`}>Push (Coming Soon)</label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div className="notification-settings-footer">
        {onClose && (
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        )}
        <button className="btn" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
