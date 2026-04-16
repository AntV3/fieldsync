import { useEffect, useMemo, useState } from 'react'
import { Layers, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { db } from '../../lib/supabase'

const UNPHASED_VALUE = '__unphased__'

export default function PhaseAssignmentEditor({ projectId, areas, onShowToast, onAreasChanged }) {
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [reorderingPhases, setReorderingPhases] = useState(false)
  const [localAreas, setLocalAreas] = useState(areas || [])

  useEffect(() => {
    setLocalAreas(areas || [])
  }, [areas])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!projectId) return
      setLoading(true)
      try {
        const data = db.getPhases ? await db.getPhases(projectId) : []
        if (!cancelled) setPhases((data || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
      } catch (err) {
        console.error('Error loading phases:', err)
        if (!cancelled) setPhases([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  // Options shown in the dropdown. Real phases come first (in sort_order)
  // followed by any "orphan" group_name values on areas that don't yet have
  // a matching phase row - so existing data stays visible until cleaned up.
  const phaseOptions = useMemo(() => {
    const fromPhases = phases.map(p => p.name)
    const known = new Set(fromPhases)
    const orphanNames = []
    ;(localAreas || []).forEach(a => {
      if (a.group_name && !known.has(a.group_name)) {
        orphanNames.push(a.group_name)
        known.add(a.group_name)
      }
    })
    return [...fromPhases, ...orphanNames]
  }, [phases, localAreas])

  const handleChange = async (areaId, value) => {
    const nextGroupName = value === UNPHASED_VALUE ? null : value
    const target = localAreas.find(a => a.id === areaId)
    const previous = target?.group_name ?? null
    if (previous === nextGroupName) return

    setSavingId(areaId)
    setLocalAreas(prev => prev.map(a => a.id === areaId ? { ...a, group_name: nextGroupName } : a))
    try {
      await db.updateAreaPhase(areaId, nextGroupName, projectId)
      onShowToast?.('Task reassigned', 'success')
      onAreasChanged?.()
    } catch (err) {
      console.error('Error reassigning task:', err)
      setLocalAreas(prev => prev.map(a => a.id === areaId ? { ...a, group_name: previous } : a))
      onShowToast?.('Could not reassign task', 'error')
    } finally {
      setSavingId(null)
    }
  }

  const movePhase = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= phases.length) return
    const nextOrder = phases.slice()
    const [moved] = nextOrder.splice(index, 1)
    nextOrder.splice(targetIndex, 0, moved)

    const previous = phases
    setPhases(nextOrder)
    setReorderingPhases(true)
    try {
      await db.reorderPhases(projectId, nextOrder.map(p => p.id))
      onShowToast?.('Phase order updated', 'success')
    } catch (err) {
      console.error('Error reordering phases:', err)
      setPhases(previous)
      onShowToast?.('Could not update phase order', 'error')
    } finally {
      setReorderingPhases(false)
    }
  }

  // Render order matches phaseOptions so the office view mirrors what the
  // foreman sees (foreman renders by sort_order, with orphans + unphased last).
  const renderOrder = useMemo(() => {
    const order = [...phaseOptions]
    if ((localAreas || []).some(a => !a.group_name)) order.push(UNPHASED_VALUE)
    return order
  }, [phaseOptions, localAreas])

  const grouped = useMemo(() => {
    const map = new Map()
    renderOrder.forEach(name => map.set(name, []))
    ;(localAreas || []).forEach(a => {
      const key = a.group_name || UNPHASED_VALUE
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(a)
    })
    return map
  }, [localAreas, renderOrder])

  if (!projectId) return null

  const totalTasks = (localAreas || []).length

  return (
    <div className="info-section-card">
      <div className="info-section-header">
        <Layers size={18} />
        <h3>Tasks by Phase</h3>
        <span className="info-section-badges">
          <span className="info-badge">{totalTasks} tasks</span>
          <span className="info-badge">{phases.length} phases</span>
        </span>
      </div>

      {loading ? (
        <div className="info-areas-list"><div className="info-area-item"><Loader2 size={14} className="spin" /> <span>Loading phases…</span></div></div>
      ) : totalTasks === 0 ? (
        <div className="info-areas-list"><div className="info-area-item empty"><span>No tasks yet for this project.</span></div></div>
      ) : (
        <div className="info-areas-list">
          {renderOrder.map((key) => {
            const groupAreas = grouped.get(key) || []
            if (groupAreas.length === 0 && key === UNPHASED_VALUE) return null
            const label = key === UNPHASED_VALUE ? 'Unphased' : key
            const phaseIndex = key === UNPHASED_VALUE ? -1 : phases.findIndex(p => p.name === key)
            const isRealPhase = phaseIndex >= 0
            return (
              <div key={key} className="phase-assign-group">
                <div className="phase-assign-group-title">
                  <span className="phase-assign-group-name">
                    {label} <span className="phase-assign-count">({groupAreas.length})</span>
                  </span>
                  {isRealPhase && phases.length > 1 && (
                    <span className="phase-assign-reorder">
                      <button
                        type="button"
                        className="phase-assign-reorder-btn"
                        onClick={() => movePhase(phaseIndex, -1)}
                        disabled={reorderingPhases || phaseIndex === 0}
                        aria-label={`Move ${label} up`}
                        title="Move phase up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="phase-assign-reorder-btn"
                        onClick={() => movePhase(phaseIndex, 1)}
                        disabled={reorderingPhases || phaseIndex === phases.length - 1}
                        aria-label={`Move ${label} down`}
                        title="Move phase down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </span>
                  )}
                </div>
                {groupAreas.length === 0 ? (
                  <div className="info-area-item empty"><span>No tasks in this phase.</span></div>
                ) : (
                  groupAreas.map(area => {
                    const currentValue = area.group_name || UNPHASED_VALUE
                    const isSaving = savingId === area.id
                    return (
                      <div key={area.id} className={`info-area-item ${area.status}`}>
                        <div className="info-area-details">
                          <span className="info-area-name">{area.name}</span>
                          <span className={`info-area-status-label ${area.status}`}>
                            {area.status === 'done' ? 'Complete' : area.status === 'working' ? 'In Progress' : 'Not Started'}
                          </span>
                        </div>
                        <div className="phase-assign-control">
                          <select
                            className="form-select phase-assign-select"
                            value={currentValue}
                            disabled={isSaving}
                            onChange={e => handleChange(area.id, e.target.value)}
                            aria-label={`Phase for ${area.name}`}
                          >
                            {phaseOptions.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                            <option value={UNPHASED_VALUE}>— Unphased —</option>
                          </select>
                          {isSaving && <Loader2 size={12} className="spin" aria-hidden="true" />}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}
        </div>
      )}

      {phaseOptions.length === 0 && !loading && (
        <p className="phase-assign-hint">
          No phases defined for this project yet. Add phases from the project setup to assign tasks.
        </p>
      )}
    </div>
  )
}
