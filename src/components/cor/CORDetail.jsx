import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Edit3, Download, CheckCircle, XCircle, Clock, FileText, Users, Package, Truck, Briefcase, DollarSign, Percent, Shield, Building2, Stamp, PenTool, Link, Image, ChevronDown, ChevronRight, Calendar, Pencil, Check } from 'lucide-react'
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
import { executeExport } from '../../lib/corExportPipeline'
import { exportCORDetail } from '../../lib/financialExport'
import SignatureCanvas from '../ui/SignatureCanvas'
import SignatureLinkGenerator from '../SignatureLinkGenerator'

export default function CORDetail({ cor, project, company, areas, onClose, onEdit, onShowToast, onStatusChange }) {
  const [loading, setLoading] = useState(true)
  const [corData, setCORData] = useState(cor)
  const [showSignature, setShowSignature] = useState(false)
  const [showSignatureLink, setShowSignatureLink] = useState(false)
  const [expandedTickets, setExpandedTickets] = useState(new Set())
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [editingNumber, setEditingNumber] = useState(false)
  const [newCorNumber, setNewCorNumber] = useState('')

  // Fetch full COR data with line items
  const fetchFullCOR = useCallback(async () => {
    try {
      const fullCOR = await db.getCORById(cor.id)
      if (fullCOR) {
        // Resolve all ticket photos to signed URLs in one batch (bucket is private)
        if (fullCOR.tickets?.length) {
          const photoGroups = fullCOR.tickets.map(t => t.photos || [])
          const allPhotos = photoGroups.flat()
          if (allPhotos.length) {
            const signed = await db.resolvePhotoUrls(allPhotos)
            let offset = 0
            fullCOR.tickets = fullCOR.tickets.map((t, i) => {
              const len = photoGroups[i].length
              const resolved = signed.slice(offset, offset + len)
              offset += len
              return { ...t, photos: resolved }
            })
          }
        }
        setCORData(fullCOR)
      }
    } catch (error) {
      console.error('Error fetching COR details:', error)
      onShowToast?.('Error loading COR details', 'error')
    } finally {
      setLoading(false)
    }
  }, [cor.id]) // onShowToast is stable (memoized in App.jsx)

  // Fetch on mount
  useEffect(() => {
    fetchFullCOR()
  }, [fetchFullCOR])

  // Subscribe to T&M ticket associations for real-time updates
  // When tickets are added/removed from this COR, refresh the data
  useEffect(() => {
    const subscription = db.subscribeToCorTickets?.(cor.id, () => {
      // Refetch COR data when ticket associations change
      fetchFullCOR()
    })

    return () => {
      if (subscription) {
        db.unsubscribe?.(subscription)
      }
    }
  }, [cor.id, fetchFullCOR])

  // Calculate totals
  const totals = useMemo(() => calculateCORTotals(corData), [corData])

  const statusInfo = getStatusInfo(corData.status)
  const canApprove = corData.status === 'pending_approval'
  // Allow editing before billed (draft, pending_approval, approved)
  const canEdit = ['draft', 'pending_approval', 'approved'].includes(corData.status)

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

  const handleUpdateCorNumber = async () => {
    if (!newCorNumber.trim()) {
      setEditingNumber(false)
      return
    }
    setLoading(true)
    try {
      await db.updateCOR(corData.id, { cor_number: newCorNumber.trim() })
      setCORData({ ...corData, cor_number: newCorNumber.trim() })
      setEditingNumber(false)
      onShowToast?.('COR number updated', 'success')
    } catch (error) {
      console.error('Error updating COR number:', error)
      onShowToast?.('Error updating COR number', 'error')
    } finally {
      setLoading(false)
    }
  }

  const startEditingNumber = () => {
    setNewCorNumber(corData.cor_number || '')
    setEditingNumber(true)
  }

  // Toggle ticket expansion in backup section
  const toggleTicketExpanded = (ticketId) => {
    setExpandedTickets(prev => {
      const next = new Set(prev)
      if (next.has(ticketId)) {
        next.delete(ticketId)
      } else {
        next.add(ticketId)
      }
      return next
    })
  }

  // Get associated tickets from the COR data
  const associatedTickets = useMemo(() => {
    return corData.change_order_ticket_associations?.map(assoc => assoc.t_and_m_tickets).filter(Boolean) || []
  }, [corData.change_order_ticket_associations])

  // Calculate total hours for a ticket
  const getTicketHours = (ticket) => {
    const workers = ticket.t_and_m_workers || []
    const regular = workers.reduce((sum, w) => sum + (parseFloat(w.hours) || 0), 0)
    const overtime = workers.reduce((sum, w) => sum + (parseFloat(w.overtime_hours) || 0), 0)
    return { regular, overtime, total: regular + overtime }
  }

  const handleExportPDF = async () => {
    try {
      onShowToast?.('Generating PDF with backup...', 'info')

      // Use new snapshot-based export pipeline (idempotent, reliable)
      const result = await executeExport(corData.id, {
        cor: corData,
        tickets: associatedTickets,
        project,
        company,
        branding: {
          logoUrl: company?.logo_url,
          primaryColor: company?.branding_color
        },
        options: {
          includeBackup: true
        }
      })

      if (result.cached) {
        onShowToast?.('PDF downloaded (cached)', 'success')
      } else {
        onShowToast?.('PDF downloaded', 'success')
      }
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
              <div className="cor-detail-number">
                {editingNumber ? (
                  <div className="cor-number-edit">
                    <input
                      type="text"
                      value={newCorNumber}
                      onChange={(e) => setNewCorNumber(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateCorNumber()
                        if (e.key === 'Escape') setEditingNumber(false)
                      }}
                      autoFocus
                      className="cor-number-input"
                    />
                    <button className="btn-icon-sm" onClick={handleUpdateCorNumber} title="Save">
                      <Check size={14} />
                    </button>
                    <button className="btn-icon-sm" onClick={() => setEditingNumber(false)} title="Cancel">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="cor-number-display">
                    <span>{corData.cor_number}</span>
                    {canEdit && (
                      <button className="btn-icon-sm" onClick={startEditingNumber} title="Edit COR number">
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
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
            {corData.group_name && (
              <span className="cor-detail-group">{corData.group_name}</span>
            )}
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

          {/* Backup Documentation Section */}
          {associatedTickets.length > 0 && (
            <div className="cor-detail-section backup-section">
              <h3><FileText size={18} /> Backup Documentation</h3>
              <p className="backup-summary">
                {associatedTickets.length} T&M ticket{associatedTickets.length !== 1 ? 's' : ''} associated with this COR
              </p>

              <div className="backup-tickets-list">
                {associatedTickets.map(ticket => {
                  const isExpanded = expandedTickets.has(ticket.id)
                  const hours = getTicketHours(ticket)
                  const workerCount = ticket.t_and_m_workers?.length || 0
                  const itemCount = ticket.t_and_m_items?.length || 0
                  const photoCount = ticket.photos?.length || 0

                  return (
                    <div key={ticket.id} className="backup-ticket-card">
                      <div
                        className="backup-ticket-header"
                        onClick={() => toggleTicketExpanded(ticket.id)}
                      >
                        <div className="backup-ticket-toggle">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </div>
                        <div className="backup-ticket-info">
                          <div className="backup-ticket-date">
                            <Calendar size={14} />
                            <span>{formatDate(ticket.work_date)}</span>
                          </div>
                          {ticket.ce_pco_number && (
                            <span className="backup-ticket-pco">CE/PCO: {ticket.ce_pco_number}</span>
                          )}
                        </div>
                        <div className="backup-ticket-stats">
                          <span className="backup-stat">
                            <Users size={14} /> {workerCount}
                          </span>
                          <span className="backup-stat">
                            {hours.total.toFixed(1)} hrs
                          </span>
                          {photoCount > 0 && (
                            <span className="backup-stat">
                              <Image size={14} /> {photoCount}
                            </span>
                          )}
                          {ticket.client_signature_data && (
                            <span className="backup-stat verified" title={`Verified by ${ticket.client_signature_name}`}>
                              <PenTool size={14} /> Verified
                            </span>
                          )}
                        </div>
                        <span className={`backup-ticket-status status-${ticket.status}`}>
                          {ticket.status}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="backup-ticket-details">
                          {/* Notes */}
                          {ticket.notes && (
                            <div className="backup-ticket-notes">
                              <strong>Notes:</strong> {ticket.notes}
                            </div>
                          )}

                          {/* Workers Table */}
                          {ticket.t_and_m_workers?.length > 0 && (
                            <div className="backup-workers">
                              <h4>Labor ({workerCount} workers)</h4>
                              <table className="backup-table">
                                <thead>
                                  <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Time</th>
                                    <th>Reg Hrs</th>
                                    <th>OT Hrs</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ticket.t_and_m_workers.map((worker, idx) => (
                                    <tr key={idx}>
                                      <td>{worker.name}</td>
                                      <td>{worker.role || '-'}</td>
                                      <td className="backup-time-range">
                                        {worker.time_started && worker.time_ended
                                          ? `${worker.time_started} - ${worker.time_ended}`
                                          : '-'}
                                      </td>
                                      <td>{worker.hours || 0}</td>
                                      <td>{worker.overtime_hours || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Materials/Equipment Table */}
                          {ticket.t_and_m_items?.length > 0 && (
                            <div className="backup-items">
                              <h4>Materials & Equipment ({itemCount} items)</h4>
                              <table className="backup-table">
                                <thead>
                                  <tr>
                                    <th>Item</th>
                                    <th>Category</th>
                                    <th>Qty</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ticket.t_and_m_items.map((item, idx) => (
                                    <tr key={idx}>
                                      <td>{item.custom_name || item.materials_equipment?.name || 'Unnamed Item'}</td>
                                      <td>{item.custom_category || item.materials_equipment?.category || '-'}</td>
                                      <td>{item.quantity}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Photos Gallery */}
                          {ticket.photos?.length > 0 && (
                            <div className="backup-photos">
                              <h4>Photos ({photoCount})</h4>
                              <div className="backup-photos-grid">
                                {ticket.photos.map((photoUrl, idx) => (
                                  <div
                                    key={idx}
                                    className="backup-photo-thumb"
                                    onClick={() => setSelectedPhoto(photoUrl)}
                                  >
                                    <img src={photoUrl} alt={`Photo ${idx + 1}`} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Client Verification Signature */}
                          {ticket.client_signature_data && (
                            <div className="backup-verification">
                              <h4><PenTool size={14} /> Client Verification</h4>
                              <div className="backup-signature-display">
                                <img
                                  src={ticket.client_signature_data}
                                  alt="Client Signature"
                                  className="backup-signature-image"
                                />
                                <div className="backup-signature-info">
                                  <span className="backup-signer-name">{ticket.client_signature_name}</span>
                                  {ticket.client_signature_title && (
                                    <span className="backup-signer-title">{ticket.client_signature_title}</span>
                                  )}
                                  {ticket.client_signature_company && (
                                    <span className="backup-signer-company">{ticket.client_signature_company}</span>
                                  )}
                                  <span className="backup-signed-date">
                                    Verified: {formatDate(ticket.client_signature_date)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Signature Section */}
          {(corData.gc_signature_data || corData.gc_signature || corData.client_signature_data) && (
            <div className="cor-detail-section signature-section">
              <h3><Stamp size={18} /> Signatures</h3>
              <div className="dual-signatures">
                {/* GC Signature */}
                {(corData.gc_signature_data || corData.gc_signature) && (
                  <div className="signature-block">
                    <span className="signature-label">GC Authorization</span>
                    <div className="signature-display">
                      <img
                        src={corData.gc_signature_data || corData.gc_signature}
                        alt="GC Signature"
                        className="signature-image"
                      />
                      <div className="signature-info">
                        <span className="signer-name">{corData.gc_signature_name || corData.gc_signer_name}</span>
                        {(corData.gc_signature_title || corData.gc_signature_company) && (
                          <span className="signer-org">
                            {corData.gc_signature_title}
                            {corData.gc_signature_title && corData.gc_signature_company && ' - '}
                            {corData.gc_signature_company}
                          </span>
                        )}
                        <span className="signed-date">
                          Signed: {formatDate(corData.gc_signature_date || corData.signed_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Client Signature */}
                {corData.client_signature_data && (
                  <div className="signature-block">
                    <span className="signature-label">Client Authorization</span>
                    <div className="signature-display">
                      <img
                        src={corData.client_signature_data}
                        alt="Client Signature"
                        className="signature-image"
                      />
                      <div className="signature-info">
                        <span className="signer-name">{corData.client_signature_name}</span>
                        {(corData.client_signature_title || corData.client_signature_company) && (
                          <span className="signer-org">
                            {corData.client_signature_title}
                            {corData.client_signature_title && corData.client_signature_company && ' - '}
                            {corData.client_signature_company}
                          </span>
                        )}
                        <span className="signed-date">
                          Signed: {formatDate(corData.client_signature_date)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
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

            {/* Show signature link button for approved/pending CORs */}
            {(corData.status === 'approved' || corData.status === 'pending_approval') && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowSignatureLink(true)}
                disabled={loading}
                aria-label="Get shareable signature link"
              >
                <Link size={16} aria-hidden="true" /> Get Signature Link
              </button>
            )}

            {corData.status === 'approved' && (
              <button className="btn btn-primary" onClick={handleMarkBilled} disabled={loading} aria-label="Mark this COR as billed">
                <DollarSign size={16} aria-hidden="true" /> Mark Billed
              </button>
            )}

            <button className="btn btn-ghost btn-small" onClick={() => exportCORDetail(corData, project)} aria-label="Export COR to CSV">
              <Download size={16} aria-hidden="true" /> Export CSV
            </button>
            <button className="btn btn-secondary" onClick={handleExportPDF} aria-label="Export COR to PDF">
              <Download size={16} aria-hidden="true" /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Signature Capture Modal */}
      {showSignature && (
        <SignatureCanvas
          onSave={handleSaveSignature}
          onClose={() => setShowSignature(false)}
          signerName=""
        />
      )}

      {/* Signature Link Generator Modal */}
      {showSignatureLink && (
        <SignatureLinkGenerator
          documentType="cor"
          documentId={corData.id}
          companyId={company?.id}
          projectId={project?.id}
          project={project}
          documentTitle={`COR ${corData.cor_number}: ${corData.title || 'Untitled'}`}
          onClose={() => setShowSignatureLink(false)}
          onShowToast={onShowToast}
        />
      )}

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div className="photo-lightbox" onClick={() => setSelectedPhoto(null)}>
          <button className="lightbox-close" onClick={() => setSelectedPhoto(null)}>
            <X size={24} />
          </button>
          <img src={selectedPhoto} alt="Full size photo" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
