import { useState, useRef } from 'react'
import { db } from '../lib/supabase'
import {
  validatePin,
  validateContractValue,
  contractValueToInput,
  validateScheduleDates,
  validateOptionalAreas
} from '../lib/projectSetupValidation'

/**
 * Manages project edit mode state and handlers.
 * Extracted from Dashboard.jsx for maintainability.
 *
 * Validation rules are shared with the New Project wizard via
 * src/lib/projectSetupValidation.js (docs/LAUNCH_READINESS.md §2):
 * contract value, schedule dates, planned man-days and areas are all
 * optional; "not set" is stored as NULL.
 */
export default function useProjectEdit({ selectedProject, areas, company, onShowToast, loadAreas, setSelectedProject }) {
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  // The dashboard summary RPC row (the shape the office opens from the
  // project list, src/lib/db/projectOps.js getProjectDashboardSummary) carries
  // only name / job number / address / pin / dates / contract value / work
  // and job type / general contractor plus metrics. These columns are
  // missing from it, so the form is seeded from the full projects row. When
  // that fetch fails, a blank one of these fields means "untouched", not
  // "clear it", and the key is left out of the update payload.
  const SUMMARY_MISSING_TEXT_FIELDS = [
    'contractor_contact',
    'contractor_position',
    'contractor_phone',
    'contractor_email',
    'client_contact',
    'client_position',
    'client_phone',
    'client_email'
  ]
  const fullRowKnownRef = useRef(true)

  const handleEditClick = async () => {
    let source = selectedProject
    let fullRowKnown = true

    // planned_man_days is never on the summary row, so its absence tells a
    // summary-shaped row from a raw projects row.
    if (selectedProject.planned_man_days === undefined) {
      try {
        const fullRow = await db.getProject(selectedProject.id)
        if (fullRow) {
          source = { ...selectedProject, ...fullRow }
        } else {
          fullRowKnown = false
        }
      } catch (error) {
        console.error('Error loading project details:', error?.message || error)
        fullRowKnown = false
      }
    }
    fullRowKnownRef.current = fullRowKnown

    const plannedManDays = source.planned_man_days
    setEditData({
      name: source.name,
      job_number: source.job_number || '',
      address: source.address || '',
      general_contractor: source.general_contractor || '',
      contractor_contact: source.contractor_contact || '',
      contractor_position: source.contractor_position || '',
      contractor_phone: source.contractor_phone || '',
      contractor_email: source.contractor_email || '',
      client_contact: source.client_contact || '',
      client_position: source.client_position || '',
      client_phone: source.client_phone || '',
      client_email: source.client_email || '',
      // NULL (raw row) and 0 (summary RPC / legacy) both seed an empty field.
      contract_value: contractValueToInput(source.contract_value),
      start_date: source.start_date || '',
      end_date: source.end_date || '',
      planned_man_days: plannedManDays === null || plannedManDays === undefined ? '' : String(plannedManDays),
      work_type: source.work_type || 'demolition',
      job_type: source.job_type || 'standard',
      pin: source.pin || '',
      areas: areas.map(a => ({
        id: a.id,
        name: a.name,
        weight: a.weight,
        isNew: false
      }))
    })
    setEditMode(true)
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    setEditData(null)
  }

  const handleEditChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleAreaEditChange = (index, field, value) => {
    setEditData(prev => ({
      ...prev,
      areas: prev.areas.map((area, i) =>
        i === index ? { ...area, [field]: value } : area
      )
    }))
  }

  const handleAddArea = () => {
    setEditData(prev => ({
      ...prev,
      areas: [...prev.areas, { id: null, name: '', weight: '', isNew: true }]
    }))
  }

  // Every area is removable — a T&M-only job may have none.
  const handleRemoveArea = (index) => {
    setEditData(prev => ({
      ...prev,
      areas: prev.areas.filter((_, i) => i !== index)
    }))
  }

  const handleSaveEdit = async () => {
    if (!editData.name.trim()) {
      onShowToast('Please enter a project name', 'error')
      return
    }

    const contract = validateContractValue(editData.contract_value)
    if (contract.error) {
      onShowToast(contract.error, 'error')
      return
    }

    const dates = validateScheduleDates({ start_date: editData.start_date, end_date: editData.end_date })
    if (!dates.ok) {
      onShowToast(dates.error, 'error')
      return
    }

    // PIN handling is unchanged: blank is allowed (sent as null), a typed
    // PIN must be 4 digits and unused by another project in the company.
    if (editData.pin) {
      const pinCheck = validatePin(editData.pin)
      if (!pinCheck.ok) {
        onShowToast(pinCheck.error, 'error')
        return
      }
    }

    if (editData.pin && editData.pin !== selectedProject.pin) {
      const pinAvailable = await db.isPinAvailable(editData.pin, company.id, selectedProject.id)
      if (!pinAvailable) {
        onShowToast('This PIN is already in use', 'error')
        return
      }
    }

    const areaCheck = validateOptionalAreas(editData.areas)
    if (!areaCheck.ok) {
      onShowToast(areaCheck.error, 'error')
      return
    }
    const validAreas = areaCheck.areas

    // Areas in the DB that are no longer in the form (removed, or blanked
    // out) will be deleted. activity_log rows cascade with the area and
    // punch items / change orders / draw lines lose their area link.
    const keptAreaIds = validAreas.filter(a => a.id).map(a => a.id)
    const removedIds = areas.map(a => a.id).filter(id => !keptAreaIds.includes(id))
    if (removedIds.length > 0) {
      const noun = removedIds.length === 1 ? 'this area' : `these ${removedIds.length} areas`
      if (!window.confirm(`Removing ${noun} will also delete its activity history and unlink any punch-list items, change orders and draw lines that reference it. This cannot be undone. Continue?`)) {
        return
      }
    }

    setSaving(true)

    try {
      const updates = {
        name: editData.name.trim(),
        job_number: editData.job_number?.trim() || null,
        address: editData.address?.trim() || null,
        general_contractor: editData.general_contractor?.trim() || null,
        contract_value: contract.value,
        start_date: editData.start_date || null,
        end_date: editData.end_date || null,
        work_type: editData.work_type || 'demolition',
        job_type: editData.job_type || 'standard',
        pin: editData.pin || null
      }

      // Contacts and planned man-days: a typed value is always sent; a blank
      // one clears the column only when the stored value was known (see
      // fullRowKnownRef), so a failed detail fetch cannot wipe them.
      for (const field of SUMMARY_MISSING_TEXT_FIELDS) {
        const value = editData[field]?.trim() || null
        if (value !== null || fullRowKnownRef.current) {
          updates[field] = value
        }
      }
      const manDaysRaw = String(editData.planned_man_days ?? '').trim()
      if (manDaysRaw !== '') {
        updates.planned_man_days = parseInt(manDaysRaw, 10)
      } else if (fullRowKnownRef.current) {
        updates.planned_man_days = null
      }

      await db.updateProject(selectedProject.id, updates, company?.id)

      for (const areaId of removedIds) {
        await db.deleteArea(areaId)
      }

      for (let i = 0; i < validAreas.length; i++) {
        const area = validAreas[i]
        if (area.id) {
          await db.updateArea(area.id, {
            name: area.name.trim(),
            weight: parseFloat(area.weight),
            sort_order: i
          })
        } else {
          await db.createArea({
            project_id: selectedProject.id,
            name: area.name.trim(),
            weight: parseFloat(area.weight),
            status: 'not_started',
            sort_order: i
          })
        }
      }

      const updatedProject = await db.getProject(selectedProject.id)
      setSelectedProject(updatedProject)
      await loadAreas(selectedProject.id)

      setEditMode(false)
      setEditData(null)
      onShowToast('Project updated!', 'success')
    } catch (error) {
      console.error('Error saving project:', error?.message || error)
      onShowToast(error?.message || 'Error saving changes', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProject = async (loadProjects) => {
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return
    }

    try {
      await db.deleteProject(selectedProject.id, company?.id)
      setSelectedProject(null)
      onShowToast('Project deleted', 'success')
      if (typeof loadProjects === 'function') loadProjects()
    } catch (error) {
      console.error('Error deleting project:', error)
      onShowToast(error?.message || 'Error deleting project', 'error')
    }
  }

  return {
    editMode,
    editData,
    saving,
    handleEditClick,
    handleCancelEdit,
    handleEditChange,
    handleAreaEditChange,
    handleAddArea,
    handleRemoveArea,
    handleSaveEdit,
    handleDeleteProject
  }
}
