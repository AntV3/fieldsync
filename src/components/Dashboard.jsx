import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { db, equipmentOps } from '../lib/supabase'
import { safeAsync } from '../lib/errorHandler'
import { formatCurrency, calculateValueProgress, calculateScheduleInsights, shouldAutoArchive } from '../lib/utils'
import usePortfolioMetrics from '../hooks/usePortfolioMetrics'
import useProjectEdit from '../hooks/useProjectEdit'
import { exportAllFieldDocumentsPDF, exportDailyReportsPDF, exportIncidentReportsPDF, exportCrewCheckinsPDF } from '../lib/fieldDocumentExport'
import { LayoutGrid, DollarSign, ClipboardList, Info, FolderOpen, BarChart3 } from 'lucide-react'
import { useUniversalSearch } from './UniversalSearch'
import { TicketSkeleton } from './ui'
import ProjectEditForm from './dashboard/ProjectEditForm'
import PortfolioView from './dashboard/PortfolioView'
import DashboardModals from './dashboard/DashboardModals'

// Lazy load tab components - only load the active tab's code
const OverviewTab = lazy(() => import('./dashboard/tabs/OverviewTab'))
const FinancialsTab = lazy(() => import('./dashboard/tabs/FinancialsTab'))
const ReportsTab = lazy(() => import('./dashboard/tabs/ReportsTab'))
const InfoTab = lazy(() => import('./dashboard/tabs/InfoTab'))
const DocumentsTab = lazy(() => import('./documents/DocumentsTab'))
const AnalyticsTab = lazy(() => import('./dashboard/tabs/AnalyticsTab'))

export default function Dashboard({ company, user, isAdmin, onShowToast, navigateToProjectId, onProjectNavigated }) {
  const [projects, setProjects] = useState([])
  const [projectsData, setProjectsData] = useState([]) // Enhanced data with areas/tickets
  const [selectedProject, setSelectedProject] = useState(null)
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [activeProjectTab, setActiveProjectTab] = useState('overview')
  const [financialsSection, setFinancialsSection] = useState('overview') // 'overview' | 'cors' | 'tickets'
  const [financialsSidebarCollapsed, setFinancialsSidebarCollapsed] = useState(true) // Start collapsed for more real estate
  const [financialsSidebarMobileOpen, setFinancialsSidebarMobileOpen] = useState(false) // For mobile sidebar overlay
  const [corListExpanded, setCORListExpanded] = useState(false) // Whether the full card list is shown below the log
  const [corDisplayMode, setCORDisplayMode] = useState('list') // 'list' | 'log' - for layout expansion
  const [tmViewMode, setTMViewMode] = useState('preview') // 'preview' | 'full'
  const [showCORForm, setShowCORForm] = useState(false)
  const [editingCOR, setEditingCOR] = useState(null)
  const [showCORDetail, setShowCORDetail] = useState(false)
  const [viewingCOR, setViewingCOR] = useState(null)
  const [corRefreshKey, setCORRefreshKey] = useState(0)
  const [showAddCostModal, setShowAddCostModal] = useState(false)
  const [savingCost, setSavingCost] = useState(false)
  const [showEquipmentModal, setShowEquipmentModal] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState(null)
  const [equipmentRefreshKey, setEquipmentRefreshKey] = useState(0)
  const [showDrawRequestModal, setShowDrawRequestModal] = useState(false)
  const [editingDrawRequest, setEditingDrawRequest] = useState(null)
  const [drawRequestRefreshKey, setDrawRequestRefreshKey] = useState(0)

  // Universal Search (Cmd+K)
  const { isOpen: isSearchOpen, setIsOpen: setSearchOpen, close: closeSearch } = useUniversalSearch()

  // Portfolio metrics (extracted hook)
  const { portfolioMetrics, projectHealth, scheduleMetrics, riskAnalysis } = usePortfolioMetrics(projectsData)

  // Project edit mode (extracted hook)
  const {
    editMode, editData, saving,
    handleEditClick, handleCancelEdit, handleEditChange,
    handleAreaEditChange, handleAddArea, handleRemoveArea,
    handleSaveEdit, handleDeleteProject
  } = useProjectEdit({ selectedProject, areas, company, onShowToast, loadAreas, setSelectedProject })

  // Debounce ref to prevent cascading refreshes from multiple subscription callbacks
  // When multiple real-time events fire rapidly, this coalesces them into a single refresh
  const refreshTimeoutRef = useRef(null)
  const pendingAreasRefreshRef = useRef(false)
  const pendingCORRefreshRef = useRef(false)
  const mountedRef = useRef(true)

  // Refs to hold latest versions of load functions, preventing stale closures in debouncedRefresh
  const loadAreasRef = useRef(null)
  const loadProjectsRef = useRef(null)

  // Cache for project details to avoid re-fetching when switching between projects
  // Key: projectId, Value: { data: enhancedProjectData, timestamp: Date.now() }
  const projectDetailsCacheRef = useRef(new Map())
  const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minute cache TTL

  // Debounced refresh function that coalesces multiple rapid refresh requests
  // This prevents 5+ loadProjects() calls when multiple subscriptions fire at once
  // Uses refs to always call the latest versions of loadAreas/loadProjects
  const debouncedRefresh = useCallback((options = {}) => {
    const { refreshAreas = false, refreshCOR = false, projectId = null } = options

    // Track what needs refreshing
    if (refreshAreas && projectId) pendingAreasRefreshRef.current = projectId
    if (refreshCOR) pendingCORRefreshRef.current = true

    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    // Schedule a single refresh after debounce period (150ms)
    // This is fast enough to feel "live" but prevents cascading calls
    refreshTimeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      // Execute pending refreshes via refs to avoid stale closures
      if (pendingAreasRefreshRef.current) {
        await loadAreasRef.current?.(pendingAreasRefreshRef.current)
        pendingAreasRefreshRef.current = false
      }
      if (pendingCORRefreshRef.current) {
        setCORRefreshKey(prev => prev + 1)
        pendingCORRefreshRef.current = false
      }
      // Invalidate detail cache for the selected project so real-time data is fresh
      if (projectId) {
        projectDetailsCacheRef.current.delete(projectId)
      }
      // Always refresh projects to update metrics
      await loadProjectsRef.current?.()
    }, 150)
  }, [])

  // Cleanup debounce timeout and mounted flag on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  // Initial load
  useEffect(() => {
    if (company?.id) {
      loadProjects()
    }
  }, [company?.id])

  // Track project IDs for subscription stability (avoids re-subscribing on every projects array change)
  const projectIdsRef = useRef([])
  const projectIdsKey = projects.map(p => p.id).sort().join(',')

  // Real-time subscription - runs after projects are loaded
  useEffect(() => {
    if (!company?.id || projects.length === 0) return

    // Only update ref if project IDs actually changed
    const currentIds = projects.map(p => p.id).sort()
    projectIdsRef.current = currentIds

    // Subscribe to company-wide activity to refresh metrics in real-time
    // Uses debounced refresh to coalesce rapid updates from multiple sources
    const subscription = db.subscribeToCompanyActivity?.(company.id, currentIds, {
      onMessage: () => debouncedRefresh(),
      onMaterialRequest: () => debouncedRefresh(),
      onTMTicket: () => debouncedRefresh(),
      onCrewCheckin: () => debouncedRefresh(), // Crew check-ins affect labor costs
      onAreaUpdate: () => debouncedRefresh(), // Area updates affect progress
      onCORChange: () => debouncedRefresh({ refreshCOR: true }), // COR changes
      onInjuryReport: () => debouncedRefresh(),
      onProjectChange: () => debouncedRefresh(), // Project details changed
      onMaterialsEquipmentChange: () => debouncedRefresh(), // Pricing updates
      onLaborRateChange: () => debouncedRefresh(), // Labor rate updates
      onPunchListChange: () => debouncedRefresh(), // Punch list items created/resolved by field
      onInvoiceChange: () => debouncedRefresh(), // Invoice created/updated/paid
      onDrawRequestChange: () => debouncedRefresh(), // Draw request changes
      onProjectEquipmentChange: () => debouncedRefresh(), // Equipment added/removed/returned
      onProjectCostChange: () => debouncedRefresh(), // Custom cost entries
      onDailyReportChange: () => debouncedRefresh() // Daily reports submitted from field
    })

    return () => {
      if (subscription) {
        db.unsubscribe?.(subscription)
      }
    }
  }, [company?.id, projectIdsKey, debouncedRefresh])

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (financialsSidebarMobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [financialsSidebarMobileOpen])

  // Handle navigation from notifications
  // Use a ref to prevent re-running this effect when projects data refreshes
  const lastNavigatedIdRef = useRef(null)
  useEffect(() => {
    if (navigateToProjectId && navigateToProjectId !== lastNavigatedIdRef.current && projects.length > 0) {
      const project = projects.find(p => p.id === navigateToProjectId)
      if (project) {
        lastNavigatedIdRef.current = navigateToProjectId
        setSelectedProject(project)
        onProjectNavigated?.() // Clear the navigation request
      }
    }
  }, [navigateToProjectId, projects, onProjectNavigated])

  useEffect(() => {
    if (selectedProject) {
      loadAreas(selectedProject.id)

      // Subscribe to real-time updates for the selected project
      // All callbacks use debouncedRefresh to prevent cascading refreshes
      const subscriptions = []
      const projectId = selectedProject.id

      // Areas subscription - also refreshes areas list
      const areasSub = db.subscribeToAreas?.(projectId, () => {
        debouncedRefresh({ refreshAreas: true, projectId })
      })
      if (areasSub) subscriptions.push(areasSub)

      // Daily reports subscription
      const dailyReportsSub = db.subscribeToDailyReports?.(projectId, () => {
        debouncedRefresh()
      })
      if (dailyReportsSub) subscriptions.push(dailyReportsSub)

      // Crew checkins subscription (affects labor costs)
      const checkinsSub = db.subscribeToCrewCheckins?.(projectId, () => {
        debouncedRefresh()
      })
      if (checkinsSub) subscriptions.push(checkinsSub)

      // CORs subscription - also refreshes COR list
      const corsSub = db.subscribeToCORs?.(projectId, () => {
        debouncedRefresh({ refreshCOR: true })
      })
      if (corsSub) subscriptions.push(corsSub)

      // Invoices subscription
      const invoicesSub = db.subscribeToInvoices?.(projectId, () => {
        debouncedRefresh()
      })
      if (invoicesSub) subscriptions.push(invoicesSub)

      // Project costs subscription
      const costsSub = db.subscribeToProjectCosts?.(projectId, () => {
        debouncedRefresh()
      })
      if (costsSub) subscriptions.push(costsSub)

      // T&M tickets subscription
      const tmSub = db.subscribeToTMTickets?.(projectId, () => {
        debouncedRefresh()
      })
      if (tmSub) subscriptions.push(tmSub)

      // Material requests subscription
      const matReqSub = db.subscribeToMaterialRequests?.(projectId, () => {
        debouncedRefresh()
      })
      if (matReqSub) subscriptions.push(matReqSub)

      // Messages subscription
      const msgSub = db.subscribeToMessages?.(projectId, () => {
        debouncedRefresh()
      })
      if (msgSub) subscriptions.push(msgSub)

      return () => {
        subscriptions.forEach(sub => db.unsubscribe?.(sub))
      }
    }
  }, [selectedProject, debouncedRefresh])

  // When navigating to tickets section, switch to full mode to show dashboard
  useEffect(() => {
    if (financialsSection === 'tickets') {
      setTMViewMode('full')
    }
  }, [financialsSection])

  // Load detailed data for a single project (on-demand, with caching)
  // This replaces the previous N+1 pattern where ALL project details were loaded upfront
  const loadProjectDetails = async (project, forceRefresh = false) => {
    const cacheKey = project.id
    const cached = projectDetailsCacheRef.current.get(cacheKey)

    // Return cached data if valid and not forcing refresh
    if (cached && !forceRefresh && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return cached.data
    }

    try {
      // Fetch detailed project data in parallel (15 queries for 1 project, not 15N)
      const [
        projectAreas,
        tickets,
        changeOrderData,
        dailyReports,
        injuryReports,
        laborCosts,
        customCosts,
        corStats,
        crewHistory,
        materialRequests,
        projectEquipment,
        projectInvoices,
        punchListItems
      ] = await Promise.all([
        safeAsync(() => db.getAreas(project.id), { fallback: [], context: { operation: 'getAreas', projectId: project.id } }),
        safeAsync(() => db.getTMTickets(project.id), { fallback: [], context: { operation: 'getTMTickets', projectId: project.id } }),
        safeAsync(() => db.getChangeOrderTotals(project.id), { fallback: null, context: { operation: 'getChangeOrderTotals', projectId: project.id } }),
        safeAsync(() => db.getDailyReports(project.id, 100), { fallback: [], context: { operation: 'getDailyReports', projectId: project.id } }),
        safeAsync(() => db.getInjuryReports(project.id), { fallback: [], context: { operation: 'getInjuryReports', projectId: project.id } }),
        safeAsync(() => db.calculateManDayCosts(project.id, company?.id, project.work_type || 'demolition', project.job_type || 'standard'), { fallback: null, context: { operation: 'calculateManDayCosts', projectId: project.id } }),
        safeAsync(() => db.getProjectCosts(project.id), { fallback: [], context: { operation: 'getProjectCosts', projectId: project.id } }),
        safeAsync(() => db.getCORStats(project.id), { fallback: null, context: { operation: 'getCORStats', projectId: project.id } }),
        safeAsync(() => db.getCrewCheckinHistory(project.id, 60), { fallback: [], context: { operation: 'getCrewCheckinHistory', projectId: project.id } }),
        safeAsync(() => db.getMaterialRequests(project.id), { fallback: [], context: { operation: 'getMaterialRequests', projectId: project.id } }),
        safeAsync(() => equipmentOps.getProjectEquipment(project.id), { fallback: [], context: { operation: 'getProjectEquipment', projectId: project.id } }),
        safeAsync(() => db.getProjectInvoices(project.id), { fallback: [], context: { operation: 'getProjectInvoices', projectId: project.id } }),
        safeAsync(() => db.getPunchListItems(project.id), { fallback: [], context: { operation: 'getPunchListItems', projectId: project.id } })
      ])

      // Calculate progress - use SOV values if available
      const progressData = calculateValueProgress(projectAreas)
      const progress = progressData.progress

      // Calculate revised contract value
      const changeOrderValue = changeOrderData?.totalApprovedValue || 0
      const revisedContractValue = project.contract_value + changeOrderValue

      // Billable calculation
      const billable = progressData.isValueBased
        ? progressData.earnedValue
        : (progress / 100) * revisedContractValue
      const pendingTickets = tickets.filter(t => t.status === 'pending').length

      // Recent activity
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      const recentDailyReports = dailyReports.filter(r => new Date(r.report_date) >= oneWeekAgo).length

      // Custom costs
      const customCostTotal = customCosts.reduce((sum, c) => {
        const amount = parseFloat(c.amount)
        return sum + (isNaN(amount) ? 0 : amount)
      }, 0)

      // Materials/equipment costs from T&M
      let materialsEquipmentCost = 0
      const materialsEquipmentByDate = {}
      tickets.forEach(ticket => {
        const ticketDate = ticket.work_date || ticket.ticket_date || ticket.created_at?.split('T')[0]
        const items = ticket.t_and_m_items || ticket.items || []
        let ticketMaterialsCost = 0
        items.forEach(item => {
          const qty = parseFloat(item.quantity) || 1
          const cost = parseFloat(item.unit_cost) || parseFloat(item.materials_equipment?.cost_per_unit) || 0
          ticketMaterialsCost += qty * cost
        })
        if (ticketMaterialsCost > 0 && ticketDate) {
          materialsEquipmentCost += ticketMaterialsCost
          if (!materialsEquipmentByDate[ticketDate]) {
            materialsEquipmentByDate[ticketDate] = { date: ticketDate, cost: 0 }
          }
          materialsEquipmentByDate[ticketDate].cost += ticketMaterialsCost
        }
      })
      const materialsEquipmentByDateArray = Object.values(materialsEquipmentByDate)
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      // Total costs
      const laborCost = laborCosts?.totalCost || 0
      // Project equipment rental costs (daily rate * days on site, stored in cents)
      const projectEquipmentCost = equipmentOps.calculateProjectEquipmentCost(projectEquipment || [])
      const allCostsTotal = laborCost + materialsEquipmentCost + customCostTotal + projectEquipmentCost

      // Total billed from invoices (for cash flow analytics)
      const totalBilled = (projectInvoices || [])
        .filter(inv => inv.status !== 'draft')
        .reduce((sum, inv) => sum + (parseFloat(inv.total) || parseFloat(inv.amount) || 0), 0)

      // Crew check-ins formatted for resource analytics (with worker_count for each entry)
      const crewCheckins = (crewHistory || []).map(checkin => ({
        ...checkin,
        worker_count: (checkin.workers || []).length,
      }))

      // Recent injury count (last 30 days) for benchmark comparison
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const recentInjuryCount = injuryReports.filter(r => {
        const incidentDate = new Date(r.incident_date || r.created_at)
        return incidentDate >= thirtyDaysAgo
      }).length

      // Profit calculations
      const currentProfit = billable - allCostsTotal
      const profitMargin = billable > 0 ? (currentProfit / billable) * 100 : 0

      // Burn rate
      const laborDays = laborCosts?.byDate?.length || 0
      const materialsDays = materialsEquipmentByDateArray.length
      const totalBurnDays = Math.max(laborDays, materialsDays)
      const totalBurn = laborCost + materialsEquipmentCost + customCostTotal + projectEquipmentCost
      const dailyBurn = totalBurnDays > 0 ? totalBurn / totalBurnDays : 0

      // Schedule insights
      const scheduleInsights = calculateScheduleInsights(
        { ...project, progress },
        laborCosts?.totalManDays || 0
      )

      // Crew analytics from check-in history
      const crewByDate = {}
      const uniqueWorkers = new Set()
      ;(crewHistory || []).forEach(checkin => {
        const workers = checkin.workers || []
        crewByDate[checkin.check_in_date] = workers.length
        workers.forEach(w => uniqueWorkers.add(w.name?.toLowerCase()))
      })
      const crewDates = Object.keys(crewByDate).sort()
      const avgCrewSize = crewDates.length > 0
        ? Math.round(crewDates.reduce((sum, d) => sum + crewByDate[d], 0) / crewDates.length * 10) / 10
        : 0
      const peakCrewSize = crewDates.length > 0
        ? Math.max(...crewDates.map(d => crewByDate[d]))
        : 0
      // Crew trend: compare last 7 days avg to prior 7 days avg
      const recentCrewDates = crewDates.slice(-7)
      const priorCrewDates = crewDates.slice(-14, -7)
      const recentCrewAvg = recentCrewDates.length > 0
        ? recentCrewDates.reduce((s, d) => s + crewByDate[d], 0) / recentCrewDates.length
        : 0
      const priorCrewAvg = priorCrewDates.length > 0
        ? priorCrewDates.reduce((s, d) => s + crewByDate[d], 0) / priorCrewDates.length
        : 0

      // Material request analytics
      const pendingMaterialRequests = (materialRequests || []).filter(r => r.status === 'pending').length
      const orderedMaterialRequests = (materialRequests || []).filter(r => r.status === 'ordered').length
      const deliveredMaterialRequests = (materialRequests || []).filter(r => r.status === 'delivered').length
      const urgentMaterialRequests = (materialRequests || []).filter(r => r.priority === 'urgent' && r.status === 'pending').length

      // Daily report field notes analysis
      const reportsWithIssues = dailyReports.filter(r => r.issues && r.issues.trim().length > 0).length
      const totalPhotosFromTickets = tickets.reduce((sum, t) => sum + (t.photos?.length || 0), 0)

      // Days since last injury
      const lastInjuryDate = injuryReports.length > 0
        ? new Date(injuryReports[0]?.incident_date || injuryReports[0]?.created_at)
        : null
      const daysSinceLastInjury = lastInjuryDate
        ? Math.floor((new Date() - lastInjuryDate) / (1000 * 60 * 60 * 24))
        : null

      // Task completion velocity: areas completed in last 14 days vs prior 14 days
      const completedAreas = projectAreas.filter(a => a.status === 'done')

      const enhancedData = {
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
        tmTickets: tickets,
        dailyReportsCount: dailyReports.length,
        recentDailyReports,
        injuryReportsCount: injuryReports.length,
        lastDailyReport: dailyReports[0]?.report_date || null,
        isValueBased: progressData.isValueBased,
        earnedValue: progressData.earnedValue,
        totalSOVValue: progressData.totalValue,
        laborCost,
        laborDaysWorked: laborDays,
        laborManDays: laborCosts?.totalManDays || 0,
        laborByDate: laborCosts?.byDate || [],
        dailyBurn,
        materialsEquipmentCost,
        materialsEquipmentByDate: materialsEquipmentByDateArray,
        projectEquipmentCost,
        customCosts,
        customCostTotal,
        totalBurn,
        totalBurnDays,
        allCostsTotal,
        currentProfit,
        profitMargin,
        corPendingValue: corStats?.total_pending_value || 0,
        corPendingCount: corStats?.pending_count || 0,
        corApprovedValue: corStats?.total_approved_value || 0,
        corBilledValue: corStats?.total_billed_value || 0,
        corTotalCount: corStats?.total_cors || 0,
        corStats: corStats,
        scheduleStatus: scheduleInsights.scheduleStatus,
        scheduleVariance: scheduleInsights.scheduleVariance,
        scheduleLabel: scheduleInsights.scheduleLabel,
        laborStatus: scheduleInsights.laborStatus,
        laborVariance: scheduleInsights.laborVariance,
        laborLabel: scheduleInsights.laborLabel,
        hasScheduleData: scheduleInsights.hasScheduleData,
        hasLaborData: scheduleInsights.hasLaborData,
        actualManDays: laborCosts?.totalManDays || 0,
        // Crew analytics
        crewHistory: crewHistory || [],
        crewByDate,
        uniqueWorkerCount: uniqueWorkers.size,
        avgCrewSize,
        peakCrewSize,
        crewDaysTracked: crewDates.length,
        crewTrend: priorCrewAvg > 0 ? ((recentCrewAvg - priorCrewAvg) / priorCrewAvg * 100) : 0,
        recentCrewAvg,
        // Material requests
        materialRequests: materialRequests || [],
        pendingMaterialRequests,
        orderedMaterialRequests,
        deliveredMaterialRequests,
        urgentMaterialRequests,
        totalMaterialRequests: (materialRequests || []).length,
        // Field activity insights
        reportsWithIssues,
        totalPhotosFromTickets,
        dailyReports,
        // Safety analytics
        daysSinceLastInjury,
        injuryReports,
        recentInjuryCount,
        oshaRecordable: injuryReports.filter(r => r.osha_recordable).length,
        // Invoices & billing analytics
        invoices: projectInvoices || [],
        totalBilled,
        // Crew check-ins for resource analytics
        crewCheckins,
        // Punch list items
        punchListItems: punchListItems || [],
        // Completion
        completedAreasCount: completedAreas.length,
        hasError: false,
        _detailsLoaded: true
      }

      // Cache the enhanced data
      projectDetailsCacheRef.current.set(cacheKey, {
        data: enhancedData,
        timestamp: Date.now()
      })

      return enhancedData
    } catch (error) {
      console.error(`Error loading details for project ${project.id}:`, error)
      return { ...project, hasError: true, _detailsLoaded: false }
    }
  }

  // OPTIMIZED: Load projects with summary data only (1 query instead of 9N)
  // Detailed data is loaded on-demand when a project is selected
  const loadProjects = async () => {
    try {
      // Single optimized query for all project summaries
      const data = await db.getProjectDashboardSummary(company?.id)
      setProjects(data)

      // Create lightweight enhanced data using ONLY summary metrics from the RPC
      // This uses data already returned from getProjectDashboardSummary (no additional queries!)
      // Detailed data is loaded on-demand via loadProjectDetails when a project is selected
      const enhanced = data.map(project => {
        // Check if we have cached detailed data for this project
        const cached = projectDetailsCacheRef.current.get(project.id)
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
          // Use cached detailed data if still valid
          return cached.data
        }

        // Use summary data from RPC (no additional queries needed)
        // Progress is estimated from area counts in the summary
        const totalAreas = project.areaCount || 0
        const completedAreas = project.completedAreas || 0
        const progress = totalAreas > 0 ? Math.round((completedAreas / totalAreas) * 100) : 0

        return {
          ...project,
          // Basic metrics from summary (already loaded)
          progress,
          areas: [], // Loaded on-demand when project selected
          totalTickets: project.ticketCount || 0,
          pendingTickets: project.pendingTicketCount || 0,
          approvedTickets: project.approvedTicketCount || 0,
          dailyReportsCount: project.dailyReportsThisWeek || 0,
          recentDailyReports: project.dailyReportsThisWeek || 0,
          corTotalCount: project.corCount || 0,
          // Placeholder values - loaded on-demand when selected
          billable: 0,
          changeOrderValue: 0,
          revisedContractValue: project.contract_value || 0,
          changeOrderPending: 0,
          tmTickets: [],
          injuryReportsCount: 0,
          lastDailyReport: null,
          isValueBased: false,
          earnedValue: 0,
          totalSOVValue: 0,
          laborCost: 0,
          laborDaysWorked: 0,
          laborManDays: 0,
          laborByDate: [],
          dailyBurn: 0,
          materialsEquipmentCost: 0,
          materialsEquipmentByDate: [],
          projectEquipmentCost: 0,
          customCosts: [],
          customCostTotal: 0,
          totalBurn: 0,
          totalBurnDays: 0,
          allCostsTotal: 0,
          currentProfit: 0,
          profitMargin: 0,
          corPendingValue: 0,
          corPendingCount: 0,
          corApprovedValue: 0,
          corBilledValue: 0,
          corStats: null,
          scheduleStatus: 'on_track',
          scheduleVariance: 0,
          scheduleLabel: 'On Track',
          laborStatus: 'on_track',
          laborVariance: 0,
          laborLabel: null,
          hasScheduleData: false,
          hasLaborData: false,
          actualManDays: 0,
          // Analytics data - loaded on-demand when selected
          invoices: [],
          totalBilled: 0,
          crewCheckins: [],
          punchListItems: [],
          recentInjuryCount: 0,
          hasError: false,
          _detailsLoaded: false // Flag to indicate detailed data needs loading
        }
      })
      setProjectsData(enhanced)
    } catch (error) {
      console.error('Error loading projects:', error)
      onShowToast('Error loading projects', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadAreas(projectId) {
    try {
      const data = await db.getAreas(projectId)
      setAreas(data)
    } catch (error) {
      console.error('Error loading areas:', error)
    }
  }

  // Keep refs in sync so debouncedRefresh always calls the latest versions
  loadAreasRef.current = loadAreas
  loadProjectsRef.current = loadProjects

  const handleSelectProject = async (project) => {
    // Set the project immediately for responsive UI
    setSelectedProject(project)

    // If detailed data hasn't been loaded yet, load it now (lazy loading)
    if (!project._detailsLoaded) {
      const detailedProject = await loadProjectDetails(project)

      // Update projectsData with the detailed version
      setProjectsData(prev => prev.map(p =>
        p.id === project.id ? detailedProject : p
      ))

      // Update selectedProject with detailed data
      setSelectedProject(detailedProject)
    }
  }

  const handleBack = () => {
    setSelectedProject(null)
    setAreas([])
    handleCancelEdit()
    setActiveProjectTab('overview')
    loadProjects()
  }

  // Edit handlers provided by useProjectEdit hook

  // Memoize selected project data lookup to avoid repeated finds
  // NOTE: All hooks must be before any conditional returns (React rules of hooks)
  const projectData = useMemo(() => {
    if (!selectedProject) return null
    return projectsData.find(p => p.id === selectedProject.id)
  }, [selectedProject, projectsData])

  // Memoize progress calculations - these are expensive and only change when areas change
  const progressCalculations = useMemo(() => {
    if (!selectedProject) {
      return { progress: 0, billable: 0, isValueBased: false, earnedValue: 0, totalSOVValue: 0, changeOrderValue: 0, revisedContractValue: 0 }
    }

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

    return {
      progress,
      billable,
      changeOrderValue,
      revisedContractValue,
      isValueBased: progressData.isValueBased,
      earnedValue: progressData.earnedValue,
      totalSOVValue: progressData.totalValue
    }
  }, [selectedProject, areas, projectData])

  // Portfolio metrics, project health, schedule metrics, and risk analysis
  // provided by usePortfolioMetrics hook

  // Handler for alert actions
  const handleAlertAction = useCallback(({ target, projectId, alert }) => {
    const project = projects.find(p => p.id === projectId)
    if (project) {
      setSelectedProject(project)
      // Navigate to appropriate tab based on action target
      if (target === 'financials') {
        setActiveProjectTab('financials')
      } else if (target === 'reports') {
        setActiveProjectTab('reports')
      } else if (target === 'cors') {
        setActiveProjectTab('financials')
        setFinancialsSection('cors')
      } else {
        setActiveProjectTab('overview')
      }
    }
  }, [projects])

  // Auto-archive projects that have been complete for 30+ days
  useEffect(() => {
    const checkAutoArchive = async () => {
      for (const project of projectsData) {
        if (shouldAutoArchive(project, 30)) {
          try {
            await db.archiveProject(project.id)
            onShowToast(`Project "${project.name}" has been auto-archived after 30 days of completion`, 'info')
          } catch (error) {
            console.error('Failed to auto-archive project:', error)
          }
        }
      }
    }

    if (projectsData.length > 0) {
      checkAutoArchive()
    }
  }, [projectsData.length]) // Run when projects data loads

  // Memoized callbacks for child components to prevent unnecessary re-renders
  const handleAddEquipment = useCallback(() => {
    setEditingEquipment(null)
    setShowEquipmentModal(true)
  }, [])

  const handleEditEquipment = useCallback((item) => {
    setEditingEquipment(item)
    setShowEquipmentModal(true)
  }, [])

  const handleCreateDraw = useCallback(() => {
    setEditingDrawRequest(null)
    setShowDrawRequestModal(true)
  }, [])

  const handleViewDraw = useCallback((drawRequest) => {
    setEditingDrawRequest(drawRequest)
    setShowDrawRequestModal(true)
  }, [])

  const handleViewAllTickets = useCallback(() => {
    setTMViewMode('full')
  }, [])

  const handleToggleFinancialsSidebar = useCallback(() => {
    setFinancialsSidebarCollapsed(prev => !prev)
  }, [])

  const handleToggleMobileSidebar = useCallback(() => {
    setFinancialsSidebarMobileOpen(prev => !prev)
  }, [])

  const handleCloseMobileSidebar = useCallback(() => {
    setFinancialsSidebarMobileOpen(false)
  }, [])

  const handleToggleCORList = useCallback(() => {
    setCORListExpanded(prev => !prev)
  }, [])

  // Field document export handler
  const handleExportFieldDocuments = useCallback(async (type = 'all') => {
    if (!selectedProject) return
    onShowToast('Gathering field data...', 'info')
    try {
      const [dailyReports, injuryReports, crewCheckins] = await Promise.all([
        db.getDailyReports(selectedProject.id, 365),
        db.getInjuryReports(selectedProject.id),
        db.getCrewCheckinHistory(selectedProject.id, 365)
      ])

      const exportContext = { company }

      if (type === 'daily') {
        await exportDailyReportsPDF(dailyReports || [], selectedProject, exportContext)
      } else if (type === 'incidents') {
        await exportIncidentReportsPDF(injuryReports || [], selectedProject, exportContext)
      } else if (type === 'crew') {
        await exportCrewCheckinsPDF(crewCheckins || [], selectedProject, exportContext)
      } else {
        await exportAllFieldDocumentsPDF({
          dailyReports: dailyReports || [],
          incidentReports: injuryReports || [],
          crewCheckins: crewCheckins || [],
          project: selectedProject,
          context: exportContext
        })
      }
      onShowToast('PDF exported!', 'success')
    } catch (error) {
      console.error('Error exporting field documents:', error)
      onShowToast('Error generating PDF', 'error')
    }
  }, [selectedProject, company, onShowToast])

  const handleBackToTMPreview = useCallback(() => {
    setTMViewMode('preview')
  }, [])

  const handleViewFullCORLog = useCallback(() => {
    setCORDisplayMode('log')
  }, [])

  const handleCreateCOR = useCallback(() => {
    setEditingCOR(null)
    setShowCORForm(true)
  }, [])

  const handleViewCOR = useCallback((cor) => {
    setViewingCOR(cor)
    setShowCORDetail(true)
  }, [])

  const handleEditCOR = useCallback((cor) => {
    setEditingCOR(cor)
    setShowCORForm(true)
  }, [])

  const handleAddCost = useCallback(() => {
    setShowAddCostModal(true)
  }, [])

  const handleDeleteCost = useCallback(async (costId) => {
    try {
      await db.deleteProjectCost(costId)
      // Invalidate cache for this project so fresh data is loaded
      if (selectedProject?.id) {
        projectDetailsCacheRef.current.delete(selectedProject.id)
      }
      loadProjects()
      onShowToast?.('Cost deleted', 'success')
    } catch (err) {
      onShowToast?.('Error deleting cost', 'error')
    }
  }, [selectedProject?.id]) // onShowToast is stable (memoized in App.jsx)

  // Memoize stats for FinancialsNav to prevent re-renders from inline object creation
  const financialsNavStats = useMemo(() => ({
    corCount: projectData?.corTotalCount || 0,
    ticketCount: projectData?.totalTickets || 0,
    corPending: projectData?.corPendingCount || 0,
    ticketPending: projectData?.pendingTickets || 0
  }), [projectData?.corTotalCount, projectData?.totalTickets, projectData?.corPendingCount, projectData?.pendingTickets])

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
    // Extract memoized values
    const { progress, billable, changeOrderValue, revisedContractValue, isValueBased, earnedValue, totalSOVValue } = progressCalculations

    // Edit Mode
    if (editMode && editData) {
      return (
        <ProjectEditForm
          editData={editData}
          saving={saving}
          onCancel={handleCancelEdit}
          onEditChange={handleEditChange}
          onAreaEditChange={handleAreaEditChange}
          onAddArea={handleAddArea}
          onRemoveArea={handleRemoveArea}
          onSave={handleSaveEdit}
          onDelete={() => handleDeleteProject(loadProjects)}
        />
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

    // Tab definitions with pending badges
    const pendingCount = (projectData?.pendingTickets || 0) + (projectData?.changeOrderPending || 0)
    const tabs = [
      { id: 'overview', label: 'Overview', Icon: LayoutGrid },
      { id: 'financials', label: 'Financials', Icon: DollarSign, badge: pendingCount },
      { id: 'reports', label: 'Reports', Icon: ClipboardList },
      { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
      { id: 'documents', label: 'Documents', Icon: FolderOpen },
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

          {/* Key Metrics Bar - Critical KPIs above the fold (F-pattern) */}
          <div className="pv-metrics-bar" role="region" aria-label="Key project metrics">
            <div className="pv-metric">
              <span className="pv-metric-value" aria-label={`${progress} percent complete`}>{progress}%</span>
              <span className="pv-metric-label">Complete</span>
            </div>
            <div className="pv-metric-divider" aria-hidden="true"></div>
            <div className="pv-metric">
              <span className="pv-metric-value">{formatCurrency(billable)}</span>
              <span className="pv-metric-label">Billed</span>
            </div>
            <div className="pv-metric-divider" aria-hidden="true"></div>
            <div className="pv-metric">
              <span className="pv-metric-value highlight">{formatCurrency(revisedContractValue - billable)}</span>
              <span className="pv-metric-label">Remaining</span>
            </div>
          </div>

          {/* Tab Navigation - ARIA tablist for keyboard navigation */}
          <div className="pv-tabs" role="tablist" aria-label="Project dashboard tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeProjectTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`pv-tab ${activeProjectTab === tab.id ? 'active' : ''} ${tab.badge > 0 ? 'has-badge' : ''}`}
                onClick={() => setActiveProjectTab(tab.id)}
                tabIndex={activeProjectTab === tab.id ? 0 : -1}
                onKeyDown={(e) => {
                  const tabIds = tabs.map(t => t.id)
                  const currentIndex = tabIds.indexOf(tab.id)
                  let nextIndex = -1
                  if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabIds.length
                  else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length
                  else if (e.key === 'Home') nextIndex = 0
                  else if (e.key === 'End') nextIndex = tabIds.length - 1
                  if (nextIndex !== -1) {
                    e.preventDefault()
                    setActiveProjectTab(tabIds[nextIndex])
                    document.getElementById(`tab-${tabIds[nextIndex]}`)?.focus()
                  }
                }}
              >
                <tab.Icon size={16} className="pv-tab-icon" aria-hidden="true" />
                <span className="pv-tab-label">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="pv-tab-badge" aria-label={`${tab.badge} items`}>{tab.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="pv-tab-content" role="tabpanel" id={`tabpanel-${activeProjectTab}`} aria-labelledby={`tab-${activeProjectTab}`}>
          {/* OVERVIEW TAB */}
          {activeProjectTab === 'overview' && (
            <OverviewTab
              selectedProject={selectedProject}
              projectData={projectData}
              progress={progress}
              billable={billable}
              revisedContractValue={revisedContractValue}
              changeOrderValue={changeOrderValue}
              areas={areas}
              areasComplete={areasComplete}
              areasWorking={areasWorking}
              areasNotStarted={areasNotStarted}
              companyId={company?.id}
              onShowToast={onShowToast}
              onSetActiveTab={setActiveProjectTab}
              onExportFieldDocuments={handleExportFieldDocuments}
            />
          )}

          {/* FINANCIALS TAB */}
          {activeProjectTab === 'financials' && (
            <FinancialsTab
              selectedProject={selectedProject}
              company={company}
              user={user}
              projectData={projectData}
              progress={progress}
              billable={billable}
              changeOrderValue={changeOrderValue}
              revisedContractValue={revisedContractValue}
              areas={areas}
              financialsSection={financialsSection}
              setFinancialsSection={setFinancialsSection}
              financialsSidebarCollapsed={financialsSidebarCollapsed}
              financialsSidebarMobileOpen={financialsSidebarMobileOpen}
              onToggleFinancialsSidebar={handleToggleFinancialsSidebar}
              onToggleMobileSidebar={handleToggleMobileSidebar}
              onCloseMobileSidebar={handleCloseMobileSidebar}
              financialsNavStats={financialsNavStats}
              corListExpanded={corListExpanded}
              corRefreshKey={corRefreshKey}
              corDisplayMode={corDisplayMode}
              setCORDisplayMode={setCORDisplayMode}
              onToggleCORList={handleToggleCORList}
              onCreateCOR={handleCreateCOR}
              onViewCOR={handleViewCOR}
              onEditCOR={handleEditCOR}
              tmViewMode={tmViewMode}
              onViewAllTickets={handleViewAllTickets}
              onBackToTMPreview={handleBackToTMPreview}
              equipmentRefreshKey={equipmentRefreshKey}
              onAddEquipment={handleAddEquipment}
              onEditEquipment={handleEditEquipment}
              drawRequestRefreshKey={drawRequestRefreshKey}
              onCreateDraw={handleCreateDraw}
              onViewDraw={handleViewDraw}
              onAddCost={handleAddCost}
              onDeleteCost={handleDeleteCost}
              onShowToast={onShowToast}
            />
          )}

          {/* REPORTS TAB */}
          {activeProjectTab === 'reports' && (
            <ReportsTab
              selectedProject={selectedProject}
              projectData={projectData}
              areas={areas}
              company={company}
              user={user}
              onShowToast={onShowToast}
            />
          )}

          {/* ANALYTICS TAB */}
          {activeProjectTab === 'analytics' && (
            <Suspense fallback={<TicketSkeleton />}>
              <AnalyticsTab
                selectedProject={selectedProject}
                projectData={projectData}
                progress={progress}
                billable={billable}
                revisedContractValue={revisedContractValue}
                changeOrderValue={changeOrderValue}
                areas={areas}
                allProjects={projects}
                crewCheckins={projectData?.crewCheckins || []}
                invoices={projectData?.invoices || []}
                punchListItems={projectData?.punchListItems || []}
                dailyReports={projectData?.dailyReports || []}
              />
            </Suspense>
          )}

          {/* DOCUMENTS TAB */}
          {activeProjectTab === 'documents' && (
            <div className="pv-tab-panel documents-tab">
              <Suspense fallback={<TicketSkeleton />}>
                <DocumentsTab
                  project={selectedProject}
                  companyId={company?.id || selectedProject?.company_id}
                  onShowToast={onShowToast}
                  userRole={user?.access_level || 'office'}
                />
              </Suspense>
            </div>
          )}

          {/* INFO TAB */}
          {activeProjectTab === 'info' && (
            <InfoTab
              selectedProject={selectedProject}
              areas={areas}
              changeOrderValue={changeOrderValue}
              revisedContractValue={revisedContractValue}
              company={company}
              user={user}
              isAdmin={isAdmin}
              onShowToast={onShowToast}
              onEditClick={handleEditClick}
            />
          )}
        </div>

        <DashboardModals
          selectedProject={selectedProject}
          company={company}
          user={user}
          areas={areas}
          showShareModal={showShareModal}
          onCloseShareModal={() => setShowShareModal(false)}
          onShareCreated={() => onShowToast('Share link created successfully!', 'success')}
          onShowToast={onShowToast}
          showNotificationSettings={showNotificationSettings}
          onCloseNotificationSettings={() => setShowNotificationSettings(false)}
          showCORForm={showCORForm}
          editingCOR={editingCOR}
          onCloseCORForm={() => { setShowCORForm(false); setEditingCOR(null) }}
          onCORSaved={() => { setShowCORForm(false); setEditingCOR(null); setCORRefreshKey(prev => prev + 1) }}
          showCORDetail={showCORDetail}
          viewingCOR={viewingCOR}
          onCloseCORDetail={() => { setShowCORDetail(false); setViewingCOR(null) }}
          onEditCORFromDetail={(cor) => { setShowCORDetail(false); setViewingCOR(null); setEditingCOR(cor); setShowCORForm(true) }}
          onCORStatusChange={() => { setCORRefreshKey(prev => prev + 1); debouncedRefresh({ refreshCOR: true }) }}
          corDisplayMode={corDisplayMode}
          onCloseCORLog={() => setCORDisplayMode('list')}
          showAddCostModal={showAddCostModal}
          savingCost={savingCost}
          onCloseAddCostModal={() => setShowAddCostModal(false)}
          onSaveCost={async (costData) => {
            try {
              setSavingCost(true)
              await db.addProjectCost(selectedProject.id, company.id, costData)
              setShowAddCostModal(false)
              projectDetailsCacheRef.current.delete(selectedProject.id)
              loadProjects()
              onShowToast('Cost added successfully', 'success')
            } catch (err) {
              console.error('Error adding cost:', err)
              onShowToast('Error adding cost', 'error')
            } finally {
              setSavingCost(false)
            }
          }}
          showEquipmentModal={showEquipmentModal}
          editingEquipment={editingEquipment}
          onEquipmentSaved={() => { setShowEquipmentModal(false); setEditingEquipment(null); setEquipmentRefreshKey(prev => prev + 1); onShowToast(editingEquipment ? 'Equipment updated' : 'Equipment added', 'success') }}
          onCloseEquipmentModal={() => { setShowEquipmentModal(false); setEditingEquipment(null) }}
          showDrawRequestModal={showDrawRequestModal}
          editingDrawRequest={editingDrawRequest}
          projectsData={projectsData}
          onDrawRequestSaved={() => { setShowDrawRequestModal(false); setEditingDrawRequest(null); setDrawRequestRefreshKey(prev => prev + 1); onShowToast(editingDrawRequest ? 'Draw request updated' : 'Draw request created', 'success') }}
          onCloseDrawRequestModal={() => { setShowDrawRequestModal(false); setEditingDrawRequest(null) }}
        />
      </div>
    )
  }

  // Project List View - empty state
  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <ClipboardList size={48} className="empty-state-icon" />
        <h3>No Projects Yet</h3>
        <p>Create your first project to get started</p>
      </div>
    )
  }

  // Portfolio overview
  return (
    <PortfolioView
      projects={projects}
      projectsData={projectsData}
      portfolioMetrics={portfolioMetrics}
      projectHealth={projectHealth}
      scheduleMetrics={scheduleMetrics}
      riskAnalysis={riskAnalysis}
      isSearchOpen={isSearchOpen}
      setSearchOpen={setSearchOpen}
      closeSearch={closeSearch}
      company={company}
      onSelectProject={handleSelectProject}
      onAlertAction={handleAlertAction}
      onShowToast={onShowToast}
      onSelectTicket={(ticket) => {
        const project = projects.find(p => p.id === ticket.project_id)
        if (project) {
          handleSelectProject(project)
          setActiveProjectTab('financials')
          setFinancialsSection('tickets')
        }
      }}
      onSelectCOR={(cor) => {
        const project = projects.find(p => p.id === cor.project_id)
        if (project) {
          handleSelectProject(project)
          setActiveProjectTab('financials')
          setFinancialsSection('cors')
          setViewingCOR(cor)
          setShowCORDetail(true)
        }
      }}
    />
  )
}


