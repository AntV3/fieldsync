import { useState } from 'react'
import { db } from '../lib/supabase'

const ACCESS_LEVELS = [
  { value: 'field', label: 'Field Worker', description: 'Can update area status, log hours, submit reports' },
  { value: 'office', label: 'Office Staff', description: 'Can manage projects, approve T&M, view reports' },
  { value: 'administrator', label: 'Administrator', description: 'Full access including team management' }
]

export default function InviteTeamStep({ company, user, onComplete, onSkip, onShowToast }) {
  const [invites, setInvites] = useState([
    { email: '', accessLevel: 'field' }
  ])
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState(0)

  const addInvite = () => {
    if (invites.length < 10) {
      setInvites(prev => [...prev, { email: '', accessLevel: 'field' }])
    }
  }

  const removeInvite = (index) => {
    if (invites.length > 1) {
      setInvites(prev => prev.filter((_, i) => i !== index))
    }
  }

  const updateInvite = (index, field, value) => {
    setInvites(prev => prev.map((inv, i) =>
      i === index ? { ...inv, [field]: value } : inv
    ))
  }

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const handleSendInvites = async () => {
    // Filter out empty emails
    const validInvites = invites.filter(inv => inv.email.trim())

    if (validInvites.length === 0) {
      onComplete()
      return
    }

    // Validate all emails
    const invalidEmails = validInvites.filter(inv => !validateEmail(inv.email.trim()))
    if (invalidEmails.length > 0) {
      onShowToast('Please enter valid email addresses', 'error')
      return
    }

    setSending(true)
    let successCount = 0

    try {
      for (const invite of validInvites) {
        try {
          await db.createInvite({
            companyId: company.id,
            email: invite.email.trim(),
            role: invite.accessLevel === 'field' ? 'field' : 'office',
            accessLevel: invite.accessLevel,
            invitedBy: user.id
          })
          successCount++
        } catch (error) {
          console.error(`Failed to send invite to ${invite.email}:`, error)
          // Continue with other invites
        }
      }

      setSentCount(successCount)

      if (successCount === validInvites.length) {
        onShowToast(`${successCount} invite${successCount > 1 ? 's' : ''} sent!`, 'success')
      } else {
        onShowToast(`Sent ${successCount} of ${validInvites.length} invites`, 'warning')
      }

      onComplete()
    } catch (error) {
      console.error('Error sending invites:', error)
      onShowToast('Failed to send invites', 'error')
    } finally {
      setSending(false)
    }
  }

  const copyInviteLink = async () => {
    // For now, we'll show a message about invite links
    // In production, you'd generate a public invite link here
    onShowToast('Send team members their invite links via email', 'info')
  }

  return (
    <div className="onboarding-step invite-team-step">
      <h2>Invite Your Team</h2>
      <p className="step-description">
        Add team members to {company?.name}. They'll receive an email with a link to join.
      </p>

      <div className="invite-list">
        {invites.map((invite, index) => (
          <div key={index} className="invite-row">
            <div className="invite-email">
              <input
                type="email"
                placeholder="teammate@email.com"
                value={invite.email}
                onChange={(e) => updateInvite(index, 'email', e.target.value)}
                disabled={sending}
              />
            </div>
            <div className="invite-role">
              <select
                value={invite.accessLevel}
                onChange={(e) => updateInvite(index, 'accessLevel', e.target.value)}
                disabled={sending}
              >
                {ACCESS_LEVELS.map(level => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>
            {invites.length > 1 && (
              <button
                type="button"
                className="btn-icon remove-invite"
                onClick={() => removeInvite(index)}
                disabled={sending}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {invites.length < 10 && (
        <button
          type="button"
          className="btn btn-text add-invite"
          onClick={addInvite}
          disabled={sending}
        >
          + Add another
        </button>
      )}

      <div className="access-level-legend">
        <h4>Access Levels:</h4>
        {ACCESS_LEVELS.map(level => (
          <div key={level.value} className="level-description">
            <strong>{level.label}:</strong> {level.description}
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onSkip}
          disabled={sending}
        >
          Skip for Now
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={handleSendInvites}
          disabled={sending}
        >
          {sending ? 'Sending...' : 'Send Invites & Finish'}
        </button>
      </div>

      <p className="step-note">
        You can invite more team members anytime from Settings.
      </p>
    </div>
  )
}
