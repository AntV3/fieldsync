import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { calculateProgress } from '../lib/utils'
import {
  FileText, ClipboardList, AlertTriangle, Info, CheckSquare,
  Truck, FolderOpen, ArrowLeft, ChevronDown, ChevronRight,
  Users, Clock, CheckCircle2, Moon, Sun, Check, BarChart2
} from 'lucide-react'
import TMForm from './TMForm'
import CrewCheckin from './CrewCheckin'
import DailyReport from './DailyReport'
import InjuryReportForm from './InjuryReportForm'
import DisposalLoadInput from './DisposalLoadInput'
import FolderGrid from './documents/FolderGrid'
import ForemanMetrics from './ForemanMetrics'

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

      // Load crew check-in for today
      const crew = await db.getCrewCheckin(project.id, today)
      const crewCheckedIn = crew && crew.length > 0

      // Load T&M tickets for today
      const tickets = await db.getTMTickets?.(project.id) || []
      const todayTickets = tickets.filter(t => t.work_date === today)

      // Load disposal loads for today
      const disposal = await db.getDisposalLoads?.(project.id, today) || []

      setTodayStatus({
        crewCheckedIn,
        crewCount: crew?.length || 0,
        tmTicketsToday: todayTickets.length,
        dailyReportDone: false, // We'll track this separately
        disposalLoadsToday: disposal.length
      })
    } catch (error) {
      console.error('Error loading today status:', error)
    }
  }

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

  // HOME VIEW - Main Dashboard
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

      {/* Progress Bar */}
      <div className="fm-progress-bar">
        <div className="fm-progress-fill" style={{ width: `${progress}%` }}></div>
        <span className="fm-progress-text">{progress}% Complete</span>
      </div>

      {/* Quick Stats */}
      <div className="fm-stats">
        <div className="fm-stat">
          <span className="fm-stat-num working">{areasWorking}</span>
          <span className="fm-stat-label">Working</span>
        </div>
        <div className="fm-stat">
          <span className="fm-stat-num done">{areasDone}</span>
          <span className="fm-stat-label">Done</span>
        </div>
        <div className="fm-stat">
          <span className="fm-stat-num">{areasRemaining}</span>
          <span className="fm-stat-label">Left</span>
        </div>
      </div>

      {/* Smart Action Cards - Priority based on time & completion */}
      <div className="fm-section">
        <h3 className="fm-section-title">
          {isMorning ? 'Good Morning' : isAfternoon ? 'Good Afternoon' : 'Good Evening'}
        </h3>
        <div className="fm-smart-cards">
          {/* Crew Check-in - Priority in morning */}
          <button
            className={`fm-smart-card ${todayStatus.crewCheckedIn ? 'completed' : isMorning ? 'priority' : ''}`}
            onClick={() => setActiveView('crew')}
          >
            <div className="fm-smart-card-icon">
              <Users size={24} />
            </div>
            <div className="fm-smart-card-content">
              <span className="fm-smart-card-title">Crew Check-in</span>
              <span className="fm-smart-card-status">
                {todayStatus.crewCheckedIn
                  ? `${todayStatus.crewCount} checked in`
                  : 'Not done yet'}
              </span>
            </div>
            {todayStatus.crewCheckedIn && (
              <div className="fm-smart-card-check">
                <Check size={20} />
              </div>
            )}
          </button>

          {/* T&M Ticket - Always available */}
          <button
            className={`fm-smart-card ${todayStatus.tmTicketsToday > 0 ? 'has-activity' : ''}`}
            onClick={() => setActiveView('tm')}
          >
            <div className="fm-smart-card-icon">
              <FileText size={24} />
            </div>
            <div className="fm-smart-card-content">
              <span className="fm-smart-card-title">T&M Ticket</span>
              <span className="fm-smart-card-status">
                {todayStatus.tmTicketsToday > 0
                  ? `${todayStatus.tmTicketsToday} today`
                  : 'Create new'}
              </span>
            </div>
            {todayStatus.tmTicketsToday > 0 && (
              <div className="fm-smart-card-badge">{todayStatus.tmTicketsToday}</div>
            )}
          </button>

          {/* Daily Report - Priority in evening */}
          <button
            className={`fm-smart-card ${todayStatus.dailyReportDone ? 'completed' : isEvening ? 'priority' : ''}`}
            onClick={() => setActiveView('report')}
          >
            <div className="fm-smart-card-icon">
              <ClipboardList size={24} />
            </div>
            <div className="fm-smart-card-content">
              <span className="fm-smart-card-title">Daily Report</span>
              <span className="fm-smart-card-status">
                {todayStatus.dailyReportDone ? 'Submitted' : isEvening ? 'Ready to submit' : 'End of day'}
              </span>
            </div>
            {todayStatus.dailyReportDone && (
              <div className="fm-smart-card-check">
                <Check size={20} />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Other Actions */}
      <div className="fm-section">
        <h3 className="fm-section-title">More Actions</h3>
        <div className="fm-secondary-actions">
          <button className="fm-action-row" onClick={() => setActiveView('progress')}>
            <CheckSquare size={20} />
            <span>Update Progress</span>
            <span className="fm-action-badge">{areasRemaining} left</span>
          </button>
          <button className="fm-action-row" onClick={() => setActiveView('metrics')}>
            <BarChart2 size={20} />
            <span>Project Metrics</span>
          </button>
          <button className="fm-action-row" onClick={() => setActiveView('disposal')}>
            <Truck size={20} />
            <span>Disposal Loads</span>
            {todayStatus.disposalLoadsToday > 0 && (
              <span className="fm-action-badge">{todayStatus.disposalLoadsToday} today</span>
            )}
          </button>
          <button className="fm-action-row" onClick={() => setActiveView('docs')}>
            <FolderOpen size={20} />
            <span>Documents</span>
          </button>
        </div>
      </div>

      {/* Emergency Action */}
      <div className="fm-section">
        <button className="fm-action-row danger" onClick={() => setActiveView('injury')}>
          <AlertTriangle size={20} />
          <span>Report Injury</span>
        </button>
      </div>
    </div>
  )
}
