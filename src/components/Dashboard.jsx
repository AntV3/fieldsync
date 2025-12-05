import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { formatCurrency, calculateProgress, getOverallStatus, getOverallStatusLabel, formatStatus } from '../lib/utils'
import TMList from './TMList'

export default function Dashboard({ onShowToast }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    if (selectedProject) {
      loadAreas(selectedProject.id)
      
      // Subscribe to real-time updates
      const subscription = db.subscribeToAreas(selectedProject.id, (payload) => {
        loadAreas(selectedProject.id)
      })

      return () => db.unsubscribe(subscription)
    }
  }, [selectedProject])

  const loadProjects = async () => {
    try {
      const data = await db.getProjects()
      setProjects(data)
    } catch (error) {
      console.error('Error loading projects:', error)
      onShowToast('Error loading projects', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadAreas = async (projectId) => {
    try {
      const data = await db.getAreas(projectId)
      setAreas(data)
    } catch (error) {
      console.error('Error loading areas:', error)
    }
  }

  const handleSelectProject = (project) => {
    setSelectedProject(project)
  }

  const handleBack = () => {
    setSelectedProject(null)
    setAreas([])
    setEditMode(false)
    setEditData(null)
    loadProjects()
  }

  const handleEditClick = () => {
    setEditData({
      name: selectedProject.name,
      contract_value: selectedProject.contract_value,
      pin: selectedProject.pin || '',
      areas: areas.map(a => ({
        id: a.id,
        name: a.name,
        weight: a.weight,
        isNew: false
      }))
    })
    setEditMode(true)
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    setEditData(null)
  }

  const handleEditChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleAreaEditChange = (index, field, value) => {
    setEditData(prev => ({
      ...prev,
      areas: prev.areas.map((area, i) => 
        i === index ? { ...area, [field]: value } : area
      )
    }))
  }

  const handleAddArea = () => {
    setEditData(prev => ({
      ...prev,
      areas: [...prev.areas, { id: null, name: '', weight: '', isNew: true }]
    }))
  }

  const handleRemoveArea = (index) => {
    if (editData.areas.length > 1) {
      setEditData(prev => ({
        ...prev,
        areas: prev.areas.filter((_, i) => i !== index)
      }))
    }
  }

  const handleSaveEdit = async () => {
    // Validation
    if (!editData.name.trim()) {
      onShowToast('Please enter a project name', 'error')
      return
    }

    const contractVal = parseFloat(editData.contract_value)
    if (!contractVal || contractVal <= 0) {
      onShowToast('Please enter a valid contract value', 'error')
      return
    }

    if (editData.pin && editData.pin.length !== 4) {
      onShowToast('PIN must be 4 digits', 'error')
      return
    }

    // Check PIN availability if changed
    if (editData.pin && editData.pin !== selectedProject.pin) {
      const pinAvailable = await db.isPinAvailable(editData.pin, selectedProject.id)
      if (!pinAvailable) {
        onShowToast('This PIN is already in use', 'error')
        return
      }
    }

    const validAreas = editData.areas.filter(a => a.name.trim() && parseFloat(a.weight) > 0)
    if (validAreas.length === 0) {
      onShowToast('Please add at least one area', 'error')
      return
    }

    const totalWeight = validAreas.reduce((sum, a) => sum + parseFloat(a.weight), 0)
    if (totalWeight !== 100) {
      onShowToast('Area weights must total 100%', 'error')
      return
    }

    setSaving(true)

    try {
      // Update project
      await db.updateProject(selectedProject.id, {
        name: editData.name.trim(),
        contract_value: contractVal,
        pin: editData.pin || null
      })

      // Handle areas
      const existingAreaIds = areas.map(a => a.id)
      const editAreaIds = editData.areas.filter(a => a.id).map(a => a.id)

      // Delete removed areas
      for (const areaId of existingAreaIds) {
        if (!editAreaIds.includes(areaId)) {
          await db.deleteArea(areaId)
        }
      }

      // Update or create areas
      for (let i = 0; i < validAreas.length; i++) {
        const area = validAreas[i]
        if (area.id) {
          // Update existing
          await db.updateArea(area.id, {
            name: area.name.trim(),
            weight: parseFloat(area.weight),
            sort_order: i
          })
        } else {
          // Create new
          await db.createArea({
            project_id: selectedProject.id,
            name: area.name.trim(),
            weight: parseFloat(area.weight),
            status: 'not_started',
            sort_order: i
          })
        }
      }

      // Reload data
      const updatedProject = await db.getProject(selectedProject.id)
      setSelectedProject(updatedProject)
      await loadAreas(selectedProject.id)
      
      setEditMode(false)
      setEditData(null)
      onShowToast('Project updated!', 'success')
    } catch (error) {
      console.error('Error saving project:', error)
      onShowToast('Error saving changes', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return
    }

    try {
      await db.deleteProject(selectedProject.id)
      onShowToast('Project deleted', 'success')
      handleBack()
    } catch (error) {
      console.error('Error deleting project:', error)
      onShowToast('Error deleting project', 'error')
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading projects...
      </div>
    )
  }

  // Project Detail View
  if (selectedProject) {
    const progress = calculateProgress(areas)
    const billable = (progress / 100) * selectedProject.contract_value

    // Edit Mode
    if (editMode && editData) {
      const totalWeight = editData.areas.reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)

      return (
        <div>
          <button className="btn btn-secondary btn-small" onClick={handleCancelEdit} style={{ marginBottom: '1.5rem' }}>
            ← Cancel
          </button>

          <h1>Edit Project</h1>
          <p className="subtitle">Update project details</p>

          <div className="card">
            <div className="form-group">
              <label>Project Name</label>
              <input
                type="text"
                value={editData.name}
                onChange={(e) => handleEditChange('name', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Contract Value ($)</label>
              <input
                type="number"
                value={editData.contract_value}
                onChange={(e) => handleEditChange('contract_value', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Foreman PIN (4 digits)</label>
              <input
                type="text"
                value={editData.pin}
                onChange={(e) => handleEditChange('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g., 2847"
                maxLength={4}
              />
            </div>
          </div>

          <div className="card">
            <h3>Areas</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Weights must total 100%.
            </p>

            {editData.areas.map((area, index) => (
              <div key={index} className="area-row">
                <input
                  type="text"
                  placeholder="Area name"
                  value={area.name}
                  onChange={(e) => handleAreaEditChange(index, 'name', e.target.value)}
                />
                <input
                  type="number"
                  placeholder="%"
                  value={area.weight}
                  onChange={(e) => handleAreaEditChange(index, 'weight', e.target.value)}
                />
                <button className="remove-btn" onClick={() => handleRemoveArea(index)}>
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

            <button className="btn btn-secondary" onClick={handleAddArea}>
              + Add Area
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSaveEdit}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          <button 
            className="btn btn-danger btn-full" 
            onClick={handleDeleteProject}
          >
            Delete Project
          </button>
        </div>
      )
    }

    // View Mode
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-small" onClick={handleBack}>
            ← Back to Projects
          </button>
          <button className="btn btn-secondary btn-small" onClick={handleEditClick}>
            Edit
          </button>
        </div>

        <h1>{selectedProject.name}</h1>
        <p className="subtitle">
          Contract: {formatCurrency(selectedProject.contract_value)}
          {selectedProject.pin && <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>PIN: {selectedProject.pin}</span>}
        </p>

        <div className="card billing-card">
          <h3>Billable to Date</h3>
          <div className="billing-amount">{formatCurrency(billable)}</div>
          <div className="billing-total">of {formatCurrency(selectedProject.contract_value)} contract value</div>

          <div className="progress-container">
            <div className="progress-header">
              <span className="progress-label">Overall Progress</span>
              <span className="progress-value">{progress}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Areas</h3>
          <div className="area-status-list">
            {areas.map(area => (
              <div key={area.id} className="area-status-item">
                <div>
                  <div className="area-name">{area.name}</div>
                  <div className="area-weight">{area.weight}% of contract</div>
                </div>
                <span className={`status-badge ${area.status}`}>
                  {formatStatus(area.status)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* T&M Tickets Section */}
        <TMList project={selectedProject} onShowToast={onShowToast} />
      </div>
    )
  }

  // Project List View
  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <h3>No Projects Yet</h3>
        <p>Create your first project to get started</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Projects</h1>
      <p className="subtitle">Select a project to view details</p>

      <div className="project-list">
        {projects.map(project => (
          <ProjectCard 
            key={project.id} 
            project={project} 
            onClick={() => handleSelectProject(project)} 
          />
        ))}
      </div>
    </div>
  )
}

function ProjectCard({ project, onClick }) {
  const [areas, setAreas] = useState([])

  useEffect(() => {
    db.getAreas(project.id).then(setAreas)
  }, [project.id])

  const progress = calculateProgress(areas)
  const status = getOverallStatus(areas)
  const statusLabel = getOverallStatusLabel(areas)

  return (
    <div className="project-card" onClick={onClick}>
      <div className="project-card-header">
        <div>
          <div className="project-card-name">{project.name}</div>
          <div className="project-card-value">{formatCurrency(project.contract_value)}</div>
        </div>
        <span className={`status-badge ${status}`}>{statusLabel}</span>
      </div>
      <div className="project-card-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Progress</span>
          <span style={{ fontWeight: 600 }}>{progress}%</span>
        </div>
        <div className="mini-progress-bar">
          <div className="mini-progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
      </div>
    </div>
  )
}

