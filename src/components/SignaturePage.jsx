import { useState, useEffect, useMemo } from 'react'
import { FileText, CheckCircle, Clock, AlertCircle, Building2, Users, Package, Truck, Briefcase, Download, Camera, HardHat, ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { db } from '../lib/supabase'
import { getSigningClient } from '../lib/signingClient'
import { calculateCORTotals, formatCurrency, formatPercent, centsToDollars, formatDateRange } from '../lib/corCalculations'
import { parseLocalDate } from '../lib/utils'
import { exportCORToPDF, exportTMTicketToPDF } from '../lib/corPdfExport'
import SignatureCanvas from './ui/SignatureCanvas'
import StatusBadge from './ui/StatusBadge'
import CORComments from './cor/CORComments'

// Helper to format date. Date-only strings (YYYY-MM-DD) go through
// parseLocalDate so a ticket dated 2026-11-11 renders as "Nov 11" in LA
// instead of "Nov 10" (the UTC-midnight parse of the bare date).
const formatDate = (dateString) => {
  if (!dateString) return ''
  const d = parseLocalDate(dateString)
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Helper to format time (HH:MM or HH:MM:SS to 9:00am format)
const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${minutes}${ampm}`
}

// Raw storage paths of a ticket's photos. The server projection returns
// paths (or legacy public URLs); entries may be strings or { path | url }
// objects. Once a ticket has been resolved we keep the originals on
// `_photoPaths` so they can be re-signed later (PDF export), and the
// signed URLs aligned with them on `_photoUrls` (null where signing
// failed) so a later re-sign can fall back to a URL that still works.
const photoPathsOf = (ticket) => {
  if (Array.isArray(ticket?._photoPaths)) return ticket._photoPaths
  const raw = Array.isArray(ticket?.photos) ? ticket.photos : []
  return raw
    .map(p => (typeof p === 'string' ? p : (p?.path || p?.url || null)))
    .filter(Boolean)
}

// A signed URL that is still valid right now (no TTL margin: this is
// the fallback when re-signing failed, so "usable for this export"
// is the bar, not "fresh for an hour").
const isUsableSignedUrl = (url) => db.isFreshSignedPhotoUrl(url, 0)

// Signature slot shape (as returned in signature_requests.signatures)
// built from the document's own gc_* / client_* columns, so a slot
// filled on-site or through another link renders as signed.
const documentSlot = (doc, prefix) => {
  if (!doc) return null
  const image = doc[`${prefix}_signature_data`]
  const name = doc[`${prefix}_signature_name`]
  if (!image && !name) return null
  return {
    signature_image: image || null,
    signer_name: name || '',
    signer_title: doc[`${prefix}_signature_title`] || null,
    signer_company: doc[`${prefix}_signature_company`] || null,
    signed_at: doc[`${prefix}_signature_date`] || null,
    _from_document: true
  }
}

// Copy for the stable error tokens public_add_signature raises.
const SIGNING_ERROR_COPY = {
  signing_link_expired: 'This signature link has expired.',
  signing_link_revoked: 'This signature link has been revoked.',
  signing_link_invalid: 'This signature link is invalid or has expired.'
}

export default function SignaturePage({ signatureToken }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [signatureRequest, setSignatureRequest] = useState(null)
  const [document, setDocument] = useState(null)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [activeSlot, setActiveSlot] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [downloading, setDownloading] = useState(false)

  // T&M backup documentation state
  const [backupTickets, setBackupTickets] = useState([])
  const [backupExpanded, setBackupExpanded] = useState(false)
  const [expandedTickets, setExpandedTickets] = useState(new Set())

  // Comments between the client and the contractor on a change order.
  // null = not available (the database has no comment support yet).
  const [corComments, setCorComments] = useState(null)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [changeName, setChangeName] = useState('')
  const [changeComment, setChangeComment] = useState('')
  const [changeError, setChangeError] = useState(null)

  // Load signature request and document
  useEffect(() => {
    loadData()
  }, [signatureToken])

  const loadComments = () => Promise.resolve(db.getCORCommentsByToken?.(signatureToken))
    .then(rows => setCorComments(Array.isArray(rows) ? rows : null))
    .catch(() => setCorComments(null))

  useEffect(() => {
    if (signatureRequest?.document_type === 'cor' && document) loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureRequest?.document_type, document?.id])

  // The client sends the change order back with a comment instead of signing
  const handleRequestChanges = async (e) => {
    e.preventDefault()
    if (submitting) return
    const name = changeName.trim()
    const comment = changeComment.trim()
    if (!name || !comment) {
      setChangeError('Enter your name and what should change.')
      return
    }
    setSubmitting(true)
    setChangeError(null)
    try {
      await db.requestCORChanges(signatureToken, comment, name)
      setShowChangeForm(false)
      setChangeComment('')
      setDocument(prev => (prev ? { ...prev, status: 'rejected' } : prev))
      setSuccessMessage('Sent back for changes. The contractor has been asked to revise it.')
      await loadComments()
    } catch (err) {
      console.error('Error requesting changes:', err)
      const message = String(err?.message || '')
      setChangeError(
        message.includes('cor_not_awaiting_client') ? 'This change order is no longer waiting for your signature.'
          : message.includes('signing_link_expired') ? 'This link has expired. Ask the contractor for a new one.'
            : message.includes('signing_already_signed') ? 'This change order has already been signed.'
              : err?.code === 'FEATURE_NOT_AVAILABLE' ? 'Requesting changes is not available yet. Contact the contractor directly.'
                : 'Could not send your comment. Try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Resolve every ticket's photos to signed URLs in one batch using the
  // signing client (the bucket is private; the storage policy reads the
  // x-signing-token header). Keeps the raw paths on `_photoPaths` and
  // the aligned signed URLs on `_photoUrls`. An entry that did not come
  // back as a signed URL (resolvePhotoUrls returns the raw path when the
  // storage call fails) falls back to the URL already on screen when
  // that one is still valid; otherwise the photo is dropped.
  const resolveTicketPhotos = async (tickets) => {
    const list = Array.isArray(tickets) ? tickets.filter(Boolean) : []
    if (!list.length) return []

    const photoGroups = list.map(photoPathsOf)
    const allPhotos = photoGroups.flat()
    let signed = []
    if (allPhotos.length) {
      try {
        signed = await db.resolvePhotoUrls(allPhotos, getSigningClient(signatureToken))
      } catch (err) {
        console.warn('Failed to resolve ticket photos:', err)
        signed = []
      }
    }
    if (!Array.isArray(signed)) signed = []

    let offset = 0
    return list.map((t, i) => {
      const paths = photoGroups[i]
      const previous = Array.isArray(t._photoUrls) ? t._photoUrls : []
      const urls = paths.map((_path, j) => {
        const candidate = signed[offset + j]
        if (isUsableSignedUrl(candidate)) return candidate
        if (isUsableSignedUrl(previous[j])) return previous[j]
        return null
      })
      offset += paths.length
      return {
        ...t,
        _photoPaths: paths,
        _photoUrls: urls,
        photos: urls.filter(Boolean)
      }
    })
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Get signature request by token
      const request = await db.getSignatureRequestByToken(signatureToken)
      if (!request) {
        setError('This signature link is invalid or has expired.')
        return
      }

      // A completed request renders the signed state below.
      if (request.status === 'revoked') {
        setError('This signature link has been revoked.')
        return
      }

      if (request.status === 'expired') {
        setError('This signature link has expired.')
        return
      }

      setSignatureRequest(request)

      // Get the document projection (token-gated RPC)
      const docData = await db.getDocumentForSigning(signatureToken)
      if (!docData) {
        setError('The document associated with this link could not be found.')
        return
      }

      if (request.document_type === 'cor') {
        setDocument(docData)
        setBackupTickets(await resolveTicketPhotos(docData.backup_tickets))
      } else {
        const [resolvedDoc] = await resolveTicketPhotos([docData])
        setDocument(resolvedDoc || docData)
      }
    } catch (err) {
      console.error('Error loading signature data:', err)
      setError('Unable to load signature request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Calculate COR totals
  const totals = useMemo(() => {
    if (!document || signatureRequest?.document_type !== 'cor') return null
    return calculateCORTotals(document)
  }, [document, signatureRequest])

  // Get available signature slots. A slot counts as signed when this
  // request holds its signature OR the document already carries one
  // (signed on-site or through another link): public_add_signature
  // rejects such a slot with signing_already_signed, so never offer it.
  const getSignatureStatus = () => {
    if (!signatureRequest) return { slot1: null, slot2: null, availableSlots: [] }

    const signatures = signatureRequest.signatures || []
    const slot1 = signatures.find(s => s.signature_slot === 1) || documentSlot(document, 'gc')
    const slot2 = signatures.find(s => s.signature_slot === 2) || documentSlot(document, 'client')
    const availableSlots = []
    if (!slot1) availableSlots.push(1)
    if (!slot2) availableSlots.push(2)

    return { slot1, slot2, availableSlots }
  }

  // Handle signature submission. public_add_signature inserts the
  // signature, mirrors it onto the document, advances the status and
  // completes the request in one transaction; the server records
  // signed_at and the IP from the request headers.
  const handleSignatureSubmit = async (signatureData) => {
    if (!signatureRequest || !activeSlot || submitting) return

    try {
      setSubmitting(true)
      setNotice(null)

      await db.addSignature(signatureToken, activeSlot, {
        ...signatureData,
        userAgent: navigator.userAgent
      })

      // Reload data to get updated status
      await loadData()

      setShowSignatureModal(false)
      setActiveSlot(null)
      // Show persistent signed confirmation (don't auto-clear)
      setSuccessMessage('signed')
    } catch (err) {
      console.error('Error submitting signature:', err)
      const message = String(err?.message || '')

      if (message.includes('signing_already_signed')) {
        // A stale tab or a second link for the same document: reload into
        // the signed state and say so inline (never the full-page error).
        setShowSignatureModal(false)
        setActiveSlot(null)
        setNotice('This document has already been signed.')
        await loadData()
      } else if (message.includes('signing_invalid_payload')) {
        // The notice renders under the page header; close the full-screen
        // modal so the signer can actually see it.
        setShowSignatureModal(false)
        setActiveSlot(null)
        setNotice('The signature could not be accepted. Please check your name and signature and try again.')
      } else {
        const token = Object.keys(SIGNING_ERROR_COPY).find(t => message.includes(t))
        setError(token ? SIGNING_ERROR_COPY[token] : 'Failed to submit signature. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Open signature modal for a specific slot
  const openSignatureModal = (slot) => {
    setActiveSlot(slot)
    setShowSignatureModal(true)
  }

  // Handle PDF download with T&M backup
  const handleDownload = async () => {
    if (!document || !signatureRequest) return

    try {
      setDownloading(true)

      // Re-sign the backup ticket photos right before export so the URLs
      // the PDF generator fetches are fresh even if the page sat open for
      // longer than the signed-URL TTL.
      let tmTickets = null
      if (isCOR && backupTickets.length) {
        try {
          tmTickets = await resolveTicketPhotos(backupTickets)
        } catch (err) {
          console.warn('Failed to refresh T&M ticket photos for backup:', err)
          tmTickets = backupTickets
        }
      }

      // Get branding from company
      const branding = {
        logoUrl: company?.logo_url,
        primaryColor: company?.branding_color
      }

      // Export PDF with T&M backup
      await exportCORToPDF(document, project, company, branding, tmTickets)

      setSuccessMessage('PDF downloaded successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Download failed:', err)
      setError('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  // Handle T&M Ticket PDF download
  const handleDownloadTMTicket = async () => {
    if (!document || !signatureRequest) return

    try {
      setDownloading(true)

      const company = document?.projects?.companies
      const project = document?.projects

      // Get branding from company
      const branding = {
        logoUrl: company?.logo_url,
        primaryColor: company?.branding_color
      }

      // Re-sign the photos right before export (see handleDownload)
      let ticketForExport = document
      try {
        const [fresh] = await resolveTicketPhotos([document])
        if (fresh) ticketForExport = fresh
      } catch (err) {
        console.warn('Failed to refresh ticket photos for export:', err)
      }

      // Export T&M Ticket PDF
      await exportTMTicketToPDF(ticketForExport, project, company, branding)

      setSuccessMessage('PDF downloaded successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Download failed:', err)
      setError('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  // Render loading state
  if (loading) {
    return (
      <div className="signature-page">
        <div className="signature-page-loading">
          <div className="loading-spinner"></div>
          <p>Loading document...</p>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="signature-page">
        <div className="signature-page-error">
          <AlertCircle size={48} />
          <h2>Unable to Load Document</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const { slot1, slot2 } = getSignatureStatus()
  // Only one signature is required - either slot1 OR slot2
  const isFullySigned = slot1 || slot2
  const isCOR = signatureRequest?.document_type === 'cor'
  const company = document?.projects?.companies
  const project = document?.projects

  // Render T&M ticket (simpler view)
  if (!isCOR) {
    const workerCount = document.t_and_m_workers?.length || 0
    const totalHours = document.t_and_m_workers?.reduce((sum, w) => sum + (w.hours || 0), 0) || 0

    return (
      <div className="signature-page">
        <header className="signature-page-header">
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="company-logo" />
          ) : (
            <div className="company-logo-placeholder">
              <Building2 size={24} />
            </div>
          )}
          <div className="company-info">
            <h1>{company?.name || 'FieldSync'}</h1>
            <span className="doc-type-label">Time & Material Ticket</span>
          </div>
        </header>

        {notice && (
          <div className="signature-notice" role="status">
            <AlertCircle size={18} />
            <span>{notice}</span>
          </div>
        )}

        {successMessage === 'signed' && (
          <div className="signature-signed-overlay">
            <div className="signature-signed-content">
              <CheckCircle size={48} />
              <h2>Document Signed Successfully</h2>
              <p>This document has been signed and submitted.</p>
              <button
                className="btn btn-primary download-copy-btn"
                onClick={handleDownloadTMTicket}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <span className="btn-spinner"></span>
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Save a Copy for Your Records
                  </>
                )}
              </button>
              <p className="close-prompt">You may close this page when done.</p>
            </div>
          </div>
        )}

        <main className="signature-page-content">
          <div className="signature-document-card">
            <div className="document-card-header">
              <FileText size={20} />
              <div className="document-card-title">
                <h2>Time & Material Ticket</h2>
                <span className="document-subtitle">
                  {document.ce_pco_number ? `CE/PCO: ${document.ce_pco_number}` : 'Time & Materials'}
                </span>
              </div>
            </div>

            <div className="document-card-details">
              <div className="detail-row">
                <span className="detail-label">Project</span>
                <span className="detail-value">{project?.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Work Date</span>
                <span className="detail-value">{formatDate(document.work_date)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Workers</span>
                <span className="detail-value">{workerCount} ({totalHours} hrs)</span>
              </div>
              {document.notes && (
                <div className="detail-row full-width">
                  <span className="detail-label">Description</span>
                  <span className="detail-value">{document.notes}</span>
                </div>
              )}
            </div>

            {/* Full Ticket Details - Workers */}
            {document.t_and_m_workers?.length > 0 && (
              <div className="signature-detail-section">
                <h4><HardHat size={16} /> Workers</h4>
                <table className="signature-detail-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Time</th>
                      <th>Reg Hrs</th>
                      <th>OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {document.t_and_m_workers.map((w, idx) => (
                      <tr key={idx}>
                        <td>{w.name}</td>
                        <td>{w.role || 'Laborer'}</td>
                        <td>
                          {w.time_started && w.time_ended
                            ? `${formatTime(w.time_started)} - ${formatTime(w.time_ended)}`
                            : '-'}
                        </td>
                        <td>{w.hours || 0}</td>
                        <td>{w.overtime_hours || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Full Ticket Details - Materials/Equipment */}
            {document.t_and_m_items?.length > 0 && (
              <div className="signature-detail-section">
                <h4><Package size={16} /> Materials & Equipment</h4>
                <table className="signature-detail-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {document.t_and_m_items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.custom_name || item.materials_equipment?.name || 'Item'}</td>
                        <td>{item.quantity}</td>
                        <td>{item.materials_equipment?.unit || 'each'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Full Ticket Details - Photos */}
            {document.photos?.length > 0 && (
              <div className="signature-detail-section">
                <h4><Camera size={16} /> Photos ({document.photos.length})</h4>
                <div className="signature-photo-grid">
                  {document.photos.map((photo, idx) => {
                    const src = typeof photo === 'string' ? photo : photo?.url
                    if (!src) return null
                    return (
                      <div key={idx} className="signature-photo-thumb">
                        <img
                          src={src}
                          alt={`Photo ${idx + 1}`}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Foreman Signature Display (if exists) */}
          {document.foreman_signature_data && (
            <div className="signature-status-section">
              <h3>Foreman Certification</h3>
              <div className="signature-slot-card completed">
                <div className="slot-header">
                  <CheckCircle size={18} />
                  <span>Signed by Foreman</span>
                </div>
                <div className="slot-details">
                  <div className="slot-signature-preview">
                    <img src={document.foreman_signature_data} alt="Foreman signature" />
                  </div>
                  <div className="slot-signer-info">
                    <span className="signer-name">{document.foreman_signature_name}</span>
                    {document.foreman_signature_title && (
                      <span className="signer-title">{document.foreman_signature_title}</span>
                    )}
                    {document.foreman_signature_date && (
                      <span className="signer-date">
                        {new Date(document.foreman_signature_date).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Signature section */}
          <div className="signature-status-section">
            <h3>Client Signature</h3>
            {/* A ticket carries one client signature. Slot 2 is the client's;
                a slot 1 signature on an older ticket counts as the same thing. */}
            {renderSignatureSlot(2, slot2 || slot1, 'Client signature', openSignatureModal, submitting)}
            {isFullySigned && (
              <div className="fully-signed-message">
                <CheckCircle size={24} />
                <p>This document has been signed.</p>
              </div>
            )}
          </div>
        </main>

        <footer className="signature-page-footer">
          <p>Powered by FieldSync</p>
        </footer>

        {showSignatureModal && activeSlot && (
          <SignatureCanvas
            enhanced
            requireAcknowledgment
            lockBodyScroll
            slot={activeSlot}
            documentType="tm_ticket"
            documentTitle="Time & Material Ticket"
            onSave={handleSignatureSubmit}
            onClose={() => {
              setShowSignatureModal(false)
              setActiveSlot(null)
            }}
          />
        )}
      </div>
    )
  }

  // Render full COR document
  return (
    <div className="signature-page">
      {/* Header with company branding */}
      <header className="signature-page-header">
        {company?.logo_url ? (
          <img src={company.logo_url} alt={company.name} className="company-logo" />
        ) : (
          <div className="company-logo-placeholder">
            <Building2 size={24} />
          </div>
        )}
        <div className="company-info">
          <h1>{company?.name || 'FieldSync'}</h1>
          <span className="doc-type-label">Change Order Request</span>
        </div>
      </header>

      {notice && (
        <div className="signature-notice" role="status">
          <AlertCircle size={18} />
          <span>{notice}</span>
        </div>
      )}

      {/* Success message - persistent signed confirmation */}
      {successMessage === 'signed' && (
        <div className="signature-signed-overlay">
          <div className="signature-signed-content">
            <CheckCircle size={48} />
            <h2>Document Signed Successfully</h2>
            <p>This document has been signed and submitted.</p>
            <button
              className="btn btn-primary download-copy-btn"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <span className="btn-spinner"></span>
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Save a Copy for Your Records
                </>
              )}
            </button>
            <p className="close-prompt">You may close this page when done.</p>
          </div>
        </div>
      )}

      {/* Main COR Document */}
      <main className="signature-page-content cor-full-document">
        {/* COR Header Card */}
        <div className="cor-header-card">
          <div className="cor-header-top">
            <div className="cor-title-section">
              <h2 className="cor-number">{document.cor_number}</h2>
              <StatusBadge status={document.status} />
            </div>
            <div className="cor-date">
              Created {formatDate(document.created_at)}
            </div>
          </div>

          <h3 className="cor-title">{document.title || 'Untitled Change Order'}</h3>

          <div className="cor-info-grid">
            <div className="cor-info-item">
              <span className="cor-info-label">Project</span>
              <span className="cor-info-value">{project?.name}</span>
            </div>
            {project?.job_number && (
              <div className="cor-info-item">
                <span className="cor-info-label">Job #</span>
                <span className="cor-info-value">{project.job_number}</span>
              </div>
            )}
            <div className="cor-info-item">
              <span className="cor-info-label">Period</span>
              <span className="cor-info-value">{formatDateRange(document.period_start, document.period_end)}</span>
            </div>
          </div>

          {document.scope_of_work && (
            <div className="cor-scope">
              <h4>Scope of Work</h4>
              <p>{document.scope_of_work}</p>
            </div>
          )}
        </div>

        {/* Labor Section */}
        {document.change_order_labor?.length > 0 && (
          <div className="cor-section">
            <div className="cor-section-header">
              <Users size={18} />
              <h4>Labor</h4>
            </div>
            <div className="cor-table-wrapper">
              <table className="cor-line-items-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Type</th>
                    <th className="text-right">Reg Hrs</th>
                    <th className="text-right">Reg Rate</th>
                    <th className="text-right">OT Hrs</th>
                    <th className="text-right">OT Rate</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {document.change_order_labor.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.labor_class}</td>
                      <td>{item.wage_type}</td>
                      <td className="text-right">{item.regular_hours}</td>
                      <td className="text-right">${centsToDollars(item.regular_rate)}/hr</td>
                      <td className="text-right">{item.overtime_hours || '-'}</td>
                      <td className="text-right">{item.overtime_hours ? `$${centsToDollars(item.overtime_rate)}/hr` : '-'}</td>
                      <td className="text-right">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5" className="text-right">Subtotal:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.labor_subtotal)}</td>
                  </tr>
                  <tr className="markup-row">
                    <td colSpan="5" className="text-right">+ {formatPercent(document.labor_markup_percent || 1500)} Markup:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.labor_markup_amount)}</td>
                  </tr>
                  <tr className="section-total-row">
                    <td colSpan="5" className="text-right"><strong>Labor Total:</strong></td>
                    <td className="text-right" colSpan="2"><strong>{formatCurrency(totals.labor_subtotal + totals.labor_markup_amount)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Materials Section */}
        {document.change_order_materials?.length > 0 && (
          <div className="cor-section">
            <div className="cor-section-header">
              <Package size={18} />
              <h4>Materials</h4>
            </div>
            <div className="cor-table-wrapper">
              <table className="cor-line-items-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Source</th>
                    <th className="text-right">Qty</th>
                    <th>Unit</th>
                    <th className="text-right">Unit Cost</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {document.change_order_materials.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.description}</td>
                      <td>{item.source_reference || item.source_type}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td>{item.unit}</td>
                      <td className="text-right">${centsToDollars(item.unit_cost)}</td>
                      <td className="text-right">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" className="text-right">Subtotal:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.materials_subtotal)}</td>
                  </tr>
                  <tr className="markup-row">
                    <td colSpan="4" className="text-right">+ {formatPercent(document.materials_markup_percent || 1500)} Markup:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.materials_markup_amount)}</td>
                  </tr>
                  <tr className="section-total-row">
                    <td colSpan="4" className="text-right"><strong>Materials Total:</strong></td>
                    <td className="text-right" colSpan="2"><strong>{formatCurrency(totals.materials_subtotal + totals.materials_markup_amount)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Equipment Section */}
        {document.change_order_equipment?.length > 0 && (
          <div className="cor-section">
            <div className="cor-section-header">
              <Truck size={18} />
              <h4>Equipment</h4>
            </div>
            <div className="cor-table-wrapper">
              <table className="cor-line-items-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Source</th>
                    <th className="text-right">Qty</th>
                    <th>Unit</th>
                    <th className="text-right">Unit Cost</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {document.change_order_equipment.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.description}</td>
                      <td>{item.source_reference || item.source_type}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td>{item.unit}</td>
                      <td className="text-right">${centsToDollars(item.unit_cost)}</td>
                      <td className="text-right">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" className="text-right">Subtotal:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.equipment_subtotal)}</td>
                  </tr>
                  <tr className="markup-row">
                    <td colSpan="4" className="text-right">+ {formatPercent(document.equipment_markup_percent || 1500)} Markup:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.equipment_markup_amount)}</td>
                  </tr>
                  <tr className="section-total-row">
                    <td colSpan="4" className="text-right"><strong>Equipment Total:</strong></td>
                    <td className="text-right" colSpan="2"><strong>{formatCurrency(totals.equipment_subtotal + totals.equipment_markup_amount)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Subcontractors Section */}
        {document.change_order_subcontractors?.length > 0 && (
          <div className="cor-section">
            <div className="cor-section-header">
              <Briefcase size={18} />
              <h4>Subcontractors</h4>
            </div>
            <div className="cor-table-wrapper">
              <table className="cor-line-items-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Description</th>
                    <th>Source</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {document.change_order_subcontractors.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.company_name}</td>
                      <td>{item.description}</td>
                      <td>{item.source_reference || item.source_type}</td>
                      <td className="text-right">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2" className="text-right">Subtotal:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.subcontractors_subtotal)}</td>
                  </tr>
                  <tr className="markup-row">
                    <td colSpan="2" className="text-right">+ {formatPercent(document.subcontractors_markup_percent || 500)} Markup:</td>
                    <td className="text-right" colSpan="2">{formatCurrency(totals.subcontractors_markup_amount)}</td>
                  </tr>
                  <tr className="section-total-row">
                    <td colSpan="2" className="text-right"><strong>Subcontractors Total:</strong></td>
                    <td className="text-right" colSpan="2"><strong>{formatCurrency(totals.subcontractors_subtotal + totals.subcontractors_markup_amount)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* T&M Backup Documentation Section - Professional Layout */}
        {backupTickets.length > 0 && (() => {
          // Calculate summary statistics
          const totalLaborHours = backupTickets.reduce((sum, t) =>
            sum + (t.t_and_m_workers?.reduce((wSum, w) => wSum + (parseFloat(w.hours) || 0), 0) || 0), 0
          )
          const totalOTHours = backupTickets.reduce((sum, t) =>
            sum + (t.t_and_m_workers?.reduce((wSum, w) => wSum + (parseFloat(w.overtime_hours) || 0), 0) || 0), 0
          )
          const totalPhotos = backupTickets.reduce((sum, t) => sum + (t.photos?.length || 0), 0)
          const verifiedCount = backupTickets.filter(t => t.client_signature_data).length

          return (
            <div className="cor-section cor-backup-section">
              {/* Professional Official Header */}
              <div className="backup-official-header">
                <div className="backup-official-badge">
                  <FileText size={16} />
                  <span>Supporting Documentation</span>
                </div>
                <div className="backup-summary-bar">
                  <div className="backup-stat">
                    <span className="backup-stat-value">{backupTickets.length}</span>
                    <span className="backup-stat-label">Tickets</span>
                  </div>
                  <div className="backup-stat">
                    <span className="backup-stat-value">{totalLaborHours.toFixed(1)}</span>
                    <span className="backup-stat-label">Labor Hrs</span>
                  </div>
                  {totalOTHours > 0 && (
                    <div className="backup-stat">
                      <span className="backup-stat-value">{totalOTHours.toFixed(1)}</span>
                      <span className="backup-stat-label">OT Hrs</span>
                    </div>
                  )}
                  <div className="backup-stat">
                    <span className="backup-stat-value">{totalPhotos}</span>
                    <span className="backup-stat-label">Photos</span>
                  </div>
                  {verifiedCount > 0 && (
                    <div className="backup-stat verified">
                      <span className="backup-stat-value">{verifiedCount}</span>
                      <span className="backup-stat-label">Verified</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Collapsible Toggle */}
              <div
                className="cor-section-header cor-backup-header"
                onClick={() => setBackupExpanded(!backupExpanded)}
                style={{ cursor: 'pointer', marginBottom: backupExpanded ? '1rem' : 0 }}
              >
                <div className="backup-header-left">
                  <span>View All Time and Material Tickets</span>
                </div>
                <div className="backup-header-toggle">
                  {backupExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {backupExpanded && (
                <div className="backup-tickets-list" style={{ padding: '0 0.5rem' }}>
                  {backupTickets.map((ticket) => {
                    const isExpanded = expandedTickets.has(ticket.id)
                    const ticketTotalHours = ticket.t_and_m_workers?.reduce((sum, w) =>
                      sum + (parseFloat(w.hours) || 0), 0
                    ) || 0
                    const ticketOTHours = ticket.t_and_m_workers?.reduce((sum, w) =>
                      sum + (parseFloat(w.overtime_hours) || 0), 0
                    ) || 0
                    const hasVerification = !!ticket.client_signature_data

                    return (
                      <div
                        key={ticket.id}
                        className="backup-ticket-pro"
                        data-verified={hasVerification}
                        data-status={ticket.status || 'pending'}
                      >
                        {/* Professional Ticket Header */}
                        <div
                          className="ticket-pro-header"
                          onClick={() => {
                            const next = new Set(expandedTickets)
                            if (isExpanded) {
                              next.delete(ticket.id)
                            } else {
                              next.add(ticket.id)
                            }
                            setExpandedTickets(next)
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="ticket-date-badge">
                            <Calendar size={14} />
                            <span>{formatDate(ticket.work_date)}</span>
                          </div>
                          {ticket.ce_pco_number && (
                            <span className="ticket-pco-badge">{ticket.ce_pco_number}</span>
                          )}
                          {hasVerification && (
                            <span className="ticket-verified-seal">
                              <CheckCircle size={12} /> Verified
                            </span>
                          )}
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              {ticket.t_and_m_workers?.length || 0} workers • {ticketTotalHours + ticketOTHours} hrs
                            </span>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </div>

                        {/* Ticket Body - Expanded Content */}
                        {isExpanded && (
                          <div className="ticket-pro-body">
                            {/* Description */}
                            {ticket.notes && (
                              <div className="ticket-description-box">
                                <p>{ticket.notes}</p>
                              </div>
                            )}

                            {/* Workers Section */}
                            {ticket.t_and_m_workers?.length > 0 && (
                              <div className="ticket-section-pro">
                                <div className="ticket-section-header">
                                  <HardHat size={14} />
                                  <span>Labor</span>
                                  <span className="section-count">{ticketTotalHours + ticketOTHours} hrs total</span>
                                </div>
                                <div className="worker-pro-grid">
                                  {ticket.t_and_m_workers.map((worker, wIdx) => (
                                    <div key={wIdx} className="worker-pro-row">
                                      <div>
                                        <span className="worker-name">{worker.name}</span>
                                        {worker.role && <span className="worker-role"> • {worker.role}</span>}
                                      </div>
                                      <span className="worker-time">
                                        {worker.time_started && worker.time_ended
                                          ? `${formatTime(worker.time_started)} - ${formatTime(worker.time_ended)}`
                                          : '-'}
                                      </span>
                                      <span className="worker-hours">{worker.hours || 0} hrs</span>
                                      <span className="worker-ot">
                                        {parseFloat(worker.overtime_hours) > 0 ? `+${worker.overtime_hours} OT` : '-'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Materials Section */}
                            {ticket.t_and_m_items?.length > 0 && (
                              <div className="ticket-section-pro">
                                <div className="ticket-section-header">
                                  <Package size={14} />
                                  <span>Materials / Equipment</span>
                                  <span className="section-count">{ticket.t_and_m_items.length} items</span>
                                </div>
                                <div className="materials-pro-list">
                                  {ticket.t_and_m_items.map((item, iIdx) => (
                                    <div key={iIdx} className="material-pro-row">
                                      <span className="material-name">
                                        {item.materials_equipment?.name || item.description || 'Item'}
                                      </span>
                                      <span className="material-qty">
                                        {item.quantity || 1} {item.materials_equipment?.unit || 'ea'}
                                      </span>
                                      <span className="material-source">Time & Material</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Photos Section */}
                            {ticket.photos?.length > 0 && (
                              <div className="ticket-section-pro">
                                <div className="ticket-section-header">
                                  <Camera size={14} />
                                  <span>Photo Evidence</span>
                                  <span className="section-count">{ticket.photos.length}</span>
                                </div>
                                <div className="photo-evidence-grid">
                                  {ticket.photos.map((photo, pIdx) => (
                                    <a
                                      key={pIdx}
                                      href={photo}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="photo-evidence-item"
                                    >
                                      <img
                                        src={photo}
                                        alt={`Evidence ${pIdx + 1}`}
                                        onError={(e) => {
                                          e.target.onerror = null
                                          e.target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5NGEzYjgiIHN0cm9rZS13aWR0aD0iMiI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBvbHlsaW5lIHBvaW50cz0iMjEgMTUgMTYgMTAgNSAyMSIvPjwvc3ZnPg=='
                                        }}
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Client Verification Footer */}
                            {hasVerification && (
                              <div className="ticket-verification-footer">
                                <div className="verification-seal-icon">
                                  <CheckCircle size={22} />
                                </div>
                                {ticket.client_signature_data && (
                                  <img
                                    src={ticket.client_signature_data}
                                    alt="Client Signature"
                                    className="verification-signature-img"
                                  />
                                )}
                                <div className="verification-info">
                                  <span className="signer-name">{ticket.client_signature_name || 'Client'}</span>
                                  {(ticket.client_signature_title || ticket.client_signature_company) && (
                                    <span className="signer-title">
                                      {[ticket.client_signature_title, ticket.client_signature_company].filter(Boolean).join(', ')}
                                    </span>
                                  )}
                                  {ticket.client_signature_date && (
                                    <span className="verify-date">Verified {formatDate(ticket.client_signature_date)}</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="backup-note">
                <AlertCircle size={14} />
                <span>This documentation supports the work described in this Change Order Request.</span>
              </div>
            </div>
          )
        })()}

        {/* Totals Section */}
        <div className="cor-totals-card">
          <h4>COR Summary</h4>

          <div className="cor-totals-grid">
            <div className="cor-total-row">
              <span>COR Subtotal</span>
              <span>{formatCurrency(totals.cor_subtotal)}</span>
            </div>

            <div className="cor-fees-section">
              <div className="cor-fee-row">
                <span>Liability Insurance ({formatPercent(document.liability_insurance_percent || 144)})</span>
                <span>{formatCurrency(totals.liability_insurance_amount)}</span>
              </div>
              <div className="cor-fee-row">
                <span>Bond ({formatPercent(document.bond_percent || 100)})</span>
                <span>{formatCurrency(totals.bond_amount)}</span>
              </div>
              <div className="cor-fee-row">
                <span>City License Fee ({formatPercent(document.license_fee_percent || 10)})</span>
                <span>{formatCurrency(totals.license_fee_amount)}</span>
              </div>
            </div>

            <div className="cor-grand-total">
              <span>COR TOTAL</span>
              <span>{formatCurrency(totals.cor_total)}</span>
            </div>
          </div>
        </div>

        {/* Comments with the contractor */}
        {corComments !== null && corComments.length > 0 && (
          <CORComments comments={corComments} viewer="client" />
        )}

        {/* Signature Section */}
        <div className="cor-signature-section">
          <h4>Authorization</h4>
          <p className="signature-instruction">
            By signing below, you authorize the above change order request and agree to the terms and costs outlined.
          </p>

          <div className="signature-slots-grid">
            {/* A change order is approved by one client signature. It is stored in
                slot 1, the slot that approves the COR; a slot 2 signature on an
                older COR is shown the same way. */}
            {(() => {
              const clientSlot = slot1 || slot2
              if (!clientSlot && document.status === 'rejected') {
                return (
                  <div className="signature-slot-card unsigned">
                    <div className="slot-header">
                      <AlertCircle size={20} className="status-icon pending" />
                      <span className="slot-label">Returned for changes</span>
                    </div>
                    <p className="cor-returned-note">
                      This change order was sent back to the contractor. You will receive the revised version to sign.
                    </p>
                  </div>
                )
              }
              return !clientSlot ? (
                <div className="signature-slot-card unsigned">
                  <div className="slot-header">
                    <Clock size={20} className="status-icon pending" />
                    <span className="slot-label">Client signature</span>
                  </div>
                  <button
                    className="btn btn-primary sign-btn"
                    onClick={() => openSignatureModal(1)}
                    disabled={submitting}
                  >
                    Sign to approve
                  </button>
                  {corComments !== null && !showChangeForm && (
                    <button
                      className="btn btn-secondary sign-btn"
                      onClick={() => { setShowChangeForm(true); setChangeError(null) }}
                      disabled={submitting}
                    >
                      Request changes
                    </button>
                  )}
                  {showChangeForm && (
                    <form className="cor-change-form" onSubmit={handleRequestChanges}>
                      <label htmlFor="cor-change-name">Your name</label>
                      <input
                        id="cor-change-name"
                        type="text"
                        value={changeName}
                        onChange={(e) => setChangeName(e.target.value)}
                        maxLength={120}
                        autoComplete="name"
                      />
                      <label htmlFor="cor-change-comment">What should change?</label>
                      <textarea
                        id="cor-change-comment"
                        value={changeComment}
                        onChange={(e) => setChangeComment(e.target.value)}
                        rows={4}
                        maxLength={4000}
                        placeholder="For example: hours on the Nov 3 ticket look high, or the scope includes work not requested."
                      />
                      {changeError && <p className="cor-change-error" role="alert">{changeError}</p>}
                      <div className="cor-change-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setShowChangeForm(false)} disabled={submitting}>
                          Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                          {submitting ? 'Sending...' : 'Send back for changes'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div className="signature-slot-card signed">
                  <div className="slot-header">
                    <CheckCircle size={20} className="status-icon signed" />
                    <span className="slot-label">Client signature</span>
                  </div>
                  <div className="slot-signed-info">
                    {clientSlot.signature_image && (
                      <img src={clientSlot.signature_image} alt="Signature" className="signature-image" />
                    )}
                    <div className="signer-details">
                      <span className="signer-name">{clientSlot.signer_name}</span>
                      {(clientSlot.signer_title || clientSlot.signer_company) && (
                        <span className="signer-org">
                          {clientSlot.signer_title}{clientSlot.signer_title && clientSlot.signer_company && ' — '}{clientSlot.signer_company}
                        </span>
                      )}
                    </div>
                    <span className="signed-date">Signed {formatDate(clientSlot.signed_at)}</span>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Fully signed message */}
          {isFullySigned && (
            <div className="fully-signed-message">
              <CheckCircle size={24} />
              <p>This change order request has been signed.</p>
            </div>
          )}

          {/* Download section - always available so clients can save a copy */}
          <div className="cor-download-section">
            <h4>Download Your Copy</h4>
            <p className="download-description">
              {isFullySigned
                ? 'Download a PDF copy of this fully signed COR including all Time and Material backup documentation.'
                : 'Download a PDF copy of this COR for your records. Signature status will be included.'}
            </p>
            <button
              className="btn btn-primary download-btn"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <span className="download-spinner"></span>
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Download COR + Backup
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="signature-page-footer">
        <p>Powered by FieldSync</p>
      </footer>

      {/* Signature modal */}
      {showSignatureModal && activeSlot && (
        <SignatureCanvas
          enhanced
          requireAcknowledgment
          lockBodyScroll
          slot={activeSlot}
          documentType={signatureRequest.document_type}
          documentTitle={`${document.cor_number} - ${document.title}`}
          onSave={handleSignatureSubmit}
          onClose={() => {
            setShowSignatureModal(false)
            setActiveSlot(null)
          }}
        />
      )}
    </div>
  )
}

// Helper function to render a signature slot (for T&M tickets)
function renderSignatureSlot(slot, signatureData, label, openModal, submitting) {
  return (
    <div className={`signature-slot-card ${signatureData ? 'signed' : 'unsigned'}`}>
      <div className="slot-header">
        {signatureData ? (
          <CheckCircle size={20} className="status-icon signed" />
        ) : (
          <Clock size={20} className="status-icon pending" />
        )}
        <span className="slot-label">{label}</span>
      </div>

      {signatureData ? (
        <div className="slot-signed-info">
          <div className="signer-details">
            <span className="signer-name">{signatureData.signer_name}</span>
            {(signatureData.signer_title || signatureData.signer_company) && (
              <span className="signer-org">
                {signatureData.signer_title}{signatureData.signer_title && signatureData.signer_company && ' — '}{signatureData.signer_company}
              </span>
            )}
          </div>
          <span className="signed-date">Signed {formatDate(signatureData.signed_at)}</span>
        </div>
      ) : (
        <button
          className="btn btn-primary sign-btn"
          onClick={() => openModal(slot)}
          disabled={submitting}
        >
          Sign
        </button>
      )}
    </div>
  )
}
