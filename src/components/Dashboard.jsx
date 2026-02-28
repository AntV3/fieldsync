import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { db } from '../lib/supabase'
import { safeAsync } from '../lib/errorHandler'
import { formatCurrency, calculateProgress, calculateValueProgress, getOverallStatus, getOverallStatusLabel, calculateScheduleInsights, shouldAutoArchive } from '../lib/utils'
import usePortfolioMetrics from '../hooks/usePortfolioMetrics'
import useProjectEdit from '../hooks/useProjectEdit'
import { exportAllFieldDocumentsPDF, exportDailyReportsPDF, exportIncidentReportsPDF, exportCrewCheckinsPDF } from '../lib/fieldDocumentExport'
import { exportProjectFinancials, exportToQuickBooksIIF } from '../lib/financialExport'
import { LayoutGrid, DollarSign, ClipboardList, HardHat, Truck, Info, FolderOpen, Search, Download, FileText, Menu, AlertTriangle, Package, Users, Shield, TrendingUp, TrendingDown, CheckCircle2, Camera, MapPin, Building2, Phone, ArrowRight } from 'lucide-react'
import UniversalSearch, { useUniversalSearch } from './UniversalSearch'
import { SmartAlerts } from './dashboard/SmartAlerts'
import OverviewProgressGauge from './overview/OverviewProgressGauge'
import OverviewFinancialCard from './overview/OverviewFinancialCard'
import OverviewCrewMetrics from './overview/OverviewCrewMetrics'
import HeroMetrics from './HeroMetrics'
import { TicketSkeleton } from './ui'
import OnboardingWizard from './onboarding/OnboardingWizard'
import { isOnboardingComplete } from './onboarding/onboardingState'

// Financials components
import FinancialsNav from './FinancialsNav'
import { FinancialTrendChart } from './charts'
import ProfitabilityCard from './ProfitabilityCard'
import CostContributorsCard from './CostContributorsCard'
import DisposalSummary from './DisposalSummary'
import ProjectEquipmentCard from './equipment/ProjectEquipmentCard'
import ProgressBillingCard from './billing/ProgressBillingCard'
import ManDayCosts from './ManDayCosts'
import BurnRateCard from './BurnRateCard'

// Reports components
import DailyReportsList from './DailyReportsList'
import InjuryReportsList from './InjuryReportsList'

// Settings components
import ProjectTeam from './ProjectTeam'
import MFASetup from './MFASetup'

// Lazy load modals and conditionally rendered heavy components
const ShareModal = lazy(() => import('./ShareModal'))
const NotificationSettings = lazy(() => import('./NotificationSettings'))
const CORForm = lazy(() => import('./cor/CORForm'))
const CORDetail = lazy(() => import('./cor/CORDetail'))
const CORLog = lazy(() => import('./cor/CORLog'))
const DrawRequestModal = lazy(() => import('./billing/DrawRequestModal'))
const EquipmentModal = lazy(() => import('./equipment/EquipmentModal'))
const AddCostModal = lazy(() => import('./AddCostModal'))
const DocumentsTab = lazy(() => import('./documents/DocumentsTab'))
const CORLogPreview = lazy(() => import('./cor/CORLogPreview'))
const CORList = lazy(() => import('./cor/CORList'))
const TMList = lazy(() => import('./TMList'))
const BillingCenter = lazy(() => import('./billing/BillingCenter'))
const PhotoTimeline = lazy(() => import('./PhotoTimeline'))
const PunchList = lazy(() => import('./PunchList'))
import EarnedValueCard from './charts/EarnedValueCard'

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
  const [dumpSites, setDumpSites] = useState([])
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
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingComplete())

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

  // Cache for project details to avoid re-fetching when switching between projects
  // Key: projectId, Value: { data: enhancedProjectData, timestamp: Date.now() }
  const projectDetailsCacheRef = useRef(new Map())
  const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minute cache TTL

  // Debounced refresh function that coalesces multiple rapid refresh requests
  // This prevents 5+ loadProjects() calls when multiple subscriptions fire at once
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
      // Execute pending refreshes
      if (pendingAreasRefreshRef.current) {
        await loadAreas(pendingAreasRefreshRef.current)
        pendingAreasRefreshRef.current = false
      }
      if (pendingCORRefreshRef.current) {
        setCORRefreshKey(prev => prev + 1)
        pendingCORRefreshRef.current = false
      }
      // Always refresh projects to update metrics
      await loadProjects()
    }, 150)
  }, [])

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  // Initial load
  useEffect(() => {
    if (company?.id) {
      loadProjects()
      loadDumpSites()
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
      onPunchListChange: () => debouncedRefresh() // Punch list items created/resolved by field
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

  const loadDumpSites = async () => {
    try {
      const sites = await db.getDumpSites(company.id)
      setDumpSites(sites || [])
    } catch (error) {
      console.error('Error loading dump sites:', error)
    }
  }

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

      // Haul offs subscription
      const haulOffsSub = db.subscribeToHaulOffs?.(projectId, () => {
        debouncedRefresh()
      })
      if (haulOffsSub) subscriptions.push(haulOffsSub)

      // CORs subscription - also refreshes COR list
      const corsSub = db.subscribeToCORs?.(projectId, () => {
        debouncedRefresh({ refreshCOR: true })
      })
      if (corsSub) subscriptions.push(corsSub)

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
      // Fetch detailed project data in parallel (12 queries for 1 project, not 12N)
      const [
        projectAreas,
        tickets,
        changeOrderData,
        dailyReports,
        injuryReports,
        laborCosts,
        haulOffCosts,
        customCosts,
        corStats,
        crewHistory,
        materialRequests,
        weeklyDisposal
      ] = await Promise.all([
        safeAsync(() => db.getAreas(project.id), { fallback: [], context: { operation: 'getAreas', projectId: project.id } }),
        safeAsync(() => db.getTMTickets(project.id), { fallback: [], context: { operation: 'getTMTickets', projectId: project.id } }),
        safeAsync(() => db.getChangeOrderTotals(project.id), { fallback: null, context: { operation: 'getChangeOrderTotals', projectId: project.id } }),
        safeAsync(() => db.getDailyReports(project.id, 100), { fallback: [], context: { operation: 'getDailyReports', projectId: project.id } }),
        safeAsync(() => db.getInjuryReports(project.id), { fallback: [], context: { operation: 'getInjuryReports', projectId: project.id } }),
        safeAsync(() => db.calculateManDayCosts(project.id, company?.id, project.work_type || 'demolition', project.job_type || 'standard'), { fallback: null, context: { operation: 'calculateManDayCosts', projectId: project.id } }),
        safeAsync(() => db.calculateHaulOffCosts(project.id), { fallback: null, context: { operation: 'calculateHaulOffCosts', projectId: project.id } }),
        safeAsync(() => db.getProjectCosts(project.id), { fallback: [], context: { operation: 'getProjectCosts', projectId: project.id } }),
        safeAsync(() => db.getCORStats(project.id), { fallback: null, context: { operation: 'getCORStats', projectId: project.id } }),
        safeAsync(() => db.getCrewCheckinHistory(project.id, 60), { fallback: [], context: { operation: 'getCrewCheckinHistory', projectId: project.id } }),
        safeAsync(() => db.getMaterialRequests(project.id), { fallback: [], context: { operation: 'getMaterialRequests', projectId: project.id } }),
        safeAsync(() => db.getWeeklyDisposalSummary(project.id, 4), { fallback: [], context: { operation: 'getWeeklyDisposalSummary', projectId: project.id } })
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
      const haulOffCost = haulOffCosts?.totalCost || 0
      const allCostsTotal = laborCost + haulOffCost + materialsEquipmentCost + customCostTotal

      // Profit calculations
      const currentProfit = billable - allCostsTotal
      const profitMargin = billable > 0 ? (currentProfit / billable) * 100 : 0

      // Burn rate
      const laborDays = laborCosts?.byDate?.length || 0
      const materialsDays = materialsEquipmentByDateArray.length
      const totalBurnDays = Math.max(laborDays, materialsDays)
      const totalBurn = laborCost + haulOffCost + materialsEquipmentCost + customCostTotal
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

      // Disposal totals from weekly data
      const disposalTotalLoads = (weeklyDisposal || []).reduce((sum, w) => {
        return sum + (w.concrete || 0) + (w.trash || 0) + (w.metals || 0) + (w.hazardous_waste || 0)
      }, 0)

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
        haulOffCost,
        haulOffLoads: haulOffCosts?.totalLoads || 0,
        haulOffDays: haulOffCosts?.daysWithHaulOff || 0,
        haulOffByType: haulOffCosts?.byWasteType || {},
        haulOffByDate: haulOffCosts?.byDate || [],
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
        // Disposal trends
        weeklyDisposal: weeklyDisposal || [],
        disposalTotalLoads,
        // Safety analytics
        daysSinceLastInjury,
        injuryReports,
        oshaRecordable: injuryReports.filter(r => r.osha_recordable).length,
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
          haulOffCost: 0,
          haulOffLoads: 0,
          haulOffDays: 0,
          haulOffByType: {},
          haulOffByDate: [],
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
  }, []) // Only run on mount

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

      if (type === 'daily') {
        await exportDailyReportsPDF(dailyReports || [], selectedProject)
      } else if (type === 'incidents') {
        await exportIncidentReportsPDF(injuryReports || [], selectedProject)
      } else if (type === 'crew') {
        await exportCrewCheckinsPDF(crewCheckins || [], selectedProject)
      } else {
        await exportAllFieldDocumentsPDF({
          dailyReports: dailyReports || [],
          incidentReports: injuryReports || [],
          crewCheckins: crewCheckins || [],
          project: selectedProject
        })
      }
      onShowToast('PDF exported!', 'success')
    } catch (error) {
      console.error('Error exporting field documents:', error)
      onShowToast('Error generating PDF', 'error')
    }
  }, [selectedProject, onShowToast])

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
      loadProjects()
      onShowToast?.('Cost deleted', 'success')
    } catch (err) {
      onShowToast?.('Error deleting cost', 'error')
    }
  }, []) // onShowToast is stable (memoized in App.jsx)

  // Memoize stats for FinancialsNav to prevent re-renders from inline object creation
  const financialsNavStats = useMemo(() => ({
    corCount: projectData?.corTotalCount || 0,
    ticketCount: projectData?.totalTickets || 0,
    corPending: projectData?.corPendingCount || 0,
    ticketPending: projectData?.pendingTickets || 0
  }), [projectData?.corTotalCount, projectData?.totalTickets, projectData?.corPendingCount, projectData?.pendingTickets])

  // Destructure memoized values for cleaner usage below
  const { totalOriginalContract, totalChangeOrders, totalPortfolioValue, totalEarned, totalRemaining, weightedCompletion, totalPendingCORValue, totalPendingCORCount } = portfolioMetrics
  const { projectsComplete, projectsOnTrack, projectsAtRisk, projectsOverBudget, projectsWithChangeOrders } = projectHealth
  const { scheduleAhead, scheduleOnTrack, scheduleBehind, laborOver, laborUnder, laborOnTrack, hasAnyScheduleData, hasAnyLaborData } = scheduleMetrics

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
            onClick={() => handleDeleteProject(loadProjects)}
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

    // Tab definitions with pending badges
    const pendingCount = (projectData?.pendingTickets || 0) + (projectData?.changeOrderPending || 0)
    const tabs = [
      { id: 'overview', label: 'Overview', Icon: LayoutGrid },
      { id: 'financials', label: 'Financials', Icon: DollarSign, badge: pendingCount },
      { id: 'reports', label: 'Reports', Icon: ClipboardList },
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
                className={`pv-tab ${activeProjectTab === tab.id ? 'active' : ''} ${tab.badge > 0 ? 'has-badge' : ''}`}
                onClick={() => setActiveProjectTab(tab.id)}
              >
                <tab.Icon size={16} className="pv-tab-icon" />
                <span className="pv-tab-label">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="pv-tab-badge">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="pv-tab-content">
          {/* OVERVIEW TAB */}
          {activeProjectTab === 'overview' && (
            <div className="pv-tab-panel overview-tab animate-fade-in">
              {/* Row 1: Hero - Progress + Financials */}
              <div className="overview-hero-split">
                <OverviewProgressGauge
                  progress={progress}
                  areasComplete={areasComplete}
                  totalAreas={areas.length}
                  areasWorking={areasWorking}
                />
                <OverviewFinancialCard
                  earnedRevenue={billable}
                  totalCosts={projectData?.allCostsTotal || 0}
                  laborCost={projectData?.laborCost || 0}
                  disposalCost={projectData?.haulOffCost || 0}
                  equipmentCost={projectData?.materialsEquipmentCost || 0}
                  materialsCost={0}
                  otherCost={projectData?.customCostTotal || 0}
                  contractValue={revisedContractValue}
                />
              </div>

              {/* Row 2: Two-column grid - Crew Metrics | Work Areas */}
              <div className="overview-two-col">
                {/* Left: Crew On-Site */}
                <OverviewCrewMetrics
                  project={selectedProject}
                  onShowToast={onShowToast}
                />

                {/* Right: Work Areas */}
                <div className="overview-section-card overview-work-areas-card">
                  <div className="section-card-header">
                    <h3>Work Areas</h3>
                    <div className="section-card-badges">
                      {areasComplete > 0 && <span className="section-badge done">{areasComplete} Done</span>}
                      {areasWorking > 0 && <span className="section-badge working">{areasWorking} Active</span>}
                      {areasNotStarted > 0 && <span className="section-badge pending">{areasNotStarted} Pending</span>}
                    </div>
                  </div>
                  <div className="work-areas-list work-areas-scroll stagger-areas">
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
              </div>

              {/* Row 3: Earned Value Analysis */}
              {selectedProject?.contract_value > 0 && (
                <EarnedValueCard
                  contractValue={selectedProject.contract_value}
                  changeOrderValue={changeOrderValue}
                  progressPercent={progress}
                  actualCosts={projectData?.allCostsTotal || 0}
                  startDate={selectedProject.start_date}
                  endDate={selectedProject.end_date}
                  areas={areas}
                />
              )}

              {/* Row 4: Needs Attention (only shown when there are items) */}
              {(projectData?.pendingTickets > 0 || projectData?.changeOrderPending > 0 || projectData?.pendingMaterialRequests > 0 || projectData?.urgentMaterialRequests > 0) && (
                <div className="overview-needs-attention">
                  <div className="overview-needs-attention__header">
                    <AlertTriangle size={15} className="overview-needs-attention__icon" />
                    <span className="overview-needs-attention__title">Needs Attention</span>
                    <span className="overview-needs-attention__count">
                      {[projectData?.urgentMaterialRequests > 0, !projectData?.urgentMaterialRequests && projectData?.pendingMaterialRequests > 0, projectData?.pendingTickets > 0, projectData?.changeOrderPending > 0].filter(Boolean).length}
                    </span>
                  </div>
                  <div className="overview-needs-attention__items">
                    {projectData?.urgentMaterialRequests > 0 && (
                      <button className="overview-needs-attention__item overview-needs-attention__item--warning" onClick={() => setActiveProjectTab('reports')}>
                        <AlertTriangle size={14} className="overview-needs-attention__item-icon" />
                        <span className="overview-needs-attention__item-label">{projectData.urgentMaterialRequests} urgent material request{projectData.urgentMaterialRequests !== 1 ? 's' : ''}</span>
                        <ArrowRight size={13} className="overview-needs-attention__item-arrow" />
                      </button>
                    )}
                    {projectData?.pendingMaterialRequests > 0 && !projectData?.urgentMaterialRequests && (
                      <button className="overview-needs-attention__item overview-needs-attention__item--info" onClick={() => setActiveProjectTab('reports')}>
                        <Package size={14} className="overview-needs-attention__item-icon" />
                        <span className="overview-needs-attention__item-label">{projectData.pendingMaterialRequests} material request{projectData.pendingMaterialRequests !== 1 ? 's' : ''} pending</span>
                        <ArrowRight size={13} className="overview-needs-attention__item-arrow" />
                      </button>
                    )}
                    {projectData?.pendingTickets > 0 && (
                      <button className="overview-needs-attention__item overview-needs-attention__item--warning" onClick={() => setActiveProjectTab('financials')}>
                        <ClipboardList size={14} className="overview-needs-attention__item-icon" />
                        <span className="overview-needs-attention__item-label">{projectData.pendingTickets} T&M ticket{projectData.pendingTickets !== 1 ? 's' : ''} need approval</span>
                        <ArrowRight size={13} className="overview-needs-attention__item-arrow" />
                      </button>
                    )}
                    {projectData?.changeOrderPending > 0 && (
                      <button className="overview-needs-attention__item overview-needs-attention__item--info" onClick={() => setActiveProjectTab('financials')}>
                        <FileText size={14} className="overview-needs-attention__item-icon" />
                        <span className="overview-needs-attention__item-label">{projectData.changeOrderPending} change order{projectData.changeOrderPending !== 1 ? 's' : ''} pending</span>
                        <ArrowRight size={13} className="overview-needs-attention__item-arrow" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Row 5: Photo Timeline + Punch List */}
              <div className="overview-two-col">
                <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading photos...</div>}>
                  <PhotoTimeline
                    projectId={selectedProject?.id}
                    areas={areas}
                    onShowToast={onShowToast}
                  />
                </Suspense>
                <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading punch list...</div>}>
                  <PunchList
                    projectId={selectedProject?.id}
                    areas={areas}
                    companyId={company?.id}
                    onShowToast={onShowToast}
                  />
                </Suspense>
              </div>

              {/* Row 6: Quick Nav + Exports */}
              <div className="overview-bottom-strip">
                <div className="overview-quick-actions">
                  <button className="overview-action-btn" onClick={() => setActiveProjectTab('reports')}>
                    <ClipboardList size={15} />
                    <span>{projectData?.dailyReportsCount || 0} Reports</span>
                  </button>
                  <button className="overview-action-btn" onClick={() => setActiveProjectTab('financials')}>
                    <DollarSign size={15} />
                    <span>{projectData?.totalTickets || 0} T&M Tickets</span>
                  </button>
                  <span className="overview-action-divider" />
                  <button className="overview-action-btn export" onClick={() => handleExportFieldDocuments('all')}>
                    <Download size={15} />
                    <span>Export All</span>
                  </button>
                  <button className="overview-action-btn export" onClick={() => handleExportFieldDocuments('daily')}>
                    <Download size={14} />
                    <span>Daily</span>
                  </button>
                  <button className="overview-action-btn export" onClick={() => handleExportFieldDocuments('incidents')}>
                    <Download size={14} />
                    <span>Incidents</span>
                  </button>
                  <button className="overview-action-btn export" onClick={() => handleExportFieldDocuments('crew')}>
                    <Download size={14} />
                    <span>Crew</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FINANCIALS TAB */}
          {activeProjectTab === 'financials' && (
            <div className="pv-tab-panel financials-tab">
              {/* Export Actions */}
              <div className="export-actions" style={{ display: 'flex', gap: '8px', marginLeft: 'auto', marginBottom: '12px', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => exportProjectFinancials(selectedProject, {
                    earnedRevenue: billable,
                    approvedCORs: null,
                    laborByDate: projectData?.laborByDate,
                    haulOffByDate: projectData?.haulOffByDate,
                    customCosts: projectData?.customCosts
                  })}
                >
                  <Download size={14} /> Export CSV
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => exportToQuickBooksIIF(selectedProject, {
                    totalLaborCost: projectData?.laborCost || 0,
                    totalDisposalCost: projectData?.haulOffCost || 0
                  })}
                >
                  <Download size={14} /> QuickBooks
                </button>
              </div>
              {/* Key Metrics - Hero Section (Always visible) */}
              <HeroMetrics
                contractValue={selectedProject?.contract_value || 0}
                earnedRevenue={billable}
                totalCosts={projectData?.allCostsTotal || 0}
                profit={projectData?.currentProfit || 0}
                progress={progress}
                corApprovedValue={changeOrderValue}
                loading={!projectData}
              />

              {/* Split Layout with Collapsible Navigation */}
              <div className={`financials-layout ${financialsSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                {/* Mobile Menu Toggle Button */}
                <button
                  className="financials-mobile-menu-toggle"
                  onClick={handleToggleMobileSidebar}
                  aria-label="Open navigation menu"
                  title="Open navigation menu"
                >
                  <Menu size={20} />
                  <span>Menu</span>
                </button>

                {/* Mobile Overlay/Backdrop */}
                {financialsSidebarMobileOpen && (
                  <div
                    className="financials-sidebar-overlay"
                    onClick={handleCloseMobileSidebar}
                    aria-hidden="true"
                  />
                )}

                {/* Sidebar Navigation - Always visible, collapsible */}
                <div className={`financials-sidebar ${financialsSidebarCollapsed ? 'collapsed' : ''} ${financialsSidebarMobileOpen ? 'mobile-open' : ''}`}>
                  <FinancialsNav
                    activeSection={financialsSection}
                    onSectionChange={(section) => {
                      setFinancialsSection(section)
                      setFinancialsSidebarMobileOpen(false) // Close mobile sidebar when section changes
                    }}
                    collapsed={financialsSidebarCollapsed}
                    onToggleCollapse={handleToggleFinancialsSidebar}
                    onMobileClose={handleCloseMobileSidebar}
                    stats={financialsNavStats}
                  />
                </div>

                {/* Main Content Area */}
                <div className="financials-main">
                  {/* OVERVIEW SECTION */}
                  {financialsSection === 'overview' && (
                    <div className="financials-overview animate-fade-in">
                      {/* Financial Trend Chart */}
                      <FinancialTrendChart
                        projectData={projectData}
                        project={selectedProject}
                        tmTickets={projectData?.tmTickets || []}
                        corStats={projectData?.corStats}
                        areas={areas}
                      />

                      {/* Burn Rate & Profitability Row */}
                      <div className="financials-analysis-row stagger-children">
                        <BurnRateCard
                          dailyBurn={projectData?.dailyBurn || 0}
                          totalBurn={projectData?.totalBurn || 0}
                          daysWorked={projectData?.totalBurnDays || 0}
                          laborCost={projectData?.laborCost || 0}
                          materialsEquipmentCost={projectData?.materialsEquipmentCost || 0}
                          progress={progress}
                          contractValue={revisedContractValue}
                          laborByDate={projectData?.laborByDate || []}
                          materialsEquipmentByDate={projectData?.materialsEquipmentByDate || []}
                        />

                        <ProfitabilityCard
                          revenue={billable}
                          totalCosts={projectData?.allCostsTotal || 0}
                          contractValue={revisedContractValue}
                          progress={progress}
                        />
                      </div>

                      {/* Cost Contributors & Disposal Summary Side-by-Side */}
                      <div className="cost-disposal-row">
                        <CostContributorsCard
                          laborCost={projectData?.laborCost || 0}
                          haulOffCost={projectData?.haulOffCost || 0}
                          customCosts={projectData?.customCosts || []}
                          onAddCost={handleAddCost}
                          onDeleteCost={handleDeleteCost}
                        />

                        <DisposalSummary
                          project={selectedProject}
                          period="week"
                        />
                      </div>

                      {/* Equipment Tracking */}
                      <ProjectEquipmentCard
                        key={equipmentRefreshKey}
                        project={selectedProject}
                        onAddEquipment={handleAddEquipment}
                        onEditEquipment={handleEditEquipment}
                        onShowToast={onShowToast}
                      />

                      {/* Progress Billing / Draw Requests */}
                      <ProgressBillingCard
                        key={drawRequestRefreshKey}
                        project={selectedProject}
                        areas={areas}
                        corStats={projectData?.corStats}
                        onCreateDraw={handleCreateDraw}
                        onViewDraw={handleViewDraw}
                        onShowToast={onShowToast}
                      />

                      {/* Labor Details - Collapsible */}
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

                  {/* CHANGE ORDERS SECTION */}
                  {financialsSection === 'cors' && (
                    <div className="financials-cors animate-fade-in">
                      {/* COR Log - Always visible first */}
                      <div className="financials-section cor-section-primary">
                        <Suspense fallback={<TicketSkeleton />}>
                          <CORLogPreview
                            project={selectedProject}
                            onShowToast={onShowToast}
                            onToggleList={handleToggleCORList}
                            showingList={corListExpanded}
                            onViewFullLog={handleViewFullCORLog}
                            onCreateCOR={handleCreateCOR}
                          />
                        </Suspense>
                      </div>

                      {/* Full COR Card List - Expands below the log when toggled */}
                      {corListExpanded && (
                        <div className="financials-section cor-section-list animate-fade-in" style={{ marginTop: '1rem' }}>
                          <Suspense fallback={<TicketSkeleton />}>
                            <CORList
                              project={selectedProject}
                              company={company}
                              areas={areas}
                              refreshKey={corRefreshKey}
                              onShowToast={onShowToast}
                              previewMode={false}
                              onViewAll={handleToggleCORList}
                              onDisplayModeChange={setCORDisplayMode}
                              onCreateCOR={handleCreateCOR}
                              onViewCOR={handleViewCOR}
                              onEditCOR={handleEditCOR}
                            />
                          </Suspense>
                        </div>
                      )}
                    </div>
                  )}

                  {/* T&M TICKETS SECTION */}
                  {financialsSection === 'tickets' && (
                    <div className="financials-tickets animate-fade-in">
                      <div className="financials-section tm-section">
                        {tmViewMode === 'full' && (
                          <button
                            className="section-back-btn"
                            onClick={handleBackToTMPreview}
                          >
                            ← Back to summary
                          </button>
                        )}
                        <Suspense fallback={<TicketSkeleton />}>
                          <TMList
                            project={selectedProject}
                            company={company}
                            onShowToast={onShowToast}
                            compact={tmViewMode === 'preview'}
                            previewMode={tmViewMode === 'preview'}
                            onViewAll={handleViewAllTickets}
                          />
                        </Suspense>
                      </div>
                    </div>
                  )}

                  {/* BILLING SECTION */}
                  {financialsSection === 'billing' && (
                    <div className="financials-billing animate-fade-in">
                      <Suspense fallback={<TicketSkeleton />}>
                        <BillingCenter
                          project={selectedProject}
                          company={company}
                          user={user}
                          onShowToast={onShowToast}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* REPORTS TAB */}
          {activeProjectTab === 'reports' && (
            <div className="pv-tab-panel reports-tab">
              {/* Hero Metrics - High Level Project Pulse */}
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

                  {/* T&M Tickets */}
                  <div className="reports-metric">
                    <div className="reports-metric-value">{projectData?.totalTickets || 0}</div>
                    <div className="reports-metric-label">T&M Tickets</div>
                    {(projectData?.pendingTickets || 0) > 0 && (
                      <div className="reports-metric-status" style={{ background: '#fef3c7', color: '#92400e' }}>
                        {projectData.pendingTickets} pending
                      </div>
                    )}
                  </div>

                  {/* Photo Evidence */}
                  <div className="reports-metric">
                    <div className="reports-metric-value">{projectData?.totalPhotosFromTickets || 0}</div>
                    <div className="reports-metric-label">Photos Captured</div>
                  </div>
                </div>
              </div>

              {/* Two-Column Layout: Crew + Safety */}
              <div className="reports-two-col">
                {/* Crew Analytics Card */}
                <div className="reports-insight-card">
                  <div className="reports-insight-header">
                    <div className="reports-insight-title">
                      <Users size={18} />
                      <h3>Crew Analytics</h3>
                    </div>
                  </div>
                  <div className="reports-insight-body">
                    <div className="reports-stat-grid">
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.uniqueWorkerCount || 0}</span>
                        <span className="reports-stat-label">Total Workers</span>
                      </div>
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.avgCrewSize || 0}</span>
                        <span className="reports-stat-label">Avg Crew / Day</span>
                      </div>
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.peakCrewSize || 0}</span>
                        <span className="reports-stat-label">Peak Crew Size</span>
                      </div>
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.crewDaysTracked || 0}</span>
                        <span className="reports-stat-label">Days Tracked</span>
                      </div>
                    </div>
                    {(projectData?.crewTrend || 0) !== 0 && (
                      <div className={`reports-trend-badge ${projectData.crewTrend > 0 ? 'up' : 'down'}`}>
                        {projectData.crewTrend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        <span>{Math.abs(Math.round(projectData.crewTrend))}% {projectData.crewTrend > 0 ? 'increase' : 'decrease'} vs prior week</span>
                      </div>
                    )}
                    {/* Mini crew size bar chart */}
                    {projectData?.crewByDate && Object.keys(projectData.crewByDate).length > 0 && (
                      <div className="reports-mini-chart">
                        <div className="reports-mini-chart-label">Recent Crew Size</div>
                        <div className="reports-mini-bars">
                          {Object.keys(projectData.crewByDate).sort().slice(-14).map(date => {
                            const count = projectData.crewByDate[date]
                            const max = projectData.peakCrewSize || 1
                            return (
                              <div key={date} className="reports-mini-bar-wrap" title={`${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${count} workers`}>
                                <div className="reports-mini-bar" style={{ height: `${(count / max) * 100}%` }}></div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Safety Dashboard Card */}
                <div className="reports-insight-card">
                  <div className="reports-insight-header">
                    <div className="reports-insight-title">
                      <Shield size={18} />
                      <h3>Safety Dashboard</h3>
                    </div>
                    <span className={`reports-section-badge ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
                      {(projectData?.injuryReportsCount || 0) > 0
                        ? `${projectData.injuryReportsCount} incident${projectData.injuryReportsCount !== 1 ? 's' : ''}`
                        : 'No incidents'
                      }
                    </span>
                  </div>
                  <div className="reports-insight-body">
                    {/* Days Since Last Injury - prominent */}
                    <div className="reports-safety-hero">
                      <div className={`reports-safety-days ${(projectData?.daysSinceLastInjury === null || projectData?.daysSinceLastInjury > 30) ? 'excellent' : projectData?.daysSinceLastInjury > 7 ? 'good' : 'caution'}`}>
                        <span className="reports-safety-days-value">
                          {projectData?.daysSinceLastInjury !== null ? projectData.daysSinceLastInjury : '--'}
                        </span>
                        <span className="reports-safety-days-label">
                          {projectData?.daysSinceLastInjury !== null ? 'Days Since Last Incident' : 'No Incidents Recorded'}
                        </span>
                      </div>
                    </div>
                    <div className="reports-stat-grid">
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.injuryReportsCount || 0}</span>
                        <span className="reports-stat-label">Total Incidents</span>
                      </div>
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.oshaRecordable || 0}</span>
                        <span className="reports-stat-label">OSHA Recordable</span>
                      </div>
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.reportsWithIssues || 0}</span>
                        <span className="reports-stat-label">Reports w/ Issues</span>
                      </div>
                      <div className="reports-stat">
                        <span className="reports-stat-value">{projectData?.laborManDays || 0}</span>
                        <span className="reports-stat-label">Total Man-Days</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Material Requests + Disposal Summary Row */}
              <div className="reports-two-col">
                {/* Material Requests */}
                <div className="reports-insight-card">
                  <div className="reports-insight-header">
                    <div className="reports-insight-title">
                      <Package size={18} />
                      <h3>Material Requests</h3>
                    </div>
                    <span className="reports-section-count">{projectData?.totalMaterialRequests || 0} total</span>
                  </div>
                  <div className="reports-insight-body">
                    {(projectData?.totalMaterialRequests || 0) === 0 ? (
                      <div className="reports-empty-state">
                        <Package size={32} />
                        <p>No material requests yet</p>
                        <span>Requests from the field will appear here</span>
                      </div>
                    ) : (
                      <>
                        <div className="reports-material-pipeline">
                          {projectData?.urgentMaterialRequests > 0 && (
                            <div className="reports-material-status urgent">
                              <AlertTriangle size={14} />
                              <span>{projectData.urgentMaterialRequests} Urgent</span>
                            </div>
                          )}
                          <div className="reports-material-status pending">
                            <span className="reports-material-dot"></span>
                            <span>{projectData?.pendingMaterialRequests || 0} Pending</span>
                          </div>
                          <div className="reports-material-status ordered">
                            <span className="reports-material-dot"></span>
                            <span>{projectData?.orderedMaterialRequests || 0} Ordered</span>
                          </div>
                          <div className="reports-material-status delivered">
                            <CheckCircle2 size={14} />
                            <span>{projectData?.deliveredMaterialRequests || 0} Delivered</span>
                          </div>
                        </div>
                        {/* Recent requests */}
                        <div className="reports-recent-list">
                          {(projectData?.materialRequests || []).slice(0, 3).map(req => (
                            <div key={req.id} className={`reports-recent-item ${req.status}`}>
                              <div className="reports-recent-item-main">
                                <span className={`reports-recent-item-status ${req.status}`}>{req.status}</span>
                                <span className="reports-recent-item-date">
                                  {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <div className="reports-recent-item-detail">
                                {(req.items || []).slice(0, 2).map((item, i) => (
                                  <span key={i}>{item.name}{item.quantity ? ` (${item.quantity})` : ''}</span>
                                ))}
                                {(req.items || []).length > 2 && (
                                  <span className="reports-recent-more">+{(req.items || []).length - 2} more</span>
                                )}
                              </div>
                              {req.priority === 'urgent' && (
                                <span className="reports-urgent-tag">URGENT</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Disposal Trends */}
                <div className="reports-insight-card">
                  <div className="reports-insight-header">
                    <div className="reports-insight-title">
                      <Truck size={18} />
                      <h3>Disposal Trends</h3>
                    </div>
                    <span className="reports-section-count">{projectData?.disposalTotalLoads || 0} loads</span>
                  </div>
                  <div className="reports-insight-body">
                    {(projectData?.weeklyDisposal || []).length === 0 ? (
                      <div className="reports-empty-state">
                        <Truck size={32} />
                        <p>No disposal data yet</p>
                        <span>Disposal loads from the field will appear here</span>
                      </div>
                    ) : (
                      <>
                        {/* Stacked weekly bar chart */}
                        <div className="reports-disposal-chart">
                          <div className="reports-disposal-bars">
                            {(projectData?.weeklyDisposal || []).map((week, i) => {
                              const total = (week.concrete || 0) + (week.trash || 0) + (week.metals || 0) + (week.hazardous_waste || 0)
                              const maxWeek = Math.max(...(projectData?.weeklyDisposal || []).map(w => (w.concrete || 0) + (w.trash || 0) + (w.metals || 0) + (w.hazardous_waste || 0))) || 1
                              return (
                                <div key={i} className="reports-disposal-bar-col">
                                  <div className="reports-disposal-bar-stack" style={{ height: `${(total / maxWeek) * 100}%` }}>
                                    {week.concrete > 0 && <div className="reports-disposal-seg concrete" style={{ flex: week.concrete }} title={`Concrete: ${week.concrete}`}></div>}
                                    {week.trash > 0 && <div className="reports-disposal-seg trash" style={{ flex: week.trash }} title={`Trash: ${week.trash}`}></div>}
                                    {week.metals > 0 && <div className="reports-disposal-seg metals" style={{ flex: week.metals }} title={`Metals: ${week.metals}`}></div>}
                                    {week.hazardous_waste > 0 && <div className="reports-disposal-seg hazardous" style={{ flex: week.hazardous_waste }} title={`Hazardous: ${week.hazardous_waste}`}></div>}
                                  </div>
                                  <span className="reports-disposal-bar-label">
                                    {new Date(week.week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                          <div className="reports-disposal-legend">
                            <span className="reports-disposal-legend-item"><span className="reports-disposal-dot concrete"></span>Concrete</span>
                            <span className="reports-disposal-legend-item"><span className="reports-disposal-dot trash"></span>Trash</span>
                            <span className="reports-disposal-legend-item"><span className="reports-disposal-dot metals"></span>Metals</span>
                            <span className="reports-disposal-legend-item"><span className="reports-disposal-dot hazardous"></span>Hazardous</span>
                          </div>
                        </div>
                        {/* Haul-off cost summary */}
                        {(projectData?.haulOffCost || 0) > 0 && (
                          <div className="reports-disposal-cost">
                            <span>Total Disposal Cost</span>
                            <strong>{formatCurrency(projectData.haulOffCost)}</strong>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Field Activity Summary */}
              <div className="reports-insight-card reports-activity-summary">
                <div className="reports-insight-header">
                  <div className="reports-insight-title">
                    <ClipboardList size={18} />
                    <h3>Field Activity Summary</h3>
                  </div>
                  <div className="reports-activity-badges">
                    {projectData?.lastDailyReport && (
                      <span className="reports-last-filed">
                        Last report: {new Date(projectData.lastDailyReport).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' '}({Math.floor((new Date() - new Date(projectData.lastDailyReport)) / (1000 * 60 * 60 * 24))}d ago)
                      </span>
                    )}
                  </div>
                </div>
                <div className="reports-insight-body">
                  <div className="reports-activity-grid">
                    <div className="reports-activity-stat">
                      <div className="reports-activity-stat-icon"><ClipboardList size={16} /></div>
                      <div className="reports-activity-stat-info">
                        <strong>{projectData?.dailyReportsCount || 0}</strong>
                        <span>Daily Reports Filed</span>
                      </div>
                    </div>
                    <div className="reports-activity-stat">
                      <div className="reports-activity-stat-icon"><FileText size={16} /></div>
                      <div className="reports-activity-stat-info">
                        <strong>{projectData?.totalTickets || 0}</strong>
                        <span>T&M Tickets Created</span>
                      </div>
                    </div>
                    <div className="reports-activity-stat">
                      <div className="reports-activity-stat-icon"><Camera size={16} /></div>
                      <div className="reports-activity-stat-info">
                        <strong>{projectData?.totalPhotosFromTickets || 0}</strong>
                        <span>Photos Documented</span>
                      </div>
                    </div>
                    <div className="reports-activity-stat">
                      <div className="reports-activity-stat-icon"><HardHat size={16} /></div>
                      <div className="reports-activity-stat-info">
                        <strong>{projectData?.completedAreasCount || 0}/{areas.length}</strong>
                        <span>Work Areas Complete</span>
                      </div>
                    </div>
                    <div className="reports-activity-stat">
                      <div className="reports-activity-stat-icon"><DollarSign size={16} /></div>
                      <div className="reports-activity-stat-info">
                        <strong>{formatCurrency(projectData?.allCostsTotal || 0)}</strong>
                        <span>Total Costs Tracked</span>
                      </div>
                    </div>
                    <div className="reports-activity-stat">
                      <div className="reports-activity-stat-icon"><Users size={16} /></div>
                      <div className="reports-activity-stat-info">
                        <strong>{projectData?.laborManDays || 0}</strong>
                        <span>Total Man-Days</span>
                      </div>
                    </div>
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
                  <Suspense fallback={<TicketSkeleton />}>
                    <DailyReportsList project={selectedProject} company={company} onShowToast={onShowToast} />
                  </Suspense>
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
                  <Suspense fallback={<TicketSkeleton />}>
                    <InjuryReportsList
                      project={selectedProject}
                      companyId={company?.id || selectedProject?.company_id}
                      company={company}
                      user={user}
                      onShowToast={onShowToast}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
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

              {/* Project Team */}
              <ProjectTeam
                project={selectedProject}
                company={company}
                user={user}
                isAdmin={isAdmin}
                onShowToast={onShowToast}
              />

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

              {/* Account Security */}
              <div className="info-section-card">
                <MFASetup onShowToast={onShowToast} />
              </div>
            </div>
          )}
        </div>

        {/* Share Modal */}
        {showShareModal && (
          <Suspense fallback={null}>
            <ShareModal
              project={selectedProject}
              user={user}
              onClose={() => setShowShareModal(false)}
              onShareCreated={(share) => {
                onShowToast('Share link created successfully!', 'success')
              }}
            />
          </Suspense>
        )}

        {/* Notification Settings Modal */}
        {showNotificationSettings && (
          <div className="notification-settings-modal">
            <Suspense fallback={null}>
              <NotificationSettings
                project={selectedProject}
                company={company}
                onShowToast={onShowToast}
                onClose={() => setShowNotificationSettings(false)}
              />
            </Suspense>
          </div>
        )}

        {/* COR Form Modal */}
        {showCORForm && (
          <Suspense fallback={null}>
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
          </Suspense>
        )}

        {/* COR Detail Modal */}
        {showCORDetail && viewingCOR && (
          <Suspense fallback={null}>
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
          </Suspense>
        )}

        {/* COR Log Modal */}
        {corDisplayMode === 'log' && selectedProject && (
          <div className="cor-log-modal-overlay" onClick={() => setCORDisplayMode('list')}>
            <div className="cor-log-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cor-log-modal-header">
                <h2>Change Order Log</h2>
                <button
                  className="cor-log-modal-close"
                  onClick={() => setCORDisplayMode('list')}
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="cor-log-modal-content">
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                  <CORLog project={selectedProject} company={company} onShowToast={onShowToast} />
                </Suspense>
              </div>
            </div>
          </div>
        )}

        {/* Add Cost Modal */}
        {showAddCostModal && (
          <Suspense fallback={null}>
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
          </Suspense>
        )}

        {/* Equipment Modal */}
        {showEquipmentModal && (
          <Suspense fallback={null}>
            <EquipmentModal
              project={selectedProject}
              company={company}
              user={user}
              editItem={editingEquipment}
              onSave={() => {
                setShowEquipmentModal(false)
                setEditingEquipment(null)
                setEquipmentRefreshKey(prev => prev + 1)
                onShowToast(editingEquipment ? 'Equipment updated' : 'Equipment added', 'success')
              }}
              onClose={() => {
                setShowEquipmentModal(false)
                setEditingEquipment(null)
              }}
            />
          </Suspense>
        )}

        {/* Draw Request Modal */}
        {showDrawRequestModal && (
          <Suspense fallback={null}>
            <DrawRequestModal
              project={selectedProject}
              company={company}
              areas={areas}
              corStats={projectsData.find(p => p.id === selectedProject?.id)?.corStats}
              editDrawRequest={editingDrawRequest}
              onSave={() => {
                setShowDrawRequestModal(false)
                setEditingDrawRequest(null)
                setDrawRequestRefreshKey(prev => prev + 1)
                onShowToast(editingDrawRequest ? 'Draw request updated' : 'Draw request created', 'success')
              }}
              onClose={() => {
                setShowDrawRequestModal(false)
                setEditingDrawRequest(null)
              }}
            />
          </Suspense>
        )}
      </div>
    )
  }

  // Project List View - empty state with onboarding for new users
  if (projects.length === 0) {
    return (
      <>
        {showOnboarding && (
          <OnboardingWizard
            company={company}
            user={user}
            onShowToast={onShowToast}
            onDismiss={() => setShowOnboarding(false)}
          />
        )}
        <div className="empty-state">
          <ClipboardList size={48} className="empty-state-icon" />
          <h3>No Projects Yet</h3>
          <p>Create your first project to get started</p>
        </div>
      </>
    )
  }

  // Portfolio overview - uses memoized values from above
  return (
    <div>
      {/* Business Overview - High Level Portfolio Health */}
      <div className="business-overview">
        <div className="bo-header">
          <h2 className="bo-title">Portfolio Overview</h2>
          <button className="search-trigger-btn" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>Search</span>
            <span className="shortcut">⌘K</span>
          </button>
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

          {/* Pending CORs - Unapproved extra work (not yet part of contract value) */}
          {totalPendingCORCount > 0 && (
            <div className="bo-pending-cors">
              <div className="bo-pending-cor-item">
                <span className="bo-pending-cor-icon">!</span>
                <span className="bo-pending-cor-label">Pending CORs</span>
                <span className="bo-pending-cor-value">{formatCurrency(totalPendingCORValue)}</span>
                <span className="bo-pending-cor-count">({totalPendingCORCount} pending)</span>
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

        {/* Schedule Performance Summary */}
        {hasAnyScheduleData && (
          <div className="bo-schedule">
            <div className="bo-schedule-title">Schedule Performance</div>
            <div className="bo-schedule-pills">
              {scheduleAhead > 0 && (
                <div className="bo-pill ahead">
                  <span className="bo-pill-count">{scheduleAhead}</span>
                  <span className="bo-pill-label">Ahead</span>
                </div>
              )}
              {scheduleOnTrack > 0 && (
                <div className="bo-pill schedule-on-track">
                  <span className="bo-pill-count">{scheduleOnTrack}</span>
                  <span className="bo-pill-label">On Track</span>
                </div>
              )}
              {scheduleBehind > 0 && (
                <div className="bo-pill behind">
                  <span className="bo-pill-count">{scheduleBehind}</span>
                  <span className="bo-pill-label">Behind</span>
                </div>
              )}
            </div>

            {/* Labor Performance (if any projects have planned man-days) */}
            {hasAnyLaborData && (
              <div className="bo-labor-summary">
                <span className="bo-labor-label">Man-Days:</span>
                {laborUnder > 0 && (
                  <span className="bo-labor-badge under">{laborUnder} under</span>
                )}
                {laborOnTrack > 0 && (
                  <span className="bo-labor-badge on-track">{laborOnTrack} on track</span>
                )}
                {laborOver > 0 && (
                  <span className="bo-labor-badge over">{laborOver} over</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Smart Alerts - Actionable insights requiring attention */}
      {riskAnalysis.allAlerts.length > 0 && (
        <div className={`smart-alerts-section${riskAnalysis.criticalCount > 0 ? ' smart-alerts-section--has-critical' : riskAnalysis.allAlerts.some(a => a.type === 'warning') ? ' smart-alerts-section--has-warning' : ''}`}>
          <div className="smart-alerts-header">
            <div className="smart-alerts-header__left">
              <AlertTriangle className="smart-alerts-header__icon" size={18} />
              <h3 className="smart-alerts-header__title">Needs Attention</h3>
            </div>
            {riskAnalysis.criticalCount > 0 ? (
              <span className="smart-alerts-count-badge smart-alerts-count-badge--critical">
                {riskAnalysis.criticalCount} critical
              </span>
            ) : (
              <span className="smart-alerts-count-badge smart-alerts-count-badge--warning">
                {riskAnalysis.allAlerts.length} item{riskAnalysis.allAlerts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <SmartAlerts
            alerts={riskAnalysis.allAlerts}
            onAction={handleAlertAction}
            maxVisible={3}
          />
        </div>
      )}

      {/* Projects Header */}
      <div className="dashboard-header">
        <h2>Projects</h2>
        <span className="project-count">{projects.length} active</span>
      </div>

      {/* Project Grid */}
      <div className="project-list">
        {projectsData.map(project => {
          const projectRisk = riskAnalysis.projectRisks.find(r => r.projectId === project.id)
          return (
            <EnhancedProjectCard
              key={project.id}
              project={project}
              riskScore={projectRisk?.riskScore}
              riskStatus={projectRisk?.riskStatus}
              onClick={() => handleSelectProject(project)}
            />
          )
        })}
      </div>

      {/* Universal Search Modal */}
      <UniversalSearch
        isOpen={isSearchOpen}
        onClose={closeSearch}
        companyId={company?.id}
        onSelectProject={(project) => {
          handleSelectProject(project)
        }}
        onSelectTicket={(ticket) => {
          // Navigate to project and open T&M tab
          const project = projects.find(p => p.id === ticket.project_id)
          if (project) {
            handleSelectProject(project)
            setActiveProjectTab('financials')
            setFinancialsSection('tickets')
          }
        }}
        onSelectCOR={(cor) => {
          // Navigate to project and open COR
          const project = projects.find(p => p.id === cor.project_id)
          if (project) {
            handleSelectProject(project)
            setActiveProjectTab('financials')
            setFinancialsSection('cors')
            setViewingCOR(cor)
            setShowCORDetail(true)
          }
        }}
        onShowToast={onShowToast}
      />
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
function EnhancedProjectCard({ project, riskScore, riskStatus, onClick }) {
  const status = getOverallStatus(project.areas || [])
  const statusLabel = getOverallStatusLabel(project.areas || [])
  const profit = project.contract_value - project.billable
  const isAtRisk = project.billable > project.contract_value * 0.9 && project.progress < 90

  // Risk badge colors
  const riskColors = {
    healthy: { bg: 'var(--status-success-bg, #064e3b)', color: 'var(--status-success, #059669)' },
    warning: { bg: 'var(--status-warning-bg, #78350f)', color: 'var(--status-warning, #d97706)' },
    critical: { bg: 'var(--status-danger-bg, #7f1d1d)', color: 'var(--status-danger, #dc2626)' }
  }
  const riskStyle = riskColors[riskStatus] || riskColors.healthy

  return (
    <div className={`project-card enhanced ${isAtRisk ? 'at-risk' : ''}`} onClick={onClick}>
      <div className="project-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Risk Score Badge */}
          {typeof riskScore === 'number' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: riskStyle.bg,
                color: riskStyle.color
              }}
              title={`Risk Score: ${riskScore}`}
              aria-label={`Risk score ${riskScore}, ${riskStatus}`}
            >
              {riskScore}
            </span>
          )}
          <div>
            <div className="project-card-name">{project.name}</div>
            <div className="project-card-value">{formatCurrency(project.contract_value)}</div>
          </div>
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

      {/* Schedule Badge */}
      {project.hasScheduleData && (
        <div className="project-schedule-badge">
          <span className={`schedule-indicator ${project.scheduleStatus}`}>
            {project.scheduleLabel}
          </span>
          {project.hasLaborData && project.laborLabel && (
            <span className={`labor-indicator ${project.laborStatus}`}>
              {project.laborLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}


