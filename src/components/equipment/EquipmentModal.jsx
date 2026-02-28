import { useState, useEffect, useCallback, memo } from 'react'
import { X, Truck, DollarSign, Calendar, Save } from 'lucide-react'
import { equipmentOps } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'

/**
 * EquipmentModal - Add or edit equipment on a project
 *
 * Features:
 * - Select from company equipment catalog OR enter custom
 * - Pre-fills daily rate from catalog
 * - Start date picker
 * - Notes field
 */
export default memo(function EquipmentModal({
  project,
  company,
  user,
  editItem = null, // Pass existing item for edit mode
  onSave,
  onClose
}) {
  const { showToast } = useToast()
  const [catalogEquipment, setCatalogEquipment] = useState([])
  const [_loading, setLoading] = useState(true) // Start true since we load on mount
  const [saving, setSaving] = useState(false)

  // Form state
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
  const [customName, setCustomName] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const isEditMode = !!editItem

  // Load equipment catalog
  const loadCatalog = useCallback(async () => {
    if (!company?.id) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const data = await equipmentOps.getCompanyEquipment(company.id)
      setCatalogEquipment(data || [])
    } catch (error) {
      console.error('Error loading equipment catalog:', error)
    } finally {
      setLoading(false)
    }
  }, [company?.id])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  // Populate form for edit mode
  useEffect(() => {
    if (editItem) {
      setCustomName(editItem.equipment_name || '')
      setDailyRate(((editItem.daily_rate || 0) / 100).toFixed(2))
      setStartDate(editItem.start_date || new Date().toISOString().split('T')[0])
      setEndDate(editItem.end_date || '')
      setNotes(editItem.notes || '')
      setSelectedEquipmentId(editItem.equipment_id || '')
      setUseCustom(!editItem.equipment_id)
    }
  }, [editItem])

  const handleEquipmentSelect = (e) => {
    const equipmentId = e.target.value

    if (equipmentId === 'custom') {
      setUseCustom(true)
      setSelectedEquipmentId('')
      setCustomName('')
      setDailyRate('')
      return
    }

    setUseCustom(false)
    setSelectedEquipmentId(equipmentId)

    // Pre-fill rate from catalog
    const selected = catalogEquipment.find(eq => eq.id === equipmentId)
    if (selected) {
      setCustomName(selected.name)
      setDailyRate(((selected.daily_rate || 0) / 100).toFixed(2))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validation - get name from customName (used for both catalog and custom entries)
    const name = customName.trim()
    if (!name) {
      showToast('Please enter equipment name', 'warning')
      return
    }

    const rate = parseFloat(dailyRate)
    if (isNaN(rate) || rate < 0) {
      showToast('Please enter a valid daily rate', 'warning')
      return
    }

    if (!startDate) {
      showToast('Please select a start date', 'warning')
      return
    }

    try {
      setSaving(true)

      const equipmentData = {
        project_id: project.id,
        equipment_id: useCustom ? null : (selectedEquipmentId || null),
        equipment_name: name,
        daily_rate: Math.round(rate * 100), // Convert to cents
        start_date: startDate,
        end_date: endDate || null,
        notes: notes.trim() || null,
        created_by: user?.id
      }

      let result
      if (isEditMode) {
        // Remove fields that shouldn't be updated
        delete equipmentData.project_id
        delete equipmentData.created_by
        result = await equipmentOps.updateProjectEquipment(editItem.id, equipmentData)
      } else {
        result = await equipmentOps.addEquipmentToProject(equipmentData)
      }

      onSave?.(result)
    } catch (error) {
      console.error('Error saving equipment:', error)
      showToast('Failed to save equipment. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content equipment-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Truck size={20} />
            {isEditMode ? 'Edit Equipment' : 'Add Equipment to Project'}
          </h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Equipment Selection */}
            {!isEditMode && catalogEquipment.length > 0 && (
              <div className="form-group">
                <label>Select Equipment</label>
                <select
                  value={useCustom ? 'custom' : selectedEquipmentId}
                  onChange={handleEquipmentSelect}
                  className="form-select"
                >
                  <option value="">Choose from catalog...</option>
                  {catalogEquipment.map(eq => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} - ${((eq.daily_rate || 0) / 100).toFixed(0)}/day
                    </option>
                  ))}
                  <option value="custom">+ Add custom equipment</option>
                </select>
              </div>
            )}

            {/* Equipment Name (for custom or if no catalog) */}
            {(useCustom || isEditMode || catalogEquipment.length === 0) && (
              <div className="form-group">
                <label htmlFor="equipment-name">Equipment Name</label>
                <input
                  id="equipment-name"
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g., CAT 320 Excavator"
                  className="form-input"
                  required
                />
              </div>
            )}

            {/* Daily Rate */}
            <div className="form-group">
              <label htmlFor="daily-rate">
                <DollarSign size={14} />
                Daily Rate
              </label>
              <div className="input-with-prefix">
                <span className="input-prefix">$</span>
                <input
                  id="daily-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={dailyRate}
                  onChange={e => setDailyRate(e.target.value)}
                  placeholder="0.00"
                  className="form-input"
                  required
                />
                <span className="input-suffix">/day</span>
              </div>
            </div>

            {/* Date Range */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="start-date">
                  <Calendar size={14} />
                  Start Date
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="end-date">
                  <Calendar size={14} />
                  End Date (optional)
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  min={startDate}
                  className="form-input"
                  placeholder="Leave blank if still on site"
                />
                <span className="form-help">Leave blank if still on site</span>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label htmlFor="notes">Notes (optional)</label>
              <textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Equipment number, rental company, etc."
                className="form-textarea"
                rows={2}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="loading-spinner small" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {isEditMode ? 'Update' : 'Add Equipment'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})
