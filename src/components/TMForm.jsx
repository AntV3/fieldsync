import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import offlineDb from '../lib/offlineDb'
import { compressPhoto, isValidImage, formatFileSize } from '../lib/photoCompression'
import { useNetworkStatus } from '../lib/networkStatus'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']

export default function TMForm({ project, companyId, maxPhotos = 3, onSubmit, onCancel, onShowToast }) {
  const [step, setStep] = useState(1) // 1: Workers, 2: Items, 3: Review
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0])
  const [cePcoNumber, setCePcoNumber] = useState('')
  const [submittedByName, setSubmittedByName] = useState('') // Foreman's name for certification
  const [supervision, setSupervision] = useState([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
  const [laborers, setLaborers] = useState([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [compressingPhotos, setCompressingPhotos] = useState(false)
  const isOnline = useNetworkStatus()

  // Crew check-in state
  const [todaysCrew, setTodaysCrew] = useState([])
  const [showCrewPicker, setShowCrewPicker] = useState(false)
  
  // Item picker state
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryItems, setCategoryItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customItem, setCustomItem] = useState({ name: '', category: '', quantity: '' })

  // Load today's crew on mount
  useEffect(() => {
    loadTodaysCrew()
  }, [project.id])

  const loadTodaysCrew = async () => {
    try {
      const checkin = await offlineDb.getCrewCheckin(project.id)
      if (checkin?.workers) {
        setTodaysCrew(checkin.workers)
      }
    } catch (err) {
      console.error('Error loading crew:', err)
    }
  }

  // Load items when category selected
  useEffect(() => {
    if (selectedCategory && companyId) {
      loadCategoryItems(selectedCategory)
    }
  }, [selectedCategory, companyId])

  const loadCategoryItems = async (category) => {
    setLoadingItems(true)
    try {
      const data = await offlineDb.getMaterialsEquipmentByCategory(companyId, category)
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
    setSupervision([...supervision, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
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
      setSupervision([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
    }
  }

  // Laborer functions
  const addLaborer = () => {
    setLaborers([...laborers, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
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
      setLaborers([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
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

  // Photo functions - compress and store
  const handlePhotoAdd = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    // Check photo limit (-1 means unlimited)
    const remainingSlots = maxPhotos === -1 ? Infinity : maxPhotos - photos.length
    if (remainingSlots <= 0) {
      onShowToast(`Photo limit reached (${maxPhotos} max)`, 'error')
      e.target.value = ''
      return
    }

    // Only add up to remaining slots
    const filesToAdd = files.slice(0, remainingSlots)
    if (filesToAdd.length < files.length) {
      onShowToast(`Only ${filesToAdd.length} photo(s) added (${maxPhotos} max)`, 'error')
    }

    setCompressingPhotos(true)

    for (const file of filesToAdd) {
      if (!isValidImage(file)) {
        onShowToast('Please select valid image files only', 'error')
        continue
      }

      try {
        // Compress photo
        const { base64, compressed, originalSize, compressedSize, compressionRatio } = await compressPhoto(file)

        // Create preview URL from compressed blob
        const previewUrl = URL.createObjectURL(compressed)

        setPhotos(prev => [...prev, {
          id: Date.now() + Math.random(),
          file: compressed,
          base64: base64,
          previewUrl: previewUrl,
          name: file.name,
          originalSize,
          compressedSize,
          compressionRatio
        }])

        onShowToast(`Photo compressed ${compressionRatio} (${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)})`, 'success')
      } catch (error) {
        console.error('Error compressing photo:', error)
        onShowToast(`Failed to compress ${file.name}`, 'error')
      }
    }

    setCompressingPhotos(false)

    // Reset input
    e.target.value = ''
  }

  const removePhoto = (photoId) => {
    const photo = photos.find(p => p.id === photoId)
    if (photo?.previewUrl) {
      URL.revokeObjectURL(photo.previewUrl)
    }
    setPhotos(photos.filter(p => p.id !== photoId))
  }

  // Navigation
  const canGoNext = () => {
    if (step === 1) {
      // At least one supervision or laborer with name and hours (regular or OT)
      const hasSupervision = supervision.some(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
      const hasLaborers = laborers.some(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
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
    // Require submitter name for certification
    if (!submittedByName.trim()) {
      onShowToast('Enter your name to submit', 'error')
      return
    }

    const validSupervision = supervision.filter(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
    const validLaborers = laborers.filter(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
    
    if (validSupervision.length === 0 && validLaborers.length === 0) {
      onShowToast('Add at least one worker', 'error')
      return
    }

    setSubmitting(true)
    try {
      // Create ticket using offline-enabled db (works online and offline)
      const ticket = await offlineDb.createTMTicket({
        project_id: project.id,
        work_date: workDate,
        ce_pco_number: cePcoNumber.trim() || null,
        notes: notes.trim() || null,
        photos: [], // Will update after uploading
        created_by_name: submittedByName.trim()
      })

      // Handle photos (offline-first approach)
      const photoUrls = []
      for (const photo of photos) {
        try {
          if (isOnline) {
            // If online, upload immediately to Supabase Storage
            const url = await db.uploadPhoto(
              companyId,
              project.id,
              ticket.id,
              photo.file
            )
            if (url) photoUrls.push(url)
          } else {
            // If offline, save compressed photo for later upload
            await offlineDb.saveOfflinePhoto(ticket.id, photo.base64, photo.name)
            // Use placeholder URL for offline photos
            photoUrls.push(`offline:${ticket.id}/${photo.name}`)
          }
        } catch (err) {
          console.error('Error handling photo:', err)
          // Continue with other photos
        }
      }

      // Update ticket with photo URLs or placeholders
      if (photoUrls.length > 0 && isOnline) {
        await db.updateTMTicketPhotos(ticket.id, photoUrls)
      }

      // Combine supervision and laborers for workers table
      const allWorkers = [
        ...validSupervision.map(s => ({
          name: s.name.trim(),
          hours: parseFloat(s.hours) || 0,
          overtime_hours: parseFloat(s.overtimeHours) || 0,
          time_started: s.timeStarted || null,
          time_ended: s.timeEnded || null,
          role: s.role
        })),
        ...validLaborers.map(l => ({
          name: l.name.trim(),
          hours: parseFloat(l.hours) || 0,
          overtime_hours: parseFloat(l.overtimeHours) || 0,
          time_started: l.timeStarted || null,
          time_ended: l.timeEnded || null,
          role: 'Laborer'
        }))
      ]

      await offlineDb.addTMWorkers(ticket.id, allWorkers)

      if (items.length > 0) {
        await offlineDb.addTMItems(ticket.id, items.map(item => ({
          material_equipment_id: item.material_equipment_id,
          custom_name: item.custom_name || null,
          custom_category: item.custom_category || null,
          quantity: item.quantity
        })))
      }

      // Clean up preview URLs
      photos.forEach(p => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })

      if (isOnline) {
        onShowToast('T&M submitted!', 'success')
      } else {
        onShowToast('T&M saved offline - will sync when online', 'success')
      }

      onSubmit()
    } catch (error) {
      console.error('Error submitting T&M:', error)
      onShowToast(`Error submitting T&M: ${error.message}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Get total workers and hours for summary
  const validSupervision = supervision.filter(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
  const validLaborers = laborers.filter(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
  const totalWorkers = validSupervision.length + validLaborers.length
  const totalRegHours = [...validSupervision, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.hours || 0), 0)
  const totalOTHours = [...validSupervision, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.overtimeHours || 0), 0)
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
          {/* Project Info Header */}
          <div className="tm-project-info">
            {project.job_number && (
              <div className="tm-project-detail">
                <span className="tm-project-label">Job #</span>
                <span className="tm-project-value">{project.job_number}</span>
              </div>
            )}
            <div className="tm-project-detail">
              <span className="tm-project-label">Project</span>
              <span className="tm-project-value">{project.name}</span>
            </div>
            {project.address && (
              <div className="tm-project-detail">
                <span className="tm-project-label">Address</span>
                <span className="tm-project-value">{project.address}</span>
              </div>
            )}
            {project.general_contractor && (
              <div className="tm-project-detail">
                <span className="tm-project-label">GC</span>
                <span className="tm-project-value">{project.general_contractor}</span>
              </div>
            )}
          </div>

          <div className="tm-field-row">
            <div className="tm-field tm-field-half">
              <label>Date</label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="tm-date"
              />
            </div>
            <div className="tm-field tm-field-half">
              <label>CE / PCO #</label>
              <input
                type="text"
                placeholder="Change Event / PCO"
                value={cePcoNumber}
                onChange={(e) => setCePcoNumber(e.target.value)}
                className="tm-input"
              />
            </div>
          </div>

          {/* Select from Today's Crew */}
          {todaysCrew.length > 0 && (
            <div className="tm-crew-picker">
              <button 
                className="tm-crew-picker-btn"
                onClick={() => setShowCrewPicker(!showCrewPicker)}
              >
                👷 {showCrewPicker ? 'Hide' : 'Select from'} Today's Crew ({todaysCrew.length})
              </button>
              
              {showCrewPicker && (
                <div className="tm-crew-list">
                  {todaysCrew.map((worker, index) => {
                    const isAdded = 
                      supervision.some(s => s.name.toLowerCase() === worker.name.toLowerCase()) ||
                      laborers.some(l => l.name.toLowerCase() === worker.name.toLowerCase())
                    
                    return (
                      <button
                        key={index}
                        className={`tm-crew-item ${isAdded ? 'added' : ''}`}
                        onClick={() => {
                          if (isAdded) return
                          
                          if (worker.role === 'Foreman' || worker.role === 'Supervisor') {
                            // Add to supervision
                            const emptySupIndex = supervision.findIndex(s => !s.name.trim())
                            if (emptySupIndex >= 0) {
                              updateSupervision(emptySupIndex, 'name', worker.name)
                            } else {
                              setSupervision([...supervision, { 
                                name: worker.name, 
                                hours: '', 
                                overtimeHours: '', 
                                timeStarted: '', 
                                timeEnded: '', 
                                role: worker.role === 'Supervisor' ? 'Superintendent' : 'Foreman' 
                              }])
                            }
                          } else {
                            // Add to laborers
                            const emptyLabIndex = laborers.findIndex(l => !l.name.trim())
                            if (emptyLabIndex >= 0) {
                              updateLaborer(emptyLabIndex, 'name', worker.name)
                            } else {
                              setLaborers([...laborers, { 
                                name: worker.name, 
                                hours: '', 
                                overtimeHours: '', 
                                timeStarted: '', 
                                timeEnded: '' 
                              }])
                            }
                          }
                          onShowToast(`Added ${worker.name}`, 'success')
                        }}
                        disabled={isAdded}
                      >
                        <span className="tm-crew-item-name">{worker.name}</span>
                        <span className={`tm-crew-item-role ${worker.role.toLowerCase()}`}>
                          {worker.role}
                        </span>
                        {isAdded && <span className="tm-crew-item-check">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Supervision Section */}
          <div className="tm-field">
            <label>Supervision</label>
            <div className="tm-workers-list">
              {supervision.map((sup, index) => (
                <div key={index} className="tm-worker-card-expanded">
                  <div className="tm-worker-row-top">
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
                    <button className="tm-remove" onClick={() => removeSupervision(index)}>×</button>
                  </div>
                  <div className="tm-worker-row-bottom">
                    <div className="tm-time-group">
                      <label>Start</label>
                      <input
                        type="time"
                        value={sup.timeStarted}
                        onChange={(e) => updateSupervision(index, 'timeStarted', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>End</label>
                      <input
                        type="time"
                        value={sup.timeEnded}
                        onChange={(e) => updateSupervision(index, 'timeEnded', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>Reg Hrs</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={sup.hours}
                        onChange={(e) => updateSupervision(index, 'hours', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>OT Hrs</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={sup.overtimeHours}
                        onChange={(e) => updateSupervision(index, 'overtimeHours', e.target.value)}
                      />
                    </div>
                  </div>
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
                <div key={index} className="tm-worker-card-expanded">
                  <div className="tm-worker-row-top">
                    <input
                      type="text"
                      placeholder="First & Last Name"
                      value={laborer.name}
                      onChange={(e) => updateLaborer(index, 'name', e.target.value)}
                      className="tm-worker-input"
                    />
                    <button className="tm-remove" onClick={() => removeLaborer(index)}>×</button>
                  </div>
                  <div className="tm-worker-row-bottom">
                    <div className="tm-time-group">
                      <label>Start</label>
                      <input
                        type="time"
                        value={laborer.timeStarted}
                        onChange={(e) => updateLaborer(index, 'timeStarted', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>End</label>
                      <input
                        type="time"
                        value={laborer.timeEnded}
                        onChange={(e) => updateLaborer(index, 'timeEnded', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>Reg Hrs</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={laborer.hours}
                        onChange={(e) => updateLaborer(index, 'hours', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>OT Hrs</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={laborer.overtimeHours}
                        onChange={(e) => updateLaborer(index, 'overtimeHours', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="tm-add-btn" onClick={addLaborer}>
              + Add Laborer
            </button>
          </div>

          {/* Description of Work */}
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

          {/* Photos Section */}
          <div className="tm-field">
            <label>
              📷 Photos 
              {maxPhotos !== -1 && (
                <span className="tm-photo-count">({photos.length}/{maxPhotos})</span>
              )}
            </label>
            {photos.length > 0 && (
              <div className="tm-photo-grid">
                {photos.map(photo => (
                  <div key={photo.id} className="tm-photo-item">
                    <img src={photo.previewUrl} alt={photo.name} />
                    <button className="tm-photo-remove" onClick={() => removePhoto(photo.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
            {(maxPhotos === -1 || photos.length < maxPhotos) && (
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
            )}
            {maxPhotos !== -1 && photos.length >= maxPhotos && (
              <div className="tm-photo-limit-reached">
                Photo limit reached ({maxPhotos} max)
              </div>
            )}
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
                  <img key={photo.id} src={photo.previewUrl} alt={photo.name} />
                ))}
              </div>
            </div>
          )}

          {validSupervision.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>👔 Supervision</span>
                <span>{validSupervision.reduce((sum, s) => sum + parseFloat(s.hours || 0) + parseFloat(s.overtimeHours || 0), 0)} hrs</span>
              </div>
              <div className="tm-review-list">
                {validSupervision.map((s, i) => (
                  <div key={i} className="tm-review-row-detailed">
                    <div className="tm-review-worker-name">
                      <span className="tm-role-badge">{s.role}</span> {s.name}
                    </div>
                    <div className="tm-review-worker-details">
                      {s.timeStarted && s.timeEnded && (
                        <span className="tm-review-time">{s.timeStarted} - {s.timeEnded}</span>
                      )}
                      <span className="tm-review-hours">{s.hours || 0} reg{parseFloat(s.overtimeHours) > 0 ? ` + ${s.overtimeHours} OT` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validLaborers.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>👷 Laborers</span>
                <span>{validLaborers.reduce((sum, l) => sum + parseFloat(l.hours || 0) + parseFloat(l.overtimeHours || 0), 0)} hrs</span>
              </div>
              <div className="tm-review-list">
                {validLaborers.map((l, i) => (
                  <div key={i} className="tm-review-row-detailed">
                    <div className="tm-review-worker-name">{l.name}</div>
                    <div className="tm-review-worker-details">
                      {l.timeStarted && l.timeEnded && (
                        <span className="tm-review-time">{l.timeStarted} - {l.timeEnded}</span>
                      )}
                      <span className="tm-review-hours">{l.hours || 0} reg{parseFloat(l.overtimeHours) > 0 ? ` + ${l.overtimeHours} OT` : ''}</span>
                    </div>
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

          {/* Submitted By - Certification */}
          <div className="tm-review-section tm-certification">
            <div className="tm-review-header">
              <span>✍️ Submitted By</span>
            </div>
            <input
              type="text"
              className="tm-certification-input"
              placeholder="Enter your name"
              value={submittedByName}
              onChange={(e) => setSubmittedByName(e.target.value)}
            />
            <p className="tm-certification-note">
              By submitting, you certify this T&M is accurate.
            </p>
          </div>
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
            {step === 1 ? `Next: Materials (${totalWorkers} workers, ${totalRegHours + totalOTHours} hrs)` : 
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


