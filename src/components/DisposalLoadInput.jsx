import { useState, useEffect } from 'react'
import { Truck, Plus, Minus, Check, X, ChevronDown, ChevronUp, History, Box, Trash2, Wrench, Biohazard, Coins, Construction, Package } from 'lucide-react'
import { db } from '../lib/supabase'
import { parseLocalDate } from '../lib/utils'

const LOAD_TYPES = [
  { value: 'concrete', label: 'Concrete', Icon: Box },
  { value: 'trash', label: 'Trash', Icon: Trash2 },
  { value: 'metals', label: 'Metals', Icon: Wrench },
  { value: 'hazardous_waste', label: 'Hazardous', Icon: Biohazard },
  { value: 'copper', label: 'Copper', Icon: Coins },
  { value: 'asphalt', label: 'Asphalt', Icon: Construction }
]

const getLoadTypeInfo = (type) => LOAD_TYPES.find(t => t.value === type) || { label: type, Icon: Package }

export default function DisposalLoadInput({ project, user = null, date, onShowToast }) {
  const [loads, setLoads] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [newLoad, setNewLoad] = useState({ type: 'concrete', count: 1 })
  const [truckCount, setTruckCount] = useState(0)
  const [savingTrucks, setSavingTrucks] = useState(false)

  // Format date for display
  const displayDate = parseLocalDate(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })

  useEffect(() => {
    loadDisposalData()
    loadHistory()
    loadTruckCount()
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

  const loadHistory = async () => {
    try {
      const data = await db.getDisposalLoadsHistory(project.id, 14) // Last 14 days
      // Group by date and filter out today
      const grouped = (data || [])
        .filter(load => load.load_date !== date)
        .reduce((acc, load) => {
          if (!acc[load.load_date]) {
            acc[load.load_date] = []
          }
          acc[load.load_date].push(load)
          return acc
        }, {})

      // Convert to array sorted by date descending
      const historyArray = Object.entries(grouped)
        .map(([dateStr, loads]) => ({
          date: dateStr,
          loads,
          totalLoads: loads.reduce((sum, l) => sum + l.load_count, 0)
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      setHistory(historyArray)
    } catch (err) {
      console.error('Error loading disposal history:', err)
    }
  }

  const loadTruckCount = async () => {
    try {
      const data = await db.getTruckCount(project.id, date)
      setTruckCount(data?.truck_count || 0)
    } catch (err) {
      console.error('Error loading truck count:', err)
    }
  }

  const handleTruckCountChange = async (delta) => {
    const previousCount = truckCount
    const newCount = Math.max(0, truckCount + delta)
    setTruckCount(newCount)
    setSavingTrucks(true)
    try {
      await db.setTruckCount(project.id, date, newCount)
    } catch (err) {
      console.error('Error saving truck count:', err)
      setTruckCount(previousCount) // revert on error
      const msg = err?.code === '42501' ? 'Session expired — please re-enter your PIN'
        : err?.code === '0A000' ? 'Database configuration error — please contact support'
        : 'Error saving truck count'
      onShowToast?.(msg, 'error')
    } finally {
      setSavingTrucks(false)
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
      const msg = err?.code === '42501' ? 'Session expired — please re-enter your PIN'
        : err?.code === '0A000' ? 'Database configuration error — please contact support'
        : 'Error adding load'
      onShowToast?.(msg, 'error')
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
      const msg = err?.code === '42501' ? 'Session expired — please re-enter your PIN'
        : err?.code === '0A000' ? 'Database configuration error — please contact support'
        : 'Error removing load'
      onShowToast?.(msg, 'error')
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
      const msg = err?.code === '42501' ? 'Session expired — please re-enter your PIN'
        : err?.code === '0A000' ? 'Database configuration error — please contact support'
        : 'Error adding load'
      onShowToast?.(msg, 'error')
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
      const msg = err?.code === '42501' ? 'Session expired — please re-enter your PIN'
        : err?.code === '0A000' ? 'Database configuration error — please contact support'
        : 'Error updating load'
      onShowToast?.(msg, 'error')
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
      const msg = err?.code === '42501' ? 'Session expired — please re-enter your PIN'
        : err?.code === '0A000' ? 'Database configuration error — please contact support'
        : 'Error updating load'
      onShowToast?.(msg, 'error')
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
        {LOAD_TYPES.map(type => {
          const TypeIcon = type.Icon
          return (
            <button
              key={type.value}
              className="quick-add-btn"
              onClick={() => handleQuickAdd(type.value)}
              disabled={saving}
            >
              <span className="quick-add-icon"><TypeIcon size={20} /></span>
              <span className="quick-add-label">+ {type.label}</span>
            </button>
          )
        })}
      </div>

      {/* Current Loads */}
      {Object.keys(loadsByType).length > 0 ? (
        <div className="disposal-loads-list">
          {LOAD_TYPES.map(type => {
            const typeData = loadsByType[type.value]
            if (!typeData) return null
            const TypeIcon = type.Icon

            return (
              <div key={type.value} className="disposal-load-row">
                <div className="load-info">
                  <span className="load-icon"><TypeIcon size={18} /></span>
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
                  {type.label}
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

      {/* Trucks Used Section */}
      <div className="disposal-trucks-section">
        <div className="disposal-trucks-header">
          <Truck size={16} />
          <span>Trucks Used</span>
        </div>
        <div className="disposal-trucks-controls">
          <button
            className="load-btn decrement"
            onClick={() => handleTruckCountChange(-1)}
            disabled={savingTrucks || truckCount <= 0}
          >
            <Minus size={16} />
          </button>
          <span className="load-count">{truckCount}</span>
          <button
            className="load-btn increment"
            onClick={() => handleTruckCountChange(1)}
            disabled={savingTrucks}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Summary */}
      {(totalLoads > 0 || truckCount > 0) && (
        <div className="disposal-summary">
          <strong>{totalLoads}</strong> total load{totalLoads !== 1 ? 's' : ''}{truckCount > 0 ? ` across ${truckCount} truck${truckCount !== 1 ? 's' : ''}` : ''} today
        </div>
      )}

      {/* History Section */}
      {history.length > 0 && (
        <div className="disposal-history-section">
          <button
            className="disposal-history-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={16} />
            <span>View History ({history.length} days)</span>
            {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showHistory && (
            <div className="disposal-history-list">
              {history.map(day => {
                const formattedDate = new Date(day.date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })

                // Group loads by type for this day
                const loadsByType = day.loads.reduce((acc, load) => {
                  if (!acc[load.load_type]) {
                    acc[load.load_type] = 0
                  }
                  acc[load.load_type] += load.load_count
                  return acc
                }, {})

                return (
                  <div key={day.date} className="disposal-history-day">
                    <div className="disposal-history-header">
                      <span className="disposal-history-date">{formattedDate}</span>
                      <span className="disposal-history-total">{day.totalLoads} load{day.totalLoads !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="disposal-history-types">
                      {Object.entries(loadsByType).map(([type, count]) => {
                        const typeInfo = getLoadTypeInfo(type)
                        const TypeIcon = typeInfo.Icon
                        return (
                          <span key={type} className="disposal-history-type">
                            <TypeIcon size={14} /> {count} {typeInfo.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
