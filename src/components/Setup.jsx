import { useState, useRef } from 'react'
import { db } from '../lib/supabase'
import * as pdfjsLib from 'pdfjs-dist'

// Disable worker to avoid loading issues
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

export default function Setup({ onProjectCreated, onShowToast }) {
  const [projectName, setProjectName] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [pin, setPin] = useState('')
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
    setContractValue('')
    setPin('')
    setAreas([
      { name: '', weight: '', group: '' },
      { name: '', weight: '', group: '' },
      { name: '', weight: '', group: '' }
    ])
    setShowImportReview(false)
    setImportedTasks([])
  }

  // PDF Import Functions
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let fullText = ''
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => item.str).join(' ')
      fullText += pageText + '\n'
    }
    
    return fullText
  }

  const parseScope = (text) => {
    const tasks = []
    let currentGroup = 'General'
    
    // Debug: log extracted text
    console.log('Extracted PDF text:', text.substring(0, 2000))
    
    // Common level/floor patterns
    const levelPatterns = [
      /Plaza Level/i,
      /Street Level/i,
      /Level\s*\d+/i,
      /\d+(?:st|nd|rd|th)\s*Floor/i,
      /Floor\s*\d+/i,
      /Basement/i,
      /Roof/i,
      /Exterior/i,
      /Miscellaneous/i,
      /^ABATEMENT$/i,
      /^DEMOLITION$/i
    ]
    
    // Task patterns - more flexible matching
    const taskPatterns = [
      // Standard: description + number + unit
      /^(.+?)\s+(\d{1,3}(?:,\d{3})*|\d+)\s*(SF|LF|EA|LS|Days?|Units?)\s*$/i,
      // With hyphen or dash before description
      /^[-–—]\s*(.+?)\s+(\d{1,3}(?:,\d{3})*|\d+)\s*(SF|LF|EA|LS|Days?|Units?)\s*$/i,
      // Number at start (like "1 LS" at end)
      /^(.+?)\s+(\d+)\s*(LS|EA)\s*$/i
    ]
    
    // Split text into lines - handle various line break patterns
    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
    
    console.log('Parsed lines count:', lines.length)
    
    for (let line of lines) {
      if (line.length < 5) continue
      
      // Check for level/section headers
      let isHeader = false
      for (const pattern of levelPatterns) {
        if (pattern.test(line)) {
          // Extract group name - clean up common suffixes
          let groupName = line
            .replace(/\s*\(\d{1,3}(?:,\d{3})*\s*SF\)\s*$/i, '')
            .replace(/\s*\d{1,3}(?:,\d{3})*\s*SF\s*$/i, '')
            .trim()
          
          if (groupName.length >= 3 && groupName.length < 60) {
            currentGroup = groupName
            console.log('Found group:', currentGroup)
            isHeader = true
          }
          break
        }
      }
      
      if (isHeader) continue
      
      // Check for task line
      for (const pattern of taskPatterns) {
        const taskMatch = line.match(pattern)
        if (taskMatch) {
          const description = taskMatch[1].trim()
          
          // Filter out header rows, conditions, exclusions, and non-task items
          const skipPatterns = [
            /^Plan\s/i,
            /^Description/i,
            /^Quantity/i,
            /^Unit$/i,
            /^Page\s/i,
            /Miller/i,
            /www\./i,
            /Phone/i,
            /Fax/i,
            /^\d+\.\s/,  // Numbered conditions like "1. Utility..."
            /^[\$\d,\.]+$/, // Pure numbers/prices
            /Chrysotile/i, // Hazmat material descriptions
            /Anthophyllite/i
          ]
          
          const shouldSkip = skipPatterns.some(p => p.test(description))
          
          if (description.length > 8 && !shouldSkip) {
            tasks.push({
              name: description,
              group: currentGroup,
              selected: true
            })
            console.log('Found task:', description, 'in', currentGroup)
          }
          break
        }
      }
    }
    
    // Deduplicate tasks (same name within same group)
    const seen = new Set()
    const uniqueTasks = tasks.filter(task => {
      const key = `${task.group}:${task.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    
    return uniqueTasks
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.type !== 'application/pdf') {
      onShowToast('Please upload a PDF file', 'error')
      return
    }
    
    setImporting(true)
    
    try {
      const text = await extractTextFromPDF(file)
      const tasks = parseScope(text)
      
      if (tasks.length === 0) {
        onShowToast('Could not find tasks in PDF. Try manual entry.', 'error')
        setImporting(false)
        return
      }
      
      setImportedTasks(tasks)
      setShowImportReview(true)
      onShowToast(`Found ${tasks.length} tasks`, 'success')
    } catch (error) {
      console.error('PDF import error:', error)
      onShowToast('Error reading PDF', 'error')
    } finally {
      setImporting(false)
      // Reset file input
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
        contract_value: contractVal,
        pin: pin
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

        <div className="form-group">
          <label>Contract Value ($)</label>
          <input
            type="number"
            placeholder="e.g., 365000"
            value={contractValue}
            onChange={(e) => setContractValue(e.target.value)}
          />
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
              accept=".pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button 
              className="btn btn-secondary btn-small"
              onClick={handleImportClick}
              disabled={importing}
            >
              {importing ? 'Reading...' : '📄 Import PDF'}
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
