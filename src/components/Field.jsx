import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { formatCurrency, calculateProgress } from '../lib/utils'

export default function Field({ company, onShowToast }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    loadProjects()
  }, [company])

  useEffect(() => {
    if (selectedProject) {
      loadAreas(selectedProject.id)
    }
  }, [selectedProject])

  const loadProjects = async () => {
    if (!company?.id) {
      setLoading(false)
      return
    }

    try {
      const data = await db.getProjects(company.id)
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
  }

  const handleStatusUpdate = async (areaId, newStatus) => {
    const area = areas.find(a => a.id === areaId)
    if (!area) return

    // Toggle: if clicking same status, go back to not_started
    const finalStatus = area.status === newStatus ? 'not_started' : newStatus

    setUpdating(areaId)
    
    try {
      await db.updateAreaStatus(areaId, finalStatus)
      
      // Update local state
      setAreas(prev => prev.map(a => 
        a.id === areaId ? { ...a, status: finalStatus } : a
      ))
      
      onShowToast('Status updated', 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      onShowToast('Error updating status', 'error')
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading...
      </div>
    )
  }

  // Field Update View
  if (selectedProject) {
    const progress = calculateProgress(areas)

    return (
      <div>
        <button className="btn btn-secondary btn-small" onClick={handleBack} style={{ marginBottom: '1.5rem' }}>
          ← Back
        </button>

        <div className="field-header">
          <div className="field-project-name">{selectedProject.name}</div>
          <div className="field-instruction">Tap to update status</div>
          <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Progress: <strong style={{ color: 'var(--text-primary)' }}>{progress}%</strong>
          </div>
        </div>

        <div className="field-area-list">
          {areas.map(area => (
            <div key={area.id} className="field-area-card">
              <div className="field-area-name">{area.name}</div>
              <div className="field-status-buttons">
                <button
                  className={`field-status-btn working ${area.status === 'working' ? 'active' : ''}`}
                  onClick={() => handleStatusUpdate(area.id, 'working')}
                  disabled={updating === area.id}
                >
                  {updating === area.id ? '...' : 'Working'}
                </button>
                <button
                  className={`field-status-btn done ${area.status === 'done' ? 'active' : ''}`}
                  onClick={() => handleStatusUpdate(area.id, 'done')}
                  disabled={updating === area.id}
                >
                  {updating === area.id ? '...' : 'Done'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Project Selection View
  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏗️</div>
        <h3>No Projects</h3>
        <p>No projects have been created yet</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Select Project</h1>
      <p className="subtitle">Choose a project to update</p>

      <div className="project-list">
        {projects.map(project => (
          <div key={project.id} className="project-card" onClick={() => handleSelectProject(project)}>
            <div className="project-card-name">{project.name}</div>
            <div className="project-card-value" style={{ marginTop: '0.25rem' }}>
              {formatCurrency(project.contract_value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
