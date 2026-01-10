import { useState, useEffect, memo } from 'react'
import { Truck, Plus, Edit2, Trash2, Check, X, DollarSign, Building2, Package } from 'lucide-react'
import { equipmentOps } from '../../lib/supabase'

/**
 * EquipmentCatalog - Company equipment catalog management
 *
 * Allows managing the company's equipment catalog with:
 * - Equipment name and description
 * - Daily/weekly/monthly rates
 * - Owned vs rented designation
 * - Active/inactive status
 */
export default memo(function EquipmentCatalog({
  company,
  onShowToast
}) {
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [isAdding, setIsAdding] = useState(false)

  // Form state for add/edit
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    daily_rate: '',
    weekly_rate: '',
    monthly_rate: '',
    is_owned: false
  })

  useEffect(() => {
    if (company?.id) {
      loadEquipment()
    }
  }, [company?.id, showInactive])

  const loadEquipment = async () => {
    try {
      setLoading(true)
      const data = await equipmentOps.getCompanyEquipment(company.id, !showInactive)
      setEquipment(data || [])
    } catch (error) {
      console.error('Error loading equipment:', error)
      onShowToast?.('Failed to load equipment', 'error')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      daily_rate: '',
      weekly_rate: '',
      monthly_rate: '',
      is_owned: false
    })
    setEditingId(null)
    setIsAdding(false)
  }

  const handleEdit = (item) => {
    setEditingId(item.id)
    setIsAdding(false)
    setFormData({
      name: item.name || '',
      description: item.description || '',
      daily_rate: item.daily_rate ? (item.daily_rate / 100).toFixed(2) : '',
      weekly_rate: item.weekly_rate ? (item.weekly_rate / 100).toFixed(2) : '',
      monthly_rate: item.monthly_rate ? (item.monthly_rate / 100).toFixed(2) : '',
      is_owned: item.is_owned || false
    })
  }

  const handleAdd = () => {
    resetForm()
    setIsAdding(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      onShowToast?.('Equipment name is required', 'error')
      return
    }

    try {
      const data = {
        company_id: company.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        daily_rate: formData.daily_rate ? Math.round(parseFloat(formData.daily_rate) * 100) : 0,
        weekly_rate: formData.weekly_rate ? Math.round(parseFloat(formData.weekly_rate) * 100) : null,
        monthly_rate: formData.monthly_rate ? Math.round(parseFloat(formData.monthly_rate) * 100) : null,
        is_owned: formData.is_owned
      }

      if (editingId) {
        delete data.company_id
        await equipmentOps.updateEquipment(editingId, data)
        onShowToast?.('Equipment updated', 'success')
      } else {
        await equipmentOps.createEquipment(data)
        onShowToast?.('Equipment added to catalog', 'success')
      }

      resetForm()
      loadEquipment()
    } catch (error) {
      console.error('Error saving equipment:', error)
      onShowToast?.('Failed to save equipment', 'error')
    }
  }

  const handleDeactivate = async (item) => {
    if (!confirm(`Deactivate ${item.name}? It will no longer appear when adding equipment to projects.`)) {
      return
    }

    try {
      await equipmentOps.deactivateEquipment(item.id)
      onShowToast?.('Equipment deactivated', 'success')
      loadEquipment()
    } catch (error) {
      console.error('Error deactivating equipment:', error)
      onShowToast?.('Failed to deactivate equipment', 'error')
    }
  }

  const handleReactivate = async (item) => {
    try {
      await equipmentOps.updateEquipment(item.id, { is_active: true })
      onShowToast?.('Equipment reactivated', 'success')
      loadEquipment()
    } catch (error) {
      console.error('Error reactivating equipment:', error)
      onShowToast?.('Failed to reactivate equipment', 'error')
    }
  }

  const formatRate = (cents) => {
    if (!cents) return '-'
    return `$${(cents / 100).toLocaleString()}`
  }

  return (
    <div className="equipment-catalog">
      <div className="equipment-catalog-header">
        <div className="equipment-catalog-title">
          <Truck size={20} />
          <h3>Equipment Catalog</h3>
        </div>
        <div className="equipment-catalog-actions">
          <label className="checkbox-label small">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleAdd}
            disabled={isAdding}
          >
            <Plus size={14} />
            Add Equipment
          </button>
        </div>
      </div>

      <p className="equipment-catalog-description">
        Manage your equipment catalog. Equipment added here will be available when tracking equipment on projects.
      </p>

      {loading ? (
        <div className="equipment-catalog-loading">
          <div className="loading-spinner" />
        </div>
      ) : (
        <div className="equipment-catalog-list">
          {/* Add new row */}
          {isAdding && (
            <div className="equipment-catalog-row editing">
              <div className="equipment-form">
                <div className="form-row">
                  <div className="form-group flex-2">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Equipment name"
                      className="form-input"
                      autoFocus
                    />
                  </div>
                  <div className="form-group flex-2">
                    <input
                      type="text"
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Description (optional)"
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <div className="input-with-prefix compact">
                      <span className="input-prefix">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.daily_rate}
                        onChange={e => setFormData({ ...formData, daily_rate: e.target.value })}
                        placeholder="0"
                        className="form-input"
                      />
                      <span className="input-suffix">/day</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="input-with-prefix compact">
                      <span className="input-prefix">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.weekly_rate}
                        onChange={e => setFormData({ ...formData, weekly_rate: e.target.value })}
                        placeholder="0"
                        className="form-input"
                      />
                      <span className="input-suffix">/wk</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="input-with-prefix compact">
                      <span className="input-prefix">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.monthly_rate}
                        onChange={e => setFormData({ ...formData, monthly_rate: e.target.value })}
                        placeholder="0"
                        className="form-input"
                      />
                      <span className="input-suffix">/mo</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.is_owned}
                        onChange={e => setFormData({ ...formData, is_owned: e.target.checked })}
                      />
                      <Building2 size={14} />
                      Owned
                    </label>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-sm btn-ghost" onClick={resetForm}>
                    <X size={14} />
                    Cancel
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={handleSave}>
                    <Check size={14} />
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Equipment list */}
          {equipment.length === 0 && !isAdding ? (
            <div className="equipment-catalog-empty">
              <Package size={32} />
              <p>No equipment in catalog yet</p>
              <button className="btn btn-outline" onClick={handleAdd}>
                <Plus size={14} />
                Add Your First Equipment
              </button>
            </div>
          ) : (
            equipment.map(item => (
              <div
                key={item.id}
                className={`equipment-catalog-row ${!item.is_active ? 'inactive' : ''} ${editingId === item.id ? 'editing' : ''}`}
              >
                {editingId === item.id ? (
                  <div className="equipment-form">
                    <div className="form-row">
                      <div className="form-group flex-2">
                        <input
                          type="text"
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Equipment name"
                          className="form-input"
                          autoFocus
                        />
                      </div>
                      <div className="form-group flex-2">
                        <input
                          type="text"
                          value={formData.description}
                          onChange={e => setFormData({ ...formData, description: e.target.value })}
                          placeholder="Description"
                          className="form-input"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <div className="input-with-prefix compact">
                          <span className="input-prefix">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.daily_rate}
                            onChange={e => setFormData({ ...formData, daily_rate: e.target.value })}
                            className="form-input"
                          />
                          <span className="input-suffix">/day</span>
                        </div>
                      </div>
                      <div className="form-group">
                        <div className="input-with-prefix compact">
                          <span className="input-prefix">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.weekly_rate}
                            onChange={e => setFormData({ ...formData, weekly_rate: e.target.value })}
                            className="form-input"
                          />
                          <span className="input-suffix">/wk</span>
                        </div>
                      </div>
                      <div className="form-group">
                        <div className="input-with-prefix compact">
                          <span className="input-prefix">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.monthly_rate}
                            onChange={e => setFormData({ ...formData, monthly_rate: e.target.value })}
                            className="form-input"
                          />
                          <span className="input-suffix">/mo</span>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.is_owned}
                            onChange={e => setFormData({ ...formData, is_owned: e.target.checked })}
                          />
                          <Building2 size={14} />
                          Owned
                        </label>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-sm btn-ghost" onClick={resetForm}>
                        <X size={14} />
                        Cancel
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={handleSave}>
                        <Check size={14} />
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="equipment-catalog-info">
                      <div className="equipment-catalog-name">
                        <Truck size={16} />
                        <span>{item.name}</span>
                        {item.is_owned && (
                          <span className="badge badge-info">
                            <Building2 size={10} />
                            Owned
                          </span>
                        )}
                        {!item.is_active && (
                          <span className="badge badge-muted">Inactive</span>
                        )}
                      </div>
                      {item.description && (
                        <span className="equipment-catalog-desc">{item.description}</span>
                      )}
                    </div>
                    <div className="equipment-catalog-rates">
                      <span className="rate-item">
                        <span className="rate-label">Day</span>
                        <span className="rate-value">{formatRate(item.daily_rate)}</span>
                      </span>
                      <span className="rate-item">
                        <span className="rate-label">Week</span>
                        <span className="rate-value">{formatRate(item.weekly_rate)}</span>
                      </span>
                      <span className="rate-item">
                        <span className="rate-label">Month</span>
                        <span className="rate-value">{formatRate(item.monthly_rate)}</span>
                      </span>
                    </div>
                    <div className="equipment-catalog-item-actions">
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => handleEdit(item)}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      {item.is_active ? (
                        <button
                          className="btn btn-xs btn-ghost text-danger"
                          onClick={() => handleDeactivate(item)}
                          title="Deactivate"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <button
                          className="btn btn-xs btn-ghost text-success"
                          onClick={() => handleReactivate(item)}
                          title="Reactivate"
                        >
                          <Check size={14} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
})
