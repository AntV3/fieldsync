import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import PermissionEditor from './PermissionEditor'

export default function ProjectTeam({ project, user, onShowToast }) {
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState([])
  const [allCompanyUsers, setAllCompanyUsers] = useState([])
  const [roleTemplates, setRoleTemplates] = useState([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showPermissionEditor, setShowPermissionEditor] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)

  // Invite form
  const [inviteUserId, setInviteUserId] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteTemplate, setInviteTemplate] = useState('')

  // Get user's project role
  const userProjectRole = teamMembers.find(m => m.user_id === user?.id)?.project_role

  // Check if user can manage team
  const canManageTeam = userProjectRole === 'owner' || userProjectRole === 'manager'

  useEffect(() => {
    if (project?.id) {
      loadTeamData()
    }
  }, [project?.id])

  const loadTeamData = async () => {
    setLoading(true)
    try {
      // Load team members
      const team = await db.getProjectTeam(project.id)
      setTeamMembers(team)

      // Load all company users for inviting
      if (canManageTeam) {
        const users = await db.getUsersForCompany(project.company_id)
        setAllCompanyUsers(users)

        // Load role templates
        const templates = await db.getRoleTemplates()
        setRoleTemplates(templates)
      }
    } catch (error) {
      console.error('Error loading team data:', error)
      onShowToast?.('Error loading team', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteUser = async (e) => {
    e.preventDefault()
    if (!inviteUserId) {
      onShowToast?.('Please select a user', 'error')
      return
    }

    // Check if user is already on project
    if (teamMembers.some(m => m.user_id === inviteUserId)) {
      onShowToast?.('User is already on this project', 'error')
      return
    }

    try {
      const result = await db.inviteUserToProject(
        project.id,
        inviteUserId,
        inviteRole,
        user.id
      )

      if (result.success) {
        // If template selected, apply default permissions
        if (inviteTemplate && inviteRole !== 'owner' && inviteRole !== 'manager') {
          const template = roleTemplates.find(t => t.role_key === inviteTemplate)
          if (template && result.data?.id) {
            await db.grantProjectPermissions(
              result.data.id,
              template.default_permissions,
              user.id
            )
          }
        }

        onShowToast?.('User invited to project!', 'success')
        setInviteUserId('')
        setInviteRole('member')
        setInviteTemplate('')
        setShowInviteModal(false)
        loadTeamData()
      } else {
        onShowToast?.(result.error || 'Failed to invite user', 'error')
      }
    } catch (error) {
      console.error('Error inviting user:', error)
      onShowToast?.('Failed to invite user', 'error')
    }
  }

  const handleRemoveMember = async (memberId, memberName) => {
    if (!confirm(`Remove ${memberName} from this project?`)) return

    try {
      const result = await db.removeUserFromProject(memberId)
      if (result.success) {
        onShowToast?.('User removed from project', 'success')
        loadTeamData()
      } else {
        onShowToast?.(result.error || 'Failed to remove user', 'error')
      }
    } catch (error) {
      console.error('Error removing user:', error)
      onShowToast?.('Failed to remove user', 'error')
    }
  }

  const handleEditPermissions = (member) => {
    setSelectedMember(member)
    setShowPermissionEditor(true)
  }

  const handlePermissionsUpdated = () => {
    loadTeamData()
    setShowPermissionEditor(false)
    setSelectedMember(null)
  }

  // Get users not yet on project
  const availableUsers = allCompanyUsers.filter(u =>
    !teamMembers.some(m => m.user_id === u.id)
  )

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'owner': return 'var(--accent-purple)'
      case 'manager': return 'var(--accent-blue)'
      case 'member': return 'var(--accent-green)'
      case 'viewer': return 'var(--text-secondary)'
      default: return 'var(--text-secondary)'
    }
  }

  const getRoleLabel = (role) => {
    switch (role) {
      case 'owner': return 'Owner'
      case 'manager': return 'Manager'
      case 'member': return 'Member'
      case 'viewer': return 'Viewer'
      default: return role
    }
  }

  if (loading) {
    return (
      <div className="project-team">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading team...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="project-team">
      <div className="team-header">
        <div>
          <h2>Project Team</h2>
          <p>{teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}</p>
        </div>
        {canManageTeam && (
          <button
            className="btn-primary"
            onClick={() => setShowInviteModal(true)}
            disabled={availableUsers.length === 0}
          >
            + Invite User
          </button>
        )}
      </div>

      <div className="team-list">
        {teamMembers.map(member => (
          <div key={member.id} className="team-member-card">
            <div className="member-info">
              <div className="member-header">
                <div className="member-name">{member.users.name || member.users.email}</div>
                <div
                  className="member-role-badge"
                  style={{ backgroundColor: getRoleBadgeColor(member.project_role) }}
                >
                  {getRoleLabel(member.project_role)}
                </div>
              </div>
              <div className="member-email">{member.users.email}</div>
              <div className="member-meta">
                Joined {new Date(member.joined_at).toLocaleDateString()}
              </div>
            </div>

            {canManageTeam && member.user_id !== user.id && (
              <div className="member-actions">
                {(member.project_role === 'member' || member.project_role === 'viewer') && (
                  <button
                    className="btn-secondary-small"
                    onClick={() => handleEditPermissions(member)}
                  >
                    Permissions
                  </button>
                )}
                <button
                  className="btn-danger-small"
                  onClick={() => handleRemoveMember(member.id, member.users.name || member.users.email)}
                >
                  Remove
                </button>
              </div>
            )}
            {member.user_id === user.id && (
              <div className="member-badge">You</div>
            )}
          </div>
        ))}
      </div>

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Invite User to Project</h3>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}>×</button>
            </div>
            <form onSubmit={handleInviteUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Select User *</label>
                  <select
                    value={inviteUserId}
                    onChange={(e) => setInviteUserId(e.target.value)}
                    required
                  >
                    <option value="">Choose a user...</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Project Role *</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    required
                  >
                    <option value="member">Member - Active participant</option>
                    <option value="manager">Manager - Can manage team & settings</option>
                    <option value="viewer">Viewer - Read-only access</option>
                    {userProjectRole === 'owner' && (
                      <option value="owner">Owner - Full control</option>
                    )}
                  </select>
                </div>

                {(inviteRole === 'member' || inviteRole === 'viewer') && (
                  <div className="form-group">
                    <label>Functional Role Template (Optional)</label>
                    <select
                      value={inviteTemplate}
                      onChange={(e) => setInviteTemplate(e.target.value)}
                    >
                      <option value="">None - Set permissions manually later</option>
                      {roleTemplates.map(template => (
                        <option key={template.role_key} value={template.role_key}>
                          {template.role_name} - {template.description}
                        </option>
                      ))}
                    </select>
                    <small>
                      Templates provide smart default permissions. You can customize after inviting.
                    </small>
                  </div>
                )}

                {(inviteRole === 'owner' || inviteRole === 'manager') && (
                  <div className="info-box" style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <strong>Note:</strong> {inviteRole === 'owner' ? 'Owners' : 'Managers'} have full access to all project features and don't need functional role templates.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowInviteModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Invite User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permission Editor Modal */}
      {showPermissionEditor && selectedMember && (
        <PermissionEditor
          member={selectedMember}
          project={project}
          user={user}
          onClose={() => {
            setShowPermissionEditor(false)
            setSelectedMember(null)
          }}
          onUpdate={handlePermissionsUpdated}
          onShowToast={onShowToast}
        />
      )}
    </div>
  )
}
