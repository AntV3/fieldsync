import { useState, useEffect } from 'react'
import { FileText, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Building2 } from 'lucide-react'
import { db } from '../lib/supabase'
import EnhancedSignatureCapture from './EnhancedSignatureCapture'

// Helper to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount || 0)
}

// Helper to format date
const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export default function SignaturePage({ signatureToken }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [signatureRequest, setSignatureRequest] = useState(null)
  const [document, setDocument] = useState(null)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [activeSlot, setActiveSlot] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [expandDetails, setExpandDetails] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)

  // Load signature request and document
  useEffect(() => {
    loadData()
  }, [signatureToken])

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

      if (request.status === 'completed') {
        setError('This document has already been fully signed.')
        return
      }

      if (request.status === 'revoked') {
        setError('This signature link has been revoked.')
        return
      }

      if (request.status === 'expired') {
        setError('This signature link has expired.')
        return
      }

      setSignatureRequest(request)

      // Get the document data
      const docData = await db.getDocumentForSigning(request.document_type, request.document_id)
      if (!docData) {
        setError('The document associated with this link could not be found.')
        return
      }

      setDocument(docData)
    } catch (err) {
      console.error('Error loading signature data:', err)
      setError('Unable to load signature request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Get available signature slots
  const getSignatureStatus = () => {
    if (!signatureRequest) return { slot1: null, slot2: null, availableSlots: [] }

    const signatures = signatureRequest.signatures || []
    const slot1 = signatures.find(s => s.signature_slot === 1)
    const slot2 = signatures.find(s => s.signature_slot === 2)
    const availableSlots = []
    if (!slot1) availableSlots.push(1)
    if (!slot2) availableSlots.push(2)

    return { slot1, slot2, availableSlots }
  }

  // Get client IP address
  const getClientIP = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json')
      const data = await response.json()
      return data.ip
    } catch {
      return null
    }
  }

  // Handle signature submission
  const handleSignatureSubmit = async (signatureData) => {
    if (!signatureRequest || !activeSlot) return

    try {
      setSubmitting(true)

      // Get IP address
      const ipAddress = await getClientIP()

      // Add signature
      const signature = await db.addSignature(signatureRequest.id, activeSlot, {
        ...signatureData,
        ipAddress,
        userAgent: navigator.userAgent
      })

      // Sync signature to main document table
      await db.syncSignatureToDocument(signature, signatureRequest)

      // Reload data to get updated status
      await loadData()

      setShowSignatureModal(false)
      setActiveSlot(null)
      setSuccessMessage(`Signature ${activeSlot} has been recorded successfully.`)

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      console.error('Error submitting signature:', err)
      setError('Failed to submit signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Open signature modal for a specific slot
  const openSignatureModal = (slot) => {
    setActiveSlot(slot)
    setShowSignatureModal(true)
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

  const { slot1, slot2, availableSlots } = getSignatureStatus()
  const isFullySigned = availableSlots.length === 0
  const isCOR = signatureRequest?.document_type === 'cor'
  const company = document?.projects?.companies
  const project = document?.projects

  // Document summary based on type
  const getDocumentSummary = () => {
    if (isCOR) {
      return {
        title: `COR ${document.cor_number}`,
        subtitle: document.title || 'Change Order Request',
        amount: document.cor_total,
        period: document.period_start && document.period_end
          ? `${formatDate(document.period_start)} - ${formatDate(document.period_end)}`
          : null,
        status: document.status
      }
    } else {
      // T&M Ticket
      const workerCount = document.t_and_m_workers?.length || 0
      const totalHours = document.t_and_m_workers?.reduce((sum, w) => sum + (w.hours || 0), 0) || 0
      return {
        title: `T&M Ticket`,
        subtitle: document.ce_pco_number ? `CE/PCO: ${document.ce_pco_number}` : 'Time & Materials',
        amount: document.change_order_value,
        period: formatDate(document.work_date),
        status: document.status,
        workers: workerCount,
        hours: totalHours
      }
    }
  }

  const summary = getDocumentSummary()

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
          <span className="doc-type-label">Document Signature</span>
        </div>
      </header>

      {/* Success message */}
      {successMessage && (
        <div className="signature-success-banner">
          <CheckCircle size={18} />
          {successMessage}
        </div>
      )}

      {/* Main content */}
      <main className="signature-page-content">
        {/* Document card */}
        <div className="signature-document-card">
          <div className="document-card-header">
            <FileText size={20} />
            <div className="document-card-title">
              <h2>{summary.title}</h2>
              <span className="document-subtitle">{summary.subtitle}</span>
            </div>
          </div>

          <div className="document-card-details">
            <div className="detail-row">
              <span className="detail-label">Project</span>
              <span className="detail-value">{project?.name}</span>
            </div>
            {project?.job_number && (
              <div className="detail-row">
                <span className="detail-label">Job #</span>
                <span className="detail-value">{project.job_number}</span>
              </div>
            )}
            {summary.amount > 0 && (
              <div className="detail-row">
                <span className="detail-label">Amount</span>
                <span className="detail-value amount">{formatCurrency(summary.amount)}</span>
              </div>
            )}
            {summary.period && (
              <div className="detail-row">
                <span className="detail-label">{isCOR ? 'Period' : 'Work Date'}</span>
                <span className="detail-value">{summary.period}</span>
              </div>
            )}
            {!isCOR && summary.workers > 0 && (
              <div className="detail-row">
                <span className="detail-label">Workers</span>
                <span className="detail-value">{summary.workers} ({summary.hours} hrs)</span>
              </div>
            )}
          </div>

          {/* Expandable details section */}
          <button
            className="expand-details-btn"
            onClick={() => setExpandDetails(!expandDetails)}
          >
            {expandDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expandDetails ? 'Hide Details' : 'View Full Details'}
          </button>

          {expandDetails && (
            <div className="document-full-details">
              {isCOR ? (
                <>
                  {document.description && (
                    <div className="detail-section">
                      <h4>Description</h4>
                      <p>{document.description}</p>
                    </div>
                  )}
                  {document.change_order_labor?.length > 0 && (
                    <div className="detail-section">
                      <h4>Labor ({document.change_order_labor.length} items)</h4>
                      <ul>
                        {document.change_order_labor.slice(0, 5).map((item, i) => (
                          <li key={i}>{item.description}: {item.hours}hrs @ {formatCurrency(item.rate)}/hr</li>
                        ))}
                        {document.change_order_labor.length > 5 && (
                          <li className="more-items">+{document.change_order_labor.length - 5} more items</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {document.change_order_materials?.length > 0 && (
                    <div className="detail-section">
                      <h4>Materials ({document.change_order_materials.length} items)</h4>
                      <ul>
                        {document.change_order_materials.slice(0, 5).map((item, i) => (
                          <li key={i}>{item.description}: {item.quantity} @ {formatCurrency(item.unit_cost)}</li>
                        ))}
                        {document.change_order_materials.length > 5 && (
                          <li className="more-items">+{document.change_order_materials.length - 5} more items</li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {document.notes && (
                    <div className="detail-section">
                      <h4>Work Description</h4>
                      <p>{document.notes}</p>
                    </div>
                  )}
                  {document.t_and_m_workers?.length > 0 && (
                    <div className="detail-section">
                      <h4>Workers</h4>
                      <ul>
                        {document.t_and_m_workers.map((worker, i) => (
                          <li key={i}>{worker.name}: {worker.hours}hrs {worker.overtime_hours > 0 && `(+${worker.overtime_hours} OT)`}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Signature status section */}
        <div className="signature-status-section">
          <h3>Signatures Required</h3>

          {/* Signature 1 (GC) */}
          <div className={`signature-slot-card ${slot1 ? 'signed' : 'unsigned'}`}>
            <div className="slot-header">
              {slot1 ? (
                <CheckCircle size={20} className="status-icon signed" />
              ) : (
                <Clock size={20} className="status-icon pending" />
              )}
              <span className="slot-label">Signature 1 - GC Authorization</span>
            </div>

            {slot1 ? (
              <div className="slot-signed-info">
                <div className="signer-details">
                  <span className="signer-name">{slot1.signer_name}</span>
                  {(slot1.signer_title || slot1.signer_company) && (
                    <span className="signer-org">
                      {slot1.signer_title}{slot1.signer_title && slot1.signer_company && ' - '}{slot1.signer_company}
                    </span>
                  )}
                </div>
                <span className="signed-date">Signed {formatDate(slot1.signed_at)}</span>
              </div>
            ) : (
              <button
                className="btn btn-primary sign-btn"
                onClick={() => openSignatureModal(1)}
                disabled={submitting}
              >
                Sign as GC
              </button>
            )}
          </div>

          {/* Signature 2 (Client) */}
          <div className={`signature-slot-card ${slot2 ? 'signed' : 'unsigned'}`}>
            <div className="slot-header">
              {slot2 ? (
                <CheckCircle size={20} className="status-icon signed" />
              ) : (
                <Clock size={20} className="status-icon pending" />
              )}
              <span className="slot-label">Signature 2 - Client Authorization</span>
            </div>

            {slot2 ? (
              <div className="slot-signed-info">
                <div className="signer-details">
                  <span className="signer-name">{slot2.signer_name}</span>
                  {(slot2.signer_title || slot2.signer_company) && (
                    <span className="signer-org">
                      {slot2.signer_title}{slot2.signer_title && slot2.signer_company && ' - '}{slot2.signer_company}
                    </span>
                  )}
                </div>
                <span className="signed-date">Signed {formatDate(slot2.signed_at)}</span>
              </div>
            ) : (
              <button
                className="btn btn-primary sign-btn"
                onClick={() => openSignatureModal(2)}
                disabled={submitting}
              >
                Sign as Client
              </button>
            )}
          </div>

          {/* Fully signed message */}
          {isFullySigned && (
            <div className="fully-signed-message">
              <CheckCircle size={24} />
              <p>This document has been fully signed by all parties.</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="signature-page-footer">
        <p>Powered by FieldSync</p>
      </footer>

      {/* Signature modal */}
      {showSignatureModal && activeSlot && (
        <EnhancedSignatureCapture
          slot={activeSlot}
          documentType={signatureRequest.document_type}
          documentTitle={summary.title}
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
