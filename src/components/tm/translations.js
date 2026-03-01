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
    certifyStatement: 'I certify that this Time & Material ticket accurately reflects the work performed.',
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
    submitTM: 'Submit Ticket',
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
    assignedToCOR: 'Assigned to COR',

    // Evidence step
    photoEvidence: 'Photo Evidence',
    photosAdded: 'photo(s) added',
    recommendedForBilling: 'Recommended for billing',
    addMorePhotos: 'Add More Photos',
    linkToChangeOrder: 'Link to Change Order',
    linkedTo: 'Linked to',
    optionalLinkCOR: 'Optional - Link this ticket to a COR',
    selectCOROptional: '-- Select a COR (optional) --',
    noActiveCORs: 'No active CORs available for this project',

    // TMForm inline strings
    addWorkersFirst: 'Add workers first',
    errorLoadingCrew: 'Error loading previous crew',
    descriptionRecommended: 'Description recommended',
    workersNoHours: 'worker(s) have no hours entered',
    nameRequired: 'Name required to submit',
    submitted: 'Submitted',
    switchToSpanish: 'Cambiar a Espanol',
    switchToEnglish: 'Switch to English',
    reviewAndSubmit: 'Review & Submit',
    enterNameToSubmit: 'Enter name to submit',
    done: 'Done',
    skipSignature: 'Skip signature for now',

    // CrewHoursStep inline strings
    total: 'total',
    needHours: 'need hours',
    customHours: 'Custom hours',
    selectTMWorkers: 'Select Workers',
    tapToAdd: 'Tap to add',
    removeClass: 'Remove this labor class',
    add: 'Add',
    addLaborClass: 'Add Labor Class...',
    other: 'Other',
    noCustomClasses: 'No custom labor classes set up for this company. Using default categories.',
    loadingLaborClasses: 'Loading labor classes...',
    noLaborClassesYet: 'No labor classes added yet. Select from crew check-in above or add manually:',

    // ReviewStep inline strings
    tmSubmitted: 'Time & Material Ticket Submitted!',
    ticketSavedReady: 'Your ticket has been saved and is ready for client signature.',
    workersLabel: 'Workers',
    retry: 'Retry',
    retryAllPhotos: 'Retry All Failed Photos',
    getClientSignature: 'Get Client Signature',
    signatureDescription: 'Have the client sign this ticket to verify the work performed.',
    clientSignatureCollected: 'Client signature collected!',
    signNowOnSite: 'Sign Now (On-Site)',
    clientSignsDevice: 'Client signs on this device',
    sendSignatureLink: 'Send Signature Link',
    clientSignsLater: 'Client signs later via link',
    ticketSummary: 'Ticket Summary',
    edit: 'Edit',
    submittedBy: 'Submitted By',
    enterYourName: 'Enter your name',
    certifyAccurate: 'By submitting, you certify this Time & Material ticket is accurate.'
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
    certifyStatement: 'Certifico que este ticket de Tiempo y Material refleja con precision el trabajo realizado.',
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
    submitTM: 'Enviar Ticket',
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
    assignedToCOR: 'Asignado a COR',

    // Evidence step
    photoEvidence: 'Evidencia Fotogr\u00e1fica',
    photosAdded: 'foto(s) agregada(s)',
    recommendedForBilling: 'Recomendado para facturaci\u00f3n',
    addMorePhotos: 'Agregar M\u00e1s Fotos',
    linkToChangeOrder: 'Vincular a Orden de Cambio',
    linkedTo: 'Vinculado a',
    optionalLinkCOR: 'Opcional - Vincular este ticket a un COR',
    selectCOROptional: '-- Seleccionar COR (opcional) --',
    noActiveCORs: 'No hay CORs activos para este proyecto',

    // TMForm inline strings
    addWorkersFirst: 'Agregue trabajadores primero',
    errorLoadingCrew: 'Error cargando equipo anterior',
    descriptionRecommended: 'Descripcion recomendada',
    workersNoHours: 'trabajador(es) sin horas',
    nameRequired: 'Nombre requerido',
    submitted: 'Enviado',
    switchToSpanish: 'Cambiar a Espanol',
    switchToEnglish: 'Switch to English',
    reviewAndSubmit: 'Revisar y Enviar',
    enterNameToSubmit: 'Ingrese nombre',
    done: 'Listo',
    skipSignature: 'Saltar firma por ahora',

    // CrewHoursStep inline strings
    total: 'total',
    needHours: 'sin horas',
    customHours: 'Horas personalizadas',
    selectTMWorkers: 'Seleccionar Trabajadores',
    tapToAdd: 'Toca para agregar',
    removeClass: 'Eliminar esta clase',
    add: 'Agregar',
    addLaborClass: 'Agregar Clase de Trabajo...',
    other: 'Otros',
    noCustomClasses: 'No hay clases de trabajo personalizadas. Usando categorias predeterminadas.',
    loadingLaborClasses: 'Cargando clases de trabajo...',
    noLaborClassesYet: 'No hay clases de trabajo agregadas. Seleccione del check-in o agregue manualmente:',

    // ReviewStep inline strings
    tmSubmitted: '\u00a1Ticket de Tiempo y Material Enviado!',
    ticketSavedReady: 'Su ticket ha sido guardado y est\u00e1 listo para la firma del cliente.',
    workersLabel: 'Trabajadores',
    retry: 'Reintentar',
    retryAllPhotos: 'Reintentar Todas las Fotos',
    getClientSignature: 'Obtener Firma del Cliente',
    signatureDescription: 'Haga que el cliente firme este ticket para verificar el trabajo realizado.',
    clientSignatureCollected: '\u00a1Firma del cliente recopilada!',
    signNowOnSite: 'Firmar Ahora',
    clientSignsDevice: 'Cliente firma en este dispositivo',
    sendSignatureLink: 'Enviar Enlace',
    clientSignsLater: 'Cliente firma despu\u00e9s v\u00eda enlace',
    ticketSummary: 'Resumen del Ticket',
    edit: 'Editar',
    submittedBy: 'Enviado Por',
    enterYourName: 'Ingrese su nombre',
    certifyAccurate: 'Al enviar, certifica que este ticket de Tiempo y Material es preciso.'
  }
}

// Helper to create a translation function for a given language
export const createT = (lang) => (key) => TRANSLATIONS[lang]?.[key] || key
