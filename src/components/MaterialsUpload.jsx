import { useState } from 'react'
import * as XLSX from 'xlsx'
import { db } from '../lib/supabase'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment', 'Materials', 'Other']
const UNITS = ['each', 'roll', 'box', 'bag', 'gallon', 'ft', 'sf', 'cy', 'ton', 'day', 'hour', 'pound']

export default function MaterialsUpload({ companyId, onClose, onComplete, onShowToast }) {
  const [step, setStep] = useState(1) // 1: Upload, 2: Map Columns, 3: Review, 4: Importing
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [parsedData, setParsedData] = useState([])
  const [headers, setHeaders] = useState([])
  const [columnMapping, setColumnMapping] = useState({
    name: '',
    category: '',
    unit: '',
    cost: ''
  })
  const [reviewData, setReviewData] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const [importing, setImporting] = useState(false)

  // Auto-detect column from header name
  const autoDetectColumn = (header) => {
    const lower = header.toLowerCase()
    if (/name|item|material|product|description/.test(lower)) return 'name'
    if (/category|type|class/.test(lower)) return 'category'
    if (/unit|uom|measure/.test(lower)) return 'unit'
    if (/cost|price|rate/.test(lower)) return 'cost'
    return ''
  }

  // Auto-categorize based on item name
  const autoCategor ize = (itemName) => {
    const lower = itemName.toLowerCase()
    if (/poly|tape|barrier|plastic|encapsulant|sheeting|curtain/.test(lower)) return 'Containment'
    if (/suit|mask|respirator|glove|goggle|boot|ppe|safety|tyvek|harness/.test(lower)) return 'PPE'
    if (/drum|bag|disposal|waste|haul|container/.test(lower)) return 'Disposal'
    if (/excavator|bobcat|machine|saw|drill|lift|equipment|generator|compressor|pump/.test(lower)) return 'Equipment'
    return 'Materials'
  }

  // Normalize unit variations
  const normalizeUnit = (unit) => {
    if (!unit) return 'each'
    const lower = unit.toLowerCase().trim()
    if (/^ea$|^each$/.test(lower)) return 'each'
    if (/^roll/.test(lower)) return 'roll'
    if (/^box/.test(lower)) return 'box'
    if (/^bag/.test(lower)) return 'bag'
    if (/^gal|gallon/.test(lower)) return 'gallon'
    if (/^ft|foot|feet/.test(lower)) return 'ft'
    if (/^sf|sq.*ft|square.*foot/.test(lower)) return 'sf'
    if (/^cy|cubic.*yard/.test(lower)) return 'cy'
    if (/^ton/.test(lower)) return 'ton'
    if (/^day/.test(lower)) return 'day'
    if (/^hour|hr/.test(lower)) return 'hour'
    if (/^lb|pound/.test(lower)) return 'pound'
    return lower
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = (selectedFile) => {
    const fileName = selectedFile.name.toLowerCase()

    // Check file type
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      onShowToast('Please upload an Excel (.xlsx, .xls) or CSV file', 'error')
      return
    }

    setFile(selectedFile)
    parseFile(selectedFile)
  }

  const parseFile = (file) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // Get first sheet
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

        if (jsonData.length < 2) {
          onShowToast('File appears to be empty', 'error')
          return
        }

        // First row is headers
        const headerRow = jsonData[0]
        const dataRows = jsonData.slice(1).filter(row => row.length > 0)

        setHeaders(headerRow)
        setParsedData(dataRows)

        // Auto-detect column mapping
        const mapping = {
          name: '',
          category: '',
          unit: '',
          cost: ''
        }

        headerRow.forEach((header, index) => {
          const detected = autoDetectColumn(String(header))
          if (detected && !mapping[detected]) {
            mapping[detected] = index
          }
        })

        setColumnMapping(mapping)
        setStep(2)
      } catch (error) {
        console.error('Error parsing file:', error)
        onShowToast('Error reading file. Please check the format.', 'error')
      }
    }

    reader.readAsArrayBuffer(file)
  }

  const handleColumnMappingChange = (field, columnIndex) => {
    setColumnMapping(prev => ({ ...prev, [field]: columnIndex }))
  }

  const handleNext FromMapping = () => {
    if (!columnMapping.name) {
      onShowToast('Please select which column contains the item name', 'error')
      return
    }

    // Convert parsed data to items with mapped columns
    const items = parsedData
      .map((row, index) => {
        const name = row[columnMapping.name]
        if (!name || String(name).trim() === '') return null

        const category = columnMapping.category !== ''
          ? row[columnMapping.category] || autoCategor ize(String(name))
          : autoCategor ize(String(name))

        const unit = columnMapping.unit !== ''
          ? normalizeUnit(String(row[columnMapping.unit] || ''))
          : 'each'

        const cost = columnMapping.cost !== ''
          ? parseFloat(row[columnMapping.cost]) || 0
          : 0

        return {
          id: `temp-${index}`,
          name: String(name).trim(),
          category: category,
          unit: unit,
          cost_per_unit: cost,
          selected: true
        }
      })
      .filter(item => item !== null)

    setReviewData(items)
    setSelectedItems(items.map(item => item.id))
    setStep(3)
  }

  const handleToggleItem = (itemId) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId)
      } else {
        return [...prev, itemId]
      }
    })
  }

  const handleToggleAll = () => {
    if (selectedItems.length === reviewData.length) {
      setSelectedItems([])
    } else {
      setSelectedItems(reviewData.map(item => item.id))
    }
  }

  const handleUpdateItem = (itemId, field, value) => {
    setReviewData(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    )
  }

  const handleImport = async () => {
    const itemsToImport = reviewData.filter(item => selectedItems.includes(item.id))

    if (itemsToImport.length === 0) {
      onShowToast('No items selected for import', 'error')
      return
    }

    setImporting(true)
    setStep(4)

    try {
      // Import items one by one
      let successCount = 0
      let errorCount = 0

      for (const item of itemsToImport) {
        try {
          await db.createMaterialEquipment({
            company_id: companyId,
            name: item.name,
            category: item.category,
            unit: item.unit,
            cost_per_unit: item.cost_per_unit,
            active: true
          })
          successCount++
        } catch (error) {
          console.error(`Error importing ${item.name}:`, error)
          errorCount++
        }
      }

      if (errorCount === 0) {
        onShowToast(`Successfully imported ${successCount} items`, 'success')
      } else {
        onShowToast(`Imported ${successCount} items, ${errorCount} failed`, 'error')
      }

      onComplete()
    } catch (error) {
      console.error('Error during import:', error)
      onShowToast('Error importing items', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="materials-upload-overlay">
      <div className="materials-upload-modal">
        {/* Header */}
        <div className="materials-upload-header">
          <h3>
            {step === 1 && '📤 Upload Materials List'}
            {step === 2 && '📋 Map Columns'}
            {step === 3 && '✓ Review & Import'}
            {step === 4 && '⏳ Importing...'}
          </h3>
          <button className="materials-form-close" onClick={onClose}>×</button>
        </div>

        {/* Step 1: Upload File */}
        {step === 1 && (
          <div className="materials-upload-body">
            <div
              className={`file-drop-zone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="file-drop-icon">📄</div>
              <div className="file-drop-text">
                {file ? (
                  <>
                    <strong>{file.name}</strong>
                    <p>Click to choose a different file</p>
                  </>
                ) : (
                  <>
                    <strong>Drop your Excel or CSV file here</strong>
                    <p>or click to browse</p>
                  </>
                )}
              </div>
              <input
                type="file"
                className="file-input"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileInput}
              />
            </div>

            <div className="file-format-help">
              <h4>Expected Format:</h4>
              <div className="format-example">
                <table>
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Unit</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>6 mil Poly</td>
                      <td>Containment</td>
                      <td>roll</td>
                      <td>45.00</td>
                    </tr>
                    <tr>
                      <td>Tyvek Suit</td>
                      <td>PPE</td>
                      <td>each</td>
                      <td>12.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="format-note">
                <strong>Note:</strong> Only the Item Name column is required.
                We can auto-detect categories and set default values for missing data.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Map Columns */}
        {step === 2 && (
          <div className="materials-upload-body">
            <p className="step-description">
              Map your columns to the correct fields. We've auto-detected some columns for you.
            </p>

            <div className="column-mapping">
              <div className="mapping-row">
                <label>Item Name *</label>
                <select
                  value={columnMapping.name}
                  onChange={(e) => handleColumnMappingChange('name', e.target.value)}
                >
                  <option value="">-- Select Column --</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mapping-row">
                <label>Category (optional)</label>
                <select
                  value={columnMapping.category}
                  onChange={(e) => handleColumnMappingChange('category', e.target.value)}
                >
                  <option value="">-- Auto-detect --</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mapping-row">
                <label>Unit (optional)</label>
                <select
                  value={columnMapping.unit}
                  onChange={(e) => handleColumnMappingChange('unit', e.target.value)}
                >
                  <option value="">-- Auto-detect --</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mapping-row">
                <label>Cost Per Unit (optional)</label>
                <select
                  value={columnMapping.cost}
                  onChange={(e) => handleColumnMappingChange('cost', e.target.value)}
                >
                  <option value="">-- Skip --</option>
                  {headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="preview-section">
              <h4>Preview (first 5 rows):</h4>
              <div className="preview-table-container">
                <table className="preview-table">
                  <thead>
                    <tr>
                      {headers.map((header, index) => (
                        <th key={index}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 5).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Import */}
        {step === 3 && (
          <div className="materials-upload-body">
            <div className="review-header">
              <p className="step-description">
                Review the items below. Uncheck any you don't want to import.
              </p>
              <div className="review-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedItems.length === reviewData.length}
                    onChange={handleToggleAll}
                  />
                  Select All ({selectedItems.length} of {reviewData.length})
                </label>
              </div>
            </div>

            <div className="review-list">
              {reviewData.map(item => (
                <div key={item.id} className={`review-item ${selectedItems.includes(item.id) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => handleToggleItem(item.id)}
                  />
                  <div className="review-item-fields">
                    <input
                      type="text"
                      className="review-field-name"
                      value={item.name}
                      onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                      placeholder="Item Name"
                    />
                    <select
                      className="review-field-category"
                      value={item.category}
                      onChange={(e) => handleUpdateItem(item.id, 'category', e.target.value)}
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <select
                      className="review-field-unit"
                      value={item.unit}
                      onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                    >
                      {UNITS.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="review-field-cost"
                      value={item.cost_per_unit}
                      onChange={(e) => handleUpdateItem(item.id, 'cost_per_unit', parseFloat(e.target.value) || 0)}
                      placeholder="Cost"
                      step="0.01"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === 4 && (
          <div className="materials-upload-body">
            <div className="importing-message">
              <div className="spinner"></div>
              <p>Importing {selectedItems.length} items...</p>
              <p className="importing-note">Please wait, this may take a moment.</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="materials-upload-footer">
          {step === 1 && (
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
          )}
          {step === 2 && (
            <>
              <button className="btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="btn" onClick={handleNext FromMapping}>
                Next: Review
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button className="btn-secondary" onClick={() => setStep(2)}>
                Back
              </button>
              <button
                className="btn"
                onClick={handleImport}
                disabled={selectedItems.length === 0}
              >
                Import {selectedItems.length} Items
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
