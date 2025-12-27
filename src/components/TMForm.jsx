import { useState, useEffect } from 'react'
import { HardHat, FileText, Wrench, PenLine, Camera, UserCheck, Zap, RefreshCw, Clock } from 'lucide-react'
import { db } from '../lib/supabase'
import { compressImage } from '../lib/imageUtils'

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']

export default function TMForm({ project, companyId, maxPhotos = 10, onSubmit, onCancel, onShowToast }) {
  const [step, setStep] = useState(1) // 1: Workers, 2: Items, 3: Review
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0])
  const [cePcoNumber, setCePcoNumber] = useState('')
  const [submittedByName, setSubmittedByName] = useState('') // Foreman's name for certification

  // COR assignment state - allows T&M tickets to be linked directly to a Change Order Request
  const [selectedCorId, setSelectedCorId] = useState('')
  const [assignableCORs, setAssignableCORs] = useState([])
  const [loadingCORs, setLoadingCORs] = useState(false)

  // Batch hours modal state
  const [showBatchHoursModal, setShowBatchHoursModal] = useState(false)
  const [batchHours, setBatchHours] = useState({ timeStarted: '', timeEnded: '', hours: '', overtimeHours: '' })
  const [supervision, setSupervision] = useState([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
  const [operators, setOperators] = useState([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  const [laborers, setLaborers] = useState([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitProgress, setSubmitProgress] = useState('')
  
  // Crew check-in state
  const [todaysCrew, setTodaysCrew] = useState([])
  const [showCrewPicker, setShowCrewPicker] = useState(false)
  
  // Item picker state
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryItems, setCategoryItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customItem, setCustomItem] = useState({ name: '', category: '', quantity: '' })

  // Load today's crew and assignable CORs on mount
  useEffect(() => {
    loadTodaysCrew()
    loadAssignableCORs()
  }, [project.id])

  // Load all CORs that can receive T&M tickets
  const loadAssignableCORs = async () => {
    setLoadingCORs(true)
    try {
      const cors = await db.getAssignableCORs(project.id)
      setAssignableCORs(cors || [])
    } catch (err) {
      console.error('Error loading assignable CORs:', err)
    } finally {
      setLoadingCORs(false)
    }
  }

  // Apply batch hours to all workers with names
  const applyBatchHours = () => {
    const { timeStarted, timeEnded, hours, overtimeHours } = batchHours

    // Apply to supervision
    setSupervision(supervision.map(s =>
      s.name.trim() ? { ...s, timeStarted, timeEnded, hours, overtimeHours } : s
    ))

    // Apply to operators
    setOperators(operators.map(o =>
      o.name.trim() ? { ...o, timeStarted, timeEnded, hours, overtimeHours } : o
    ))

    // Apply to laborers
    setLaborers(laborers.map(l =>
      l.name.trim() ? { ...l, timeStarted, timeEnded, hours, overtimeHours } : l
    ))

    // Count how many workers were updated
    const updatedCount = [
      ...supervision.filter(s => s.name.trim()),
      ...operators.filter(o => o.name.trim()),
      ...laborers.filter(l => l.name.trim())
    ].length

    setShowBatchHoursModal(false)
    setBatchHours({ timeStarted: '', timeEnded: '', hours: '', overtimeHours: '' })
    onShowToast(`Applied hours to ${updatedCount} worker${updatedCount !== 1 ? 's' : ''}`, 'success')
  }

  const loadTodaysCrew = async () => {
    try {
      const checkin = await db.getCrewCheckin(project.id)
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

  // Operator functions
  const addOperator = () => {
    setOperators([...operators, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  }

  const updateOperator = (index, field, value) => {
    setOperators(operators.map((o, i) =>
      i === index ? { ...o, [field]: value } : o
    ))
  }

  const removeOperator = (index) => {
    if (operators.length > 1) {
      setOperators(operators.filter((_, i) => i !== index))
    } else {
      setOperators([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
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

  // Photo functions - store files temporarily, upload on submit
  const handlePhotoAdd = (e) => {
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

    filesToAdd.forEach(file => {
      if (!file.type.startsWith('image/')) {
        onShowToast('Please select an image file', 'error')
        return
      }

      // Create preview URL and store file for upload
      const previewUrl = URL.createObjectURL(file)
      setPhotos(prev => [...prev, {
        id: Date.now() + Math.random(),
        file: file,
        previewUrl: previewUrl,
        name: file.name
      }])
    })
    
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
      // At least one supervision, operator, or laborer with name and hours (regular or OT)
      const hasSupervision = supervision.some(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
      const hasOperators = operators.some(o => o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
      const hasLaborers = laborers.some(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
      return hasSupervision || hasOperators || hasLaborers
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
    const validOperators = operators.filter(o => o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
    const validLaborers = laborers.filter(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))

    if (validSupervision.length === 0 && validOperators.length === 0 && validLaborers.length === 0) {
      onShowToast('Add at least one worker', 'error')
      return
    }

    setSubmitting(true)
    setSubmitProgress('Creating ticket...')
    try {
      // Create ticket first (to get ticket ID for photo paths)
      // If a COR is selected, the ticket will be linked via assigned_cor_id
      const ticket = await db.createTMTicket({
        project_id: project.id,
        work_date: workDate,
        ce_pco_number: cePcoNumber.trim() || null,
        assigned_cor_id: selectedCorId || null,
        notes: notes.trim() || null,
        photos: [], // Will update after uploading
        created_by_name: submittedByName.trim()
      })

      // Compress and upload photos in PARALLEL for speed
      let photoUrls = []
      if (photos.length > 0) {
        // Compress photos first
        setSubmitProgress(`Compressing ${photos.length} photo${photos.length > 1 ? 's' : ''}...`)

        const compressedPhotos = await Promise.all(
          photos.map(async (photo, idx) => {
            try {
              const compressed = await compressImage(photo.file)
              return { ...photo, file: compressed }
            } catch (err) {
              console.warn(`Failed to compress photo ${idx + 1}, using original:`, err)
              return photo
            }
          })
        )

        // Upload compressed photos
        setSubmitProgress(`Uploading ${photos.length} photo${photos.length > 1 ? 's' : ''}...`)

        let uploadedCount = 0
        const uploadPromises = compressedPhotos.map(async (photo, idx) => {
          try {
            const url = await db.uploadPhoto(companyId, project.id, ticket.id, photo.file)
            uploadedCount++
            setSubmitProgress(`Uploading ${uploadedCount}/${photos.length} photos...`)
            console.log(`Photo ${idx + 1} uploaded successfully:`, url)
            return url
          } catch (err) {
            console.error(`Photo ${idx + 1} upload failed:`, err)
            onShowToast(`Photo ${idx + 1} failed to upload`, 'error')
            return null
          }
        })

        const results = await Promise.all(uploadPromises)
        photoUrls = results.filter(url => url !== null)

        // Notify if some photos failed
        if (photoUrls.length < photos.length && photoUrls.length > 0) {
          onShowToast(`${photoUrls.length}/${photos.length} photos uploaded`, 'warning')
        }
      }

      // Update ticket with photo URLs if any were uploaded
      if (photoUrls.length > 0) {
        setSubmitProgress('Saving photos...')
        await db.updateTMTicketPhotos(ticket.id, photoUrls)
      }

      // Combine supervision, operators, and laborers for workers table
      const allWorkers = [
        ...validSupervision.map(s => ({
          name: s.name.trim(),
          hours: parseFloat(s.hours) || 0,
          overtime_hours: parseFloat(s.overtimeHours) || 0,
          time_started: s.timeStarted || null,
          time_ended: s.timeEnded || null,
          role: s.role
        })),
        ...validOperators.map(o => ({
          name: o.name.trim(),
          hours: parseFloat(o.hours) || 0,
          overtime_hours: parseFloat(o.overtimeHours) || 0,
          time_started: o.timeStarted || null,
          time_ended: o.timeEnded || null,
          role: 'Operator'
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

      setSubmitProgress('Saving workers...')
      await db.addTMWorkers(ticket.id, allWorkers)

      if (items.length > 0) {
        setSubmitProgress('Saving materials...')
        await db.addTMItems(ticket.id, items.map(item => ({
          material_equipment_id: item.material_equipment_id,
          custom_name: item.custom_name || null,
          custom_category: item.custom_category || null,
          quantity: item.quantity
        })))
      }

      // Auto-import T&M data into selected COR if one was chosen
      // This populates the COR with labor and material line items from this ticket
      if (selectedCorId) {
        setSubmitProgress('Importing to COR...')
        try {
          await db.importTicketDataToCOR(
            ticket.id,
            selectedCorId,
            companyId,
            project.work_type || 'demolition',
            project.job_type || 'standard'
          )
        } catch (importError) {
          // Log error but don't fail the whole submission
          console.error('Error importing to COR:', importError)
          onShowToast('T&M saved, but COR import failed', 'warning')
        }
      }

      // Clean up preview URLs
      photos.forEach(p => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })

      onShowToast('T&M submitted!', 'success')
      onSubmit()
    } catch (error) {
      console.error('Error submitting T&M:', error)
      onShowToast('Error submitting T&M', 'error')
    } finally {
      setSubmitting(false)
      setSubmitProgress('')
    }
  }

  // Get total workers and hours for summary
  const validSupervision = supervision.filter(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
  const validOperators = operators.filter(o => o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
  const validLaborers = laborers.filter(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
  const totalWorkers = validSupervision.length + validOperators.length + validLaborers.length
  const totalRegHours = [...validSupervision, ...validOperators, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.hours || 0), 0)
  const totalOTHours = [...validSupervision, ...validOperators, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.overtimeHours || 0), 0)
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

          {/* COR Assignment - Link T&M directly to a Change Order Request */}
          <div className="tm-field">
            <label>Link to Change Order Request (Optional)</label>
            <div className="tm-cor-row">
              <select
                value={selectedCorId}
                onChange={(e) => setSelectedCorId(e.target.value)}
                className="tm-input tm-select"
              >
                <option value="">-- No COR --</option>
                {assignableCORs.map(cor => (
                  <option key={cor.id} value={cor.id}>
                    {cor.cor_number}: {cor.title || 'Untitled'} ({cor.status})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="tm-refresh-btn"
                onClick={loadAssignableCORs}
                disabled={loadingCORs}
                title="Refresh COR list"
              >
                <RefreshCw size={16} className={loadingCORs ? 'spinning' : ''} />
              </button>
            </div>
            <span className="tm-field-hint">
              T&M data will be imported into the selected COR
            </span>
          </div>

          {/* Select from Today's Crew */}
          {todaysCrew.length > 0 && (
            <div className="tm-crew-picker">
              <button 
                className="tm-crew-picker-btn"
                onClick={() => setShowCrewPicker(!showCrewPicker)}
              >
                <HardHat size={16} /> {showCrewPicker ? 'Hide' : 'Select from'} Today's Crew ({todaysCrew.length})
              </button>
              
              {showCrewPicker && (
                <div className="tm-crew-list">
                  {todaysCrew.map((worker, index) => {
                    const isAdded =
                      supervision.some(s => s.name.toLowerCase() === worker.name.toLowerCase()) ||
                      operators.some(o => o.name.toLowerCase() === worker.name.toLowerCase()) ||
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
                          } else if (worker.role === 'Operator') {
                            // Add to operators
                            const emptyOpIndex = operators.findIndex(o => !o.name.trim())
                            if (emptyOpIndex >= 0) {
                              updateOperator(emptyOpIndex, 'name', worker.name)
                            } else {
                              setOperators([...operators, {
                                name: worker.name,
                                hours: '',
                                overtimeHours: '',
                                timeStarted: '',
                                timeEnded: ''
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
                        <span className={`tm-crew-item-role ${(worker.role || 'laborer').toLowerCase()}`}>
                          {worker.role || 'Laborer'}
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

          {/* Operators Section */}
          <div className="tm-field">
            <label>Operators</label>
            <div className="tm-workers-list">
              {operators.map((operator, index) => (
                <div key={index} className="tm-worker-card-expanded">
                  <div className="tm-worker-row-top">
                    <input
                      type="text"
                      placeholder="First & Last Name"
                      value={operator.name}
                      onChange={(e) => updateOperator(index, 'name', e.target.value)}
                      className="tm-worker-input"
                    />
                    <button className="tm-remove" onClick={() => removeOperator(index)}>×</button>
                  </div>
                  <div className="tm-worker-row-bottom">
                    <div className="tm-time-group">
                      <label>Start</label>
                      <input
                        type="time"
                        value={operator.timeStarted}
                        onChange={(e) => updateOperator(index, 'timeStarted', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>End</label>
                      <input
                        type="time"
                        value={operator.timeEnded}
                        onChange={(e) => updateOperator(index, 'timeEnded', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>Reg Hrs</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={operator.hours}
                        onChange={(e) => updateOperator(index, 'hours', e.target.value)}
                      />
                    </div>
                    <div className="tm-time-group">
                      <label>OT Hrs</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={operator.overtimeHours}
                        onChange={(e) => updateOperator(index, 'overtimeHours', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="tm-add-btn" onClick={addOperator}>
              + Add Operator
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

          {/* Batch Hours Button */}
          <button
            type="button"
            className="tm-batch-hours-btn"
            onClick={() => setShowBatchHoursModal(true)}
          >
            <Clock size={16} /> Apply Same Hours to All
          </button>

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
              <Camera size={16} className="inline-icon" /> Photos 
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
                <Camera size={16} className="inline-icon" /> {photos.length > 0 ? 'Add More Photos' : 'Add Photos'}
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
                <span><FileText size={16} className="inline-icon" /> Description</span>
              </div>
              <div className="tm-review-notes">{notes}</div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span><Camera size={16} className="inline-icon" /> Photos</span>
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
                <span><UserCheck size={16} className="inline-icon" /> Supervision</span>
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

          {validOperators.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span>🚜 Operators</span>
                <span>{validOperators.reduce((sum, o) => sum + parseFloat(o.hours || 0) + parseFloat(o.overtimeHours || 0), 0)} hrs</span>
              </div>
              <div className="tm-review-list">
                {validOperators.map((o, i) => (
                  <div key={i} className="tm-review-row-detailed">
                    <div className="tm-review-worker-name">{o.name}</div>
                    <div className="tm-review-worker-details">
                      {o.timeStarted && o.timeEnded && (
                        <span className="tm-review-time">{o.timeStarted} - {o.timeEnded}</span>
                      )}
                      <span className="tm-review-hours">{o.hours || 0} reg{parseFloat(o.overtimeHours) > 0 ? ` + ${o.overtimeHours} OT` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validLaborers.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-header">
                <span><HardHat size={16} className="inline-icon" /> Laborers</span>
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
                <span><Wrench size={16} className="inline-icon" /> Materials & Equipment</span>
                <span>{items.length} items</span>
              </div>
              <div className="tm-review-list">
                {items.map((item, i) => (
                  <div key={i} className="tm-review-row">
                    <span>{item.isCustom && <><Zap size={14} className="inline-icon" /> </>}{item.name}</span>
                    <span>{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submitted By - Certification */}
          <div className="tm-review-section tm-certification">
            <div className="tm-review-header">
              <span><PenLine size={16} className="inline-icon" /> Submitted By</span>
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
            {submitting ? submitProgress || 'Submitting...' : '✓ Submit T&M'}
          </button>
        )}
        
        {step === 2 && (
          <button className="tm-skip-btn" onClick={goNext}>
            Skip (no materials)
          </button>
        )}
      </div>

      {/* Batch Hours Modal */}
      {showBatchHoursModal && (
        <div className="tm-modal-overlay" onClick={() => setShowBatchHoursModal(false)}>
          <div className="tm-batch-modal" onClick={(e) => e.stopPropagation()}>
            <h3><Clock size={18} /> Apply Same Hours</h3>
            <p className="tm-batch-description">
              Set hours for all workers with names entered. Individual times can still be adjusted afterwards.
            </p>

            <div className="tm-batch-form">
              <div className="tm-batch-row">
                <div className="tm-batch-field">
                  <label>Start Time</label>
                  <input
                    type="time"
                    value={batchHours.timeStarted}
                    onChange={(e) => setBatchHours({ ...batchHours, timeStarted: e.target.value })}
                  />
                </div>
                <div className="tm-batch-field">
                  <label>End Time</label>
                  <input
                    type="time"
                    value={batchHours.timeEnded}
                    onChange={(e) => setBatchHours({ ...batchHours, timeEnded: e.target.value })}
                  />
                </div>
              </div>
              <div className="tm-batch-row">
                <div className="tm-batch-field">
                  <label>Regular Hours</label>
                  <input
                    type="number"
                    placeholder="8"
                    value={batchHours.hours}
                    onChange={(e) => setBatchHours({ ...batchHours, hours: e.target.value })}
                  />
                </div>
                <div className="tm-batch-field">
                  <label>OT Hours</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={batchHours.overtimeHours}
                    onChange={(e) => setBatchHours({ ...batchHours, overtimeHours: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="tm-batch-preview">
              <strong>Will apply to:</strong>
              <span>
                {[
                  ...supervision.filter(s => s.name.trim()),
                  ...operators.filter(o => o.name.trim()),
                  ...laborers.filter(l => l.name.trim())
                ].length} worker(s) with names entered
              </span>
            </div>

            <div className="tm-batch-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowBatchHoursModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={applyBatchHours}
                disabled={!batchHours.hours && !batchHours.overtimeHours}
              >
                Apply Hours
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


