import { useState, useEffect, useMemo, useCallback } from 'react'
import { AlertTriangle, Plus, Trash2, HardHat, Wrench, DollarSign } from 'lucide-react'
import { Modal } from '../ui'
import { db } from '../../lib/supabase'
import { getTicketEditability } from '../../lib/tmStatus'
import { calculateTicketValue } from '../../lib/laborRateResolver'
import { CATEGORIES } from './translations'

/**
 * Office correction of a submitted T&M ticket.
 *
 * Flat form state (date, CE/PCO, description, crew rows, item rows, reason).
 * The parent (TMList) owns the save: `onSave({ fields, workers, items, editNote })`
 * is passed straight to db.updateTMTicketContents. Editability rules and the
 * warning copy come from getTicketEditability; the server re-checks them.
 */

const LEGACY_CLASS = '__current__'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const norm = (value) => String(value ?? '').trim().toLowerCase()
const num = (value) => {
  if (value === '' || value === null || value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}
const money = (value) => `$${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

let rowSeq = 0
const nextKey = () => `row-${++rowSeq}`

const isValidDate = (value) => {
  if (!DATE_RE.test(value || '')) return false
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const workerFromRow = (w) => ({
  key: nextKey(),
  name: w.name || '',
  role: w.role || w.labor_class || '',
  labor_class_id: w.labor_class_id || null,
  hours: w.hours === null || w.hours === undefined ? '' : String(w.hours),
  overtime_hours: w.overtime_hours === null || w.overtime_hours === undefined ? '' : String(w.overtime_hours),
  time_started: w.time_started || null,
  time_ended: w.time_ended || null,
  // What the worker had when the form opened, so the "(current)" option can
  // put it back unchanged.
  orig: { labor_class_id: w.labor_class_id || null, role: w.role || w.labor_class || '' }
})

const itemFromRow = (item) => ({
  key: nextKey(),
  material_equipment_id: item.material_equipment_id || null,
  custom_name: item.custom_name || null,
  custom_category: item.custom_category || null,
  quantity: item.quantity === null || item.quantity === undefined ? '' : String(item.quantity),
  unit_cost: item.unit_cost,
  materials_equipment: item.materials_equipment || null
})

const itemName = (item) => item.custom_name || item.materials_equipment?.name || 'Item'

// Payload rows: exactly the columns the RPC accepts.
const workerPayload = (w) => ({
  name: w.name.trim(),
  // Sent as stored: the server compares roles verbatim, so defaulting a
  // blank legacy role would read as a crew change and force a COR re-sync.
  role: w.role || null,
  hours: num(w.hours),
  overtime_hours: num(w.overtime_hours),
  time_started: w.time_started || null,
  time_ended: w.time_ended || null,
  labor_class_id: w.labor_class_id || null
})

const itemPayload = (item) => ({
  material_equipment_id: item.material_equipment_id || null,
  custom_name: item.material_equipment_id ? null : (item.custom_name || null),
  custom_category: item.material_equipment_id ? null : (item.custom_category || null),
  quantity: num(item.quantity)
})

// Order-insensitive fingerprint of crew + items (the server compares
// content-ordered snapshots the same way).
const contentsKey = (workers, items) => {
  const ws = workers.map(w => JSON.stringify([
    norm(w.name), w.labor_class_id || null, norm(w.role), num(w.hours), num(w.overtime_hours),
    w.time_started || null, w.time_ended || null
  ])).sort()
  const is = items.map(i => JSON.stringify([
    i.material_equipment_id || null,
    i.material_equipment_id ? null : norm(i.custom_name),
    i.material_equipment_id ? null : norm(i.custom_category),
    num(i.quantity)
  ])).sort()
  return JSON.stringify([ws, is])
}

export default function TMTicketEditModal({
  ticket,
  lockInfo,
  companyId,
  rateLookup,
  saving = false,
  onSave,
  onClose
}) {
  // ---- initial values (captured once, at open time) -----------------------
  const [initial] = useState(() => {
    const workers = (ticket.t_and_m_workers || []).map(workerFromRow)
    const items = (ticket.t_and_m_items || []).map(itemFromRow)
    const computedAtOpen = calculateTicketValue(ticket, rateLookup).total
    const stored = parseFloat(ticket.change_order_value) || 0
    return {
      workDate: ticket.work_date ? String(ticket.work_date).slice(0, 10) : '',
      cePco: ticket.ce_pco_number || '',
      notes: ticket.notes || '',
      workers,
      items,
      contents: contentsKey(workers, items),
      storedValue: stored,
      computedAtOpen,
      valueMatchesComputed: Math.abs(stored - computedAtOpen) < 0.005
    }
  })

  const [workDate, setWorkDate] = useState(initial.workDate)
  const [cePco, setCePco] = useState(initial.cePco)
  const [notes, setNotes] = useState(initial.notes)
  const [workers, setWorkers] = useState(initial.workers)
  const [items, setItems] = useState(initial.items)
  const [editNote, setEditNote] = useState('')
  const [updateBillable, setUpdateBillable] = useState(initial.valueMatchesComputed)

  const [laborClasses, setLaborClasses] = useState([])
  const [catalog, setCatalog] = useState([])
  const [catalogPick, setCatalogPick] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState(CATEGORIES[0])

  // ---- reference data ------------------------------------------------------
  useEffect(() => {
    if (!companyId) return undefined
    let cancelled = false
    Promise.resolve(db.getLaborClasses?.(companyId, { includeInactive: true }))
      .then(rows => { if (!cancelled) setLaborClasses(Array.isArray(rows) ? rows : []) })
      .catch(err => console.warn('Could not load labor classes for ticket edit:', err))
    Promise.resolve(db.getMaterialsEquipment?.(companyId))
      .then(rows => { if (!cancelled) setCatalog(Array.isArray(rows) ? rows.filter(r => r.active !== false) : []) })
      .catch(err => console.warn('Could not load materials catalog for ticket edit:', err))
    return () => { cancelled = true }
  }, [companyId])

  const classById = useMemo(() => {
    const map = {}
    laborClasses.forEach(lc => { map[lc.id] = lc })
    return map
  }, [laborClasses])

  const classByName = useMemo(() => {
    const map = {}
    laborClasses.forEach(lc => {
      const key = norm(lc.name)
      // Prefer an active class when an inactive one shares the name.
      if (!map[key] || (map[key].active === false && lc.active !== false)) map[key] = lc
    })
    return map
  }, [laborClasses])

  const activeClasses = useMemo(() => laborClasses.filter(lc => lc.active !== false), [laborClasses])

  const resolveClass = useCallback((labor_class_id, role) => (
    labor_class_id ? classById[labor_class_id] || null : classByName[norm(role)] || null
  ), [classById, classByName])

  const catalogByCategory = useMemo(() => {
    const groups = {}
    catalog.forEach(row => {
      const cat = row.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(row)
    })
    return groups
  }, [catalog])

  // ---- editability banner --------------------------------------------------
  const editability = useMemo(() => getTicketEditability(ticket, lockInfo), [ticket, lockInfo])
  const bannerLines = useMemo(() => {
    const lines = [...(editability?.warnings || [])]
    if (editability?.flagsAfterSignature && !lines.some(l => /edited after signature/i.test(l))) {
      lines.unshift('Saving will mark this ticket "Edited after signature".')
    }
    return lines
  }, [editability])

  // ---- derived state -------------------------------------------------------
  const contentsChanged = useMemo(
    () => contentsKey(workers, items) !== initial.contents,
    [workers, items, initial.contents]
  )
  const fieldsChanged = workDate !== initial.workDate || cePco.trim() !== initial.cePco.trim() || notes.trim() !== initial.notes.trim()
  const dirty = contentsChanged || fieldsChanged

  const showBillable = ticket.status === 'approved' && contentsChanged
  const recomputedValue = useMemo(() => {
    if (!showBillable) return 0
    return calculateTicketValue({
      t_and_m_workers: workers.map(w => ({
        labor_class_id: w.labor_class_id,
        role: w.role,
        hours: num(w.hours) || 0,
        overtime_hours: num(w.overtime_hours) || 0
      })),
      t_and_m_items: items.map(i => ({
        quantity: num(i.quantity) || 0,
        unit_cost: i.unit_cost,
        materials_equipment: i.materials_equipment
      }))
    }, rateLookup).total
  }, [showBillable, workers, items, rateLookup])

  const validationError = useMemo(() => {
    if (!isValidDate(workDate)) return 'Enter a valid work date.'
    if (!notes.trim()) return 'Description is required.'
    if (workers.length === 0) return 'Add at least one worker.'
    if (workers.some(w => !w.name.trim())) return 'Every worker needs a name.'
    if (workers.some(w => Number.isNaN(num(w.hours)) || Number.isNaN(num(w.overtime_hours)) || num(w.hours) < 0 || num(w.overtime_hours) < 0)) {
      return 'Hours cannot be negative.'
    }
    if (!workers.some(w => num(w.hours) + num(w.overtime_hours) > 0)) return 'At least one worker needs hours.'
    if (items.some(i => !(num(i.quantity) > 0))) return 'Every item needs a quantity above 0.'
    if (items.some(i => !i.material_equipment_id && !(i.custom_name || '').trim())) return 'Every item needs a name.'
    return null
  }, [workDate, notes, workers, items])

  const canSave = !saving && dirty && !validationError

  // ---- handlers ------------------------------------------------------------
  const handleClose = useCallback(() => {
    if (!saving) onClose()
  }, [saving, onClose])

  const updateWorker = (key, patch) => {
    setWorkers(prev => prev.map(w => (w.key === key ? { ...w, ...patch } : w)))
  }

  const handleClassChange = (worker, value) => {
    if (value === LEGACY_CLASS) {
      updateWorker(worker.key, { labor_class_id: worker.orig?.labor_class_id || null, role: worker.orig?.role || '' })
      return
    }
    const lc = classById[value]
    if (lc) updateWorker(worker.key, { labor_class_id: lc.id, role: lc.name })
  }

  const addWorker = () => {
    const first = activeClasses[0]
    setWorkers(prev => [...prev, {
      key: nextKey(),
      name: '',
      role: first?.name || 'Laborer',
      labor_class_id: first?.id || null,
      hours: '',
      overtime_hours: '',
      time_started: null,
      time_ended: null,
      orig: first ? null : { labor_class_id: null, role: 'Laborer' }
    }])
  }

  const updateItem = (key, patch) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)))
  }

  const addCatalogItem = () => {
    const row = catalog.find(c => c.id === catalogPick)
    if (!row) return
    setItems(prev => [...prev, {
      key: nextKey(),
      material_equipment_id: row.id,
      custom_name: null,
      custom_category: null,
      quantity: '1',
      materials_equipment: { name: row.name, unit: row.unit, cost_per_unit: row.cost_per_unit, category: row.category }
    }])
    setCatalogPick('')
  }

  const addCustomItem = () => {
    const name = customName.trim()
    if (!name) return
    setItems(prev => [...prev, {
      key: nextKey(),
      material_equipment_id: null,
      custom_name: name,
      custom_category: customCategory || null,
      quantity: '1',
      materials_equipment: null
    }])
    setCustomName('')
    setShowCustom(false)
  }

  const handleSave = () => {
    if (!canSave) return
    const fields = {
      work_date: workDate,
      ce_pco_number: cePco.trim() || null,
      notes: notes.trim()
    }
    if (showBillable && updateBillable) {
      fields.change_order_value = recomputedValue
    }
    onSave({
      fields,
      workers: workers.map(workerPayload),
      items: items.map(itemPayload),
      editNote: editNote.trim() || null
    })
  }

  // ---- render --------------------------------------------------------------
  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={saving}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave} aria-busy={saving}>
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </>
  )

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Edit T&M Ticket"
      size="large"
      className="tm-edit-modal"
      closeOnOverlayClick={false}
      closeOnEscape={!saving}
      footer={footer}
    >
      {bannerLines.length > 0 && (
        <div className="tm-edit-banner" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <ul>
            {bannerLines.map(line => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}

      <div className="tm-edit-row tm-edit-fields">
        <label className="tm-edit-field">
          <span>Work date</span>
          <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} disabled={saving} />
        </label>
        <label className="tm-edit-field">
          <span>CE / PCO number</span>
          <input type="text" value={cePco} onChange={(e) => setCePco(e.target.value)} maxLength={100} disabled={saving} />
        </label>
      </div>

      <label className="tm-edit-field tm-edit-field-full">
        <span>Description</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
      </label>

      <section className="tm-edit-section" aria-label="Crew">
        <h4><HardHat size={16} className="inline-icon" aria-hidden="true" /> Crew</h4>
        <div className="tm-edit-grid tm-edit-workers" role="group" aria-label="Workers">
          <div className="tm-edit-grid-head">
            <span>Name</span>
            <span>Class</span>
            <span>Reg hrs</span>
            <span>OT hrs</span>
            <span className="sr-only">Remove</span>
          </div>
          {workers.map((w, idx) => {
            const n = idx + 1
            const current = resolveClass(w.labor_class_id, w.role)
            const origResolved = w.orig ? resolveClass(w.orig.labor_class_id, w.orig.role) : null
            const showLegacy = Boolean(w.orig) && !origResolved
            const selectValue = current ? current.id : (showLegacy ? LEGACY_CLASS : '')
            return (
              <div className="tm-edit-grid-row" key={w.key}>
                <input
                  type="text"
                  value={w.name}
                  onChange={(e) => updateWorker(w.key, { name: e.target.value })}
                  aria-label={`Worker ${n} name`}
                  placeholder="Name"
                  disabled={saving}
                />
                <select
                  value={selectValue}
                  onChange={(e) => handleClassChange(w, e.target.value)}
                  aria-label={`Worker ${n} class`}
                  disabled={saving}
                >
                  {!current && !showLegacy && <option value="">Select class</option>}
                  {showLegacy && (
                    <option value={LEGACY_CLASS}>{`${w.orig.role || 'Laborer'} (current)`}</option>
                  )}
                  {activeClasses.map(lc => (
                    <option key={lc.id} value={lc.id}>{lc.name}</option>
                  ))}
                  {current && current.active === false && (
                    <option value={current.id}>{`${current.name} (inactive)`}</option>
                  )}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  inputMode="decimal"
                  value={w.hours}
                  onChange={(e) => updateWorker(w.key, { hours: e.target.value })}
                  aria-label={`Worker ${n} regular hours`}
                  placeholder="Reg"
                  disabled={saving}
                />
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  inputMode="decimal"
                  value={w.overtime_hours}
                  onChange={(e) => updateWorker(w.key, { overtime_hours: e.target.value })}
                  aria-label={`Worker ${n} overtime hours`}
                  placeholder="OT"
                  disabled={saving}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-small tm-edit-remove"
                  onClick={() => setWorkers(prev => prev.filter(x => x.key !== w.key))}
                  aria-label={`Remove worker ${n}`}
                  disabled={saving}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={addWorker} disabled={saving}>
          <Plus size={14} aria-hidden="true" /> Add worker
        </button>
      </section>

      <section className="tm-edit-section" aria-label="Materials and equipment">
        <h4><Wrench size={16} className="inline-icon" aria-hidden="true" /> Materials & Equipment</h4>
        {items.length === 0 ? (
          <p className="tm-edit-empty">No materials or equipment on this ticket.</p>
        ) : (
          <div className="tm-edit-grid tm-edit-items" role="group" aria-label="Items">
            <div className="tm-edit-grid-head">
              <span>Item</span>
              <span>Qty</span>
              <span className="sr-only">Remove</span>
            </div>
            {items.map(item => {
              const name = itemName(item)
              return (
                <div className="tm-edit-grid-row" key={item.key}>
                  <span className="tm-edit-item-name">
                    {!item.material_equipment_id && <span className="tm-custom-badge">Custom</span>} {name}
                    {item.materials_equipment?.unit && <span className="tm-edit-item-unit"> ({item.materials_equipment.unit})</span>}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                    aria-label={`Quantity for ${name}`}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-small tm-edit-remove"
                    onClick={() => setItems(prev => prev.filter(x => x.key !== item.key))}
                    aria-label={`Remove ${name}`}
                    disabled={saving}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="tm-edit-add-item">
          <select
            value={catalogPick}
            onChange={(e) => setCatalogPick(e.target.value)}
            aria-label="Add from catalog"
            disabled={saving}
          >
            <option value="">Add from catalog...</option>
            {Object.entries(catalogByCategory).map(([cat, rows]) => (
              <optgroup key={cat} label={cat}>
                {rows.map(row => (
                  <option key={row.id} value={row.id}>{row.name}{row.unit ? ` (${row.unit})` : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-small" onClick={addCatalogItem} disabled={saving || !catalogPick}>
            <Plus size={14} aria-hidden="true" /> Add
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowCustom(v => !v)} disabled={saving}>
            Custom item
          </button>
        </div>
        {showCustom && (
          <div className="tm-edit-add-item tm-edit-custom">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Custom item name"
              aria-label="Custom item name"
              disabled={saving}
            />
            <select
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              aria-label="Custom item category"
              disabled={saving}
            >
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <button type="button" className="btn btn-secondary btn-small" onClick={addCustomItem} disabled={saving || !customName.trim()}>
              Add custom item
            </button>
          </div>
        )}
      </section>

      {showBillable && (
        <section className="tm-edit-billable" aria-label="Billable value">
          <h4><DollarSign size={16} className="inline-icon" aria-hidden="true" /> Billable value</h4>
          <p>
            Approved at <strong>{money(initial.storedValue)}</strong>. With these changes the ticket prices at{' '}
            <strong>{money(recomputedValue)}</strong>.
          </p>
          <label className="tm-edit-checkbox">
            <input
              type="checkbox"
              checked={updateBillable}
              onChange={(e) => setUpdateBillable(e.target.checked)}
              disabled={saving}
            />
            <span>Update the billable value to {money(recomputedValue)}</span>
          </label>
          {!initial.valueMatchesComputed && (
            <p className="tm-edit-billable-note">
              The approved value differs from the priced value ({money(initial.computedAtOpen)}), so it was probably entered manually. It stays as is unless you tick the box.
            </p>
          )}
        </section>
      )}

      <label className="tm-edit-field tm-edit-field-full">
        <span>Reason for edit (optional)</span>
        <input
          type="text"
          value={editNote}
          onChange={(e) => setEditNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. Foreman double-counted OT"
          disabled={saving}
        />
      </label>

      {dirty && validationError && (
        <p className="tm-edit-error" role="alert">{validationError}</p>
      )}
    </Modal>
  )
}
