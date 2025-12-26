import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { formatCurrency, calculateProgress, calculateValueProgress, getOverallStatus, getOverallStatusLabel, formatStatus } from '../lib/utils'
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

      // Subscribe to company-wide activity to refresh metrics in real-time
      const projectIds = projects.map(p => p.id)
      const subscription = projectIds.length > 0
        ? db.subscribeToCompanyActivity?.(company.id, projectIds, {
            onMessage: () => loadProjects(),
            onMaterialRequest: () => loadProjects(),
            onTMTicket: () => loadProjects(),
            onInjuryReport: () => loadProjects()
          })
        : null

      return () => {
        if (subscription) db.unsubscribe?.(subscription)
      }
    }
  }, [company?.id, projects.length])

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

      // Subscribe to real-time updates for the selected project
      const subscriptions = []

      // Areas subscription
      const areasSub = db.subscribeToAreas?.(selectedProject.id, () => {
        loadAreas(selectedProject.id)
        loadProjects() // Refresh metrics when areas change
      })
      if (areasSub) subscriptions.push(areasSub)

      // Daily reports subscription
      const dailyReportsSub = db.subscribeToDailyReports?.(selectedProject.id, () => {
        loadProjects()
      })
      if (dailyReportsSub) subscriptions.push(dailyReportsSub)

      // Crew checkins subscription (affects labor costs)
      const checkinsSub = db.subscribeToCrewCheckins?.(selectedProject.id, () => {
        loadProjects()
      })
      if (checkinsSub) subscriptions.push(checkinsSub)

      // Haul offs subscription
      const haulOffsSub = db.subscribeToHaulOffs?.(selectedProject.id, () => {
        loadProjects()
      })
      if (haulOffsSub) subscriptions.push(haulOffsSub)

      // CORs subscription
      const corsSub = db.subscribeToCORs?.(selectedProject.id, () => {
        loadProjects()
        setCORRefreshKey(prev => prev + 1)
      })
      if (corsSub) subscriptions.push(corsSub)

      return () => {
        subscriptions.forEach(sub => db.unsubscribe?.(sub))
      }
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

        // Calculate progress - use SOV values if available, otherwise fallback to percentage
        const progressData = calculateValueProgress(projectAreas)
        const progress = progressData.progress

        // Calculate revised contract value (original + change orders)
        const changeOrderValue = changeOrderData?.totalApprovedValue || 0
        const revisedContractValue = project.contract_value + changeOrderValue

        // Billable: use actual earned value from SOV if available, otherwise percentage-based
        const billable = progressData.isValueBased
          ? progressData.earnedValue
          : (progress / 100) * revisedContractValue
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
          // SOV/Scheduled Value data
          isValueBased: progressData.isValueBased,
          earnedValue: progressData.earnedValue,
          totalSOVValue: progressData.totalValue,
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
    // Get enhanced project data with SOV values
    const projectData = projectsData.find(p => p.id === selectedProject.id)

    // Calculate progress - use SOV values if available
    const progressData = calculateValueProgress(areas)
    const progress = progressData.progress

    // Get change order data from enhanced project data
    const changeOrderValue = projectData?.changeOrderValue || 0
    const revisedContractValue = selectedProject.contract_value + changeOrderValue

    // Billable: use actual earned value from SOV if available
    const billable = progressData.isValueBased
      ? progressData.earnedValue
      : (progress / 100) * revisedContractValue

    // SOV data for UI display
    const isValueBased = progressData.isValueBased
    const earnedValue = progressData.earnedValue
    const totalSOVValue = progressData.totalValue

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
            <div className="pv-tab-panel overview-tab">
              {/* Hero Metrics */}
              <div className="overview-hero">
                <div className="overview-hero-grid">
                  {/* Progress */}
                  <div className="overview-metric primary">
                    <div className="overview-metric-value">{progress}%</div>
                    <div className="overview-metric-label">Complete</div>
                    <div className="overview-metric-bar">
                      <div className="overview-metric-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>

                  {/* Areas Status */}
                  <div className="overview-metric">
                    <div className="overview-metric-value">{areasComplete}/{areas.length}</div>
                    <div className="overview-metric-label">Areas Done</div>
                    <div className="overview-metric-detail">
                      {areasWorking > 0 && <span className="working">{areasWorking} active</span>}
                    </div>
                  </div>

                  {/* Contract Value */}
                  <div className="overview-metric">
                    <div className="overview-metric-value">{formatCurrency(revisedContractValue)}</div>
                    <div className="overview-metric-label">Contract</div>
                    {hasChangeOrders && (
                      <div className="overview-metric-detail green">+{formatCurrency(changeOrderValue)} COs</div>
                    )}
                  </div>

                  {/* Billable */}
                  <div className="overview-metric">
                    <div className="overview-metric-value green">{formatCurrency(billable)}</div>
                    <div className="overview-metric-label">Earned</div>
                    <div className="overview-metric-detail">
                      {isValueBased ? (
                        <span>of {formatCurrency(totalSOVValue)} SOV</span>
                      ) : (
                        <span>{percentBilled}% billed</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Items - What needs attention */}
              {(projectData?.pendingTickets > 0 || projectData?.pendingMaterialRequests > 0 || projectData?.changeOrderPending > 0) && (
                <div className="overview-attention-card">
                  <div className="attention-header">
                    <h3>Needs Attention</h3>
                    <span className="attention-count">
                      {(projectData?.pendingTickets || 0) + (projectData?.pendingMaterialRequests || 0) + (projectData?.changeOrderPending || 0)} items
                    </span>
                  </div>
                  <div className="attention-items">
                    {projectData?.pendingTickets > 0 && (
                      <div className="attention-item" onClick={() => setActiveProjectTab('financials')}>
                        <div className="attention-item-icon warning">
                          <ClipboardList size={16} />
                        </div>
                        <div className="attention-item-content">
                          <span className="attention-item-title">{projectData.pendingTickets} T&M ticket{projectData.pendingTickets !== 1 ? 's' : ''} awaiting approval</span>
                          <span className="attention-item-action">Review in Financials</span>
                        </div>
                        <span className="attention-item-arrow">→</span>
                      </div>
                    )}
                    {projectData?.changeOrderPending > 0 && (
                      <div className="attention-item" onClick={() => setActiveProjectTab('financials')}>
                        <div className="attention-item-icon info">
                          <FileText size={16} />
                        </div>
                        <div className="attention-item-content">
                          <span className="attention-item-title">{projectData.changeOrderPending} change order{projectData.changeOrderPending !== 1 ? 's' : ''} pending</span>
                          <span className="attention-item-action">Review in Financials</span>
                        </div>
                        <span className="attention-item-arrow">→</span>
                      </div>
                    )}
                    {projectData?.pendingMaterialRequests > 0 && (
                      <div className="attention-item" onClick={() => setActiveProjectTab('activity')}>
                        <div className="attention-item-icon warning">
                          <MessageSquare size={16} />
                        </div>
                        <div className="attention-item-content">
                          <span className="attention-item-title">{projectData.pendingMaterialRequests} material request{projectData.pendingMaterialRequests !== 1 ? 's' : ''} pending</span>
                          <span className="attention-item-action">Review in Activity</span>
                        </div>
                        <span className="attention-item-arrow">→</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Work Areas */}
              <div className="overview-section-card">
                <div className="section-card-header">
                  <h3>Work Areas</h3>
                  <div className="section-card-badges">
                    {areasComplete > 0 && <span className="section-badge done">{areasComplete} Complete</span>}
                    {areasWorking > 0 && <span className="section-badge working">{areasWorking} Active</span>}
                    {areasNotStarted > 0 && <span className="section-badge pending">{areasNotStarted} Pending</span>}
                  </div>
                </div>
                <div className="work-areas-list">
                  {areas.map(area => (
                    <div key={area.id} className={`work-area-item ${area.status}`}>
                      <div className="work-area-status">
                        {area.status === 'done' && <span className="status-icon done">✓</span>}
                        {area.status === 'working' && <span className="status-icon working">●</span>}
                        {area.status === 'not_started' && <span className="status-icon pending">○</span>}
                      </div>
                      <div className="work-area-info">
                        <span className="work-area-name">{area.name}</span>
                        <span className="work-area-weight">
                          {area.scheduled_value ? formatCurrency(area.scheduled_value) : `${area.weight}%`}
                        </span>
                      </div>
                      <div className="work-area-bar">
                        <div
                          className={`work-area-fill ${area.status}`}
                          style={{ width: area.status === 'done' ? '100%' : area.status === 'working' ? '50%' : '0%' }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="overview-stats-row">
                <div className="quick-stat-card" onClick={() => setActiveProjectTab('reports')}>
                  <div className="quick-stat-icon"><ClipboardList size={20} /></div>
                  <div className="quick-stat-content">
                    <span className="quick-stat-value">{projectData?.dailyReportsCount || 0}</span>
                    <span className="quick-stat-label">Daily Reports</span>
                  </div>
                  <span className="quick-stat-arrow">→</span>
                </div>
                <div className="quick-stat-card" onClick={() => setActiveProjectTab('financials')}>
                  <div className="quick-stat-icon"><DollarSign size={20} /></div>
                  <div className="quick-stat-content">
                    <span className="quick-stat-value">{projectData?.totalTickets || 0}</span>
                    <span className="quick-stat-label">T&M Tickets</span>
                  </div>
                  <span className="quick-stat-arrow">→</span>
                </div>
                <div className="quick-stat-card" onClick={() => setActiveProjectTab('activity')}>
                  <div className="quick-stat-icon"><MessageSquare size={20} /></div>
                  <div className="quick-stat-content">
                    <span className="quick-stat-value">{projectData?.totalMaterialRequests || 0}</span>
                    <span className="quick-stat-label">Material Requests</span>
                  </div>
                  <span className="quick-stat-arrow">→</span>
                </div>
              </div>
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
            <div className="pv-tab-panel reports-tab">
              {/* Hero Metrics */}
              <div className="reports-hero">
                <div className="reports-hero-grid">
                  {/* Total Reports */}
                  <div className="reports-metric primary">
                    <div className="reports-metric-icon">
                      <ClipboardList size={24} />
                    </div>
                    <div className="reports-metric-content">
                      <div className="reports-metric-value">{projectData?.dailyReportsCount || 0}</div>
                      <div className="reports-metric-label">Daily Reports</div>
                    </div>
                  </div>

                  {/* This Week */}
                  <div className="reports-metric">
                    <div className="reports-metric-value">{projectData?.recentDailyReports || 0}</div>
                    <div className="reports-metric-label">This Week</div>
                    <div className="reports-metric-bar">
                      <div
                        className="reports-metric-fill"
                        style={{ width: `${Math.min((projectData?.recentDailyReports || 0) / 7 * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Injury Reports */}
                  <div className={`reports-metric ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
                    <div className="reports-metric-value">{projectData?.injuryReportsCount || 0}</div>
                    <div className="reports-metric-label">Injuries</div>
                    <div className="reports-metric-status">
                      {(projectData?.injuryReportsCount || 0) === 0 ? 'No incidents' : 'Review required'}
                    </div>
                  </div>

                  {/* Last Report */}
                  <div className="reports-metric">
                    <div className="reports-metric-value small">
                      {projectData?.lastDailyReport
                        ? new Date(projectData.lastDailyReport).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'None'
                      }
                    </div>
                    <div className="reports-metric-label">Last Filed</div>
                    {projectData?.lastDailyReport && (
                      <div className="reports-metric-detail">
                        {Math.floor((new Date() - new Date(projectData.lastDailyReport)) / (1000 * 60 * 60 * 24))} days ago
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Daily Reports Section */}
              <div className="reports-section-card">
                <div className="reports-section-header">
                  <div className="reports-section-title">
                    <ClipboardList size={18} />
                    <h3>Daily Reports</h3>
                  </div>
                  <span className="reports-section-count">{projectData?.dailyReportsCount || 0} total</span>
                </div>
                <div className="reports-section-content">
                  <DailyReportsList project={selectedProject} company={company} onShowToast={onShowToast} />
                </div>
              </div>

              {/* Injury Reports Section */}
              <div className={`reports-section-card ${(projectData?.injuryReportsCount || 0) > 0 ? 'has-warning' : ''}`}>
                <div className="reports-section-header">
                  <div className="reports-section-title">
                    <span className={`reports-section-icon ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
                      {(projectData?.injuryReportsCount || 0) > 0 ? '⚠' : '✓'}
                    </span>
                    <h3>Safety & Injury Reports</h3>
                  </div>
                  <span className={`reports-section-badge ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
                    {(projectData?.injuryReportsCount || 0) > 0
                      ? `${projectData.injuryReportsCount} incident${projectData.injuryReportsCount !== 1 ? 's' : ''}`
                      : 'No incidents'
                    }
                  </span>
                </div>
                <div className="reports-section-content">
                  <InjuryReportsList
                    project={selectedProject}
                    companyId={company?.id || selectedProject?.company_id}
                    company={company}
                    onShowToast={onShowToast}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ACTIVITY TAB */}
          {activeProjectTab === 'activity' && (
            <div className="pv-tab-panel activity-tab">
              {/* Hero Metrics */}
              <div className="activity-hero">
                <div className="activity-hero-grid">
                  {/* Pending Requests */}
                  <div className={`activity-metric ${(projectData?.pendingMaterialRequests || 0) > 0 ? 'warning' : 'success'}`}>
                    <div className="activity-metric-icon">
                      {(projectData?.pendingMaterialRequests || 0) > 0 ? '!' : '✓'}
                    </div>
                    <div className="activity-metric-content">
                      <div className="activity-metric-value">{projectData?.pendingMaterialRequests || 0}</div>
                      <div className="activity-metric-label">Pending</div>
                    </div>
                  </div>

                  {/* Total Requests */}
                  <div className="activity-metric">
                    <div className="activity-metric-value">{projectData?.totalMaterialRequests || 0}</div>
                    <div className="activity-metric-label">Total Requests</div>
                  </div>

                  {/* Fulfillment Rate */}
                  <div className="activity-metric">
                    <div className="activity-metric-value">
                      {projectData?.totalMaterialRequests > 0
                        ? Math.round(((projectData.totalMaterialRequests - (projectData.pendingMaterialRequests || 0)) / projectData.totalMaterialRequests) * 100)
                        : 100
                      }%
                    </div>
                    <div className="activity-metric-label">Fulfilled</div>
                    <div className="activity-metric-bar">
                      <div
                        className="activity-metric-fill"
                        style={{
                          width: `${projectData?.totalMaterialRequests > 0
                            ? ((projectData.totalMaterialRequests - (projectData.pendingMaterialRequests || 0)) / projectData.totalMaterialRequests) * 100
                            : 100
                          }%`
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Quick Status */}
                  <div className="activity-metric status">
                    <div className="activity-metric-status-icon">
                      <MessageSquare size={20} />
                    </div>
                    <div className="activity-metric-label">Messages Active</div>
                  </div>
                </div>
              </div>

              {/* Attention Banner - Only if pending */}
              {(projectData?.pendingMaterialRequests || 0) > 0 && (
                <div className="activity-attention-banner">
                  <span className="attention-icon">!</span>
                  <span className="attention-text">
                    {projectData.pendingMaterialRequests} material request{projectData.pendingMaterialRequests !== 1 ? 's' : ''} awaiting response
                  </span>
                </div>
              )}

              {/* Material Requests Section */}
              <div className={`activity-section-card ${(projectData?.pendingMaterialRequests || 0) > 0 ? 'has-pending' : ''}`}>
                <div className="activity-section-header">
                  <div className="activity-section-title">
                    <HardHat size={18} />
                    <h3>Material Requests</h3>
                  </div>
                  <div className="activity-section-badges">
                    {(projectData?.pendingMaterialRequests || 0) > 0 && (
                      <span className="activity-badge pending">{projectData.pendingMaterialRequests} pending</span>
                    )}
                    <span className="activity-badge total">{projectData?.totalMaterialRequests || 0} total</span>
                  </div>
                </div>
                <div className="activity-section-content">
                  <MaterialRequestsList project={selectedProject} company={company} onShowToast={onShowToast} />
                </div>
              </div>

              {/* Messages Section */}
              <div className="activity-section-card messages">
                <div className="activity-section-header">
                  <div className="activity-section-title">
                    <MessageSquare size={18} />
                    <h3>Project Messages</h3>
                  </div>
                </div>
                <div className="activity-section-content">
                  <ProjectMessages
                    project={selectedProject}
                    company={company}
                    userName={company?.name || 'Office'}
                    onShowToast={onShowToast}
                  />
                </div>
              </div>
            </div>
          )}

          {/* INFO TAB */}
          {activeProjectTab === 'info' && (
            <div className="pv-tab-panel info-tab">
              {/* Hero Header */}
              <div className="info-hero">
                <div className="info-hero-content">
                  <div className="info-hero-main">
                    <h2 className="info-hero-title">{selectedProject.name}</h2>
                    {selectedProject.job_number && (
                      <span className="info-hero-job">Job #{selectedProject.job_number}</span>
                    )}
                  </div>
                  <button className="btn btn-primary btn-with-icon" onClick={handleEditClick}>
                    <span>Edit Project</span>
                  </button>
                </div>
                {selectedProject.address && (
                  <div className="info-hero-address">
                    <MapPin size={14} />
                    <span>{selectedProject.address}</span>
                  </div>
                )}
              </div>

              {/* Quick Info Cards */}
              <div className="info-quick-grid">
                {/* Work Type */}
                <div className="info-quick-card">
                  <div className="info-quick-icon">
                    <HardHat size={20} />
                  </div>
                  <div className="info-quick-content">
                    <span className="info-quick-value">
                      {selectedProject.work_type === 'environmental' ? 'Environmental' : 'Demolition'}
                    </span>
                    <span className="info-quick-label">Work Type</span>
                  </div>
                </div>

                {/* Job Type */}
                <div className="info-quick-card">
                  <div className="info-quick-icon">
                    <FileText size={20} />
                  </div>
                  <div className="info-quick-content">
                    <span className="info-quick-value">
                      {selectedProject.job_type === 'prevailing_wage' ? 'Prevailing Wage' : 'Standard'}
                    </span>
                    <span className="info-quick-label">Job Type</span>
                  </div>
                </div>

                {/* Contract Value */}
                <div className="info-quick-card highlight">
                  <div className="info-quick-icon">
                    <DollarSign size={20} />
                  </div>
                  <div className="info-quick-content">
                    <span className="info-quick-value">{formatCurrency(revisedContractValue)}</span>
                    <span className="info-quick-label">
                      {changeOrderValue > 0 ? `Incl. +${formatCurrency(changeOrderValue)} COs` : 'Contract Value'}
                    </span>
                  </div>
                </div>

                {/* Foreman PIN */}
                {selectedProject.pin && (
                  <div className="info-quick-card">
                    <div className="info-quick-icon">
                      <span className="info-pin-icon">#</span>
                    </div>
                    <div className="info-quick-content">
                      <span className="info-quick-value mono">{selectedProject.pin}</span>
                      <span className="info-quick-label">Foreman PIN</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Client & Contractor Card */}
              <div className="info-section-card">
                <div className="info-section-header">
                  <Building2 size={18} />
                  <h3>Client & Contractor</h3>
                </div>
                <div className="info-section-content">
                  {selectedProject.general_contractor ? (
                    <div className="info-detail-row">
                      <span className="info-detail-label">General Contractor</span>
                      <span className="info-detail-value">{selectedProject.general_contractor}</span>
                    </div>
                  ) : (
                    <div className="info-detail-row empty">
                      <span className="info-detail-value">No general contractor specified</span>
                    </div>
                  )}
                  {selectedProject.client_contact && (
                    <div className="info-detail-row">
                      <span className="info-detail-label">Client Contact</span>
                      <span className="info-detail-value">{selectedProject.client_contact}</span>
                    </div>
                  )}
                  {selectedProject.client_phone && (
                    <div className="info-detail-row clickable">
                      <span className="info-detail-label">
                        <Phone size={14} />
                        Phone
                      </span>
                      <a href={`tel:${selectedProject.client_phone}`} className="info-detail-value link">
                        {selectedProject.client_phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Work Areas Card */}
              <div className="info-section-card">
                <div className="info-section-header">
                  <LayoutGrid size={18} />
                  <h3>Work Areas</h3>
                  <div className="info-section-badges">
                    {areasComplete > 0 && <span className="info-badge done">{areasComplete} Done</span>}
                    {areasWorking > 0 && <span className="info-badge working">{areasWorking} Active</span>}
                    {areasNotStarted > 0 && <span className="info-badge pending">{areasNotStarted} Pending</span>}
                  </div>
                </div>
                <div className="info-areas-list">
                  {areas.map(area => (
                    <div key={area.id} className={`info-area-item ${area.status}`}>
                      <div className="info-area-status">
                        {area.status === 'done' && <span className="status-dot done">✓</span>}
                        {area.status === 'working' && <span className="status-dot working">●</span>}
                        {area.status === 'not_started' && <span className="status-dot pending">○</span>}
                      </div>
                      <div className="info-area-details">
                        <span className="info-area-name">{area.name}</span>
                        <span className={`info-area-status-label ${area.status}`}>
                          {area.status === 'done' ? 'Complete' : area.status === 'working' ? 'In Progress' : 'Not Started'}
                        </span>
                      </div>
                      <span className="info-area-weight">{area.weight}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Project Settings - Collapsible */}
              <details className="info-details-section">
                <summary className="info-details-summary">
                  <Info size={16} />
                  <span>Additional Settings</span>
                </summary>
                <div className="info-details-content">
                  <div className="info-detail-row">
                    <span className="info-detail-label">Original Contract</span>
                    <span className="info-detail-value">{formatCurrency(selectedProject.contract_value)}</span>
                  </div>
                  {changeOrderValue > 0 && (
                    <div className="info-detail-row">
                      <span className="info-detail-label">Approved Change Orders</span>
                      <span className="info-detail-value positive">+{formatCurrency(changeOrderValue)}</span>
                    </div>
                  )}
                  {selectedProject.default_dump_site_id && (
                    <div className="info-detail-row">
                      <span className="info-detail-label">Default Dump Site</span>
                      <span className="info-detail-value">
                        {dumpSites.find(s => s.id === selectedProject.default_dump_site_id)?.name || 'Unknown'}
                      </span>
                    </div>
                  )}
                </div>
              </details>
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


