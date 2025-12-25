import { useState, useRef } from 'react'
import { db } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function Setup({ company, onProjectCreated, onShowToast }) {
  const [projectName, setProjectName] = useState('')
  const [jobNumber, setJobNumber] = useState('')
  const [address, setAddress] = useState('')
  const [generalContractor, setGeneralContractor] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [pin, setPin] = useState('')
  const [workType, setWorkType] = useState('demolition')
  const [jobType, setJobType] = useState('standard')
  const [areas, setAreas] = useState([
    { name: '', weight: '', group: '' },
    { name: '', weight: '', group: '' },
    { name: '', weight: '', group: '' }
  ])
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showImportReview, setShowImportReview] = useState(false)
  const [importedTasks, setImportedTasks] = useState([])
  const fileInputRef = useRef(null)

  const totalWeight = areas.reduce((sum, area) => {
    return sum + (parseFloat(area.weight) || 0)
  }, 0)

  const handlePinChange = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4)
    setPin(cleaned)
  }

  const generateRandomPin = () => {
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString()
    setPin(randomPin)
  }

  const handleAreaChange = (index, field, value) => {
    setAreas(prev => prev.map((area, i) => 
      i === index ? { ...area, [field]: value } : area
    ))
  }

  const addArea = () => {
    setAreas(prev => [...prev, { name: '', weight: '', group: '' }])
  }

  const removeArea = (index) => {
    if (areas.length > 1) {
      setAreas(prev => prev.filter((_, i) => i !== index))
    }
  }

  const resetForm = () => {
    setProjectName('')
    setJobNumber('')
    setAddress('')
    setGeneralContractor('')
    setContractValue('')
    setPin('')
    setWorkType('demolition')
    setJobType('standard')
    setAreas([
      { name: '', weight: '', group: '' },
      { name: '', weight: '', group: '' },
      { name: '', weight: '', group: '' }
    ])
    setShowImportReview(false)
    setImportedTasks([])
  }

  // Excel Import Functions
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const parseExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })

          // Get first sheet
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]

          // Convert to array of arrays
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

          const tasks = []
          let currentGroup = 'General'

          // Patterns for SOV and bid sheet parsing
          const dollarPattern = /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/
          const itemNumberPattern = /^(\d+\.?\d*|[A-Z]\.?\d*)$/i
          const unitPattern = /^(SF|LF|EA|LS|Days?|MD|Load|CY|SY|GAL|TON)$/i
          const quantityPattern = /^\d{1,3}(,\d{3})*$|^\d+$/

          // Header patterns to skip
          const headerPattern = /^(Item|#|No\.?|Description|Scheduled|Value|Amount|Quantity|Unit|Total|Application|Balance|Completed|Stored|Retainage)/i

          for (const row of rows) {
            if (!row || row.length === 0) continue

            // Flatten row: remove nulls and join non-empty cells
            const cells = row
              .map(cell => cell === null || cell === undefined ? '' : String(cell).trim())
              .filter(cell => cell.length > 0)

            if (cells.length === 0) continue

            const rowText = cells.join(' ')

            // Skip header rows
            if (headerPattern.test(cells[0]) || (cells.length > 1 && headerPattern.test(cells[1]))) {
              continue
            }

            // Skip total/subtotal rows
            if (/^(Total|Subtotal|Grand Total|Base Bid|Contract Sum)/i.test(rowText)) {
              continue
            }

            // Check if this is a group header
            // Group headers: single text, no dollar amounts, matches area patterns
            const hasDollarAmount = cells.some(c => dollarPattern.test(c.replace(/[$,]/g, '') + (c.includes('.') ? '' : '.00')))
            const isGroupHeader =
              !hasDollarAmount &&
              cells.length <= 3 &&
              /^(L\d|Level|Floor|\d+(?:st|nd|rd|th)|Plaza|Street|Basement|Roof|Penthouse|Site|Exterior|Interior|Misc|MEP|ABATEMENT|DEMOLITION|UNIVERSAL|SOFT|TRASH|DEMO|Phase|Division|Section|Area|Building|Wing)/i.test(cells[0]) ||
              // Also check for SOV parent items (just number + description, no dollar on same line that looks like a header)
              (cells.length === 2 && itemNumberPattern.test(cells[0]) && !hasDollarAmount && !/^\d+\.\d+$/.test(cells[0]))

            if (isGroupHeader && !hasDollarAmount) {
              // Extract group name, removing any item number prefix
              let groupName = cells.find(c => !itemNumberPattern.test(c) && c.length > 1) || cells.join(' ')
              currentGroup = groupName
                .replace(/\s*\(\d{1,3}(?:,\d{3})*\s*SF\)\s*$/i, '')
                .replace(/\s*[-:]\s*$/, '')
                .trim()
              continue
            }

            // Try to extract task from row
            let description = ''
            let hasValue = false
            let itemNumber = ''

            const descParts = []

            for (let i = 0; i < cells.length; i++) {
              const cell = cells[i]

              // Check for item number in first cell
              if (i === 0 && itemNumberPattern.test(cell)) {
                itemNumber = cell
                continue
              }

              // Skip ID codes (like "ID-111")
              if (/^ID-\d+$/i.test(cell)) continue
              if (/^KN\s*\d+$/i.test(cell)) continue

              // Check for dollar amounts (SOV scheduled values)
              if (dollarPattern.test(cell.replace(/[$,]/g, '') + (cell.includes('.') ? '' : '.00')) || /^\$/.test(cell)) {
                hasValue = true
                continue
              }

              // Skip quantities and units
              if (quantityPattern.test(cell.replace(/,/g, ''))) {
                hasValue = true
                continue
              }
              if (unitPattern.test(cell)) continue

              // Skip percentage values
              if (/^\d+\.?\d*%$/.test(cell)) continue

              // This is description text
              if (cell.length > 1 && !itemNumberPattern.test(cell)) {
                descParts.push(cell)
              }
            }

            description = descParts.join(' ').trim()

            // Clean up description
            description = description
              .replace(/\s+/g, ' ')
              .replace(/^[-•]\s*/, '') // Remove bullet points
              .trim()

            // Skip if no valid description or too short
            if (description.length < 3) continue
            if (/^(Plan|Page|Total|Base Bid|Payment|Condition|Exclusion|Subtotal)/i.test(description)) continue

            // Add task if we found a value/quantity (indicates it's a real line item)
            if (hasValue && description.length >= 3) {
              tasks.push({
                name: description,
                group: currentGroup,
                itemNumber: itemNumber,
                selected: true
              })
            }
          }

          // Deduplicate
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
    
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv'
    ]
    
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
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
    
    // Calculate even weight
    const weight = Math.round((100 / selectedTasks.length) * 100) / 100
    
    // Adjust last item to make total exactly 100
    const newAreas = selectedTasks.map((task, index) => ({
      name: task.name,
      weight: index === selectedTasks.length - 1 
        ? (100 - (weight * (selectedTasks.length - 1))).toFixed(2)
        : weight.toFixed(2),
      group: task.group
    }))
    
    setAreas(newAreas)
    setShowImportReview(false)
    onShowToast('Tasks imported!', 'success')
  }

  const handleSubmit = async () => {
    if (!projectName.trim()) {
      onShowToast('Please enter a project name', 'error')
      return
    }

    const contractVal = parseFloat(contractValue)
    if (!contractVal || contractVal <= 0) {
      onShowToast('Please enter a valid contract value', 'error')
      return
    }

    if (pin.length !== 4) {
      onShowToast('Please enter a 4-digit PIN', 'error')
      return
    }

    const pinAvailable = await db.isPinAvailable(pin)
    if (!pinAvailable) {
      onShowToast('This PIN is already in use. Try another.', 'error')
      return
    }

    const validAreas = areas.filter(a => a.name.trim() && parseFloat(a.weight) > 0)
    if (validAreas.length === 0) {
      onShowToast('Please add at least one area', 'error')
      return
    }

    if (Math.abs(totalWeight - 100) > 0.1) {
      onShowToast('Area weights must total 100%', 'error')
      return
    }

    setCreating(true)

    try {
      const project = await db.createProject({
        name: projectName.trim(),
        job_number: jobNumber.trim() || null,
        address: address.trim() || null,
        general_contractor: generalContractor.trim() || null,
        contract_value: contractVal,
        pin: pin,
        work_type: workType,
        job_type: jobType,
        company_id: company?.id
      })

      for (let i = 0; i < validAreas.length; i++) {
        await db.createArea({
          project_id: project.id,
          name: validAreas[i].name.trim(),
          weight: parseFloat(validAreas[i].weight),
          group_name: validAreas[i].group || null,
          status: 'not_started',
          sort_order: i
        })
      }

      onShowToast('Project created!', 'success')
      resetForm()
      onProjectCreated()
    } catch (error) {
      console.error('Error creating project:', error)
      onShowToast('Error creating project', 'error')
    } finally {
      setCreating(false)
    }
  }

  // Import Review Screen
  if (showImportReview) {
    const groups = [...new Set(importedTasks.map(t => t.group))]
    const selectedCount = importedTasks.filter(t => t.selected).length
    
    return (
      <div>
        <h1>Review Imported Tasks</h1>
        <p className="subtitle">Select the tasks to include in your project</p>
        
        <div className="import-summary">
          <span>{selectedCount} of {importedTasks.length} tasks selected</span>
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
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
        
        <div className="import-actions">
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowImportReview(false)}
          >
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleUseImportedTasks}
          >
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
    <div>
      <h1>New Project</h1>
      <p className="subtitle">Set up a new project to track</p>

      <div className="card">
        <div className="form-group">
          <label>Project Name</label>
          <input
            type="text"
            placeholder="e.g., Sunrise Apartments"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label>Job Number</label>
            <input
              type="text"
              placeholder="e.g., 4032"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Contract Value ($)</label>
            <input
              type="number"
              placeholder="e.g., 365000"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Project Address</label>
          <input
            type="text"
            placeholder="e.g., 123 Main St, Los Angeles, CA 90001"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>General Contractor</label>
          <input
            type="text"
            placeholder="e.g., ABC Construction Inc."
            value={generalContractor}
            onChange={(e) => setGeneralContractor(e.target.value)}
          />
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label>Work Type</label>
            <div className="project-type-toggle">
              <button
                type="button"
                className={`toggle-btn ${workType === 'demolition' ? 'active' : ''}`}
                onClick={() => setWorkType('demolition')}
              >
                Demolition
              </button>
              <button
                type="button"
                className={`toggle-btn ${workType === 'abatement' ? 'active' : ''}`}
                onClick={() => setWorkType('abatement')}
              >
                Abatement
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Job Type</label>
            <div className="project-type-toggle">
              <button
                type="button"
                className={`toggle-btn ${jobType === 'standard' ? 'active' : ''}`}
                onClick={() => setJobType('standard')}
              >
                Standard
              </button>
              <button
                type="button"
                className={`toggle-btn ${jobType === 'pla' ? 'active' : ''}`}
                onClick={() => setJobType('pla')}
              >
                PLA
              </button>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Foreman PIN (4 digits)</label>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Foremen will enter this PIN to access this project
          </p>
          <div className="pin-input-row">
            <input
              type="text"
              placeholder="e.g., 2847"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              maxLength={4}
              className="pin-input"
            />
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={generateRandomPin}
            >
              Generate
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="areas-header">
          <div>
            <h3>Areas / Tasks</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Define the areas for this project. Weights must total 100%.
            </p>
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
              {importing ? 'Reading...' : '📊 Import Excel'}
            </button>
          </div>
        </div>

        {hasGroups ? (
          // Grouped display
          Object.entries(groupedAreas).map(([group, groupAreas]) => (
            <div key={group} className="area-group">
              <div className="area-group-header">{group}</div>
              {groupAreas.map(area => (
                <div key={area.originalIndex} className="area-row">
                  <input
                    type="text"
                    placeholder="Task name"
                    value={area.name}
                    onChange={(e) => handleAreaChange(area.originalIndex, 'name', e.target.value)}
                  />
                  <input
                    type="number"
                    placeholder="%"
                    min="0"
                    max="100"
                    value={area.weight}
                    onChange={(e) => handleAreaChange(area.originalIndex, 'weight', e.target.value)}
                  />
                  <button className="remove-btn" onClick={() => removeArea(area.originalIndex)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))
        ) : (
          // Flat display
          areas.map((area, index) => (
            <div key={index} className="area-row">
              <input
                type="text"
                placeholder="Area name (e.g., Level 1)"
                value={area.name}
                onChange={(e) => handleAreaChange(index, 'name', e.target.value)}
              />
              <input
                type="number"
                placeholder="%"
                min="0"
                max="100"
                value={area.weight}
                onChange={(e) => handleAreaChange(index, 'weight', e.target.value)}
              />
              <button className="remove-btn" onClick={() => removeArea(index)}>
                ×
              </button>
            </div>
          ))
        )}

        <div className="weight-total">
          <span className="weight-total-label">Total Weight:</span>
          <span className={`weight-total-value ${Math.abs(totalWeight - 100) < 0.1 ? 'valid' : 'invalid'}`}>
            {totalWeight.toFixed(1)}%
          </span>
        </div>

        <button className="btn btn-secondary" onClick={addArea}>
          + Add Area
        </button>
      </div>

      <button 
        className="btn btn-primary btn-full" 
        onClick={handleSubmit}
        disabled={creating}
      >
        {creating ? 'Creating...' : 'Create Project'}
      </button>
    </div>
  )
}

