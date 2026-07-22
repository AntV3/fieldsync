import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { db, equipmentOps } from '../lib/supabase'
import { safeAsync } from '../lib/errorHandler'
import { calculateValueProgress, calculateScheduleInsights, shouldAutoArchive } from '../lib/utils'

/**
 * useDashboardData - Data layer for the office Dashboard.
 *
 * Owns everything about fetching and caching project data:
 * - Project list + enhanced per-project metrics (projectsData)
 * - Selected project + its areas
 * - On-demand project detail loading with a 30s TTL cache
 * - Real-time Supabase subscriptions (company-wide + per-project)
 * - Debounced refresh that coalesces rapid subscription callbacks
 * - Auto-archiving of long-completed projects
 *
 * Extracted from Dashboard.jsx so the component can stay a thin orchestrator.
 */
export default function useDashboardData({ company, onShowToast, navigateToProjectId, onProjectNavigated }) {
  const [projects, setProjects] = useState([])
  const [projectsData, setProjectsData] = useState([]) // Enhanced data with areas/tickets
  const [selectedProject, setSelectedProject] = useState(null)
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [costCodes, setCostCodes] = useState([])
  const [corRefreshKey, setCORRefreshKey] = useState(0)

  const bumpCORRefresh = useCallback(() => setCORRefreshKey(prev => prev + 1), [])

  // Debounce ref to prevent cascading refreshes from multiple subscription callbacks
  // When multiple real-time events fire rapidly, this coalesces them into a single refresh
  const refreshTimeoutRef = useRef(null)
  const pendingAreasRefreshRef = useRef(false)
  const pendingCORRefreshRef = useRef(false)
  const mountedRef = useRef(true)

  // Refs to hold latest versions of load functions, preventing stale closures in debouncedRefresh
  const loadAreasRef = useRef(null)
  const loadProjectsRef = useRef(null)
  const loadProjectDetailsRef = useRef(null)

  // Track selected project in a ref so debouncedRefresh can access it without stale closures
  const selectedProjectRef = useRef(null)

  // Cache for project details to avoid re-fetching when switching between projects
  // Key: projectId, Value: { data: enhancedProjectData, timestamp: Date.now() }
  const projectDetailsCacheRef = useRef(new Map())
  const CACHE_TTL_MS = 30 * 1000 // 30 second cache TTL - keep data fresh for real-time updates

  const invalidateProjectCache = useCallback((projectId) => {
    if (projectId) projectDetailsCacheRef.current.delete(projectId)
  }, [])

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
      // Always invalidate detail cache for the selected project so real-time data is fresh
      // Previously only invalidated when projectId was explicitly passed, causing stale data
      const activeProjectId = projectId || selectedProjectRef.current?.id
      if (activeProjectId) {
        projectDetailsCacheRef.current.delete(activeProjectId)
      }
      // Always refresh projects to update metrics
      await loadProjectsRef.current?.()
      // If a project is currently selected, re-fetch its detailed data so the UI updates
      const currentProject = selectedProjectRef.current
      if (currentProject) {
        const detailed = await loadProjectDetailsRef.current?.(currentProject, true)
        if (detailed && mountedRef.current) {
          setProjectsData(prev => prev.map(p =>
            p.id === currentProject.id ? detailed : p
          ))
          // Only re-apply the fresh detail to selectedProject if the user is
          // still on the same project. Detail loads run 400ms-2s of Supabase
          // fan-out; without this guard a Back click or switch to another
          // project mid-flight would yank the user back to the stale project.
          if (selectedProjectRef.current?.id === currentProject.id) {
            setSelectedProject(detailed)
          }
        }
      }
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
      // Load company cost codes for exports
      db.getCostCodes(company.id)
        .then(setCostCodes)
        .catch(err => console.warn('[Dashboard] failed to load cost codes', err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, projectIdsKey, debouncedRefresh])

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

  // Per-project real-time subscriptions for the selected project.
  // Dependency is `selectedProject?.id` (not the whole object) because
  // debouncedRefresh replaces selectedProject with a fresh reference after
  // every subscription fire; keying on the id keeps the ~9 channels stable
  // across those refreshes and avoids the tear-down/rebuild churn (plus the
  // tiny window between unsub and resub where events fall on the floor).
  useEffect(() => {
    const projectId = selectedProject?.id
    if (projectId) {
      loadAreas(projectId)

      // Subscribe to real-time updates for the selected project
      // All callbacks use debouncedRefresh to prevent cascading refreshes
      const subscriptions = []

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

      // Messages subscription
      const msgSub = db.subscribeToMessages?.(projectId, () => {
        debouncedRefresh()
      })
      if (msgSub) subscriptions.push(msgSub)

      return () => {
        subscriptions.forEach(sub => db.unsubscribe?.(sub))
      }
    }
  }, [selectedProject?.id, debouncedRefresh])

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
        weeklyDisposal,
        projectEquipment,
        projectInvoices,
        punchListItems,
        changeOrders
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
        safeAsync(() => db.getWeeklyDisposalSummary(project.id, 4), { fallback: [], context: { operation: 'getWeeklyDisposalSummary', projectId: project.id } }),
        safeAsync(() => equipmentOps.getProjectEquipment(project.id), { fallback: [], context: { operation: 'getProjectEquipment', projectId: project.id } }),
        safeAsync(() => db.getProjectInvoices(project.id), { fallback: [], context: { operation: 'getProjectInvoices', projectId: project.id } }),
        safeAsync(() => db.getPunchListItems(project.id), { fallback: [], context: { operation: 'getPunchListItems', projectId: project.id } }),
        safeAsync(() => db.getCORs(project.id), { fallback: [], context: { operation: 'getCORs', projectId: project.id } })
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
        changeOrders: changeOrders || [],
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
      onShowToast?.('Could not load project details. Showing summary data only.', 'error')
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
  loadProjectDetailsRef.current = loadProjectDetails

  // Keep selectedProject ref in sync for debouncedRefresh to access without stale closures
  selectedProjectRef.current = selectedProject

  const handleSelectProject = async (project) => {
    // Set the project immediately for responsive UI
    setSelectedProject(project)

    // If detailed data hasn't been loaded yet, load it now (lazy loading)
    if (!project._detailsLoaded) {
      const detailedProject = await loadProjectDetails(project)

      // Update projectsData with the detailed version (safe regardless of
      // current selection — this is just cached array data).
      setProjectsData(prev => prev.map(p =>
        p.id === project.id ? detailedProject : p
      ))

      // Only re-apply detail to selectedProject if the user is still on
      // this project. Between the setSelectedProject above and this await
      // resolving (400ms-2s), the user may have hit Back or clicked
      // another project - without this guard we'd yank them back.
      if (selectedProjectRef.current?.id === project.id) {
        setSelectedProject(detailedProject)
      }
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsData.length]) // Run when projects data loads

  // Memoize selected project data lookup to avoid repeated finds
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

  return {
    projects,
    projectsData,
    setProjectsData,
    selectedProject,
    setSelectedProject,
    areas,
    setAreas,
    loading,
    costCodes,
    corRefreshKey,
    bumpCORRefresh,
    debouncedRefresh,
    loadProjects,
    loadAreas,
    handleSelectProject,
    invalidateProjectCache,
    projectData,
    progressCalculations
  }
}
