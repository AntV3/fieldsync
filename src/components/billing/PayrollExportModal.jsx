import { useState, useCallback } from 'react'
import { X, Download, Calendar, FileText } from 'lucide-react'
import { db } from '../../lib/supabase'
import {
  exportPayrollADP,
  exportPayrollPaychex,
  exportPayrollGusto,
  exportPayrollSummary
} from '../../lib/payrollExport'

const FORMATS = [
  { id: 'adp', label: 'ADP', description: 'ADP Run / Workforce Now CSV' },
  { id: 'paychex', label: 'Paychex', description: 'Paychex Flex CSV' },
  { id: 'gusto', label: 'Gusto', description: 'Gusto time import CSV' },
  { id: 'summary', label: 'Summary', description: 'Generic payroll summary' }
]

/**
 * PayrollExportModal
 *
 * Allows users to select a date range and payroll format,
 * then exports crew hours as a CSV compatible with their payroll provider.
 */
export default function PayrollExportModal({ company, onClose, onShowToast }) {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [startDate, setStartDate] = useState(weekAgo)
  const [endDate, setEndDate] = useState(today)
  const [format, setFormat] = useState('summary')
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    if (!startDate || !endDate) {
      onShowToast?.('Please select a date range', 'error')
      return
    }

    try {
      setExporting(true)

      // Fetch T&M worker data for the date range
      const tmData = await db.getPayrollTMData(company.id, startDate, endDate)

      if (!tmData || tmData.length === 0) {
        onShowToast?.('No T&M data found for this date range', 'error')
        return
      }

      const dateRange = { start: startDate, end: endDate }
      const companyName = company.name || 'Company'
      let fileName

      switch (format) {
        case 'adp':
          fileName = exportPayrollADP(tmData, companyName, dateRange)
          break
        case 'paychex':
          fileName = exportPayrollPaychex(tmData, companyName, dateRange)
          break
        case 'gusto':
          fileName = exportPayrollGusto(tmData, companyName, dateRange)
          break
        case 'summary':
        default:
          fileName = exportPayrollSummary(tmData, companyName, dateRange)
          break
      }

      onShowToast?.(`Exported ${fileName}`, 'success')
      onClose()
    } catch (error) {
      console.error('Error exporting payroll:', error)
      onShowToast?.('Error exporting payroll data', 'error')
    } finally {
      setExporting(false)
    }
  }, [startDate, endDate, format, company, onClose, onShowToast])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal payroll-export-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <FileText size={20} />
            Payroll Export
          </h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="payroll-export-description">
            Export crew hours from T&M tickets in a format compatible with your payroll provider.
            Hours are aggregated by worker, date, project, and labor classification.
          </p>

          {/* Date Range */}
          <div className="form-group">
            <label className="form-label">
              <Calendar size={14} />
              Pay Period
            </label>
            <div className="date-range-inputs">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="form-input"
              />
              <span className="date-range-separator">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          {/* Format Selection */}
          <div className="form-group">
            <label className="form-label">Export Format</label>
            <div className="format-options">
              {FORMATS.map(f => (
                <label
                  key={f.id}
                  className={`format-option ${format === f.id ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="payrollFormat"
                    value={f.id}
                    checked={format === f.id}
                    onChange={() => setFormat(f.id)}
                  />
                  <div className="format-option-content">
                    <span className="format-option-label">{f.label}</span>
                    <span className="format-option-desc">{f.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || !startDate || !endDate}
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>
    </div>
  )
}
