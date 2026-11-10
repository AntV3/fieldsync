import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, FileText, ChevronRight, Building2 } from 'lucide-react'
import { db } from '../lib/supabase'
import { formatCurrency } from '../lib/corCalculations'
import { CLIENT_PORTAL_GROUPS } from '../lib/corStage'

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const errorCopy = (error) => {
  const message = String(error?.message || '')
  if (message.includes('portal_link_revoked')) return 'Access to this project has been removed. Contact the contractor if you still need it.'
  if (message.includes('portal_link_expired')) return 'This link has expired. Ask the contractor for a new one.'
  if (message.includes('portal_link_invalid')) return 'This link is not valid. Check that you have the full address.'
  if (error?.code === 'FEATURE_NOT_AVAILABLE') return 'The client portal is not available yet.'
  return 'The change orders could not be loaded. Try again in a moment.'
}

/** One line under a change order's title saying where it stands. */
const stageLine = (cor) => {
  switch (cor.stage) {
    case 'with_client': return cor.sent_to_client_at ? `Sent ${formatDate(cor.sent_to_client_at)}` : 'Waiting for your signature'
    case 'returned': return cor.returned_by_client_at ? `Returned ${formatDate(cor.returned_by_client_at)}. A revised version will follow.` : 'Returned. A revised version will follow.'
    case 'approved': return cor.approved_at ? `Approved ${formatDate(cor.approved_at)}` : 'Approved'
    case 'voided': return [cor.voided_at ? `Voided ${formatDate(cor.voided_at)}` : 'Voided', cor.void_reason].filter(Boolean).join(': ')
    default: return 'Closed'
  }
}

/**
 * ClientPortal - What a client contact sees from their access link: one
 * project's change orders, grouped by where each stands. Opening a change
 * order goes to its signing page (full backup, PDF, sign or request changes).
 * No login: the link is the access, and the contractor can remove it.
 */
export default function ClientPortal({ accessToken }) {
  const navigate = useNavigate()
  const [portal, setPortal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [opening, setOpening] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await db.getClientPortal(accessToken)
      if (!data) throw new Error('portal_link_invalid')
      setPortal(data)
    } catch (err) {
      console.error('Error loading client portal:', err)
      setError(errorCopy(err))
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { load() }, [load])

  const openCOR = async (cor) => {
    if (opening) return
    setOpening(cor.id)
    setNotice(null)
    try {
      const signingToken = await db.openClientPortalCOR(accessToken, cor.id)
      if (signingToken) navigate(`/sign/${signingToken}`)
      else setNotice(`${cor.cor_number} has no document to open right now.`)
    } catch (err) {
      console.error('Error opening change order:', err)
      setNotice(errorCopy(err))
    } finally {
      setOpening(null)
    }
  }

  if (loading) {
    return (
      <div className="signature-page">
        <div className="signature-page-loading"><p>Loading change orders...</p></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="signature-page">
        <div className="signature-page-error" role="alert">
          <AlertCircle size={40} aria-hidden="true" />
          <h2>Unable to open</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const cors = portal.change_orders || []
  const groups = CLIENT_PORTAL_GROUPS
    .map(group => ({ ...group, items: cors.filter(cor => cor.stage === group.id) }))
    .filter(group => group.items.length > 0)

  return (
    <div className="signature-page client-portal">
      <header className="client-portal-header">
        {portal.project?.company_logo_url
          ? <img src={portal.project.company_logo_url} alt="" className="client-portal-logo" />
          : <Building2 size={28} aria-hidden="true" />}
        <div>
          <p className="client-portal-company">{portal.project?.company_name}</p>
          <h1>{portal.project?.name}</h1>
          <p className="client-portal-sub">
            Change orders{portal.project?.job_number ? ` · Job ${portal.project.job_number}` : ''}
            {portal.contact_name ? ` · for ${portal.contact_name}` : ''}
          </p>
        </div>
      </header>

      {notice && <p className="client-portal-notice" role="status">{notice}</p>}

      {groups.length === 0 ? (
        <div className="client-portal-empty">
          <FileText size={32} aria-hidden="true" />
          <p>No change orders have been sent to you on this project yet.</p>
        </div>
      ) : groups.map(group => (
        <section key={group.id} className={`client-portal-group client-portal-group--${group.id}`} aria-labelledby={`cp-${group.id}`}>
          <h2 id={`cp-${group.id}`}>{group.title} ({group.items.length})</h2>
          <ul>
            {group.items.map(cor => {
              const canOpen = ['with_client', 'approved'].includes(cor.stage)
              const body = (
                <>
                  <span className="client-portal-cor-main">
                    <span className="client-portal-cor-title">
                      {cor.cor_number}{cor.revision_number > 1 ? ` (rev ${cor.revision_number})` : ''} · {cor.title}
                    </span>
                    <span className="client-portal-cor-line">{stageLine(cor)}</span>
                  </span>
                  <span className="client-portal-cor-total">{formatCurrency(cor.cor_total || 0)}</span>
                  {canOpen && <ChevronRight size={18} aria-hidden="true" />}
                </>
              )
              return (
                <li key={cor.id}>
                  {canOpen ? (
                    <button
                      type="button"
                      className="client-portal-cor"
                      onClick={() => openCOR(cor)}
                      disabled={opening === cor.id}
                      aria-label={`Open ${cor.cor_number}: ${cor.title}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="client-portal-cor client-portal-cor--static">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {portal.expires_at && (
        <p className="client-portal-foot">This link works until {formatDate(portal.expires_at)}.</p>
      )}
    </div>
  )
}
