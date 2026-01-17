import { useState, useEffect, useRef } from 'react'
import { HardHat, FileText, Wrench, PenLine, Camera, UserCheck, Zap, RefreshCw, Clock, Copy, Globe, Check, Loader2, Send, Link, ExternalLink, CheckCircle2, Search, AlertCircle, RotateCcw } from 'lucide-react'
import { db } from '../lib/supabase'
import { compressImage } from '../lib/imageUtils'
import SignatureLinkGenerator from './SignatureLinkGenerator'
import TMClientSignature from './TMClientSignature'

// Generate secure random ID
const generateRandomId = () => {
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(36)).join('')
}

const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']

// Translations for English and Spanish
const TRANSLATIONS = {
  en: {
    // Steps
    workInfo: 'Work Details',
    crewHours: 'Crew & Hours',
    materialsEquipment: 'Materials',
    evidence: 'Evidence',
    review: 'Review',

    // Quick Actions
    quickActions: 'Quick Actions',
    sameAsYesterday: 'Same as Yesterday',
    setCrewHours: 'Set Crew Hours',
    loading: 'Loading...',

    // Worker sections
    supervision: 'Supervision',
    operators: 'Operators',
    laborers: 'Laborers',
    addSupervision: '+ Add Supervision',
    addOperator: '+ Add Operator',
    addLaborer: '+ Add Laborer',

    // Worker fields
    foreman: 'Foreman',
    superintendent: 'Superintendent',
    firstLastName: 'First & Last Name',
    start: 'Start',
    end: 'End',
    regHrs: 'Reg Hrs',
    otHrs: 'OT Hrs',

    // Materials
    selectCategory: 'Select a category:',
    addCustomItem: '+ Add Custom Item',
    customItem: 'Custom Item',
    itemName: 'Item Name',
    category: 'Category',
    quantity: 'Quantity',
    addItem: 'Add Item',
    cancel: 'Cancel',
    noItemsCategory: 'No items in this category yet',

    // Review
    workDate: 'Work Date',
    ceNumber: 'CE/PCO #',
    optional: 'optional',
    linkedCOR: 'Link to Change Order',
    selectCOR: 'Select COR (optional)',
    noCORs: 'No pending CORs',
    laborSummary: 'Labor Summary',
    worker: 'worker',
    workers_plural: 'workers',
    totalHours: 'Total Hours',
    regular: 'Regular',
    overtime: 'Overtime',
    materials: 'Materials',
    item: 'item',
    items_plural: 'items',
    noMaterials: 'No materials added',
    notes: 'Notes',
    addNotes: 'Add notes about the work performed...',
    photos: 'Photos',
    addPhotos: 'Add Photos',
    maxPhotos: 'max',
    noPhotos: 'No photos added',
    certification: 'Certification',
    certifyStatement: 'I certify that this T&M ticket accurately reflects the work performed.',
    foremanSignature: "Foreman's Name (Signature)",
    yourName: 'Your name',

    // Work Info step
    describeWork: 'Describe the work performed',
    descriptionRequired: 'Description is required',
    whatWorkPerformed: 'What work was performed today?',

    // Materials search
    searchMaterials: 'Search materials & equipment...',
    noSearchResults: 'No items found',
    orBrowse: 'Or browse by category:',

    // Navigation
    back: 'Back',
    next: 'Next',
    nextCrew: 'Next: Crew',
    nextMaterials: 'Next: Materials',
    reviewItems: 'Review',
    skipNoMaterials: 'Skip (no materials)',
    submitTM: 'Submit T&M',
    submitting: 'Submitting...',

    // Batch hours modal
    applySameHours: 'Apply Same Hours',
    batchDescription: 'Set start/end time and hours for all workers with names entered.',
    timeStarted: 'Time Started',
    timeEnded: 'Time Ended',
    regularHours: 'Regular Hours',
    overtimeHours: 'Overtime Hours',
    willApplyTo: 'Will apply to',
    applyToAll: 'Apply to All',

    // Time presets
    preset8hr: '8hr Day',
    preset10hr: '10hr Day',
    preset4hr: '4hr Day',

    // Toast messages
    loadedWorkers: 'Loaded {count} workers from {date}',
    noPreviousCrew: 'No previous crew found for this project',
    appliedHours: 'Applied hours to {count} worker(s)',

    // COR
    assignedToCOR: 'Assigned to COR'
  },
  es: {
    // Steps
    workInfo: 'Info del Trabajo',
    crewHours: 'Cuadrilla y Horas',
    materialsEquipment: 'Materiales',
    evidence: 'Evidencia',
    review: 'Revisar',

    // Quick Actions
    quickActions: 'Acciones Rapidas',
    sameAsYesterday: 'Igual que Ayer',
    setCrewHours: 'Poner Horas',
    loading: 'Cargando...',

    // Worker sections
    supervision: 'Supervision',
    operators: 'Operadores',
    laborers: 'Trabajadores',
    addSupervision: '+ Agregar Supervision',
    addOperator: '+ Agregar Operador',
    addLaborer: '+ Agregar Trabajador',

    // Worker fields
    foreman: 'Capataz',
    superintendent: 'Superintendente',
    firstLastName: 'Nombre y Apellido',
    start: 'Inicio',
    end: 'Fin',
    regHrs: 'Hrs Reg',
    otHrs: 'Hrs Extra',

    // Materials
    selectCategory: 'Seleccione una categoria:',
    addCustomItem: '+ Agregar Articulo',
    customItem: 'Articulo Personalizado',
    itemName: 'Nombre del Articulo',
    category: 'Categoria',
    quantity: 'Cantidad',
    addItem: 'Agregar',
    cancel: 'Cancelar',
    noItemsCategory: 'No hay articulos en esta categoria',

    // Review
    workDate: 'Fecha de Trabajo',
    ceNumber: 'CE/PCO #',
    optional: 'opcional',
    linkedCOR: 'Vincular a Orden de Cambio',
    selectCOR: 'Seleccionar COR (opcional)',
    noCORs: 'No hay CORs pendientes',
    laborSummary: 'Resumen de Mano de Obra',
    worker: 'trabajador',
    workers_plural: 'trabajadores',
    totalHours: 'Horas Totales',
    regular: 'Regular',
    overtime: 'Extra',
    materials: 'Materiales',
    item: 'articulo',
    items_plural: 'articulos',
    noMaterials: 'No se agregaron materiales',
    notes: 'Notas',
    addNotes: 'Agregar notas sobre el trabajo realizado...',
    photos: 'Fotos',
    addPhotos: 'Agregar Fotos',
    maxPhotos: 'max',
    noPhotos: 'No se agregaron fotos',
    certification: 'Certificacion',
    certifyStatement: 'Certifico que este ticket T&M refleja con precision el trabajo realizado.',
    foremanSignature: 'Nombre del Capataz (Firma)',
    yourName: 'Su nombre',

    // Work Info step
    describeWork: 'Describir el trabajo realizado',
    descriptionRequired: 'Descripcion es requerida',
    whatWorkPerformed: 'Que trabajo se realizo hoy?',

    // Materials search
    searchMaterials: 'Buscar materiales y equipo...',
    noSearchResults: 'No se encontraron articulos',
    orBrowse: 'O navegar por categoria:',

    // Navigation
    back: 'Atras',
    next: 'Siguiente',
    nextCrew: 'Siguiente: Cuadrilla',
    nextMaterials: 'Siguiente: Materiales',
    reviewItems: 'Revisar',
    skipNoMaterials: 'Saltar (sin materiales)',
    submitTM: 'Enviar T&M',
    submitting: 'Enviando...',

    // Batch hours modal
    applySameHours: 'Aplicar Mismas Horas',
    batchDescription: 'Establezca hora de inicio/fin y horas para todos los trabajadores.',
    timeStarted: 'Hora de Inicio',
    timeEnded: 'Hora de Fin',
    regularHours: 'Horas Regulares',
    overtimeHours: 'Horas Extra',
    willApplyTo: 'Se aplicara a',
    applyToAll: 'Aplicar a Todos',

    // Time presets
    preset8hr: 'Dia 8hr',
    preset10hr: 'Dia 10hr',
    preset4hr: 'Dia 4hr',

    // Toast messages
    loadedWorkers: 'Se cargaron {count} trabajadores del {date}',
    noPreviousCrew: 'No se encontro equipo anterior para este proyecto',
    appliedHours: 'Horas aplicadas a {count} trabajador(es)',

    // COR
    assignedToCOR: 'Asignado a COR'
  }
}

export default function TMForm({ project, companyId, maxPhotos = 10, onSubmit, onCancel, onShowToast }) {
  const [step, setStep] = useState(1) // 1: Work Details, 2: Crew & Hours, 3: Materials, 4: Evidence & Linkage, 5: Review, 6: Success/Signature
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0])

  // Post-submit signature state
  const [submittedTicket, setSubmittedTicket] = useState(null)
  const [showSignatureLinkModal, setShowSignatureLinkModal] = useState(false)
  const [showOnSiteSignature, setShowOnSiteSignature] = useState(false)
  const [clientSigned, setClientSigned] = useState(false)
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
  const [materialSearch, setMaterialSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [allMaterials, setAllMaterials] = useState([]) // Cache all materials for search
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customItem, setCustomItem] = useState({ name: '', category: '', quantity: '' })
  const materialsSearchRef = useRef(null)

  // Same as Yesterday state
  const [loadingPreviousCrew, setLoadingPreviousCrew] = useState(false)

  // Language state
  const [lang, setLang] = useState('en')
  const t = (key) => TRANSLATIONS[lang][key] || key

  // Dynamic labor classes state (for companies with custom setup)
  const [laborCategories, setLaborCategories] = useState([])
  const [laborClasses, setLaborClasses] = useState([])
  const [dynamicWorkers, setDynamicWorkers] = useState({}) // { classId: [workers] }
  const [loadingLaborClasses, setLoadingLaborClasses] = useState(true)

  // Check if company has custom labor classes
  const hasCustomLaborClasses = laborClasses.length > 0

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

  // Helper to determine worker completion state for visual indicators
  const getWorkerState = (worker) => {
    const hasName = worker.name.trim() !== ''
    const hasHours = parseFloat(worker.hours) > 0 || parseFloat(worker.overtimeHours) > 0
    if (!hasName) return 'empty'
    if (hasHours) return 'complete'
    return 'incomplete'
  }

  // Apply time preset to batch hours
  const applyTimePreset = (preset) => {
    let timeStarted, timeEnded, hours, overtimeHours

    switch (preset) {
      case 'full':
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
      case 'half':
        timeStarted = '07:00'
        timeEnded = '11:00'
        hours = '4'
        overtimeHours = ''
        break
      default:
        return
    }

    setBatchHours({ timeStarted, timeEnded, hours, overtimeHours })
  }

  // Load today's crew and assignable CORs on mount
  useEffect(() => {
    loadTodaysCrew()
    loadAssignableCORs()
  }, [project.id])

  // Load custom labor classes for the company
  useEffect(() => {
    const loadLaborClasses = async () => {
      if (!companyId) {
        setLoadingLaborClasses(false)
        return
      }

      try {
        // Use field-safe function that doesn't expose labor rates
        const data = await db.getLaborClassesForField(companyId)
        setLaborCategories(data.categories || [])
        setLaborClasses(data.classes || [])

        // Initialize dynamic workers state with one empty worker per class
        if (data.classes && data.classes.length > 0) {
          const initial = {}
          data.classes.forEach(lc => {
            initial[lc.id] = [{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }]
          })
          setDynamicWorkers(initial)
        }
      } catch (err) {
        console.error('Error loading labor classes:', err)
      } finally {
        setLoadingLaborClasses(false)
      }
    }

    loadLaborClasses()
  }, [companyId])

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

    // Apply to all workers with names
    setSupervision(prev => prev.map(s =>
      s.name.trim() ? { ...s, timeStarted, timeEnded, hours, overtimeHours } : s
    ))
    setOperators(prev => prev.map(o =>
      o.name.trim() ? { ...o, timeStarted, timeEnded, hours, overtimeHours } : o
    ))
    setLaborers(prev => prev.map(l =>
      l.name.trim() ? { ...l, timeStarted, timeEnded, hours, overtimeHours } : l
    ))

    // Count workers updated
    const count = [
      ...supervision.filter(s => s.name.trim()),
      ...operators.filter(o => o.name.trim()),
      ...laborers.filter(l => l.name.trim())
    ].length

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

  // Load items when category selected
  useEffect(() => {
    if (selectedCategory && companyId) {
      loadCategoryItems(selectedCategory)
    }
  }, [selectedCategory, companyId])

  // Auto-focus materials search when entering step 3
  useEffect(() => {
    if (step === 3 && materialsSearchRef.current && !selectedCategory) {
      // Small delay to ensure the element is rendered
      setTimeout(() => {
        materialsSearchRef.current?.focus()
      }, 100)
    }
  }, [step, selectedCategory])

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

  // Load all materials for search (on first access to materials step)
  const loadAllMaterials = async () => {
    if (allMaterials.length > 0) return // Already loaded
    try {
      const allItems = []
      for (const category of CATEGORIES) {
        const data = await db.getMaterialsEquipmentByCategory(companyId, category)
        allItems.push(...data.map(item => ({ ...item, category })))
      }
      setAllMaterials(allItems)
    } catch (error) {
      console.error('Error loading all materials:', error)
    }
  }

  // Filter materials based on search query
  const handleMaterialSearch = (query) => {
    setMaterialSearch(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const lowerQuery = query.toLowerCase()
    const results = allMaterials.filter(item =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.category.toLowerCase().includes(lowerQuery)
    )
    setSearchResults(results.slice(0, 10)) // Limit to 10 results
  }

  // Load previous ticket's crew ("Same as Yesterday")
  const loadPreviousCrew = async () => {
    setLoadingPreviousCrew(true)
    try {
      const previousCrew = await db.getPreviousTicketCrew(project.id, workDate)

      if (!previousCrew || previousCrew.totalWorkers === 0) {
        onShowToast('No previous crew found for this project', 'info')
        return
      }

      // Apply previous crew data
      if (previousCrew.supervision) {
        setSupervision(previousCrew.supervision)
      }
      if (previousCrew.operators) {
        setOperators(previousCrew.operators)
      }
      if (previousCrew.laborers) {
        setLaborers(previousCrew.laborers)
      }

      const dateStr = new Date(previousCrew.workDate).toLocaleDateString()
      onShowToast(`Loaded ${previousCrew.totalWorkers} workers from ${dateStr}`, 'success')
    } catch (error) {
      console.error('Error loading previous crew:', error)
      onShowToast('Error loading previous crew', 'error')
    } finally {
      setLoadingPreviousCrew(false)
    }
  }

  // Supervision functions
  const addSupervision = () => {
    setSupervision([...supervision, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
  }

  const updateSupervision = (index, field, value) => {
    setSupervision(supervision.map((s, i) => {
      if (i !== index) return s

      const updated = { ...s, [field]: value }

      // Auto-calculate hours when time changes
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
  const addLaborer = () => {
    setLaborers([...laborers, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  }

  const updateLaborer = (index, field, value) => {
    setLaborers(laborers.map((l, i) => {
      if (i !== index) return l

      const updated = { ...l, [field]: value }

      // Auto-calculate hours when time changes
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
  const addOperator = () => {
    setOperators([...operators, { name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }])
  }

  const updateOperator = (index, field, value) => {
    setOperators(operators.map((o, i) => {
      if (i !== index) return o

      const updated = { ...o, [field]: value }

      // Auto-calculate hours when time changes
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

        // Auto-calculate hours when time changes
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
        return {
          ...prev,
          [classId]: workers.filter((_, i) => i !== index)
        }
      } else {
        return {
          ...prev,
          [classId]: [{ name: '', hours: '', overtimeHours: '', timeStarted: '', timeEnded: '' }]
        }
      }
    })
  }

  // Get all valid dynamic workers for submission
  const getValidDynamicWorkers = () => {
    if (!dynamicWorkers || typeof dynamicWorkers !== 'object') {
      return []
    }
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
  // Photo states: pending → compressing → uploading → confirmed/failed
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

    // File size limit: 10MB per image
    const MAX_FILE_SIZE = 10 * 1024 * 1024

    filesToAdd.forEach(file => {
      if (!file.type.startsWith('image/')) {
        onShowToast('Please select an image file', 'error')
        return
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        onShowToast(`Photo too large: ${file.name} (max 10MB)`, 'error')
        return
      }

      // Create preview URL and store file with state tracking
      const previewUrl = URL.createObjectURL(file)
      const tempId = `photo-${Date.now()}-${generateRandomId()}`
      setPhotos(prev => [...prev, {
        id: `${Date.now()}-${generateRandomId()}`,
        tempId: tempId,
        file: file,
        previewUrl: previewUrl,
        name: file.name,
        status: 'pending',      // pending | compressing | uploading | confirmed | failed
        attempts: 0,            // Number of upload attempts
        error: null,            // Error message if failed
        uploadedUrl: null       // URL after successful upload
      }])
    })

    // Reset input
    e.target.value = ''
  }

  // Update photo status by id
  const updatePhotoStatus = (photoId, updates) => {
    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, ...updates } : p
    ))
  }

  // Retry a single failed photo upload
  const retryPhotoUpload = async (photoId, ticketId) => {
    const photo = photos.find(p => p.id === photoId)
    if (!photo || photo.status !== 'failed') return

    updatePhotoStatus(photoId, { status: 'compressing', error: null })

    try {
      // Compress
      let fileToUpload = photo.file
      try {
        fileToUpload = await compressImage(photo.file)
      } catch (err) {
        console.warn('Compression failed, using original:', err)
      }

      updatePhotoStatus(photoId, { status: 'uploading' })

      // Upload
      const url = await db.uploadPhoto(companyId, project.id, ticketId, fileToUpload)

      updatePhotoStatus(photoId, {
        status: 'confirmed',
        uploadedUrl: url,
        attempts: photo.attempts + 1
      })

      // Add to ticket photos
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

  // Get count of photos by status
  const getPhotoStatusCounts = () => {
    const counts = { pending: 0, compressing: 0, uploading: 0, confirmed: 0, failed: 0 }
    photos.forEach(p => {
      if (counts[p.status] !== undefined) counts[p.status]++
    })
    return counts
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
      // Description is required on Work Info step
      return notes.trim().length > 0
    }
    if (step === 2) {
      // At least one worker with name and hours (regular or OT)
      if (hasCustomLaborClasses) {
        // Check dynamic workers
        return getValidDynamicWorkers().length > 0
      } else {
        // Check hardcoded workers (fallback)
        const hasSupervision = supervision.some(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
        const hasOperators = operators.some(o => o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
        const hasLaborers = laborers.some(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))
        return hasSupervision || hasOperators || hasLaborers
      }
    }
    return true
  }

  // Get validation warnings for current step (non-blocking, informational)
  const getValidationWarnings = () => {
    const warnings = []

    if (step === 1) {
      if (!notes.trim()) {
        warnings.push(lang === 'en' ? 'Description recommended' : 'Descripción recomendada')
      }
    }

    if (step === 2) {
      if (workersNeedingHours > 0) {
        warnings.push(
          lang === 'en'
            ? `${workersNeedingHours} worker(s) have no hours entered`
            : `${workersNeedingHours} trabajador(es) sin horas`
        )
      }
    }

    if (step === 5) {
      if (!submittedByName.trim()) {
        warnings.push(lang === 'en' ? 'Name required to submit' : 'Nombre requerido')
      }
    }

    return warnings
  }

  const validationWarnings = getValidationWarnings()

  const goNext = () => {
    if (step < 5) setStep(step + 1)
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

    // Get workers based on whether company uses custom labor classes
    let allWorkersForSubmit = []

    if (hasCustomLaborClasses) {
      allWorkersForSubmit = getValidDynamicWorkers()
      if (allWorkersForSubmit.length === 0) {
        onShowToast('Add at least one worker', 'error')
        return
      }
    } else {
      const validSupervision = supervision.filter(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
      const validOperators = operators.filter(o => o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
      const validLaborers = laborers.filter(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))

      if (validSupervision.length === 0 && validOperators.length === 0 && validLaborers.length === 0) {
        onShowToast('Add at least one worker', 'error')
        return
      }

      // Build workers array from hardcoded sections
      allWorkersForSubmit = [
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

      // Compress and upload photos with state tracking
      let photoUrls = []
      const pendingPhotos = photos.filter(p => p.status === 'pending')
      if (pendingPhotos.length > 0) {
        // Phase 1: Compress all photos
        setSubmitProgress(`Compressing ${pendingPhotos.length} photo${pendingPhotos.length > 1 ? 's' : ''}...`)

        // Update status to compressing
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

        // Phase 2: Upload compressed photos with individual status tracking
        setSubmitProgress(`Uploading ${pendingPhotos.length} photo${pendingPhotos.length > 1 ? 's' : ''}...`)

        // Update status to uploading
        pendingPhotos.forEach(p => updatePhotoStatus(p.id, { status: 'uploading' }))

        let uploadedCount = 0
        let failedCount = 0
        const uploadPromises = compressedPhotos.map(async (photo) => {
          try {
            const url = await db.uploadPhoto(companyId, project.id, ticket.id, photo.file)
            uploadedCount++
            setSubmitProgress(`Uploading ${uploadedCount}/${pendingPhotos.length} photos...`)

            // Update photo state to confirmed
            updatePhotoStatus(photo.id, {
              status: 'confirmed',
              uploadedUrl: url,
              attempts: (photo.attempts || 0) + 1
            })

            return { id: photo.id, url }
          } catch (err) {
            console.error(`Photo ${photo.name} upload failed:`, err)
            failedCount++

            // Update photo state to failed
            updatePhotoStatus(photo.id, {
              status: 'failed',
              error: err.message || 'Upload failed',
              attempts: (photo.attempts || 0) + 1
            })

            return { id: photo.id, url: null, error: err.message }
          }
        })

        const results = await Promise.all(uploadPromises)
        photoUrls = results.filter(r => r.url !== null).map(r => r.url)

        // Notify based on results
        if (failedCount > 0 && photoUrls.length > 0) {
          onShowToast(`${photoUrls.length}/${pendingPhotos.length} photos uploaded. ${failedCount} failed - can retry later.`, 'warning')
        } else if (failedCount > 0 && photoUrls.length === 0) {
          onShowToast(`All ${failedCount} photos failed to upload - can retry after submission.`, 'error')
        }
      }

      // Update ticket with photo URLs if any were uploaded
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
          // Log error and mark for retry, but don't fail the whole submission
          console.error('Error importing to COR:', importError)
          // Mark import as failed for retry tracking
          try {
            await db.markImportFailed(ticket.id, selectedCorId, importError?.message || 'Import failed')
          } catch (markError) {
            console.error('Error marking import failed:', markError)
          }
          onShowToast('T&M saved. COR data sync failed - retry from ticket list.', 'warning')
        }
      }

      // Clean up preview URLs
      photos.forEach(p => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })

      // Store the ticket and go to success/signature step
      setSubmittedTicket(ticket)
      onShowToast('T&M submitted!', 'success')
      setStep(6) // Go to success/signature step
    } catch (error) {
      console.error('Error submitting T&M:', error)
      onShowToast('Error submitting T&M', 'error')
    } finally {
      setSubmitting(false)
      setSubmitProgress('')
    }
  }

  // Get total workers and hours for summary
  // Handles both dynamic labor classes and hardcoded fallback
  const validSupervision = supervision.filter(s => s.name.trim() && (parseFloat(s.hours) > 0 || parseFloat(s.overtimeHours) > 0))
  const validOperators = operators.filter(o => o.name.trim() && (parseFloat(o.hours) > 0 || parseFloat(o.overtimeHours) > 0))
  const validLaborers = laborers.filter(l => l.name.trim() && (parseFloat(l.hours) > 0 || parseFloat(l.overtimeHours) > 0))

  // Dynamic workers summary (when company has custom classes)
  const validDynamicWorkersList = getValidDynamicWorkers()

  // Use dynamic workers if available, otherwise use hardcoded
  const totalWorkers = hasCustomLaborClasses
    ? validDynamicWorkersList.length
    : validSupervision.length + validOperators.length + validLaborers.length
  const totalRegHours = hasCustomLaborClasses
    ? validDynamicWorkersList.reduce((sum, w) => sum + (w.hours || 0), 0)
    : [...validSupervision, ...validOperators, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.hours || 0), 0)
  const totalOTHours = hasCustomLaborClasses
    ? validDynamicWorkersList.reduce((sum, w) => sum + (w.overtime_hours || 0), 0)
    : [...validSupervision, ...validOperators, ...validLaborers].reduce((sum, w) => sum + parseFloat(w.overtimeHours || 0), 0)
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

  // Workers with names (for running total - shows who needs hours)
  const namedWorkers = hasCustomLaborClasses
    ? Object.values(dynamicWorkers || {}).flat().filter(w => w && w.name && w.name.trim())
    : [
        ...supervision.filter(s => s && s.name && s.name.trim()),
        ...operators.filter(o => o && o.name && o.name.trim()),
        ...laborers.filter(l => l && l.name && l.name.trim())
      ]
  const workersWithHours = totalWorkers
  const workersNeedingHours = namedWorkers.length - workersWithHours

  // STEP 2: Item Selection View
  if (step === 3 && (selectedCategory || showCustomForm)) {
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
        {step < 5 ? (
          <button className="tm-back-btn" onClick={goBack}>←</button>
        ) : (
          <div className="tm-success-check"><CheckCircle2 size={24} /></div>
        )}
        <h2>
          {step === 1 && t('workInfo')}
          {step === 2 && t('crewHours')}
          {step === 3 && t('materialsEquipment')}
          {step === 4 && t('evidence')}
          {step === 5 && t('review')}
          {step === 6 && (lang === 'en' ? 'Submitted' : 'Enviado')}
        </h2>
        <div className="tm-header-right">
          {step < 5 && (
            <button
              className="tm-lang-toggle"
              onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
              title={lang === 'en' ? 'Cambiar a Español' : 'Switch to English'}
            >
              <Globe size={16} />
              {lang === 'en' ? 'ES' : 'EN'}
            </button>
          )}
          {step < 6 && (
            <div className="tm-step-dots">
              <span className={`tm-dot ${step >= 1 ? 'active' : ''}`}></span>
              <span className={`tm-dot ${step >= 2 ? 'active' : ''}`}></span>
              <span className={`tm-dot ${step >= 3 ? 'active' : ''}`}></span>
              <span className={`tm-dot ${step >= 4 ? 'active' : ''}`}></span>
              <span className={`tm-dot ${step >= 5 ? 'active' : ''}`}></span>
            </div>
          )}
        </div>
      </div>

      {/* Step 1: Work Info */}
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

          {/* Description of Work - REQUIRED */}
          <div className="tm-field tm-description-field">
            <label>
              <FileText size={16} className="inline-icon" />
              {t('describeWork')} <span className="tm-required">*</span>
            </label>
            <textarea
              placeholder={t('whatWorkPerformed')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className={`tm-description ${!notes.trim() ? 'tm-field-required' : ''}`}
            />
          </div>
        </div>
      )}

      {/* Step 2: Crew & Hours */}
      {step === 2 && (
        <div className="tm-step-content">
          {/* Sticky Crew Summary Pill */}
          <div className="tm-crew-summary-pill">
            <span className="pill-stat">{namedWorkers.length} {namedWorkers.length === 1 ? t('worker') : t('workers_plural')}</span>
            <span className="pill-stat">{totalRegHours + totalOTHours}h {lang === 'en' ? 'total' : 'total'}</span>
            {workersNeedingHours > 0 && (
              <span className="pill-warning">
                <AlertCircle size={14} />
                {workersNeedingHours} {lang === 'en' ? 'need hours' : 'sin horas'}
              </span>
            )}
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
                    // Check if already added (in legacy or dynamic sections)
                    const inLegacy =
                      supervision.some(s => s.name.toLowerCase() === worker.name.toLowerCase()) ||
                      operators.some(o => o.name.toLowerCase() === worker.name.toLowerCase()) ||
                      laborers.some(l => l.name.toLowerCase() === worker.name.toLowerCase())
                    const inDynamic = Object.values(dynamicWorkers).some(workers =>
                      workers.some(w => w.name.toLowerCase() === worker.name.toLowerCase())
                    )
                    const isAdded = inLegacy || inDynamic

                    return (
                      <button
                        key={index}
                        className={`tm-crew-item ${isAdded ? 'added' : ''}`}
                        onClick={() => {
                          if (isAdded) return

                          // If worker has labor_class_id and we have custom classes, add to dynamic section
                          if (worker.labor_class_id && hasCustomLaborClasses && dynamicWorkers[worker.labor_class_id]) {
                            const classWorkers = dynamicWorkers[worker.labor_class_id] || []
                            const emptyIndex = classWorkers.findIndex(w => !w.name.trim())
                            if (emptyIndex >= 0) {
                              // Update existing empty slot
                              const updated = [...classWorkers]
                              updated[emptyIndex] = { ...updated[emptyIndex], name: worker.name }
                              setDynamicWorkers({ ...dynamicWorkers, [worker.labor_class_id]: updated })
                            } else {
                              // Add new worker
                              setDynamicWorkers({
                                ...dynamicWorkers,
                                [worker.labor_class_id]: [...classWorkers, {
                                  name: worker.name,
                                  hours: '',
                                  overtimeHours: '',
                                  timeStarted: '',
                                  timeEnded: ''
                                }]
                              })
                            }
                          } else {
                            // Fall back to legacy sections based on role name
                            const role = (worker.role || '').toLowerCase()

                            if (role.includes('foreman') || role.includes('supervisor') || role.includes('superintendent')) {
                              const emptySupIndex = supervision.findIndex(s => !s.name.trim())
                              if (emptySupIndex >= 0) {
                                updateSupervision(emptySupIndex, 'name', worker.name)
                                updateSupervision(emptySupIndex, 'role', role.includes('superintendent') ? 'Superintendent' : 'Foreman')
                              } else {
                                setSupervision([...supervision, {
                                  name: worker.name,
                                  hours: '',
                                  overtimeHours: '',
                                  timeStarted: '',
                                  timeEnded: '',
                                  role: role.includes('superintendent') ? 'Superintendent' : 'Foreman'
                                }])
                              }
                            } else if (role.includes('operator')) {
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

          {/* Quick Actions - Same as Yesterday + Batch Hours */}
          <div className="tm-quick-actions-panel">
            <div className="tm-batch-hours-header">
              <Zap size={18} />
              <span>{t('quickActions')}</span>
            </div>
            <div className="tm-quick-actions-buttons">
              <button
                type="button"
                className="tm-quick-action-btn primary"
                onClick={loadPreviousCrew}
                disabled={loadingPreviousCrew}
              >
                <Copy size={16} />
                {loadingPreviousCrew ? t('loading') : t('sameAsYesterday')}
              </button>
              <button
                type="button"
                className="tm-quick-action-btn"
                onClick={() => setShowBatchHoursModal(true)}
              >
                <Clock size={16} />
                {t('setCrewHours')}
              </button>
            </div>
          </div>

          {/* Inline Time Presets - One-tap hour application */}
          <div className="tm-inline-presets">
            <span className="tm-inline-presets-label">
              {lang === 'en' ? 'Apply to all:' : 'Aplicar a todos:'}
            </span>
            <div className="tm-inline-presets-buttons">
              <button
                type="button"
                className="tm-preset-chip"
                onClick={() => applyInlinePreset('8hr')}
              >
                {t('preset8hr')}
              </button>
              <button
                type="button"
                className="tm-preset-chip"
                onClick={() => applyInlinePreset('10hr')}
              >
                {t('preset10hr')}
              </button>
              <button
                type="button"
                className="tm-preset-chip"
                onClick={() => applyInlinePreset('4hr')}
              >
                {t('preset4hr')}
              </button>
            </div>
          </div>

          {/* Running Total Banner - Live feedback */}
          <div className={`tm-running-total ${totalWorkers > 0 ? 'has-data' : ''}`}>
            <div className="tm-running-total-workers">
              <HardHat size={18} />
              <span className="tm-running-total-count">{namedWorkers.length}</span>
              <span className="tm-running-total-label">
                {namedWorkers.length === 1 ? t('worker') : t('workers_plural')}
              </span>
              {workersNeedingHours > 0 && (
                <span className="tm-running-total-warning">
                  ({workersNeedingHours} {lang === 'en' ? 'need hours' : 'sin horas'})
                </span>
              )}
            </div>
            <div className="tm-running-total-hours">
              <Clock size={18} />
              <span className="tm-running-total-count">{totalRegHours + totalOTHours}</span>
              <span className="tm-running-total-label">
                {lang === 'en' ? 'total hrs' : 'hrs total'}
              </span>
              {totalOTHours > 0 && (
                <span className="tm-running-total-ot">
                  ({totalOTHours} OT)
                </span>
              )}
            </div>
          </div>

          {/* Dynamic Labor Classes (when company has custom classes) */}
          {hasCustomLaborClasses && !loadingLaborClasses && (
            <>
              {laborCategories.map(category => {
                const categoryClasses = laborClasses.filter(lc => lc.category_id === category.id)
                if (categoryClasses.length === 0) return null
                return (
                  <div key={category.id} className="tm-labor-category-section">
                    <div className="tm-category-header">{category.name}</div>
                    {categoryClasses.map(laborClass => (
                      <div key={laborClass.id} className="tm-field">
                        <label>{laborClass.name}</label>
                        <div className="tm-workers-list">
                          {(dynamicWorkers[laborClass.id] || []).map((worker, index) => {
                            const workerState = getWorkerState(worker)
                            return (
                              <div key={index} className={`tm-worker-card-expanded ${workerState !== 'empty' ? `worker-${workerState}` : ''}`}>
                                <div className="tm-worker-row-top">
                                  {workerState === 'complete' && (
                                    <span className="tm-worker-check"><Check size={14} /></span>
                                  )}
                                  <input
                                    type="text"
                                    placeholder={t('firstLastName')}
                                    value={worker.name}
                                    onChange={(e) => updateDynamicWorker(laborClass.id, index, 'name', e.target.value)}
                                    className="tm-worker-input"
                                  />
                                  <button className="tm-remove" onClick={() => removeDynamicWorker(laborClass.id, index)}>×</button>
                                </div>
                                <div className="tm-worker-row-bottom">
                                  <div className="tm-time-group">
                                    <label>{t('start')}</label>
                                    <input
                                      type="time"
                                      value={worker.timeStarted}
                                      onChange={(e) => updateDynamicWorker(laborClass.id, index, 'timeStarted', e.target.value)}
                                    />
                                  </div>
                                  <div className="tm-time-group">
                                    <label>{t('end')}</label>
                                    <input
                                      type="time"
                                      value={worker.timeEnded}
                                      onChange={(e) => updateDynamicWorker(laborClass.id, index, 'timeEnded', e.target.value)}
                                    />
                                  </div>
                                  <div className="tm-time-group">
                                    <label>{t('regHrs')}</label>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={worker.hours}
                                      onChange={(e) => updateDynamicWorker(laborClass.id, index, 'hours', e.target.value)}
                                    />
                                  </div>
                                  <div className="tm-time-group">
                                    <label>{t('otHrs')}</label>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={worker.overtimeHours}
                                      onChange={(e) => updateDynamicWorker(laborClass.id, index, 'overtimeHours', e.target.value)}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <button className="tm-add-btn" onClick={() => addDynamicWorker(laborClass.id)}>
                          + {lang === 'en' ? 'Add' : 'Agregar'} {laborClass.name}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
              {/* Classes without category */}
              {laborClasses.filter(lc => !lc.category_id).map(laborClass => (
                <div key={laborClass.id} className="tm-field">
                  <label>{laborClass.name}</label>
                  <div className="tm-workers-list">
                    {(dynamicWorkers[laborClass.id] || []).map((worker, index) => {
                      const workerState = getWorkerState(worker)
                      return (
                        <div key={index} className={`tm-worker-card-expanded ${workerState !== 'empty' ? `worker-${workerState}` : ''}`}>
                          <div className="tm-worker-row-top">
                            {workerState === 'complete' && (
                              <span className="tm-worker-check"><Check size={14} /></span>
                            )}
                            <input
                              type="text"
                              placeholder={t('firstLastName')}
                              value={worker.name}
                              onChange={(e) => updateDynamicWorker(laborClass.id, index, 'name', e.target.value)}
                              className="tm-worker-input"
                            />
                            <button className="tm-remove" onClick={() => removeDynamicWorker(laborClass.id, index)}>×</button>
                          </div>
                          <div className="tm-worker-row-bottom">
                            <div className="tm-time-group">
                              <label>{t('start')}</label>
                              <input
                                type="time"
                                value={worker.timeStarted}
                                onChange={(e) => updateDynamicWorker(laborClass.id, index, 'timeStarted', e.target.value)}
                              />
                            </div>
                            <div className="tm-time-group">
                              <label>{t('end')}</label>
                              <input
                                type="time"
                                value={worker.timeEnded}
                                onChange={(e) => updateDynamicWorker(laborClass.id, index, 'timeEnded', e.target.value)}
                              />
                            </div>
                            <div className="tm-time-group">
                              <label>{t('regHrs')}</label>
                              <input
                                type="number"
                                placeholder="0"
                                value={worker.hours}
                                onChange={(e) => updateDynamicWorker(laborClass.id, index, 'hours', e.target.value)}
                              />
                            </div>
                            <div className="tm-time-group">
                              <label>{t('otHrs')}</label>
                              <input
                                type="number"
                                placeholder="0"
                                value={worker.overtimeHours}
                                onChange={(e) => updateDynamicWorker(laborClass.id, index, 'overtimeHours', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button className="tm-add-btn" onClick={() => addDynamicWorker(laborClass.id)}>
                    + {lang === 'en' ? 'Add' : 'Agregar'} {laborClass.name}
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Loading indicator for labor classes */}
          {loadingLaborClasses && (
            <div className="tm-loading-labor-classes">
              <Loader2 size={20} className="tm-spinner" />
              <span>{lang === 'en' ? 'Loading labor classes...' : 'Cargando clases de trabajo...'}</span>
            </div>
          )}

          {/* Hardcoded Worker Sections (fallback when no custom classes) */}
          {!hasCustomLaborClasses && !loadingLaborClasses && (
            <>
              {/* Supervision Section */}
              <div className="tm-field">
                <label>{t('supervision')}</label>
                <div className="tm-workers-list">
                  {supervision.map((sup, index) => {
                    const workerState = getWorkerState(sup)
                    return (
                    <div key={index} className={`tm-worker-card-expanded ${workerState !== 'empty' ? `worker-${workerState}` : ''}`}>
                      <div className="tm-worker-row-top">
                        {workerState === 'complete' && (
                          <span className="tm-worker-check"><Check size={14} /></span>
                        )}
                        <div className="tm-role-select">
                          <select
                            value={sup.role}
                            onChange={(e) => updateSupervision(index, 'role', e.target.value)}
                          >
                            <option value="Foreman">{t('foreman')}</option>
                            <option value="Superintendent">{t('superintendent')}</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          placeholder={t('firstLastName')}
                          value={sup.name}
                          onChange={(e) => updateSupervision(index, 'name', e.target.value)}
                          className="tm-worker-input"
                        />
                        <button className="tm-remove" onClick={() => removeSupervision(index)}>×</button>
                      </div>
                      <div className="tm-worker-row-bottom">
                        <div className="tm-time-group">
                          <label>{t('start')}</label>
                          <input
                            type="time"
                            value={sup.timeStarted}
                            onChange={(e) => updateSupervision(index, 'timeStarted', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('end')}</label>
                          <input
                            type="time"
                            value={sup.timeEnded}
                            onChange={(e) => updateSupervision(index, 'timeEnded', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('regHrs')}</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={sup.hours}
                            onChange={(e) => updateSupervision(index, 'hours', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('otHrs')}</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={sup.overtimeHours}
                            onChange={(e) => updateSupervision(index, 'overtimeHours', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
                <button className="tm-add-btn" onClick={addSupervision}>
                  {t('addSupervision')}
                </button>
              </div>

              {/* Operators Section */}
              <div className="tm-field">
                <label>{t('operators')}</label>
                <div className="tm-workers-list">
                  {operators.map((operator, index) => {
                    const workerState = getWorkerState(operator)
                    return (
                    <div key={index} className={`tm-worker-card-expanded ${workerState !== 'empty' ? `worker-${workerState}` : ''}`}>
                      <div className="tm-worker-row-top">
                        {workerState === 'complete' && (
                          <span className="tm-worker-check"><Check size={14} /></span>
                        )}
                        <input
                          type="text"
                          placeholder={t('firstLastName')}
                          value={operator.name}
                          onChange={(e) => updateOperator(index, 'name', e.target.value)}
                          className="tm-worker-input"
                        />
                        <button className="tm-remove" onClick={() => removeOperator(index)}>×</button>
                      </div>
                      <div className="tm-worker-row-bottom">
                        <div className="tm-time-group">
                          <label>{t('start')}</label>
                          <input
                            type="time"
                            value={operator.timeStarted}
                            onChange={(e) => updateOperator(index, 'timeStarted', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('end')}</label>
                          <input
                            type="time"
                            value={operator.timeEnded}
                            onChange={(e) => updateOperator(index, 'timeEnded', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('regHrs')}</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={operator.hours}
                            onChange={(e) => updateOperator(index, 'hours', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('otHrs')}</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={operator.overtimeHours}
                            onChange={(e) => updateOperator(index, 'overtimeHours', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
                <button className="tm-add-btn" onClick={addOperator}>
                  {t('addOperator')}
                </button>
              </div>

              {/* Laborers Section */}
              <div className="tm-field">
                <label>{t('laborers')}</label>
                <div className="tm-workers-list">
                  {laborers.map((laborer, index) => {
                    const workerState = getWorkerState(laborer)
                    return (
                    <div key={index} className={`tm-worker-card-expanded ${workerState !== 'empty' ? `worker-${workerState}` : ''}`}>
                      <div className="tm-worker-row-top">
                        {workerState === 'complete' && (
                          <span className="tm-worker-check"><Check size={14} /></span>
                        )}
                        <input
                          type="text"
                          placeholder={t('firstLastName')}
                          value={laborer.name}
                          onChange={(e) => updateLaborer(index, 'name', e.target.value)}
                          className="tm-worker-input"
                        />
                        <button className="tm-remove" onClick={() => removeLaborer(index)}>×</button>
                      </div>
                      <div className="tm-worker-row-bottom">
                        <div className="tm-time-group">
                          <label>{t('start')}</label>
                          <input
                            type="time"
                            value={laborer.timeStarted}
                            onChange={(e) => updateLaborer(index, 'timeStarted', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('end')}</label>
                          <input
                            type="time"
                            value={laborer.timeEnded}
                            onChange={(e) => updateLaborer(index, 'timeEnded', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('regHrs')}</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={laborer.hours}
                            onChange={(e) => updateLaborer(index, 'hours', e.target.value)}
                          />
                        </div>
                        <div className="tm-time-group">
                          <label>{t('otHrs')}</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={laborer.overtimeHours}
                            onChange={(e) => updateLaborer(index, 'overtimeHours', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
                <button className="tm-add-btn" onClick={addLaborer}>
                  {t('addLaborer')}
                </button>
              </div>
            </>
          )}

        </div>
      )}

      {/* Step 3: Materials & Equipment */}
      {step === 3 && !selectedCategory && (
        <div className="tm-step-content">
          {/* Quick Search */}
          <div className="tm-field tm-search-field">
            <div className="tm-search-input-wrapper">
              <Search size={18} className="tm-search-icon" />
              <input
                ref={materialsSearchRef}
                type="text"
                placeholder={t('searchMaterials')}
                value={materialSearch}
                onChange={(e) => handleMaterialSearch(e.target.value)}
                onFocus={() => loadAllMaterials()}
                className="tm-search-input"
              />
              {materialSearch && (
                <button className="tm-search-clear" onClick={() => { setMaterialSearch(''); setSearchResults([]); }}>×</button>
              )}
            </div>

            {/* Search Results */}
            {materialSearch && searchResults.length > 0 && (
              <div className="tm-search-results">
                {searchResults.map((item, idx) => {
                  const existingItem = items.find(i => i.id === item.id)
                  return (
                    <button
                      key={idx}
                      className={`tm-search-result-item ${existingItem ? 'added' : ''}`}
                      onClick={() => {
                        if (existingItem) {
                          updateItemQuantity(items.indexOf(existingItem), existingItem.quantity + 1)
                        } else {
                          setItems([...items, { ...item, quantity: 1, isCustom: false }])
                        }
                        setMaterialSearch('')
                        setSearchResults([])
                      }}
                    >
                      <span className="tm-search-result-name">{item.name}</span>
                      <span className="tm-search-result-category">{item.category}</span>
                      {existingItem && <span className="tm-search-result-qty">×{existingItem.quantity}</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {materialSearch && searchResults.length === 0 && (
              <div className="tm-search-no-results">{t('noSearchResults')}</div>
            )}
          </div>

          <div className="tm-field">
            <label>{t('orBrowse')}</label>
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

      {/* Step 4: Evidence & Linkage */}
      {step === 4 && (
        <div className="tm-step-content">
          {/* Photos Section */}
          <div className="tm-evidence-section">
            <h3><Camera size={18} /> {t('photos')}</h3>
            {photos.length > 0 && (
              <div className="tm-photo-grid">
                {photos.map(photo => (
                  <div key={photo.id} className={`tm-photo-item ${photo.status ? `photo-${photo.status}` : ''}`}>
                    <img src={photo.previewUrl} alt={photo.name} />
                    {photo.status === 'compressing' && (
                      <div className="tm-photo-status compressing">
                        <Loader2 size={20} className="tm-spinner" />
                        <span>{lang === 'en' ? 'Compressing' : 'Comprimiendo'}</span>
                      </div>
                    )}
                    {photo.status === 'uploading' && (
                      <div className="tm-photo-status uploading">
                        <Loader2 size={20} className="tm-spinner" />
                        <span>{lang === 'en' ? 'Uploading' : 'Subiendo'}</span>
                      </div>
                    )}
                    {photo.status === 'confirmed' && (
                      <div className="tm-photo-status confirmed">
                        <Check size={20} />
                      </div>
                    )}
                    {photo.status === 'failed' && (
                      <div className="tm-photo-status failed" title={photo.error || 'Upload failed'}>
                        <AlertCircle size={20} />
                        <span>{lang === 'en' ? 'Failed' : 'Error'}</span>
                      </div>
                    )}
                    {(!photo.status || photo.status === 'pending' || photo.status === 'failed') && (
                      <button className="tm-photo-remove" onClick={() => removePhoto(photo.id)}>×</button>
                    )}
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
                <Camera size={16} className="inline-icon" /> {photos.length > 0 ? (lang === 'en' ? 'Add More Photos' : 'Más Fotos') : t('addPhotos')}
              </label>
            )}
            {maxPhotos !== -1 && (
              <p className="tm-photo-hint">{photos.length}/{maxPhotos} {t('maxPhotos')}</p>
            )}
          </div>

          {/* COR Assignment */}
          <div className="tm-evidence-section">
            <h3><Link size={18} /> {t('linkedCOR')}</h3>
            <div className="tm-cor-row">
              <select
                value={selectedCorId}
                onChange={(e) => setSelectedCorId(e.target.value)}
                className="tm-input tm-select"
              >
                <option value="">-- {lang === 'en' ? 'No COR' : 'Sin COR'} --</option>
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
                title={lang === 'en' ? 'Refresh COR list' : 'Actualizar lista'}
              >
                <RefreshCw size={16} className={loadingCORs ? 'spinning' : ''} />
              </button>
            </div>
            {assignableCORs.length === 0 && !loadingCORs && (
              <p className="tm-cor-hint">{t('noCORs')}</p>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="tm-step-content">
          {/* Work Info Summary */}
          <div className="tm-review-section">
            <div className="tm-review-section-header">
              <h4>📅 {t('workDate')}</h4>
              <button className="tm-edit-link" onClick={() => setStep(1)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
            </div>
            <div className="tm-review-row">
              <span>{new Date(workDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              {cePcoNumber && <span>CE/PCO: {cePcoNumber}</span>}
            </div>
          </div>

          {/* Description */}
          {notes && (
            <div className="tm-review-section">
              <div className="tm-review-section-header">
                <h4><FileText size={16} className="inline-icon" /> {t('notes')}</h4>
                <button className="tm-edit-link" onClick={() => setStep(1)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
              </div>
              <div className="tm-review-notes">{notes}</div>
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-section-header">
                <h4><Camera size={16} className="inline-icon" /> {t('photos')} ({photos.length})</h4>
                <button className="tm-edit-link" onClick={() => setStep(4)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
              </div>
              <div className="tm-review-photos">
                {photos.map(photo => (
                  <img key={photo.id} src={photo.previewUrl} alt={photo.name} />
                ))}
              </div>
            </div>
          )}

          {/* COR Assignment Display */}
          {selectedCorId && (
            <div className="tm-review-section">
              <div className="tm-review-section-header">
                <h4>🔗 {t('linkedCOR')}</h4>
                <button className="tm-edit-link" onClick={() => setStep(4)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
              </div>
              <div className="tm-review-cor">
                {assignableCORs.find(c => c.id === selectedCorId)?.cor_number}: {assignableCORs.find(c => c.id === selectedCorId)?.title || 'Untitled'}
              </div>
            </div>
          )}

          {/* Dynamic Workers Review (when company has custom classes) */}
          {hasCustomLaborClasses && validDynamicWorkersList.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-section-header">
                <h4><HardHat size={16} className="inline-icon" /> {lang === 'en' ? 'Workers' : 'Trabajadores'} ({totalRegHours + totalOTHours} hrs)</h4>
                <button className="tm-edit-link" onClick={() => setStep(2)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
              </div>
              <div className="tm-review-list">
                {validDynamicWorkersList.map((w, i) => (
                  <div key={i} className="tm-review-row-detailed">
                    <div className="tm-review-worker-name">
                      <span className="tm-role-badge">{w.role}</span> {w.name}
                    </div>
                    <div className="tm-review-worker-details">
                      {w.time_started && w.time_ended && (
                        <span className="tm-review-time">{w.time_started} - {w.time_ended}</span>
                      )}
                      <span className="tm-review-hours">{w.hours || 0} reg{w.overtime_hours > 0 ? ` + ${w.overtime_hours} OT` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hardcoded Workers Review (fallback when no custom classes) */}
          {!hasCustomLaborClasses && validSupervision.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-section-header">
                <h4><UserCheck size={16} className="inline-icon" /> Supervision ({validSupervision.reduce((sum, s) => sum + parseFloat(s.hours || 0) + parseFloat(s.overtimeHours || 0), 0)} hrs)</h4>
                <button className="tm-edit-link" onClick={() => setStep(2)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
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

          {!hasCustomLaborClasses && validOperators.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-section-header">
                <h4>🚜 Operators ({validOperators.reduce((sum, o) => sum + parseFloat(o.hours || 0) + parseFloat(o.overtimeHours || 0), 0)} hrs)</h4>
                <button className="tm-edit-link" onClick={() => setStep(2)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
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

          {!hasCustomLaborClasses && validLaborers.length > 0 && (
            <div className="tm-review-section">
              <div className="tm-review-section-header">
                <h4><HardHat size={16} className="inline-icon" /> Laborers ({validLaborers.reduce((sum, l) => sum + parseFloat(l.hours || 0) + parseFloat(l.overtimeHours || 0), 0)} hrs)</h4>
                <button className="tm-edit-link" onClick={() => setStep(2)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
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
              <div className="tm-review-section-header">
                <h4><Wrench size={16} className="inline-icon" /> Materials & Equipment ({items.length} items)</h4>
                <button className="tm-edit-link" onClick={() => setStep(3)}>{lang === 'en' ? 'Edit' : 'Editar'}</button>
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

      {/* Step 6: Success & Client Signature */}
      {step === 6 && submittedTicket && (
        <div className="tm-step-content tm-success-step">
          <div className="tm-success-header">
            <div className="tm-success-icon">
              <CheckCircle2 size={48} />
            </div>
            <h2>{lang === 'en' ? 'T&M Ticket Submitted!' : '¡Ticket T&M Enviado!'}</h2>
            <p className="tm-success-subtitle">
              {lang === 'en'
                ? 'Your ticket has been saved and is ready for client signature.'
                : 'Su ticket ha sido guardado y está listo para la firma del cliente.'}
            </p>
          </div>

          <div className="tm-success-summary">
            <div className="tm-success-stat">
              <span className="tm-success-stat-value">{totalWorkers}</span>
              <span className="tm-success-stat-label">{lang === 'en' ? 'Workers' : 'Trabajadores'}</span>
            </div>
            <div className="tm-success-stat">
              <span className="tm-success-stat-value">{totalRegHours + totalOTHours}</span>
              <span className="tm-success-stat-label">{lang === 'en' ? 'Total Hours' : 'Horas Total'}</span>
            </div>
            <div className="tm-success-stat">
              <span className="tm-success-stat-value">{new Date(workDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span className="tm-success-stat-label">{lang === 'en' ? 'Work Date' : 'Fecha'}</span>
            </div>
          </div>

          {/* Failed Photos Retry Section */}
          {photos.some(p => p.status === 'failed') && (
            <div className="tm-failed-photos-section">
              <div className="tm-failed-photos-header">
                <AlertCircle size={18} />
                <span>
                  {lang === 'en'
                    ? `${photos.filter(p => p.status === 'failed').length} photo(s) failed to upload`
                    : `${photos.filter(p => p.status === 'failed').length} foto(s) no se subieron`}
                </span>
              </div>
              <div className="tm-failed-photos-grid">
                {photos.filter(p => p.status === 'failed').map(photo => (
                  <div key={photo.id} className="tm-failed-photo-item">
                    <img src={photo.previewUrl} alt={photo.name} />
                    <div className="tm-failed-photo-overlay">
                      <button
                        className="tm-retry-photo-btn"
                        onClick={() => retryPhotoUpload(photo.id, submittedTicket.id)}
                        disabled={photo.status === 'uploading' || photo.status === 'compressing'}
                      >
                        {photo.status === 'uploading' || photo.status === 'compressing' ? (
                          <Loader2 size={16} className="tm-spinner" />
                        ) : (
                          <>
                            <RotateCcw size={16} />
                            <span>{lang === 'en' ? 'Retry' : 'Reintentar'}</span>
                          </>
                        )}
                      </button>
                    </div>
                    {photo.error && (
                      <div className="tm-failed-photo-error" title={photo.error}>
                        {photo.error.substring(0, 20)}{photo.error.length > 20 ? '...' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="tm-retry-all-btn"
                onClick={async () => {
                  const failedPhotos = photos.filter(p => p.status === 'failed')
                  for (const photo of failedPhotos) {
                    await retryPhotoUpload(photo.id, submittedTicket.id)
                  }
                }}
              >
                <RotateCcw size={16} />
                {lang === 'en' ? 'Retry All Failed Photos' : 'Reintentar Todas las Fotos'}
              </button>
            </div>
          )}

          {/* Photo Upload Success Indicator */}
          {photos.length > 0 && photos.every(p => p.status === 'confirmed') && (
            <div className="tm-photos-success">
              <Check size={16} />
              <span>
                {lang === 'en'
                  ? `All ${photos.length} photo(s) uploaded successfully`
                  : `${photos.length} foto(s) subidas exitosamente`}
              </span>
            </div>
          )}

          <div className="tm-signature-options">
            <h3>{lang === 'en' ? 'Get Client Signature' : 'Obtener Firma del Cliente'}</h3>
            <p className="tm-signature-description">
              {lang === 'en'
                ? 'Have the client sign this T&M ticket to verify the work performed.'
                : 'Haga que el cliente firme este ticket T&M para verificar el trabajo realizado.'}
            </p>

            {clientSigned ? (
              /* Show signed confirmation */
              <div className="tm-signed-confirmation">
                <CheckCircle2 size={32} className="tm-signed-icon" />
                <span>{lang === 'en' ? 'Client signature collected!' : '¡Firma del cliente recopilada!'}</span>
              </div>
            ) : (
              <div className="tm-signature-buttons">
                {/* On-site signature option */}
                <button
                  className="tm-signature-option-btn primary"
                  onClick={() => setShowOnSiteSignature(true)}
                >
                  <div className="tm-signature-option-icon">
                    <PenLine size={24} />
                  </div>
                  <div className="tm-signature-option-text">
                    <span className="tm-signature-option-title">
                      {lang === 'en' ? 'Sign Now (On-Site)' : 'Firmar Ahora'}
                    </span>
                    <span className="tm-signature-option-desc">
                      {lang === 'en' ? 'Client signs on this device' : 'Cliente firma en este dispositivo'}
                    </span>
                  </div>
                </button>

                {/* Send link option */}
                <button
                  className="tm-signature-option-btn"
                  onClick={() => setShowSignatureLinkModal(true)}
                >
                  <div className="tm-signature-option-icon">
                    <Send size={24} />
                  </div>
                  <div className="tm-signature-option-text">
                    <span className="tm-signature-option-title">
                      {lang === 'en' ? 'Send Signature Link' : 'Enviar Enlace'}
                    </span>
                    <span className="tm-signature-option-desc">
                      {lang === 'en' ? 'Client signs later via link' : 'Cliente firma después vía enlace'}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signature Link Generator Modal */}
      {showSignatureLinkModal && submittedTicket && (
        <SignatureLinkGenerator
          documentType="tm_ticket"
          documentId={submittedTicket.id}
          companyId={companyId}
          projectId={project.id}
          documentTitle={`T&M - ${new Date(workDate).toLocaleDateString()}`}
          onClose={() => setShowSignatureLinkModal(false)}
          onShowToast={onShowToast}
        />
      )}

      {/* On-Site Client Signature Modal */}
      {showOnSiteSignature && submittedTicket && (
        <TMClientSignature
          ticketId={submittedTicket.id}
          ticketSummary={{
            workDate: workDate,
            workerCount: totalWorkers,
            totalHours: totalRegHours + totalOTHours
          }}
          lang={lang}
          onSave={() => {
            setShowOnSiteSignature(false)
            setClientSigned(true)
          }}
          onClose={() => setShowOnSiteSignature(false)}
          onShowToast={onShowToast}
        />
      )}

      {/* Footer */}
      {step < 6 && (
        <div className="tm-wizard-footer">
          {/* Validation Warnings */}
          {validationWarnings.length > 0 && (
            <div className="tm-validation-summary">
              <AlertCircle size={16} />
              <span>{validationWarnings[0]}</span>
            </div>
          )}

          {step === 1 && (
            <button
              className="tm-big-btn primary"
              onClick={goNext}
              disabled={!canGoNext()}
            >
              {t('nextCrew')}
            </button>
          )}

          {step === 2 && (
            <>
              <button
                className="tm-big-btn primary"
                onClick={goNext}
                disabled={!canGoNext()}
              >
                {t('nextMaterials')} ({totalWorkers} {totalWorkers === 1 ? t('worker') : t('workers_plural')}, {totalRegHours + totalOTHours} hrs)
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                className="tm-big-btn primary"
                onClick={goNext}
              >
                {lang === 'en' ? 'Next: Evidence' : 'Siguiente: Evidencia'} ({items.length} {items.length === 1 ? t('item') : t('items_plural')})
              </button>
              <button className="tm-skip-btn" onClick={goNext}>
                {t('skipNoMaterials')}
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <button
                className="tm-big-btn primary"
                onClick={goNext}
              >
                {t('reviewItems')} ({photos.length} {lang === 'en' ? 'photos' : 'fotos'})
              </button>
              <button className="tm-skip-btn" onClick={goNext}>
                {lang === 'en' ? 'Skip (no photos)' : 'Saltar (sin fotos)'}
              </button>
            </>
          )}

          {step === 5 && (
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

      {/* Step 6: Success Footer */}
      {step === 6 && (
        <div className="tm-wizard-footer">
          <button
            className="tm-big-btn primary"
            onClick={onSubmit}
          >
            <Check size={20} />
            <span>{lang === 'en' ? 'Done' : 'Listo'}</span>
          </button>
          <button className="tm-skip-btn" onClick={onSubmit}>
            {lang === 'en' ? 'Skip signature for now' : 'Saltar firma por ahora'}
          </button>
        </div>
      )}

      {/* Batch Hours Modal */}
      {showBatchHoursModal && (
        <div className="tm-modal-overlay" onClick={() => setShowBatchHoursModal(false)}>
          <div className="tm-batch-modal" onClick={(e) => e.stopPropagation()}>
            <h3><Clock size={18} /> {t('applySameHours')}</h3>
            <p className="tm-batch-description">
              {t('batchDescription')}
            </p>

            {/* Time Presets - Quick Selection */}
            <div className="tm-time-presets">
              <button type="button" className="tm-preset-btn" onClick={() => applyTimePreset('full')}>
                {t('preset8hr')}
              </button>
              <button type="button" className="tm-preset-btn" onClick={() => applyTimePreset('10hr')}>
                {t('preset10hr')}
              </button>
              <button type="button" className="tm-preset-btn" onClick={() => applyTimePreset('half')}>
                {t('preset4hr')}
              </button>
            </div>

            <div className="tm-batch-form">
              <div className="tm-batch-row">
                <div className="tm-batch-field">
                  <label>{t('timeStarted')}</label>
                  <input
                    type="time"
                    value={batchHours.timeStarted}
                    onChange={(e) => {
                      const newStart = e.target.value
                      const calculated = calculateHoursFromTimeRange(newStart, batchHours.timeEnded)
                      setBatchHours({
                        ...batchHours,
                        timeStarted: newStart,
                        ...(calculated || {})
                      })
                    }}
                  />
                </div>
                <div className="tm-batch-field">
                  <label>{t('timeEnded')}</label>
                  <input
                    type="time"
                    value={batchHours.timeEnded}
                    onChange={(e) => {
                      const newEnd = e.target.value
                      const calculated = calculateHoursFromTimeRange(batchHours.timeStarted, newEnd)
                      setBatchHours({
                        ...batchHours,
                        timeEnded: newEnd,
                        ...(calculated || {})
                      })
                    }}
                  />
                </div>
              </div>
              <div className="tm-batch-row">
                <div className="tm-batch-field">
                  <label>{t('regularHours')}</label>
                  <input
                    type="number"
                    placeholder="8"
                    value={batchHours.hours}
                    onChange={(e) => setBatchHours({ ...batchHours, hours: e.target.value })}
                  />
                </div>
                <div className="tm-batch-field">
                  <label>{t('overtimeHours')}</label>
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
              <strong>{t('willApplyTo')}:</strong>
              <span>
                {[
                  ...supervision.filter(s => s.name.trim()),
                  ...operators.filter(o => o.name.trim()),
                  ...laborers.filter(l => l.name.trim())
                ].length} {t('workers_plural')}
              </span>
            </div>

            <div className="tm-batch-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowBatchHoursModal(false)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={applyBatchHours}
                disabled={!batchHours.hours && !batchHours.overtimeHours}
              >
                {t('applyToAll')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


