import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']

export default function MaterialsSection({ company, onShowToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [editingItem, setEditingItem] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', category: 'Equipment', unit: 'each', cost_per_unit: '' })
  const [duplicates, setDuplicates] = useState([])
  const [showDuplicates, setShowDuplicates] = useState(false)

  useEffect(() => {
    if (company?.id) {
      loadItems()
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

  const findDuplicates = (itemList) => {
    const nameMap = {}
    const dupes = []
    const activeItems = itemList.filter(item => item.active !== false)

    activeItems.forEach(item => {
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

  const mergeDuplicates = async (dupeGroup) => {
    try {
      const itemsWithCost = dupeGroup.items.filter(i => i.cost_per_unit > 0)
      const keepItem = itemsWithCost.length > 0 ? itemsWithCost[0] : dupeGroup.items[0]
      const deleteItems = dupeGroup.items.filter(i => i.id !== keepItem.id)

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

  const filteredItems = filter === 'all'
    ? items.filter(i => i.active !== false)
    : items.filter(i => i.category === filter && i.active !== false)

  const groupedItems = filteredItems.reduce((acc, item) => {
    const cat = item.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  if (loading) {
    return <div className="loading">Loading materials...</div>
  }

  return (
    <div className="pricing-section">
      <div className="materials-header">
        <div className="materials-title">
          <h2>Materials & Equipment</h2>
          <span className="materials-count">{items.filter(i => i.active !== false).length} items</span>
        </div>
        <div className="materials-actions">
          {duplicates.length > 0 && (
            <button
              className={`btn btn-warning ${showDuplicates ? 'active' : ''}`}
              onClick={() => setShowDuplicates(!showDuplicates)}
            >
              {duplicates.length} Duplicates
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
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
          Object.entries(groupedItems).map(([category, catItems]) => (
            <div key={category} className="materials-category">
              <h3 className="category-header">{category}</h3>
              <div className="category-items">
                {catItems.map(item => (
                  <MaterialItem
                    key={item.id}
                    item={item}
                    editingItem={editingItem}
                    setEditingItem={setEditingItem}
                    handleUpdateItem={handleUpdateItem}
                    handleDeleteItem={handleDeleteItem}
                    categories={CATEGORIES}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="materials-category">
            <h3 className="category-header">{filter}</h3>
            <div className="category-items">
              {filteredItems.map(item => (
                <MaterialItem
                  key={item.id}
                  item={item}
                  editingItem={editingItem}
                  setEditingItem={setEditingItem}
                  handleUpdateItem={handleUpdateItem}
                  handleDeleteItem={handleDeleteItem}
                  categories={CATEGORIES}
                />
              ))}
            </div>
          </div>
        )}

        {filteredItems.length === 0 && (
          <div className="empty-state">
            <p>No items in this category</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MaterialItem({ item, editingItem, setEditingItem, handleUpdateItem, handleDeleteItem, categories }) {
  if (editingItem?.id === item.id) {
    return (
      <div className="material-item">
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
            {categories.map(cat => (
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
      </div>
    )
  }

  return (
    <div className="material-item">
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
    </div>
  )
}
