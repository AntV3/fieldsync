export const CATEGORIES = ['Containment', 'PPE', 'Disposal', 'Equipment']

export const TRANSLATIONS = {
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

// Helper to create a translation function for a given language
export const createT = (lang) => (key) => TRANSLATIONS[lang]?.[key] || key
