import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { calculateProgress } from '../lib/utils'
import TMForm from './TMForm'
import TMList from './TMList'
import CrewCheckin from './CrewCheckin'
import DailyReport from './DailyReport'
import Messages from './Messages'
import MaterialRequest from './MaterialRequest'

export default function ForemanView({ project, companyId, onShowToast, onExit }) {
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({})
  const [showTMForm, setShowTMForm] = useState(false)
  const [showTMList, setShowTMList] = useState(false)
  const [showCrewCheckin, setShowCrewCheckin] = useState(true)
  const [showDailyReport, setShowDailyReport] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  const [showMaterialRequest, setShowMaterialRequest] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    loadAreas()
    loadUnreadCount()
  }, [project.id])

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

  const loadUnreadCount = async () => {
    const count = await db.getUnreadCount(project.id, 'field')
    setUnreadMessages(count)
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

  // Show Messages
  if (showMessages) {
    return (
      <Messages
        project={project}
        viewerType="field"
        viewerName="Field"
        onShowToast={onShowToast}
        onClose={() => {
          setShowMessages(false)
          loadUnreadCount()
        }}
      />
    )
  }

  // Show Material Request
  if (showMaterialRequest) {
    return (
      <MaterialRequest
        project={project}
        requestedBy="Field"
        onShowToast={onShowToast}
        onClose={() => setShowMaterialRequest(false)}
      />
    )
  }

  // Show T&M List
  if (showTMList) {
    return (
      <div className="foreman-container">
        <div className="foreman-header">
          <button className="back-btn" onClick={() => setShowTMList(false)}>
            ← Back
          </button>
          <h2>T&M Tickets</h2>
        </div>
        <TMList project={project} onShowToast={onShowToast} />
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
      </div>

      {/* Action Buttons */}
      <div className="field-actions">
        <button
          className="field-action-btn"
          onClick={() => setShowTMForm(true)}
        >
          <span className="icon">📝</span>
          T&M Ticket
        </button>
        <button
          className="field-action-btn"
          onClick={() => setShowTMList(true)}
        >
          <span className="icon">📊</span>
          View T&M
        </button>
        <button
          className="field-action-btn"
          onClick={() => setShowMessages(true)}
        >
          <span className="icon">💬</span>
          Messages
          {unreadMessages > 0 && <span className="badge">{unreadMessages}</span>}
        </button>
        <button 
          className="field-action-btn"
          onClick={() => setShowMaterialRequest(true)}
        >
          <span className="icon">📦</span>
          Need Materials
        </button>
        <button 
          className="field-action-btn"
          onClick={() => setShowDailyReport(true)}
        >
          <span className="icon">📋</span>
          Daily Report
        </button>
      </div>

      {/* Crew Check-In */}
      <CrewCheckin 
        project={project}
        onShowToast={onShowToast}
      />

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
      </div>

      {areas.length === 0 && (
        <div className="foreman-empty">
          <div className="foreman-empty-icon">📋</div>
          <div className="foreman-empty-text">No areas yet</div>
          <div className="foreman-empty-subtext">Office needs to add areas to this project</div>
        </div>
      )}
    </div>
  )
}





