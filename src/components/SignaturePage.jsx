import { useState, useEffect, useMemo } from 'react'
import { FileText, CheckCircle, Clock, AlertCircle, Building2, Users, Package, Truck, Briefcase } from 'lucide-react'
import { db } from '../lib/supabase'
import { calculateCORTotals, formatCurrency, formatPercent, centsToDollars, formatDateRange } from '../lib/corCalculations'
import EnhancedSignatureCapture from './EnhancedSignatureCapture'

// Helper to format date
const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

// Status badge component
const StatusBadge = ({ status }) => {
  const statusMap = {
    draft: { label: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
    pending_approval: { label: 'Pending Approval', color: '#d97706', bg: '#fef3c7' },
    approved: { label: 'Approved', color: '#059669', bg: '#d1fae5' },
    rejected: { label: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
    billed: { label: 'Billed', color: '#2563eb', bg: '#dbeafe' },
    closed: { label: 'Closed', color: '#4b5563', bg: '#e5e7eb' }
  }
  const info = statusMap[status] || statusMap.draft
  return (
    <span
      className="cor-status-badge"
      style={{ color: info.color, backgroundColor: info.bg }}
    >
      {info.label}
    </span>
  )
}

export default function SignaturePage({ signatureToken }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [signatureRequest, setSignatureRequest] = useState(null)
  const [document, setDocument] = useState(null)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [activeSlot, setActiveSlot] = useState(null)
  const [submitting, setSubmitting] = useState(false)
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

  // Calculate COR totals
  const totals = useMemo(() => {
    if (!document || signatureRequest?.document_type !== 'cor') return null
    return calculateCORTotals(document)
  }, [document, signatureRequest])

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
            <span className="doc-type-label">T&M Ticket Signature</span>
          </div>
        </header>

        {successMessage && (
          <div className="signature-success-banner">
            <CheckCircle size={18} />
            {successMessage}
          </div>
        )}

        <main className="signature-page-content">
          <div className="signature-document-card">
            <div className="document-card-header">
              <FileText size={20} />
              <div className="document-card-title">
                <h2>T&M Ticket</h2>
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
          </div>

          {/* Signature section */}
          <div className="signature-status-section">
            <h3>Signatures Required</h3>
            {renderSignatureSlot(1, slot1, 'GC Authorization', openSignatureModal, submitting)}
            {renderSignatureSlot(2, slot2, 'Client Authorization', openSignatureModal, submitting)}
            {isFullySigned && (
              <div className="fully-signed-message">
                <CheckCircle size={24} />
                <p>This document has been fully signed by all parties.</p>
              </div>
            )}
          </div>
        </main>

        <footer className="signature-page-footer">
          <p>Powered by FieldSync</p>
        </footer>

        {showSignatureModal && activeSlot && (
          <EnhancedSignatureCapture
            slot={activeSlot}
            documentType="tm_ticket"
            documentTitle="T&M Ticket"
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

      {/* Success message */}
      {successMessage && (
        <div className="signature-success-banner">
          <CheckCircle size={18} />
          {successMessage}
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

        {/* Signature Section */}
        <div className="cor-signature-section">
          <h4>Authorization</h4>
          <p className="signature-instruction">
            By signing below, you authorize the above change order request and agree to the terms and costs outlined.
          </p>

          <div className="signature-slots-grid">
            {/* GC Signature */}
            <div className={`signature-slot-card ${slot1 ? 'signed' : 'unsigned'}`}>
              <div className="slot-header">
                {slot1 ? (
                  <CheckCircle size={20} className="status-icon signed" />
                ) : (
                  <Clock size={20} className="status-icon pending" />
                )}
                <span className="slot-label">Signature 1 — GC Authorization</span>
              </div>

              {slot1 ? (
                <div className="slot-signed-info">
                  {slot1.signature_data && (
                    <img src={slot1.signature_data} alt="Signature" className="signature-image" />
                  )}
                  <div className="signer-details">
                    <span className="signer-name">{slot1.signer_name}</span>
                    {(slot1.signer_title || slot1.signer_company) && (
                      <span className="signer-org">
                        {slot1.signer_title}{slot1.signer_title && slot1.signer_company && ' — '}{slot1.signer_company}
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

            {/* Client Signature */}
            <div className={`signature-slot-card ${slot2 ? 'signed' : 'unsigned'}`}>
              <div className="slot-header">
                {slot2 ? (
                  <CheckCircle size={20} className="status-icon signed" />
                ) : (
                  <Clock size={20} className="status-icon pending" />
                )}
                <span className="slot-label">Signature 2 — Client Authorization</span>
              </div>

              {slot2 ? (
                <div className="slot-signed-info">
                  {slot2.signature_data && (
                    <img src={slot2.signature_data} alt="Signature" className="signature-image" />
                  )}
                  <div className="signer-details">
                    <span className="signer-name">{slot2.signer_name}</span>
                    {(slot2.signer_title || slot2.signer_company) && (
                      <span className="signer-org">
                        {slot2.signer_title}{slot2.signer_title && slot2.signer_company && ' — '}{slot2.signer_company}
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
          </div>

          {/* Fully signed message */}
          {isFullySigned && (
            <div className="fully-signed-message">
              <CheckCircle size={24} />
              <p>This change order request has been fully signed by all parties.</p>
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
        <span className="slot-label">Signature {slot} — {label}</span>
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
          Sign as {slot === 1 ? 'GC' : 'Client'}
        </button>
      )}
    </div>
  )
}
