import { useState } from 'react'
import { db } from '../lib/supabase'

export default function Setup({ onProjectCreated, onShowToast }) {
  const [projectName, setProjectName] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [areas, setAreas] = useState([
    { name: '', weight: '' },
    { name: '', weight: '' },
    { name: '', weight: '' }
  ])
  const [creating, setCreating] = useState(false)

  const totalWeight = areas.reduce((sum, area) => {
    return sum + (parseFloat(area.weight) || 0)
  }, 0)

  const handleAreaChange = (index, field, value) => {
    setAreas(prev => prev.map((area, i) => 
      i === index ? { ...area, [field]: value } : area
    ))
  }

  const addArea = () => {
    setAreas(prev => [...prev, { name: '', weight: '' }])
  }

  const removeArea = (index) => {
    if (areas.length > 1) {
      setAreas(prev => prev.filter((_, i) => i !== index))
    }
  }

  const resetForm = () => {
    setProjectName('')
    setContractValue('')
    setAreas([
      { name: '', weight: '' },
      { name: '', weight: '' },
      { name: '', weight: '' }
    ])
  }

  const handleSubmit = async () => {
    // Validation
    if (!projectName.trim()) {
      onShowToast('Please enter a project name', 'error')
      return
    }

    const contractVal = parseFloat(contractValue)
    if (!contractVal || contractVal <= 0) {
      onShowToast('Please enter a valid contract value', 'error')
      return
    }

    const validAreas = areas.filter(a => a.name.trim() && parseFloat(a.weight) > 0)
    if (validAreas.length === 0) {
      onShowToast('Please add at least one area', 'error')
      return
    }

    if (totalWeight !== 100) {
      onShowToast('Area weights must total 100%', 'error')
      return
    }

    setCreating(true)

    try {
      // Create project
      const project = await db.createProject({
        name: projectName.trim(),
        contract_value: contractVal
      })

      // Create areas
      for (let i = 0; i < validAreas.length; i++) {
        await db.createArea({
          project_id: project.id,
          name: validAreas[i].name.trim(),
          weight: parseFloat(validAreas[i].weight),
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
      </div>

      <div className="card">
        <h3>Areas</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Define the areas for this project and assign a weight (%) to each. Weights must total 100%.
        </p>

        {areas.map((area, index) => (
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
        ))}

        <div className="weight-total">
          <span className="weight-total-label">Total Weight:</span>
          <span className={`weight-total-value ${totalWeight === 100 ? 'valid' : 'invalid'}`}>
            {totalWeight}%
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
