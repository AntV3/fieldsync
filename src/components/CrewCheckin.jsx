import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function CrewCheckin({ project, onShowToast }) {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newWorker, setNewWorker] = useState({ name: '', role: 'Laborer' })

  useEffect(() => {
    loadTodaysCrew()
  }, [project.id])

  const loadTodaysCrew = async () => {
    try {
      const checkin = await db.getCrewCheckin(project.id)
      if (checkin?.workers) {
        setWorkers(checkin.workers)
      }
    } catch (err) {
      console.error('Error loading crew:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddWorker = async () => {
    if (!newWorker.name.trim()) {
      onShowToast('Enter worker name', 'error')
      return
    }

    // Check for duplicate
    if (workers.find(w => w.name.toLowerCase() === newWorker.name.trim().toLowerCase())) {
      onShowToast('Worker already added', 'error')
      return
    }

    setSaving(true)
    try {
      const updatedWorkers = [...workers, { 
        name: newWorker.name.trim(), 
        role: newWorker.role 
      }]
      
      await db.saveCrewCheckin(project.id, updatedWorkers)
      setWorkers(updatedWorkers)
      setNewWorker({ name: '', role: 'Laborer' })
      setShowAddForm(false)
      onShowToast('Crew member added', 'success')
    } catch (err) {
      console.error('Error adding worker:', err)
      onShowToast('Error adding crew member', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveWorker = async (workerName) => {
    setSaving(true)
    try {
      const updatedWorkers = workers.filter(
        w => w.name.toLowerCase() !== workerName.toLowerCase()
      )
      await db.saveCrewCheckin(project.id, updatedWorkers)
      setWorkers(updatedWorkers)
      onShowToast('Crew member removed', 'success')
    } catch (err) {
      console.error('Error removing worker:', err)
      onShowToast('Error removing crew member', 'error')
    } finally {
      setSaving(false)
    }
  }

  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  })

  if (loading) {
    return (
      <div className="crew-checkin">
        <div className="crew-header">
          <h3>👷 Today's Crew</h3>
          <span className="crew-date">{today}</span>
        </div>
        <div className="crew-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="crew-checkin">
      <div className="crew-header">
        <h3>👷 Today's Crew</h3>
        <span className="crew-date">{today}</span>
      </div>

      {workers.length === 0 ? (
        <div className="crew-empty">
          <p>No crew checked in yet</p>
          <p className="crew-empty-hint">Add your crew for the day</p>
        </div>
      ) : (
        <div className="crew-list">
          {workers.map((worker) => (
            <div key={worker.name} className="crew-member">
              <div className="crew-member-info">
                <span className="crew-member-name">{worker.name}</span>
                <span className={`crew-member-role ${worker.role.toLowerCase()}`}>
                  {worker.role}
                </span>
              </div>
              <button 
                className="crew-remove-btn"
                onClick={() => handleRemoveWorker(worker.name)}
                disabled={saving}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <div className="crew-add-form">
          <input
            type="text"
            value={newWorker.name}
            onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
            placeholder="Name"
            autoFocus
          />
          <select
            value={newWorker.role}
            onChange={(e) => setNewWorker({ ...newWorker, role: e.target.value })}
          >
            <option value="Foreman">Foreman</option>
            <option value="Laborer">Laborer</option>
            <option value="Supervisor">Supervisor</option>
            <option value="Operator">Operator</option>
          </select>
          <div className="crew-add-buttons">
            <button 
              className="crew-add-confirm"
              onClick={handleAddWorker}
              disabled={saving}
            >
              {saving ? '...' : 'Add'}
            </button>
            <button 
              className="crew-add-cancel"
              onClick={() => {
                setShowAddForm(false)
                setNewWorker({ name: '', role: 'Laborer' })
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button 
          className="crew-add-btn"
          onClick={() => setShowAddForm(true)}
        >
          + Add Crew Member
        </button>
      )}

      <div className="crew-count">
        {workers.length} {workers.length === 1 ? 'person' : 'people'} on site
      </div>
    </div>
  )
}
