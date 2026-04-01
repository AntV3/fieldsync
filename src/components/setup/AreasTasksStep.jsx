import { useRef, useState } from 'react'
import { safeParseExcel, safeSheetToJson, loadXLSXSafe } from '../../lib/safeXlsx'

// Currency formatting helpers
const formatCurrencyDisplay = (value) => {
  if (value === null || value === undefined || value === '') return ''
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num)
}

const parseCurrencyInput = (value) => {
  if (!value) return null
  const cleaned = String(value).replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

export default function AreasTasksStep({ data, onChange, onShowToast }) {
  const { areas } = data
  const [importing, setImporting] = useState(false)
  const [showImportReview, setShowImportReview] = useState(false)
  const [importedTasks, setImportedTasks] = useState([])
  const [showWeightDropdown, setShowWeightDropdown] = useState(false)
  const fileInputRef = useRef(null)

  const totalWeight = areas.reduce((sum, area) => {
    return sum + (parseFloat(area.weight) || 0)
  }, 0)

  const handleAreaChange = (index, field, value) => {
    const newAreas = areas.map((area, i) =>
      i === index ? { ...area, [field]: value } : area
    )
    onChange({ ...data, areas: newAreas })
  }

  const addArea = () => {
    onChange({ ...data, areas: [...areas, { name: '', weight: '', group: '', scheduledValue: null }] })
  }

  const removeArea = (index) => {
    if (areas.length > 1) {
      onChange({ ...data, areas: areas.filter((_, i) => i !== index) })
    }
  }

  const autoGenerateWeights = (method = 'value') => {
    const validAreas = areas.filter(a => a.name.trim())
    if (validAreas.length === 0) {
      onShowToast('Add tasks first', 'error')
      return
    }

    const newAreas = [...areas]
    const validIndices = areas.map((a, i) => a.name.trim() ? i : -1).filter(i => i >= 0)

    if (method === 'value') {
      const totalValue = validAreas.reduce((sum, a) => sum + (parseFloat(a.scheduledValue) || 0), 0)

      if (totalValue === 0) {
        onShowToast('No scheduled values - using equal distribution', 'info')
        method = 'equal'
      } else {
        let runningTotal = 0
        validIndices.forEach((areaIndex, i) => {
          const value = parseFloat(areas[areaIndex].scheduledValue) || 0
          let weight
          if (i === validIndices.length - 1) {
            weight = 100 - runningTotal
          } else {
            weight = Math.round((value / totalValue) * 10000) / 100
            runningTotal += weight
          }
          newAreas[areaIndex] = { ...newAreas[areaIndex], weight: weight.toFixed(2) }
        })

        onChange({ ...data, areas: newAreas })
        setShowWeightDropdown(false)
        onShowToast('Weights calculated by value', 'success')
        return
      }
    }

    const weight = Math.round((100 / validIndices.length) * 100) / 100
    let runningTotal = 0
    validIndices.forEach((areaIndex, i) => {
      let w
      if (i === validIndices.length - 1) {
        w = 100 - runningTotal
      } else {
        w = weight
        runningTotal += w
      }
      newAreas[areaIndex] = { ...newAreas[areaIndex], weight: w.toFixed(2) }
    })

    onChange({ ...data, areas: newAreas })
    setShowWeightDropdown(false)
    onShowToast('Weights distributed equally', 'success')
  }

  // Excel Import
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const parseExcel = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const fileData = new Uint8Array(e.target.result)
          const workbook = await safeParseExcel(fileData)
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const XLSX = await loadXLSXSafe()
          const rows = safeSheetToJson(XLSX, sheet, { header: 1 })

          const tasks = []
          let currentGroup = 'General'

          const dollarPattern = /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/
          const itemNumberPattern = /^(\d+\.?\d*|[A-Z]\.?\d*)$/i
          const unitPattern = /^(SF|LF|EA|LS|Days?|MD|Load|CY|SY|GAL|TON)$/i
          const quantityPattern = /^\d{1,3}(,\d{3})*$|^\d+$/
          const headerPattern = /^(Item|#|No\.?|Description|Scheduled|Value|Amount|Quantity|Unit|Total|Application|Balance|Completed|Stored|Retainage)/i

          for (const row of rows) {
            if (!row || row.length === 0) continue
            const cells = row
              .map(cell => cell === null || cell === undefined ? '' : String(cell).trim())
              .filter(cell => cell.length > 0)
            if (cells.length === 0) continue

            const rowText = cells.join(' ')
            if (headerPattern.test(cells[0]) || (cells.length > 1 && headerPattern.test(cells[1]))) continue
            if (/^(Total|Subtotal|Grand Total|Base Bid|Contract Sum)/i.test(rowText)) continue

            const hasDollarAmount = cells.some(c => {
              if (dollarPattern.test(c) || /^\$/.test(c)) return true
              const num = parseFloat(c.replace(/[$,]/g, ''))
              return !isNaN(num) && num > 100 && /^[\d,.$]+$/.test(c)
            })

            const isGroupHeader =
              !hasDollarAmount &&
              cells.length <= 3 &&
              /^(L\d|Level|Floor|\d+(?:st|nd|rd|th)|Plaza|Street|Basement|Roof|Penthouse|Site|Exterior|Interior|Misc|MEP|ABATEMENT|DEMOLITION|UNIVERSAL|SOFT|TRASH|DEMO|Phase|Division|Section|Area|Building|Wing)/i.test(cells[0]) ||
              (cells.length === 2 && itemNumberPattern.test(cells[0]) && !hasDollarAmount && !/^\d+\.\d+$/.test(cells[0]))

            if (isGroupHeader && !hasDollarAmount) {
              const groupName = cells.find(c => !itemNumberPattern.test(c) && c.length > 1) || cells.join(' ')
              currentGroup = groupName
                .replace(/\s*\(\d{1,3}(?:,\d{3})*\s*SF\)\s*$/i, '')
                .replace(/\s*[-:]\s*$/, '')
                .trim()
              continue
            }

            let description = ''
            let hasValue = false
            let itemNumber = ''
            let scheduledValue = null
            const descParts = []

            for (let i = 0; i < cells.length; i++) {
              const cell = cells[i]
              if (i === 0 && itemNumberPattern.test(cell)) { itemNumber = cell; continue }
              if (/^ID-\d+$/i.test(cell)) continue
              if (/^KN\s*\d+$/i.test(cell)) continue

              const cleanValue = cell.replace(/[$,]/g, '')
              const parsedValue = parseFloat(cleanValue)
              if (dollarPattern.test(cell) || /^\$/.test(cell) || (!isNaN(parsedValue) && parsedValue > 100 && /^[\d,.$]+$/.test(cell))) {
                if (!isNaN(parsedValue) && parsedValue > 100) {
                  if (scheduledValue === null || parsedValue > scheduledValue) {
                    scheduledValue = parsedValue
                  }
                }
                hasValue = true
                continue
              }

              if (quantityPattern.test(cell.replace(/,/g, ''))) { hasValue = true; continue }
              if (unitPattern.test(cell)) continue
              if (/^\d+\.?\d*%$/.test(cell)) continue

              if (cell.length > 1 && !itemNumberPattern.test(cell)) {
                descParts.push(cell)
              }
            }

            description = descParts.join(' ').trim()
              .replace(/\s+/g, ' ')
              .replace(/^[-•]\s*/, '')
              .trim()

            if (description.length < 3) continue
            if (/^(Plan|Page|Total|Base Bid|Payment|Condition|Exclusion|Subtotal)/i.test(description)) continue

            if (hasValue && description.length >= 3) {
              tasks.push({ name: description, group: currentGroup, itemNumber, scheduledValue, selected: true })
            }
          }

          const seen = new Set()
          const uniqueTasks = tasks.filter(task => {
            const key = `${task.group}:${task.name}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          resolve(uniqueTasks)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      onShowToast('Please upload an Excel file (.xlsx, .xls, or .csv)', 'error')
      return
    }
    setImporting(true)
    try {
      const tasks = await parseExcel(file)
      if (tasks.length === 0) {
        onShowToast('No tasks found. Check Excel format.', 'error')
        setImporting(false)
        return
      }
      setImportedTasks(tasks)
      setShowImportReview(true)
      onShowToast(`Found ${tasks.length} tasks`, 'success')
    } catch (error) {
      console.error('Excel import error:', error)
      onShowToast('Error reading Excel file', 'error')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const toggleTaskSelection = (index) => {
    setImportedTasks(prev => prev.map((task, i) =>
      i === index ? { ...task, selected: !task.selected } : task
    ))
  }

  const handleUseImportedTasks = () => {
    const selectedTasks = importedTasks.filter(t => t.selected)
    if (selectedTasks.length === 0) {
      onShowToast('Please select at least one task', 'error')
      return
    }

    const totalSOV = selectedTasks.reduce((sum, t) => sum + (t.scheduledValue || 0), 0)
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

    let newAreas
    if (totalSOV > 0) {
      let runningTotal = 0
      newAreas = selectedTasks.map((task, index) => {
        const value = task.scheduledValue || 0
        let weight
        if (index === selectedTasks.length - 1) {
          weight = 100 - runningTotal
        } else {
          weight = Math.round((value / totalSOV) * 10000) / 100
          runningTotal += weight
        }
        return { name: task.name, weight: weight.toFixed(2), group: task.group, scheduledValue: task.scheduledValue || null }
      })
      onShowToast(`Tasks imported with value-based weights! Total SOV: ${formatter.format(totalSOV)}`, 'success')
    } else {
      const weight = Math.round((100 / selectedTasks.length) * 100) / 100
      newAreas = selectedTasks.map((task, index) => ({
        name: task.name,
        weight: index === selectedTasks.length - 1
          ? (100 - (weight * (selectedTasks.length - 1))).toFixed(2)
          : weight.toFixed(2),
        group: task.group,
        scheduledValue: task.scheduledValue || null
      }))
      onShowToast('Tasks imported with equal weights', 'success')
    }

    onChange({ ...data, areas: newAreas })
    setShowImportReview(false)
  }

  // Import Review Screen
  if (showImportReview) {
    const groups = [...new Set(importedTasks.map(t => t.group))]
    const selectedCount = importedTasks.filter(t => t.selected).length
    const totalSOV = importedTasks.reduce((sum, t) => sum + (t.scheduledValue || 0), 0)
    const selectedSOV = importedTasks.filter(t => t.selected).reduce((sum, t) => sum + (t.scheduledValue || 0), 0)

    return (
      <div className="wizard-step-content">
        <div className="wizard-step-header">
          <h2>Review Imported Tasks</h2>
          <p>Select the tasks to include in your project</p>
        </div>

        <div className="import-summary">
          <span>{selectedCount} of {importedTasks.length} tasks selected</span>
          {totalSOV > 0 && (
            <span className="import-sov-total">
              · Total SOV: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(selectedSOV)}
            </span>
          )}
        </div>

        {groups.map(group => {
          const groupTasks = importedTasks.filter(t => t.group === group)
          const groupSelectedCount = groupTasks.filter(t => t.selected).length
          return (
            <div key={group} className="card import-group">
              <div className="import-group-header">
                <h3>{group}</h3>
                <span className="import-group-count">{groupSelectedCount}/{groupTasks.length}</span>
              </div>
              <div className="import-task-list">
                {groupTasks.map(task => {
                  const taskIndex = importedTasks.indexOf(task)
                  return (
                    <label key={taskIndex} className="import-task-item">
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={() => toggleTaskSelection(taskIndex)}
                      />
                      <span className="import-task-name">{task.name}</span>
                      {task.scheduledValue > 0 && (
                        <span className="import-task-value">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(task.scheduledValue)}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="import-actions">
          <button className="btn btn-secondary" onClick={() => setShowImportReview(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleUseImportedTasks}>
            Use Selected Tasks ({selectedCount})
          </button>
        </div>
      </div>
    )
  }

  // Group areas by group_name for display
  const groupedAreas = areas.reduce((acc, area, index) => {
    const group = area.group || 'General'
    if (!acc[group]) acc[group] = []
    acc[group].push({ ...area, originalIndex: index })
    return acc
  }, {})

  const hasGroups = Object.keys(groupedAreas).length > 1 ||
    (Object.keys(groupedAreas).length === 1 && !groupedAreas['General'])

  return (
    <div className="wizard-step-content">
      <div className="wizard-step-header">
        <h2>Areas & Tasks</h2>
        <p>Define the work areas for this project. Weights must total 100%.</p>
      </div>

      <div className="card">
        <div className="areas-header">
          <div>
            <h3>Task Areas</h3>
          </div>
          <div className="import-btn-container">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-secondary btn-small"
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? 'Reading...' : 'Import Excel'}
            </button>
          </div>
        </div>

        {hasGroups ? (
          Object.entries(groupedAreas).map(([group, groupAreas]) => (
            <div key={group} className="area-group">
              <div className="area-group-header">{group}</div>
              {groupAreas.map(area => (
                <div key={area.originalIndex} className="area-row area-row-with-value">
                  <input
                    type="text"
                    placeholder="Task name"
                    value={area.name}
                    onChange={(e) => handleAreaChange(area.originalIndex, 'name', e.target.value)}
                    className="area-name-input"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="$0"
                    value={area.scheduledValue ? formatCurrencyDisplay(area.scheduledValue) : ''}
                    onChange={(e) => handleAreaChange(area.originalIndex, 'scheduledValue', parseCurrencyInput(e.target.value))}
                    className="currency-input"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="%"
                    value={area.weight}
                    onChange={(e) => handleAreaChange(area.originalIndex, 'weight', e.target.value)}
                    className="weight-input"
                  />
                  <button className="remove-btn" onClick={() => removeArea(area.originalIndex)}>×</button>
                </div>
              ))}
            </div>
          ))
        ) : (
          areas.map((area, index) => (
            <div key={index} className="area-row area-row-with-value">
              <input
                type="text"
                placeholder="Area name (e.g., Level 1)"
                value={area.name}
                onChange={(e) => handleAreaChange(index, 'name', e.target.value)}
                className="area-name-input"
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="$0"
                value={area.scheduledValue ? formatCurrencyDisplay(area.scheduledValue) : ''}
                onChange={(e) => handleAreaChange(index, 'scheduledValue', parseCurrencyInput(e.target.value))}
                className="currency-input"
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="%"
                value={area.weight}
                onChange={(e) => handleAreaChange(index, 'weight', e.target.value)}
                className="weight-input"
              />
              <button className="remove-btn" onClick={() => removeArea(index)}>×</button>
            </div>
          ))
        )}

        <div className="weight-total-row">
          <div className="weight-total">
            <span className="weight-total-label">Total Weight:</span>
            <span className={`weight-total-value ${Math.abs(totalWeight - 100) < 0.1 ? 'valid' : 'invalid'}`}>
              {totalWeight.toFixed(1)}%
            </span>
            {areas.some(a => a.scheduledValue > 0) && (
              <span className="sov-total">
                · SOV: {formatCurrencyDisplay(areas.reduce((sum, a) => sum + (parseFloat(a.scheduledValue) || 0), 0))}
              </span>
            )}
          </div>
          <div className="auto-weight-dropdown">
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setShowWeightDropdown(!showWeightDropdown)}
            >
              Auto-Calculate
            </button>
            {showWeightDropdown && (
              <div className="weight-dropdown-menu">
                <button onClick={() => autoGenerateWeights('value')}>
                  By Value <span className="dropdown-hint">(Recommended)</span>
                </button>
                <button onClick={() => autoGenerateWeights('equal')}>
                  Equal Distribution
                </button>
              </div>
            )}
          </div>
        </div>

        <button className="btn btn-secondary" onClick={addArea}>
          + Add Area
        </button>
      </div>
    </div>
  )
}
