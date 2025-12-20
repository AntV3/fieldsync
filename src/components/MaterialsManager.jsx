import { useState, useEffect } from 'react'
import { db, supabase, isSupabaseConfigured } from '../lib/supabase'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']
const LABOR_ROLES = [
  { key: 'foreman', label: 'Foreman', description: 'Supervision hourly rate' },
  { key: 'operator', label: 'Operator', description: 'Equipment operator hourly rate' },
  { key: 'laborer', label: 'Laborer', description: 'General laborer hourly rate' }
]

export default function MaterialsManager({ company, onShowToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [editingItem, setEditingItem] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', category: 'Equipment', unit: 'each', cost_per_unit: '' })
  const [duplicates, setDuplicates] = useState([])
  const [showDuplicates, setShowDuplicates] = useState(false)

  // Labor rates state
  const [laborRates, setLaborRates] = useState({
    foreman: '',
    operator: '',
    laborer: ''
  })
  const [editingRates, setEditingRates] = useState(false)
  const [savingRates, setSavingRates] = useState(false)

  useEffect(() => {
    if (company?.id) {
      loadItems()
      loadLaborRates()
    }
  }, [company?.id])

  const loadItems = async () => {
    setLoading(true)
    try {
      const data = await db.getAllMaterialsEquipment(company.id)
      setItems(data || [])
      findDuplicates(data || [])
    } catch (error) {
      console.error('Error loading items:', error)
      onShowToast('Error loading materials', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Load labor rates from database
  const loadLaborRates = async () => {
    if (!isSupabaseConfigured) return

    try {
      const { data, error } = await supabase
        .from('labor_rates')
        .select('*')
        .eq('company_id', company.id)

      if (error) {
        // Table might not exist yet - that's ok
        console.log('Labor rates table may not exist:', error.message)
        return
      }

      if (data && data.length > 0) {
        const rates = {}
        data.forEach(rate => {
          rates[rate.role] = rate.hourly_rate || ''
        })
        setLaborRates(prev => ({ ...prev, ...rates }))
      }
    } catch (error) {
      console.error('Error loading labor rates:', error)
    }
  }

  // Save labor rates to database
  const saveLaborRates = async () => {
    if (!isSupabaseConfigured) {
      onShowToast('Labor rates require database connection', 'error')
      return
    }

    setSavingRates(true)
    try {
      for (const role of LABOR_ROLES) {
        const rate = parseFloat(laborRates[role.key]) || 0

        const { error } = await supabase
          .from('labor_rates')
          .upsert({
            company_id: company.id,
            role: role.key,
            hourly_rate: rate
          }, {
            onConflict: 'company_id,role'
          })

        if (error) throw error
      }

      onShowToast('Labor rates saved', 'success')
      setEditingRates(false)
    } catch (error) {
      console.error('Error saving labor rates:', error)
      onShowToast('Error saving rates. Run the SQL setup first.', 'error')
    } finally {
      setSavingRates(false)
    }
  }

  // Find duplicate items by name (case-insensitive)
  const findDuplicates = (itemList) => {
    const nameMap = {}
    const dupes = []

    itemList.forEach(item => {
      const normalizedName = item.name.toLowerCase().trim()
      if (!nameMap[normalizedName]) {
        nameMap[normalizedName] = []
      }
      nameMap[normalizedName].push(item)
    })

    Object.entries(nameMap).forEach(([name, group]) => {
      if (group.length > 1) {
        dupes.push({ name, items: group })
      }
    })

    setDuplicates(dupes)
  }

  // Merge duplicates - keep the first one with cost, delete others
  const mergeDuplicates = async (dupeGroup) => {
    try {
      // Find the item to keep (prefer one with cost > 0)
      const itemsWithCost = dupeGroup.items.filter(i => i.cost_per_unit > 0)
      const keepItem = itemsWithCost.length > 0 ? itemsWithCost[0] : dupeGroup.items[0]
      const deleteItems = dupeGroup.items.filter(i => i.id !== keepItem.id)

      // Delete the duplicates
      for (const item of deleteItems) {
        await db.deleteMaterialEquipment(item.id)
      }

      onShowToast(`Merged ${dupeGroup.items.length} items into one`, 'success')
      loadItems()
    } catch (error) {
      console.error('Error merging duplicates:', error)
      onShowToast('Error merging duplicates', 'error')
    }
  }

  // Merge all duplicates at once
  const mergeAllDuplicates = async () => {
    if (!confirm(`Merge all ${duplicates.length} duplicate groups?`)) return

    try {
      for (const dupeGroup of duplicates) {
        const itemsWithCost = dupeGroup.items.filter(i => i.cost_per_unit > 0)
        const keepItem = itemsWithCost.length > 0 ? itemsWithCost[0] : dupeGroup.items[0]
        const deleteItems = dupeGroup.items.filter(i => i.id !== keepItem.id)

        for (const item of deleteItems) {
          await db.deleteMaterialEquipment(item.id)
        }
      }

      onShowToast('All duplicates merged!', 'success')
      loadItems()
      setShowDuplicates(false)
    } catch (error) {
      console.error('Error merging all duplicates:', error)
      onShowToast('Error merging duplicates', 'error')
    }
  }

  // Add new item
  const handleAddItem = async () => {
    if (!newItem.name.trim()) {
      onShowToast('Enter item name', 'error')
      return
    }

    try {
      await db.createMaterialEquipment({
        company_id: company.id,
        name: newItem.name.trim(),
        category: newItem.category,
        unit: newItem.unit || 'each',
        cost_per_unit: parseFloat(newItem.cost_per_unit) || 0,
        active: true
      })

      onShowToast('Item added', 'success')
      setNewItem({ name: '', category: 'Equipment', unit: 'each', cost_per_unit: '' })
      setShowAddForm(false)
      loadItems()
    } catch (error) {
      console.error('Error adding item:', error)
      onShowToast('Error adding item', 'error')
    }
  }

  // Update item
  const handleUpdateItem = async (item) => {
    try {
      await db.updateMaterialEquipment(item.id, {
        name: item.name,
        category: item.category,
        unit: item.unit,
        cost_per_unit: parseFloat(item.cost_per_unit) || 0
      })

      onShowToast('Item updated', 'success')
      setEditingItem(null)
      loadItems()
    } catch (error) {
      console.error('Error updating item:', error)
      onShowToast('Error updating item', 'error')
    }
  }

  // Delete item
  const handleDeleteItem = async (itemId) => {
    if (!confirm('Delete this item?')) return

    try {
      await db.deleteMaterialEquipment(itemId)
      onShowToast('Item deleted', 'success')
      loadItems()
    } catch (error) {
      console.error('Error deleting item:', error)
      onShowToast('Error deleting item', 'error')
    }
  }

  // Filtered items
  const filteredItems = filter === 'all'
    ? items.filter(i => i.active !== false)
    : items.filter(i => i.category === filter && i.active !== false)

  // Group by category for display
  const groupedItems = filteredItems.reduce((acc, item) => {
    const cat = item.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  if (loading) {
    return <div className="loading">Loading pricing...</div>
  }

  return (
    <div className="materials-manager">
      {/* Labor Rates Section */}
      <div className="pricing-section">
        <div className="pricing-section-header">
          <h2>Labor Rates</h2>
          {!editingRates ? (
            <button className="btn btn-secondary btn-small" onClick={() => setEditingRates(true)}>
              Edit Rates
            </button>
          ) : (
            <div className="rate-actions">
              <button className="btn btn-secondary btn-small" onClick={() => setEditingRates(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-small"
                onClick={saveLaborRates}
                disabled={savingRates}
              >
                {savingRates ? 'Saving...' : 'Save Rates'}
              </button>
            </div>
          )}
        </div>

        <div className="labor-rates-grid">
          {LABOR_ROLES.map(role => (
            <div key={role.key} className="labor-rate-card">
              <div className="rate-label">
                <span className="rate-title">{role.label}</span>
                <span className="rate-desc">{role.description}</span>
              </div>
              {editingRates ? (
                <div className="rate-input-group">
                  <span className="rate-prefix">$</span>
                  <input
                    type="number"
                    value={laborRates[role.key]}
                    onChange={(e) => setLaborRates({ ...laborRates, [role.key]: e.target.value })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                  <span className="rate-suffix">/hr</span>
                </div>
              ) : (
                <div className="rate-display">
                  ${(parseFloat(laborRates[role.key]) || 0).toFixed(2)}/hr
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="pricing-divider"></div>

      {/* Materials Section */}
      <div className="pricing-section">
        <div className="materials-header">
          <div className="materials-title">
            <h2>Materials & Equipment</h2>
            <span className="materials-count">{items.filter(i => i.active !== false).length} items</span>
          </div>
          <div className="materials-actions">
            {duplicates.length > 0 && (
              <button
                className={`btn btn-warning btn-small ${showDuplicates ? 'active' : ''}`}
                onClick={() => setShowDuplicates(!showDuplicates)}
              >
                {duplicates.length} Duplicates
              </button>
            )}
            <button className="btn btn-primary btn-small" onClick={() => setShowAddForm(true)}>
              + Add Item
            </button>
          </div>
        </div>

        {/* Duplicates Panel */}
        {showDuplicates && duplicates.length > 0 && (
          <div className="duplicates-panel">
            <div className="duplicates-header">
              <h3>Duplicate Items Found</h3>
              <button className="btn btn-success btn-small" onClick={mergeAllDuplicates}>
                Merge All ({duplicates.length})
              </button>
            </div>
            <div className="duplicates-list">
              {duplicates.map((dupe, idx) => (
                <div key={idx} className="duplicate-group">
                  <div className="duplicate-name">"{dupe.name}" x {dupe.items.length}</div>
                  <div className="duplicate-items">
                    {dupe.items.map(item => (
                      <span key={item.id} className="duplicate-item">
                        {item.category} - ${item.cost_per_unit || 0}
                      </span>
                    ))}
                  </div>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => mergeDuplicates(dupe)}
                  >
                    Merge
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Item Form */}
        {showAddForm && (
          <div className="add-item-form">
            <h3>Add New Item</h3>
            <div className="form-row">
              <input
                type="text"
                placeholder="Item Name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                autoFocus
              />
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <input
                type="text"
                placeholder="Unit (e.g., each, day, hour)"
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              />
              <input
                type="number"
                placeholder="Cost per unit"
                value={newItem.cost_per_unit}
                onChange={(e) => setNewItem({ ...newItem, cost_per_unit: e.target.value })}
                step="0.01"
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddItem}>
                Add Item
              </button>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="materials-filter">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`filter-tab ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
              <span className="filter-count">
                {items.filter(i => i.category === cat && i.active !== false).length}
              </span>
            </button>
          ))}
        </div>

        {/* Items List */}
        <div className="materials-list">
          {filter === 'all' ? (
            // Grouped view when showing all
            Object.entries(groupedItems).map(([category, catItems]) => (
              <div key={category} className="materials-category">
                <h3 className="category-header">{category}</h3>
                <div className="category-items">
                  {catItems.map(item => (
                    <div key={item.id} className="material-item">
                      {editingItem?.id === item.id ? (
                        <div className="item-edit-form">
                          <input
                            type="text"
                            value={editingItem.name}
                            onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                          />
                          <select
                            value={editingItem.category}
                            onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                          >
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editingItem.unit}
                            onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                            placeholder="Unit"
                          />
                          <input
                            type="number"
                            value={editingItem.cost_per_unit}
                            onChange={(e) => setEditingItem({ ...editingItem, cost_per_unit: e.target.value })}
                            placeholder="Cost"
                            step="0.01"
                          />
                          <div className="edit-actions">
                            <button className="btn btn-success btn-small" onClick={() => handleUpdateItem(editingItem)}>
                              Save
                            </button>
                            <button className="btn btn-secondary btn-small" onClick={() => setEditingItem(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="item-info">
                            <span className="item-name">{item.name}</span>
                            <span className="item-unit">{item.unit || 'each'}</span>
                          </div>
                          <div className="item-cost">
                            ${(item.cost_per_unit || 0).toFixed(2)}
                          </div>
                          <div className="item-actions">
                            <button
                              className="btn-icon"
                              onClick={() => setEditingItem({ ...item })}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn-icon danger"
                              onClick={() => handleDeleteItem(item.id)}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            // Flat view for single category
            <div className="category-items">
              {filteredItems.map(item => (
                <div key={item.id} className="material-item">
                  {editingItem?.id === item.id ? (
                    <div className="item-edit-form">
                      <input
                        type="text"
                        value={editingItem.name}
                        onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                      />
                      <input
                        type="text"
                        value={editingItem.unit}
                        onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                        placeholder="Unit"
                      />
                      <input
                        type="number"
                        value={editingItem.cost_per_unit}
                        onChange={(e) => setEditingItem({ ...editingItem, cost_per_unit: e.target.value })}
                        placeholder="Cost"
                        step="0.01"
                      />
                      <div className="edit-actions">
                        <button className="btn btn-success btn-small" onClick={() => handleUpdateItem(editingItem)}>
                          Save
                        </button>
                        <button className="btn btn-secondary btn-small" onClick={() => setEditingItem(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="item-info">
                        <span className="item-name">{item.name}</span>
                        <span className="item-unit">{item.unit || 'each'}</span>
                      </div>
                      <div className="item-cost">
                        ${(item.cost_per_unit || 0).toFixed(2)}
                      </div>
                      <div className="item-actions">
                        <button
                          className="btn-icon"
                          onClick={() => setEditingItem({ ...item })}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-icon danger"
                          onClick={() => handleDeleteItem(item.id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {filteredItems.length === 0 && (
            <div className="empty-state">
              <p>No items in this category</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
