import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { AlertTriangle, UserCheck, UserX, UserMinus, Users, ChevronDown, Shield, User, Briefcase, UserPlus, Copy, Link2, XCircle } from 'lucide-react'
import InviteModal from './InviteModal'

const ACCESS_LEVEL_OPTIONS = [
  { value: 'member', label: 'Member', icon: User, description: 'Standard access to projects' },
  { value: 'administrator', label: 'Administrator', icon: Shield, description: 'Full control, can manage team' }
]

const COMPANY_ROLE_OPTIONS = [
  { value: 'Project Manager', label: 'Project Manager' },
  { value: 'Superintendent', label: 'Superintendent' },
  { value: 'Job Costing', label: 'Job Costing' },
  { value: 'Accounting', label: 'Accounting' }
]

export default function MembershipManager({ company, user, onShowToast }) {
  const [filter, setFilter] = useState('pending')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [selectedAccessLevels, setSelectedAccessLevels] = useState({})
  const [selectedCompanyRoles, setSelectedCompanyRoles] = useState({})
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [invitations, setInvitations] = useState([])

  useEffect(() => {
    if (company?.id) {
      loadMembers()
      loadInvitations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id])

  const loadMembers = async () => {
    try {
      setLoading(true)
      const data = await db.getCompanyMemberships(company.id)
      setMembers(data)
    } catch (error) {
      console.error('Error loading members:', error)
      onShowToast('Error loading team members', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadInvitations = async () => {
    try {
      const data = await db.getCompanyInvitations(company.id)
      setInvitations(data)
    } catch (error) {
      console.error('Error loading invitations:', error)
    }
  }

  const handleApprove = async (membership) => {
    const companyRole = selectedCompanyRoles[membership.id]
    if (!companyRole) {
      onShowToast('Please select a role for this member', 'error')
      return
    }

    try {
      setActionLoading(membership.id)
      const accessLevel = selectedAccessLevels[membership.id] || 'member'

      // Step 1: Approve membership and set access level
      await db.approveMembershipWithRole(membership.id, user.id, accessLevel)

      // Step 2: Set the company role (job title) after approval
      try {
        await db.updateMemberCompanyRole(membership.id, companyRole)
      } catch (roleError) {
        // Don't fail the whole approval if company_role update fails
        // (e.g., column might not exist yet if migration hasn't been run)
        console.warn('Could not set company role:', roleError.message)
      }

      onShowToast(`${membership.users?.name || membership.users?.email} approved as ${companyRole}`, 'success')
      // Clear selections
      setSelectedAccessLevels(prev => {
        const updated = { ...prev }
        delete updated[membership.id]
        return updated
      })
      setSelectedCompanyRoles(prev => {
        const updated = { ...prev }
        delete updated[membership.id]
        return updated
      })
      loadMembers()
    } catch (error) {
      console.error('Error approving membership:', error)
      onShowToast('Error approving request: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleAccessLevelChange = (membershipId, accessLevel) => {
    setSelectedAccessLevels(prev => ({ ...prev, [membershipId]: accessLevel }))
  }

  const handleCompanyRoleChange = (membershipId, companyRole) => {
    setSelectedCompanyRoles(prev => ({ ...prev, [membershipId]: companyRole }))
  }

  const handleUpdateCompanyRole = async (membership, newCompanyRole) => {
    try {
      setActionLoading(membership.id)
      await db.updateMemberCompanyRole(membership.id, newCompanyRole)
      onShowToast(`${membership.users?.name || 'User'} role updated to ${newCompanyRole}`, 'success')
      loadMembers()
    } catch (error) {
      console.error('Error updating company role:', error)
      onShowToast('Error updating role', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUpdateAccessLevel = async (membership, newAccessLevel) => {
    // Don't allow demoting yourself
    if (membership.users?.id === user.id && newAccessLevel !== 'administrator') {
      onShowToast('You cannot demote yourself', 'error')
      return
    }

    try {
      setActionLoading(membership.id)
      await db.updateMemberAccessLevel(membership.id, newAccessLevel)
      const levelLabel = ACCESS_LEVEL_OPTIONS.find(o => o.value === newAccessLevel)?.label || newAccessLevel
      onShowToast(`${membership.users?.name || 'User'} is now ${levelLabel}`, 'success')
      loadMembers()
    } catch (error) {
      console.error('Error updating access level:', error)
      onShowToast('Error updating access level', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (membership) => {
    try {
      setActionLoading(membership.id)
      await db.rejectMembership(membership.id)
      onShowToast('Request rejected', 'success')
      loadMembers()
    } catch (error) {
      console.error('Error rejecting membership:', error)
      onShowToast('Error rejecting request', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemove = async (membership) => {
    // Don't allow removing yourself
    if (membership.users?.id === user.id) {
      onShowToast('You cannot remove yourself', 'error')
      return
    }

    try {
      setActionLoading(membership.id)
      await db.removeMember(membership.id, user.id)
      onShowToast(`${membership.users?.name || membership.users?.email} removed`, 'success')
      loadMembers()
    } catch (error) {
      console.error('Error removing member:', error)
      onShowToast('Error removing member', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRevokeInvitation = async (invitationId) => {
    try {
      setActionLoading(invitationId)
      await db.revokeInvitation(invitationId)
      onShowToast('Invitation revoked', 'success')
      loadInvitations()
    } catch (error) {
      console.error('Error revoking invitation:', error)
      onShowToast('Error revoking invitation', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCopyInviteLink = async (token) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`)
      onShowToast('Invite link copied!', 'success')
    } catch {
      onShowToast('Failed to copy link', 'error')
    }
  }

  const getInviteStatus = (invite) => {
    if (invite.status === 'revoked') return 'revoked'
    if (invite.status === 'accepted') return 'accepted'
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) return 'expired'
    if (invite.max_uses && invite.use_count >= invite.max_uses) return 'accepted'
    return 'active'
  }

  const formatTimeRemaining = (expiresAt) => {
    const diff = new Date(expiresAt) - new Date()
    if (diff <= 0) return 'Expired'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours >= 24) return `${Math.floor(hours / 24)}d remaining`
    if (hours >= 1) return `${hours}h remaining`
    const mins = Math.floor(diff / (1000 * 60))
    return `${mins}m remaining`
  }

  const filteredMembers = members.filter(m => {
    if (filter === 'all') return true
    return m.status === filter
  })

  const pendingCount = members.filter(m => m.status === 'pending').length
  const activeCount = members.filter(m => m.status === 'active').length
  const removedCount = members.filter(m => m.status === 'removed').length
  const activeInviteCount = invitations.filter(i => getInviteStatus(i) === 'active').length

  if (loading) {
    return (
      <div className="membership-manager">
        <div className="loading">
          <div className="spinner"></div>
          Loading team members...
        </div>
      </div>
    )
  }

  return (
    <div className="membership-manager">
      <div className="membership-header">
        <div className="membership-header-row">
          <h2><Users size={24} /> Team Members</h2>
          <button
            className="btn btn-primary btn-small"
            onClick={() => setShowInviteModal(true)}
          >
            <UserPlus size={16} /> Invite
          </button>
        </div>
        <p className="membership-subtitle">
          Manage who has access to {company?.name}
        </p>
      </div>

      {/* Pending alert banner */}
      {pendingCount > 0 && (
        <div className="pending-alert">
          <AlertTriangle size={20} />
          <span>
            {pendingCount} pending request{pendingCount > 1 ? 's' : ''} awaiting approval
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="tm-filter-tabs">
        <button
          className={`tm-filter-tab ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending
          <span className="tm-filter-count">{pendingCount}</span>
        </button>
        <button
          className={`tm-filter-tab ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          Active
          <span className="tm-filter-count">{activeCount}</span>
        </button>
        <button
          className={`tm-filter-tab ${filter === 'removed' ? 'active' : ''}`}
          onClick={() => setFilter('removed')}
        >
          Removed
          <span className="tm-filter-count">{removedCount}</span>
        </button>
        <button
          className={`tm-filter-tab ${filter === 'invitations' ? 'active' : ''}`}
          onClick={() => setFilter('invitations')}
        >
          Invitations
          {activeInviteCount > 0 && <span className="tm-filter-count">{activeInviteCount}</span>}
        </button>
      </div>

      {/* Invitations list */}
      {filter === 'invitations' && (
        <div className="member-list">
          {invitations.length === 0 ? (
            <div className="member-empty">No invitations yet</div>
          ) : (
            invitations.map(invite => {
              const status = getInviteStatus(invite)
              return (
                <div key={invite.id} className={`member-card ${status === 'active' ? 'active' : 'removed'}`}>
                  <div className="member-info">
                    <div className="member-name">
                      <Link2 size={14} />
                      {invite.invited_email
                        ? `Invite for ${invite.invited_email}`
                        : 'Open invite link'
                      }
                    </div>
                    <div className="member-meta">
                      Created by {invite.creator?.name || invite.creator?.email || 'Unknown'} on {new Date(invite.created_at).toLocaleDateString()}
                    </div>
                    <div className="member-badges">
                      <span className={`access-badge ${status}`}>
                        {status === 'active' ? formatTimeRemaining(invite.expires_at) : status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                      {invite.invited_access_level === 'administrator' ? (
                        <span className="access-badge admin"><Shield size={12} /> Administrator</span>
                      ) : (
                        <span className="access-badge member"><User size={12} /> Member</span>
                      )}
                      {invite.invited_company_role && (
                        <span className="access-badge role"><Briefcase size={12} /> {invite.invited_company_role}</span>
                      )}
                      <span className="access-badge member">
                        {invite.use_count}/{invite.max_uses || '\u221E'} used
                      </span>
                    </div>
                  </div>
                  <div className="member-actions">
                    {status === 'active' && (
                      <>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => handleCopyInviteLink(invite.invite_token)}
                        >
                          <Copy size={16} /> Copy Link
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleRevokeInvitation(invite.id)}
                          disabled={actionLoading === invite.id}
                        >
                          {actionLoading === invite.id ? '...' : (
                            <><XCircle size={16} /> Revoke</>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Member list */}
      {filter !== 'invitations' && (
        <div className="member-list">
          {filteredMembers.length === 0 ? (
            <div className="member-empty">
              {filter === 'pending' && 'No pending requests'}
              {filter === 'active' && 'No active members'}
              {filter === 'removed' && 'No removed members'}
            </div>
          ) : (
            filteredMembers.map(member => (
              <div key={member.id} className={`member-card ${member.status}`}>
                <div className="member-info">
                  <div className="member-name">
                    {member.users?.name || 'Unknown'}
                    {member.users?.id === user.id && <span className="member-you">(You)</span>}
                  </div>
                  <div className="member-email">{member.users?.email}</div>
                  <div className="member-meta">
                    {member.status === 'pending' && (
                      <>Requested {new Date(member.created_at).toLocaleDateString()}</>
                    )}
                    {member.status === 'active' && member.approved_at && (
                      <>Approved {new Date(member.approved_at).toLocaleDateString()}</>
                    )}
                    {member.status === 'active' && !member.approved_at && (
                      <>Member since {new Date(member.created_at).toLocaleDateString()}</>
                    )}
                    {member.status === 'removed' && member.removed_at && (
                      <>Removed {new Date(member.removed_at).toLocaleDateString()}</>
                    )}
                  </div>
                  {member.status === 'active' && (
                    <div className="member-badges">
                      {member.access_level === 'administrator' ? (
                        <span className="access-badge admin"><Shield size={12} /> Administrator</span>
                      ) : (
                        <span className="access-badge member"><User size={12} /> Member</span>
                      )}
                      {member.company_role && (
                        <span className="access-badge role"><Briefcase size={12} /> {member.company_role}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="member-actions">
                  {member.status === 'pending' && (
                    <>
                      <div className="role-selector">
                        <select
                          value={selectedCompanyRoles[member.id] || ''}
                          onChange={(e) => handleCompanyRoleChange(member.id, e.target.value)}
                          disabled={actionLoading === member.id}
                          className="role-select"
                        >
                          <option value="">Select Role...</option>
                          {COMPANY_ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="role-select-icon" />
                      </div>
                      <div className="role-selector">
                        <select
                          value={selectedAccessLevels[member.id] || 'member'}
                          onChange={(e) => handleAccessLevelChange(member.id, e.target.value)}
                          disabled={actionLoading === member.id}
                          className="role-select"
                        >
                          {ACCESS_LEVEL_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="role-select-icon" />
                      </div>
                      <button
                        className="btn btn-success btn-small"
                        onClick={() => handleApprove(member)}
                        disabled={actionLoading === member.id}
                      >
                        {actionLoading === member.id ? '...' : (
                          <><UserCheck size={16} /> Approve</>
                        )}
                      </button>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => handleReject(member)}
                        disabled={actionLoading === member.id}
                      >
                        {actionLoading === member.id ? '...' : (
                          <><UserX size={16} /> Reject</>
                        )}
                      </button>
                    </>
                  )}
                  {member.status === 'active' && member.users?.id !== user.id && (
                    <>
                      <div className="role-selector">
                        <select
                          value={member.company_role || ''}
                          onChange={(e) => handleUpdateCompanyRole(member, e.target.value)}
                          disabled={actionLoading === member.id}
                          className="role-select"
                        >
                          <option value="">No Role</option>
                          {COMPANY_ROLE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="role-select-icon" />
                      </div>
                      <div className="role-selector">
                        <select
                          value={member.access_level || 'member'}
                          onChange={(e) => handleUpdateAccessLevel(member, e.target.value)}
                          disabled={actionLoading === member.id}
                          className="role-select"
                        >
                          {ACCESS_LEVEL_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="role-select-icon" />
                      </div>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => handleRemove(member)}
                        disabled={actionLoading === member.id}
                      >
                        {actionLoading === member.id ? '...' : (
                          <><UserMinus size={16} /> Remove</>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal
          company={company}
          user={user}
          onClose={() => setShowInviteModal(false)}
          onShowToast={onShowToast}
          onInviteCreated={loadInvitations}
        />
      )}
    </div>
  )
}
