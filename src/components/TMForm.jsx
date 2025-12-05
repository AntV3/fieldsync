import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']

export default function TMForm({ project, companyId, onSubmit, onCancel, onShowToast }) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0])
  const [workers, setWorkers] = useState([{ name: '', hours: '' }])
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  
  // Item picker state
  const [showItemPicker, setShowItemPicker] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryItems, setCategoryItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customItem, setCustomItem] = useState({ name: '', category: '', quantity: '' })

  // Load items when category selected
  useEffect(() => {
    if (selectedCategory && companyId) {
      loadCategoryItems(selectedCategory)
    }
  }, [selectedCategory, companyId])

  const loadCategoryItems = async (category) => {
    setLoadingItems(true)
    try {
      const data = await db.getMaterialsEquipmentByCategory(companyId, category)
      setCategoryItems(data)
    } catch (error) {
      console.error('Error loading items:', error)
      onShowToast('Error loading items', 'error')
    } finally {
      setLoadingItems(false)
    }
  }

  // Worker functions
  const addWorker = () => {
    setWorkers([...workers, { name: '', hours: '' }])
  }

  const updateWorker = (index, field, value) => {
    setWorkers(workers.map((w, i) => 
      i === index ? { ...w, [field]: value } : w
    ))
  }

  const removeWorker = (index) => {
    if (workers.length > 1) {
      setWorkers(workers.filter((_, i) => i !== index))
    }
  }

  // Item functions
  const openItemPicker = () => {
    setShowItemPicker(true)
    setSelectedCategory(null)
    setCategoryItems([])
  }

  const selectItem = (item) => {
    setItems([...items, {
      material_equipment_id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      quantity: 1,
      isCustom: false
    }])
    setShowItemPicker(false)
    setSelectedCategory(null)
  }

  const addCustomItem = () => {
    if (!customItem.name || !customItem.category || !customItem.quantity) {
      onShowToast('Fill in all custom item fields', 'error')
      return
    }
    setItems([...items, {
      material_equipment_id: null,
      custom_name: customItem.name,
      custom_category: customItem.category,
      name: customItem.name,
      category: customItem.category,
      quantity: parseFloat(customItem.quantity),
      unit: 'each',
      isCustom: true
    }])
    setCustomItem({ name: '', category: '', quantity: '' })
    setShowCustomForm(false)
    setShowItemPicker(false)
    setSelectedCategory(null)
  }

  const updateItemQuantity = (index, quantity) => {
    setItems(items.map((item, i) => 
      i === index ? { ...item, quantity: parseFloat(quantity) || 0 } : item
    ))
  }

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
  }

  // Submit
  const handleSubmit = async () => {
    const validWorkers = workers.filter(w => w.name.trim() && parseFloat(w.hours) > 0)
    
    if (validWorkers.length === 0 && items.length === 0) {
      onShowToast('Add at least one worker or item', 'error')
      return
    }

    setSubmitting(true)
    try {
      // Create ticket
      const ticket = await db.createTMTicket({
        project_id: project.id,
        work_date: workDate,
        notes: notes.trim() || null,
        photo_url: null
      })

      // Add workers
      if (validWorkers.length > 0) {
        await db.addTMWorkers(ticket.id, validWorkers.map(w => ({
          name: w.name.trim(),
          hours: parseFloat(w.hours)
        })))
      }

      // Add items
      if (items.length > 0) {
        await db.addTMItems(ticket.id, items.map(item => ({
          material_equipment_id: item.material_equipment_id,
          custom_name: item.custom_name || null,
          custom_category: item.custom_category || null,
          quantity: item.quantity
        })))
      }

      onShowToast('T&M submitted!', 'success')
      onSubmit()
    } catch (error) {
      console.error('Error submitting T&M:', error)
      onShowToast('Error submitting T&M', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Item picker modal
  if (showItemPicker) {
    return (
      <div className="tm-form">
        <div className="tm-header">
          <button className="back-btn-simple" onClick={() => {
            if (showCustomForm) {
              setShowCustomForm(false)
            } else if (selectedCategory) {
              setSelectedCategory(null)
            } else {
              setShowItemPicker(false)
            }
          }}>←</button>
          <h2>{showCustomForm ? 'Add Custom Item' : selectedCategory || 'Select Category'}</h2>
        </div>

        {showCustomForm ? (
          <div className="tm-custom-form">
            <div className="form-group">
              <label>Item Name</label>
              <input
                type="text"
                placeholder="Enter item name"
                value={customItem.name}
                onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select
                value={customItem.category}
                onChange={(e) => setCustomItem({ ...customItem, category: e.target.value })}
              >
                <option value="">Select category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                placeholder="Quantity"
                value={customItem.quantity}
                onChange={(e) => setCustomItem({ ...customItem, quantity: e.target.value })}
              />
            </div>
            <button className="btn btn-primary btn-full" onClick={addCustomItem}>
              Add Custom Item
            </button>
          </div>
        ) : !selectedCategory ? (
          <div className="tm-category-list">
            {CATEGORIES.map(cat => (
              <button 
                key={cat} 
                className="tm-category-btn"
                onClick={() => setSelectedCategory(cat)}
              >
                <span>{cat}</span>
                <span className="tm-arrow">→</span>
              </button>
            ))}
            <button 
              className="tm-category-btn tm-custom-btn"
              onClick={() => setShowCustomForm(true)}
            >
              <span>+ Add Other (Custom)</span>
            </button>
          </div>
        ) : (
          <div className="tm-item-list">
            {loadingItems ? (
              <div className="loading">Loading...</div>
            ) : categoryItems.length === 0 ? (
              <div className="tm-empty">No items in this category</div>
            ) : (
              categoryItems.map(item => (
                <button 
                  key={item.id}
                  className="tm-item-btn"
                  onClick={() => selectItem(item)}
                >
                  <span className="tm-item-name">{item.name}</span>
                  <span className="tm-item-unit">{item.unit}</span>
                </button>
              ))
            )}
            <button 
              className="tm-category-btn tm-custom-btn"
              onClick={() => setShowCustomForm(true)}
            >
              <span>+ Add Other (Custom)</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="tm-form">
      <div className="tm-header">
        <button className="back-btn-simple" onClick={onCancel}>←</button>
        <h2>New T&M Ticket</h2>
      </div>

      <div className="tm-section">
        <label>Date</label>
        <input
          type="date"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          className="tm-date-input"
        />
      </div>

      <div className="tm-section">
        <div className="tm-section-header">
          <label>Workers</label>
        </div>
        {workers.map((worker, index) => (
          <div key={index} className="tm-worker-row">
            <input
              type="text"
              placeholder="Name"
              value={worker.name}
              onChange={(e) => updateWorker(index, 'name', e.target.value)}
              className="tm-worker-name"
            />
            <input
              type="number"
              placeholder="Hrs"
              value={worker.hours}
              onChange={(e) => updateWorker(index, 'hours', e.target.value)}
              className="tm-worker-hours"
            />
            {workers.length > 1 && (
              <button className="tm-remove-btn" onClick={() => removeWorker(index)}>×</button>
            )}
          </div>
        ))}
        <button className="btn btn-secondary btn-small" onClick={addWorker}>
          + Add Worker
        </button>
      </div>

      <div className="tm-section">
        <div className="tm-section-header">
          <label>Materials & Equipment</label>
        </div>
        {items.length > 0 && (
          <div className="tm-items-list">
            {items.map((item, index) => (
              <div key={index} className="tm-selected-item">
                <div className="tm-selected-item-info">
                  <span className="tm-selected-item-name">
                    {item.isCustom && <span className="tm-custom-tag">Custom</span>}
                    {item.name}
                  </span>
                  <span className="tm-selected-item-category">{item.category}</span>
                </div>
                <div className="tm-selected-item-qty">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItemQuantity(index, e.target.value)}
                    className="tm-qty-input"
                  />
                  <span className="tm-unit">{item.unit}</span>
                </div>
                <button className="tm-remove-btn" onClick={() => removeItem(index)}>×</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-secondary btn-small" onClick={openItemPicker}>
          + Add Item
        </button>
      </div>

      <div className="tm-section">
        <label>Notes (optional)</label>
        <textarea
          placeholder="Any additional notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="tm-notes"
        />
      </div>

      <button 
        className="btn btn-primary btn-full tm-submit"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Submitting...' : 'Submit T&M'}
      </button>
    </div>
  )
}
