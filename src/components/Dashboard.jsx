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
  const [activeProjectTab, setActiveProjectTab] = useState('overview')

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
        const changeOrderData = await db.getChangeOrderTotals(project.id)
        const progress = calculateProgress(projectAreas)

        // Calculate revised contract value (original + change orders)
        const changeOrderValue = changeOrderData?.totalApprovedValue || 0
        const revisedContractValue = project.contract_value + changeOrderValue
        const billable = (progress / 100) * revisedContractValue
        const pendingTickets = tickets.filter(t => t.status === 'pending').length

        return {
          ...project,
          areas: projectAreas,
          progress,
          billable,
          changeOrderValue,
          revisedContractValue,
          changeOrderPending: changeOrderData?.pendingCount || 0,
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
    setActiveProjectTab('overview')
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

    // Get change order data from enhanced project data
    const projectData = projectsData.find(p => p.id === selectedProject.id)
    const changeOrderValue = projectData?.changeOrderValue || 0
    const revisedContractValue = selectedProject.contract_value + changeOrderValue
    const billable = (progress / 100) * revisedContractValue

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

    // View Mode - Calculate additional metrics for context
    const areasComplete = areas.filter(a => a.status === 'done').length
    const areasWorking = areas.filter(a => a.status === 'working').length
    const areasNotStarted = areas.filter(a => a.status === 'not_started').length
    const percentBilled = revisedContractValue > 0
      ? Math.round((billable / revisedContractValue) * 100)
      : 0
    const hasChangeOrders = changeOrderValue > 0

    // Tab definitions
    const tabs = [
      { id: 'overview', label: 'Overview', icon: '◉' },
      { id: 'financials', label: 'Financials', icon: '$' },
      { id: 'reports', label: 'Reports', icon: '📋' },
      { id: 'activity', label: 'Activity', icon: '💬' }
    ]

    return (
      <div className="project-view tabbed">
        {/* Sticky Header */}
        <div className="pv-sticky-header">
          {/* Top Row - Back + Actions */}
          <div className="pv-header-row">
            <button className="pv-back" onClick={handleBack}>
              <span>←</span>
              <span>Back</span>
            </button>
            <div className="pv-actions">
              <button className="pv-action" onClick={() => setShowShareModal(true)}>Share</button>
              <button className="pv-action" onClick={() => setShowNotificationSettings(true)}>Alerts</button>
              <button className="pv-action" onClick={handleEditClick}>Edit</button>
            </div>
          </div>

          {/* Project Title */}
          <div className="pv-header-title">
            <h1>{selectedProject.name}</h1>
            {(selectedProject.job_number || selectedProject.work_type) && (
              <span className="pv-header-meta">
                {selectedProject.job_number && `Job #${selectedProject.job_number}`}
                {selectedProject.job_number && selectedProject.work_type && ' • '}
                {selectedProject.work_type}
              </span>
            )}
          </div>

          {/* Key Metrics Bar */}
          <div className="pv-metrics-bar">
            <div className="pv-metric">
              <span className="pv-metric-value">{progress}%</span>
              <span className="pv-metric-label">Complete</span>
            </div>
            <div className="pv-metric-divider"></div>
            <div className="pv-metric">
              <span className="pv-metric-value">{formatCurrency(billable)}</span>
              <span className="pv-metric-label">Billed</span>
            </div>
            <div className="pv-metric-divider"></div>
            <div className="pv-metric">
              <span className="pv-metric-value highlight">{formatCurrency(revisedContractValue - billable)}</span>
              <span className="pv-metric-label">Remaining</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="pv-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`pv-tab ${activeProjectTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveProjectTab(tab.id)}
              >
                <span className="pv-tab-icon">{tab.icon}</span>
                <span className="pv-tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="pv-tab-content">
          {/* OVERVIEW TAB */}
          {activeProjectTab === 'overview' && (
            <div className="pv-tab-panel">
              {/* Progress Card */}
              <div className="pv-card">
                <h3>Project Progress</h3>
                <div className="pv-progress-large">
                  <div className="pv-progress-track">
                    <div className="pv-progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="pv-progress-stats">
                    <span className="pv-progress-percent-lg">{progress}%</span>
                    <span className="pv-progress-label">Complete</span>
                  </div>
                </div>
              </div>

              {/* Areas Grid */}
              <div className="pv-card">
                <div className="pv-card-header">
                  <h3>Areas</h3>
                  <div className="pv-area-counts">
                    <span className="pv-count done">{areasComplete} done</span>
                    {areasWorking > 0 && <span className="pv-count working">{areasWorking} active</span>}
                    {areasNotStarted > 0 && <span className="pv-count pending">{areasNotStarted} pending</span>}
                  </div>
                </div>
                <div className="pv-areas-grid">
                  {areas.map(area => (
                    <div key={area.id} className={`pv-area-card ${area.status}`}>
                      <div className="pv-area-status">
                        {area.status === 'done' && <span className="pv-check">✓</span>}
                        {area.status === 'working' && <span className="pv-working">●</span>}
                        {area.status === 'not_started' && <span className="pv-pending">○</span>}
                      </div>
                      <div className="pv-area-info">
                        <span className="pv-area-name">{area.name}</span>
                        <span className="pv-area-weight">{area.weight}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="pv-card">
                <h3>Quick Stats</h3>
                <div className="pv-quick-stats">
                  <div className="pv-quick-stat">
                    <span className="pv-qs-value">{areas.length}</span>
                    <span className="pv-qs-label">Total Areas</span>
                  </div>
                  <div className="pv-quick-stat">
                    <span className="pv-qs-value">{projectData?.totalTickets || 0}</span>
                    <span className="pv-qs-label">T&M Tickets</span>
                  </div>
                  <div className="pv-quick-stat">
                    <span className="pv-qs-value">{projectData?.pendingTickets || 0}</span>
                    <span className="pv-qs-label">Pending Review</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FINANCIALS TAB */}
          {activeProjectTab === 'financials' && (
            <div className="pv-tab-panel">
              {/* Contract Breakdown */}
              <div className="pv-card pv-financial-card">
                <h3>Contract Value</h3>
                <div className="pv-contract-breakdown">
                  <div className="pv-contract-row">
                    <span className="pv-contract-label">Original Contract</span>
                    <span className="pv-contract-value">{formatCurrency(selectedProject.contract_value)}</span>
                  </div>
                  {hasChangeOrders && (
                    <div className="pv-contract-row pv-co-added">
                      <span className="pv-contract-label">+ Change Orders</span>
                      <span className="pv-contract-value">+{formatCurrency(changeOrderValue)}</span>
                    </div>
                  )}
                  <div className="pv-contract-row pv-contract-total">
                    <span className="pv-contract-label">{hasChangeOrders ? 'Revised Total' : 'Contract Total'}</span>
                    <span className="pv-contract-value">{formatCurrency(revisedContractValue)}</span>
                  </div>
                </div>

                <div className="pv-billing-progress">
                  <div className="pv-billing-track">
                    <div className="pv-billing-fill" style={{ width: `${percentBilled}%` }}></div>
                  </div>
                  <div className="pv-billing-stats">
                    <div className="pv-billing-item">
                      <span className="pv-billing-value">{formatCurrency(billable)}</span>
                      <span className="pv-billing-label">Billed ({percentBilled}%)</span>
                    </div>
                    <div className="pv-billing-item">
                      <span className="pv-billing-value pv-remaining">{formatCurrency(revisedContractValue - billable)}</span>
                      <span className="pv-billing-label">Remaining</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* T&M Tickets */}
              <TMList project={selectedProject} company={company} onShowToast={onShowToast} />

              {/* Man Day Costs */}
              <ManDayCosts project={selectedProject} company={company} onShowToast={onShowToast} />
            </div>
          )}

          {/* REPORTS TAB */}
          {activeProjectTab === 'reports' && (
            <div className="pv-tab-panel">
              {/* Daily Reports */}
              <DailyReportsList project={selectedProject} company={company} onShowToast={onShowToast} />

              {/* Injury Reports */}
              <InjuryReportsList
                project={selectedProject}
                companyId={company?.id || selectedProject?.company_id}
                company={company}
                onShowToast={onShowToast}
              />
            </div>
          )}

          {/* ACTIVITY TAB */}
          {activeProjectTab === 'activity' && (
            <div className="pv-tab-panel">
              {/* Messages */}
              <div className="pv-messages-full">
                <ProjectMessages
                  project={selectedProject}
                  company={company}
                  userName={company?.name || 'Office'}
                  onShowToast={onShowToast}
                />
              </div>

              {/* Material Requests */}
              <MaterialRequestsList project={selectedProject} company={company} onShowToast={onShowToast} />
            </div>
          )}
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

  // Calculate business-level portfolio metrics
  const totalOriginalContract = projectsData.reduce((sum, p) => sum + (p.contract_value || 0), 0)
  const totalChangeOrders = projectsData.reduce((sum, p) => sum + (p.changeOrderValue || 0), 0)
  const totalPortfolioValue = totalOriginalContract + totalChangeOrders
  const totalEarned = projectsData.reduce((sum, p) => sum + (p.billable || 0), 0)
  const totalRemaining = totalPortfolioValue - totalEarned

  // Weighted completion (by contract value, not simple average)
  const weightedCompletion = totalPortfolioValue > 0
    ? Math.round((totalEarned / totalPortfolioValue) * 100)
    : 0

  // Project health breakdown (use revised contract values)
  const projectsComplete = projectsData.filter(p => p.progress >= 100).length
  const projectsOnTrack = projectsData.filter(p => p.progress < 100 && p.billable <= (p.revisedContractValue || p.contract_value) * (p.progress / 100) * 1.1).length
  const projectsAtRisk = projectsData.filter(p => p.billable > (p.revisedContractValue || p.contract_value) * 0.9 && p.progress < 90).length
  const projectsOverBudget = projectsData.filter(p => p.billable > (p.revisedContractValue || p.contract_value)).length
  const projectsWithChangeOrders = projectsData.filter(p => (p.changeOrderValue || 0) > 0).length

  return (
    <div>
      {/* Business Overview - High Level Portfolio Health */}
      <div className="business-overview">
        <div className="bo-header">
          <h2 className="bo-title">Portfolio Overview</h2>
          <div className="bo-project-count">{projects.length} Active Project{projects.length !== 1 ? 's' : ''}</div>
        </div>

        {/* Main Financial Bar */}
        <div className="bo-financial">
          <div className="bo-progress-bar">
            <div
              className="bo-progress-fill"
              style={{ width: `${Math.min(weightedCompletion, 100)}%` }}
            ></div>
          </div>
          <div className="bo-financial-row">
            <div className="bo-metric primary">
              <span className="bo-metric-value">{formatCurrency(totalEarned)}</span>
              <span className="bo-metric-label">Earned Revenue</span>
            </div>
            <div className="bo-metric-separator">of</div>
            <div className="bo-metric primary">
              <span className="bo-metric-value">{formatCurrency(totalPortfolioValue)}</span>
              <span className="bo-metric-label">Total Portfolio</span>
            </div>
            <div className="bo-metric highlight">
              <span className="bo-metric-value">{formatCurrency(totalRemaining)}</span>
              <span className="bo-metric-label">Remaining to Bill</span>
            </div>
          </div>

          {/* Change Orders Summary - Only show if there are change orders */}
          {totalChangeOrders > 0 && (
            <div className="bo-change-orders">
              <div className="bo-co-item">
                <span className="bo-co-label">Original Contracts</span>
                <span className="bo-co-value">{formatCurrency(totalOriginalContract)}</span>
              </div>
              <div className="bo-co-item bo-co-added">
                <span className="bo-co-label">+ Change Orders ({projectsWithChangeOrders} project{projectsWithChangeOrders !== 1 ? 's' : ''})</span>
                <span className="bo-co-value">+{formatCurrency(totalChangeOrders)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Project Health Summary */}
        <div className="bo-health">
          <div className="bo-health-title">Project Health</div>
          <div className="bo-health-pills">
            {projectsComplete > 0 && (
              <div className="bo-pill complete">
                <span className="bo-pill-count">{projectsComplete}</span>
                <span className="bo-pill-label">Complete</span>
              </div>
            )}
            {projectsOnTrack > 0 && (
              <div className="bo-pill on-track">
                <span className="bo-pill-count">{projectsOnTrack}</span>
                <span className="bo-pill-label">On Track</span>
              </div>
            )}
            {projectsAtRisk > 0 && (
              <div className="bo-pill at-risk">
                <span className="bo-pill-count">{projectsAtRisk}</span>
                <span className="bo-pill-label">At Risk</span>
              </div>
            )}
            {projectsOverBudget > 0 && (
              <div className="bo-pill over-budget">
                <span className="bo-pill-count">{projectsOverBudget}</span>
                <span className="bo-pill-label">Over Budget</span>
              </div>
            )}
          </div>
        </div>
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


