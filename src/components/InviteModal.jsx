import { useState } from 'react'
import { db } from '../lib/supabase'
import { X, Link2, Copy, Check, ChevronDown, Shield, User, Briefcase } from 'lucide-react'

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

const EXPIRATION_OPTIONS = [
  { value: 24, label: '24 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' }
]

export default function InviteModal({ company, user, onClose, onShowToast, onInviteCreated }) {
  const [accessLevel, setAccessLevel] = useState('member')
  const [companyRole, setCompanyRole] = useState('')
  const [invitedEmail, setInvitedEmail] = useState('')
  const [maxUses, setMaxUses] = useState(1)
  const [expiresInHours, setExpiresInHours] = useState(72)
  const [loading, setLoading] = useState(false)
  const [generatedLink, setGeneratedLink] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const invitation = await db.createInvitation(company.id, user.id, {
        accessLevel,
        companyRole: companyRole || null,
        invitedEmail: invitedEmail.trim() || null,
        maxUses,
        expiresInHours
      })

      const link = `${window.location.origin}/invite/${invitation.invite_token}`
      setGeneratedLink(link)
      onInviteCreated?.()
    } catch (error) {
      console.error('Error creating invitation:', error)
      onShowToast('Error creating invitation', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopied(true)
      onShowToast('Invite link copied!', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onShowToast('Failed to copy link', 'error')
    }
  }

  return (
    <div className="mobile-drawer-overlay" onClick={onClose}>
      <div className="invite-modal" onClick={e => e.stopPropagation()}>
        <div className="invite-modal-header">
          <h3><Link2 size={20} /> Invite to {company?.name}</h3>
          <button className="invite-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {!generatedLink ? (
          <div className="invite-modal-body">
            <div className="invite-field">
              <label>Access Level</label>
              <div className="role-selector">
                <select
                  value={accessLevel}
                  onChange={e => setAccessLevel(e.target.value)}
                  className="role-select"
                >
                  {ACCESS_LEVEL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="role-select-icon" />
              </div>
            </div>

            <div className="invite-field">
              <label>Company Role</label>
              <div className="role-selector">
                <select
                  value={companyRole}
                  onChange={e => setCompanyRole(e.target.value)}
                  className="role-select"
                >
                  <option value="">No specific role</option>
                  {COMPANY_ROLE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="role-select-icon" />
              </div>
            </div>

            <div className="invite-field">
              <label>Restrict to Email <span className="invite-optional">(optional)</span></label>
              <input
                type="email"
                value={invitedEmail}
                onChange={e => setInvitedEmail(e.target.value)}
                placeholder="user@example.com"
                className="invite-input"
              />
            </div>

            <div className="invite-field-row">
              <div className="invite-field">
                <label>Expires</label>
                <div className="role-selector">
                  <select
                    value={expiresInHours}
                    onChange={e => setExpiresInHours(Number(e.target.value))}
                    className="role-select"
                  >
                    {EXPIRATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="role-select-icon" />
                </div>
              </div>

              <div className="invite-field">
                <label>Max Uses</label>
                <div className="role-selector">
                  <select
                    value={maxUses}
                    onChange={e => setMaxUses(e.target.value === '0' ? null : Number(e.target.value))}
                    className="role-select"
                  >
                    <option value="1">Single use</option>
                    <option value="5">5 uses</option>
                    <option value="10">10 uses</option>
                    <option value="0">Unlimited</option>
                  </select>
                  <ChevronDown size={14} className="role-select-icon" />
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary invite-generate-btn"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? 'Generating...' : 'Generate Invite Link'}
            </button>
          </div>
        ) : (
          <div className="invite-modal-body">
            <div className="invite-success">
              <div className="invite-link-box">
                <input
                  type="text"
                  value={generatedLink}
                  readOnly
                  className="invite-link-input"
                  onClick={e => e.target.select()}
                />
                <button
                  className={`btn btn-small ${copied ? 'btn-success' : 'btn-primary'}`}
                  onClick={handleCopy}
                >
                  {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
                </button>
              </div>
              <p className="invite-success-hint">
                Share this link with the person you want to invite.
                {invitedEmail && <> This invite is restricted to <strong>{invitedEmail}</strong>.</>}
              </p>
              <div className="invite-success-meta">
                {companyRole && <span className="access-badge role"><Briefcase size={12} /> {companyRole}</span>}
                <span className={`access-badge ${accessLevel === 'administrator' ? 'admin' : 'member'}`}>
                  {accessLevel === 'administrator' ? <><Shield size={12} /> Administrator</> : <><User size={12} /> Member</>}
                </span>
              </div>
            </div>
            <button
              className="btn btn-secondary invite-done-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
