// ============================================
// COR (Change Order Request) Calculations
// ============================================
// Utility functions for client-side calculations
// All monetary values are stored in cents to avoid floating point issues

// Helper to convert cents to dollars with formatting
export const centsToDollars = (cents) => {
  const dollars = (cents || 0) / 100
  return dollars.toFixed(2)
}

// Helper to format cents as currency
export const formatCurrency = (cents) => {
  const dollars = (cents || 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(dollars)
}

// Helper to convert dollars to cents
export const dollarsToCents = (dollars) => {
  return Math.round((parseFloat(dollars) || 0) * 100)
}

// Helper to convert basis points to percentage (1500 -> 15.00)
export const basisPointsToPercent = (bp) => {
  return ((bp || 0) / 100).toFixed(2)
}

// Helper to format basis points as percentage string (1500 -> "15.00%")
export const formatPercent = (bp) => {
  return `${basisPointsToPercent(bp)}%`
}

// Helper to convert percentage to basis points (15.00 -> 1500)
export const percentToBasisPoints = (pct) => {
  return Math.round((parseFloat(pct) || 0) * 100)
}

// Calculate labor item totals
export const calculateLaborItemTotal = (regularHours, overtimeHours, regularRate, overtimeRate) => {
  const regHrs = parseFloat(regularHours) || 0
  const otHrs = parseFloat(overtimeHours) || 0
  const regRate = parseInt(regularRate) || 0
  const otRate = parseInt(overtimeRate) || 0

  const regularTotal = Math.round(regHrs * regRate)
  const overtimeTotal = Math.round(otHrs * otRate)
  const total = regularTotal + overtimeTotal

  return {
    regularTotal,
    overtimeTotal,
    total
  }
}

// Calculate line item total (for materials, equipment, subcontractors)
export const calculateLineItemTotal = (quantity, unitCost) => {
  const qty = parseFloat(quantity) || 0
  const cost = parseInt(unitCost) || 0
  return Math.round(qty * cost)
}

// Calculate markup amount from subtotal and basis points
export const calculateMarkup = (subtotal, markupBasisPoints) => {
  const sub = parseInt(subtotal) || 0
  const bp = parseInt(markupBasisPoints) || 0
  return Math.round((sub * bp) / 10000)
}

// Calculate fee amount from subtotal and basis points
export const calculateFee = (subtotal, feeBasisPoints) => {
  const sub = parseInt(subtotal) || 0
  const bp = parseInt(feeBasisPoints) || 0
  return Math.round((sub * bp) / 10000)
}

// Calculate complete COR totals from line items and percentages
export const calculateCORTotals = (cor) => {
  // Sum up subtotals from line items
  const laborSubtotal = (cor.change_order_labor || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )
  const materialsSubtotal = (cor.change_order_materials || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )
  const equipmentSubtotal = (cor.change_order_equipment || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )
  const subcontractorsSubtotal = (cor.change_order_subcontractors || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )

  // Calculate markups
  const laborMarkupAmount = calculateMarkup(laborSubtotal, cor.labor_markup_percent || 1500)
  const materialsMarkupAmount = calculateMarkup(materialsSubtotal, cor.materials_markup_percent || 1500)
  const equipmentMarkupAmount = calculateMarkup(equipmentSubtotal, cor.equipment_markup_percent || 1500)
  const subcontractorsMarkupAmount = calculateMarkup(subcontractorsSubtotal, cor.subcontractors_markup_percent || 500)

  // COR subtotal (all costs + all markups)
  const corSubtotal = laborSubtotal + materialsSubtotal + equipmentSubtotal + subcontractorsSubtotal +
                      laborMarkupAmount + materialsMarkupAmount + equipmentMarkupAmount + subcontractorsMarkupAmount

  // Calculate additional fees
  const liabilityInsuranceAmount = calculateFee(corSubtotal, cor.liability_insurance_percent || 144)
  const bondAmount = calculateFee(corSubtotal, cor.bond_percent || 100)
  const licenseFeeAmount = calculateFee(corSubtotal, cor.license_fee_percent || 10)

  const additionalFeesTotal = liabilityInsuranceAmount + bondAmount + licenseFeeAmount

  // Final COR total
  const corTotal = corSubtotal + additionalFeesTotal

  return {
    // Subtotals
    labor_subtotal: laborSubtotal,
    materials_subtotal: materialsSubtotal,
    equipment_subtotal: equipmentSubtotal,
    subcontractors_subtotal: subcontractorsSubtotal,

    // Markup amounts
    labor_markup_amount: laborMarkupAmount,
    materials_markup_amount: materialsMarkupAmount,
    equipment_markup_amount: equipmentMarkupAmount,
    subcontractors_markup_amount: subcontractorsMarkupAmount,

    // Fees
    liability_insurance_amount: liabilityInsuranceAmount,
    bond_amount: bondAmount,
    license_fee_amount: licenseFeeAmount,
    additional_fees_total: additionalFeesTotal,

    // Totals
    cor_subtotal: corSubtotal,
    cor_total: corTotal
  }
}

// Validate COR before submission
export const validateCOR = (cor) => {
  const errors = []

  // Required fields
  if (!cor.title?.trim()) {
    errors.push('Title is required')
  }
  if (!cor.scope_of_work?.trim()) {
    errors.push('Scope of work is required')
  }
  if (!cor.period_start) {
    errors.push('Start date is required')
  }
  if (!cor.period_end) {
    errors.push('End date is required')
  }

  // Date validation
  if (cor.period_start && cor.period_end) {
    const start = new Date(cor.period_start)
    const end = new Date(cor.period_end)
    if (end < start) {
      errors.push('End date must be after start date')
    }
  }

  // Line items validation
  const hasLabor = (cor.change_order_labor || []).length > 0
  const hasMaterials = (cor.change_order_materials || []).length > 0
  const hasEquipment = (cor.change_order_equipment || []).length > 0
  const hasSubcontractors = (cor.change_order_subcontractors || []).length > 0

  if (!hasLabor && !hasMaterials && !hasEquipment && !hasSubcontractors) {
    errors.push('At least one line item (labor, materials, equipment, or subcontractor) is required')
  }

  // Totals validation
  const totals = calculateCORTotals(cor)
  if (totals.cor_total <= 0) {
    errors.push('COR total must be greater than zero')
  }

  // Markup percentage validation (should be reasonable)
  const maxMarkup = 5000 // 50%
  if (cor.labor_markup_percent > maxMarkup) {
    errors.push('Labor markup percentage seems too high (>50%)')
  }
  if (cor.materials_markup_percent > maxMarkup) {
    errors.push('Materials markup percentage seems too high (>50%)')
  }
  if (cor.equipment_markup_percent > maxMarkup) {
    errors.push('Equipment markup percentage seems too high (>50%)')
  }
  if (cor.subcontractors_markup_percent > maxMarkup) {
    errors.push('Subcontractors markup percentage seems too high (>50%)')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// Get status display info
export const getStatusInfo = (status) => {
  const statusMap = {
    draft: {
      label: 'Draft',
      color: '#6b7280', // gray
      bgColor: '#f3f4f6'
    },
    pending_approval: {
      label: 'Pending Approval',
      color: '#d97706', // amber
      bgColor: '#fef3c7'
    },
    approved: {
      label: 'Approved',
      color: '#059669', // green
      bgColor: '#d1fae5'
    },
    rejected: {
      label: 'Rejected',
      color: '#dc2626', // red
      bgColor: '#fee2e2'
    },
    billed: {
      label: 'Billed',
      color: '#2563eb', // blue
      bgColor: '#dbeafe'
    },
    closed: {
      label: 'Closed',
      color: '#4b5563', // gray-dark
      bgColor: '#e5e7eb'
    }
  }

  return statusMap[status] || statusMap.draft
}

// Format date for display
export const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Format date range
export const formatDateRange = (startStr, endStr) => {
  const start = formatDate(startStr)
  const end = formatDate(endStr)
  if (start && end) {
    return `${start} - ${end}`
  }
  return start || end || ''
}

// Default markup and fee percentages (in basis points)
export const DEFAULT_PERCENTAGES = {
  labor_markup: 1500, // 15.00%
  materials_markup: 1500, // 15.00%
  equipment_markup: 1500, // 15.00%
  subcontractors_markup: 500, // 5.00%
  liability_insurance: 144, // 1.44%
  bond: 100, // 1.00%
  license_fee: 10 // 0.10% (approximation of 0.101%)
}

// Labor classes for dropdown
export const LABOR_CLASSES = [
  'Foreman',
  'Superintendent',
  'Operator',
  'Laborer'
]

// Wage types for dropdown
export const WAGE_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'pla', label: 'PLA (Project Labor Agreement)' },
  { value: 'prevailing', label: 'Prevailing Wage' }
]

// Source types for line items
export const SOURCE_TYPES = {
  materials: [
    { value: 'backup_sheet', label: 'Backup Sheet' },
    { value: 'invoice', label: 'Invoice' },
    { value: 'mobilization', label: 'Mobilization' },
    { value: 'custom', label: 'Custom Entry' }
  ],
  equipment: [
    { value: 'backup_sheet', label: 'Backup Sheet' },
    { value: 'invoice', label: 'Invoice' },
    { value: 'custom', label: 'Custom Entry' }
  ],
  subcontractors: [
    { value: 'invoice', label: 'Invoice' },
    { value: 'quote', label: 'Quote' },
    { value: 'custom', label: 'Custom Entry' }
  ]
}

// Common units for line items
export const COMMON_UNITS = [
  'each',
  'day',
  'week',
  'month',
  'hour',
  'sqft',
  'lf',
  'gallon',
  'pound',
  'ton',
  'cy',
  'lump sum'
]
