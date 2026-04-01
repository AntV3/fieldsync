/**
 * SageExport — Sage 300 CRE export modal for the Financials tab.
 * Provides export type selection, date range filtering, preview, and CSV download.
 */
import { useState, useCallback } from 'react'
import { Building2, Download, FileSpreadsheet, Receipt, Hash, Calendar, Info } from 'lucide-react'
import Modal from '../ui/Modal'
import {
  exportJobCostTransactions,
  exportChangeOrderSummary,
  exportCostCodeStructure,
  toSageCSV,
  downloadSageCSV
} from '../../lib/services/sageExportService'

const EXPORT_TYPES = [
  {
    id: 'jobcost',
    label: 'Job Cost Transactions',
    description: 'T&M ticket costs grouped by cost code',
    icon: FileSpreadsheet
  },
  {
    id: 'changeorders',
    label: 'Change Orders',
    description: 'Approved CORs for Sage budget revision',
    icon: Receipt
  },
  {
    id: 'costcodes',
    label: 'Cost Code Structure',
    description: 'Company cost codes for Sage Job Cost setup',
    icon: Hash
  }
]

export default function SageExport({ project, company, onShowToast }) {
  const [showModal, setShowModal] = useState(false)
  const [exportType, setExportType] = useState('jobcost')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleOpen = useCallback(() => {
    setPreview(null)
    setShowModal(true)
  }, [])

  const handlePreview = useCallback(async () => {
    setLoading(true)
    setPreview(null)
    try {
      let result
      if (exportType === 'jobcost') {
        result = await exportJobCostTransactions(project.id, { startDate, endDate })
      } else if (exportType === 'changeorders') {
        result = await exportChangeOrderSummary(project.id)
      } else if (exportType === 'costcodes') {
        result = await exportCostCodeStructure(company?.id)
      }
      setPreview(result)
    } catch (err) {
      onShowToast?.(`Preview failed: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [exportType, project?.id, company?.id, startDate, endDate, onShowToast])

  const handleDownload = useCallback(() => {
    if (!preview?.rows?.length) return
    setExporting(true)
    try {
      const csv = toSageCSV(preview.rows)
      const today = new Date().toISOString().split('T')[0]
      const jobNum = preview.summary?.jobNumber || 'export'
      const typeLabel = {
        jobcost: 'JobCost',
        changeorders: 'ChangeOrders',
        costcodes: 'CostCodes'
      }[exportType]
      const filename = `Sage300_${typeLabel}_${jobNum}_${today}.csv`
      downloadSageCSV(csv, filename)
      onShowToast?.(`${typeLabel} export downloaded`, 'success')
    } catch (err) {
      onShowToast?.(`Export failed: ${err.message}`, 'error')
    } finally {
      setExporting(false)
    }
  }, [preview, exportType, onShowToast])

  const selectedType = EXPORT_TYPES.find(t => t.id === exportType)

  return (
    <>
      <button
        className="btn btn-ghost btn-small"
        onClick={handleOpen}
        title="Export to Sage 300 CRE"
      >
        <Building2 size={14} /> Sage 300
      </button>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Sage 300 CRE Export"
        size="large"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Export Type Selection */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
              Export Type
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {EXPORT_TYPES.map(type => {
                const Icon = type.icon
                const isSelected = exportType === type.id
                return (
                  <button
                    key={type.id}
                    onClick={() => { setExportType(type.id); setPreview(null) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      background: isSelected ? 'var(--bg-secondary, #f0f4ff)' : 'var(--bg-primary, white)',
                      border: isSelected ? '2px solid var(--color-primary, #3b82f6)' : '1px solid var(--border-color, #e5e7eb)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <Icon size={20} style={{ opacity: 0.7 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{type.label}</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>{type.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date Range Filter (only for Job Cost Transactions) */}
          {exportType === 'jobcost' && (
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Calendar size={14} /> Date Range (optional)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>Start Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={e => { setStartDate(e.target.value); setPreview(null) }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', opacity: 0.7 }}>End Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={e => { setEndDate(e.target.value); setPreview(null) }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Format Info */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.75rem', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: '0.5rem', fontSize: '0.8rem' }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: '0.1rem', opacity: 0.6 }} />
            <div>
              <strong>Format:</strong> CSV (comma-delimited with double-quote text qualifiers).
              Dates use MM/DD/YYYY. Import via Sage 300 CRE &rarr; Job Cost &rarr; Utilities &rarr; Import Transactions.
            </div>
          </div>

          {/* Preview / Generate Button */}
          <button
            className="btn btn-primary"
            onClick={handlePreview}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Loading...' : 'Preview Export'}
          </button>

          {/* Preview Results */}
          {preview && (
            <div style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.5rem', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Export Preview</h4>
                <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  {preview.summary?.rowCount || 0} rows
                </span>
              </div>

              {/* Summary stats */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {preview.summary?.totalAmount != null && (
                  <div style={{ fontSize: '0.85rem' }}>
                    <span style={{ opacity: 0.6 }}>Total Amount: </span>
                    <strong>${preview.summary.totalAmount.toFixed(2)}</strong>
                  </div>
                )}
                {preview.summary?.ticketCount != null && (
                  <div style={{ fontSize: '0.85rem' }}>
                    <span style={{ opacity: 0.6 }}>Tickets: </span>
                    <strong>{preview.summary.ticketCount}</strong>
                  </div>
                )}
                {preview.summary?.totalRevised != null && (
                  <div style={{ fontSize: '0.85rem' }}>
                    <span style={{ opacity: 0.6 }}>Total Revised: </span>
                    <strong>${preview.summary.totalRevised.toFixed(2)}</strong>
                  </div>
                )}
              </div>

              {/* Sample rows table */}
              {preview.rows.length > 0 && (
                <div style={{ overflowX: 'auto', maxHeight: '200px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {Object.keys(preview.rows[0]).map(key => (
                          <th key={key} style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)', textAlign: 'left', whiteSpace: 'nowrap' }}>
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid var(--border-color, #f0f0f0)', whiteSpace: 'nowrap' }}>
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 10 && (
                    <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.5rem', textAlign: 'center' }}>
                      Showing 10 of {preview.rows.length} rows
                    </div>
                  )}
                </div>
              )}

              {preview.rows.length === 0 && (
                <div style={{ fontSize: '0.85rem', opacity: 0.6, textAlign: 'center', padding: '1rem' }}>
                  No data found for the selected criteria.
                </div>
              )}

              {/* Download Button */}
              {preview.rows.length > 0 && (
                <button
                  className="btn btn-primary"
                  onClick={handleDownload}
                  disabled={exporting}
                  style={{ width: '100%', marginTop: '0.75rem' }}
                >
                  <Download size={14} />
                  {exporting ? 'Downloading...' : `Download CSV (${preview.rows.length} rows)`}
                </button>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
