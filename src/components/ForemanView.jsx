import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'
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

export default function ForemanView({ project, companyId, onShowToast, onExit }) {
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({})

  // View states
  const [activeView, setActiveView] = useState('home') // home, crew, tm, disposal, report, injury, docs, progress
  const [showProjectInfo, setShowProjectInfo] = useState(false)

  // Today's activity status (for smart cards)
  const [todayStatus, setTodayStatus] = useState({
    crewCheckedIn: false,
    crewCount: 0,
    tmTicketsToday: 0,
    dailyReportDone: false,
    disposalLoadsToday: 0
  })

  // Theme
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark'
    }
    return false
  })

  // Get current hour for time-based UI
  const currentHour = new Date().getHours()
  const isMorning = currentHour >= 5 && currentHour < 12
  const isAfternoon = currentHour >= 12 && currentHour < 17
  const isEvening = currentHour >= 17 || currentHour < 5

  useEffect(() => {
    if (project?.id) {
      loadAreas()
      loadTodayStatus()
    }
  }, [project?.id])

  // Load today's activity status
  const loadTodayStatus = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]

      // Load crew check-in for today (returns single object with .workers array, or null)
      const crew = await db.getCrewCheckin(project.id, today)
      const crewWorkers = crew?.workers || []
      const crewCheckedIn = crewWorkers.length > 0

      // Load T&M tickets for today
      const tickets = await db.getTMTickets?.(project.id) || []
      const todayTickets = tickets.filter(t => t.work_date === today)

      // Load disposal loads for today
      const disposal = await db.getDisposalLoads?.(project.id, today) || []

      // Load today's daily report status
      const dailyReport = await db.getDailyReport?.(project.id, today)

      setTodayStatus({
        crewCheckedIn,
        crewCount: crewWorkers.length,
        tmTicketsToday: todayTickets.length,
        dailyReportDone: !!dailyReport,
        disposalLoadsToday: disposal.reduce((sum, d) => sum + (d.load_count || 1), 0)
      })
    } catch (error) {
      console.error('Error loading today status:', error)
    }
  }

  // Real-time subscriptions for live updates
  const refreshTimeoutRef = useRef(null)

  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    refreshTimeoutRef.current = setTimeout(() => {
      loadAreas()
      loadTodayStatus()
    }, 300)
  }, [project?.id])

  useEffect(() => {
    if (!project?.id) return
    const subs = []

    const areaSub = db.subscribeToAreas?.(project.id, debouncedRefresh)
    if (areaSub) subs.push(areaSub)

    const crewSub = db.subscribeToCrewCheckins?.(project.id, debouncedRefresh)
    if (crewSub) subs.push(crewSub)

    const tmSub = db.subscribeToTMTickets?.(project.id, debouncedRefresh)
    if (tmSub) subs.push(tmSub)

    const haulSub = db.subscribeToHaulOffs?.(project.id, debouncedRefresh)
    if (haulSub) subs.push(haulSub)

    const reportSub = db.subscribeToDailyReports?.(project.id, debouncedRefresh)
    if (reportSub) subs.push(reportSub)

    // COR status changes from office (approvals, rejections)
    const corSub = db.subscribeToCORs?.(project.id, debouncedRefresh)
    if (corSub) subs.push(corSub)

    // Material request responses from office
    const matReqSub = db.subscribeToMaterialRequests?.(project.id, debouncedRefresh)
    if (matReqSub) subs.push(matReqSub)

    // Project-level changes from office (name, dates, budget)
    const projectSub = db.subscribeToProject?.(project.id, debouncedRefresh)
    if (projectSub) subs.push(projectSub)

    // Materials/equipment pricing changes from office
    if (companyId) {
      const materialsSub = db.subscribeToMaterialsEquipment?.(companyId, debouncedRefresh)
      if (materialsSub) subs.push(materialsSub)

      const laborSub = db.subscribeToLaborRates?.(companyId, debouncedRefresh)
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

  // Shared back navigation
  const goHome = useCallback(() => setActiveView('home'), [])

  // Shared sub-view header with project breadcrumb
  const subHeader = (title, badge) => (
    <div className="fm-subheader">
      <button className="fm-back" onClick={goHome} aria-label={`Back to ${project.name}`}>
        <ArrowLeft size={20} />
      </button>
      <div className="fm-subheader-text">
        <span className="fm-subheader-project">{project.name}</span>
        <h2>{title}</h2>
      </div>
      {badge && <span className="fm-subheader-badge">{badge}</span>}
    </div>
  )

  // Views that delegate rendering to their own full-screen components
  if (activeView === 'tm') {
    return (
      <div className="fm-view">
        <TMForm
          project={project}
          companyId={companyId}
          onSubmit={goHome}
          onCancel={goHome}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  if (activeView === 'report') {
    return <DailyReport project={project} onShowToast={onShowToast} onClose={goHome} />
  }

  if (activeView === 'injury') {
    return (
      <div className="fm-view">
        <InjuryReportForm
          project={project}
          companyId={companyId}
          onClose={goHome}
          onReportCreated={() => {
            goHome()
            onShowToast?.('Injury report submitted', 'success')
          }}
        />
      </div>
    )
  }

  if (activeView === 'metrics') {
    return <ForemanMetrics project={project} companyId={companyId} onBack={goHome} />
  }

  // Views that use the standard sub-view wrapper with breadcrumb
  if (activeView === 'crew') {
    return (
      <div className="fm-view">
        {subHeader('Crew Check-in')}
        <CrewCheckin project={project} companyId={companyId} onShowToast={onShowToast} />
      </div>
    )
  }

  if (activeView === 'disposal') {
    return (
      <div className="fm-view">
        {subHeader('Disposal Loads')}
        <DisposalLoadInput
          project={project}
          date={new Date().toISOString().split('T')[0]}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  if (activeView === 'docs') {
    return (
      <div className="fm-view">
        {subHeader('Documents')}
        <FolderGrid projectId={project.id} onShowToast={onShowToast} />
      </div>
    )
  }

  // Task row helper used in the progress view
  const renderTaskRow = (area) => (
    <div key={area.id} className={`fm-task ${area.status}`}>
      <div className="fm-task-info">
        <span className="fm-task-name">{area.name}</span>
        {area.status !== 'not_started' && (
          <span className={`fm-task-status-label ${area.status}`}>
            {area.status === 'working' ? 'In Progress' : 'Done'}
          </span>
        )}
      </div>
      <div className="fm-task-btns">
        <button
          className={`fm-status-btn working ${area.status === 'working' ? 'active' : ''}`}
          onClick={() => handleStatusUpdate(area.id, 'working')}
          disabled={updating === area.id}
          aria-label={`Mark ${area.name} as in progress`}
          title="In Progress"
        >
          <Clock size={14} />
        </button>
        <button
          className={`fm-status-btn done ${area.status === 'done' ? 'active' : ''}`}
          onClick={() => handleStatusUpdate(area.id, 'done')}
          disabled={updating === area.id}
          aria-label={`Mark ${area.name} as done`}
          title="Done"
        >
          <CheckCircle2 size={14} />
        </button>
      </div>
    </div>
  )

  if (activeView === 'progress') {
    return (
      <div className="fm-view">
        {subHeader('Progress', `${progress}%`)}

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
                <button
                  className="fm-group-header"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!!expandedGroups[group]}
                >
                  <div className="fm-group-left">
                    {expandedGroups[group] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span>{group}</span>
                  </div>
                  <span className="fm-group-count">{getGroupProgress(groupAreas)}</span>
                </button>
                {expandedGroups[group] && (
                  <div className="fm-group-items">
                    {groupAreas.map(renderTaskRow)}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="fm-task-list">
              {areas.map(renderTaskRow)}
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
        <button className="fm-exit" onClick={onExit} aria-label="Exit project">
          <ArrowLeft size={20} />
        </button>
        <div className="fm-header-center">
          <div className="fm-header-text">
            <span className="fm-greeting">
              {isMorning ? 'Good morning' : isAfternoon ? 'Good afternoon' : 'Good evening'}
            </span>
            <h1 className="fm-project-name">{project.name}</h1>
          </div>
          <button
            className="fm-info-toggle"
            onClick={() => setShowProjectInfo(!showProjectInfo)}
            aria-label={showProjectInfo ? 'Hide project info' : 'Show project info'}
            aria-expanded={showProjectInfo}
          >
            <Info size={16} />
          </button>
        </div>
        <button
          className="fm-theme"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
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
        onNavigate={handleNavigate}
        onShowToast={onShowToast}
      />
    </div>
  )
}
