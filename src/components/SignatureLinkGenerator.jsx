import { useState, useEffect, useCallback } from 'react'
import { X, Link, Copy, Check, Clock, ExternalLink, AlertCircle, Trash2, Mail, RefreshCw, Send } from 'lucide-react'
import { db, isFieldMode } from '../lib/supabase'
import { validate } from '../lib/sanitize'

// Hook to lock body scroll when modal is open
function useBodyScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
    }
  }, [])
}

// Helper to format date
const formatDate = (dateString) => {
  if (!dateString) return 'Never'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// "just now" / "5m ago" / "3h ago" / "2d ago" / date
const formatRelative = (dateString, now = Date.now()) => {
  if (!dateString) return ''
  const then = new Date(dateString).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((now - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const DEADLINE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
]

// Matches the 5-minute throttle in the signature_requests guard trigger.
const RESEND_COOLDOWN_MS = 5 * 60 * 1000

const toTime = (value) => {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

// Pending/partially signed requests whose expires_at has passed are
// shown as expired (the server cancels their queued email).
const effectiveStatus = (request, now = Date.now()) => {
  const status = request?.status
  if ((status === 'pending' || status === 'partially_signed') && request?.expires_at) {
    const exp = toTime(request.expires_at)
    if (exp !== null && exp <= now) return 'expired'
  }
  return status
}

// Most recent email_outbox row for a request (embed order is not guaranteed).
const latestOutboxRow = (request) => {
  const rows = Array.isArray(request?.email_outbox) ? request.email_outbox : []
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => (toTime(b.created_at) || 0) - (toTime(a.created_at) || 0))[0]
}

// Last time an email was sent or requested for this request. Creating a
// request with a recipient queues the first email, so created_at counts.
const lastEmailActivity = (request) => {
  const outbox = latestOutboxRow(request)
  const times = [
    request?.last_sent_at,
    request?.sent_at,
    request?.resend_requested_at,
    request?.recipient_email ? request?.created_at : null,
    outbox?.created_at
  ].map(toTime).filter(t => t !== null)
  return times.length ? Math.max(...times) : null
}

// Milliseconds until Resend is allowed again (0 = allowed now).
const resendCooldownRemaining = (request, now = Date.now()) => {
  const last = lastEmailActivity(request)
  if (last === null) return 0
  return Math.max(0, last + RESEND_COOLDOWN_MS - now)
}

const canResend = (request, now) => {
  if (!request?.recipient_email) return false
  const status = effectiveStatus(request, now)
  return status === 'pending' || status === 'partially_signed'
}

const docTypeLabelFor = (documentType) => (documentType === 'cor' ? 'Change Order' : 'Time & Material Ticket')

// mailto: for the secondary "Open in email app" link. Never opened
// automatically: the server sends the email; this is a manual fallback.
const buildMailtoHref = ({ link, email, name, documentType, documentTitle, expiresAt }) => {
  const docTypeLabel = docTypeLabelFor(documentType)
  const subject = `Signature required: ${docTypeLabel}${documentTitle ? ` — ${documentTitle}` : ''}`
  const expiryLine = expiresAt
    ? `\nThis link expires on ${new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`
    : ''
  const body = [
    name ? `Hi ${name},` : 'To Whom It May Concern,',
    '',
    `Please review and sign the ${docTypeLabel}${documentTitle ? ` "${documentTitle}"` : ''}.`,
    '',
    'Click the link below to view and sign the document:',
    link,
    expiryLine,
    '',
    'Thank you',
  ].join('\n')
  const to = email && validate.email(email) ? email.trim() : ''
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// Delivery status of the signing email for one request.
function EmailStatus({ request, now = Date.now() }) {
  if (!request) return null
  const outbox = latestOutboxRow(request)
  const email = request.recipient_email
  const to = email ? ` to ${email}` : ''

  if (outbox) {
    switch (outbox.status) {
      case 'pending':
      case 'sending':
        return (
          <span className="email-status email-status--queued link-expires-note">
            <Clock size={12} /> {email ? `Queued for ${email}` : 'Queued'}
          </span>
        )
      case 'sent': {
        const sentAt = outbox.sent_at || request.last_sent_at || request.sent_at
        return (
          <span className="email-status email-status--sent link-expires-note">
            <Mail size={12} /> {`Emailed${to}`}{sentAt ? ` · Sent ${formatRelative(sentAt, now)}` : ''}
          </span>
        )
      }
      case 'failed':
      case 'dead':
        return (
          <span className="email-status email-status--failed input-error-inline">
            <AlertCircle size={12} /> {`Email failed — ${outbox.last_error || 'unknown error'}`}
          </span>
        )
      case 'cancelled':
        return (
          <span className="email-status email-status--cancelled link-expires-note">
            <Mail size={12} /> Email cancelled
          </span>
        )
      default:
        return null
    }
  }

  // No outbox row visible (field client, or before the email migration).
  const sentAt = request.last_sent_at || request.sent_at
  if (sentAt && email) {
    return (
      <span className="email-status email-status--sent link-expires-note">
        <Mail size={12} /> {`Emailed${to} · Sent ${formatRelative(sentAt, now)}`}
      </span>
    )
  }
  if (email) {
    return (
      <span className="email-status email-status--queued link-expires-note">
        <Clock size={12} /> {`Queued for ${email}`}
      </span>
    )
  }
  return null
}

// "Resend email" with the 5-minute client-side throttle; the server
// enforces the same rule and its message is shown verbatim.
function ResendButton({ request, now, resending, error, onResend }) {
  if (!canResend(request, now)) return null
  const remaining = resendCooldownRemaining(request, now)
  const waitMins = Math.ceil(remaining / 60000)
  return (
    <span className="resend-email">
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => onResend(request)}
        disabled={resending || remaining > 0}
        title={remaining > 0 ? 'Wait 5 minutes between emails' : undefined}
      >
        <RefreshCw size={14} /> {resending ? 'Resending...' : 'Resend email'}
      </button>
      {remaining > 0 && !resending && (
        <span className="link-expires-note">Wait {waitMins} min</span>
      )}
      {error && (
        <span className="input-error-inline" role="alert">{error}</span>
      )}
    </span>
  )
}

export default function SignatureLinkGenerator({
  documentType, // 'cor' or 'tm_ticket'
  documentId,
  companyId,
  projectId,
  project,
  documentTitle = '',
  onClose,
  onShowToast
}) {
  // Field (foreman) sessions are anon + x-field-session: they can create and
  // resend but cannot read signature_requests/email_outbox, so status and
  // Resend are shown only for the request created in this modal.
  const [fieldMode] = useState(() => Boolean(isFieldMode()))
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [existingRequests, setExistingRequests] = useState([])
  const [newLink, setNewLink] = useState(null)
  const [createdRequest, setCreatedRequest] = useState(null)
  const [copied, setCopied] = useState(false)
  const [expiresIn, setExpiresIn] = useState('30')
  const [clientEmail, setClientEmail] = useState(project?.contractor_email || '')
  const [clientName, setClientName] = useState(project?.contractor_contact || project?.general_contractor || '')
  const [emailError, setEmailError] = useState('')
  const [resendingId, setResendingId] = useState(null)
  const [resendErrors, setResendErrors] = useState({})
  const [now, setNow] = useState(() => Date.now())

  // Lock body scroll when modal is open
  useBodyScrollLock()

  // Re-evaluate relative times and the resend throttle while open
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const loadExistingRequests = useCallback(async () => {
    try {
      setLoading(true)
      const requests = await db.getSignatureRequestsForDocument(documentType, documentId)
      setExistingRequests(requests || [])
    } catch (err) {
      console.error('Error loading signature requests:', err)
    } finally {
      setLoading(false)
    }
  }, [documentType, documentId])

  // Load existing signature requests for this document
  useEffect(() => {
    loadExistingRequests()
  }, [loadExistingRequests])

  const trimmedEmail = clientEmail.trim()

  const validateEmailInput = () => {
    if (trimmedEmail && !validate.email(trimmedEmail)) {
      setEmailError('Enter a valid email address')
      return false
    }
    setEmailError('')
    return true
  }

  // Generate a new signature link (and queue the email when one is given)
  const generateLink = async () => {
    if (!validateEmailInput()) return

    try {
      setGenerating(true)

      // Calculate expiration date
      let expiresAt = null
      if (expiresIn !== 'never') {
        const days = parseInt(expiresIn)
        expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + days)
        expiresAt = expiresAt.toISOString()
      }

      const recipient = trimmedEmail
        ? { email: trimmedEmail, name: clientName.trim() || null }
        : null

      const request = await db.createSignatureRequest(
        documentType,
        documentId,
        companyId,
        projectId,
        null, // createdBy: set server-side from auth.uid()
        expiresAt,
        recipient
      )

      if (request) {
        const link = `${window.location.origin}/sign/${request.signature_token}`
        setNewLink(link)
        setCreatedRequest(request)
        setNow(Date.now())
        await loadExistingRequests()
        onShowToast?.(
          recipient ? `Signature link created — email queued to ${recipient.email}` : 'Signature link created',
          'success'
        )
      }
    } catch (err) {
      console.error('Error generating signature link:', err)
      onShowToast?.(err?.message ? `Failed to create signature link: ${err.message}` : 'Failed to create signature link', 'error')
    } finally {
      setGenerating(false)
    }
  }

  // Ask the server to send the signing email again
  const resendEmail = async (request) => {
    setResendingId(request.id)
    setResendErrors(prev => ({ ...prev, [request.id]: null }))
    try {
      const updated = await db.resendSignatureRequest(request.id)
      if (updated && createdRequest?.id === request.id) {
        setCreatedRequest(prev => ({ ...prev, ...updated }))
      }
      if (updated) {
        setExistingRequests(prev => prev.map(r => (r.id === request.id ? { ...r, ...updated } : r)))
      }
      setNow(Date.now())
      onShowToast?.(`Email queued to ${request.recipient_email}`, 'success')
      if (!fieldMode) await loadExistingRequests()
    } catch (err) {
      console.error('Error resending signature email:', err)
      const message = err?.message || 'Failed to resend email'
      setResendErrors(prev => ({ ...prev, [request.id]: message }))
      onShowToast?.(message, 'error')
    } finally {
      setResendingId(null)
    }
  }

  // Copy link to clipboard
  const copyToClipboard = async (link) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      onShowToast?.('Link copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Error copying to clipboard:', err)
    }
  }

  // Revoke a signature request
  const revokeRequest = async (requestId) => {
    if (!confirm('Are you sure you want to revoke this signature link? It will no longer be usable.')) {
      return
    }

    try {
      await db.revokeSignatureRequest(requestId)
      await loadExistingRequests()
      onShowToast?.('Signature link revoked', 'success')
    } catch (err) {
      console.error('Error revoking signature request:', err)
      onShowToast?.('Failed to revoke link', 'error')
    }
  }

  // Get status badge info
  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return { label: 'Awaiting Signatures', color: '#f59e0b', bg: '#fef3c7' }
      case 'partially_signed':
        return { label: '1 of 2 Signed', color: '#3b82f6', bg: '#dbeafe' }
      case 'completed':
        return { label: 'Fully Signed', color: '#10b981', bg: '#d1fae5' }
      case 'revoked':
        return { label: 'Revoked', color: '#ef4444', bg: '#fee2e2' }
      case 'expired':
        return { label: 'Expired', color: '#6b7280', bg: '#f3f4f6' }
      default:
        return { label: status, color: '#6b7280', bg: '#f3f4f6' }
    }
  }

  const deadlineLabel = DEADLINE_OPTIONS.find(o => o.value === expiresIn)?.label ?? `${expiresIn} days`
  const docTypeLabel = docTypeLabelFor(documentType)
  // Office: prefer the reloaded row (it carries email_outbox); field: the RPC result.
  const createdView = createdRequest
    ? { ...createdRequest, ...(existingRequests.find(r => r.id === createdRequest.id) || {}) }
    : null
  const mailtoFor = (link, request) => buildMailtoHref({
    link,
    email: request?.recipient_email || trimmedEmail,
    name: request?.recipient_name || clientName.trim(),
    documentType,
    documentTitle,
    expiresAt: request?.expires_at || null
  })

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content signature-link-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Get Signature Link</h2>
            {documentTitle && <span className="modal-subtitle">{documentTitle}</span>}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Create New Link Section */}
          <div className="signature-link-section">
            <h3>
              <Link size={16} />
              Create New Signature Link
            </h3>
            <p className="section-description">
              Generate a secure link that allows GC/Client to sign this {docTypeLabel} without logging in.
            </p>

            {/* Deadline selector */}
            <div className="link-options">
              <div className="link-option-row">
                <label htmlFor="sig-deadline" className="link-option-label">
                  <Clock size={14} />
                  Signing deadline
                </label>
                <select
                  id="sig-deadline"
                  className="link-option-select"
                  value={expiresIn}
                  onChange={e => setExpiresIn(e.target.value)}
                >
                  {DEADLINE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional email delivery */}
            <div className="signature-email-section">
              <h4>
                <Mail size={14} />
                Email the link to the client (optional)
              </h4>
              <div className="email-fields">
                <input
                  type="text"
                  className="link-input"
                  placeholder="Client name"
                  aria-label="Client name"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  autoComplete="off"
                />
                <input
                  type="email"
                  className="link-input"
                  placeholder="client@example.com"
                  aria-label="Client email"
                  aria-invalid={emailError ? 'true' : undefined}
                  aria-describedby={emailError ? 'sig-email-error' : undefined}
                  value={clientEmail}
                  onChange={e => {
                    setClientEmail(e.target.value)
                    if (emailError) setEmailError('')
                  }}
                  onBlur={validateEmailInput}
                  autoComplete="off"
                />
                {emailError && (
                  <span id="sig-email-error" className="input-error-inline" role="alert">
                    <AlertCircle size={12} /> {emailError}
                  </span>
                )}
              </div>
              <p className="email-hint">
                If provided, we email the signing link for you and show its delivery status below.
              </p>
            </div>

            <div className="link-generate-row">
              <button
                className="btn btn-primary"
                onClick={generateLink}
                disabled={generating}
              >
                {trimmedEmail && <Send size={14} />}
                {generating
                  ? 'Generating...'
                  : (trimmedEmail ? 'Generate & Email' : 'Generate Link')}
              </button>
            </div>

            {/* Newly generated link */}
            {newLink && (
              <div className="new-link-box">
                <div className="link-display">
                  <input
                    type="text"
                    value={newLink}
                    readOnly
                    aria-label="New signature link"
                    className="link-input"
                  />
                  <button
                    className="btn btn-secondary copy-btn"
                    onClick={() => copyToClipboard(newLink)}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <a
                    href={mailtoFor(newLink, createdView)}
                    className="btn btn-ghost btn-small open-email-app"
                  >
                    <Mail size={14} /> Open in email app
                  </a>
                </div>
                <div className="new-link-email-status" data-testid="new-link-email-status">
                  <EmailStatus request={createdView} now={now} />
                  {fieldMode && (
                    <ResendButton
                      request={createdView}
                      now={now}
                      resending={resendingId === createdView?.id}
                      error={resendErrors[createdView?.id]}
                      onResend={resendEmail}
                    />
                  )}
                </div>
                <div className="new-link-meta">
                  <span className="link-expires-note">
                    <Clock size={12} />
                    {expiresIn === 'never' ? 'No expiration' : `Expires in ${deadlineLabel}`}
                  </span>
                  <a
                    href={newLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="preview-link"
                  >
                    <ExternalLink size={14} />
                    Preview link
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Existing Links Section */}
          <div className="signature-link-section">
            <h3>
              <Clock size={16} />
              Existing Signature Links
            </h3>

            {loading ? (
              <div className="loading-inline">Loading...</div>
            ) : existingRequests.length === 0 ? (
              <p className="empty-state">No signature links have been created for this {docTypeLabel}.</p>
            ) : (
              <div className="existing-links-list">
                {existingRequests.map(request => {
                  const status = effectiveStatus(request, now)
                  const statusBadge = getStatusBadge(status)
                  const link = `${window.location.origin}/sign/${request.signature_token}`
                  const signatureCount = request.signatures?.length || 0

                  return (
                    <div key={request.id} className="existing-link-card" data-testid={`signature-request-${request.id}`}>
                      <div className="link-card-header">
                        <span
                          className="status-badge"
                          style={{ color: statusBadge.color, backgroundColor: statusBadge.bg }}
                        >
                          {statusBadge.label}
                        </span>
                        <span className="link-created">
                          Created {formatDate(request.created_at)}
                        </span>
                      </div>

                      <div className="link-card-body">
                        <div className="link-info">
                          <span className="link-token">...{request.signature_token.slice(-8)}</span>
                          {request.expires_at && (
                            <span className="link-expires">
                              Expires {formatDate(request.expires_at)}
                            </span>
                          )}
                          <span className="link-views">
                            {request.view_count} view{request.view_count !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {!fieldMode && <EmailStatus request={request} now={now} />}

                        {/* Signature status */}
                        {signatureCount > 0 && (
                          <div className="signatures-summary">
                            {request.signatures.map(sig => (
                              <div key={sig.id} className="sig-item">
                                <Check size={12} />
                                <span>
                                  Slot {sig.signature_slot}: {sig.signer_name}
                                  {sig.signer_company && ` (${sig.signer_company})`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="link-card-actions">
                        {status !== 'revoked' && status !== 'expired' && (
                          <>
                            <button
                              className="btn btn-ghost btn-small"
                              onClick={() => copyToClipboard(link)}
                            >
                              <Copy size={14} /> Copy
                            </button>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-ghost btn-small"
                            >
                              <ExternalLink size={14} /> Open
                            </a>
                          </>
                        )}
                        {!fieldMode && (
                          <ResendButton
                            request={request}
                            now={now}
                            resending={resendingId === request.id}
                            error={resendErrors[request.id]}
                            onResend={resendEmail}
                          />
                        )}
                        {request.status !== 'completed' && request.status !== 'revoked' && (
                          <button
                            className="btn btn-ghost btn-small btn-danger"
                            onClick={() => revokeRequest(request.id)}
                          >
                            <Trash2 size={14} /> Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="signature-info-box">
            <AlertCircle size={16} />
            <div>
              <strong>How it works:</strong>
              <ul>
                <li>Enter the GC or Client&apos;s email above and we email them the link, or copy the link and share it yourself</li>
                <li>They can view the document and sign without logging in</li>
                <li>Supports 2 signatures (GC + Client)</li>
                <li>Signatures are recorded with name, title, company, date, and IP</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
