import { useState } from 'react'
import { db } from '../lib/supabase'

/**
 * Manages project edit mode state and handlers.
 * Extracted from Dashboard.jsx for maintainability.
 */
export default function useProjectEdit({ selectedProject, areas, company, onShowToast, loadAreas, setSelectedProject }) {
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleEditClick = () => {
    setEditData({
      name: selectedProject.name,
      job_number: selectedProject.job_number || '',
      address: selectedProject.address || '',
      general_contractor: selectedProject.general_contractor || '',
      client_contact: selectedProject.client_contact || '',
      client_phone: selectedProject.client_phone || '',
      contract_value: selectedProject.contract_value,
      work_type: selectedProject.work_type || 'demolition',
      job_type: selectedProject.job_type || 'standard',
      pin: selectedProject.pin || '',
      default_dump_site_id: selectedProject.default_dump_site_id || '',
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

  const handleRemoveArea = (index) => {
    if (editData.areas.length > 1) {
      setEditData(prev => ({
        ...prev,
        areas: prev.areas.filter((_, i) => i !== index)
      }))
    }
  }

  const handleSaveEdit = async () => {
    if (!editData.name.trim()) {
      onShowToast('Please enter a project name', 'error')
      return
    }

    const contractVal = parseFloat(editData.contract_value)
    if (!contractVal || contractVal <= 0) {
      onShowToast('Please enter a valid contract value', 'error')
      return
    }

    if (editData.pin && editData.pin.length !== 4) {
      onShowToast('PIN must be 4 digits', 'error')
      return
    }

    if (editData.pin && editData.pin !== selectedProject.pin) {
      const pinAvailable = await db.isPinAvailable(editData.pin, selectedProject.id)
      if (!pinAvailable) {
        onShowToast('This PIN is already in use', 'error')
        return
      }
    }

    const validAreas = editData.areas.filter(a => a.name.trim() && parseFloat(a.weight) > 0)
    if (validAreas.length === 0) {
      onShowToast('Please add at least one area', 'error')
      return
    }

    const totalWeight = validAreas.reduce((sum, a) => sum + parseFloat(a.weight), 0)
    if (totalWeight !== 100) {
      onShowToast('Area weights must total 100%', 'error')
      return
    }

    setSaving(true)

    try {
      await db.updateProject(selectedProject.id, {
        name: editData.name.trim(),
        job_number: editData.job_number?.trim() || null,
        address: editData.address?.trim() || null,
        general_contractor: editData.general_contractor?.trim() || null,
        client_contact: editData.client_contact?.trim() || null,
        client_phone: editData.client_phone?.trim() || null,
        contract_value: contractVal,
        work_type: editData.work_type || 'demolition',
        job_type: editData.job_type || 'standard',
        pin: editData.pin || null,
        default_dump_site_id: editData.default_dump_site_id || null
      }, company?.id)

      const existingAreaIds = areas.map(a => a.id)
      const editAreaIds = editData.areas.filter(a => a.id).map(a => a.id)

      for (const areaId of existingAreaIds) {
        if (!editAreaIds.includes(areaId)) {
          await db.deleteArea(areaId)
        }
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
      await db.deleteProject(selectedProject.id)
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
