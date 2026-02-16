import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Receipt, Plus, FileText, ClipboardList, Send, DollarSign, Download, MoreVertical, CheckCircle, AlertCircle, Eye, X, Package, Users } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'
import { downloadInvoicePDF } from '../../lib/invoicePdfGenerator'
import InvoiceModal from './InvoiceModal'
import UnbilledWorkAlert from './UnbilledWorkAlert'
import PayrollExportModal from './PayrollExportModal'

// Status display configuration
const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: FileText, className: 'status-draft' },
  sent: { label: 'Sent', icon: Send, className: 'status-sent' },
  partial: { label: 'Partial', icon: AlertCircle, className: 'status-partial' },
  paid: { label: 'Paid', icon: CheckCircle, className: 'status-paid' },
  void: { label: 'Void', icon: AlertCircle, className: 'status-void' }
}

export default function BillingCenter({ project, company, user, onShowToast }) {
  const [billableItems, setBillableItems] = useState({ cors: [], tickets: [] })
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedItems, setSelectedItems] = useState({ cors: new Set(), tickets: new Set() })
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [activeDropdown, setActiveDropdown] = useState(null)
  const [viewingInvoice, setViewingInvoice] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showPayrollModal, setShowPayrollModal] = useState(false)
  const [generatingPackage, setGeneratingPackage] = useState(false)
  const dropdownRef = useRef(null)

  // Load billable items and invoices
  useEffect(() => {
    loadData()
  }, [project.id])

  const loadData = async () => {
    try {
      setLoading(true)
      const [billable, projectInvoices] = await Promise.all([
        db.getBillableItems(project.id),
        db.getProjectInvoices(project.id)
      ])
      setBillableItems(billable)
      setInvoices(projectInvoices)
    } catch (error) {
      console.error('Error loading billing data:', error)
      onShowToast?.('Error loading billing data', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveDropdown(null)
      }
    }

    if (activeDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [activeDropdown])

  // Toggle dropdown for an invoice
  const toggleDropdown = useCallback((invoiceId, e) => {
    e.stopPropagation()
    setActiveDropdown(prev => prev === invoiceId ? null : invoiceId)
  }, [])

  // View invoice details
  const handleViewInvoice = useCallback(async (invoice) => {
    setActiveDropdown(null)
    try {
      // Fetch full invoice with items
      const fullInvoice = await db.getInvoice(invoice.id)
      setViewingInvoice(fullInvoice)
    } catch (error) {
      console.error('Error fetching invoice:', error)
      onShowToast?.('Error loading invoice details', 'error')
    }
  }, []) // onShowToast is stable (memoized in App.jsx)

  // Download invoice PDF
  const handleDownloadPDF = useCallback(async (invoice) => {
    setActiveDropdown(null)
    setActionLoading(true)
    try {
      // Fetch full invoice with items if not already loaded
      const fullInvoice = await db.getInvoice(invoice.id)
      const fileName = await downloadInvoicePDF(fullInvoice, project, company)
      onShowToast?.(`Downloaded ${fileName}`, 'success')
    } catch (error) {
      console.error('Error generating PDF:', error)
      onShowToast?.('Error generating PDF', 'error')
    } finally {
      setActionLoading(false)
    }
  }, [project, company]) // onShowToast is stable

  // Mark invoice as sent
  const handleMarkSent = useCallback(async (invoice) => {
    setActiveDropdown(null)
    if (invoice.status !== 'draft') {
      onShowToast?.('Only draft invoices can be marked as sent', 'error')
      return
    }
    try {
      await db.markInvoiceSent(invoice.id)
      await loadData()
      onShowToast?.(`Invoice ${invoice.invoice_number} marked as sent`, 'success')
    } catch (error) {
      console.error('Error updating invoice:', error)
      onShowToast?.('Error updating invoice', 'error')
    }
  }, []) // onShowToast is stable

  // Mark invoice as paid
  const handleMarkPaid = useCallback(async (invoice) => {
    setActiveDropdown(null)
    if (invoice.status === 'paid') {
      onShowToast?.('Invoice is already marked as paid', 'error')
      return
    }
    try {
      await db.updateInvoice(invoice.id, {
        status: 'paid',
        paid_at: new Date().toISOString(),
        amount_paid: invoice.total
      })
      await loadData()
      onShowToast?.(`Invoice ${invoice.invoice_number} marked as paid`, 'success')
    } catch (error) {
      console.error('Error updating invoice:', error)
      onShowToast?.('Error updating invoice', 'error')
    }
  }, []) // onShowToast is stable

  // Generate certified billing package
  const handleGenerateBillingPackage = useCallback(async () => {
    setGeneratingPackage(true)
    try {
      const { generateBillingPackage } = await import('../../lib/billingPackageGenerator')

      // Fetch full COR data with line items
      const corIds = billableItems.cors.map(c => c.id)
      const fullCORs = []
      for (const corId of corIds) {
        const cor = await db.getChangeOrderDetail(corId)
        if (cor) fullCORs.push(cor)
      }

      // Fetch full T&M ticket data (with workers, items, photos)
      const ticketIds = new Set(billableItems.tickets.map(t => t.id))
      const allTickets = await db.getTMTickets(project.id)
      const fullTickets = (allTickets || []).filter(t => ticketIds.has(t.id))

      const result = await generateBillingPackage({
        cors: fullCORs,
        tickets: fullTickets.length > 0 ? fullTickets : billableItems.tickets,
        project,
        company,
        branding: company
      })

      if (result.success) {
        onShowToast?.(`Billing package generated: ${result.fileName}`, 'success')
      }
    } catch (error) {
      console.error('Error generating billing package:', error)
      onShowToast?.('Error generating billing package', 'error')
    } finally {
      setGeneratingPackage(false)
    }
  }, [billableItems, project, company])

  // Calculate totals
  const totals = useMemo(() => {
    const selectedCORsTotal = billableItems.cors
      .filter(cor => selectedItems.cors.has(cor.id))
      .reduce((sum, cor) => sum + (cor.cor_total || 0), 0)

    const selectedTicketsTotal = billableItems.tickets
      .filter(t => selectedItems.tickets.has(t.id))
      .reduce((sum, t) => sum + (parseFloat(t.change_order_value) || 0) * 100, 0) // Convert to cents

    const allCORsTotal = billableItems.cors.reduce((sum, cor) => sum + (cor.cor_total || 0), 0)
    const allTicketsTotal = billableItems.tickets.reduce((sum, t) => sum + (parseFloat(t.change_order_value) || 0) * 100, 0)

    return {
      selected: selectedCORsTotal + selectedTicketsTotal,
      total: allCORsTotal + allTicketsTotal,
      selectedCount: selectedItems.cors.size + selectedItems.tickets.size
    }
  }, [billableItems, selectedItems])

  // Toggle item selection
  const toggleCOR = (corId) => {
    setSelectedItems(prev => {
      const newCORs = new Set(prev.cors)
      if (newCORs.has(corId)) {
        newCORs.delete(corId)
      } else {
        newCORs.add(corId)
      }
      return { ...prev, cors: newCORs }
    })
  }

  const toggleTicket = (ticketId) => {
    setSelectedItems(prev => {
      const newTickets = new Set(prev.tickets)
      if (newTickets.has(ticketId)) {
        newTickets.delete(ticketId)
      } else {
        newTickets.add(ticketId)
      }
      return { ...prev, tickets: newTickets }
    })
  }

  // Select all billable items
  const selectAll = () => {
    setSelectedItems({
      cors: new Set(billableItems.cors.map(c => c.id)),
      tickets: new Set(billableItems.tickets.map(t => t.id))
    })
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedItems({ cors: new Set(), tickets: new Set() })
  }

  // Open invoice modal with selected items
  const handleCreateInvoice = () => {
    setEditingInvoice(null)
    setShowInvoiceModal(true)
  }

  // Handle invoice creation success
  const handleInvoiceCreated = async (invoice) => {
    setShowInvoiceModal(false)
    clearSelection()
    await loadData()
    onShowToast?.(`Invoice ${invoice.invoice_number} created`, 'success')
  }

  // Get selected items for invoice modal
  const getSelectedItemsForInvoice = () => {
    const cors = billableItems.cors.filter(c => selectedItems.cors.has(c.id))
    const tickets = billableItems.tickets.filter(t => selectedItems.tickets.has(t.id))
    return { cors, tickets }
  }

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit'
    })
  }

  const hasBillableItems = billableItems.cors.length > 0 || billableItems.tickets.length > 0
  const hasSelection = totals.selectedCount > 0

  if (loading) {
    return (
      <div className="billing-center loading">
        <div className="billing-loading">
          <div className="spinner" />
          <span>Loading billing data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="billing-center">
      {/* Unbilled Work Alert */}
      <UnbilledWorkAlert
        companyId={company?.id}
        projectId={project?.id}
        onDismiss={() => {}}
      />

      {/* Quick Actions Bar */}
      <div className="billing-quick-actions">
        <button
          className="btn btn-secondary"
          onClick={handleGenerateBillingPackage}
          disabled={generatingPackage || !hasBillableItems}
          title="Generate a complete billing package with COR details, T&M backup, and photos"
        >
          <Package size={16} />
          {generatingPackage ? 'Generating...' : 'Billing Package'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setShowPayrollModal(true)}
          title="Export crew hours for payroll"
        >
          <Users size={16} />
          Payroll Export
        </button>
      </div>

      {/* Ready to Bill Section */}
      <div className="billing-section">
        <div className="billing-section-header">
          <div className="billing-section-title">
            <Receipt size={20} />
            <h3>Ready to Bill</h3>
            {hasBillableItems && (
              <span className="billing-count">
                {billableItems.cors.length + billableItems.tickets.length} items
              </span>
            )}
          </div>
          {hasBillableItems && (
            <div className="billing-section-actions">
              <button
                className="btn btn-text btn-sm"
                onClick={hasSelection ? clearSelection : selectAll}
              >
                {hasSelection ? 'Clear Selection' : 'Select All'}
              </button>
            </div>
          )}
        </div>

        {!hasBillableItems ? (
          <div className="billing-empty-state">
            <CheckCircle size={32} className="text-success" />
            <p>No items ready to bill</p>
            <span>Approved CORs and signed T&M tickets will appear here</span>
          </div>
        ) : (
          <>
            {/* CORs Section */}
            {billableItems.cors.length > 0 && (
              <div className="billable-group">
                <div className="billable-group-header">
                  <FileText size={16} />
                  <span>Change Orders ({billableItems.cors.length})</span>
                </div>
                <div className="billable-items">
                  {billableItems.cors.map(cor => (
                    <label
                      key={cor.id}
                      className={`billable-item ${selectedItems.cors.has(cor.id) ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.cors.has(cor.id)}
                        onChange={() => toggleCOR(cor.id)}
                      />
                      <div className="billable-item-content">
                        <span className="billable-item-number">{cor.cor_number}</span>
                        <span className="billable-item-title">{cor.title || 'Untitled COR'}</span>
                      </div>
                      <span className="billable-item-amount">
                        {formatCurrency(cor.cor_total || 0)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* T&M Tickets Section */}
            {billableItems.tickets.length > 0 && (
              <div className="billable-group">
                <div className="billable-group-header">
                  <ClipboardList size={16} />
                  <span>T&M Tickets ({billableItems.tickets.length})</span>
                </div>
                <div className="billable-items">
                  {billableItems.tickets.map(ticket => (
                    <label
                      key={ticket.id}
                      className={`billable-item ${selectedItems.tickets.has(ticket.id) ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.tickets.has(ticket.id)}
                        onChange={() => toggleTicket(ticket.id)}
                      />
                      <div className="billable-item-content">
                        <span className="billable-item-number">
                          {ticket.ce_pco_number || formatDate(ticket.work_date)}
                        </span>
                        <span className="billable-item-title">
                          T&M Ticket - {formatDate(ticket.work_date)}
                        </span>
                      </div>
                      <span className="billable-item-amount">
                        {formatCurrency((parseFloat(ticket.change_order_value) || 0) * 100)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Selection Summary & Action */}
            <div className="billing-action-bar">
              <div className="billing-action-summary">
                <span className="selected-count">
                  {totals.selectedCount} of {billableItems.cors.length + billableItems.tickets.length} selected
                </span>
                <span className="selected-total">
                  {formatCurrency(totals.selected)}
                </span>
              </div>
              <button
                className="btn btn-primary"
                disabled={!hasSelection}
                onClick={handleCreateInvoice}
              >
                <Plus size={16} />
                Create Invoice
              </button>
            </div>
          </>
        )}
      </div>

      {/* Recent Invoices Section */}
      <div className="billing-section">
        <div className="billing-section-header">
          <div className="billing-section-title">
            <DollarSign size={20} />
            <h3>Invoices</h3>
            {invoices.length > 0 && (
              <span className="billing-count">{invoices.length}</span>
            )}
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="billing-empty-state">
            <Receipt size={32} />
            <p>No invoices yet</p>
            <span>Create an invoice from the items above</span>
          </div>
        ) : (
          <div className="invoice-list">
            {invoices.map(invoice => {
              const StatusIcon = STATUS_CONFIG[invoice.status]?.icon || FileText
              const isDropdownOpen = activeDropdown === invoice.id
              return (
                <div key={invoice.id} className="invoice-row">
                  <div className="invoice-info">
                    <span className="invoice-number">{invoice.invoice_number}</span>
                    <span className="invoice-date">{formatDate(invoice.invoice_date)}</span>
                  </div>
                  <span className="invoice-amount">
                    {formatCurrency(invoice.total || 0)}
                  </span>
                  <span className={`invoice-status ${STATUS_CONFIG[invoice.status]?.className || ''}`}>
                    <StatusIcon size={14} />
                    {STATUS_CONFIG[invoice.status]?.label || invoice.status}
                  </span>
                  <div className="invoice-actions">
                    <button
                      className="btn btn-sm btn-secondary"
                      title="View invoice details"
                      onClick={() => handleViewInvoice(invoice)}
                      disabled={actionLoading}
                    >
                      <Eye size={14} />
                      View
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      title="Download PDF"
                      onClick={() => handleDownloadPDF(invoice)}
                      disabled={actionLoading}
                    >
                      <Download size={14} />
                      PDF
                    </button>
                  </div>
                  <div className="invoice-actions-container" ref={isDropdownOpen ? dropdownRef : null}>
                    <button
                      className="btn btn-icon btn-ghost"
                      title="More options"
                      onClick={(e) => toggleDropdown(invoice.id, e)}
                      disabled={actionLoading}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {isDropdownOpen && (
                      <div className="invoice-dropdown">
                        <button
                          className="dropdown-item"
                          onClick={() => handleViewInvoice(invoice)}
                        >
                          <Eye size={14} />
                          View Details
                        </button>
                        <button
                          className="dropdown-item"
                          onClick={() => handleDownloadPDF(invoice)}
                        >
                          <Download size={14} />
                          Download PDF
                        </button>
                        {invoice.status === 'draft' && (
                          <button
                            className="dropdown-item"
                            onClick={() => handleMarkSent(invoice)}
                          >
                            <Send size={14} />
                            Mark as Sent
                          </button>
                        )}
                        {invoice.status !== 'paid' && invoice.status !== 'void' && (
                          <button
                            className="dropdown-item success"
                            onClick={() => handleMarkPaid(invoice)}
                          >
                            <CheckCircle size={14} />
                            Mark as Paid
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <InvoiceModal
          project={project}
          company={company}
          user={user}
          selectedItems={getSelectedItemsForInvoice()}
          onClose={() => setShowInvoiceModal(false)}
          onSuccess={handleInvoiceCreated}
        />
      )}

      {/* Payroll Export Modal */}
      {showPayrollModal && (
        <PayrollExportModal
          company={company}
          onClose={() => setShowPayrollModal(false)}
          onShowToast={onShowToast}
        />
      )}

      {/* Invoice Detail View Modal */}
      {viewingInvoice && (
        <div className="modal-overlay" onClick={() => setViewingInvoice(null)}>
          <div className="modal invoice-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Invoice {viewingInvoice.invoice_number}</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setViewingInvoice(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="invoice-detail-header">
                <div className="invoice-detail-info">
                  <div className="detail-row">
                    <span className="detail-label">Date:</span>
                    <span className="detail-value">{formatDate(viewingInvoice.invoice_date)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Due:</span>
                    <span className="detail-value">{viewingInvoice.due_date ? formatDate(viewingInvoice.due_date) : 'Upon Receipt'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status:</span>
                    <span className={`invoice-status ${STATUS_CONFIG[viewingInvoice.status]?.className || ''}`}>
                      {STATUS_CONFIG[viewingInvoice.status]?.label || viewingInvoice.status}
                    </span>
                  </div>
                </div>
                <div className="invoice-detail-billto">
                  <span className="detail-label">Bill To:</span>
                  <div className="billto-content">
                    {viewingInvoice.bill_to_name && <p>{viewingInvoice.bill_to_name}</p>}
                    {viewingInvoice.bill_to_address && <p>{viewingInvoice.bill_to_address}</p>}
                    {viewingInvoice.bill_to_contact && <p>{viewingInvoice.bill_to_contact}</p>}
                  </div>
                </div>
              </div>

              <div className="invoice-detail-items">
                <h3>Line Items</h3>
                <table className="invoice-items-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Description</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewingInvoice.invoice_items || []).map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td>{item.reference_number || '-'}</td>
                        <td>{item.description}</td>
                        <td className="text-right">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="invoice-detail-totals">
                <div className="total-row">
                  <span>Subtotal</span>
                  <span>{formatCurrency(viewingInvoice.subtotal)}</span>
                </div>
                {viewingInvoice.retention_percent > 0 && (
                  <div className="total-row retention">
                    <span>Retention ({viewingInvoice.retention_percent / 100}%)</span>
                    <span>-{formatCurrency(viewingInvoice.retention_amount)}</span>
                  </div>
                )}
                <div className="total-row grand-total">
                  <span>Total Due</span>
                  <span>{formatCurrency(viewingInvoice.total)}</span>
                </div>
                {viewingInvoice.amount_paid > 0 && (
                  <div className="total-row paid">
                    <span>Amount Paid</span>
                    <span>{formatCurrency(viewingInvoice.amount_paid)}</span>
                  </div>
                )}
              </div>

              {viewingInvoice.notes && (
                <div className="invoice-detail-notes">
                  <span className="detail-label">Notes:</span>
                  <p>{viewingInvoice.notes}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setViewingInvoice(null)}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  handleDownloadPDF(viewingInvoice)
                  setViewingInvoice(null)
                }}
              >
                <Download size={16} />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
