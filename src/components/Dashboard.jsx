import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { formatCurrency, calculateProgress, getOverallStatus, getOverallStatusLabel, formatStatus } from '../lib/utils'
import TMList from './TMList'
import ShareModal from './ShareModal'
import InjuryReportsList from './InjuryReportsList'
import NotificationSettings from './NotificationSettings'
import MaterialRequestsList from './MaterialRequestsList'
import DailyReportsList from './DailyReportsList'
import ProjectMessages from './ProjectMessages'
import ManDayCosts from './ManDayCosts'

export default function Dashboard({ company, onShowToast, navigateToProjectId, onProjectNavigated }) {
  const [projects, setProjects] = useState([])
  const [projectsData, setProjectsData] = useState([]) // Enhanced data with areas/tickets
  const [selectedProject, setSelectedProject] = useState(null)
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)

  useEffect(() => {
    if (company?.id) {
      loadProjects()
    }
  }, [company?.id])

  // Handle navigation from notifications
  useEffect(() => {
    if (navigateToProjectId && projects.length > 0) {
      const project = projects.find(p => p.id === navigateToProjectId)
      if (project) {
        setSelectedProject(project)
        onProjectNavigated?.() // Clear the navigation request
      }
    }
  }, [navigateToProjectId, projects])

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
      // Filter projects by current company
      const data = await db.getProjects(company?.id)
      setProjects(data)

      // Load enhanced data for executive summary
      const enhanced = await Promise.all(data.map(async (project) => {
        const projectAreas = await db.getAreas(project.id)
        const tickets = await db.getTMTickets(project.id)
        const progress = calculateProgress(projectAreas)
        const billable = (progress / 100) * project.contract_value
        const pendingTickets = tickets.filter(t => t.status === 'pending').length

        return {
          ...project,
          areas: projectAreas,
          progress,
          billable,
          totalTickets: tickets.length,
          pendingTickets,
          approvedTickets: tickets.filter(t => t.status === 'approved').length
        }
      }))
      setProjectsData(enhanced)
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
      <div className="project-detail-view">
        {/* Compact Header */}
        <div className="project-header-compact">
          <div className="project-header-left">
            <button className="back-btn-inline" onClick={handleBack}>←</button>
            <div className="project-title-group">
              <h1>{selectedProject.name}</h1>
              <div className="project-tags-inline">
                {selectedProject.job_number && <span className="tag">#{selectedProject.job_number}</span>}
                {selectedProject.pin && <span className="tag">PIN: {selectedProject.pin}</span>}
                {selectedProject.work_type && <span className="tag">{selectedProject.work_type}</span>}
              </div>
            </div>
          </div>
          <div className="project-header-actions">
            <button className="btn btn-primary btn-small" onClick={() => setShowShareModal(true)}>Share</button>
            <button className="btn btn-secondary btn-small" onClick={() => setShowNotificationSettings(true)}>Alerts</button>
            <button className="btn btn-secondary btn-small" onClick={handleEditClick}>Edit</button>
          </div>
        </div>

        {/* Metrics Bar - Single Row */}
        <div className="metrics-bar">
          <div className="metric-inline">
            <span className="metric-val">{formatCurrency(selectedProject.contract_value)}</span>
            <span className="metric-lbl">Contract</span>
          </div>
          <div className="metric-inline accent">
            <span className="metric-val">{formatCurrency(billable)}</span>
            <span className="metric-lbl">Billable</span>
          </div>
          <div className="metric-inline">
            <span className="metric-val">{formatCurrency(selectedProject.contract_value - billable)}</span>
            <span className="metric-lbl">Remaining</span>
          </div>
          <div className="metric-inline progress-metric">
            <span className="metric-val">{progress}%</span>
            <div className="progress-bar-inline">
              <div className="progress-fill-inline" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="project-two-col">
          {/* Left Column - Main Content */}
          <div className="project-col-main">
            {/* Areas - Inline */}
            <div className="section-compact">
              <div className="section-header-inline">
                <h3>Areas</h3>
                <span className="section-count">{areas.filter(a => a.status === 'done').length}/{areas.length} complete</span>
              </div>
              <div className="areas-inline-grid">
                {areas.map(area => (
                  <div key={area.id} className={`area-chip ${area.status}`}>
                    <span className="area-chip-status">
                      {area.status === 'done' ? '✓' : area.status === 'working' ? '◐' : '○'}
                    </span>
                    <span className="area-chip-name">{area.name}</span>
                    <span className="area-chip-weight">{area.weight}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Man Day Costs */}
            <ManDayCosts project={selectedProject} company={company} onShowToast={onShowToast} />

            {/* T&M Tickets */}
            <TMList project={selectedProject} company={company} onShowToast={onShowToast} />

            {/* Daily Reports */}
            <DailyReportsList project={selectedProject} company={company} onShowToast={onShowToast} />
          </div>

          {/* Right Column - Messages */}
          <div className="project-col-side">
            <ProjectMessages
              project={selectedProject}
              company={company}
              userName={company?.name || 'Office'}
              onShowToast={onShowToast}
            />
          </div>
        </div>

        {/* Bottom Section - Less Frequent */}
        <div className="project-bottom-section">
          <div className="bottom-section-grid">
            <MaterialRequestsList project={selectedProject} company={company} onShowToast={onShowToast} />
            <InjuryReportsList
              project={selectedProject}
              companyId={company?.id || selectedProject?.company_id}
              company={company}
              onShowToast={onShowToast}
            />
          </div>
        </div>

        {/* Share Modal */}
        {showShareModal && (
          <ShareModal
            project={selectedProject}
            onClose={() => setShowShareModal(false)}
            onShareCreated={(share) => {
              onShowToast('Share link created successfully!', 'success')
            }}
          />
        )}

        {/* Notification Settings Modal */}
        {showNotificationSettings && (
          <div className="notification-settings-modal">
            <NotificationSettings
              project={selectedProject}
              company={company}
              onShowToast={onShowToast}
              onClose={() => setShowNotificationSettings(false)}
            />
          </div>
        )}
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

  // Calculate executive summary stats
  const totalContractValue = projectsData.reduce((sum, p) => sum + (p.contract_value || 0), 0)
  const totalBillable = projectsData.reduce((sum, p) => sum + (p.billable || 0), 0)
  const totalPendingTickets = projectsData.reduce((sum, p) => sum + (p.pendingTickets || 0), 0)
  const avgProgress = projectsData.length > 0
    ? Math.round(projectsData.reduce((sum, p) => sum + (p.progress || 0), 0) / projectsData.length)
    : 0
  const projectsAtRisk = projectsData.filter(p => p.billable > p.contract_value * 0.9 && p.progress < 90).length

  return (
    <div>
      {/* Executive Summary - Compact Single Row */}
      <div className="executive-summary">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-value">{projects.length}</div>
            <div className="summary-label">Projects</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{formatCurrency(totalContractValue)}</div>
            <div className="summary-label">Contract Value</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{formatCurrency(totalBillable)}</div>
            <div className="summary-label">Billable</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{avgProgress}%</div>
            <div className="summary-label">Avg Progress</div>
          </div>
        </div>

        {/* Alerts Row - Only show if there are alerts */}
        {(totalPendingTickets > 0 || projectsAtRisk > 0) && (
          <div className="summary-alerts">
            {totalPendingTickets > 0 && (
              <div className="alert-badge pending">
                {totalPendingTickets} T&M Pending
              </div>
            )}
            {projectsAtRisk > 0 && (
              <div className="alert-badge warning">
                {projectsAtRisk} At Risk
              </div>
            )}
          </div>
        )}
      </div>

      {/* Projects Header */}
      <div className="dashboard-header">
        <h2>Projects</h2>
        <span className="project-count">{projects.length} active</span>
      </div>

      {/* Project Grid */}
      <div className="project-list">
        {projectsData.map(project => (
          <EnhancedProjectCard
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

// Enhanced Project Card with more details
function EnhancedProjectCard({ project, onClick }) {
  const status = getOverallStatus(project.areas || [])
  const statusLabel = getOverallStatusLabel(project.areas || [])
  const profit = project.contract_value - project.billable
  const isAtRisk = project.billable > project.contract_value * 0.9 && project.progress < 90

  return (
    <div className={`project-card enhanced ${isAtRisk ? 'at-risk' : ''}`} onClick={onClick}>
      <div className="project-card-header">
        <div>
          <div className="project-card-name">{project.name}</div>
          <div className="project-card-value">{formatCurrency(project.contract_value)}</div>
        </div>
        <span className={`status-badge ${status}`}>{statusLabel}</span>
      </div>

      {/* Stats Row */}
      <div className="project-stats-row">
        <div className="project-stat">
          <span className="stat-value">{project.progress}%</span>
          <span className="stat-label">Complete</span>
        </div>
        <div className="project-stat">
          <span className="stat-value">{formatCurrency(project.billable)}</span>
          <span className="stat-label">Billable</span>
        </div>
        <div className="project-stat">
          <span className={`stat-value ${profit < 0 ? 'negative' : ''}`}>
            {formatCurrency(Math.abs(profit))}
          </span>
          <span className="stat-label">{profit >= 0 ? 'Remaining' : 'Over Budget'}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mini-progress-bar">
        <div className="mini-progress-fill" style={{ width: `${project.progress}%` }}></div>
      </div>

      {/* Badges Row */}
      {(project.pendingTickets > 0 || project.totalTickets > 0) && (
        <div className="project-badges">
          {project.pendingTickets > 0 && (
            <span className="badge pending">{project.pendingTickets} Pending T&M</span>
          )}
          {project.approvedTickets > 0 && (
            <span className="badge approved">{project.approvedTickets} Approved T&M</span>
          )}
        </div>
      )}
    </div>
  )
}


