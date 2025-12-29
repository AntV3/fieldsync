import { useState, useEffect } from 'react'
import { Truck, Plus, Minus, Trash2, Check, X } from 'lucide-react'
import { db } from '../lib/supabase'

const LOAD_TYPES = [
  { value: 'concrete', label: 'Concrete', icon: '🧱' },
  { value: 'trash', label: 'Trash', icon: '🗑️' },
  { value: 'metals', label: 'Metals', icon: '🔩' },
  { value: 'hazardous_waste', label: 'Hazardous', icon: '☣️' }
]

export default function DisposalLoadInput({ project, user = null, date, onShowToast }) {
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLoad, setNewLoad] = useState({ type: 'concrete', count: 1 })

  // Format date for display
  const displayDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })

  useEffect(() => {
    loadDisposalData()
  }, [project.id, date])

  const loadDisposalData = async () => {
    try {
      setLoading(true)
      const data = await db.getDisposalLoads(project.id, date)
      setLoads(data || [])
    } catch (err) {
      console.error('Error loading disposal loads:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddLoad = async () => {
    if (newLoad.count < 1) return

    setSaving(true)
    try {
      await db.addDisposalLoad(
        project.id,
        user?.id || null,
        date,
        newLoad.type,
        newLoad.count
      )
      await loadDisposalData()
      setNewLoad({ type: 'concrete', count: 1 })
      setShowAddForm(false)
      onShowToast?.('Disposal load added', 'success')
    } catch (err) {
      console.error('Error adding disposal load:', err)
      onShowToast?.('Error adding load', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLoad = async (id) => {
    setSaving(true)
    try {
      await db.deleteDisposalLoad(id)
      await loadDisposalData()
      onShowToast?.('Load removed', 'success')
    } catch (err) {
      console.error('Error deleting disposal load:', err)
      onShowToast?.('Error removing load', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleQuickAdd = async (loadType) => {
    setSaving(true)
    try {
      await db.addDisposalLoad(project.id, user?.id || null, date, loadType, 1)
      await loadDisposalData()
      onShowToast?.('Load added', 'success')
    } catch (err) {
      console.error('Error adding disposal load:', err)
      onShowToast?.('Error adding load', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleIncrementLoad = async (load) => {
    setSaving(true)
    try {
      await db.updateDisposalLoad(load.id, load.load_type, load.load_count + 1)
      await loadDisposalData()
    } catch (err) {
      console.error('Error updating load:', err)
      onShowToast?.('Error updating load', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDecrementLoad = async (load) => {
    if (load.load_count <= 1) {
      await handleDeleteLoad(load.id)
      return
    }

    setSaving(true)
    try {
      await db.updateDisposalLoad(load.id, load.load_type, load.load_count - 1)
      await loadDisposalData()
    } catch (err) {
      console.error('Error updating load:', err)
      onShowToast?.('Error updating load', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Group loads by type for display
  const loadsByType = loads.reduce((acc, load) => {
    if (!acc[load.load_type]) {
      acc[load.load_type] = { items: [], total: 0 }
    }
    acc[load.load_type].items.push(load)
    acc[load.load_type].total += load.load_count
    return acc
  }, {})

  const totalLoads = loads.reduce((sum, l) => sum + l.load_count, 0)

  if (loading) {
    return (
      <div className="disposal-load-input">
        <div className="disposal-header">
          <Truck size={20} />
          <span>Disposal Loads</span>
        </div>
        <div className="disposal-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="disposal-load-input">
      <div className="disposal-header">
        <div className="disposal-title">
          <Truck size={20} />
          <span>Disposal Loads</span>
          {totalLoads > 0 && (
            <span className="disposal-badge">{totalLoads}</span>
          )}
        </div>
        <span className="disposal-date">{displayDate}</span>
      </div>

      {/* Quick Add Buttons */}
      <div className="disposal-quick-add">
        {LOAD_TYPES.map(type => (
          <button
            key={type.value}
            className="quick-add-btn"
            onClick={() => handleQuickAdd(type.value)}
            disabled={saving}
          >
            <span className="quick-add-icon">{type.icon}</span>
            <span className="quick-add-label">+ {type.label}</span>
          </button>
        ))}
      </div>

      {/* Current Loads */}
      {Object.keys(loadsByType).length > 0 ? (
        <div className="disposal-loads-list">
          {LOAD_TYPES.map(type => {
            const typeData = loadsByType[type.value]
            if (!typeData) return null

            return (
              <div key={type.value} className="disposal-load-row">
                <div className="load-info">
                  <span className="load-icon">{type.icon}</span>
                  <span className="load-label">{type.label}</span>
                </div>
                <div className="load-controls">
                  <button
                    className="load-btn decrement"
                    onClick={() => handleDecrementLoad(typeData.items[0])}
                    disabled={saving}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="load-count">{typeData.total}</span>
                  <button
                    className="load-btn increment"
                    onClick={() => handleIncrementLoad(typeData.items[0])}
                    disabled={saving}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="disposal-empty">
          <p>No disposal loads recorded for {displayDate}</p>
          <p className="disposal-hint">Tap a button above to add loads</p>
        </div>
      )}

      {/* Add Custom Amount Form */}
      {showAddForm && (
        <div className="disposal-add-form">
          <div className="add-form-row">
            <select
              value={newLoad.type}
              onChange={(e) => setNewLoad({ ...newLoad, type: e.target.value })}
              className="load-type-select"
            >
              {LOAD_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
            <div className="count-input-group">
              <button
                className="count-btn"
                onClick={() => setNewLoad({ ...newLoad, count: Math.max(1, newLoad.count - 1) })}
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                min="1"
                value={newLoad.count}
                onChange={(e) => setNewLoad({ ...newLoad, count: parseInt(e.target.value) || 1 })}
                className="count-input"
              />
              <button
                className="count-btn"
                onClick={() => setNewLoad({ ...newLoad, count: newLoad.count + 1 })}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="add-form-actions">
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setShowAddForm(false)}
            >
              <X size={16} /> Cancel
            </button>
            <button
              className="btn btn-primary btn-small"
              onClick={handleAddLoad}
              disabled={saving}
            >
              <Check size={16} /> Add
            </button>
          </div>
        </div>
      )}

      {/* Toggle Custom Form */}
      {!showAddForm && (
        <button
          className="disposal-add-custom"
          onClick={() => setShowAddForm(true)}
        >
          <Plus size={16} />
          Add multiple loads
        </button>
      )}

      {/* Summary */}
      {totalLoads > 0 && (
        <div className="disposal-summary">
          <strong>{totalLoads}</strong> total load{totalLoads !== 1 ? 's' : ''} today
        </div>
      )}
    </div>
  )
}
