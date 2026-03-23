// ============================================
// COR (Change Order Request) Calculations
// ============================================
// Utility functions for client-side calculations
// All monetary values are stored in cents to avoid floating point issues

import { parseLocalDate } from './utils'

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

  // Calculate markups (use ?? to allow 0% markup)
  const laborMarkupAmount = calculateMarkup(laborSubtotal, cor.labor_markup_percent ?? 1500)
  const materialsMarkupAmount = calculateMarkup(materialsSubtotal, cor.materials_markup_percent ?? 1500)
  const equipmentMarkupAmount = calculateMarkup(equipmentSubtotal, cor.equipment_markup_percent ?? 1500)
  const subcontractorsMarkupAmount = calculateMarkup(subcontractorsSubtotal, cor.subcontractors_markup_percent ?? 500)

  // COR subtotal (all costs + all markups)
  const corSubtotal = laborSubtotal + materialsSubtotal + equipmentSubtotal + subcontractorsSubtotal +
                      laborMarkupAmount + materialsMarkupAmount + equipmentMarkupAmount + subcontractorsMarkupAmount

  // Calculate additional fees (use ?? to allow 0% fees)
  const liabilityInsuranceAmount = calculateFee(corSubtotal, cor.liability_insurance_percent ?? 144)
  const bondAmount = calculateFee(corSubtotal, cor.bond_percent ?? 100)
  const licenseFeeAmount = calculateFee(corSubtotal, cor.license_fee_percent ?? 10)

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

  // Required fields: title and description only
  if (!cor.title?.trim()) {
    errors.push('Title is required')
  }
  if (!cor.scope_of_work?.trim()) {
    errors.push('Description is required')
  }

  // Date validation (only if both dates provided)
  if (cor.period_start && cor.period_end) {
    const start = new Date(cor.period_start)
    const end = new Date(cor.period_end)
    if (end < start) {
      errors.push('End date must be after start date')
    }
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
  const date = parseLocalDate(dateStr)
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
  license_fee: 10 // 0.10%
}

// Labor classes for dropdown
export const LABOR_CLASSES = [
  'Foreman',
  'Superintendent',
  'Operator',
  'Laborer'
]

// Group labor items by labor_class and wage_type
// Returns an array of { laborClass, wageType, label, items, subtotal } groups
export const groupLaborByClassAndType = (laborItems) => {
  if (!laborItems?.length) return []

  const groupMap = new Map()

  for (const item of laborItems) {
    const cls = item.labor_class || 'Laborer'
    const type = item.wage_type || 'standard'
    const key = `${cls}::${type}`

    if (!groupMap.has(key)) {
      groupMap.set(key, { laborClass: cls, wageType: type, items: [] })
    }
    groupMap.get(key).items.push(item)
  }

  // Sort groups: by LABOR_CLASSES order, then by wage_type order
  const classOrder = LABOR_CLASSES.reduce((m, c, i) => { m[c] = i; return m }, {})
  const typeOrder = { standard: 0, pla: 1, prevailing: 2 }

  const groups = Array.from(groupMap.values())
  groups.sort((a, b) => {
    const ca = classOrder[a.laborClass] ?? 99
    const cb = classOrder[b.laborClass] ?? 99
    if (ca !== cb) return ca - cb
    return (typeOrder[a.wageType] ?? 99) - (typeOrder[b.wageType] ?? 99)
  })

  // Calculate subtotals and labels
  const wageLabels = { standard: 'Standard', pla: 'PLA', prevailing: 'Prevailing Wage' }
  return groups.map(g => ({
    ...g,
    label: `${g.laborClass} — ${wageLabels[g.wageType] || g.wageType}`,
    subtotal: g.items.reduce((sum, item) => sum + (parseInt(item.total) || 0), 0)
  }))
}

// Combine labor items within a group by rate, summing hours
// Items with the same reg/OT rates get merged into a single row with combined hours
export const combineLaborGroupItems = (items) => {
  if (!items?.length) return []

  const rateMap = new Map()

  for (const item of items) {
    const regRate = parseInt(item.regular_rate) || 0
    const otRate = parseInt(item.overtime_rate) || 0
    const key = `${regRate}::${otRate}`

    if (!rateMap.has(key)) {
      rateMap.set(key, {
        labor_class: item.labor_class,
        wage_type: item.wage_type,
        regular_hours: 0,
        overtime_hours: 0,
        regular_rate: item.regular_rate,
        overtime_rate: item.overtime_rate,
        total: 0,
        source_count: 0
      })
    }
    const combined = rateMap.get(key)
    combined.regular_hours = parseFloat(combined.regular_hours || 0) + parseFloat(item.regular_hours || 0)
    combined.overtime_hours = parseFloat(combined.overtime_hours || 0) + parseFloat(item.overtime_hours || 0)
    combined.total = (parseInt(combined.total) || 0) + (parseInt(item.total) || 0)
    combined.source_count += 1
  }

  return Array.from(rateMap.values())
}

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
