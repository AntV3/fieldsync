import { useState, useEffect, useMemo } from 'react'
import { X, Receipt, Plus, Trash2, FileText, Loader2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatCurrency, dollarsToCents } from '../../lib/corCalculations'

export default function InvoiceModal({
  project,
  company,
  user,
  selectedItems = { cors: [], tickets: [] },
  onClose,
  onSuccess
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [retentionPercent, setRetentionPercent] = useState(0)
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('Net 30')
  const [manualItems, setManualItems] = useState([])
  const [errors, setErrors] = useState({})

  // Initialize due date and invoice number
  useEffect(() => {
    const initData = async () => {
      try {
        // Set due date to 30 days from now
        const due = new Date()
        due.setDate(due.getDate() + 30)
        setDueDate(due.toISOString().split('T')[0])

        // Get next invoice number
        const nextNumber = await db.getNextInvoiceNumber(company.id)
        setInvoiceNumber(nextNumber)
      } catch (error) {
        console.error('Error initializing invoice:', error)
      } finally {
        setLoading(false)
      }
    }
    initData()
  }, [company.id])

  // Build line items from selected CORs and T&M tickets
  const lineItems = useMemo(() => {
    const items = []

    // Add CORs
    selectedItems.cors.forEach(cor => {
      items.push({
        id: cor.id,
        item_type: 'cor',
        reference_id: cor.id,
        reference_number: cor.cor_number,
        description: `COR ${cor.cor_number}: ${cor.title || 'Change Order'}`,
        amount: cor.cor_total || 0 // Already in cents
      })
    })

    // Add T&M tickets
    selectedItems.tickets.forEach(ticket => {
      items.push({
        id: ticket.id,
        item_type: 'tm_ticket',
        reference_id: ticket.id,
        reference_number: ticket.ce_pco_number || null,
        description: `T&M Ticket - ${new Date(ticket.work_date).toLocaleDateString()}`,
        amount: (parseFloat(ticket.change_order_value) || 0) * 100 // Convert to cents
      })
    })

    // Add manual items
    manualItems.forEach((item, index) => {
      items.push({
        id: `manual-${index}`,
        item_type: 'manual',
        reference_id: null,
        reference_number: null,
        description: item.description,
        amount: dollarsToCents(parseFloat(item.amount) || 0)
      })
    })

    return items
  }, [selectedItems, manualItems])

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0)
    const retentionAmount = Math.round(subtotal * retentionPercent / 100)
    const total = subtotal - retentionAmount

    return {
      subtotal,
      retentionAmount,
      total
    }
  }, [lineItems, retentionPercent])

  // Add manual line item
  const addManualItem = () => {
    setManualItems(prev => [...prev, { description: '', amount: '' }])
  }

  // Update manual line item
  const updateManualItem = (index, field, value) => {
    setManualItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  // Remove manual line item
  const removeManualItem = (index) => {
    setManualItems(prev => prev.filter((_, i) => i !== index))
  }

  // Validate form
  const validate = () => {
    const newErrors = {}

    if (!invoiceNumber.trim()) {
      newErrors.invoiceNumber = 'Invoice number is required'
    }

    if (!invoiceDate) {
      newErrors.invoiceDate = 'Invoice date is required'
    }

    if (lineItems.length === 0) {
      newErrors.items = 'At least one line item is required'
    }

    // Validate manual items
    manualItems.forEach((item, index) => {
      if (!item.description.trim()) {
        newErrors[`manual-${index}-desc`] = 'Description required'
      }
      if (!item.amount || parseFloat(item.amount) <= 0) {
        newErrors[`manual-${index}-amount`] = 'Valid amount required'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle save
  const handleSave = async () => {
    if (!validate()) return

    setSaving(true)
    try {
      // Prepare invoice data
      const invoiceData = {
        project_id: project.id,
        company_id: company.id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        status: 'draft',
        retention_percent: retentionPercent * 100, // Convert to basis points
        bill_to_name: project.general_contractor || '',
        bill_to_address: project.address || '',
        notes: notes || null,
        terms: terms || 'Net 30',
        created_by: user?.id
      }

      // Prepare items (filter out temp IDs)
      const itemsData = lineItems.map(item => ({
        item_type: item.item_type,
        reference_id: item.item_type !== 'manual' ? item.reference_id : null,
        reference_number: item.reference_number,
        description: item.description,
        amount: item.amount
      }))

      // Create invoice
      const invoice = await db.createInvoice(invoiceData, itemsData)

      // Mark CORs and T&M tickets as billed
      const corIds = selectedItems.cors.map(c => c.id)
      const tmIds = selectedItems.tickets.map(t => t.id)
      await db.markItemsBilled(corIds, tmIds)

      onSuccess?.(invoice)
    } catch (error) {
      console.error('Error creating invoice:', error)
      setErrors({ submit: 'Failed to create invoice. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content invoice-modal">
          <div className="invoice-loading">
            <Loader2 size={24} className="spinning" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content invoice-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Receipt size={20} />
            Create Invoice
          </h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Invoice Header Fields */}
          <div className="invoice-header-fields">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="invoice-number">Invoice Number *</label>
                <input
                  id="invoice-number"
                  type="text"
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  className={errors.invoiceNumber ? 'error' : ''}
                />
                {errors.invoiceNumber && (
                  <span className="form-error">{errors.invoiceNumber}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="invoice-date">Invoice Date *</label>
                <input
                  id="invoice-date"
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className={errors.invoiceDate ? 'error' : ''}
                />
              </div>

              <div className="form-group">
                <label htmlFor="due-date">Due Date</label>
                <input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="bill-to">Bill To</label>
                <input
                  id="bill-to"
                  type="text"
                  value={project.general_contractor || ''}
                  disabled
                  className="disabled"
                />
              </div>

              <div className="form-group retention-group">
                <label htmlFor="retention">Retention %</label>
                <div className="input-with-suffix">
                  <input
                    id="retention"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={retentionPercent}
                    onChange={e => setRetentionPercent(parseFloat(e.target.value) || 0)}
                  />
                  <span className="input-suffix">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="invoice-line-items">
            <div className="line-items-header">
              <h4>Line Items</h4>
              <button
                type="button"
                className="btn btn-text btn-sm"
                onClick={addManualItem}
              >
                <Plus size={14} />
                Add Item
              </button>
            </div>

            {errors.items && (
              <div className="form-error">{errors.items}</div>
            )}

            <div className="line-items-table">
              <div className="line-items-table-header">
                <span className="col-type">Type</span>
                <span className="col-desc">Description</span>
                <span className="col-amount">Amount</span>
                <span className="col-action"></span>
              </div>

              {lineItems.map((item, index) => (
                <div key={item.id} className="line-item-row">
                  <span className="col-type">
                    {item.item_type === 'cor' && <FileText size={14} />}
                    {item.item_type === 'tm_ticket' && <FileText size={14} />}
                    {item.item_type === 'manual' && <Plus size={14} />}
                    {item.item_type === 'cor' ? 'COR' : item.item_type === 'tm_ticket' ? 'T&M' : 'Manual'}
                  </span>

                  {item.item_type === 'manual' ? (
                    <>
                      <input
                        type="text"
                        className={`col-desc ${errors[`manual-${index - selectedItems.cors.length - selectedItems.tickets.length}-desc`] ? 'error' : ''}`}
                        value={manualItems[index - selectedItems.cors.length - selectedItems.tickets.length]?.description || ''}
                        onChange={e => updateManualItem(
                          index - selectedItems.cors.length - selectedItems.tickets.length,
                          'description',
                          e.target.value
                        )}
                        placeholder="Description"
                      />
                      <div className="col-amount">
                        <span className="currency-prefix">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={errors[`manual-${index - selectedItems.cors.length - selectedItems.tickets.length}-amount`] ? 'error' : ''}
                          value={manualItems[index - selectedItems.cors.length - selectedItems.tickets.length]?.amount || ''}
                          onChange={e => updateManualItem(
                            index - selectedItems.cors.length - selectedItems.tickets.length,
                            'amount',
                            e.target.value
                          )}
                          placeholder="0.00"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost col-action"
                        onClick={() => removeManualItem(index - selectedItems.cors.length - selectedItems.tickets.length)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="col-desc">{item.description}</span>
                      <span className="col-amount">{formatCurrency(item.amount)}</span>
                      <span className="col-action"></span>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="invoice-totals">
              <div className="total-row">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              {retentionPercent > 0 && (
                <div className="total-row retention">
                  <span>Retention ({retentionPercent}%)</span>
                  <span>-{formatCurrency(totals.retentionAmount)}</span>
                </div>
              )}
              <div className="total-row grand-total">
                <span>Total Due</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>

          {/* Notes and Terms */}
          <div className="form-row">
            <div className="form-group flex-2">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional notes for the client..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="terms">Payment Terms</label>
              <select
                id="terms"
                value={terms}
                onChange={e => setTerms(e.target.value)}
              >
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
          </div>

          {errors.submit && (
            <div className="form-error submit-error">{errors.submit}</div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || lineItems.length === 0}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spinning" />
                Creating...
              </>
            ) : (
              <>
                <Receipt size={16} />
                Create Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
