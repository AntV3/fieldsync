/**
 * CostCodeImport — CSV import for cost codes.
 * Allows users to upload their Sage cost code structure into FieldSync.
 */
import { useState, useCallback, useRef } from 'react'
import { Upload, AlertTriangle, CheckCircle, FileSpreadsheet, X } from 'lucide-react'
import { db } from '../../lib/supabase'

const REQUIRED_COLUMNS = ['Code', 'Description']
const OPTIONAL_COLUMNS = ['Category', 'Parent Code']
const VALID_CATEGORIES = ['labor', 'material', 'equipment', 'subcontractor', 'other']

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  // Parse header row
  const headers = parseCSVLine(lines[0])
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').trim()
    })
    rows.push(row)
  }

  return { headers: headers.map(h => h.trim()), rows }
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}

export default function CostCodeImport({ companyId, onShowToast, onImportComplete }) {
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [errors, setErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileSelect = useCallback((e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setImportResult(null)
    setErrors([])

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target.result
      const { headers, rows } = parseCSV(text)

      // Validate headers
      const validationErrors = []
      const normalizedHeaders = headers.map(h => h.toLowerCase())

      for (const req of REQUIRED_COLUMNS) {
        if (!normalizedHeaders.includes(req.toLowerCase())) {
          validationErrors.push(`Missing required column: "${req}"`)
        }
      }

      // Validate rows
      const codeIdx = normalizedHeaders.indexOf('code')
      const descIdx = normalizedHeaders.indexOf('description')
      const seenCodes = new Set()

      rows.forEach((row, i) => {
        const code = row[headers[codeIdx]] || row['Code'] || row['code']
        const desc = row[headers[descIdx]] || row['Description'] || row['description']

        if (!code) {
          validationErrors.push(`Row ${i + 2}: Missing cost code`)
        } else if (seenCodes.has(code)) {
          validationErrors.push(`Row ${i + 2}: Duplicate code "${code}"`)
        } else {
          seenCodes.add(code)
        }

        if (!desc) {
          validationErrors.push(`Row ${i + 2}: Missing description`)
        }

        // Validate category if present
        const category = row['Category'] || row['category']
        if (category && !VALID_CATEGORIES.includes(category.toLowerCase())) {
          validationErrors.push(`Row ${i + 2}: Invalid category "${category}". Use: ${VALID_CATEGORIES.join(', ')}`)
        }
      })

      setErrors(validationErrors)
      setParsed({ headers, rows })
    }
    reader.readAsText(selectedFile)
  }, [])

  const handleImport = useCallback(async () => {
    if (!parsed?.rows?.length || !companyId) return
    setImporting(true)

    try {
      let imported = 0
      let skipped = 0

      for (const row of parsed.rows) {
        const code = row['Code'] || row['code'] || ''
        const description = row['Description'] || row['description'] || ''
        const category = (row['Category'] || row['category'] || 'labor').toLowerCase()
        const parentCode = row['Parent Code'] || row['Parent code'] || row['parent_code'] || null

        if (!code || !description) {
          skipped++
          continue
        }

        try {
          await db.createCostCode(companyId, {
            code,
            description,
            category: VALID_CATEGORIES.includes(category) ? category : 'other',
            parent_code: parentCode || null
          })
          imported++
        } catch (err) {
          // Likely duplicate — skip
          if (err.message?.includes('duplicate') || err.code === '23505') {
            skipped++
          } else {
            throw err
          }
        }
      }

      setImportResult({ imported, skipped })
      onShowToast?.(`Imported ${imported} cost codes${skipped ? ` (${skipped} skipped)` : ''}`, 'success')
      onImportComplete?.()
    } catch (err) {
      onShowToast?.(`Import failed: ${err.message}`, 'error')
    } finally {
      setImporting(false)
    }
  }, [parsed, companyId, onShowToast, onImportComplete])

  const handleReset = useCallback(() => {
    setFile(null)
    setParsed(null)
    setErrors([])
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const hasBlockingErrors = errors.some(e => e.includes('Missing required column'))

  return (
    <div className="info-section-card">
      <div className="info-section-header">
        <FileSpreadsheet size={18} />
        <h3>Import Cost Codes</h3>
      </div>
      <div style={{ padding: '0 0 0.5rem' }}>
        <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 1rem' }}>
          Upload a CSV file with your cost code structure. Required columns: <strong>Code</strong>, <strong>Description</strong>.
          Optional: <strong>Category</strong> (labor, material, equipment, subcontractor, other), <strong>Parent Code</strong>.
        </p>

        {/* File Upload */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="cost-code-csv-upload"
          />
          <button
            className="btn btn-primary btn-small"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} /> Select CSV File
          </button>
          {file && (
            <span style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {file.name}
              <button
                onClick={handleReset}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', opacity: 0.6 }}
                title="Clear"
              >
                <X size={14} />
              </button>
            </span>
          )}
        </div>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600, fontSize: '0.85rem', color: '#dc2626', marginBottom: '0.25rem' }}>
              <AlertTriangle size={14} /> Validation Issues ({errors.length})
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#b91c1c', maxHeight: '120px', overflowY: 'auto' }}>
              {errors.slice(0, 20).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {errors.length > 20 && <li>...and {errors.length - 20} more</li>}
            </ul>
          </div>
        )}

        {/* Preview Table */}
        {parsed && !hasBlockingErrors && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Preview ({parsed.rows.length} cost codes)
            </div>
            <div style={{ overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.375rem' }}>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {parsed.headers.map(h => (
                      <th key={h} style={{ padding: '0.375rem 0.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)', textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-secondary, #f8f9fa)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 15).map((row, i) => (
                    <tr key={i}>
                      {parsed.headers.map(h => (
                        <td key={h} style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid var(--border-color, #f0f0f0)', whiteSpace: 'nowrap' }}>
                          {row[h] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 15 && (
                <div style={{ fontSize: '0.75rem', opacity: 0.6, textAlign: 'center', padding: '0.5rem' }}>
                  Showing 15 of {parsed.rows.length} rows
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import Button */}
        {parsed && !hasBlockingErrors && parsed.rows.length > 0 && !importResult && (
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={importing}
            style={{ width: '100%' }}
          >
            {importing ? 'Importing...' : `Import ${parsed.rows.length} Cost Codes`}
          </button>
        )}

        {/* Import Result */}
        {importResult && (
          <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '0.5rem', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={16} style={{ color: '#16a34a' }} />
            <span style={{ fontSize: '0.85rem' }}>
              <strong>{importResult.imported}</strong> cost codes imported
              {importResult.skipped > 0 && <>, <strong>{importResult.skipped}</strong> skipped (duplicates or invalid)</>}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
