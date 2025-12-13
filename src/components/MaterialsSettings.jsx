import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import MaterialsUpload from './MaterialsUpload'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment', 'Materials', 'Other']

const UNITS = ['each', 'roll', 'box', 'bag', 'gallon', 'ft', 'sf', 'cy', 'ton', 'day', 'hour', 'pound']

export default function MaterialsSettings({ companyId, onShowToast, onClose }) {
  const [materials, setMaterials] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [editingItem, setEditingItem] = useState(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    category: 'Containment',
    unit: 'each',
    cost_per_unit: ''
  })

  useEffect(() => {
    if (companyId) {
      loadMaterials()
    }
  }, [companyId])

  const loadMaterials = async () => {
    if (!companyId) return

    setIsLoading(true)
    try {
      const data = await db.getAllMaterialsEquipment(companyId)
      setMaterials(data || [])
    } catch (error) {
      console.error('Error loading materials:', error)
      onShowToast('Error loading materials', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const groupByCategory = () => {
    const grouped = {}
    materials.forEach(item => {
      const category = item.category || 'Other'
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(item)
    })
    return grouped
  }

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  const handleAddClick = () => {
    setEditingItem(null)
    setFormData({
      name: '',
      category: 'Containment',
      unit: 'each',
      cost_per_unit: ''
    })
    setShowAddForm(true)
  }

  const handleEditClick = (item) => {
    setEditingItem(item)
    setFormData({
      name: item.name,
      category: item.category,
      unit: item.unit || 'each',
      cost_per_unit: item.cost_per_unit || ''
    })
    setShowAddForm(true)
  }

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveItem = async () => {
    if (!formData.name.trim()) {
      onShowToast('Item name is required', 'error')
      return
    }

    try {
      if (editingItem) {
        // Update existing item
        await db.updateMaterialEquipment(editingItem.id, {
          name: formData.name.trim(),
          category: formData.category,
          unit: formData.unit,
          cost_per_unit: parseFloat(formData.cost_per_unit) || 0
        })
        onShowToast('Item updated', 'success')
      } else {
        // Create new item
        await db.createMaterialEquipment({
          company_id: companyId,
          name: formData.name.trim(),
          category: formData.category,
          unit: formData.unit,
          cost_per_unit: parseFloat(formData.cost_per_unit) || 0,
          active: true
        })
        onShowToast('Item added', 'success')
      }

      setShowAddForm(false)
      setEditingItem(null)
      loadMaterials()
    } catch (error) {
      console.error('Error saving item:', error)
      onShowToast('Error saving item', 'error')
    }
  }

  const handleDeleteItem = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return

    try {
      await db.deleteMaterialEquipment(item.id)
      onShowToast('Item deleted', 'success')
      loadMaterials()
    } catch (error) {
      console.error('Error deleting item:', error)
      onShowToast('Error deleting item', 'error')
    }
  }

  const groupedMaterials = groupByCategory()
  const totalCount = materials.length

  if (isLoading) {
    return (
      <div className="materials-settings">
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading materials...</div>
      </div>
    )
  }

  return (
    <div className="materials-settings">
      <div className="materials-settings-header">
        <h2>📦 Materials & Equipment</h2>
        <p>Manage your company's master materials list for T&M tickets</p>
      </div>

      <div className="materials-stats">
        <div className="materials-stat-card">
          <div className="materials-stat-value">{totalCount}</div>
          <div className="materials-stat-label">Total Items</div>
        </div>
        {Object.keys(groupedMaterials).map(category => (
          <div key={category} className="materials-stat-card">
            <div className="materials-stat-value">{groupedMaterials[category].length}</div>
            <div className="materials-stat-label">{category}</div>
          </div>
        ))}
      </div>

      <div className="materials-actions">
        <button className="btn" onClick={handleAddClick}>
          + Add Item
        </button>
        <button className="btn-secondary" onClick={() => setShowUpload(true)}>
          📤 Upload List
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="materials-form-overlay">
          <div className="materials-form-modal">
            <div className="materials-form-header">
              <h3>{editingItem ? 'Edit Item' : 'Add Item'}</h3>
              <button className="materials-form-close" onClick={() => setShowAddForm(false)}>×</button>
            </div>

            <div className="materials-form-body">
              <div className="form-group">
                <label>Item Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="e.g., 6 mil Poly, Tyvek Suit"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Unit</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => handleFormChange('unit', e.target.value)}
                  >
                    {UNITS.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Cost Per Unit (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost_per_unit}
                  onChange={(e) => handleFormChange('cost_per_unit', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="materials-form-footer">
              <button className="btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button className="btn" onClick={handleSaveItem}>
                {editingItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Materials List by Category */}
      <div className="materials-list">
        {totalCount === 0 ? (
          <div className="materials-empty">
            <p>No materials added yet</p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Add items manually or upload your existing materials list
            </p>
          </div>
        ) : (
          Object.keys(groupedMaterials).sort().map(category => (
            <div key={category} className="materials-category-group">
              <div
                className="materials-category-header"
                onClick={() => toggleCategory(category)}
              >
                <span className="materials-category-icon">
                  {expandedCategories[category] ? '▼' : '▶'}
                </span>
                <span className="materials-category-name">{category}</span>
                <span className="materials-category-count">
                  ({groupedMaterials[category].length})
                </span>
              </div>

              {expandedCategories[category] && (
                <div className="materials-category-items">
                  <table className="materials-table">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Unit</th>
                        <th>Cost/Unit</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedMaterials[category].map(item => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.unit || 'each'}</td>
                          <td>${(item.cost_per_unit || 0).toFixed(2)}</td>
                          <td>
                            <button
                              className="btn-icon"
                              onClick={() => handleEditClick(item)}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn-icon"
                              onClick={() => handleDeleteItem(item)}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {onClose && (
        <div className="materials-settings-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <MaterialsUpload
          companyId={companyId}
          onClose={() => setShowUpload(false)}
          onComplete={() => {
            setShowUpload(false)
            loadMaterials()
          }}
          onShowToast={onShowToast}
        />
      )}
    </div>
  )
}
