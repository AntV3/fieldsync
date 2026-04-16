import { useRef, useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus, Settings2 } from 'lucide-react'
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

const newTempId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export default function AreasTasksStep({ data, onChange, onShowToast }) {
  const { areas, phases = [] } = data
  const [importing, setImporting] = useState(false)
  const [showImportReview, setShowImportReview] = useState(false)
  const [importedTasks, setImportedTasks] = useState([])
  const [showWeightDropdown, setShowWeightDropdown] = useState(false)
  const [expandedDetails, setExpandedDetails] = useState({})
  const [pendingPhaseDelete, setPendingPhaseDelete] = useState(null)
  const fileInputRef = useRef(null)

  const totalWeight = areas.reduce((sum, area) => {
    return sum + (parseFloat(area.weight) || 0)
  }, 0)

  // ----- Area mutations ---------------------------------------------------

  const handleAreaChange = (index, field, value) => {
    const newAreas = areas.map((area, i) =>
      i === index ? { ...area, [field]: value } : area
    )
    onChange({ ...data, areas: newAreas })
  }

  const addAreaToPhase = (phase) => {
    onChange({
      ...data,
      areas: [
        ...areas,
        {
          name: '',
          weight: '',
          group: phase ? phase.name : '',
          scheduledValue: null,
          tempPhaseId: phase ? phase.tempId : null
        }
      ]
    })
  }

  const removeArea = (index) => {
    if (areas.length > 1) {
      onChange({ ...data, areas: areas.filter((_, i) => i !== index) })
    }
  }

  // ----- Phase mutations --------------------------------------------------

  const updatePhases = (nextPhases) => onChange({ ...data, phases: nextPhases })

  const addPhase = () => {
    const phase = {
      tempId: newTempId(),
      name: '',
      description: '',
      planned_start_date: '',
      planned_end_date: '',
      sort_order: phases.length
    }
    updatePhases([...phases, phase])
    setExpandedDetails(prev => ({ ...prev, [phase.tempId]: true }))
  }

  const handlePhaseChange = (tempId, field, value) => {
    const next = phases.map(p => p.tempId === tempId ? { ...p, [field]: value } : p)
    // Keep linked areas' `group` string in sync so the Review step + DB
    // insert can fall back to it even if the phase row never persists.
    const nextAreas = field === 'name'
      ? areas.map(a => a.tempPhaseId === tempId ? { ...a, group: value } : a)
      : areas
    onChange({ ...data, phases: next, areas: nextAreas })
  }

  const movePhase = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= phases.length) return
    const next = [...phases]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    next.forEach((p, i) => { p.sort_order = i })
    updatePhases(next)
  }

  const requestDeletePhase = (phase) => {
    const tasksUnder = areas.filter(a => a.tempPhaseId === phase.tempId)
    if (tasksUnder.length === 0) {
      // Empty: delete immediately
      updatePhases(phases.filter(p => p.tempId !== phase.tempId))
      return
    }
    setPendingPhaseDelete(phase)
  }

  const confirmDeletePhase = (mode) => {
    const phase = pendingPhaseDelete
    if (!phase) return
    let nextAreas = areas
    if (mode === 'unphase') {
      nextAreas = areas.map(a =>
        a.tempPhaseId === phase.tempId ? { ...a, tempPhaseId: null, group: '' } : a
      )
    } else if (mode === 'delete') {
      nextAreas = areas.filter(a => a.tempPhaseId !== phase.tempId)
      if (nextAreas.length === 0) {
        nextAreas = [{ name: '', weight: '', group: '', scheduledValue: null, tempPhaseId: null }]
      }
    }
    onChange({
      ...data,
      areas: nextAreas,
      phases: phases.filter(p => p.tempId !== phase.tempId)
    })
    setPendingPhaseDelete(null)
  }

  const toggleDetails = (tempId) => {
    setExpandedDetails(prev => ({ ...prev, [tempId]: !prev[tempId] }))
  }

  // ----- Auto-calculate weights ------------------------------------------

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

  // ----- Excel Import ----------------------------------------------------

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

    // Build phases first so each new area can carry a tempPhaseId.
    const importedGroupNames = []
    selectedTasks.forEach(t => {
      const g = (t.group || '').trim()
      if (g && g !== 'General' && !importedGroupNames.includes(g)) importedGroupNames.push(g)
    })
    const newPhases = importedGroupNames.map((name, i) => ({
      tempId: newTempId(),
      name,
      description: '',
      planned_start_date: '',
      planned_end_date: '',
      sort_order: i
    }))
    const phaseByName = new Map(newPhases.map(p => [p.name, p.tempId]))

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
        const tempPhaseId = phaseByName.get((task.group || '').trim()) || null
        return {
          name: task.name,
          weight: weight.toFixed(2),
          group: tempPhaseId ? task.group : '',
          scheduledValue: task.scheduledValue || null,
          tempPhaseId
        }
      })
      onShowToast(`Tasks imported with value-based weights! Total SOV: ${formatter.format(totalSOV)}`, 'success')
    } else {
      const weight = Math.round((100 / selectedTasks.length) * 100) / 100
      newAreas = selectedTasks.map((task, index) => {
        const tempPhaseId = phaseByName.get((task.group || '').trim()) || null
        return {
          name: task.name,
          weight: index === selectedTasks.length - 1
            ? (100 - (weight * (selectedTasks.length - 1))).toFixed(2)
            : weight.toFixed(2),
          group: tempPhaseId ? task.group : '',
          scheduledValue: task.scheduledValue || null,
          tempPhaseId
        }
      })
      onShowToast('Tasks imported with equal weights', 'success')
    }

    onChange({ ...data, areas: newAreas, phases: newPhases })
    setShowImportReview(false)
  }

  // ----- Render: Import Review screen ------------------------------------

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

  // ----- Render: Main wizard step ----------------------------------------

  const orderedPhases = [...phases].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const indexedAreas = areas.map((a, originalIndex) => ({ ...a, originalIndex }))
  const unphasedAreas = indexedAreas.filter(a => !a.tempPhaseId)

  const renderTaskRow = (area) => (
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
      <button className="remove-btn" onClick={() => removeArea(area.originalIndex)} aria-label="Remove task">×</button>
    </div>
  )

  return (
    <div className="wizard-step-content">
      <div className="wizard-step-header">
        <h2>Phases & Tasks</h2>
        <p>Break this project into phases and add tasks under each. Weights must total 100% across all tasks.</p>
      </div>

      <div className="card">
        <div className="areas-header">
          <div>
            <h3>Project Phases</h3>
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

        {orderedPhases.map((phase, i) => {
          const tasksUnder = indexedAreas.filter(a => a.tempPhaseId === phase.tempId)
          const isExpanded = !!expandedDetails[phase.tempId]
          return (
            <div key={phase.tempId} className="area-group phase-block">
              <div className="phase-header-row">
                <div className="phase-header-controls">
                  <button
                    type="button"
                    className="phase-icon-btn"
                    onClick={() => movePhase(i, -1)}
                    disabled={i === 0}
                    aria-label="Move phase up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="phase-icon-btn"
                    onClick={() => movePhase(i, 1)}
                    disabled={i === orderedPhases.length - 1}
                    aria-label="Move phase down"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <input
                  type="text"
                  className="phase-name-input"
                  placeholder={`Phase ${i + 1} name (e.g., Level 1 Demo)`}
                  value={phase.name}
                  onChange={(e) => handlePhaseChange(phase.tempId, 'name', e.target.value)}
                />
                <button
                  type="button"
                  className="phase-icon-btn"
                  onClick={() => toggleDetails(phase.tempId)}
                  aria-label="Edit phase details"
                  title="Edit phase details"
                >
                  <Settings2 size={16} />
                </button>
                <button
                  type="button"
                  className="phase-icon-btn phase-icon-btn-danger"
                  onClick={() => requestDeletePhase(phase)}
                  aria-label="Delete phase"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {isExpanded && (
                <div className="phase-details">
                  <textarea
                    className="phase-description-input"
                    placeholder="Description / scope notes (optional)"
                    rows={2}
                    value={phase.description || ''}
                    onChange={(e) => handlePhaseChange(phase.tempId, 'description', e.target.value)}
                  />
                  <div className="phase-date-row">
                    <label className="phase-date-field">
                      <span>Start</span>
                      <input
                        type="date"
                        value={phase.planned_start_date || ''}
                        onChange={(e) => handlePhaseChange(phase.tempId, 'planned_start_date', e.target.value)}
                      />
                    </label>
                    <label className="phase-date-field">
                      <span>End</span>
                      <input
                        type="date"
                        value={phase.planned_end_date || ''}
                        onChange={(e) => handlePhaseChange(phase.tempId, 'planned_end_date', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}

              {tasksUnder.length > 0 && tasksUnder.map(renderTaskRow)}

              <button
                type="button"
                className="btn btn-secondary btn-small phase-add-task"
                onClick={() => addAreaToPhase(phase)}
              >
                <Plus size={14} /> Add Task
              </button>
            </div>
          )
        })}

        {/* Unphased bucket: shown when there are unphased areas, OR when there
            are no phases yet so the user can still add tasks the old way. */}
        {(unphasedAreas.length > 0 || orderedPhases.length === 0) && (
          <div className="area-group phase-block phase-block-unphased">
            <div className="phase-header-row phase-header-row-unphased">
              <span className="phase-name-static">
                {orderedPhases.length === 0 ? 'Tasks' : 'Unphased'}
              </span>
            </div>
            {unphasedAreas.map(renderTaskRow)}
            <button
              type="button"
              className="btn btn-secondary btn-small phase-add-task"
              onClick={() => addAreaToPhase(null)}
            >
              <Plus size={14} /> Add Task
            </button>
          </div>
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

        <button className="btn btn-secondary phase-add-btn" onClick={addPhase}>
          <Plus size={16} /> Add Phase
        </button>
      </div>

      {pendingPhaseDelete && (
        <div className="phase-delete-modal" role="dialog" aria-modal="true">
          <div className="phase-delete-modal-content">
            <h3>Delete phase &ldquo;{pendingPhaseDelete.name || 'Untitled'}&rdquo;?</h3>
            <p>
              This phase has {areas.filter(a => a.tempPhaseId === pendingPhaseDelete.tempId).length} task
              {areas.filter(a => a.tempPhaseId === pendingPhaseDelete.tempId).length === 1 ? '' : 's'}.
              What should happen to them?
            </p>
            <div className="phase-delete-modal-actions">
              <button className="btn btn-secondary" onClick={() => setPendingPhaseDelete(null)}>
                Cancel
              </button>
              <button className="btn btn-secondary" onClick={() => confirmDeletePhase('unphase')}>
                Move tasks to Unphased
              </button>
              <button className="btn btn-danger" onClick={() => confirmDeletePhase('delete')}>
                Delete tasks too
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
