import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { Users, UserPlus, UserMinus, ChevronDown, X } from 'lucide-react'

const PROJECT_ROLE_OPTIONS = [
  'Project Manager',
  'Superintendent',
  'Foreman',
  'Office Support',
  'Engineer',
  'Inspector',
  'Team Member'
]

export default function ProjectTeam({ project, company, user, isAdmin, onShowToast }) {
  const [teamMembers, setTeamMembers] = useState([])
  const [companyMembers, setCompanyMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedRole, setSelectedRole] = useState('Team Member')
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    if (project?.id) {
      loadProjectTeam()
    }
  }, [project?.id])

  useEffect(() => {
    if (showAddModal && company?.id) {
      loadCompanyMembers()
    }
  }, [showAddModal, company?.id])

  const loadProjectTeam = async () => {
    try {
      setLoading(true)
      const data = await db.getProjectTeam(project.id)
      setTeamMembers(data)
    } catch (error) {
      console.error('Error loading project team:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCompanyMembers = async () => {
    try {
      const data = await db.getCompanyMembers(company.id)
      // Filter out users already on the project
      const existingUserIds = teamMembers.map(tm => tm.users?.id)
      const available = data.filter(m => !existingUserIds.includes(m.users?.id))
      setCompanyMembers(available)
    } catch (error) {
      console.error('Error loading company members:', error)
    }
  }

  const handleAddMember = async () => {
    if (!selectedUser) {
      onShowToast('Select a team member', 'error')
      return
    }

    try {
      setActionLoading('add')
      await db.addProjectMember(project.id, selectedUser, selectedRole, user.id)
      onShowToast('Team member added', 'success')
      setShowAddModal(false)
      setSelectedUser('')
      setSelectedRole('Team Member')
      loadProjectTeam()
    } catch (error) {
      console.error('Error adding team member:', error)
      onShowToast('Error adding team member', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUpdateRole = async (member, newRole) => {
    try {
      setActionLoading(member.id)
      await db.updateProjectMemberRole(project.id, member.users?.id, newRole)
      onShowToast('Role updated', 'success')
      loadProjectTeam()
    } catch (error) {
      console.error('Error updating role:', error)
      onShowToast('Error updating role', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveMember = async (member) => {
    try {
      setActionLoading(member.id)
      await db.removeProjectMember(project.id, member.users?.id)
      onShowToast('Team member removed', 'success')
      loadProjectTeam()
    } catch (error) {
      console.error('Error removing team member:', error)
      onShowToast('Error removing team member', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="project-team">
        <div className="project-team-header">
          <h3><Users size={18} /> Project Team</h3>
        </div>
        <div className="loading-small">Loading...</div>
      </div>
    )
  }

  return (
    <div className="project-team">
      <div className="project-team-header">
        <h3><Users size={18} /> Project Team</h3>
        {isAdmin && (
          <button
            className="btn btn-small btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <UserPlus size={14} /> Add
          </button>
        )}
      </div>

      {teamMembers.length === 0 ? (
        <div className="project-team-empty">
          No team members assigned yet
          {isAdmin && <p>Click "Add" to assign team members to this project</p>}
        </div>
      ) : (
        <div className="project-team-list">
          {teamMembers.map(member => (
            <div key={member.id} className="project-team-member">
              <div className="team-member-info">
                <div className="team-member-name">{member.users?.name || 'Unknown'}</div>
                <div className="team-member-email">{member.users?.email}</div>
              </div>
              <div className="team-member-role">
                {isAdmin ? (
                  <div className="role-selector compact">
                    <select
                      value={member.project_role}
                      onChange={(e) => handleUpdateRole(member, e.target.value)}
                      disabled={actionLoading === member.id}
                      className="role-select"
                    >
                      {PROJECT_ROLE_OPTIONS.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="role-select-icon" />
                  </div>
                ) : (
                  <span className="role-badge">{member.project_role}</span>
                )}
              </div>
              {isAdmin && (
                <button
                  className="btn-icon btn-danger-subtle"
                  onClick={() => handleRemoveMember(member)}
                  disabled={actionLoading === member.id}
                  title="Remove from project"
                >
                  <UserMinus size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Team Member</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Select Team Member</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="form-select"
                >
                  <option value="">Choose a team member...</option>
                  {companyMembers.map(member => (
                    <option key={member.users?.id} value={member.users?.id}>
                      {member.users?.name || member.users?.email}
                    </option>
                  ))}
                </select>
                {companyMembers.length === 0 && (
                  <p className="form-hint">All company members are already assigned to this project</p>
                )}
              </div>
              <div className="form-group">
                <label>Project Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="form-select"
                >
                  {PROJECT_ROLE_OPTIONS.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <p className="form-hint">This is for visibility only - it doesn't affect permissions</p>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddMember}
                disabled={!selectedUser || actionLoading === 'add'}
              >
                {actionLoading === 'add' ? 'Adding...' : 'Add to Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
