import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function Settings({ onShowToast }) {
  const { company, user } = useAuth()
  const [activeSection, setActiveSection] = useState('notifications')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [notificationAssignments, setNotificationAssignments] = useState([])
  const [saving, setSaving] = useState(false)

  const notificationTypes = [
    { id: 'material_requests', label: 'Material Requests', icon: '📦', description: 'Who gets notified when field requests materials' },
    { id: 'equipment_requests', label: 'Equipment Requests', icon: '🔧', description: 'Who gets notified when field requests equipment' },
    { id: 'injury_reports', label: 'Injury Reports', icon: '🚨', description: 'Who gets notified of workplace injuries/incidents' },
    { id: 'tm_tickets', label: 'T&M Tickets', icon: '📝', description: 'Who approves time and materials tickets' },
    { id: 'daily_reports', label: 'Daily Reports', icon: '📋', description: 'Who receives end-of-day field reports' },
    { id: 'messages', label: 'Field Messages', icon: '💬', description: 'Who receives messages from the field' }
  ]

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load company users
      const usersData = await db.getCompanyUsers(company.id)
      setUsers(usersData)

      // Load notification assignments
      const assignmentsData = await db.getNotificationAssignments(company.id)
      setNotificationAssignments(assignmentsData)
    } catch (error) {
      console.error('Error loading settings:', error)
      onShowToast('Error loading settings', 'error')
    } finally {
      setLoading(false)
    }
  }

  const isUserAssigned = (notificationType, userId) => {
    return notificationAssignments.some(
      a => a.notification_type === notificationType && a.assigned_user_id === userId
    )
  }

  const handleToggleAssignment = async (notificationType, userId) => {
    const isAssigned = isUserAssigned(notificationType, userId)

    setSaving(true)
    try {
      if (isAssigned) {
        // Remove assignment
        await db.removeNotificationAssignment(company.id, notificationType, userId)
        setNotificationAssignments(prev =>
          prev.filter(a => !(a.notification_type === notificationType && a.assigned_user_id === userId))
        )
        onShowToast('Assignment removed', 'success')
      } else {
        // Add assignment
        const newAssignment = await db.createNotificationAssignment({
          company_id: company.id,
          notification_type: notificationType,
          assigned_user_id: userId,
          created_by: user.id
        })
        setNotificationAssignments(prev => [...prev, newAssignment])
        onShowToast('User assigned', 'success')
      }
    } catch (error) {
      console.error('Error toggling assignment:', error)
      onShowToast('Error updating assignment', 'error')
    } finally {
      setSaving(false)
    }
  }

  const getAssignedUsers = (notificationType) => {
    return notificationAssignments
      .filter(a => a.notification_type === notificationType)
      .map(a => {
        const user = users.find(u => u.id === a.assigned_user_id)
        return user?.full_name || user?.email || 'Unknown'
      })
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading settings...
      </div>
    )
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="subtitle">Manage company settings and user permissions</p>

      {/* Settings Navigation */}
      <div className="settings-nav">
        <button
          className={`settings-nav-btn ${activeSection === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveSection('notifications')}
        >
          🔔 Notification Assignments
        </button>
        <button
          className={`settings-nav-btn ${activeSection === 'users' ? 'active' : ''}`}
          onClick={() => setActiveSection('users')}
        >
          👥 User Management
        </button>
        <button
          className={`settings-nav-btn ${activeSection === 'company' ? 'active' : ''}`}
          onClick={() => setActiveSection('company')}
        >
          🏢 Company Settings
        </button>
      </div>

      {/* Notification Assignments Section */}
      {activeSection === 'notifications' && (
        <div className="card">
          <h3>Notification Assignments</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Assign specific team members to receive notifications for different types of events.
            Multiple users can be assigned to each notification type.
          </p>

          <div className="notification-types-list">
            {notificationTypes.map(type => {
              const assignedUsers = getAssignedUsers(type.id)

              return (
                <div key={type.id} className="notification-type-card">
                  <div className="notification-type-header">
                    <div className="notification-type-info">
                      <div className="notification-type-title">
                        <span className="notification-type-icon">{type.icon}</span>
                        <span className="notification-type-label">{type.label}</span>
                      </div>
                      <div className="notification-type-description">{type.description}</div>
                      {assignedUsers.length > 0 && (
                        <div className="notification-assigned-users">
                          Assigned to: {assignedUsers.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="notification-user-assignments">
                    {users.map(user => (
                      <label key={user.id} className="assignment-checkbox">
                        <input
                          type="checkbox"
                          checked={isUserAssigned(type.id, user.id)}
                          onChange={() => handleToggleAssignment(type.id, user.id)}
                          disabled={saving}
                        />
                        <span className="assignment-user-info">
                          <span className="assignment-user-name">{user.full_name || user.email}</span>
                          <span className="assignment-user-role">{user.role}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* User Management Section */}
      {activeSection === 'users' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3>User Management</h3>
            <button className="btn btn-primary btn-small">
              + Invite User
            </button>
          </div>

          <div className="users-list">
            {users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                No users found
              </div>
            ) : (
              users.map(user => (
                <div key={user.id} className="user-item">
                  <div className="user-info">
                    <div className="user-name">{user.full_name || 'Unnamed User'}</div>
                    <div className="user-email">{user.email}</div>
                  </div>
                  <div className="user-meta">
                    <span className={`user-role-badge ${user.role}`}>
                      {user.role}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Company Settings Section */}
      {activeSection === 'company' && (
        <div className="card">
          <h3>Company Information</h3>

          <div className="form-group">
            <label>Company Name</label>
            <input
              type="text"
              value={company?.name || ''}
              disabled
              style={{ background: '#f9fafb' }}
            />
            <small style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'block' }}>
              Contact support to change company name
            </small>
          </div>

          <div className="form-group">
            <label>Company Code</label>
            <input
              type="text"
              value={company?.company_code || ''}
              disabled
              style={{ background: '#f9fafb' }}
            />
            <small style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'block' }}>
              Share this code with team members to join your company
            </small>
          </div>
        </div>
      )}

      <style>{`
        .settings-nav {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          border-bottom: 2px solid #e5e7eb;
          overflow-x: auto;
        }

        .settings-nav-btn {
          padding: 1rem 1.5rem;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          color: #6b7280;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }

        .settings-nav-btn:hover {
          color: #111827;
          background: #f9fafb;
        }

        .settings-nav-btn.active {
          color: var(--primary-color, #3b82f6);
          border-bottom-color: var(--primary-color, #3b82f6);
        }

        .notification-types-list {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .notification-type-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          background: #ffffff;
        }

        .notification-type-header {
          margin-bottom: 1rem;
        }

        .notification-type-info {
          flex: 1;
        }

        .notification-type-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .notification-type-icon {
          font-size: 1.5rem;
        }

        .notification-type-label {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
        }

        .notification-type-description {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }

        .notification-assigned-users {
          font-size: 0.875rem;
          color: #10b981;
          font-weight: 500;
        }

        .notification-user-assignments {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 0.75rem;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 6px;
        }

        .assignment-checkbox {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .assignment-checkbox:hover {
          border-color: var(--primary-color, #3b82f6);
          background: #f0f9ff;
        }

        .assignment-checkbox input[type="checkbox"] {
          width: 1.25rem;
          height: 1.25rem;
          cursor: pointer;
        }

        .assignment-user-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .assignment-user-name {
          font-weight: 500;
          color: #111827;
        }

        .assignment-user-role {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: capitalize;
        }

        .users-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .user-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: #ffffff;
        }

        .user-info {
          flex: 1;
        }

        .user-name {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .user-email {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .user-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .user-role-badge {
          padding: 0.375rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .user-role-badge.owner {
          background: #dbeafe;
          color: #1e40af;
        }

        .user-role-badge.admin {
          background: #e0e7ff;
          color: #4338ca;
        }

        .user-role-badge.manager {
          background: #fef3c7;
          color: #92400e;
        }

        .user-role-badge.member {
          background: #f3f4f6;
          color: #374151;
        }

        .user-role-badge.foreman {
          background: #ecfdf5;
          color: #065f46;
        }

        @media (max-width: 768px) {
          .notification-user-assignments {
            grid-template-columns: 1fr;
          }

          .user-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  )
}
