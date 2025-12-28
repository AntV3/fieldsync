import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { AlertTriangle, UserCheck, UserX, UserMinus, Users, ChevronDown } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'office', label: 'Office' },
  { value: 'admin', label: 'Admin' },
  { value: 'foreman', label: 'Foreman' }
]

export default function MembershipManager({ company, user, onShowToast }) {
  const [filter, setFilter] = useState('pending')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [selectedRoles, setSelectedRoles] = useState({}) // Track role selection per pending member

  useEffect(() => {
    if (company?.id) {
      loadMembers()
    }
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

  const handleApprove = async (membership) => {
    try {
      setActionLoading(membership.id)
      const role = selectedRoles[membership.id] || 'member'
      await db.approveMembershipWithRole(membership.id, user.id, role)
      onShowToast(`${membership.users?.name || membership.users?.email} approved as ${role}`, 'success')
      // Clear the role selection for this membership
      setSelectedRoles(prev => {
        const updated = { ...prev }
        delete updated[membership.id]
        return updated
      })
      loadMembers()
    } catch (error) {
      console.error('Error approving membership:', error)
      onShowToast('Error approving request', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRoleChange = (membershipId, role) => {
    setSelectedRoles(prev => ({ ...prev, [membershipId]: role }))
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

  const filteredMembers = members.filter(m => {
    if (filter === 'all') return true
    return m.status === filter
  })

  const pendingCount = members.filter(m => m.status === 'pending').length
  const activeCount = members.filter(m => m.status === 'active').length
  const removedCount = members.filter(m => m.status === 'removed').length

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
        <h2><Users size={24} /> Team Members</h2>
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
      </div>

      {/* Member list */}
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
                <div className="member-role">
                  Role: <span className="member-role-value">{member.role}</span>
                </div>
              </div>
              <div className="member-actions">
                {member.status === 'pending' && (
                  <>
                    <div className="role-selector">
                      <select
                        value={selectedRoles[member.id] || 'member'}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        disabled={actionLoading === member.id}
                        className="role-select"
                      >
                        {ROLE_OPTIONS.map(opt => (
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
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => handleRemove(member)}
                    disabled={actionLoading === member.id}
                  >
                    {actionLoading === member.id ? '...' : (
                      <><UserMinus size={16} /> Remove</>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
