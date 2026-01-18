import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { calculateProgress } from '../lib/utils'
import { FileText, ClipboardList, AlertTriangle, Info, CheckSquare, Zap, HardHat, Truck, FolderOpen } from 'lucide-react'
import TMForm from './TMForm'
import CrewCheckin from './CrewCheckin'
import DailyReport from './DailyReport'
import InjuryReportForm from './InjuryReportForm'
import ThemeToggle from './ThemeToggle'
import DisposalLoadInput from './DisposalLoadInput'
import FolderGrid from './documents/FolderGrid'

export default function ForemanView({ project, companyId, onShowToast, onExit }) {
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({})
  const [showTMForm, setShowTMForm] = useState(false)
  const [showCrewCheckin, setShowCrewCheckin] = useState(false)
  const [showDisposalLoads, setShowDisposalLoads] = useState(false)
  const [showDailyReport, setShowDailyReport] = useState(false)
  const [showInjuryReport, setShowInjuryReport] = useState(false)
  const [showProjectInfo, setShowProjectInfo] = useState(false)
  const [activeTab, setActiveTab] = useState('actions')

  useEffect(() => {
    if (project?.id) {
      loadAreas()
    }
  }, [project?.id])

  const loadAreas = async () => {
    try {
      const data = await db.getAreas(project.id)
      setAreas(data)

      // Start all groups collapsed initially
      const groups = [...new Set(data.map(a => a.group_name || 'General'))]
      const expanded = {}
      groups.forEach(g => expanded[g] = false)
      setExpandedGroups(expanded)
    } catch (error) {
      console.error('Error loading areas:', error)
      onShowToast('Error loading areas', 'error')
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

      setAreas(prev => prev.map(a =>
        a.id === areaId ? { ...a, status: finalStatus } : a
      ))

      onShowToast('Updated', 'success')
    } catch (error) {
      console.error('Error updating status:', error)
      onShowToast('Error updating', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }))
  }

  if (loading) {
    return (
      <div className="foreman-container">
        <div className="loading">
          <div className="spinner"></div>
          Loading...
        </div>
      </div>
    )
  }

  // Show T&M form
  if (showTMForm) {
    return (
      <div className="foreman-container">
        <TMForm
          project={project}
          companyId={companyId}
          onSubmit={() => setShowTMForm(false)}
          onCancel={() => setShowTMForm(false)}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  // Show Daily Report
  if (showDailyReport) {
    return (
      <DailyReport
        project={project}
        onShowToast={onShowToast}
        onClose={() => setShowDailyReport(false)}
      />
    )
  }

  // Show Injury Report
  if (showInjuryReport) {
    return (
      <div className="foreman-container">
        <InjuryReportForm
          project={project}
          companyId={companyId}
          onClose={() => setShowInjuryReport(false)}
          onReportCreated={() => {
            setShowInjuryReport(false)
            onShowToast('Injury report submitted', 'success')
          }}
        />
      </div>
    )
  }

  // Show Crew Check-in
  if (showCrewCheckin) {
    return (
      <div className="foreman-container">
        <div className="foreman-view-header">
          <button className="back-btn-simple" onClick={() => setShowCrewCheckin(false)}>
            ←
          </button>
          <h2>Crew Check-in</h2>
        </div>
        <CrewCheckin
          project={project}
          companyId={companyId}
          onShowToast={onShowToast}
        />
      </div>
    )
  }

  // Show Disposal Loads
  if (showDisposalLoads) {
    return (
      <div className="foreman-container">
        <div className="foreman-view-header">
          <button className="back-btn-simple" onClick={() => setShowDisposalLoads(false)}>
            ←
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

  const progress = calculateProgress(areas)
  
  // Group areas by group_name
  const groupedAreas = areas.reduce((acc, area) => {
    const group = area.group_name || 'General'
    if (!acc[group]) acc[group] = []
    acc[group].push(area)
    return acc
  }, {})

  const hasGroups = Object.keys(groupedAreas).length > 1 || 
    (Object.keys(groupedAreas).length === 1 && !groupedAreas['General'])

  // Calculate group progress
  const getGroupProgress = (groupAreas) => {
    const done = groupAreas.filter(a => a.status === 'done').length
    return `${done}/${groupAreas.length}`
  }

  // Calculate stats
  const areasDone = areas.filter(a => a.status === 'done').length
  const areasWorking = areas.filter(a => a.status === 'working').length
  const areasRemaining = areas.length - areasDone

  return (
    <div className="foreman-container">
      <div className="foreman-header">
        <button className="back-btn-simple" onClick={onExit}>
          ←
        </button>
        <div className="foreman-header-info">
          <div className="foreman-project-name">{project.name}</div>
          <div className="foreman-progress">{progress}% Complete</div>
        </div>
        <div className="foreman-header-actions">
          <ThemeToggle compact />
          <button
            className="foreman-info-btn"
            onClick={() => setShowProjectInfo(!showProjectInfo)}
          >
            <Info size={20} />
          </button>
        </div>
      </div>

      {/* Project Info Panel */}
      {showProjectInfo && (
        <div className="foreman-project-info">
          {project.job_number && (
            <div className="foreman-info-row">
              <span className="foreman-info-label">Job #</span>
              <span className="foreman-info-value">{project.job_number}</span>
            </div>
          )}
          {project.address && (
            <div className="foreman-info-row">
              <span className="foreman-info-label">Address</span>
              <span className="foreman-info-value">{project.address}</span>
            </div>
          )}
          {project.general_contractor && (
            <div className="foreman-info-row">
              <span className="foreman-info-label">GC / Client</span>
              <span className="foreman-info-value">{project.general_contractor}</span>
            </div>
          )}
          {project.client_contact && (
            <div className="foreman-info-row">
              <span className="foreman-info-label">Contact</span>
              <span className="foreman-info-value">{project.client_contact}</span>
            </div>
          )}
          {project.client_phone && (
            <div className="foreman-info-row">
              <span className="foreman-info-label">Phone</span>
              <a href={`tel:${project.client_phone}`} className="foreman-info-value foreman-info-link">
                {project.client_phone}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="foreman-stats">
        <div className="foreman-stat">
          <div className="foreman-stat-value working">{areasWorking}</div>
          <div className="foreman-stat-label">Working</div>
        </div>
        <div className="foreman-stat">
          <div className="foreman-stat-value done">{areasDone}</div>
          <div className="foreman-stat-label">Done</div>
        </div>
        <div className="foreman-stat">
          <div className="foreman-stat-value remaining">{areasRemaining}</div>
          <div className="foreman-stat-label">Remaining</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="foreman-tabs">
        <button
          className={`foreman-tab ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          <Zap size={18} />
          Actions
        </button>
        <button
          className={`foreman-tab ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
        >
          <CheckSquare size={18} />
          Progress
        </button>
        <button
          className={`foreman-tab ${activeTab === 'docs' ? 'active' : ''}`}
          onClick={() => setActiveTab('docs')}
        >
          <FolderOpen size={18} />
          Docs
        </button>
      </div>

      {/* Actions Tab */}
      {activeTab === 'actions' && (
        <div className="field-actions">
          <button
            className="field-action-btn"
            onClick={() => setShowCrewCheckin(true)}
          >
            <HardHat size={22} />
            Crew Check-in
          </button>
          <button
            className="field-action-btn"
            onClick={() => setShowTMForm(true)}
          >
            <FileText size={22} />
            T&M Ticket
          </button>
          <button
            className="field-action-btn"
            onClick={() => setShowDisposalLoads(true)}
          >
            <Truck size={22} />
            Disposal Loads
          </button>
          <button
            className="field-action-btn"
            onClick={() => setShowDailyReport(true)}
          >
            <ClipboardList size={22} />
            Daily Report
          </button>
          <button
            className="field-action-btn danger"
            onClick={() => setShowInjuryReport(true)}
          >
            <AlertTriangle size={22} />
            Report Injury
          </button>
        </div>
      )}

      {/* Docs Tab */}
      {activeTab === 'docs' && (
        <div className="foreman-docs">
          <FolderGrid
            projectId={project.id}
            onShowToast={onShowToast}
          />
        </div>
      )}

      {/* Progress Tab */}
      {activeTab === 'progress' && (
        <div className="foreman-areas">
        {hasGroups ? (
          // Grouped display with clear sections
          Object.entries(groupedAreas).map(([group, groupAreas]) => (
            <div key={group} className="foreman-group">
              <div 
                className="foreman-group-header"
                onClick={() => toggleGroup(group)}
              >
                <div className="foreman-group-title">
                  <span className="foreman-group-arrow">
                    {expandedGroups[group] ? '▼' : '▶'}
                  </span>
                  <span className="foreman-group-name">{group}</span>
                </div>
                <span className="foreman-group-progress">
                  {getGroupProgress(groupAreas)}
                </span>
              </div>
              
              {expandedGroups[group] && (
                <div className="foreman-group-tasks">
                  {groupAreas.map(area => (
                    <div key={area.id} className={`foreman-area-card ${area.status}`}>
                      <div className="foreman-area-name">{area.name}</div>
                      <div className="foreman-area-buttons">
                        <button
                          className={`foreman-btn working ${area.status === 'working' ? 'active' : ''}`}
                          onClick={() => handleStatusUpdate(area.id, 'working')}
                          disabled={updating === area.id}
                        >
                          {updating === area.id ? '...' : 'Working'}
                        </button>
                        <button
                          className={`foreman-btn done ${area.status === 'done' ? 'active' : ''}`}
                          onClick={() => handleStatusUpdate(area.id, 'done')}
                          disabled={updating === area.id}
                        >
                          {updating === area.id ? '...' : 'Done'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          // Flat display (no groups)
          areas.map(area => (
            <div key={area.id} className={`foreman-area-card ${area.status}`}>
              <div className="foreman-area-name">{area.name}</div>
              <div className="foreman-area-buttons">
                <button
                  className={`foreman-btn working ${area.status === 'working' ? 'active' : ''}`}
                  onClick={() => handleStatusUpdate(area.id, 'working')}
                  disabled={updating === area.id}
                >
                  {updating === area.id ? '...' : 'Working'}
                </button>
                <button
                  className={`foreman-btn done ${area.status === 'done' ? 'active' : ''}`}
                  onClick={() => handleStatusUpdate(area.id, 'done')}
                  disabled={updating === area.id}
                >
                  {updating === area.id ? '...' : 'Done'}
                </button>
              </div>
            </div>
          ))
        )}

          {areas.length === 0 && (
            <div className="foreman-empty">
              <ClipboardList size={48} className="foreman-empty-icon" />
              <div className="foreman-empty-text">No areas yet</div>
              <div className="foreman-empty-subtext">Office needs to add areas to this project</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}





