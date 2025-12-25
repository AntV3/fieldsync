import { useState, useEffect, useMemo } from 'react'
import { X, Edit3, Download, CheckCircle, XCircle, Send, Clock, FileText, Users, Package, Truck, Briefcase, DollarSign, Percent, Shield, Building2, Stamp, PenTool } from 'lucide-react'
import { db } from '../../lib/supabase'
import {
  formatCurrency,
  formatPercent,
  centsToDollars,
  calculateCORTotals,
  getStatusInfo,
  formatDate,
  formatDateRange
} from '../../lib/corCalculations'
import { exportCORToPDF } from '../../lib/corPdfExport'
import SignatureCapture from './SignatureCapture'

export default function CORDetail({ cor, project, company, areas, onClose, onEdit, onShowToast, onStatusChange }) {
  const [loading, setLoading] = useState(true)
  const [corData, setCORData] = useState(cor)
  const [showSignature, setShowSignature] = useState(false)

  // Fetch full COR data with line items on mount
  useEffect(() => {
    const fetchFullCOR = async () => {
      try {
        const fullCOR = await db.getCORById(cor.id)
        if (fullCOR) {
          setCORData(fullCOR)
        }
      } catch (error) {
        console.error('Error fetching COR details:', error)
        onShowToast?.('Error loading COR details', 'error')
      } finally {
        setLoading(false)
      }
    }
    fetchFullCOR()
  }, [cor.id])

  // Calculate totals
  const totals = useMemo(() => calculateCORTotals(corData), [corData])

  const statusInfo = getStatusInfo(corData.status)
  const canApprove = corData.status === 'pending_approval'
  const canEdit = corData.status === 'draft'

  const getAreaName = (areaId) => {
    const area = areas?.find(a => a.id === areaId)
    return area?.name || null
  }

  const handleApprove = async () => {
    if (!confirm('Approve this change order request?')) return
    setLoading(true)
    try {
      await db.approveCOR(corData.id)
      setCORData({ ...corData, status: 'approved', approved_at: new Date().toISOString() })
      onShowToast?.('COR approved', 'success')
      onStatusChange?.()
    } catch (error) {
      console.error('Error approving COR:', error)
      onShowToast?.('Error approving COR', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    const reason = prompt('Enter rejection reason (optional):')
    if (reason === null) return // User cancelled

    setLoading(true)
    try {
      await db.rejectCOR(corData.id, reason)
      setCORData({ ...corData, status: 'rejected', rejection_reason: reason })
      onShowToast?.('COR rejected', 'success')
      onStatusChange?.()
    } catch (error) {
      console.error('Error rejecting COR:', error)
      onShowToast?.('Error rejecting COR', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkBilled = async () => {
    if (!confirm('Mark this COR as billed?')) return
    setLoading(true)
    try {
      await db.markCORAsBilled(corData.id)
      setCORData({ ...corData, status: 'billed' })
      onShowToast?.('COR marked as billed', 'success')
      onStatusChange?.()
    } catch (error) {
      console.error('Error marking COR as billed:', error)
      onShowToast?.('Error updating status', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSignature = async (signatureData) => {
    setLoading(true)
    try {
      await db.saveCORSignature?.(corData.id, {
        gc_signature: signatureData.signature,
        gc_signer_name: signatureData.signerName,
        signed_at: signatureData.signedAt
      })
      setCORData({
        ...corData,
        gc_signature: signatureData.signature,
        gc_signer_name: signatureData.signerName,
        signed_at: signatureData.signedAt
      })
      setShowSignature(false)
      onShowToast?.('Signature saved', 'success')
      onStatusChange?.()
    } catch (error) {
      console.error('Error saving signature:', error)
      onShowToast?.('Error saving signature', 'error')
    } finally {
      setLoading(false)
    }
  }

  const canSign = corData.status === 'approved' && !corData.gc_signature

  const handleExportPDF = async () => {
    try {
      onShowToast?.('Generating PDF...', 'info')
      await exportCORToPDF(corData, project, company)
      onShowToast?.('PDF downloaded', 'success')
    } catch (error) {
      console.error('Error exporting PDF:', error)
      onShowToast?.('Error generating PDF', 'error')
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content cor-detail-modal" onClick={e => e.stopPropagation()}>
          <div className="cor-detail-loading">Loading COR details...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="cor-detail-title">
      <div className="modal-content cor-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header cor-detail-header">
          <div className="cor-detail-title-row">
            <div>
              <div className="cor-detail-number">{corData.cor_number}</div>
              <h2 id="cor-detail-title">{corData.title || 'Untitled COR'}</h2>
            </div>
            <button className="close-btn" onClick={onClose} aria-label="Close COR details"><X size={20} aria-hidden="true" /></button>
          </div>

          <div className="cor-detail-meta">
            <span
              className="cor-detail-status"
              style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
            >
              {statusInfo.label}
            </span>
            {getAreaName(corData.area_id) && (
              <span className="cor-detail-area">{getAreaName(corData.area_id)}</span>
            )}
            <span className="cor-detail-period">
              <Clock size={14} /> {formatDateRange(corData.period_start, corData.period_end)}
            </span>
          </div>
        </div>

        <div className="modal-body cor-detail-body">
          {/* Scope of Work */}
          <div className="cor-detail-section">
            <h3><FileText size={18} /> Scope of Work</h3>
            <p className="cor-scope-text">{corData.scope_of_work || 'No scope of work provided.'}</p>
          </div>

          {/* Pricing Breakdown */}
          <div className="cor-detail-section pricing-breakdown">
            <h3><DollarSign size={18} /> Pricing Breakdown</h3>

            {/* Labor Section */}
            <div className="pricing-category">
              <div className="category-header">
                <div className="category-title">
                  <Users size={16} />
                  <span>Labor</span>
                </div>
                <span className="category-subtotal">{formatCurrency(totals.labor_subtotal)}</span>
              </div>

              {corData.change_order_labor?.length > 0 ? (
                <div className="category-items">
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Type</th>
                        <th>Reg Hrs</th>
                        <th>Reg Rate</th>
                        <th>OT Hrs</th>
                        <th>OT Rate</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corData.change_order_labor.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.labor_class}</td>
                          <td>{item.wage_type}</td>
                          <td>{item.regular_hours}</td>
                          <td>${centsToDollars(item.regular_rate)}/hr</td>
                          <td>{item.overtime_hours || '-'}</td>
                          <td>{item.overtime_hours ? `$${centsToDollars(item.overtime_rate)}/hr` : '-'}</td>
                          <td className="text-right">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="category-empty">No labor items</div>
              )}

              <div className="category-markup">
                <span>Markup ({formatPercent(corData.labor_markup_percent || 1500)})</span>
                <span>+{formatCurrency(totals.labor_markup_amount)}</span>
              </div>
            </div>

            {/* Materials Section */}
            <div className="pricing-category">
              <div className="category-header">
                <div className="category-title">
                  <Package size={16} />
                  <span>Materials</span>
                </div>
                <span className="category-subtotal">{formatCurrency(totals.materials_subtotal)}</span>
              </div>

              {corData.change_order_materials?.length > 0 ? (
                <div className="category-items">
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Source</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Unit Cost</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corData.change_order_materials.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.description}</td>
                          <td>{item.source_reference || item.source_type}</td>
                          <td>{item.quantity}</td>
                          <td>{item.unit}</td>
                          <td>${centsToDollars(item.unit_cost)}</td>
                          <td className="text-right">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="category-empty">No material items</div>
              )}

              <div className="category-markup">
                <span>Markup ({formatPercent(corData.materials_markup_percent || 1500)})</span>
                <span>+{formatCurrency(totals.materials_markup_amount)}</span>
              </div>
            </div>

            {/* Equipment Section */}
            <div className="pricing-category">
              <div className="category-header">
                <div className="category-title">
                  <Truck size={16} />
                  <span>Equipment</span>
                </div>
                <span className="category-subtotal">{formatCurrency(totals.equipment_subtotal)}</span>
              </div>

              {corData.change_order_equipment?.length > 0 ? (
                <div className="category-items">
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Source</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Unit Cost</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corData.change_order_equipment.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.description}</td>
                          <td>{item.source_reference || item.source_type}</td>
                          <td>{item.quantity}</td>
                          <td>{item.unit}</td>
                          <td>${centsToDollars(item.unit_cost)}</td>
                          <td className="text-right">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="category-empty">No equipment items</div>
              )}

              <div className="category-markup">
                <span>Markup ({formatPercent(corData.equipment_markup_percent || 1500)})</span>
                <span>+{formatCurrency(totals.equipment_markup_amount)}</span>
              </div>
            </div>

            {/* Subcontractors Section */}
            <div className="pricing-category">
              <div className="category-header">
                <div className="category-title">
                  <Briefcase size={16} />
                  <span>Subcontractors</span>
                </div>
                <span className="category-subtotal">{formatCurrency(totals.subcontractors_subtotal)}</span>
              </div>

              {corData.change_order_subcontractors?.length > 0 ? (
                <div className="category-items">
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Description</th>
                        <th>Source</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {corData.change_order_subcontractors.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.company_name}</td>
                          <td>{item.description}</td>
                          <td>{item.source_reference || item.source_type}</td>
                          <td className="text-right">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="category-empty">No subcontractor items</div>
              )}

              <div className="category-markup">
                <span>Markup ({formatPercent(corData.subcontractors_markup_percent || 500)})</span>
                <span>+{formatCurrency(totals.subcontractors_markup_amount)}</span>
              </div>
            </div>

            {/* COR Subtotal */}
            <div className="cor-subtotal-row">
              <span>COR Subtotal</span>
              <span>{formatCurrency(totals.cor_subtotal)}</span>
            </div>

            {/* Additional Fees */}
            <div className="pricing-category fees-category">
              <div className="category-header">
                <div className="category-title">
                  <Percent size={16} />
                  <span>Additional Fees</span>
                </div>
                <span className="category-subtotal">{formatCurrency(totals.additional_fees_total)}</span>
              </div>

              <div className="fees-list">
                <div className="fee-row">
                  <div className="fee-label">
                    <Shield size={14} />
                    <span>Liability Insurance ({formatPercent(corData.liability_insurance_percent || 144)})</span>
                  </div>
                  <span className="fee-amount">{formatCurrency(totals.liability_insurance_amount)}</span>
                </div>

                <div className="fee-row">
                  <div className="fee-label">
                    <FileText size={14} />
                    <span>Bond ({formatPercent(corData.bond_percent || 100)})</span>
                  </div>
                  <span className="fee-amount">{formatCurrency(totals.bond_amount)}</span>
                </div>

                <div className="fee-row">
                  <div className="fee-label">
                    <Building2 size={14} />
                    <span>City License Fee ({formatPercent(corData.license_fee_percent || 10)})</span>
                  </div>
                  <span className="fee-amount">{formatCurrency(totals.license_fee_amount)}</span>
                </div>
              </div>
            </div>

            {/* COR Total */}
            <div className="cor-total-row">
              <span>COR TOTAL</span>
              <span>{formatCurrency(totals.cor_total)}</span>
            </div>
          </div>

          {/* Signature Section (if signed) */}
          {corData.gc_signature && (
            <div className="cor-detail-section signature-section">
              <h3><Stamp size={18} /> GC Signature</h3>
              <div className="signature-display">
                <img src={corData.gc_signature} alt="GC Signature" className="signature-image" />
                <div className="signature-info">
                  <span className="signer-name">{corData.gc_signer_name}</span>
                  <span className="signed-date">Signed: {formatDate(corData.signed_at)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Rejection Reason (if rejected) */}
          {corData.status === 'rejected' && corData.rejection_reason && (
            <div className="cor-detail-section rejection-section">
              <h3><XCircle size={18} /> Rejection Reason</h3>
              <p className="rejection-text">{corData.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer cor-detail-footer">
          <div className="footer-info">
            <span>Created: {formatDate(corData.created_at)}</span>
            {corData.approved_at && <span>Approved: {formatDate(corData.approved_at)}</span>}
          </div>

          <div className="footer-actions" role="group" aria-label="COR actions">
            {canEdit && (
              <button className="btn btn-secondary" onClick={() => onEdit?.(corData)} disabled={loading} aria-label="Edit this COR">
                <Edit3 size={16} aria-hidden="true" /> Edit
              </button>
            )}

            {canApprove && (
              <>
                <button className="btn btn-danger" onClick={handleReject} disabled={loading} aria-label="Reject this COR">
                  <XCircle size={16} aria-hidden="true" /> Reject
                </button>
                <button className="btn btn-success" onClick={handleApprove} disabled={loading} aria-label="Approve this COR">
                  <CheckCircle size={16} aria-hidden="true" /> Approve
                </button>
              </>
            )}

            {canSign && (
              <button className="btn btn-success" onClick={() => setShowSignature(true)} disabled={loading} aria-label="Get GC signature for this COR">
                <PenTool size={16} aria-hidden="true" /> Get GC Signature
              </button>
            )}

            {corData.status === 'approved' && (
              <button className="btn btn-primary" onClick={handleMarkBilled} disabled={loading} aria-label="Mark this COR as billed">
                <DollarSign size={16} aria-hidden="true" /> Mark Billed
              </button>
            )}

            <button className="btn btn-secondary" onClick={handleExportPDF} aria-label="Export COR to PDF">
              <Download size={16} aria-hidden="true" /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Signature Capture Modal */}
      {showSignature && (
        <SignatureCapture
          onSave={handleSaveSignature}
          onClose={() => setShowSignature(false)}
          signerName=""
        />
      )}
    </div>
  )
}
