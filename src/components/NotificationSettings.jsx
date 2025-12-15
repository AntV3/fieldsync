import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function NotificationSettings({ company, user, onShowToast }) {
  const [loading, setLoading] = useState(true)

  // Check if user can manage roles (admin or office role)
  const canManageRoles = user?.role === 'admin' || user?.role === 'office'

  // Default to 'roles' for admins/office, 'preferences' for regular users
  const [activeSection, setActiveSection] = useState(canManageRoles ? 'roles' : 'preferences')

  // Roles & Assignments
  const [notificationRoles, setNotificationRoles] = useState([])
  const [selectedRole, setSelectedRole] = useState(null)
  const [roleUsers, setRoleUsers] = useState([])
  const [externalRecipients, setExternalRecipients] = useState([])
  const [allCompanyUsers, setAllCompanyUsers] = useState([])
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showAddEmailModal, setShowAddEmailModal] = useState(false)
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false)

  // Create Role Form
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleKey, setNewRoleKey] = useState('')
  const [newRoleDescription, setNewRoleDescription] = useState('')

  // Add Email Form
  const [newEmail, setNewEmail] = useState('')
  const [newEmailName, setNewEmailName] = useState('')
  const [newEmailNotes, setNewEmailNotes] = useState('')

  // Notification Types
  const [notificationTypes, setNotificationTypes] = useState([])
  const [userPreferences, setUserPreferences] = useState([])
  const [myRoles, setMyRoles] = useState([])

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

      // Load user's preferences and roles
      if (user?.id) {
        const prefs = await db.getNotificationPreferences(user.id, company.id)
        setUserPreferences(prefs)

        // Load user's assigned notification roles
        const userRoles = await db.getUserNotificationRoles(user.id)
        const companyRoles = userRoles.filter(ur => ur.notification_roles?.company_id === company.id)
        setMyRoles(companyRoles.map(ur => ur.notification_roles))
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

      // Also load external recipients
      const external = await db.getExternalRecipientsByRole(roleId)
      setExternalRecipients(external)
    } catch (error) {
      console.error('Error loading role users:', error)
    }
  }

  const handleAssignUser = async (userId) => {
    if (!selectedRole) return

    // Check if user is already assigned
    const alreadyAssigned = roleUsers.some(ru => ru.users.id === userId)
    if (alreadyAssigned) {
      onShowToast?.('This user is already assigned to this role', 'error')
      return
    }

    try {
      const result = await db.assignNotificationRole(userId, selectedRole.id, user.id)
      if (result.success) {
        onShowToast?.(`User assigned to ${selectedRole.role_name}`, 'success')
        loadRoleUsers(selectedRole.id)
        setShowAddUserModal(false)
      } else {
        // Handle duplicate key error specifically
        if (result.error?.includes('duplicate key') || result.error?.includes('already exists')) {
          onShowToast?.('This user is already assigned to this role', 'error')
        } else {
          onShowToast?.(result.error || 'Failed to assign user', 'error')
        }
      }
    } catch (error) {
      console.error('Error assigning user:', error)
      if (error.message?.includes('duplicate key') || error.code === '23505') {
        onShowToast?.('This user is already assigned to this role', 'error')
      } else {
        onShowToast?.('Failed to assign user', 'error')
      }
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

  const handleAddExternalEmail = async (e) => {
    e.preventDefault()
    if (!selectedRole) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      onShowToast?.('Please enter a valid email address', 'error')
      return
    }

    try {
      const result = await db.addExternalRecipient(
        selectedRole.id,
        newEmail,
        newEmailName,
        newEmailNotes,
        user.id
      )

      if (result.success) {
        onShowToast?.(`External email added to ${selectedRole.role_name}`, 'success')
        setNewEmail('')
        setNewEmailName('')
        setNewEmailNotes('')
        setShowAddEmailModal(false)
        loadRoleUsers(selectedRole.id)
      } else {
        onShowToast?.(result.error || 'Failed to add external email', 'error')
      }
    } catch (error) {
      console.error('Error adding external email:', error)
      onShowToast?.('Failed to add external email', 'error')
    }
  }

  const handleRemoveExternalEmail = async (recipientId) => {
    if (!confirm('Remove this external email from notifications?')) return

    try {
      const result = await db.removeExternalRecipient(recipientId)
      if (result.success) {
        onShowToast?.('External email removed', 'success')
        loadRoleUsers(selectedRole.id)
      } else {
        onShowToast?.(result.error || 'Failed to remove external email', 'error')
      }
    } catch (error) {
      console.error('Error removing external email:', error)
      onShowToast?.('Failed to remove external email', 'error')
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
        {canManageRoles && (
          <button
            className={`settings-tab ${activeSection === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveSection('roles')}
          >
            Manage Roles
          </button>
        )}
        <button
          className={`settings-tab ${activeSection === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveSection('preferences')}
        >
          My Preferences
        </button>
      </div>

      {/* ROLES SECTION - Admin/Office Only */}
      {activeSection === 'roles' && canManageRoles && (
        <div className="roles-section">
          <div className="section-header">
            <div>
              <h2>Manage Notification Roles</h2>
              <p>Assign users and external emails to roles that receive specific notifications</p>
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
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => setShowAddUserModal(true)}
                      disabled={availableUsers.length === 0}
                    >
                      + Assign User
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setShowAddEmailModal(true)}
                    >
                      + Add Email
                    </button>
                  </div>
                </div>

                <div className="assigned-users">
                  {roleUsers.length === 0 && externalRecipients.length === 0 ? (
                    <div className="empty-state">
                      <p>No recipients assigned to this role yet</p>
                      <button onClick={() => setShowAddUserModal(true)}>
                        Assign first user
                      </button>
                      <button onClick={() => setShowAddEmailModal(true)} style={{ marginTop: '0.5rem' }}>
                        Add external email
                      </button>
                    </div>
                  ) : (
                    <>
                      {roleUsers.length > 0 && <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>App Users ({roleUsers.length})</h4>}
                      {roleUsers.map(ru => (
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
                      ))}

                      {externalRecipients.length > 0 && (
                        <>
                          <h4 style={{ margin: '1.5rem 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>External Emails ({externalRecipients.length})</h4>
                          {externalRecipients.map(recipient => (
                            <div key={recipient.id} className="assigned-user-card" style={{ borderLeft: '3px solid var(--accent-blue)' }}>
                              <div className="user-info">
                                <div className="user-name">{recipient.name || recipient.email}</div>
                                <div className="user-email">{recipient.email}</div>
                                {recipient.notes && (
                                  <div className="user-meta">{recipient.notes}</div>
                                )}
                                <div className="user-meta">
                                  Added {new Date(recipient.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <button
                                className="btn-danger-small"
                                onClick={() => handleRemoveExternalEmail(recipient.id)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </>
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

          {/* My Assigned Roles */}
          {myRoles.length > 0 && (
            <div className="my-roles-section" style={{
              background: 'var(--bg-card)',
              padding: '1.5rem',
              borderRadius: '12px',
              marginBottom: '2rem',
              border: '2px solid var(--accent-blue)'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--accent-blue)' }}>
                My Notification Roles
              </h3>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                You are assigned to receive notifications for the following roles. {canManageRoles ? 'Switch to "Manage Roles" to change assignments.' : 'Contact your office admin to change role assignments.'}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {myRoles.map(role => (
                  <div key={role.id} style={{
                    background: 'var(--accent-blue-light)',
                    border: '1px solid var(--accent-blue)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {role.role_name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {role.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

      {/* Add Email Modal */}
      {showAddEmailModal && (
        <div className="modal-overlay" onClick={() => setShowAddEmailModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add External Email to {selectedRole?.role_name}</h3>
              <button className="modal-close" onClick={() => setShowAddEmailModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddExternalEmail}>
              <div className="modal-body">
                <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Add an email address for someone who doesn't have an app account. They'll receive email notifications only.
                </p>
                <div className="form-group">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="vendor@example.com"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Name (Optional)</label>
                  <input
                    type="text"
                    value={newEmailName}
                    onChange={(e) => setNewEmailName(e.target.value)}
                    placeholder="John Doe"
                  />
                  <small>Helps identify this recipient</small>
                </div>
                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <input
                    type="text"
                    value={newEmailNotes}
                    onChange={(e) => setNewEmailNotes(e.target.value)}
                    placeholder="e.g., External vendor contact"
                  />
                  <small>Internal notes about this recipient</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddEmailModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
