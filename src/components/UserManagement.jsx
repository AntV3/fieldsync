import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function UserManagement({ company, currentUser, onShowToast }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUsers()
  }, [company?.id])

  const loadUsers = async () => {
    if (!company?.id) return

    try {
      setLoading(true)
      const data = await db.getCompanyUsers(company.id)
      setUsers(data || [])
    } catch (error) {
      console.error('Error loading users:', error)
      onShowToast?.('Failed to load users', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    // Prevent user from demoting themselves
    if (userId === currentUser.id && newRole !== 'admin') {
      onShowToast?.('You cannot change your own role', 'error')
      return
    }

    try {
      const result = await db.updateUserRole(userId, newRole)

      if (result.success) {
        onShowToast?.(`User role updated to ${newRole}`, 'success')
        await loadUsers()
      } else {
        onShowToast?.(result.error || 'Failed to update user role', 'error')
      }
    } catch (error) {
      console.error('Error updating role:', error)
      onShowToast?.('Failed to update user role', 'error')
    }
  }

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin': return 'role-badge role-admin'
      case 'office': return 'role-badge role-office'
      case 'foreman': return 'role-badge role-foreman'
      default: return 'role-badge'
    }
  }

  if (loading) {
    return (
      <div className="settings-loading">
        <div className="spinner"></div>
        <p>Loading users...</p>
      </div>
    )
  }

  return (
    <div className="user-management">
      <div className="settings-header">
        <h2>👥 User Management</h2>
        <p className="help-text">Manage user roles and permissions</p>
      </div>

      <div className="settings-section">
        <h3>Company Users</h3>

        <div className="user-list">
          <table className="user-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>
                    {user.name || 'Unnamed User'}
                    {user.id === currentUser.id && (
                      <span className="badge-you"> (You)</span>
                    )}
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <span className={getRoleBadgeClass(user.role)}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <select
                      className="role-select"
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={user.id === currentUser.id}
                    >
                      <option value="admin">Admin</option>
                      <option value="office">Office</option>
                      <option value="foreman">Foreman</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="role-info">
          <h4>Role Permissions</h4>
          <ul>
            <li><strong>Admin:</strong> Full access to all features including company settings, branding, and user management</li>
            <li><strong>Office:</strong> Can manage projects, T&M tickets, and view reports. Cannot access company settings or branding</li>
            <li><strong>Foreman:</strong> Field access only - can log work, submit T&M, and communicate with office</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
