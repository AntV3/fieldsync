import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'
import { calculateProgress } from '../lib/utils'
import {
  Info, CheckSquare,
  ArrowLeft, ChevronDown, ChevronRight,
  Clock, CheckCircle2, Moon, Sun, AlertTriangle, X
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
  const [blockerAreaId, setBlockerAreaId] = useState(null) // which area has blocker input open
  const [blockerDraft, setBlockerDraft] = useState('') // draft blocker note text

  // View states
  const [activeView, setActiveView] = useState('home') // home, crew, tm, disposal, report, injury, docs, progress
  const [showProjectInfo, setShowProjectInfo] = useState(false)

  // Today's activity status (for smart cards)
  const [todayStatus, setTodayStatus] = useState({
    crewCheckedIn: false,
    crewCount: 0,
    tmTicketsToday: 0,
    dailyReportDone: false,
    disposalLoadsToday: 0,
    rejectedTickets: []
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

      // Collect rejected tickets that the foreman needs to address
      const rejectedTickets = tickets.filter(t => t.status === 'rejected')

      setTodayStatus({
        crewCheckedIn,
        crewCount: crewWorkers.length,
        tmTicketsToday: todayTickets.length,
        dailyReportDone: false, // We'll track this separately
        disposalLoadsToday: disposal.reduce((sum, d) => sum + (d.load_count || 1), 0),
        rejectedTickets
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

  const handleToggleBlocker = (areaId) => {
    const area = areas.find(a => a.id === areaId)
    if (!area) return
    if (area.blocker) {
      // Clear blocker
      setAreas(prev => prev.map(a => a.id === areaId ? { ...a, blocker: false, blocker_note: '' } : a))
      db.updateAreaBlocker?.(areaId, false, '')
      onShowToast?.('Blocker cleared', 'success')
    } else {
      // Open blocker note input
      setBlockerAreaId(areaId)
      setBlockerDraft(area.blocker_note || '')
    }
  }

  const handleSaveBlocker = async (areaId) => {
    setAreas(prev => prev.map(a => a.id === areaId ? { ...a, blocker: true, blocker_note: blockerDraft } : a))
    await db.updateAreaBlocker?.(areaId, true, blockerDraft)
    setBlockerAreaId(null)
    setBlockerDraft('')
    onShowToast?.('Blocker flagged — office notified', 'info')
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

  // Disposal Loads View
  if (activeView === 'disposal') {
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
                      <div key={area.id} className={`fm-task ${area.status} ${area.blocker ? 'blocked' : ''}`}>
                        <div className="fm-task-main">
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
                            <button
                              className={`fm-status-btn blocker ${area.blocker ? 'active' : ''}`}
                              onClick={() => handleToggleBlocker(area.id)}
                              disabled={updating === area.id}
                              title={area.blocker ? 'Clear blocker' : 'Flag blocker'}
                            >
                              <AlertTriangle size={14} />
                            </button>
                          </div>
                        </div>
                        {area.blocker && area.blocker_note && (
                          <div className="fm-task-blocker-note">{area.blocker_note}</div>
                        )}
                        {blockerAreaId === area.id && (
                          <div className="fm-blocker-input">
                            <input
                              type="text"
                              value={blockerDraft}
                              onChange={(e) => setBlockerDraft(e.target.value)}
                              placeholder="What's blocking? (optional)"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveBlocker(area.id) }}
                            />
                            <button className="fm-blocker-save" onClick={() => handleSaveBlocker(area.id)}>Flag</button>
                            <button className="fm-blocker-cancel" onClick={() => setBlockerAreaId(null)}><X size={14} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="fm-task-list">
              {areas.map(area => (
                <div key={area.id} className={`fm-task ${area.status} ${area.blocker ? 'blocked' : ''}`}>
                  <div className="fm-task-main">
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
                      <button
                        className={`fm-status-btn blocker ${area.blocker ? 'active' : ''}`}
                        onClick={() => handleToggleBlocker(area.id)}
                        disabled={updating === area.id}
                        title={area.blocker ? 'Clear blocker' : 'Flag blocker'}
                      >
                        <AlertTriangle size={14} />
                      </button>
                    </div>
                  </div>
                  {area.blocker && area.blocker_note && (
                    <div className="fm-task-blocker-note">{area.blocker_note}</div>
                  )}
                  {blockerAreaId === area.id && (
                    <div className="fm-blocker-input">
                      <input
                        type="text"
                        value={blockerDraft}
                        onChange={(e) => setBlockerDraft(e.target.value)}
                        placeholder="What's blocking? (optional)"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveBlocker(area.id) }}
                      />
                      <button className="fm-blocker-save" onClick={() => handleSaveBlocker(area.id)}>Flag</button>
                      <button className="fm-blocker-cancel" onClick={() => setBlockerAreaId(null)}><X size={14} /></button>
                    </div>
                  )}
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
        rejectedTickets={todayStatus.rejectedTickets}
        onNavigate={handleNavigate}
        onShowToast={onShowToast}
      />
    </div>
  )
}
