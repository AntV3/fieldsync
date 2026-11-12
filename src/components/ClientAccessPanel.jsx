import { useState, useEffect, useCallback } from 'react'
import { Copy, UserPlus, UserX } from 'lucide-react'
import { db } from '../lib/supabase'
import { usePermissions } from '../lib/PermissionsContext'
import { guardMessage } from '../lib/permissions'

const EXPIRY_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' }
]

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

/** 'active' | 'expired' | 'removed' */
// eslint-disable-next-line react-refresh/only-export-components
export function accessState(access, now = Date.now()) {
  if (access.revoked_at) return 'removed'
  if (access.expires_at && new Date(access.expires_at).getTime() <= now) return 'expired'
  return 'active'
}

const STATE_LABELS = { active: 'Active', expired: 'Expired', removed: 'Removed' }

/**
 * ClientAccessPanel - Who on the client's side can open this project's
 * change orders. Access is per contact and per project, can carry an expiry,
 * and can be removed at any time. Renders nothing until the database
 * supports it.
 */
export default function ClientAccessPanel({ project, onNotify }) {
  const { canManageClientAccess } = usePermissions()
  const [grants, setGrants] = useState(null) // null = not available / not loaded
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [expiryDays, setExpiryDays] = useState('90')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const rows = await db.getClientPortalAccess?.(project.id)
      setGrants(Array.isArray(rows) ? rows : null)
    } catch (_err) {
      setGrants(null)
    }
  }, [project.id])

  useEffect(() => { load() }, [load])

  if (grants === null) return null

  const linkFor = (access) => `${window.location.origin}/portal/${access.access_token}`

  const copyLink = async (access) => {
    try {
      await navigator.clipboard.writeText(linkFor(access))
      onNotify?.('success', `Link for ${access.contact_name} copied`)
    } catch (_err) {
      onNotify?.('error', 'Could not copy the link')
    }
  }

  const handleGrant = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      onNotify?.('error', "Enter the client contact's name")
      return
    }
    setBusy(true)
    try {
      const expiresAt = expiryDays
        ? new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString()
        : null
      const created = await db.grantClientPortalAccess(project.id, { name: name.trim(), email: email.trim(), expiresAt })
      setName('')
      setEmail('')
      await load()
      if (created?.access_token) {
        try { await navigator.clipboard.writeText(linkFor(created)) } catch (_err) { /* shown in the list */ }
      }
      onNotify?.('success', `Access created for ${created?.contact_name || 'the client'}. Link copied.`)
    } catch (error) {
      console.error('Error granting client access:', error)
      onNotify?.('error', guardMessage(error, error?.code === 'FEATURE_NOT_AVAILABLE' ? error.message : 'Could not create access'))
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async (access) => {
    if (busy) return
    if (!confirm(`Remove ${access.contact_name}'s access to this project's change orders?`)) return
    setBusy(true)
    try {
      await db.revokeClientPortalAccess(access.id)
      await load()
      onNotify?.('success', `Access removed for ${access.contact_name}`)
    } catch (error) {
      console.error('Error removing client access:', error)
      onNotify?.('error', guardMessage(error, 'Could not remove access'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="client-access" aria-labelledby="client-access-title">
      <h3 id="client-access-title">Client access to change orders</h3>
      <p className="client-access-intro">
        A client contact with access sees this project&apos;s change orders: waiting for their signature,
        returned, approved and voided. They can sign or request changes. No login is needed, and you can
        remove access at any time.
      </p>

      {grants.length === 0 ? (
        <p className="client-access-empty">No client has access to this project yet.</p>
      ) : (
        <ul className="client-access-list">
          {grants.map(access => {
            const state = accessState(access)
            return (
              <li key={access.id} className={`client-access-item client-access-item--${state}`}>
                <div className="client-access-who">
                  <strong>{access.contact_name}</strong>
                  {access.contact_email && <span>{access.contact_email}</span>}
                  <span className="client-access-meta">
                    {STATE_LABELS[state]}
                    {state === 'active' && access.expires_at ? ` until ${formatDate(access.expires_at)}` : ''}
                    {access.last_viewed_at ? ` · last opened ${formatDate(access.last_viewed_at)}` : ' · not opened yet'}
                  </span>
                </div>
                {state === 'active' && (
                  <div className="client-access-actions">
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => copyLink(access)}>
                      <Copy size={14} aria-hidden="true" /> Copy link
                    </button>
                    {canManageClientAccess && (
                      <button
                        type="button"
                        className="btn btn-danger btn-small"
                        onClick={() => handleRevoke(access)}
                        disabled={busy}
                        aria-label={`Remove access for ${access.contact_name}`}
                      >
                        <UserX size={14} aria-hidden="true" /> Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canManageClientAccess ? (
        <form className="client-access-form" onSubmit={handleGrant}>
          <div className="client-access-fields">
            <label>
              <span>Contact name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </label>
            <label>
              <span>Email (optional)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
            </label>
            <label>
              <span>Access lasts</span>
              <select value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)}>
                {EXPIRY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <UserPlus size={15} aria-hidden="true" /> Give access
          </button>
        </form>
      ) : (
        <p className="client-access-empty">Ask a company administrator for permission to manage client access.</p>
      )}
    </section>
  )
}
