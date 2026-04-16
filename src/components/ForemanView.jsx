import { useState, useEffect, useCallback, useRef } from 'react'
import { db, supabase, isSupabaseConfigured, getSupabaseClient } from '../lib/supabase'
import { calculateProgress } from '../lib/utils'
import {
  Info, CheckSquare,
  ArrowLeft, ChevronDown, ChevronRight,
  Clock, CheckCircle2, Moon, Sun
} from 'lucide-react'
import TMForm from './TMForm'
import CrewCheckin from './CrewCheckin'
import DailyReport from './DailyReport'
import InjuryReportForm from './InjuryReportForm'
import DisposalLoadInput from './DisposalLoadInput'
import FolderGrid from './documents/FolderGrid'
import ForemanMetrics from './ForemanMetrics'
import ForemanLanding from './ForemanLanding'
import PunchList from './PunchList'
import RFIList from './RFIList'
import { useTradeConfig } from '../lib/TradeConfigContext'

export default function ForemanView({ project, companyId, foremanName, onShowToast, onExit }) {
  const { resolvedConfig } = useTradeConfig()
  const truckLoadTrackingEnabled = resolvedConfig?.enable_truck_load_tracking ?? true

  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({})

  // View states
  const [activeView, setActiveView] = useState('home') // home, crew, tm, disposal, report, injury, docs, progress, punchlist
  const [showProjectInfo, setShowProjectInfo] = useState(false)

  // Punch list open count for badge (null = not loaded yet)
  const [punchListOpenCount, setPunchListOpenCount] = useState(null)

  // Today's activity status (for smart cards)
  const [todayStatus, setTodayStatus] = useState({
    crewCheckedIn: false,
    crewCount: 0,
    tmTicketsToday: 0,
    dailyReportDone: false,
    disposalLoadsToday: 0,
    trucksUsedToday: 0
  })

  // Theme
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark'
    }
    return false
  })

  useEffect(() => {
    if (project?.id) {
      // Parallelize independent data loads for faster initial render
      Promise.all([
        loadAreas(),
        loadTodayStatus(),
        loadPunchListCount()
      ])
    }
  }, [project?.id])

  // Load today's activity status
  const loadTodayStatus = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]

      // Parallelize all independent queries instead of running sequentially
      const [crew, todayTicketCount, disposal, truckData] = await Promise.all([
        db.getCrewCheckin(project.id, today),
        // Use date-filtered count query instead of loading ALL tickets then filtering
        db.getTMTicketCountByDate?.(project.id, today) ??
          db.getTMTickets?.(project.id).then(tickets => (tickets || []).filter(t => t.work_date === today).length),
        db.getDisposalLoads?.(project.id, today) || [],
        db.getTruckCount?.(project.id, today)
      ])

      const crewWorkers = crew?.workers || []

      setTodayStatus({
        crewCheckedIn: crewWorkers.length > 0,
        crewCount: crewWorkers.length,
        tmTicketsToday: typeof todayTicketCount === 'number' ? todayTicketCount : 0,
        dailyReportDone: false, // We'll track this separately
        disposalLoadsToday: (disposal || []).reduce((sum, d) => sum + (d.load_count || 1), 0),
        trucksUsedToday: truckData?.truck_count || 0
      })
    } catch (error) {
      console.error('Error loading today status:', error)
    }
  }

  // Load open punch list item count for badge
  const loadPunchListCount = async () => {
    if (!project?.id || !isSupabaseConfigured) return
    try {
      const { count } = await getSupabaseClient()
        .from('punch_list_items')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'open')
      setPunchListOpenCount(count || 0)
    } catch {
      // Table may not exist yet
    }
  }

  // Real-time subscriptions for live updates
  // Use targeted refresh functions to avoid full-page reloads for every change
  const refreshTimeoutRef = useRef(null)
  const pendingRefreshRef = useRef({ areas: false, status: false, punchList: false })

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const debouncedRefresh = useCallback((targets = { areas: true, status: true }) => {
    // Track what actually needs refreshing
    if (targets.areas) pendingRefreshRef.current.areas = true
    if (targets.status) pendingRefreshRef.current.status = true
    if (targets.punchList) pendingRefreshRef.current.punchList = true

    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    // 300ms debounce - fast enough for real-time feel while still coalescing rapid events
    refreshTimeoutRef.current = setTimeout(async () => {
      if (!mountedRef.current) return
      const pending = pendingRefreshRef.current
      pendingRefreshRef.current = { areas: false, status: false, punchList: false }
      const refreshes = []
      if (pending.areas) refreshes.push(loadAreas())
      if (pending.status) refreshes.push(loadTodayStatus())
      if (pending.punchList) refreshes.push(loadPunchListCount())
      await Promise.all(refreshes)
    }, 300)
  }, [project?.id])

  useEffect(() => {
    if (!project?.id) return
    const subs = []

    // Areas: refresh areas + progress
    const areaSub = db.subscribeToAreas?.(project.id, () => debouncedRefresh({ areas: true }))
    if (areaSub) subs.push(areaSub)

    // Crew/TM/trucks/reports: only refresh today's status (not areas)
    const crewSub = db.subscribeToCrewCheckins?.(project.id, () => debouncedRefresh({ status: true }))
    if (crewSub) subs.push(crewSub)

    const tmSub = db.subscribeToTMTickets?.(project.id, () => debouncedRefresh({ status: true }))
    if (tmSub) subs.push(tmSub)

    const haulSub = db.subscribeToHaulOffs?.(project.id, () => debouncedRefresh({ status: true }))
    if (haulSub) subs.push(haulSub)

    const truckSub = db.subscribeToTruckCounts?.(project.id, () => debouncedRefresh({ status: true }))
    if (truckSub) subs.push(truckSub)

    const reportSub = db.subscribeToDailyReports?.(project.id, () => debouncedRefresh({ status: true }))
    if (reportSub) subs.push(reportSub)

    // COR/project changes: no need to reload areas or today status
    const corSub = db.subscribeToCORs?.(project.id, () => debouncedRefresh({ status: false }))
    if (corSub) subs.push(corSub)

    const projectSub = db.subscribeToProject?.(project.id, () => debouncedRefresh({ areas: true, status: true }))
    if (projectSub) subs.push(projectSub)

    // Punch list: only refresh punch list count
    const punchSub = db.subscribeToPunchList?.(project.id, () => debouncedRefresh({ punchList: true }))
    if (punchSub) subs.push(punchSub)

    // Materials/equipment pricing changes from office - no UI impact in field view
    if (companyId) {
      const materialsSub = db.subscribeToMaterialsEquipment?.(companyId, () => debouncedRefresh({ status: false }))
      if (materialsSub) subs.push(materialsSub)

      const laborSub = db.subscribeToLaborRates?.(companyId, () => debouncedRefresh({ status: false }))
      if (laborSub) subs.push(laborSub)
    }

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
      subs.forEach(sub => db.unsubscribe?.(sub))
    }
  }, [project?.id, debouncedRefresh])

  const loadAreas = async () => {
    try {
      const data = await db.getAreas(project.id)
      setAreas(data)
      const groups = [...new Set(data.map(a => a.group_name || 'General'))]
      const expanded = {}
      groups.forEach(g => expanded[g] = false)
      setExpandedGroups(expanded)
    } catch (error) {
      console.error('Error loading areas:', error)
      onShowToast?.('Error loading areas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (areaId, newStatus) => {
    const area = areas.find(a => a.id === areaId)
    if (!area) return
    const finalStatus = area.status === newStatus ? 'not_started' : newStatus
    setUpdating(areaId)
    try {
      await db.updateAreaStatus(areaId, finalStatus)
      setAreas(prev => prev.map(a => a.id === areaId ? { ...a, status: finalStatus } : a))
    } catch (error) {
      console.error('Error updating status:', error)
      onShowToast?.('Error updating', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
    setIsDark(!isDark)
  }

  // Calculate stats
  const progress = calculateProgress(areas)
  const areasDone = areas.filter(a => a.status === 'done').length
  const areasWorking = areas.filter(a => a.status === 'working').length
  const areasRemaining = areas.length - areasDone

  // Group areas
  const groupedAreas = areas.reduce((acc, area) => {
    const group = area.group_name || 'General'
    if (!acc[group]) acc[group] = []
    acc[group].push(area)
    return acc
  }, {})

  const hasGroups = Object.keys(groupedAreas).length > 1 ||
    (Object.keys(groupedAreas).length === 1 && !groupedAreas['General'])

  const getGroupProgress = (groupAreas) => {
    const done = groupAreas.filter(a => a.status === 'done').length
    return `${done}/${groupAreas.length}`
  }

  // Navigation handler for ForemanLanding (must be before early returns)
  const handleNavigate = useCallback((viewId) => {
    setActiveView(viewId)
  }, [])

  // T&M Form View
  if (activeView === 'tm') {
    return (
      <div className="fm-view">
        <TMForm
          project={project}
          companyId={companyId}
          onSubmit={() => setActiveView('home')}
          onCancel={() => setActiveView('home')}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  // Daily Report View
  if (activeView === 'report') {
    return (
      <DailyReport
        project={project}
        onShowToast={onShowToast}
        onClose={() => setActiveView('home')}
      />
    )
  }

  // Injury Report View
  if (activeView === 'injury') {
    return (
      <div className="fm-view">
        <InjuryReportForm
          project={project}
          companyId={companyId}
          user={foremanName ? { name: foremanName } : undefined}
          onClose={() => setActiveView('home')}
          onReportCreated={() => {
            setActiveView('home')
            onShowToast?.('Injury report submitted', 'success')
          }}
        />
      </div>
    )
  }

  // Crew Check-in View
  if (activeView === 'crew') {
    return (
      <div className="fm-view">
        <div className="fm-subheader">
          <button className="fm-back" onClick={() => setActiveView('home')}>
            <ArrowLeft size={20} />
          </button>
          <h2>Crew Check-in</h2>
        </div>
        <CrewCheckin project={project} companyId={companyId} onShowToast={onShowToast} />
      </div>
    )
  }

  // Disposal Loads View (only when truck load tracking is enabled)
  if (activeView === 'disposal' && truckLoadTrackingEnabled) {
    return (
      <div className="fm-view">
        <div className="fm-subheader">
          <button className="fm-back" onClick={() => setActiveView('home')}>
            <ArrowLeft size={20} />
          </button>
          <h2>Disposal Loads</h2>
        </div>
        <DisposalLoadInput
          project={project}
          date={new Date().toISOString().split('T')[0]}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  // Documents View
  if (activeView === 'docs') {
    return (
      <div className="fm-view">
        <div className="fm-subheader">
          <button className="fm-back" onClick={() => setActiveView('home')}>
            <ArrowLeft size={20} />
          </button>
          <h2>Documents</h2>
        </div>
        <FolderGrid projectId={project.id} onShowToast={onShowToast} />
      </div>
    )
  }

  // Metrics View
  if (activeView === 'metrics') {
    return (
      <ForemanMetrics
        project={project}
        companyId={companyId}
        onBack={() => setActiveView('home')}
      />
    )
  }

  // Punch List View
  if (activeView === 'punchlist') {
    return (
      <div className="fm-view">
        <div className="fm-subheader">
          <button className="fm-back" onClick={() => { setActiveView('home'); loadPunchListCount() }}>
            <ArrowLeft size={20} />
          </button>
          <h2>Punch List</h2>
        </div>
        <PunchList
          projectId={project.id}
          areas={areas}
          companyId={companyId}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  // RFI View (field crew can submit RFIs to office)
  if (activeView === 'rfis') {
    return (
      <div className="fm-view">
        <div className="fm-subheader">
          <button className="fm-back" onClick={() => setActiveView('home')}>
            <ArrowLeft size={20} />
          </button>
          <h2>RFIs</h2>
        </div>
        <RFIList
          project={project}
          company={{ id: companyId }}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  // Progress View
  if (activeView === 'progress') {
    return (
      <div className="fm-view">
        <div className="fm-subheader">
          <button className="fm-back" onClick={() => setActiveView('home')}>
            <ArrowLeft size={20} />
          </button>
          <h2>Progress</h2>
          <span className="fm-subheader-badge">{progress}%</span>
        </div>

        <div className="fm-progress-content">
          {loading ? (
            <div className="fm-loading">
              <div className="spinner"></div>
              <span>Loading...</span>
            </div>
          ) : areas.length === 0 ? (
            <div className="fm-empty">
              <CheckSquare size={48} />
              <h3>No tasks yet</h3>
              <p>Office will add tasks to this project</p>
            </div>
          ) : hasGroups ? (
            Object.entries(groupedAreas).map(([group, groupAreas]) => (
              <div key={group} className="fm-group">
                <button className="fm-group-header" onClick={() => toggleGroup(group)}>
                  <div className="fm-group-left">
                    {expandedGroups[group] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span>{group}</span>
                  </div>
                  <span className="fm-group-count">{getGroupProgress(groupAreas)}</span>
                </button>
                {expandedGroups[group] && (
                  <div className="fm-group-items">
                    {groupAreas.map(area => (
                      <div key={area.id} className={`fm-task ${area.status}`}>
                        <span className="fm-task-name">{area.name}</span>
                        <div className="fm-task-btns">
                          <button
                            className={`fm-status-btn working ${area.status === 'working' ? 'active' : ''}`}
                            onClick={() => handleStatusUpdate(area.id, 'working')}
                            disabled={updating === area.id}
                          >
                            <Clock size={14} />
                          </button>
                          <button
                            className={`fm-status-btn done ${area.status === 'done' ? 'active' : ''}`}
                            onClick={() => handleStatusUpdate(area.id, 'done')}
                            disabled={updating === area.id}
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="fm-task-list">
              {areas.map(area => (
                <div key={area.id} className={`fm-task ${area.status}`}>
                  <span className="fm-task-name">{area.name}</span>
                  <div className="fm-task-btns">
                    <button
                      className={`fm-status-btn working ${area.status === 'working' ? 'active' : ''}`}
                      onClick={() => handleStatusUpdate(area.id, 'working')}
                      disabled={updating === area.id}
                    >
                      <Clock size={14} />
                    </button>
                    <button
                      className={`fm-status-btn done ${area.status === 'done' ? 'active' : ''}`}
                      onClick={() => handleStatusUpdate(area.id, 'done')}
                      disabled={updating === area.id}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // HOME VIEW - New Mobile Landing Page
  return (
    <div className="fm-view">
      {/* Header */}
      <div className="fm-header">
        <button className="fm-exit" onClick={onExit}>
          <ArrowLeft size={20} />
        </button>
        <div className="fm-header-center">
          <h1 className="fm-project-name">{project.name}</h1>
          {foremanName && (
            <span className="fm-foreman-name">{foremanName}</span>
          )}
          <button className="fm-info-toggle" onClick={() => setShowProjectInfo(!showProjectInfo)}>
            <Info size={16} />
          </button>
        </div>
        <button className="fm-theme" onClick={toggleTheme}>
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* Project Info (collapsible) */}
      {showProjectInfo && (
        <div className="fm-project-info">
          {project.job_number && <div className="fm-info-item"><span>Job #</span><span>{project.job_number}</span></div>}
          {project.address && <div className="fm-info-item"><span>Address</span><span>{project.address}</span></div>}
          {project.general_contractor && <div className="fm-info-item"><span>GC</span><span>{project.general_contractor}</span></div>}
          {project.client_phone && (
            <div className="fm-info-item">
              <span>Phone</span>
              <a href={`tel:${project.client_phone}`}>{project.client_phone}</a>
            </div>
          )}
        </div>
      )}

      {/* New Mobile-First Landing Page */}
      <ForemanLanding
        project={project}
        todayStatus={todayStatus}
        progress={progress}
        areasWorking={areasWorking}
        areasDone={areasDone}
        areasRemaining={areasRemaining}
        punchListOpenCount={punchListOpenCount}
        onNavigate={handleNavigate}
        onShowToast={onShowToast}
      />
    </div>
  )
}
