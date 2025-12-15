import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function NotificationSettings({ company, user, onShowToast }) {
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('roles') // 'roles' or 'preferences'

  // Roles & Assignments
  const [notificationRoles, setNotificationRoles] = useState([])
  const [selectedRole, setSelectedRole] = useState(null)
  const [roleUsers, setRoleUsers] = useState([])
  const [allCompanyUsers, setAllCompanyUsers] = useState([])
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false)

  // Create Role Form
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleKey, setNewRoleKey] = useState('')
  const [newRoleDescription, setNewRoleDescription] = useState('')

  // Notification Types
  const [notificationTypes, setNotificationTypes] = useState([])
  const [userPreferences, setUserPreferences] = useState([])

  useEffect(() => {
    loadNotificationSettings()
  }, [company?.id])

  useEffect(() => {
    if (selectedRole) {
      loadRoleUsers(selectedRole.id)
    }
  }, [selectedRole])

  const loadNotificationSettings = async () => {
    if (!company?.id) return

    setLoading(true)
    try {
      // Load roles
      const roles = await db.getNotificationRoles(company.id)
      setNotificationRoles(roles)
      if (roles.length > 0 && !selectedRole) {
        setSelectedRole(roles[0])
      }

      // Load all company users
      const users = await db.getUsersForCompany(company.id)
      setAllCompanyUsers(users)

      // Load notification types
      const types = await db.getNotificationTypes()
      setNotificationTypes(types)

      // Load user's preferences
      if (user?.id) {
        const prefs = await db.getNotificationPreferences(user.id, company.id)
        setUserPreferences(prefs)
      }
    } catch (error) {
      console.error('Error loading notification settings:', error)
      onShowToast?.('Error loading notification settings', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadRoleUsers = async (roleId) => {
    try {
      const users = await db.getUsersByNotificationRole(roleId)
      setRoleUsers(users)
    } catch (error) {
      console.error('Error loading role users:', error)
    }
  }

  const handleAssignUser = async (userId) => {
    if (!selectedRole) return

    try {
      const result = await db.assignNotificationRole(userId, selectedRole.id, user.id)
      if (result.success) {
        onShowToast?.(`User assigned to ${selectedRole.role_name}`, 'success')
        loadRoleUsers(selectedRole.id)
        setShowAddUserModal(false)
      } else {
        onShowToast?.(result.error || 'Failed to assign user', 'error')
      }
    } catch (error) {
      console.error('Error assigning user:', error)
      onShowToast?.('Failed to assign user', 'error')
    }
  }

  const handleRemoveUser = async (userId) => {
    if (!selectedRole) return
    if (!confirm('Remove this user from the notification role?')) return

    try {
      const result = await db.removeNotificationRole(userId, selectedRole.id)
      if (result.success) {
        onShowToast?.('User removed from role', 'success')
        loadRoleUsers(selectedRole.id)
      } else {
        onShowToast?.(result.error || 'Failed to remove user', 'error')
      }
    } catch (error) {
      console.error('Error removing user:', error)
      onShowToast?.('Failed to remove user', 'error')
    }
  }

  const handleCreateRole = async (e) => {
    e.preventDefault()
    if (!newRoleName.trim() || !newRoleKey.trim()) {
      onShowToast?.('Role name and key are required', 'error')
      return
    }

    try {
      const roleKey = newRoleKey.toLowerCase().replace(/\s+/g, '_')
      const result = await db.createNotificationRole(
        company.id,
        newRoleName.trim(),
        roleKey,
        newRoleDescription.trim()
      )

      if (result.success) {
        onShowToast?.('Notification role created!', 'success')
        setNewRoleName('')
        setNewRoleKey('')
        setNewRoleDescription('')
        setShowCreateRoleModal(false)
        loadNotificationSettings()
      } else {
        onShowToast?.(result.error || 'Failed to create role', 'error')
      }
    } catch (error) {
      console.error('Error creating role:', error)
      onShowToast?.('Failed to create role', 'error')
    }
  }

  const handleUpdatePreference = async (notificationTypeId, field, value) => {
    try {
      // Find existing preference or create new one
      const existingPref = userPreferences.find(p => p.notification_type_id === notificationTypeId)
      const preferences = {
        email_enabled: existingPref?.email_enabled ?? true,
        in_app_enabled: existingPref?.in_app_enabled ?? true,
        sms_enabled: existingPref?.sms_enabled ?? false,
        [field]: value
      }

      const result = await db.updateNotificationPreference(
        user.id,
        company.id,
        notificationTypeId,
        preferences
      )

      if (result.success) {
        // Reload preferences
        const prefs = await db.getNotificationPreferences(user.id, company.id)
        setUserPreferences(prefs)
        onShowToast?.('Preference updated', 'success')
      } else {
        onShowToast?.(result.error || 'Failed to update preference', 'error')
      }
    } catch (error) {
      console.error('Error updating preference:', error)
      onShowToast?.('Failed to update preference', 'error')
    }
  }

  // Get available users to assign (not already assigned to this role)
  const availableUsers = allCompanyUsers.filter(u =>
    !roleUsers.some(ru => ru.users.id === u.id)
  )

  if (loading) {
    return (
      <div className="notification-settings">
        <div className="settings-loading">
          <div className="spinner"></div>
          <p>Loading notification settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="notification-settings">
      {/* Section Tabs */}
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeSection === 'roles' ? 'active' : ''}`}
          onClick={() => setActiveSection('roles')}
        >
          Notification Roles
        </button>
        <button
          className={`settings-tab ${activeSection === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveSection('preferences')}
        >
          My Preferences
        </button>
      </div>

      {/* ROLES SECTION */}
      {activeSection === 'roles' && (
        <div className="roles-section">
          <div className="section-header">
            <div>
              <h2>Notification Roles</h2>
              <p>Assign users to roles that receive specific notifications</p>
            </div>
            <button
              className="btn-primary"
              onClick={() => setShowCreateRoleModal(true)}
            >
              + Create Role
            </button>
          </div>

          <div className="roles-layout">
            {/* Left: Role List */}
            <div className="roles-list">
              <h3>Roles</h3>
              {notificationRoles.map(role => (
                <button
                  key={role.id}
                  className={`role-item ${selectedRole?.id === role.id ? 'active' : ''}`}
                  onClick={() => setSelectedRole(role)}
                >
                  <div className="role-name">{role.role_name}</div>
                  <div className="role-description">{role.description}</div>
                </button>
              ))}
              {notificationRoles.length === 0 && (
                <div className="empty-state">
                  <p>No notification roles yet</p>
                  <button onClick={() => setShowCreateRoleModal(true)}>
                    Create first role
                  </button>
                </div>
              )}
            </div>

            {/* Right: Role Users */}
            {selectedRole && (
              <div className="role-users">
                <div className="role-users-header">
                  <div>
                    <h3>{selectedRole.role_name}</h3>
                    <p>{selectedRole.description}</p>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowAddUserModal(true)}
                    disabled={availableUsers.length === 0}
                  >
                    + Assign User
                  </button>
                </div>

                <div className="assigned-users">
                  {roleUsers.length === 0 ? (
                    <div className="empty-state">
                      <p>No users assigned to this role yet</p>
                      <button onClick={() => setShowAddUserModal(true)}>
                        Assign first user
                      </button>
                    </div>
                  ) : (
                    roleUsers.map(ru => (
                      <div key={ru.id} className="assigned-user-card">
                        <div className="user-info">
                          <div className="user-name">{ru.users.name || ru.users.email}</div>
                          <div className="user-email">{ru.users.email}</div>
                          <div className="user-meta">
                            Assigned {new Date(ru.assigned_at).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          className="btn-danger-small"
                          onClick={() => handleRemoveUser(ru.users.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PREFERENCES SECTION */}
      {activeSection === 'preferences' && (
        <div className="preferences-section">
          <div className="section-header">
            <div>
              <h2>My Notification Preferences</h2>
              <p>Choose how you want to receive notifications</p>
            </div>
          </div>

          <div className="notification-types-grid">
            {Object.entries(
              notificationTypes.reduce((acc, type) => {
                if (!acc[type.category]) acc[type.category] = []
                acc[type.category].push(type)
                return acc
              }, {})
            ).map(([category, types]) => (
              <div key={category} className="category-group">
                <h3 className="category-title">{category.charAt(0).toUpperCase() + category.slice(1)}</h3>
                <div className="notification-types">
                  {types.map(type => {
                    const pref = userPreferences.find(p => p.notification_type_id === type.id)
                    const emailEnabled = pref?.email_enabled ?? type.default_enabled
                    const inAppEnabled = pref?.in_app_enabled ?? type.default_enabled

                    return (
                      <div key={type.id} className="notification-type-row">
                        <div className="type-info">
                          <div className="type-name">{type.type_name}</div>
                          <div className="type-description">{type.description}</div>
                        </div>
                        <div className="type-toggles">
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={emailEnabled}
                              onChange={(e) => handleUpdatePreference(type.id, 'email_enabled', e.target.checked)}
                            />
                            <span>Email</span>
                          </label>
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={inAppEnabled}
                              onChange={(e) => handleUpdatePreference(type.id, 'in_app_enabled', e.target.checked)}
                            />
                            <span>In-App</span>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign User to {selectedRole?.role_name}</h3>
              <button className="modal-close" onClick={() => setShowAddUserModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {availableUsers.length === 0 ? (
                <p>All users are already assigned to this role.</p>
              ) : (
                <div className="user-select-list">
                  {availableUsers.map(user => (
                    <button
                      key={user.id}
                      className="user-select-item"
                      onClick={() => handleAssignUser(user.id)}
                    >
                      <div className="user-name">{user.name || user.email}</div>
                      <div className="user-email">{user.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Role Modal */}
      {showCreateRoleModal && (
        <div className="modal-overlay" onClick={() => setShowCreateRoleModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Notification Role</h3>
              <button className="modal-close" onClick={() => setShowCreateRoleModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateRole}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Role Name *</label>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g., Equipment Manager"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Role Key *</label>
                  <input
                    type="text"
                    value={newRoleKey}
                    onChange={(e) => setNewRoleKey(e.target.value)}
                    placeholder="e.g., equipment_manager"
                    required
                  />
                  <small>Lowercase with underscores (used in code)</small>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newRoleDescription}
                    onChange={(e) => setNewRoleDescription(e.target.value)}
                    placeholder="What notifications does this role receive?"
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateRoleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
