import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { formatCurrency, calculateProgress, getOverallStatus, getOverallStatusLabel, formatStatus } from '../lib/utils'
import TMList from './TMList'
import ShareModal from './ShareModal'
import InjuryReportsList from './InjuryReportsList'

export default function Dashboard({ company, onShowToast }) {
  const [view, setView] = useState('overview') // 'overview' or 'project'
  const [selectedProject, setSelectedProject] = useState(null)
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  // Executive Dashboard Data
  const [metrics, setMetrics] = useState(null)
  const [projectSummaries, setProjectSummaries] = useState([])
  const [needsAttention, setNeedsAttention] = useState(null)
  const [recentActivity, setRecentActivity] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [company])

  useEffect(() => {
    if (selectedProject) {
      loadAreas(selectedProject.id)

      // NOTE: Realtime subscriptions disabled to prevent WebSocket errors
      // Re-enable when realtime is needed:
      // const subscription = db.subscribeToAreas(selectedProject.id, (payload) => {
      //   loadAreas(selectedProject.id)
      // })
      // return () => db.unsubscribe(subscription)
    }
  }, [selectedProject])

  const loadDashboardData = async () => {
    if (!company?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      // Load all dashboard data in parallel
      const [metricsData, summariesData, attentionData, activityData] = await Promise.all([
        db.getDashboardMetrics(company.id),
        db.getProjectSummaries(company.id),
        db.getNeedsAttention(company.id),
        db.getRecentActivity(company.id, 15)
      ])

      setMetrics(metricsData)
      setProjectSummaries(summariesData)
      setNeedsAttention(attentionData)
      setRecentActivity(activityData)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      onShowToast('Error loading dashboard data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const refreshDashboard = async () => {
    setRefreshing(true)
    await loadDashboardData()
    setRefreshing(false)
    onShowToast('Dashboard refreshed', 'success')
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
    setView('project')
  }

  const handleBack = () => {
    setSelectedProject(null)
    setAreas([])
    setEditMode(false)
    setEditData(null)
    setView('overview')
    loadDashboardData() // Refresh dashboard data
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

  const handlePauseProject = async () => {
    if (!confirm(`Pause "${selectedProject.name}"? The project will be marked as paused.`)) {
      return
    }

    try {
      await db.updateProjectStatus(selectedProject.id, 'paused')
      const updatedProject = await db.getProject(selectedProject.id)
      setSelectedProject(updatedProject)
      onShowToast('Project paused', 'success')
      loadDashboardData()
    } catch (error) {
      console.error('Error pausing project:', error)
      onShowToast('Error pausing project', 'error')
    }
  }

  const handleResumeProject = async () => {
    try {
      await db.updateProjectStatus(selectedProject.id, 'active')
      const updatedProject = await db.getProject(selectedProject.id)
      setSelectedProject(updatedProject)
      onShowToast('Project resumed', 'success')
      loadDashboardData()
    } catch (error) {
      console.error('Error resuming project:', error)
      onShowToast('Error resuming project', 'error')
    }
  }

  const handleCompleteProject = async () => {
    if (!confirm(`Mark "${selectedProject.name}" as done? The project will be marked as completed.`)) {
      return
    }

    try {
      await db.updateProjectStatus(selectedProject.id, 'done')
      const updatedProject = await db.getProject(selectedProject.id)
      setSelectedProject(updatedProject)
      onShowToast('Project marked as done', 'success')
      loadDashboardData()
    } catch (error) {
      console.error('Error updating project:', error)
      onShowToast('Error updating project', 'error')
    }
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading dashboard...
      </div>
    )
  }

  // Project Detail View
  if (view === 'project' && selectedProject) {
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

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            {selectedProject.status === 'paused' ? (
              <button
                className="btn btn-success btn-small"
                onClick={handleResumeProject}
                style={{ flex: 1 }}
              >
                ▶ Resume
              </button>
            ) : (
              <button
                className="btn btn-warning btn-small"
                onClick={handlePauseProject}
                style={{ flex: 1 }}
              >
                ⏸ Pause
              </button>
            )}
            {selectedProject.status !== 'done' && (
              <button
                className="btn btn-success btn-small"
                onClick={handleCompleteProject}
                style={{ flex: 1 }}
              >
                ✓ Mark Done
              </button>
            )}
            <button
              className="btn btn-danger btn-small"
              onClick={handleDeleteProject}
              style={{ flex: 1 }}
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      )
    }

    // View Mode
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-small" onClick={handleBack}>
            ← Back to Dashboard
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-small" onClick={() => setShowShareModal(true)}>
              Share with Client
            </button>
            <button className="btn btn-secondary btn-small" onClick={handleEditClick}>
              Edit
            </button>
          </div>
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

        <TMList project={selectedProject} onShowToast={onShowToast} />

        <InjuryReportsList
          project={selectedProject}
          companyId={company?.id || selectedProject?.company_id}
          onShowToast={onShowToast}
        />

        {showShareModal && (
          <ShareModal
            project={selectedProject}
            onClose={() => setShowShareModal(false)}
            onShareCreated={(share) => {
              onShowToast('Share link created successfully!', 'success')
            }}
          />
        )}
      </div>
    )
  }

  // Executive Dashboard Overview
  if (!metrics) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <h3>Loading Dashboard</h3>
        <p>Fetching your data...</p>
      </div>
    )
  }

  return (
    <div className="executive-dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Overview of all projects and activity</p>
        </div>
        <button
          className="btn btn-secondary btn-small"
          onClick={refreshDashboard}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {/* Top Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{metrics.activeProjects}</div>
          <div className="metric-label">Active Projects</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics.crewToday}</div>
          <div className="metric-label">Crew Today</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics.pendingTMCount}</div>
          <div className="metric-label">Pending T&M Tickets</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{formatCurrency(metrics.pendingTMValue)}</div>
          <div className="metric-label">Pending T&M Value</div>
        </div>
        <div className="metric-card metric-urgent">
          <div className="metric-value">{metrics.urgentRequests}</div>
          <div className="metric-label">Urgent Requests</div>
        </div>
      </div>

      {/* Projects List */}
      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Active Projects</h2>
        {projectSummaries.length === 0 ? (
          <div className="empty-state-small">
            <p>No active projects</p>
          </div>
        ) : (
          <div className="dashboard-projects-list">
            {projectSummaries.map(project => (
              <div
                key={project.id}
                className={`dashboard-project-card status-${project.statusColor}`}
                onClick={() => handleSelectProject(project)}
              >
                <div className="project-header">
                  <div>
                    <div className="project-name">{project.name}</div>
                    <div className="project-value">{formatCurrency(project.contract_value)}</div>
                  </div>
                  <div className={`status-indicator status-${project.statusColor}`}></div>
                </div>
                <div className="project-stats">
                  <div className="project-stat">
                    <span className="stat-label">Progress</span>
                    <span className="stat-value">{project.progress}%</span>
                  </div>
                  <div className="project-stat">
                    <span className="stat-label">Crew Today</span>
                    <span className="stat-value">{project.crewToday}</span>
                  </div>
                  <div className="project-stat">
                    <span className="stat-label">Pending Items</span>
                    <span className="stat-value">{project.pendingItems}</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${project.progress}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '2rem' }}>
        {/* Needs Attention Section */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Needs Attention</h2>
          {needsAttention && (
            <div className="attention-list">
              {needsAttention.pendingTM.length > 0 && (
                <div className="attention-section">
                  <h3 className="attention-heading">Pending T&M Approvals ({needsAttention.pendingTM.length})</h3>
                  {needsAttention.pendingTM.slice(0, 3).map(ticket => (
                    <div key={ticket.id} className="attention-item">
                      <div>
                        <div className="attention-item-title">{ticket.projects?.name}</div>
                        <div className="attention-item-subtitle">
                          {new Date(ticket.work_date).toLocaleDateString()} • {formatCurrency(ticket.estimatedValue)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {needsAttention.pendingMaterials.length > 0 && (
                <div className="attention-section">
                  <h3 className="attention-heading">Material Requests ({needsAttention.pendingMaterials.length})</h3>
                  {needsAttention.pendingMaterials.slice(0, 3).map(req => (
                    <div key={req.id} className="attention-item">
                      <div>
                        <div className="attention-item-title">
                          {req.projects?.name}
                          {req.priority === 'urgent' && <span className="urgent-badge">URGENT</span>}
                        </div>
                        <div className="attention-item-subtitle">{req.items?.length || 0} items</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {needsAttention.missingReports.length > 0 && (
                <div className="attention-section">
                  <h3 className="attention-heading">Missing Daily Reports ({needsAttention.missingReports.length})</h3>
                  {needsAttention.missingReports.slice(0, 3).map(project => (
                    <div key={project.id} className="attention-item">
                      <div className="attention-item-title">{project.name}</div>
                    </div>
                  ))}
                </div>
              )}

              {needsAttention.unreadMessages.length > 0 && (
                <div className="attention-section">
                  <h3 className="attention-heading">Unread Messages ({needsAttention.unreadMessages.length})</h3>
                  {needsAttention.unreadMessages.slice(0, 3).map(msg => (
                    <div key={msg.id} className="attention-item">
                      <div>
                        <div className="attention-item-title">{msg.projects?.name}</div>
                        <div className="attention-item-subtitle">{msg.message?.substring(0, 50)}...</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {needsAttention.pendingTM.length === 0 &&
               needsAttention.pendingMaterials.length === 0 &&
               needsAttention.missingReports.length === 0 &&
               needsAttention.unreadMessages.length === 0 && (
                <div className="empty-state-small">
                  <p>All caught up! No items need attention.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem' }}>Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <div className="empty-state-small">
              <p>No recent activity</p>
            </div>
          ) : (
            <div className="activity-feed">
              {recentActivity.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className={`activity-icon activity-${activity.type}`}>
                    {activity.type === 'tm_submitted' && '📋'}
                    {activity.type === 'report_submitted' && '📄'}
                    {activity.type === 'material_request' && '📦'}
                    {activity.type === 'task_completed' && '✓'}
                  </div>
                  <div className="activity-content">
                    <div className="activity-message">{activity.message}</div>
                    <div className="activity-meta">
                      <span className="activity-project">{activity.project}</span>
                      {activity.by && <span className="activity-by"> • {activity.by}</span>}
                      <span className="activity-time"> • {formatTimestamp(activity.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
