import { useState, useEffect } from 'react'
import { db, supabase } from '../lib/supabase'

/**
 * Team Management Component
 * Manage team members, invitations, and roles
 */
export default function TeamManagement({ company, currentUser, onShowToast }) {
  const [teamMembers, setTeamMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'field',
    message: ''
  })
  const [inviting, setInviting] = useState(false)

  const roles = [
    { value: 'admin', label: 'Admin', description: 'Full access to everything' },
    { value: 'office', label: 'Office', description: 'Manage projects, view reports' },
    { value: 'foreman', label: 'Foreman', description: 'Manage assigned projects' },
    { value: 'field', label: 'Field Worker', description: 'View and update tasks' }
  ]

  useEffect(() => {
    loadTeamData()
  }, [company])

  const loadTeamData = async () => {
    try {
      setLoading(true)

      // Load team members
      const { data: members, error: membersError } = await supabase
        .from('users')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })

      if (membersError) throw membersError
      setTeamMembers(members || [])

      // Load pending invitations
      const { data: invites, error: invitesError } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('company_id', company.id)
        .eq('status', 'pending')
        .order('invited_at', { ascending: false })

      if (invitesError) throw invitesError
      setInvitations(invites || [])
    } catch (error) {
      console.error('Error loading team data:', error)
      onShowToast?.('Error loading team data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteUser = async (e) => {
    e.preventDefault()
    setInviting(true)

    try {
      // Call RPC function to create invitation
      const { data, error } = await supabase.rpc('create_invitation', {
        p_company_id: company.id,
        p_email: inviteForm.email.toLowerCase().trim(),
        p_role: inviteForm.role,
        p_invited_by_id: currentUser.id,
        p_invited_by_name: currentUser.full_name || currentUser.email,
        p_message: inviteForm.message || null,
        p_project_ids: []
      })

      if (error) throw error

      onShowToast?.(`Invitation sent to ${inviteForm.email}`, 'success')

      // Reset form and close modal
      setInviteForm({ email: '', role: 'field', message: '' })
      setShowInviteModal(false)

      // Reload data
      loadTeamData()
    } catch (error) {
      console.error('Error inviting user:', error)
      onShowToast?.(error.message || 'Error sending invitation', 'error')
    } finally {
      setInviting(false)
    }
  }

  const handleRevokeInvitation = async (invitationId) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return

    try {
      const { error } = await supabase
        .from('user_invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId)

      if (error) throw error

      onShowToast?.('Invitation revoked', 'success')
      loadTeamData()
    } catch (error) {
      console.error('Error revoking invitation:', error)
      onShowToast?.('Error revoking invitation', 'error')
    }
  }

  const handleRemoveUser = async (userId, userName) => {
    if (!confirm(`Are you sure you want to remove ${userName} from your team?`)) return

    try {
      const { error } = await supabase
        .from('users')
        .update({ company_id: null, role: null })
        .eq('id', userId)

      if (error) throw error

      onShowToast?.(`${userName} removed from team`, 'success')
      loadTeamData()
    } catch (error) {
      console.error('Error removing user:', error)
      onShowToast?.('Error removing user', 'error')
    }
  }

  const handleChangeRole = async (userId, userName, newRole) => {
    if (!confirm(`Change ${userName}'s role to ${newRole}?`)) return

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) throw error

      onShowToast?.(`${userName}'s role updated to ${newRole}`, 'success')
      loadTeamData()
    } catch (error) {
      console.error('Error updating role:', error)
      onShowToast?.('Error updating role', 'error')
    }
  }

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin': return 'badge-admin'
      case 'office': return 'badge-office'
      case 'foreman': return 'badge-foreman'
      case 'field': return 'badge-field'
      default: return ''
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const canManageTeam = currentUser?.role === 'admin' || currentUser?.role === 'office'

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div className="team-management-container">
      <div className="page-header">
        <div>
          <h1>Team Management</h1>
          <p className="text-muted">
            {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
            {invitations.length > 0 && ` · ${invitations.length} pending invitation${invitations.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {canManageTeam && (
          <button
            className="btn btn-primary"
            onClick={() => setShowInviteModal(true)}
          >
            + Invite Team Member
          </button>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="invitations-section">
          <h3>Pending Invitations</h3>
          <div className="invitations-list">
            {invitations.map(invite => (
              <div key={invite.id} className="invitation-card">
                <div className="invitation-info">
                  <div className="invitation-email">{invite.email}</div>
                  <div className="invitation-meta">
                    <span className={`badge ${getRoleBadgeClass(invite.role)}`}>
                      {invite.role}
                    </span>
                    <span className="text-muted">
                      Invited by {invite.invited_by_name} on {formatDate(invite.invited_at)}
                    </span>
                  </div>
                  {invite.message && (
                    <div className="invitation-message">{invite.message}</div>
                  )}
                </div>
                {canManageTeam && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => handleRevokeInvitation(invite.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="team-members-section">
        <h3>Team Members</h3>
        <div className="table-container">
          <table className="team-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                {canManageTeam && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map(member => (
                <tr key={member.id}>
                  <td>
                    <div className="member-name">
                      {member.full_name || 'Unnamed User'}
                      {member.id === currentUser.id && (
                        <span className="badge badge-info">You</span>
                      )}
                    </div>
                  </td>
                  <td>{member.email}</td>
                  <td>
                    {canManageTeam && member.id !== currentUser.id ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleChangeRole(member.id, member.full_name || member.email, e.target.value)}
                        className="role-selector"
                      >
                        {roles.map(role => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge ${getRoleBadgeClass(member.role)}`}>
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="text-muted">{formatDate(member.created_at)}</td>
                  {canManageTeam && (
                    <td>
                      {member.id !== currentUser.id && (
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleRemoveUser(member.id, member.full_name || member.email)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invite Team Member</h2>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>×</button>
            </div>

            <form onSubmit={handleInviteUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="colleague@example.com"
                    required
                    className="input-full"
                  />
                </div>

                <div className="form-group">
                  <label>Role *</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                    className="input-full"
                    required
                  >
                    {roles.map(role => (
                      <option key={role.value} value={role.value}>
                        {role.label} - {role.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Personal Message (Optional)</label>
                  <textarea
                    value={inviteForm.message}
                    onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                    placeholder="Add a personal note to your invitation..."
                    rows="3"
                    className="input-full"
                  />
                </div>

                <div className="info-box">
                  <p>
                    They'll receive an email with a link to join your team.
                    The invitation expires in 7 days.
                  </p>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="btn btn-secondary"
                  disabled={inviting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={inviting}
                >
                  {inviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
