import { useState, useEffect, useMemo } from 'react'
import { Receipt, Plus, Check, FileText, ClipboardList, Send, DollarSign, Download, MoreVertical, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency } from '../../lib/corCalculations'
import InvoiceModal from './InvoiceModal'

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
                  <button
                    className="btn btn-icon btn-ghost"
                    title="Invoice options"
                  >
                    <MoreVertical size={16} />
                  </button>
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
    </div>
  )
}
