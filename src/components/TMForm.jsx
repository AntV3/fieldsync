import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']

export default function TMForm({ project, companyId, onSubmit, onCancel, onShowToast }) {
  const [step, setStep] = useState(1) // 1: Workers, 2: Items, 3: Review
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0])
  const [supervision, setSupervision] = useState([{ name: '', hours: '', role: 'Foreman' }])
  const [laborers, setLaborers] = useState([{ name: '', hours: '' }])
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  
  // Item picker state
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

  // Supervision functions
  const addSupervision = () => {
    setSupervision([...supervision, { name: '', hours: '', role: 'Foreman' }])
  }

  const updateSupervision = (index, field, value) => {
    setSupervision(supervision.map((s, i) => 
      i === index ? { ...s, [field]: value } : s
    ))
  }

  const removeSupervision = (index) => {
    if (supervision.length > 1) {
      setSupervision(supervision.filter((_, i) => i !== index))
    } else {
      setSupervision([{ name: '', hours: '', role: 'Foreman' }])
    }
  }

  // Laborer functions
  const addLaborer = () => {
    setLaborers([...laborers, { name: '', hours: '' }])
  }

  const updateLaborer = (index, field, value) => {
    setLaborers(laborers.map((l, i) => 
      i === index ? { ...l, [field]: value } : l
    ))
  }

  const removeLaborer = (index) => {
    if (laborers.length > 1) {
      setLaborers(laborers.filter((_, i) => i !== index))
    } else {
      setLaborers([{ name: '', hours: '' }])
    }
  }

  // Item functions
  const selectItem = (item) => {
    // Check if already added
    const existingIndex = items.findIndex(i => i.material_equipment_id === item.id)
    if (existingIndex >= 0) {
      // Increment quantity
      setItems(items.map((it, i) => 
        i === existingIndex ? { ...it, quantity: it.quantity + 1 } : it
      ))
    } else {
      setItems([...items, {
        material_equipment_id: item.id,
        name: item.name,
        unit: item.unit,
        category: item.category,
        quantity: 1,
        isCustom: false
      }])
    }
    onShowToast(`Added ${item.name}`, 'success')
  }

  const addCustomItem = () => {
    if (!customItem.name || !customItem.category || !customItem.quantity) {
      onShowToast('Fill in all fields', 'error')
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
    setSelectedCategory(null)
    onShowToast('Custom item added', 'success')
  }

  const updateItemQuantity = (index, quantity) => {
    const qty = parseFloat(quantity) || 0
    if (qty <= 0) {
      removeItem(index)
    } else {
      setItems(items.map((item, i) => 
        i === index ? { ...item, quantity: qty } : item
      ))
    }
  }

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
  }

  // Photo functions
  const handlePhotoAdd = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        onShowToast('Please select an image file', 'error')
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        setPhotos(prev => [...prev, {
          id: Date.now() + Math.random(),
          dataUrl: event.target.result,
          name: file.name
        }])
      }
      reader.readAsDataURL(file)
    })
    
    // Reset input
    e.target.value = ''
  }

  const removePhoto = (photoId) => {
    setPhotos(photos.filter(p => p.id !== photoId))
  }

  // Navigation
  const canGoNext = () => {
    if (step === 1) {
      // At least one supervision or laborer with name and hours
      const hasSupervision = supervision.some(s => s.name.trim() && parseFloat(s.hours) > 0)
      const hasLaborers = laborers.some(l => l.name.trim() && parseFloat(l.hours) > 0)
      return hasSupervision || hasLaborers
    }
    return true
  }

  const goNext = () => {
    if (step < 3) setStep(step + 1)
  }

  const goBack = () => {
    if (selectedCategory) {
      setSelectedCategory(null)
      setShowCustomForm(false)
    } else if (showCustomForm) {
      setShowCustomForm(false)
    } else if (step > 1) {
      setStep(step - 1)
    } else {
      onCancel()
    }
  }

  // Submit
  const handleSubmit = async () => {
    const validSupervision = supervision.filter(s => s.name.trim() && parseFloat(s.hours) > 0)
    const validLaborers = laborers.filter(l => l.name.trim() && parseFloat(l.hours) > 0)
    
    if (validSupervision.length === 0 && validLaborers.length === 0) {
      onShowToast('Add at least one worker', 'error')
      return
    }

    setSubmitting(true)
    try {
      // Prepare photos array (just the dataUrls)
      const photoData = photos.map(p => p.dataUrl)

      const ticket = await db.createTMTicket({
        project_id: project.id,
        work_date: workDate,
        notes: notes.trim() || null,
        photos: photoData
      })

      // Combine supervision and laborers for workers table
      const allWorkers = [
        ...validSupervision.map(s => ({
          name: s.name.trim(),
          hours: parseFloat(s.hours),
          role: s.role
        })),
        ...validLaborers.map(l => ({
          name: l.name.trim(),
          hours: parseFloat(l.hours),
          role: 'Laborer'
        }))
      ]

      await db.addTMWorkers(ticket.id, allWorkers)

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

  // Get total workers and hours for summary
  const validSupervision = supervision.filter(s => s.name.trim() && parseFloat(s.hours) > 0)
  const validLaborers = laborers.filter(l => l.name.trim() && parseFloat(l.hours) > 0)
  const totalWorkers = validSupervision.length + validLaborers.length
  const totalHours = [...validSupervision, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.hours || 0), 0)
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

  // STEP 2: Item Selection View
  if (step === 2 && (selectedCategory || showCustomForm)) {
    return (
      <div className="tm-wizard">
        <div className="tm-wizard-header">
          <button className="tm-back-btn" onClick={goBack}>←</button>
          <h2>{showCustomForm ? 'Add Custom Item' : selectedCategory}</h2>
          <div className="tm-item-count">{items.length} items</div>
        </div>

        {showCustomForm ? (
          <div className="tm-custom-form">
            <div className="tm-field">
              <label>Item Name</label>
              <input
                type="text"
                placeholder="What did you use?"
                value={customItem.name}
                onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="tm-field">
              <label>Category</label>
              <div className="tm-category-select">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    className={`tm-cat-chip ${customItem.category === cat ? 'active' : ''}`}
                    onClick={() => setCustomItem({ ...customItem, category: cat })}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="tm-field">
              <label>Quantity</label>
              <input
                type="number"
                placeholder="How many?"
                value={customItem.quantity}
                onChange={(e) => setCustomItem({ ...customItem, quantity: e.target.value })}
              />
            </div>
            <button className="tm-big-btn primary" onClick={addCustomItem}>
              Add Custom Item
            </button>
          </div>
        ) : (
          <div className="tm-item-grid">
            {loadingItems ? (
              <div className="tm-loading">Loading...</div>
            ) : (
              <>
                {categoryItems.map(item => {
                  const added = items.find(i => i.material_equipment_id === item.id)
                  return (
                    <button
                      key={item.id}
                      className={`tm-item-card ${added ? 'added' : ''}`}
                      onClick={() => selectItem(item)}
                    >
                      <span className="tm-item-name">{item.name}</span>
                      <span className="tm-item-unit">{item.unit}</span>
                      {added && <span className="tm-item-badge">{added.quantity}</span>}
                    </button>
                  )
                })}
                <button
                  className="tm-item-card custom"
                  onClick={() => setShowCustomForm(true)}
                >
                  <span className="tm-item-name">+ Add Other</span>
                  <span className="tm-item-unit">Not on list</span>
                </button>
              </>
            )}
          </div>
        )}

        {!showCustomForm && items.length > 0 && (
          <div className="tm-wizard-footer">
            <button className="tm-big-btn primary" onClick={() => setSelectedCategory(null)}>
              Done Adding ({items.length} items)
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="tm-wizard">
      {/* Header */}
      <div className="tm-wizard-header">
        <button className="tm-back-btn" onClick={goBack}>←</button>
        <h2>
          {step === 1 && 'Workers'}
          {step === 2 && 'Materials & Equipment'}
          {step === 3 && 'Review'}
        </h2>
        <div className="tm-step-dots">
          <span className={`tm-dot ${step >= 1 ? 'active' : ''}`}></span>
          <span className={`tm-dot ${step >= 2 ? 'active' : ''}`}></span>
          <span className={`tm-dot ${step >= 3 ? 'active' : ''}`}></span>
        </div>
      </div>

      {/* Step 1: Workers */}
      {step === 1 && (
        <div className="tm-step-content">
          <div className="tm-field">
            <label>Date</label>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="tm-date"
            />
          </div>

          <div className="tm-field">
            <label>Description of Work</label>
            <textarea
              placeholder="What work was performed today?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="tm-description"
            />
          </div>

          {/* Photos Section - Moved Up */}
          <div className="tm-field">
            <label>📷 Photos</label>
            {photos.length > 0 && (
              <div className="tm-photo-grid">
                {photos.map(photo => (
                  <div key={photo.id} className="tm-photo-item">
                    <img src={photo.dataUrl} alt={photo.name} />
                    <button className="tm-photo-remove" onClick={() => removePhoto(photo.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
            <label className="tm-photo-btn">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoAdd}
                style={{ display: 'none' }}
              />
              📷 {photos.length > 0 ? 'Add More Photos' : 'Add Photos'}
            </label>
          </div>

          {/* Supervision Section */}
          <div className="tm-field">
            <label>Supervision</label>
            <div className="tm-workers-list">
              {supervision.map((sup, index) => (
                <div key={index} className="tm-worker-card">
                  <div className="tm-role-select">
                    <select
                      value={sup.role}
                      onChange={(e) => updateSupervision(index, 'role', e.target.value)}
                    >
                      <option value="Foreman">Foreman</option>
                      <option value="Superintendent">Superintendent</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="First & Last Name"
                    value={sup.name}
                    onChange={(e) => updateSupervision(index, 'name', e.target.value)}
                    className="tm-worker-input"
                  />
                  <div className="tm-hours-input">
                    <input
                      type="number"
                      placeholder="0"
                      value={sup.hours}
                      onChange={(e) => updateSupervision(index, 'hours', e.target.value)}
                    />
                    <span>hrs</span>
                  </div>
                  <button className="tm-remove" onClick={() => removeSupervision(index)}>×</button>
                </div>
              ))}
            </div>
            <button className="tm-add-btn" onClick={addSupervision}>
              + Add Supervision
            </button>
          </div>

          {/* Laborers Section */}
          <div className="tm-field">
            <label>Laborers</label>
            <div className="tm-workers-list">
              {laborers.map((laborer, index) => (
                <div key={index} className="tm-worker-card">
                  <input
                    type="text"
                    placeholder="First & Last Name"
                    value={laborer.name}
                    onChange={(e) => updateLaborer(index, 'name', e.target.value)}
                    className="tm-worker-input"
                  />
                  <div className="tm-hours-input">
                    <input
                      type="number"
                      placeholder="0"
                      value={laborer.hours}
                      onChange={(e) => updateLaborer(index, 'hours', e.target.value)}
                    />
                    <span>hrs</span>
                  </div>
                  <button className="tm-remove" onClick={() => removeLaborer(index)}>×</button>
                </div>
              ))}
            </div>
            <button className="tm-add-btn" onClick={addLaborer}>
              + Add Laborer
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Items */}
      {step === 2 && !selectedCategory && (
        <div className="tm-step-content">
          <div className="tm-field">
            <label>What was used?</label>
            <div className="tm-category-grid">
              {CATEGORIES.map(cat => {
                const catItems = items.filter(i => i.category === cat)
                return (
                  <button
                    key={cat}
                    className="tm-category-card"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    <span className="tm-cat-name">{cat}</span>
                    {catItems.length > 0 && (
                      <span className="tm-cat-count">{catItems.length}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {items.length > 0 && (
            <div className="tm-field">
              <label>Added Items ({items.length})</label>
              <div className="tm-added-list">
                {items.map((item, index) => (
                  <div key={index} className="tm-added-item">
                    <div className="tm-added-info">
                      {item.isCustom && <span className="tm-custom-badge">Custom</span>}
                      <span className="tm-added-name">{item.name}</span>
                    </div>
                    <div className="tm-added-qty">
                      <button onClick={() => updateItemQuantity(index, item.quantity - 1)}>−</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateItemQuantity(index, item.quantity + 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="tm-step-content">
          <div className="tm-review-section">
            <div className="tm-review-header">
              <span>📅 Date</span>
              <span>{new Date(workDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
          </div>

          {notes && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>📝 Description</span>
              </div>
              <div className="tm-review-notes">{notes}</div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>📷 Photos</span>
                <span>{photos.length}</span>
              </div>
              <div className="tm-review-photos">
                {photos.map(photo => (
                  <img key={photo.id} src={photo.dataUrl} alt={photo.name} />
                ))}
              </div>
            </div>
          )}

          {validSupervision.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>👔 Supervision</span>
                <span>{validSupervision.length} • {validSupervision.reduce((sum, s) => sum + parseFloat(s.hours), 0)} hrs</span>
              </div>
              <div className="tm-review-list">
                {validSupervision.map((s, i) => (
                  <div key={i} className="tm-review-row">
                    <span><span className="tm-role-badge">{s.role}</span> {s.name}</span>
                    <span>{s.hours} hrs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validLaborers.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>👷 Laborers</span>
                <span>{validLaborers.length} • {validLaborers.reduce((sum, l) => sum + parseFloat(l.hours), 0)} hrs</span>
              </div>
              <div className="tm-review-list">
                {validLaborers.map((l, i) => (
                  <div key={i} className="tm-review-row">
                    <span>{l.name}</span>
                    <span>{l.hours} hrs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>🔧 Materials & Equipment</span>
                <span>{items.length} items</span>
              </div>
              <div className="tm-review-list">
                {items.map((item, i) => (
                  <div key={i} className="tm-review-row">
                    <span>{item.isCustom && '⚡ '}{item.name}</span>
                    <span>{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="tm-wizard-footer">
        {step < 3 ? (
          <button 
            className="tm-big-btn primary" 
            onClick={goNext}
            disabled={step === 1 && !canGoNext()}
          >
            {step === 1 ? `Next: Materials (${totalWorkers} workers, ${totalHours} hrs)` : 
             step === 2 ? `Review (${items.length} items)` : 'Next'}
          </button>
        ) : (
          <button 
            className="tm-big-btn submit" 
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : '✓ Submit T&M'}
          </button>
        )}
        
        {step === 2 && (
          <button className="tm-skip-btn" onClick={goNext}>
            Skip (no materials)
          </button>
        )}
      </div>
    </div>
  )
}