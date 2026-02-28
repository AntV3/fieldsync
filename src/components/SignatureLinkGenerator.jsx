import { useState, useEffect } from 'react'
import { X, Link, Copy, Check, Clock, ExternalLink, AlertCircle, Trash2, Mail } from 'lucide-react'
import { db } from '../lib/supabase'

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

const DEADLINE_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: 'never', label: 'No expiration' },
]

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
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [existingRequests, setExistingRequests] = useState([])
  const [newLink, setNewLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const [expiresIn, setExpiresIn] = useState('30')
  const [clientEmail, setClientEmail] = useState('')
  const [clientName, setClientName] = useState(project?.general_contractor || '')
  const [emailSent, setEmailSent] = useState(false)

  // Lock body scroll when modal is open
  useBodyScrollLock()

  // Load existing signature requests for this document
  useEffect(() => {
    loadExistingRequests()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentType, documentId])

  const loadExistingRequests = async () => {
    try {
      setLoading(true)
      const requests = await db.getSignatureRequestsForDocument(documentType, documentId)
      setExistingRequests(requests || [])
    } catch (err) {
      console.error('Error loading signature requests:', err)
    } finally {
      setLoading(false)
    }
  }

  // Generate a new signature link
  const generateLink = async () => {
    try {
      setGenerating(true)
      setEmailSent(false)

      // Calculate expiration date
      let expiresAt = null
      if (expiresIn !== 'never') {
        const days = parseInt(expiresIn)
        expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + days)
        expiresAt = expiresAt.toISOString()
      }

      const request = await db.createSignatureRequest(
        documentType,
        documentId,
        companyId,
        projectId,
        null, // createdBy - would need user ID
        expiresAt
      )

      if (request) {
        const link = `${window.location.origin}/sign/${request.signature_token}`
        setNewLink(link)
        await loadExistingRequests()

        // Open Outlook with pre-filled email if address was provided
        const email = clientEmail.trim()
        if (email) {
          const name = clientName.trim()
          const docTypeLabel = documentType === 'cor' ? 'Change Order' : 'T&M Ticket'
          const subject = `Signature required: ${docTypeLabel} — ${documentTitle}`
          const expiryLine = expiresAt
            ? `\nThis link expires on ${new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`
            : ''
          const body = [
            name ? `Hi ${name},` : 'To Whom It May Concern,',
            '',
            `Please review and sign the ${docTypeLabel} "${documentTitle}".`,
            '',
            'Click the link below to view and sign the document:',
            link,
            expiryLine,
            '',
            'Thank you',
          ].join('\n')

          window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
          setEmailSent(true)
          onShowToast?.('Outlook opened — review and send the email', 'success')
        } else {
          onShowToast?.('Signature link created', 'success')
        }
      }
    } catch (err) {
      console.error('Error generating signature link:', err)
      onShowToast?.('Failed to create signature link', 'error')
    } finally {
      setGenerating(false)
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
  const docTypeLabel = documentType === 'cor' ? 'Change Order' : 'T&M Ticket'

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
                Send directly to client (optional)
              </h4>
              <div className="email-fields">
                <input
                  type="text"
                  className="link-input"
                  placeholder="Client name"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  autoComplete="off"
                />
                <input
                  type="email"
                  className="link-input"
                  placeholder="client@example.com"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <p className="email-hint">
                If provided, Outlook will open with the email pre-filled — just hit Send.
              </p>
            </div>

            <div className="link-generate-row">
              <button
                className="btn btn-primary"
                onClick={generateLink}
                disabled={generating}
              >
                {generating
                  ? 'Generating...'
                  : (clientEmail.trim() ? 'Generate & Open in Outlook' : 'Generate Link')}
              </button>
            </div>

            {/* Newly generated link */}
            {newLink && (
              <div className="new-link-box">
                {emailSent && (
                  <div className="email-sent-banner">
                    <Mail size={14} />
                    Outlook opened — review and send to {clientEmail}
                  </div>
                )}
                <div className="link-display">
                  <input
                    type="text"
                    value={newLink}
                    readOnly
                    className="link-input"
                  />
                  <button
                    className="btn btn-secondary copy-btn"
                    onClick={() => copyToClipboard(newLink)}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
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
                  const statusBadge = getStatusBadge(request.status)
                  const link = `${window.location.origin}/sign/${request.signature_token}`
                  const signatureCount = request.signatures?.length || 0

                  return (
                    <div key={request.id} className="existing-link-card">
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
                        {request.status !== 'revoked' && request.status !== 'expired' && (
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
                <li>Share the link with your GC or Client (or enter their email above to open Outlook with the email pre-filled)</li>
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
