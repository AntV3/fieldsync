import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { calculateProgress } from '../lib/utils'

export default function ForemanView({ project, onShowToast, onExit }) {
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    loadAreas()
  }, [project.id])

  const loadAreas = async () => {
    try {
      const data = await db.getAreas(project.id)
      setAreas(data)
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

  const progress = calculateProgress(areas)

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

      <div className="foreman-areas">
        {areas.map(area => (
          <div key={area.id} className="foreman-area-card">
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
