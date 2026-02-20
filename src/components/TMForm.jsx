import { useState, useEffect } from 'react'
import { Globe, Check, Loader2, PenLine, AlertCircle, CheckCircle2 } from 'lucide-react'
import { db } from '../lib/supabase'
import { compressImage } from '../lib/imageUtils'
import { TRANSLATIONS } from './tm/translations'
import WorkDetailsStep from './tm/WorkDetailsStep'
import CrewHoursStep from './tm/CrewHoursStep'
import MaterialsStep from './tm/MaterialsStep'
import ReviewStep from './tm/ReviewStep'

// Generate secure random ID
const generateRandomId = () => {
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(36)).join('')
}

// Calculate hours from time range (auto-split into regular + OT)
const calculateHoursFromTimeRange = (startTime, endTime) => {
  if (!startTime || !endTime) return null

  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)

  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin)
  if (totalMinutes < 0) totalMinutes += 24 * 60 // Handle overnight

  const totalHours = totalMinutes / 60
  const regularHours = Math.min(totalHours, 8)
  const overtimeHours = Math.max(0, totalHours - 8)

  return {
    hours: regularHours.toFixed(1),
    overtimeHours: overtimeHours > 0 ? overtimeHours.toFixed(1) : ''
  }
}

export default function TMForm({ project, companyId, maxPhotos = 10, onSubmit, onCancel, onShowToast }) {
  const [step, setStep] = useState(1)
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0])

  // Post-submit signature state
  const [submittedTicket, setSubmittedTicket] = useState(null)
  const [showSignatureLinkModal, setShowSignatureLinkModal] = useState(false)
  const [showOnSiteSignature, setShowOnSiteSignature] = useState(false)
  const [clientSigned, setClientSigned] = useState(false)
  const [cePcoNumber, setCePcoNumber] = useState('')
  const [submittedByName, setSubmittedByName] = useState('')

  // COR assignment state
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

  // Same as Yesterday state
  const [loadingPreviousCrew, setLoadingPreviousCrew] = useState(false)

  // Language state
  const [lang, setLang] = useState('en')
  const t = (key) => TRANSLATIONS[lang][key] || key

  // Dynamic labor classes state
  const [laborCategories, setLaborCategories] = useState([])
  const [laborClasses, setLaborClasses] = useState([])
  const [dynamicWorkers, setDynamicWorkers] = useState({})
  const [loadingLaborClasses, setLoadingLaborClasses] = useState(true)
  const [activeLaborClassIds, setActiveLaborClassIds] = useState(new Set())

  const hasCustomLaborClasses = laborClasses.length > 0

  // Load today's crew and assignable CORs on mount
  useEffect(() => {
    loadTodaysCrew()
    loadAssignableCORs()

    const corSub = db.subscribeToCORs?.(project.id, () => {
      loadAssignableCORs()
    })

    return () => {
      corSub?.unsubscribe?.()
    }
  }, [project.id])

  // Load custom labor classes for the company
  useEffect(() => {
    const loadLaborClasses = async () => {
      if (!companyId) {
        setLoadingLaborClasses(false)
        return
      }

      try {
        const data = await db.getLaborClassesForField(companyId)
        setLaborCategories(data.categories || [])
        setLaborClasses(data.classes || [])
      } catch (err) {
        console.error('Error loading labor classes:', err)
      } finally {
        setLoadingLaborClasses(false)
      }
    }

    loadLaborClasses()
  }, [companyId])

  // Initialize labor classes based on today's crew check-in
  useEffect(() => {
    if (loadingLaborClasses || laborClasses.length === 0) return

    const crewLaborClassIds = new Set()
    todaysCrew.forEach(worker => {
      if (worker.labor_class_id) {
        crewLaborClassIds.add(worker.labor_class_id)
      }
    })

    const initialWorkers = {}
    const activeIds = new Set()

    crewLaborClassIds.forEach(classId => {
      if (laborClasses.some(lc => lc.id === classId)) {
        initialWorkers[classId] = [{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }]
        activeIds.add(classId)
      }
    })

    setDynamicWorkers(prev => {
      if (Object.keys(prev).length === 0) {
        return initialWorkers
      }
      return prev
    })

    setActiveLaborClassIds(prev => {
      if (prev.size === 0) {
        return activeIds
      }
      return prev
    })
  }, [laborClasses, todaysCrew, loadingLaborClasses])

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
    let updatedCount = 0

    if (hasCustomLaborClasses) {
      const updatedDynamic = {}
      Object.entries(dynamicWorkers).forEach(([classId, workers]) => {
        updatedDynamic[classId] = workers.map(w => {
          if (w && w.name && w.name.trim()) {
            updatedCount++
            return { ...w, timeStarted, timeEnded, hours, overtimeHours }
          }
          return w
        })
      })
      setDynamicWorkers(updatedDynamic)
    } else {
      setSupervision(supervision.map(s => {
        if (s && s.name && s.name.trim()) {
          updatedCount++
          return { ...s, timeStarted, timeEnded, hours, overtimeHours }
        }
        return s
      }))
      setOperators(operators.map(o => {
        if (o && o.name && o.name.trim()) {
          updatedCount++
          return { ...o, timeStarted, timeEnded, hours, overtimeHours }
        }
        return o
      }))
      setLaborers(laborers.map(l => {
        if (l && l.name && l.name.trim()) {
          updatedCount++
          return { ...l, timeStarted, timeEnded, hours, overtimeHours }
        }
        return l
      }))
    }

    setShowBatchHoursModal(false)
    setBatchHours({ timeStarted: '', timeEnded: '', hours: '', overtimeHours: '' })

    if (updatedCount > 0) {
      onShowToast(t('appliedHours').replace('{count}', updatedCount), 'success')
    } else {
      onShowToast(lang === 'en' ? 'Add workers first' : 'Agregue trabajadores primero', 'info')
    }
  }

  // Apply preset hours directly to all workers (inline, no modal)
  const applyInlinePreset = (preset) => {
    let timeStarted, timeEnded, hours, overtimeHours

    switch (preset) {
      case '8hr':
        timeStarted = '07:00'
        timeEnded = '15:30'
        hours = '8'
        overtimeHours = ''
        break
      case '10hr':
        timeStarted = '06:00'
        timeEnded = '16:30'
        hours = '8'
        overtimeHours = '2'
        break
      case '4hr':
        timeStarted = '07:00'
        timeEnded = '11:00'
        hours = '4'
        overtimeHours = ''
        break
      default:
        return
    }

    let count = 0

    if (hasCustomLaborClasses) {
      const updatedDynamic = {}
      Object.entries(dynamicWorkers).forEach(([classId, workers]) => {
        updatedDynamic[classId] = workers.map(w => {
          if (w && w.name && w.name.trim()) {
            count++
            return { ...w, timeStarted, timeEnded, hours, overtimeHours }
          }
          return w
        })
      })
      setDynamicWorkers(updatedDynamic)
    } else {
      setSupervision(prev => prev.map(s => {
        if (s && s.name && s.name.trim()) {
          count++
          return { ...s, timeStarted, timeEnded, hours, overtimeHours }
        }
        return s
      }))
      setOperators(prev => prev.map(o => {
        if (o && o.name && o.name.trim()) {
          count++
          return { ...o, timeStarted, timeEnded, hours, overtimeHours }
        }
        return o
      }))
      setLaborers(prev => prev.map(l => {
        if (l && l.name && l.name.trim()) {
          count++
          return { ...l, timeStarted, timeEnded, hours, overtimeHours }
        }
        return l
      }))
    }

    if (count > 0) {
      onShowToast(t('appliedHours').replace('{count}', count), 'success')
    } else {
      onShowToast(lang === 'en' ? 'Add workers first' : 'Agregue trabajadores primero', 'info')
    }
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

  // Load previous ticket's crew ("Same as Yesterday")
  const loadPreviousCrew = async () => {
    setLoadingPreviousCrew(true)
    try {
      const previousCrew = await db.getPreviousTicketCrew(project.id, workDate)

      if (!previousCrew || previousCrew.totalWorkers === 0) {
        onShowToast(t('noPreviousCrew'), 'info')
        return
      }

      if (hasCustomLaborClasses && previousCrew.dynamicWorkers) {
        setDynamicWorkers(previousCrew.dynamicWorkers)
      } else {
        if (previousCrew.supervision) {
          setSupervision(previousCrew.supervision)
        }
        if (previousCrew.operators) {
          setOperators(previousCrew.operators)
        }
        if (previousCrew.laborers) {
          setLaborers(previousCrew.laborers)
        }
      }

      const dateStr = new Date(previousCrew.workDate).toLocaleDateString()
      onShowToast(t('loadedWorkers').replace('{count}', previousCrew.totalWorkers).replace('{date}', dateStr), 'success')
    } catch (error) {
      console.error('Error loading previous crew:', error)
      onShowToast(lang === 'en' ? 'Error loading previous crew' : 'Error cargando equipo anterior', 'error')
    } finally {
      setLoadingPreviousCrew(false)
    }
  }

  // Supervision functions
  const addSupervisionFn = () => {
    setSupervision([...supervision, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
  }

  const updateSupervision = (index, field, value) => {
    setSupervision(supervision.map((s, i) => {
      if (i !== index) return s
      const updated = { ...s, [field]: value }
      if (field === 'timeStarted' || field === 'timeEnded') {
        const startTime = field === 'timeStarted' ? value : s.timeStarted
        const endTime = field === 'timeEnded' ? value : s.timeEnded
        const calculated = calculateHoursFromTimeRange(startTime, endTime)
        if (calculated) {
          updated.hours = calculated.hours
          updated.overtimeHours = calculated.overtimeHours
        }
      }
      return updated
    }))
  }

  const removeSupervision = (index) => {
    if (supervision.length > 1) {
      setSupervision(supervision.filter((_, i) => i !== index))
    } else {
      setSupervision([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
    }
  }

  // Laborer functions
  const addLaborerFn = () => {
    setLaborers([...laborers, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  }

  const updateLaborer = (index, field, value) => {
    setLaborers(laborers.map((l, i) => {
      if (i !== index) return l
      const updated = { ...l, [field]: value }
      if (field === 'timeStarted' || field === 'timeEnded') {
        const startTime = field === 'timeStarted' ? value : l.timeStarted
        const endTime = field === 'timeEnded' ? value : l.timeEnded
        const calculated = calculateHoursFromTimeRange(startTime, endTime)
        if (calculated) {
          updated.hours = calculated.hours
          updated.overtimeHours = calculated.overtimeHours
        }
      }
      return updated
    }))
  }

  const removeLaborer = (index) => {
    if (laborers.length > 1) {
      setLaborers(laborers.filter((_, i) => i !== index))
    } else {
      setLaborers([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
    }
  }

  // Operator functions
  const addOperatorFn = () => {
    setOperators([...operators, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  }

  const updateOperator = (index, field, value) => {
    setOperators(operators.map((o, i) => {
      if (i !== index) return o
      const updated = { ...o, [field]: value }
      if (field === 'timeStarted' || field === 'timeEnded') {
        const startTime = field === 'timeStarted' ? value : o.timeStarted
        const endTime = field === 'timeEnded' ? value : o.timeEnded
        const calculated = calculateHoursFromTimeRange(startTime, endTime)
        if (calculated) {
          updated.hours = calculated.hours
          updated.overtimeHours = calculated.overtimeHours
        }
      }
      return updated
    }))
  }

  const removeOperator = (index) => {
    if (operators.length > 1) {
      setOperators(operators.filter((_, i) => i !== index))
    } else {
      setOperators([{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
    }
  }

  // Dynamic worker functions (for custom labor classes)
  const addDynamicWorker = (classId) => {
    setDynamicWorkers(prev => ({
      ...prev,
      [classId]: [...(prev[classId] || []), { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }]
    }))
  }

  const updateDynamicWorker = (classId, index, field, value) => {
    setDynamicWorkers(prev => ({
      ...prev,
      [classId]: (prev[classId] || []).map((w, i) => {
        if (i !== index) return w
        const updated = { ...w, [field]: value }
        if (field === 'timeStarted' || field === 'timeEnded') {
          const startTime = field === 'timeStarted' ? value : w.timeStarted
          const endTime = field === 'timeEnded' ? value : w.timeEnded
          const calculated = calculateHoursFromTimeRange(startTime, endTime)
          if (calculated) {
            updated.hours = calculated.hours
            updated.overtimeHours = calculated.overtimeHours
          }
        }
        return updated
      })
    }))
  }

  const removeDynamicWorker = (classId, index) => {
    setDynamicWorkers(prev => {
      const workers = prev[classId] || []
      if (workers.length > 1) {
        return { ...prev, [classId]: workers.filter((_, i) => i !== index) }
      } else {
        return { ...prev, [classId]: [{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }] }
      }
    })
  }

  // Activate a labor class
  const activateLaborClass = (classId) => {
    if (!classId) return
    setActiveLaborClassIds(prev => new Set([...prev, classId]))
    setDynamicWorkers(prev => {
      if (!prev[classId] || prev[classId].length === 0) {
        return { ...prev, [classId]: [{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }] }
      }
      return prev
    })
  }

  // Remove a labor class from the visible list
  const deactivateLaborClass = (classId) => {
    setActiveLaborClassIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(classId)
      return newSet
    })
    setDynamicWorkers(prev => {
      const newWorkers = { ...prev }
      delete newWorkers[classId]
      return newWorkers
    })
  }

  // Get labor classes not currently active
  const getInactiveLaborClasses = () => {
    return laborClasses.filter(lc => !activeLaborClassIds.has(lc.id))
  }

  // Get all valid dynamic workers for submission
  const getValidDynamicWorkers = () => {
    if (!dynamicWorkers || typeof dynamicWorkers !== 'object') return []
    const allWorkers = []
    Object.entries(dynamicWorkers).forEach(([classId, workers]) => {
      if (!Array.isArray(workers)) return
      const laborClass = laborClasses.find(lc => lc.id === classId)
      workers.forEach(w => {
        if (w && w.name && w.name.trim() && (parseFloat(w.hours) > 0 || parseFloat(w.overtimeHours) > 0)) {
          allWorkers.push({
            name: w.name.trim(),
            hours: parseFloat(w.hours) || 0,
            overtime_hours: parseFloat(w.overtimeHours) || 0,
            time_started: w.timeStarted || null,
            time_ended: w.timeEnded || null,
            role: laborClass?.name || 'Worker',
            labor_class_id: classId
          })
        }
      })
    })
    return allWorkers
  }

  // Handle adding a crew worker from todaysCrew to the appropriate section
  const handleAddCrewWorker = (worker) => {
    const validLaborClass = worker.labor_class_id && hasCustomLaborClasses &&
      laborClasses.some(lc => lc.id === worker.labor_class_id)

    if (validLaborClass) {
      if (!activeLaborClassIds.has(worker.labor_class_id)) {
        setActiveLaborClassIds(prev => new Set([...prev, worker.labor_class_id]))
      }

      const classWorkers = dynamicWorkers[worker.labor_class_id] || []
      const emptyIndex = classWorkers.findIndex(w => !w || !w.name || !w.name.trim())
      if (emptyIndex >= 0) {
        const updated = [...classWorkers]
        updated[emptyIndex] = { ...updated[emptyIndex], name: worker.name }
        setDynamicWorkers(prev => ({ ...prev, [worker.labor_class_id]: updated }))
      } else {
        setDynamicWorkers(prev => ({
          ...prev,
          [worker.labor_class_id]: [...(prev[worker.labor_class_id] || []), {
            name: worker.name, hours: '', overtimeHours: '', timeStarted: '', timeEnded: ''
          }]
        }))
      }
    } else {
      const role = (worker.role || '').toLowerCase()

      if (role.includes('foreman') || role.includes('supervisor') || role.includes('superintendent')) {
        const emptySupIndex = supervision.findIndex(s => !s || !s.name || !s.name.trim())
        if (emptySupIndex >= 0) {
          updateSupervision(emptySupIndex, 'name', worker.name)
          updateSupervision(emptySupIndex, 'role', role.includes('superintendent') ? 'Superintendent' : 'Foreman')
        } else {
          setSupervision([...supervision, {
            name: worker.name, hours: '', overtimeHours: '', timeStarted: '', timeEnded: '',
            role: role.includes('superintendent') ? 'Superintendent' : 'Foreman'
          }])
        }
      } else if (role.includes('operator')) {
        const emptyOpIndex = operators.findIndex(o => !o || !o.name || !o.name.trim())
        if (emptyOpIndex >= 0) {
          updateOperator(emptyOpIndex, 'name', worker.name)
        } else {
          setOperators([...operators, { name: worker.name, hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
        }
      } else {
        const emptyLabIndex = laborers.findIndex(l => !l || !l.name || !l.name.trim())
        if (emptyLabIndex >= 0) {
          updateLaborer(emptyLabIndex, 'name', worker.name)
        } else {
          setLaborers([...laborers, { name: worker.name, hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
        }
      }
    }
    onShowToast(`Added ${worker.name}`, 'success')
  }

  // Photo functions
  const handlePhotoAdd = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const remainingSlots = maxPhotos === -1 ? Infinity : maxPhotos - photos.length
    if (remainingSlots <= 0) {
      onShowToast(`Photo limit reached (${maxPhotos} max)`, 'error')
      e.target.value = ''
      return
    }

    const filesToAdd = files.slice(0, remainingSlots)
    if (filesToAdd.length < files.length) {
      onShowToast(`Only ${filesToAdd.length} photo(s) added (${maxPhotos} max)`, 'error')
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024

    filesToAdd.forEach(file => {
      if (!file.type.startsWith('image/')) {
        onShowToast('Please select an image file', 'error')
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        onShowToast(`Photo too large: ${file.name} (max 10MB)`, 'error')
        return
      }

      const previewUrl = URL.createObjectURL(file)
      const tempId = `photo-${Date.now()}-${generateRandomId()}`
      setPhotos(prev => [...prev, {
        id: `${Date.now()}-${generateRandomId()}`,
        tempId: tempId,
        file: file,
        previewUrl: previewUrl,
        name: file.name,
        status: 'pending',
        attempts: 0,
        error: null,
        uploadedUrl: null
      }])
    })

    e.target.value = ''
  }

  const updatePhotoStatus = (photoId, updates) => {
    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, ...updates } : p
    ))
  }

  const retryPhotoUpload = async (photoId, ticketId) => {
    const photo = photos.find(p => p.id === photoId)
    if (!photo || photo.status !== 'failed') return

    updatePhotoStatus(photoId, { status: 'compressing', error: null })

    try {
      let fileToUpload = photo.file
      try {
        fileToUpload = await compressImage(photo.file)
      } catch (err) {
        console.warn('Compression failed, using original:', err)
      }

      updatePhotoStatus(photoId, { status: 'uploading' })

      const url = await db.uploadPhoto(companyId, project.id, ticketId, fileToUpload)

      updatePhotoStatus(photoId, {
        status: 'confirmed',
        uploadedUrl: url,
        attempts: photo.attempts + 1
      })

      await db.updateTMTicketPhotos(ticketId, [...photos.filter(p => p.uploadedUrl).map(p => p.uploadedUrl), url])

      onShowToast('Photo uploaded successfully', 'success')
    } catch (err) {
      console.error('Retry failed:', err)
      updatePhotoStatus(photoId, {
        status: 'failed',
        error: err.message || 'Upload failed',
        attempts: photo.attempts + 1
      })
      onShowToast('Photo retry failed', 'error')
    }
  }

  const removePhoto = (photoId) => {
    const photo = photos.find(p => p.id === photoId)
    if (photo?.previewUrl) {
      URL.revokeObjectURL(photo.previewUrl)
    }
    setPhotos(photos.filter(p => p.id !== photoId))
  }

  // Computed values for summaries
  const validSupervision = supervision.filter(s => s && s.name && s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
  const validOperators = operators.filter(o => o && o.name && o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
  const validLaborers = laborers.filter(l => l && l.name && l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
  const validDynamicWorkersList = getValidDynamicWorkers()

  const totalWorkers = hasCustomLaborClasses
    ? validDynamicWorkersList.length
    : validSupervision.length + validOperators.length + validLaborers.length
  const totalRegHours = hasCustomLaborClasses
    ? validDynamicWorkersList.reduce((sum, w) => sum + (w.hours || 0), 0)
    : [...validSupervision, ...validOperators, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.hours || 0), 0)
  const totalOTHours = hasCustomLaborClasses
    ? validDynamicWorkersList.reduce((sum, w) => sum + (w.overtime_hours || 0), 0)
    : [...validSupervision, ...validOperators, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.overtimeHours || 0), 0)

  const namedWorkers = hasCustomLaborClasses
    ? Object.values(dynamicWorkers || {}).flat().filter(w => w && w.name && w.name.trim())
    : [
        ...supervision.filter(s => s && s.name && s.name.trim()),
        ...operators.filter(o => o && o.name && o.name.trim()),
        ...laborers.filter(l => l && l.name && l.name.trim())
      ]
  const workersNeedingHours = namedWorkers.length - totalWorkers

  // Navigation
  const canGoNext = () => {
    if (step === 1) return notes.trim().length > 0
    if (step === 2) {
      if (hasCustomLaborClasses) return getValidDynamicWorkers().length > 0
      const hasSupervision = supervision.some(s => s && s.name && s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
      const hasOperators = operators.some(o => o && o.name && o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
      const hasLaborers = laborers.some(l => l && l.name && l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
      return hasSupervision || hasOperators || hasLaborers
    }
    return true
  }

  // Validation warnings
  const getValidationWarnings = () => {
    const warnings = []
    if (step === 1 && !notes.trim()) {
      warnings.push(lang === 'en' ? 'Description recommended' : 'Descripcion recomendada')
    }
    if (step === 2 && workersNeedingHours > 0) {
      warnings.push(lang === 'en' ? `${workersNeedingHours} worker(s) have no hours entered` : `${workersNeedingHours} trabajador(es) sin horas`)
    }
    if (step === 4 && !submittedByName.trim()) {
      warnings.push(lang === 'en' ? 'Name required to submit' : 'Nombre requerido')
    }
    return warnings
  }

  const validationWarnings = getValidationWarnings()

  const goNext = () => {
    if (step < 4) setStep(step + 1)
  }

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1)
    } else {
      onCancel()
    }
  }

  // Submit
  const handleSubmit = async () => {
    if (!submittedByName.trim()) {
      onShowToast('Enter your name to submit', 'error')
      return
    }

    let allWorkersForSubmit = []

    if (hasCustomLaborClasses) {
      allWorkersForSubmit = getValidDynamicWorkers()
      if (allWorkersForSubmit.length === 0) {
        onShowToast('Add at least one worker', 'error')
        return
      }
    } else {
      const vs = supervision.filter(s => s && s.name && s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
      const vo = operators.filter(o => o && o.name && o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
      const vl = laborers.filter(l => l && l.name && l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))

      if (vs.length === 0 && vo.length === 0 && vl.length === 0) {
        onShowToast('Add at least one worker', 'error')
        return
      }

      allWorkersForSubmit = [
        ...vs.map(s => ({ name: s.name.trim(), hours: parseFloat(s.hours) || 0, overtime_hours: parseFloat(s.overtimeHours) || 0, time_started: s.timeStarted || null, time_ended: s.timeEnded || null, role: s.role })),
        ...vo.map(o => ({ name: o.name.trim(), hours: parseFloat(o.hours) || 0, overtime_hours: parseFloat(o.overtimeHours) || 0, time_started: o.timeStarted || null, time_ended: o.timeEnded || null, role: 'Operator' })),
        ...vl.map(l => ({ name: l.name.trim(), hours: parseFloat(l.hours) || 0, overtime_hours: parseFloat(l.overtimeHours) || 0, time_started: l.timeStarted || null, time_ended: l.timeEnded || null, role: 'Laborer' }))
      ]
    }

    setSubmitting(true)
    setSubmitProgress('Creating ticket...')
    try {
      const ticket = await db.createTMTicket({
        project_id: project.id,
        work_date: workDate,
        ce_pco_number: cePcoNumber.trim() || null,
        assigned_cor_id: selectedCorId || null,
        notes: notes.trim() || null,
        photos: [],
        created_by_name: submittedByName.trim()
      })

      if (!ticket || !ticket.id) {
        throw new Error('Failed to create ticket - no ticket ID returned')
      }

      // Compress and upload photos
      let photoUrls = []
      const pendingPhotos = photos.filter(p => p.status === 'pending')
      if (pendingPhotos.length > 0) {
        setSubmitProgress(`Compressing ${pendingPhotos.length} photo${pendingPhotos.length > 1 ? 's' : ''}...`)
        pendingPhotos.forEach(p => updatePhotoStatus(p.id, { status: 'compressing' }))

        const compressedPhotos = await Promise.all(
          pendingPhotos.map(async (photo) => {
            try {
              const compressed = await compressImage(photo.file)
              return { ...photo, file: compressed }
            } catch (err) {
              console.warn(`Failed to compress photo ${photo.name}, using original:`, err)
              return photo
            }
          })
        )

        setSubmitProgress(`Uploading ${pendingPhotos.length} photo${pendingPhotos.length > 1 ? 's' : ''}...`)
        pendingPhotos.forEach(p => updatePhotoStatus(p.id, { status: 'uploading' }))

        let uploadedCount = 0
        let failedCount = 0
        const uploadPromises = compressedPhotos.map(async (photo) => {
          try {
            const url = await db.uploadPhoto(companyId, project.id, ticket.id, photo.file)
            uploadedCount++
            setSubmitProgress(`Uploading ${uploadedCount}/${pendingPhotos.length} photos...`)
            updatePhotoStatus(photo.id, { status: 'confirmed', uploadedUrl: url, attempts: (photo.attempts || 0) + 1 })
            return { id: photo.id, url }
          } catch (err) {
            console.error(`Photo ${photo.name} upload failed:`, err)
            failedCount++
            updatePhotoStatus(photo.id, { status: 'failed', error: err.message || 'Upload failed', attempts: (photo.attempts || 0) + 1 })
            return { id: photo.id, url: null, error: err.message }
          }
        })

        const results = await Promise.all(uploadPromises)
        photoUrls = results.filter(r => r.url !== null).map(r => r.url)

        if (failedCount > 0 && photoUrls.length > 0) {
          onShowToast(`${photoUrls.length}/${pendingPhotos.length} photos uploaded. ${failedCount} failed - can retry later.`, 'warning')
        } else if (failedCount > 0 && photoUrls.length === 0) {
          onShowToast(`All ${failedCount} photos failed to upload - can retry after submission.`, 'error')
        }
      }

      if (photoUrls.length > 0) {
        setSubmitProgress('Saving photos...')
        await db.updateTMTicketPhotos(ticket.id, photoUrls)
      }

      setSubmitProgress('Saving workers...')
      await db.addTMWorkers(ticket.id, allWorkersForSubmit)

      if (items.length > 0) {
        setSubmitProgress('Saving materials...')
        await db.addTMItems(ticket.id, items.map(item => ({
          material_equipment_id: item.material_equipment_id,
          custom_name: item.custom_name || null,
          custom_category: item.custom_category || null,
          quantity: item.quantity
        })))
      }

      if (selectedCorId) {
        setSubmitProgress('Importing to COR...')
        try {
          await db.importTicketDataToCOR(ticket.id, selectedCorId, companyId, project.work_type || null, project.job_type || 'standard')
        } catch (importError) {
          console.error('Error importing to COR:', importError)
          try {
            await db.markImportFailed(ticket.id, selectedCorId, importError?.message || 'Import failed')
          } catch (markError) {
            console.error('Error marking import failed:', markError)
          }
          onShowToast('T&M saved. COR data sync failed - retry from ticket list.', 'warning')
        }
      }

      photos.forEach(p => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })

      setSubmittedTicket(ticket)
      onShowToast('T&M submitted!', 'success')
      setStep(5)
    } catch (error) {
      console.error('Error submitting T&M:', error)
      onShowToast('Error submitting T&M', 'error')
    } finally {
      setSubmitting(false)
      setSubmitProgress('')
    }
  }

  return (
    <div className="tm-wizard">
      {/* Header */}
      <div className="tm-wizard-header">
        {step < 5 ? (
          <button className="tm-back-btn" onClick={goBack}>{'\u2190'}</button>
        ) : (
          <div className="tm-success-check"><CheckCircle2 size={24} /></div>
        )}
        <h2>
          {step === 1 && t('workInfo')}
          {step === 2 && t('crewHours')}
          {step === 3 && t('materialsEquipment')}
          {step === 4 && t('review')}
          {step === 5 && (lang === 'en' ? 'Submitted' : 'Enviado')}
        </h2>
        <div className="tm-header-right">
          {step < 4 && (
            <button
              className="tm-lang-toggle"
              onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
              title={lang === 'en' ? 'Cambiar a Espanol' : 'Switch to English'}
            >
              <Globe size={16} />
              {lang === 'en' ? 'ES' : 'EN'}
            </button>
          )}
          {step < 5 && (
            <div className="tm-step-dots">
              <span className={`tm-dot ${step >= 1 ? 'active' : ''}`}></span>
              <span className={`tm-dot ${step >= 2 ? 'active' : ''}`}></span>
              <span className={`tm-dot ${step >= 3 ? 'active' : ''}`}></span>
              <span className={`tm-dot ${step >= 4 ? 'active' : ''}`}></span>
            </div>
          )}
        </div>
      </div>

      {/* Step 1: Work Details */}
      {step === 1 && (
        <WorkDetailsStep
          project={project}
          workDate={workDate}
          setWorkDate={setWorkDate}
          cePcoNumber={cePcoNumber}
          setCePcoNumber={setCePcoNumber}
          notes={notes}
          setNotes={setNotes}
          t={t}
          lang={lang}
        />
      )}

      {/* Step 2: Crew & Hours */}
      {step === 2 && (
        <CrewHoursStep
          supervision={supervision}
          operators={operators}
          laborers={laborers}
          dynamicWorkers={dynamicWorkers}
          activeLaborClassIds={activeLaborClassIds}
          setActiveLaborClassIds={setActiveLaborClassIds}
          laborCategories={laborCategories}
          laborClasses={laborClasses}
          hasCustomLaborClasses={hasCustomLaborClasses}
          loadingLaborClasses={loadingLaborClasses}
          todaysCrew={todaysCrew}
          showBatchHoursModal={showBatchHoursModal}
          setShowBatchHoursModal={setShowBatchHoursModal}
          batchHours={batchHours}
          setBatchHours={setBatchHours}
          loadingPreviousCrew={loadingPreviousCrew}
          namedWorkers={namedWorkers}
          workersNeedingHours={workersNeedingHours}
          totalRegHours={totalRegHours}
          totalOTHours={totalOTHours}
          onLoadPreviousCrew={loadPreviousCrew}
          onApplyBatchHours={applyBatchHours}
          onApplyInlinePreset={applyInlinePreset}
          onAddCrewWorker={handleAddCrewWorker}
          onActivateLaborClass={activateLaborClass}
          onDeactivateLaborClass={deactivateLaborClass}
          addSupervision={addSupervisionFn}
          updateSupervision={updateSupervision}
          removeSupervision={removeSupervision}
          addOperator={addOperatorFn}
          updateOperator={updateOperator}
          removeOperator={removeOperator}
          addLaborer={addLaborerFn}
          updateLaborer={updateLaborer}
          removeLaborer={removeLaborer}
          addDynamicWorker={addDynamicWorker}
          updateDynamicWorker={updateDynamicWorker}
          removeDynamicWorker={removeDynamicWorker}
          getInactiveLaborClasses={getInactiveLaborClasses}
          t={t}
          lang={lang}
          onShowToast={onShowToast}
        />
      )}

      {/* Step 3: Materials & Equipment */}
      {step === 3 && (
        <MaterialsStep
          companyId={companyId}
          items={items}
          setItems={setItems}
          t={t}
          lang={lang}
          onShowToast={onShowToast}
        />
      )}

      {/* Step 4: Review + Evidence / Step 5: Success & Signature */}
      {(step === 4 || step === 5) && (
        <ReviewStep
          step={step}
          setStep={setStep}
          project={project}
          companyId={companyId}
          workDate={workDate}
          cePcoNumber={cePcoNumber}
          notes={notes}
          photos={photos}
          onPhotoAdd={handlePhotoAdd}
          onRemovePhoto={removePhoto}
          maxPhotos={maxPhotos}
          selectedCorId={selectedCorId}
          setSelectedCorId={setSelectedCorId}
          assignableCORs={assignableCORs}
          items={items}
          hasCustomLaborClasses={hasCustomLaborClasses}
          validDynamicWorkersList={validDynamicWorkersList}
          validSupervision={validSupervision}
          validOperators={validOperators}
          validLaborers={validLaborers}
          totalWorkers={totalWorkers}
          totalRegHours={totalRegHours}
          totalOTHours={totalOTHours}
          submittedByName={submittedByName}
          setSubmittedByName={setSubmittedByName}
          submittedTicket={submittedTicket}
          submitting={submitting}
          submitProgress={submitProgress}
          clientSigned={clientSigned}
          setClientSigned={setClientSigned}
          showSignatureLinkModal={showSignatureLinkModal}
          setShowSignatureLinkModal={setShowSignatureLinkModal}
          showOnSiteSignature={showOnSiteSignature}
          setShowOnSiteSignature={setShowOnSiteSignature}
          onRetryPhotoUpload={retryPhotoUpload}
          t={t}
          lang={lang}
          onShowToast={onShowToast}
        />
      )}

      {/* Footer */}
      {step < 5 && (
        <div className="tm-wizard-footer">
          {validationWarnings.length > 0 && (
            <div className="tm-validation-summary">
              <AlertCircle size={16} />
              <span>{validationWarnings[0]}</span>
            </div>
          )}

          {step === 1 && (
            <button className="tm-big-btn primary" onClick={goNext} disabled={!canGoNext()}>
              {t('nextCrew')}
            </button>
          )}

          {step === 2 && (
            <button className="tm-big-btn primary" onClick={goNext} disabled={!canGoNext()}>
              {t('nextMaterials')} ({totalWorkers} {totalWorkers === 1 ? t('worker') : t('workers_plural')}, {totalRegHours + totalOTHours} hrs)
            </button>
          )}

          {step === 3 && (
            <>
              <button className="tm-big-btn primary" onClick={goNext}>
                {lang === 'en' ? 'Review & Submit' : 'Revisar y Enviar'} ({items.length} {items.length === 1 ? t('item') : t('items_plural')})
              </button>
              <button className="tm-skip-btn" onClick={goNext}>
                {t('skipNoMaterials')}
              </button>
            </>
          )}

          {step === 4 && (
            <button
              className={`tm-big-btn submit ${submitting ? 'submitting' : ''} ${!submittedByName.trim() ? 'needs-name' : 'ready'}`}
              onClick={handleSubmit}
              disabled={submitting || !submittedByName.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 size={20} className="tm-spinner" />
                  <span className="tm-submit-text">{submitProgress || t('submitting')}</span>
                </>
              ) : !submittedByName.trim() ? (
                <>
                  <PenLine size={18} />
                  <span>{lang === 'en' ? 'Enter name to submit' : 'Ingrese nombre'}</span>
                </>
              ) : (
                <>
                  <Check size={20} />
                  <span>{t('submitTM')}</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Step 5: Success Footer */}
      {step === 5 && (
        <div className="tm-wizard-footer">
          <button className="tm-big-btn primary" onClick={onSubmit}>
            <Check size={20} />
            <span>{lang === 'en' ? 'Done' : 'Listo'}</span>
          </button>
          <button className="tm-skip-btn" onClick={onSubmit}>
            {lang === 'en' ? 'Skip signature for now' : 'Saltar firma por ahora'}
          </button>
        </div>
      )}
    </div>
  )
}
