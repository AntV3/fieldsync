import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { formatCurrency, calculateProgress, getOverallStatus, getOverallStatusLabel, formatStatus } from '../lib/utils'
import { LayoutGrid, DollarSign, ClipboardList, MessageSquare, HardHat, Truck, Info, Building2, Phone, MapPin, FileText } from 'lucide-react'
import TMList from './TMList'
import ShareModal from './ShareModal'
import InjuryReportsList from './InjuryReportsList'
import NotificationSettings from './NotificationSettings'
import MaterialRequestsList from './MaterialRequestsList'
import DailyReportsList from './DailyReportsList'
import ProjectMessages from './ProjectMessages'
import ManDayCosts from './ManDayCosts'
import CORList from './cor/CORList'
import CORForm from './cor/CORForm'
import CORDetail from './cor/CORDetail'
import BurnRateCard from './BurnRateCard'
import CostContributorsCard from './CostContributorsCard'
import ProfitabilityCard from './ProfitabilityCard'
import AddCostModal from './AddCostModal'

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
  const [dumpSites, setDumpSites] = useState([])
  const [showCORForm, setShowCORForm] = useState(false)
  const [editingCOR, setEditingCOR] = useState(null)
  const [showCORDetail, setShowCORDetail] = useState(false)
  const [viewingCOR, setViewingCOR] = useState(null)
  const [corRefreshKey, setCORRefreshKey] = useState(0)
  const [showAddCostModal, setShowAddCostModal] = useState(false)
  const [savingCost, setSavingCost] = useState(false)

  useEffect(() => {
    if (company?.id) {
      loadProjects()
      loadDumpSites()
    }
  }, [company?.id])

  const loadDumpSites = async () => {
    try {
      const sites = await db.getDumpSites(company.id)
      setDumpSites(sites || [])
    } catch (error) {
      console.error('Error loading dump sites:', error)
    }
  }

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
        const dailyReports = await db.getDailyReports(project.id, 100)
        const injuryReports = await db.getInjuryReports(project.id)
        const materialRequests = await db.getMaterialRequests(project.id)
        const laborCosts = await db.calculateManDayCosts(
          project.id,
          company?.id,
          project.work_type || 'demolition',
          project.job_type || 'standard'
        )
        const haulOffCosts = await db.calculateHaulOffCosts(project.id)
        const customCosts = await db.getProjectCosts(project.id)
        const progress = calculateProgress(projectAreas)

        // Calculate revised contract value (original + change orders)
        const changeOrderValue = changeOrderData?.totalApprovedValue || 0
        const revisedContractValue = project.contract_value + changeOrderValue
        const billable = (progress / 100) * revisedContractValue
        const pendingTickets = tickets.filter(t => t.status === 'pending').length

        // Get recent report activity (last 7 days)
        const oneWeekAgo = new Date()
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
        const recentDailyReports = dailyReports.filter(r => new Date(r.report_date) >= oneWeekAgo).length

        // Calculate total custom costs
        const customCostTotal = customCosts.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)

        // Total costs combining labor, haul-off, and custom
        const laborCost = laborCosts?.totalCost || 0
        const haulOffCost = haulOffCosts?.totalCost || 0
        const allCostsTotal = laborCost + haulOffCost + customCostTotal

        // Calculate profit and margin
        const currentProfit = billable - allCostsTotal
        const profitMargin = billable > 0 ? (currentProfit / billable) * 100 : 0

        // Burn rate calculations
        const laborDays = laborCosts?.byDate?.length || 0
        const haulOffDays = haulOffCosts?.daysWithHaulOff || 0
        const totalBurnDays = Math.max(laborDays, haulOffDays)
        const totalBurn = laborCost + haulOffCost
        const dailyBurn = totalBurnDays > 0 ? totalBurn / totalBurnDays : 0

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
          approvedTickets: tickets.filter(t => t.status === 'approved').length,
          dailyReportsCount: dailyReports.length,
          recentDailyReports,
          injuryReportsCount: injuryReports.length,
          lastDailyReport: dailyReports[0]?.report_date || null,
          pendingMaterialRequests: materialRequests.filter(r => r.status === 'pending').length,
          totalMaterialRequests: materialRequests.length,
          // Burn rate data
          laborCost,
          laborDaysWorked: laborDays,
          laborManDays: laborCosts?.totalManDays || 0,
          laborByDate: laborCosts?.byDate || [],
          dailyBurn,
          // Haul-off costs
          haulOffCost,
          haulOffLoads: haulOffCosts?.totalLoads || 0,
          haulOffDays,
          haulOffByType: haulOffCosts?.byWasteType || {},
          haulOffByDate: haulOffCosts?.byDate || [],
          // Custom costs
          customCosts,
          customCostTotal,
          // Combined totals
          totalBurn,
          totalBurnDays,
          allCostsTotal,
          // Profitability
          currentProfit,
          profitMargin
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
      job_number: selectedProject.job_number || '',
      address: selectedProject.address || '',
      general_contractor: selectedProject.general_contractor || '',
      client_contact: selectedProject.client_contact || '',
      client_phone: selectedProject.client_phone || '',
      contract_value: selectedProject.contract_value,
      work_type: selectedProject.work_type || 'demolition',
      job_type: selectedProject.job_type || 'standard',
      pin: selectedProject.pin || '',
      default_dump_site_id: selectedProject.default_dump_site_id || '',
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
        job_number: editData.job_number?.trim() || null,
        address: editData.address?.trim() || null,
        general_contractor: editData.general_contractor?.trim() || null,
        client_contact: editData.client_contact?.trim() || null,
        client_phone: editData.client_phone?.trim() || null,
        contract_value: contractVal,
        work_type: editData.work_type || 'demolition',
        job_type: editData.job_type || 'standard',
        pin: editData.pin || null,
        default_dump_site_id: editData.default_dump_site_id || null
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
      console.error('Error saving project:', error?.message || error)
      onShowToast(error?.message || 'Error saving changes', 'error')
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

          {/* Basic Info */}
          <div className="card">
            <h3>Basic Info</h3>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Project Name *</label>
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => handleEditChange('name', e.target.value)}
                  placeholder="e.g., Downtown Office Demolition"
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Job Number</label>
                <input
                  type="text"
                  value={editData.job_number}
                  onChange={(e) => handleEditChange('job_number', e.target.value)}
                  placeholder="e.g., 2024-001"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Project Address</label>
              <input
                type="text"
                value={editData.address}
                onChange={(e) => handleEditChange('address', e.target.value)}
                placeholder="123 Main St, City, State 12345"
              />
            </div>
          </div>

          {/* Client & Contractor Info */}
          <div className="card">
            <h3>Client & Contractor</h3>
            <div className="form-group">
              <label>General Contractor</label>
              <input
                type="text"
                value={editData.general_contractor}
                onChange={(e) => handleEditChange('general_contractor', e.target.value)}
                placeholder="e.g., ABC Construction"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Client Contact</label>
                <input
                  type="text"
                  value={editData.client_contact}
                  onChange={(e) => handleEditChange('client_contact', e.target.value)}
                  placeholder="Contact name"
                />
              </div>
              <div className="form-group">
                <label>Client Phone</label>
                <input
                  type="tel"
                  value={editData.client_phone}
                  onChange={(e) => handleEditChange('client_phone', e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
          </div>

          {/* Financial & Project Settings */}
          <div className="card">
            <h3>Financials & Settings</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Contract Value ($) *</label>
                <input
                  type="number"
                  value={editData.contract_value}
                  onChange={(e) => handleEditChange('contract_value', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="form-group">
                <label>Foreman PIN</label>
                <input
                  type="text"
                  value={editData.pin}
                  onChange={(e) => handleEditChange('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4 digits"
                  maxLength={4}
                />
                <span className="form-hint">Used for field crew access</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Work Type</label>
                <select
                  value={editData.work_type}
                  onChange={(e) => handleEditChange('work_type', e.target.value)}
                >
                  <option value="demolition">Demolition</option>
                  <option value="environmental">Environmental</option>
                </select>
                <span className="form-hint">Affects labor rate calculations</span>
              </div>
              <div className="form-group">
                <label>Job Type</label>
                <select
                  value={editData.job_type}
                  onChange={(e) => handleEditChange('job_type', e.target.value)}
                >
                  <option value="standard">Standard</option>
                  <option value="prevailing_wage">Prevailing Wage</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Default Dump Site</label>
              <select
                value={editData.default_dump_site_id}
                onChange={(e) => handleEditChange('default_dump_site_id', e.target.value)}
              >
                <option value="">-- Select Dump Site --</option>
                {dumpSites.map(site => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
              <span className="form-hint">Used for haul-off tracking and cost estimates</span>
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
      { id: 'overview', label: 'Overview', Icon: LayoutGrid },
      { id: 'financials', label: 'Financials', Icon: DollarSign },
      { id: 'reports', label: 'Reports', Icon: ClipboardList },
      { id: 'activity', label: 'Activity', Icon: MessageSquare },
      { id: 'info', label: 'Info', Icon: Info }
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
                <tab.Icon size={16} className="pv-tab-icon" />
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
              {/* Project Health Summary */}
              <div className="pv-card pv-health-card">
                <div className="pv-health-header">
                  <div className="pv-health-status">
                    <span className={`pv-health-indicator ${progress >= 100 ? 'complete' : progress > 0 ? 'active' : 'pending'}`}></span>
                    <span className="pv-health-label">
                      {progress >= 100 ? 'Complete' : progress > 0 ? 'In Progress' : 'Not Started'}
                    </span>
                  </div>
                  <div className="pv-health-percent">{progress}%</div>
                </div>
                <div className="pv-health-bar">
                  <div className="pv-health-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="pv-health-context">
                  <span>{areasComplete} of {areas.length} work areas complete</span>
                </div>
              </div>

              {/* Work Areas Breakdown */}
              <div className="pv-card">
                <div className="pv-card-header">
                  <h3>Work Areas</h3>
                  <div className="pv-area-summary">
                    {areasComplete > 0 && <span className="pv-count done">{areasComplete} Complete</span>}
                    {areasWorking > 0 && <span className="pv-count working">{areasWorking} Active</span>}
                    {areasNotStarted > 0 && <span className="pv-count pending">{areasNotStarted} Pending</span>}
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
                        <span className="pv-area-weight">{area.weight}% of contract</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Items - What needs attention */}
              {(projectData?.pendingTickets > 0 || projectData?.pendingMaterialRequests > 0) && (
                <div className="pv-card pv-attention-card">
                  <h3>Needs Attention</h3>
                  <div className="pv-attention-items">
                    {projectData?.pendingTickets > 0 && (
                      <div className="pv-attention-item" onClick={() => setActiveProjectTab('financials')}>
                        <span className="pv-attention-count">{projectData.pendingTickets}</span>
                        <span className="pv-attention-label">T&M tickets awaiting approval</span>
                        <span className="pv-attention-arrow">→</span>
                      </div>
                    )}
                    {projectData?.pendingMaterialRequests > 0 && (
                      <div className="pv-attention-item" onClick={() => setActiveProjectTab('activity')}>
                        <span className="pv-attention-count">{projectData.pendingMaterialRequests}</span>
                        <span className="pv-attention-label">Material requests pending review</span>
                        <span className="pv-attention-arrow">→</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FINANCIALS TAB */}
          {activeProjectTab === 'financials' && (
            <div className="pv-tab-panel financials-tab">
              {/* Key Metrics - Hero Section */}
              <div className="financials-hero">
                <div className="financials-hero-grid">
                  {/* Contract Value */}
                  <div className="fin-metric">
                    <div className="fin-metric-label">Contract</div>
                    <div className="fin-metric-value">{formatCurrency(revisedContractValue)}</div>
                    {hasChangeOrders && (
                      <div className="fin-metric-detail green">+{formatCurrency(changeOrderValue)} COs</div>
                    )}
                  </div>

                  {/* Revenue Earned */}
                  <div className="fin-metric">
                    <div className="fin-metric-label">Earned</div>
                    <div className="fin-metric-value">{formatCurrency(billable)}</div>
                    <div className="fin-metric-bar">
                      <div className="fin-metric-fill" style={{ width: `${percentBilled}%` }}></div>
                    </div>
                  </div>

                  {/* Total Costs */}
                  <div className="fin-metric">
                    <div className="fin-metric-label">Costs</div>
                    <div className="fin-metric-value">{formatCurrency(projectData?.allCostsTotal || 0)}</div>
                    {billable > 0 && (
                      <div className={`fin-metric-detail ${((projectData?.allCostsTotal || 0) / billable) > 0.6 ? 'warning' : ''}`}>
                        {Math.round(((projectData?.allCostsTotal || 0) / billable) * 100)}% of revenue
                      </div>
                    )}
                  </div>

                  {/* Profit */}
                  <div className="fin-metric">
                    <div className="fin-metric-label">Profit</div>
                    <div className={`fin-metric-value ${(projectData?.currentProfit || 0) < 0 ? 'negative' : 'positive'}`}>
                      {formatCurrency(projectData?.currentProfit || 0)}
                    </div>
                    <div className={`fin-metric-detail ${(projectData?.profitMargin || 0) < 20 ? 'warning' : ''}`}>
                      {Math.round(projectData?.profitMargin || 0)}% margin
                    </div>
                  </div>
                </div>
              </div>

              {/* Burn Rate & Profitability Row */}
              <div className="financials-analysis-row">
                <BurnRateCard
                  dailyBurn={projectData?.dailyBurn || 0}
                  totalBurn={projectData?.totalBurn || 0}
                  daysWorked={projectData?.totalBurnDays || 0}
                  laborCost={projectData?.laborCost || 0}
                  haulOffCost={projectData?.haulOffCost || 0}
                  progress={progress}
                  contractValue={revisedContractValue}
                  laborByDate={projectData?.laborByDate || []}
                  haulOffByDate={projectData?.haulOffByDate || []}
                />

                <ProfitabilityCard
                  revenue={billable}
                  totalCosts={projectData?.allCostsTotal || 0}
                  contractValue={revisedContractValue}
                  progress={progress}
                />
              </div>

              {/* Cost Contributors */}
              <CostContributorsCard
                laborCost={projectData?.laborCost || 0}
                haulOffCost={projectData?.haulOffCost || 0}
                customCosts={projectData?.customCosts || []}
                onAddCost={() => setShowAddCostModal(true)}
                onDeleteCost={async (costId) => {
                  try {
                    await db.deleteProjectCost(costId)
                    loadProjects()
                    onShowToast('Cost deleted', 'success')
                  } catch (err) {
                    onShowToast('Error deleting cost', 'error')
                  }
                }}
              />

              {/* Extra Work Pipeline */}
              <div className="financials-pipeline">
                <div className="pipeline-header">
                  <h2>Extra Work</h2>
                  <div className="pipeline-flow">
                    <span className="pipeline-step">T&M Tickets</span>
                    <span className="pipeline-arrow">→</span>
                    <span className="pipeline-step active">Change Orders</span>
                  </div>
                </div>

                <div className="pipeline-content">
                  {/* T&M Work Orders */}
                  <div className="pipeline-section">
                    <div className="pipeline-section-header">
                      <h3>T&M Tickets</h3>
                      <span className="pipeline-badge">
                        {projectData?.totalTickets || 0} total
                        {projectData?.pendingTickets > 0 && ` · ${projectData.pendingTickets} pending`}
                      </span>
                    </div>
                    <TMList project={selectedProject} company={company} onShowToast={onShowToast} />
                  </div>

                  {/* Change Order Requests */}
                  <div className="pipeline-section">
                    <CORList
                      project={selectedProject}
                      company={company}
                      areas={areas}
                      refreshKey={corRefreshKey}
                      onShowToast={onShowToast}
                      onCreateCOR={() => {
                        setEditingCOR(null)
                        setShowCORForm(true)
                      }}
                      onViewCOR={(cor) => {
                        setViewingCOR(cor)
                        setShowCORDetail(true)
                      }}
                      onEditCOR={(cor) => {
                        setEditingCOR(cor)
                        setShowCORForm(true)
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Legacy Cost Breakdown - Now Collapsible */}
              <details className="financials-details">
                <summary className="financials-details-summary">
                  <HardHat size={16} />
                  <span>Labor Details</span>
                  <span className="financials-details-value">{formatCurrency(projectData?.laborCost || 0)}</span>
                </summary>
                <div className="financials-details-content">
                  <ManDayCosts project={selectedProject} company={company} onShowToast={onShowToast} />
                </div>
              </details>
            </div>
          )}

          {/* REPORTS TAB */}
          {activeProjectTab === 'reports' && (
            <div className="pv-tab-panel">
              {/* Reports Executive Summary */}
              <div className="pv-card pv-reports-summary">
                <h3>Field Documentation Summary</h3>
                <div className="pv-reports-stats">
                  <div className="pv-report-stat">
                    <span className="pv-report-stat-value">{projectData?.dailyReportsCount || 0}</span>
                    <span className="pv-report-stat-label">Daily Reports Filed</span>
                  </div>
                  <div className="pv-report-stat">
                    <span className="pv-report-stat-value">{projectData?.recentDailyReports || 0}</span>
                    <span className="pv-report-stat-label">Reports This Week</span>
                  </div>
                  <div className="pv-report-stat injury">
                    <span className="pv-report-stat-value">{projectData?.injuryReportsCount || 0}</span>
                    <span className="pv-report-stat-label">Injury Reports</span>
                  </div>
                </div>
                {projectData?.lastDailyReport && (
                  <div className="pv-last-report">
                    Last report filed: {new Date(projectData.lastDailyReport).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>

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
              {/* Activity Summary */}
              <div className="pv-card pv-activity-summary">
                <h3>Project Activity Status</h3>
                <div className="pv-activity-stats">
                  <div className={`pv-activity-stat ${projectData?.pendingMaterialRequests > 0 ? 'has-pending' : ''}`}>
                    <span className="pv-activity-stat-value">{projectData?.pendingMaterialRequests || 0}</span>
                    <span className="pv-activity-stat-label">Pending Requests</span>
                  </div>
                  <div className="pv-activity-stat">
                    <span className="pv-activity-stat-value">{projectData?.totalMaterialRequests || 0}</span>
                    <span className="pv-activity-stat-label">Total Requests</span>
                  </div>
                </div>
              </div>

              {/* Material Requests - Priority */}
              <MaterialRequestsList project={selectedProject} company={company} onShowToast={onShowToast} />

              {/* Messages */}
              <div className="pv-messages-full">
                <ProjectMessages
                  project={selectedProject}
                  company={company}
                  userName={company?.name || 'Office'}
                  onShowToast={onShowToast}
                />
              </div>
            </div>
          )}

          {/* INFO TAB */}
          {activeProjectTab === 'info' && (
            <div className="pv-tab-panel">
              {/* Project Details */}
              <div className="pv-card pv-info-card">
                <div className="pv-info-header">
                  <h3>Project Details</h3>
                  <button className="btn btn-secondary btn-sm" onClick={handleEditClick}>
                    Edit Project
                  </button>
                </div>

                <div className="pv-info-grid">
                  {/* Basic Info */}
                  <div className="pv-info-section">
                    <div className="pv-info-section-title">Basic Information</div>
                    <div className="pv-info-row">
                      <span className="pv-info-label">Project Name</span>
                      <span className="pv-info-value">{selectedProject.name}</span>
                    </div>
                    {selectedProject.job_number && (
                      <div className="pv-info-row">
                        <span className="pv-info-label">Job Number</span>
                        <span className="pv-info-value">{selectedProject.job_number}</span>
                      </div>
                    )}
                    {selectedProject.address && (
                      <div className="pv-info-row">
                        <span className="pv-info-label">
                          <MapPin size={14} className="pv-info-icon" />
                          Address
                        </span>
                        <span className="pv-info-value">{selectedProject.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Client & Contractor */}
                  <div className="pv-info-section">
                    <div className="pv-info-section-title">
                      <Building2 size={16} className="pv-info-icon" />
                      Client & Contractor
                    </div>
                    {selectedProject.general_contractor ? (
                      <div className="pv-info-row">
                        <span className="pv-info-label">General Contractor</span>
                        <span className="pv-info-value">{selectedProject.general_contractor}</span>
                      </div>
                    ) : (
                      <div className="pv-info-empty">No general contractor specified</div>
                    )}
                    {selectedProject.client_contact && (
                      <div className="pv-info-row">
                        <span className="pv-info-label">Client Contact</span>
                        <span className="pv-info-value">{selectedProject.client_contact}</span>
                      </div>
                    )}
                    {selectedProject.client_phone && (
                      <div className="pv-info-row">
                        <span className="pv-info-label">
                          <Phone size={14} className="pv-info-icon" />
                          Phone
                        </span>
                        <a href={`tel:${selectedProject.client_phone}`} className="pv-info-value pv-info-link">
                          {selectedProject.client_phone}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Project Settings */}
                  <div className="pv-info-section">
                    <div className="pv-info-section-title">Project Settings</div>
                    <div className="pv-info-row">
                      <span className="pv-info-label">Work Type</span>
                      <span className="pv-info-value pv-info-badge">
                        {selectedProject.work_type === 'environmental' ? 'Environmental' : 'Demolition'}
                      </span>
                    </div>
                    <div className="pv-info-row">
                      <span className="pv-info-label">Job Type</span>
                      <span className="pv-info-value pv-info-badge">
                        {selectedProject.job_type === 'prevailing_wage' ? 'Prevailing Wage' : 'Standard'}
                      </span>
                    </div>
                    {selectedProject.pin && (
                      <div className="pv-info-row">
                        <span className="pv-info-label">Foreman PIN</span>
                        <span className="pv-info-value pv-info-mono">{selectedProject.pin}</span>
                      </div>
                    )}
                    {selectedProject.default_dump_site_id && (
                      <div className="pv-info-row">
                        <span className="pv-info-label">Default Dump Site</span>
                        <span className="pv-info-value">
                          {dumpSites.find(s => s.id === selectedProject.default_dump_site_id)?.name || 'Unknown'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Contract Value */}
                  <div className="pv-info-section">
                    <div className="pv-info-section-title">
                      <DollarSign size={16} className="pv-info-icon" />
                      Contract
                    </div>
                    <div className="pv-info-row">
                      <span className="pv-info-label">Original Contract</span>
                      <span className="pv-info-value pv-info-currency">{formatCurrency(selectedProject.contract_value)}</span>
                    </div>
                    {changeOrderValue > 0 && (
                      <div className="pv-info-row">
                        <span className="pv-info-label">Change Orders</span>
                        <span className="pv-info-value pv-info-currency positive">+{formatCurrency(changeOrderValue)}</span>
                      </div>
                    )}
                    <div className="pv-info-row pv-info-total">
                      <span className="pv-info-label">Current Value</span>
                      <span className="pv-info-value pv-info-currency">{formatCurrency(revisedContractValue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Work Areas Summary */}
              <div className="pv-card">
                <h3>Work Areas ({areas.length})</h3>
                <div className="pv-info-areas">
                  {areas.map(area => (
                    <div key={area.id} className={`pv-info-area ${area.status}`}>
                      <span className="pv-info-area-name">{area.name}</span>
                      <span className="pv-info-area-weight">{area.weight}%</span>
                      <span className={`pv-info-area-status status-badge ${area.status}`}>
                        {area.status === 'done' ? 'Complete' : area.status === 'working' ? 'In Progress' : 'Not Started'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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

        {/* COR Form Modal */}
        {showCORForm && (
          <CORForm
            project={selectedProject}
            company={company}
            areas={areas}
            existingCOR={editingCOR}
            onClose={() => {
              setShowCORForm(false)
              setEditingCOR(null)
            }}
            onSaved={() => {
              setShowCORForm(false)
              setEditingCOR(null)
              setCORRefreshKey(prev => prev + 1)
            }}
            onShowToast={onShowToast}
          />
        )}

        {/* COR Detail Modal */}
        {showCORDetail && viewingCOR && (
          <CORDetail
            cor={viewingCOR}
            project={selectedProject}
            company={company}
            areas={areas}
            onClose={() => {
              setShowCORDetail(false)
              setViewingCOR(null)
            }}
            onEdit={(cor) => {
              setShowCORDetail(false)
              setViewingCOR(null)
              setEditingCOR(cor)
              setShowCORForm(true)
            }}
            onShowToast={onShowToast}
            onStatusChange={() => {
              // Trigger a refresh of the COR list
            }}
          />
        )}

        {/* Add Cost Modal */}
        {showAddCostModal && (
          <AddCostModal
            onClose={() => setShowAddCostModal(false)}
            saving={savingCost}
            onSave={async (costData) => {
              try {
                setSavingCost(true)
                await db.addProjectCost(selectedProject.id, company.id, costData)
                setShowAddCostModal(false)
                loadProjects()
                onShowToast('Cost added successfully', 'success')
              } catch (err) {
                console.error('Error adding cost:', err)
                onShowToast('Error adding cost', 'error')
              } finally {
                setSavingCost(false)
              }
            }}
          />
        )}
      </div>
    )
  }

  // Project List View
  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <ClipboardList size={48} className="empty-state-icon" />
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


