import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import ContractValueDashboard from './ContractValueDashboard'

/**
 * Contracts View - Shows project selector and Contract Value Dashboard
 */
export default function Contracts({ onShowToast }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const data = await db.getProjects()
      setProjects(data)

      // Auto-select first project if only one exists
      if (data.length === 1) {
        setSelectedProject(data[0])
      }
    } catch (error) {
      console.error('Error loading projects:', error)
      onShowToast?.('Error loading projects', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectProject = (project) => {
    setSelectedProject(project)
  }

  const handleBack = () => {
    setSelectedProject(null)
    loadProjects()
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    )
  }

  // Show project selector if no project selected
  if (!selectedProject) {
    return (
      <div className="projects-container">
        <div className="page-header">
          <h1>Contract Value & Pay Applications</h1>
          <p className="text-muted">Select a project to view Schedule of Values and generate pay applications</p>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No Projects Found</h3>
            <p>Create a project in the Setup tab to get started.</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map(project => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => handleSelectProject(project)}
              >
                <div className="project-card-header">
                  <h3>{project.name}</h3>
                </div>
                <div className="project-card-body">
                  <div className="project-stat">
                    <span className="project-stat-label">Contract Value</span>
                    <span className="project-stat-value">
                      ${project.contract_value?.toLocaleString() || '0'}
                    </span>
                  </div>
                  <div className="project-stat">
                    <span className="project-stat-label">Status</span>
                    <span className={`status-badge status-${project.status || 'active'}`}>
                      {project.status || 'Active'}
                    </span>
                  </div>
                </div>
                <div className="project-card-footer">
                  <button className="btn btn-primary btn-block">
                    View Contract Value →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Show Contract Value Dashboard for selected project
  return (
    <div>
      <div className="page-header">
        <button
          className="btn btn-secondary"
          onClick={handleBack}
        >
          ← Back to Projects
        </button>
        <h1>{selectedProject.name}</h1>
      </div>

      <ContractValueDashboard project={selectedProject} />
    </div>
  )
}
