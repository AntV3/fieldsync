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
    { id: 'material_requests', label: 'Material Requests', description: 'Assign users to handle material requests from the field' },
    { id: 'equipment_requests', label: 'Equipment Requests', description: 'Assign users to handle equipment requests' },
    { id: 'injury_reports', label: 'Injury & Incident Reports', description: 'Assign users to receive workplace injury notifications' },
    { id: 'tm_tickets', label: 'T&M Ticket Approvals', description: 'Assign users who can approve time and materials tickets' },
    { id: 'daily_reports', label: 'Daily Reports', description: 'Assign users to receive end-of-day field reports' },
    { id: 'messages', label: 'Field Messages', description: 'Assign users to receive direct messages from field teams' }
  ]

  useEffect(() => {
    if (company?.id) {
      loadData()
    }
  }, [company?.id])

  const loadData = async () => {
    if (!company?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const usersData = await db.getCompanyUsers(company.id)
      setUsers(usersData)

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
        await db.removeNotificationAssignment(company.id, notificationType, userId)
        setNotificationAssignments(prev =>
          prev.filter(a => !(a.notification_type === notificationType && a.assigned_user_id === userId))
        )
        onShowToast('Assignment removed', 'success')
      } else {
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
      <p className="subtitle">Manage notifications, users, and company settings</p>

      {/* Settings Navigation */}
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeSection === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveSection('notifications')}
        >
          Notifications
        </button>
        <button
          className={`settings-tab ${activeSection === 'users' ? 'active' : ''}`}
          onClick={() => setActiveSection('users')}
        >
          Users
        </button>
        <button
          className={`settings-tab ${activeSection === 'company' ? 'active' : ''}`}
          onClick={() => setActiveSection('company')}
        >
          Company
        </button>
      </div>

      {/* Notification Assignments Section */}
      {activeSection === 'notifications' && (
        <div className="card">
          <h3>Notification Routing</h3>
          <p className="section-description">
            Route notifications to specific team members. Multiple users can be assigned to each notification type.
          </p>

          <div className="notification-list">
            {notificationTypes.map(type => {
              const assignedUsers = getAssignedUsers(type.id)

              return (
                <div key={type.id} className="notification-section">
                  <div className="notification-header">
                    <div>
                      <div className="notification-title">{type.label}</div>
                      <div className="notification-description">{type.description}</div>
                      {assignedUsers.length > 0 && (
                        <div className="assigned-users-list">
                          Currently assigned: {assignedUsers.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="user-checkboxes">
                    {users.map(user => (
                      <label key={user.id} className="user-checkbox">
                        <input
                          type="checkbox"
                          checked={isUserAssigned(type.id, user.id)}
                          onChange={() => handleToggleAssignment(type.id, user.id)}
                          disabled={saving}
                        />
                        <span className="user-checkbox-label">
                          <span className="user-checkbox-name">{user.full_name || user.email}</span>
                          <span className="user-checkbox-role">{user.role}</span>
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
          <div className="card-header-with-action">
            <h3>Team Members</h3>
            <button className="btn-primary btn-sm">
              Invite User
            </button>
          </div>

          <div className="user-list">
            {users.length === 0 ? (
              <div className="empty-state-compact">
                <p>No users found</p>
              </div>
            ) : (
              users.map(user => (
                <div key={user.id} className="user-card">
                  <div className="user-info">
                    <div className="user-name-display">{user.full_name || 'Unnamed User'}</div>
                    <div className="user-email-display">{user.email}</div>
                  </div>
                  <div className="user-badge-container">
                    <span className={`role-badge role-${user.role}`}>
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

          <div className="form-section">
            <label className="form-label">Company Name</label>
            <input
              type="text"
              className="form-input"
              value={company?.name || ''}
              disabled
            />
            <p className="form-help">Contact support to change your company name</p>
          </div>

          <div className="form-section">
            <label className="form-label">Company Code</label>
            <input
              type="text"
              className="form-input"
              value={company?.company_code || ''}
              disabled
            />
            <p className="form-help">Share this code with team members to join your company</p>
          </div>
        </div>
      )}

      <style>{`
        .settings-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 2rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .settings-tab {
          padding: 1rem 1.5rem;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: #6b7280;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .settings-tab:hover {
          color: #111827;
          background: #f9fafb;
        }

        .settings-tab.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }

        .section-description {
          color: #6b7280;
          margin-bottom: 2rem;
          font-size: 0.9375rem;
        }

        .notification-list {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .notification-section {
          padding-bottom: 2rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .notification-section:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .notification-header {
          margin-bottom: 1rem;
        }

        .notification-title {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.375rem;
        }

        .notification-description {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }

        .assigned-users-list {
          font-size: 0.875rem;
          color: #059669;
          font-weight: 500;
          margin-top: 0.5rem;
        }

        .user-checkboxes {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 0.75rem;
        }

        .user-checkbox {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .user-checkbox:hover {
          border-color: #2563eb;
          background: #eff6ff;
        }

        .user-checkbox input[type="checkbox"] {
          width: 1.125rem;
          height: 1.125rem;
          cursor: pointer;
          flex-shrink: 0;
        }

        .user-checkbox-label {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 0;
        }

        .user-checkbox-name {
          font-weight: 500;
          color: #111827;
          font-size: 0.9375rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .user-checkbox-role {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: capitalize;
        }

        .card-header-with-action {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        .user-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .user-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: white;
        }

        .user-info {
          flex: 1;
          min-width: 0;
        }

        .user-name-display {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.25rem;
        }

        .user-email-display {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .user-badge-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .role-badge {
          padding: 0.375rem 0.75rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .role-badge.role-owner {
          background: #dbeafe;
          color: #1e40af;
        }

        .role-badge.role-admin {
          background: #e0e7ff;
          color: #4338ca;
        }

        .role-badge.role-manager {
          background: #fef3c7;
          color: #92400e;
        }

        .role-badge.role-member {
          background: #f3f4f6;
          color: #374151;
        }

        .role-badge.role-foreman {
          background: #d1fae5;
          color: #065f46;
        }

        .form-section {
          margin-bottom: 1.5rem;
        }

        .form-label {
          display: block;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
          font-size: 0.9375rem;
        }

        .form-input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9375rem;
          background: white;
        }

        .form-input:disabled {
          background: #f9fafb;
          color: #9ca3af;
        }

        .form-help {
          font-size: 0.8125rem;
          color: #6b7280;
          margin-top: 0.5rem;
        }

        @media (max-width: 768px) {
          .user-checkboxes {
            grid-template-columns: 1fr;
          }

          .user-card {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  )
}
