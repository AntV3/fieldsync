import { useState, useEffect } from 'react'
import { HardHat } from 'lucide-react'
import { db } from '../lib/supabase'

export default function CrewCheckin({ project, companyId, onShowToast }) {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newWorker, setNewWorker] = useState({ name: '', role: '', labor_class_id: null })

  // Labor classes from company pricing setup
  const [laborCategories, setLaborCategories] = useState([])
  const [laborClasses, setLaborClasses] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(true)

  // Fallback roles if no custom labor classes are set up
  const defaultRoles = ['Foreman', 'Laborer', 'Supervisor', 'Operator']

  useEffect(() => {
    loadTodaysCrew()
    if (companyId) {
      loadLaborClasses()
    } else {
      setLoadingClasses(false)
    }
  }, [project.id, companyId])

  const loadLaborClasses = async () => {
    try {
      const data = await db.getLaborClassesWithCategories(companyId)
      setLaborCategories(data.categories || [])
      setLaborClasses(data.classes || [])

      // Set default selection to first class if available
      if (data.classes && data.classes.length > 0) {
        setNewWorker(prev => ({
          ...prev,
          role: data.classes[0].name,
          labor_class_id: data.classes[0].id
        }))
      }
    } catch (err) {
      console.error('Error loading labor classes:', err)
    } finally {
      setLoadingClasses(false)
    }
  }

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

  const handleRoleChange = (value) => {
    // Check if it's a labor class ID (UUID format)
    const laborClass = laborClasses.find(lc => lc.id === value)
    if (laborClass) {
      setNewWorker({
        ...newWorker,
        role: laborClass.name,
        labor_class_id: laborClass.id
      })
    } else {
      // It's a default role
      setNewWorker({
        ...newWorker,
        role: value,
        labor_class_id: null
      })
    }
  }

  const handleAddWorker = async () => {
    if (!newWorker.name.trim()) {
      onShowToast('Enter worker name', 'error')
      return
    }

    if (!newWorker.role) {
      onShowToast('Select a role', 'error')
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
        role: newWorker.role,
        labor_class_id: newWorker.labor_class_id
      }]

      await db.saveCrewCheckin(project.id, updatedWorkers)
      setWorkers(updatedWorkers)

      // Reset form but keep same role selected for quick entry
      setNewWorker({ ...newWorker, name: '' })
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

  // Group labor classes by category for display
  const getClassesByCategory = () => {
    const grouped = {}
    laborCategories.forEach(cat => {
      grouped[cat.id] = {
        name: cat.name,
        classes: laborClasses.filter(lc => lc.category_id === cat.id)
      }
    })
    // Add uncategorized classes
    const uncategorized = laborClasses.filter(lc => !lc.category_id)
    if (uncategorized.length > 0) {
      grouped['uncategorized'] = {
        name: 'Other',
        classes: uncategorized
      }
    }
    return grouped
  }

  const hasCustomClasses = laborClasses.length > 0

  if (loading || loadingClasses) {
    return (
      <div className="crew-checkin">
        <div className="crew-header">
          <h3><HardHat size={18} className="inline-icon" /> Today's Crew</h3>
          <span className="crew-date">{today}</span>
        </div>
        <div className="crew-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="crew-checkin">
      <div className="crew-header">
        <h3><HardHat size={18} className="inline-icon" /> Today's Crew</h3>
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
                <span className={`crew-member-role ${(worker.role || 'laborer').toLowerCase().replace(/\s+/g, '-')}`}>
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
            value={newWorker.labor_class_id || newWorker.role}
            onChange={(e) => handleRoleChange(e.target.value)}
          >
            {hasCustomClasses ? (
              // Show labor classes from company pricing
              Object.entries(getClassesByCategory()).map(([catId, category]) => (
                <optgroup key={catId} label={category.name}>
                  {category.classes.map(lc => (
                    <option key={lc.id} value={lc.id}>
                      {lc.name}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : (
              // Fallback to default roles
              defaultRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))
            )}
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
                setNewWorker({ name: '', role: laborClasses[0]?.name || 'Laborer', labor_class_id: laborClasses[0]?.id || null })
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
