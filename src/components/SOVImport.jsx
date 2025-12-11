import { useState } from 'react'
import { db } from '../lib/supabase'
import { getUserContext } from '../lib/offlineStorage'

/**
 * Schedule of Values Import Component
 * Allows importing pay application line items via CSV or manual entry
 */
export default function SOVImport({ project, onImportComplete, onCancel }) {
  const [importMethod, setImportMethod] = useState('manual') // 'manual' or 'csv'
  const [lineItems, setLineItems] = useState([
    { line_number: '1', description: '', scheduled_value: '', calc_method: 'area_distribution' }
  ])
  const [csvFile, setCsvFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [csvPreview, setCsvPreview] = useState([])

  const calcMethods = [
    { value: 'area_distribution', label: 'Area Distribution (equal split)' },
    { value: 'tm_actual', label: 'T&M Actual Costs' },
    { value: 'manual', label: 'Manual Entry' }
  ]

  // Add new line item
  const addLineItem = () => {
    const lastLine = lineItems[lineItems.length - 1]
    const nextLineNumber = lastLine ? String(parseInt(lastLine.line_number) + 1) : '1'

    setLineItems([
      ...lineItems,
      { line_number: nextLineNumber, description: '', scheduled_value: '', calc_method: 'area_distribution' }
    ])
  }

  // Remove line item
  const removeLineItem = (index) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index))
    }
  }

  // Update line item field
  const updateLineItem = (index, field, value) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  // Handle CSV file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return

    setCsvFile(file)
    setError(null)

    // Read and preview CSV
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const lines = text.split('\n').filter(line => line.trim())

        // Parse CSV (simple parser, assumes comma-separated)
        const parsed = lines.slice(1).map(line => {
          const [line_number, description, scheduled_value, calc_method] = line.split(',').map(s => s.trim())
          return {
            line_number: line_number || '',
            description: description || '',
            scheduled_value: scheduled_value || '',
            calc_method: calc_method || 'area_distribution'
          }
        }).filter(item => item.line_number && item.description)

        if (parsed.length === 0) {
          setError('No valid data found in CSV. Make sure it has columns: Line Number, Description, Scheduled Value, Calc Method')
          return
        }

        setCsvPreview(parsed)
      } catch (err) {
        setError('Error parsing CSV file: ' + err.message)
      }
    }
    reader.onerror = () => {
      setError('Error reading file')
    }
    reader.readAsText(file)
  }

  // Import SOV line items
  const handleImport = async () => {
    setLoading(true)
    setError(null)

    try {
      const items = importMethod === 'csv' ? csvPreview : lineItems

      // Validate
      const invalid = items.find(item =>
        !item.line_number || !item.description || !item.scheduled_value || parseFloat(item.scheduled_value) <= 0
      )

      if (invalid) {
        setError('All line items must have a line number, description, and positive scheduled value')
        setLoading(false)
        return
      }

      // Get user context for audit trail
      const userContext = await getUserContext()

      // Insert into database
      const sovData = items.map((item, index) => ({
        project_id: project.id,
        line_number: item.line_number,
        description: item.description,
        scheduled_value: parseFloat(item.scheduled_value),
        calc_method: item.calc_method || 'area_distribution',
        sort_order: index,
        created_by_id: userContext?.userId,
        created_by_name: userContext?.userName
      }))

      const { data, error: dbError } = await db
        .from('schedule_of_values')
        .insert(sovData)
        .select()

      if (dbError) throw dbError

      // Update project contract value (sum of SOV line items)
      const totalContractValue = items.reduce((sum, item) => sum + parseFloat(item.scheduled_value), 0)

      await db
        .from('projects')
        .update({
          contract_value: totalContractValue,
          updated_by_id: userContext?.userId,
          updated_by_name: userContext?.userName
        })
        .eq('id', project.id)

      onImportComplete?.(data)
    } catch (err) {
      console.error('Error importing SOV:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Pay Application</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="modal-body">
          {/* Import Method Selection */}
          <div className="form-group">
            <label>Import Method</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="manual"
                  checked={importMethod === 'manual'}
                  onChange={(e) => setImportMethod(e.target.value)}
                />
                Manual Entry
              </label>
              <label>
                <input
                  type="radio"
                  value="csv"
                  checked={importMethod === 'csv'}
                  onChange={(e) => setImportMethod(e.target.value)}
                />
                CSV Upload
              </label>
            </div>
          </div>

          {/* CSV Upload */}
          {importMethod === 'csv' && (
            <div className="sov-csv-upload">
              <div className="form-group">
                <label>Upload CSV File</label>
                <p className="form-hint">
                  CSV should have columns: Line Number, Description, Scheduled Value, Calc Method (optional)
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="file-input"
                />
              </div>

              {csvPreview.length > 0 && (
                <div className="sov-preview">
                  <h3>Preview ({csvPreview.length} line items)</h3>
                  <div className="table-container">
                    <table className="sov-table">
                      <thead>
                        <tr>
                          <th>Line #</th>
                          <th>Description</th>
                          <th>Scheduled Value</th>
                          <th>Calc Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((item, index) => (
                          <tr key={index}>
                            <td>{item.line_number}</td>
                            <td>{item.description}</td>
                            <td>${parseFloat(item.scheduled_value).toLocaleString()}</td>
                            <td>{calcMethods.find(m => m.value === item.calc_method)?.label || item.calc_method}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="2"><strong>Total Contract Value:</strong></td>
                          <td colSpan="2">
                            <strong>
                              ${csvPreview.reduce((sum, item) => sum + parseFloat(item.scheduled_value || 0), 0).toLocaleString()}
                            </strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Entry */}
          {importMethod === 'manual' && (
            <div className="sov-manual-entry">
              <div className="table-container">
                <table className="sov-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Line #</th>
                      <th>Description</th>
                      <th style={{ width: '150px' }}>Scheduled Value</th>
                      <th style={{ width: '200px' }}>Calc Method</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, index) => (
                      <tr key={index}>
                        <td>
                          <input
                            type="text"
                            value={item.line_number}
                            onChange={(e) => updateLineItem(index, 'line_number', e.target.value)}
                            placeholder="1"
                            className="input-small"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                            placeholder="Site Work & Demolition"
                            className="input-full"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.scheduled_value}
                            onChange={(e) => updateLineItem(index, 'scheduled_value', e.target.value)}
                            placeholder="45000"
                            step="0.01"
                            min="0"
                            className="input-small"
                          />
                        </td>
                        <td>
                          <select
                            value={item.calc_method}
                            onChange={(e) => updateLineItem(index, 'calc_method', e.target.value)}
                            className="input-full"
                          >
                            {calcMethods.map(method => (
                              <option key={method.value} value={method.value}>
                                {method.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              className="btn-icon btn-danger"
                              aria-label="Remove line item"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5">
                        <button type="button" onClick={addLineItem} className="btn btn-secondary btn-small">
                          + Add Line Item
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan="2"><strong>Total Contract Value:</strong></td>
                      <td colSpan="3">
                        <strong>
                          ${lineItems.reduce((sum, item) => sum + parseFloat(item.scheduled_value || 0), 0).toLocaleString()}
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {/* Info Box */}
          <div className="info-box">
            <h4>📊 Calculation Methods:</h4>
            <ul>
              <li><strong>Area Distribution:</strong> Earned value split equally across all linked areas</li>
              <li><strong>T&M Actual Costs:</strong> Earned value based on approved T&M ticket costs</li>
              <li><strong>Manual Entry:</strong> Office sets earned value manually per area/ticket</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="btn btn-primary"
            disabled={loading || (importMethod === 'csv' && csvPreview.length === 0)}
          >
            {loading ? 'Importing...' : `Import ${importMethod === 'csv' ? csvPreview.length : lineItems.length} Line Items`}
          </button>
        </div>
      </div>
    </div>
  )
}
