/**
 * Sage 300 CRE Export Module
 *
 * Generates export files compatible with Sage 300 Construction & Real Estate.
 * Supports:
 *   - Job Cost CSV (importable via Sage Job Cost module)
 *   - General Ledger CSV (importable via Sage GL module)
 *   - Cost Code mapping export
 *   - Project summary for Sage project setup
 *
 * Sage 300 CRE uses a job/phase/cost-type/category structure:
 *   Job = Project
 *   Extra = Phase/Area
 *   Cost Type = 1:Material, 2:Labor, 3:Equipment, 4:Subcontract, 5:Other
 *   Category = Cost Code
 */

import { escapeCSV, toCSV } from './financialExport'

// Sage 300 CRE cost type codes: 1=Material, 2=Labor, 3=Equipment, 4=Subcontract, 5=Other
const SAGE_COST_TYPES = {
  material: { code: '1', label: 'Material' },
  labor: { code: '2', label: 'Labor' },
  equipment: { code: '3', label: 'Equipment' },
  subcontractor: { code: '4', label: 'Subcontract' },
  other: { code: '5', label: 'Other' }
}

// Default category (cost code) fallbacks when ticket has no cost code assigned
const DEFAULT_CATEGORIES = {
  labor: '02-000',
  material: '01-000',
  equipment: '31-000',
  subcontractor: '15-000',
  other: '01-000'
}

function downloadFile(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================
// Job Cost Transaction Export
// ============================================

/**
 * Export job cost transactions for Sage 300 CRE Job Cost import.
 *
 * Format matches Sage's CSV import template:
 * Job, Extra, Cost Type, Category, Transaction Date, Description, Units, Amount
 */
export function exportSageJobCostCSV(project, tickets, costCodes = [], laborRates = {}) {
  const headers = [
    { key: 'job', label: 'Job' },
    { key: 'extra', label: 'Extra' },
    { key: 'costType', label: 'Cost Type' },
    { key: 'category', label: 'Category' },
    { key: 'transDate', label: 'Trans Date' },
    { key: 'description', label: 'Description' },
    { key: 'units', label: 'Units' },
    { key: 'unitCost', label: 'Unit Cost' },
    { key: 'amount', label: 'Amount' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'reference', label: 'Reference' }
  ]

  const rows = []
  const jobNumber = project.job_number || project.name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')

  // Sort tickets by date for cleaner output
  const sortedTickets = [...(tickets || [])].sort((a, b) =>
    (a.work_date || '').localeCompare(b.work_date || '')
  )

  for (const ticket of sortedTickets) {
    const costCode = costCodes.find(c => c.id === ticket.cost_code_id)
    // Use different default categories for labor vs material when no cost code assigned
    const laborCategory = costCode?.code || DEFAULT_CATEGORIES.labor
    const materialCategory = costCode?.code || DEFAULT_CATEGORIES.material
    const workDate = formatSageDate(ticket.work_date)

    // Labor entries from T&M workers
    for (const worker of (ticket.t_and_m_workers || [])) {
      const regHours = parseFloat(worker.hours) || 0
      const otHours = parseFloat(worker.overtime_hours) || 0
      const rate = parseFloat(worker.rate || laborRates[worker.classification]) || 0

      if (regHours > 0) {
        rows.push({
          job: jobNumber,
          extra: '',
          costType: SAGE_COST_TYPES.labor.code,
          category: laborCategory,
          transDate: workDate,
          description: `Labor - ${worker.name || 'Worker'} (${worker.classification || 'General'})`,
          units: regHours.toFixed(2),
          unitCost: rate.toFixed(2),
          amount: (regHours * rate).toFixed(2),
          vendor: '',
          reference: `TM-${ticket.id?.substring(0, 8) || ''}`
        })
      }

      if (otHours > 0) {
        const otRate = rate * 1.5
        rows.push({
          job: jobNumber,
          extra: '',
          costType: SAGE_COST_TYPES.labor.code,
          category: laborCategory,
          transDate: workDate,
          description: `OT Labor - ${worker.name || 'Worker'} (${worker.classification || 'General'})`,
          units: otHours.toFixed(2),
          unitCost: otRate.toFixed(2),
          amount: (otHours * otRate).toFixed(2),
          vendor: '',
          reference: `TM-${ticket.id?.substring(0, 8) || ''}`
        })
      }
    }

    // Material entries from T&M items
    for (const item of (ticket.t_and_m_items || [])) {
      const qty = parseFloat(item.quantity) || 0
      const unitCost = item.materials_equipment?.cost_per_unit || 0
      if (qty > 0 && unitCost > 0) {
        rows.push({
          job: jobNumber,
          extra: '',
          costType: SAGE_COST_TYPES.material.code,
          category: materialCategory,
          transDate: workDate,
          description: `Material - ${item.materials_equipment?.name || item.description || 'Material'}`,
          units: qty.toFixed(2),
          unitCost: unitCost.toFixed(2),
          amount: (qty * unitCost).toFixed(2),
          vendor: '',
          reference: `TM-${ticket.id?.substring(0, 8) || ''}`
        })
      }
    }
  }

  const csv = toCSV(headers, rows)
  const filename = `Sage_JobCost_${jobNumber}_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)

  return { rows, filename }
}

// ============================================
// Change Order Export for Sage
// ============================================

/**
 * Export approved change orders for Sage 300 CRE budget revision.
 */
export function exportSageChangeOrdersCSV(project, changeOrders = []) {
  const headers = [
    { key: 'job', label: 'Job' },
    { key: 'coNumber', label: 'CO Number' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'approvedDate', label: 'Approved Date' },
    { key: 'laborAmount', label: 'Labor Amount' },
    { key: 'materialAmount', label: 'Material Amount' },
    { key: 'equipmentAmount', label: 'Equipment Amount' },
    { key: 'subcontractAmount', label: 'Subcontract Amount' },
    { key: 'totalAmount', label: 'Total Amount' },
    { key: 'markupPct', label: 'Markup %' },
    { key: 'totalWithMarkup', label: 'Total with Markup' }
  ]

  const jobNumber = project.job_number || project.name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')

  const rows = changeOrders.map(co => {
    const labor = (co.change_order_labor || []).reduce((s, l) => s + (parseInt(l.total) || 0), 0) / 100
    const materials = (co.change_order_materials || []).reduce((s, m) => s + (parseInt(m.total) || 0), 0) / 100
    const equipment = (co.change_order_equipment || []).reduce((s, e) => s + (parseInt(e.total) || 0), 0) / 100
    const subs = (co.change_order_subcontractors || []).reduce((s, sc) => s + (parseInt(sc.total) || 0), 0) / 100
    const subtotal = labor + materials + equipment + subs
    const total = (co.cor_total || 0) / 100

    return {
      job: jobNumber,
      coNumber: co.cor_number || '',
      description: co.title || '',
      status: co.status || '',
      approvedDate: co.approved_at ? formatSageDate(co.approved_at.split('T')[0]) : '',
      laborAmount: labor.toFixed(2),
      materialAmount: materials.toFixed(2),
      equipmentAmount: equipment.toFixed(2),
      subcontractAmount: subs.toFixed(2),
      totalAmount: subtotal.toFixed(2),
      markupPct: subtotal > 0 ? ((total - subtotal) / subtotal * 100).toFixed(1) : '0.0',
      totalWithMarkup: total.toFixed(2)
    }
  })

  const csv = toCSV(headers, rows)
  const filename = `Sage_ChangeOrders_${jobNumber}_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)

  return { rows, filename }
}

// ============================================
// Cost Code Mapping Export
// ============================================

/**
 * Export cost codes in Sage 300 CRE category import format.
 */
export function exportSageCostCodesCSV(costCodes, companyName = '') {
  const headers = [
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'costType', label: 'Cost Type' },
    { key: 'costTypeDesc', label: 'Cost Type Description' },
    { key: 'parentCategory', label: 'Parent Category' },
    { key: 'active', label: 'Active' }
  ]

  const rows = (costCodes || []).map(cc => ({
    category: cc.code,
    description: cc.description,
    costType: SAGE_COST_TYPES[cc.category]?.code || '5',
    costTypeDesc: SAGE_COST_TYPES[cc.category]?.label || 'Other',
    parentCategory: cc.parent_code || '',
    active: cc.is_active ? 'Y' : 'N'
  }))

  const csv = toCSV(headers, rows)
  const safeName = (companyName || 'company').replace(/[^a-zA-Z0-9]/g, '_')
  const filename = `Sage_CostCodes_${safeName}_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)

  return { rows, filename }
}

// ============================================
// Project Summary Export
// ============================================

/**
 * Export project setup data for Sage 300 CRE job creation.
 */
export function exportSageProjectSetupCSV(project, areas, financialData = {}) {
  const headers = [
    { key: 'field', label: 'Field' },
    { key: 'value', label: 'Value' }
  ]

  const jobNumber = project.job_number || ''
  const rows = [
    { field: 'Job Number', value: jobNumber },
    { field: 'Job Name', value: project.name },
    { field: 'Status', value: project.status || 'active' },
    { field: 'Contract Amount', value: (project.contract_value || 0).toFixed(2) },
    { field: 'Start Date', value: project.start_date || '' },
    { field: 'End Date', value: project.end_date || '' },
    { field: 'Work Type', value: project.work_type || '' },
    { field: 'Address', value: project.address || '' },
    { field: '', value: '' },
    { field: 'SCHEDULE OF VALUES', value: '' }
  ]

  // Add areas as SOV lines
  for (const area of (areas || [])) {
    rows.push({
      field: `SOV - ${area.name}`,
      value: (area.sov_value || area.weight || 0).toFixed(2)
    })
  }

  rows.push({ field: '', value: '' })
  rows.push({ field: 'FINANCIAL SUMMARY', value: '' })

  // Map from projectData field names (billable, laborCost, etc.)
  const earnedRevenue = financialData.billable || financialData.earnedRevenue || financialData.earnedValue || 0
  const totalLaborCost = financialData.laborCost || financialData.totalLaborCost || 0
  const totalMaterialCost = financialData.materialsEquipmentCost || financialData.totalMaterialCost || 0
  const totalCosts = financialData.allCostsTotal || financialData.totalCosts || 0
  const profit = earnedRevenue - totalCosts

  rows.push({ field: 'Earned Revenue', value: earnedRevenue.toFixed(2) })
  rows.push({ field: 'Total Labor Cost', value: totalLaborCost.toFixed(2) })
  rows.push({ field: 'Total Material Cost', value: totalMaterialCost.toFixed(2) })
  rows.push({ field: 'Total Costs', value: totalCosts.toFixed(2) })
  rows.push({ field: 'Profit', value: profit.toFixed(2) })

  const csv = toCSV(headers, rows)
  const safeName = (project.name || 'project').replace(/[^a-zA-Z0-9]/g, '_')
  const filename = `Sage_ProjectSetup_${safeName}_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)

  return { rows, filename }
}

// ============================================
// WIP Schedule Export (Sage-compatible)
// ============================================

/**
 * Generate Work-In-Progress schedule matching Sage 300 CRE WIP format.
 * Shows over/under billing per project.
 */
export function exportSageWIPScheduleCSV(projects, projectDataMap = {}) {
  const headers = [
    { key: 'job', label: 'Job Number' },
    { key: 'name', label: 'Job Name' },
    { key: 'contractValue', label: 'Contract Value' },
    { key: 'approvedCOs', label: 'Approved COs' },
    { key: 'revisedContract', label: 'Revised Contract' },
    { key: 'percentComplete', label: '% Complete' },
    { key: 'earnedRevenue', label: 'Earned Revenue' },
    { key: 'totalBilled', label: 'Total Billed' },
    { key: 'overUnderBilling', label: 'Over/(Under) Billing' },
    { key: 'totalCosts', label: 'Total Costs' },
    { key: 'projectedProfit', label: 'Projected Profit' },
    { key: 'profitMargin', label: 'Profit Margin %' }
  ]

  const rows = projects.map(p => {
    const data = projectDataMap[p.id] || {}
    const contractValue = p.contract_value || 0
    const approvedCOs = data.changeOrderValue || 0
    const revisedContract = contractValue + approvedCOs
    const progress = data.progress || 0
    const earnedRevenue = data.billable || data.earnedRevenue || (revisedContract * (progress / 100))
    const totalBilled = data.totalBilled || earnedRevenue
    const overUnder = totalBilled - earnedRevenue
    const totalCosts = data.allCostsTotal || data.totalCosts || 0
    const projectedProfit = progress > 0 ? revisedContract - (totalCosts / (progress / 100)) : revisedContract
    const margin = revisedContract > 0 ? ((revisedContract - totalCosts) / revisedContract * 100) : 0

    return {
      job: p.job_number || '',
      name: p.name,
      contractValue: contractValue.toFixed(2),
      approvedCOs: approvedCOs.toFixed(2),
      revisedContract: revisedContract.toFixed(2),
      percentComplete: progress.toFixed(1),
      earnedRevenue: earnedRevenue.toFixed(2),
      totalBilled: totalBilled.toFixed(2),
      overUnderBilling: overUnder.toFixed(2),
      totalCosts: totalCosts.toFixed(2),
      projectedProfit: projectedProfit.toFixed(2),
      profitMargin: margin.toFixed(1)
    }
  })

  const csv = toCSV(headers, rows)
  const filename = `Sage_WIP_Schedule_${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename)

  return { rows, filename }
}

// ============================================
// Helpers
// ============================================

function formatSageDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}
