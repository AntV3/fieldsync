/**
 * Sage 300 CRE Export Service
 *
 * Service layer that queries Supabase and formats data for Sage 300 CRE import.
 * Uses the existing db facade for all database operations.
 */

import { supabase, isSupabaseConfigured } from '../supabaseClient'
import { observe } from '../observability'

// Sage 300 CRE cost type codes: 1=Material, 2=Labor, 3=Equipment, 4=Subcontract, 5=Other
const SAGE_COST_TYPE_MAP = {
  material: 1,
  labor: 2,
  equipment: 3,
  subcontractor: 4,
  other: 5
}

// Default category (cost code) fallbacks when ticket has no cost code assigned
const DEFAULT_CATEGORIES = {
  labor: '02-000',
  material: '01-000',
  equipment: '31-000',
  subcontractor: '15-000',
  other: '01-000'
}

/**
 * Export T&M ticket costs grouped by cost code in Sage's Job Cost Transaction format.
 * Queries tickets for the given project, joins cost codes and worker/item data,
 * and returns rows ready for CSV generation.
 *
 * @param {string} projectId - UUID of the project
 * @param {object} [options] - Optional filters
 * @param {string} [options.startDate] - Filter tickets on or after this date (YYYY-MM-DD)
 * @param {string} [options.endDate] - Filter tickets on or before this date (YYYY-MM-DD)
 * @returns {Promise<{ rows: object[], summary: object }>}
 */
export async function exportJobCostTransactions(projectId, options = {}) {
  if (!isSupabaseConfigured || !projectId) return { rows: [], summary: {} }

  const start = performance.now()
  try {
    // Fetch project for job number
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, name, job_number')
      .eq('id', projectId)
      .single()

    if (projErr) throw projErr

    // Fetch T&M tickets with workers and items, joined to cost codes
    let query = supabase
      .from('t_and_m_tickets')
      .select(`
        id, work_date, notes, status,
        cost_code_id,
        cost_codes (id, code, description, category),
        t_and_m_workers (name, classification, hours, overtime_hours, rate),
        t_and_m_items (description, quantity, materials_equipment (name, cost_per_unit))
      `)
      .eq('project_id', projectId)
      .order('work_date', { ascending: true })

    if (options.startDate) {
      query = query.gte('work_date', options.startDate)
    }
    if (options.endDate) {
      query = query.lte('work_date', options.endDate)
    }

    const { data: tickets, error: ticketErr } = await query
    if (ticketErr) throw ticketErr

    const jobNumber = project.job_number || project.name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')
    const rows = []
    let totalAmount = 0
    let totalLaborAmount = 0
    let totalMaterialAmount = 0

    for (const ticket of (tickets || [])) {
      const costCode = ticket.cost_codes
      const workDate = formatSageDate(ticket.work_date)
      // Use the ticket's cost code if assigned, otherwise use type-specific defaults
      const laborCategory = costCode?.code || DEFAULT_CATEGORIES.labor
      const materialCategory = costCode?.code || DEFAULT_CATEGORIES.material

      // Labor entries
      let laborTotal = 0
      for (const worker of (ticket.t_and_m_workers || [])) {
        const regHours = parseFloat(worker.hours) || 0
        const otHours = parseFloat(worker.overtime_hours) || 0
        const rate = parseFloat(worker.rate) || 0

        if (regHours > 0) {
          const amount = regHours * rate
          totalAmount += amount
          laborTotal += amount
          rows.push({
            'Job Number': jobNumber,
            'Extra': '',
            'Cost Type': SAGE_COST_TYPE_MAP.labor,
            'Category': laborCategory,
            'Trans Date': workDate,
            'Description': `Labor - ${worker.name || 'Worker'} (${worker.classification || 'General'})`,
            'Units': regHours.toFixed(2),
            'Unit Cost': rate.toFixed(2),
            'Amount': amount.toFixed(2),
            'Vendor': worker.name || '',
            'Reference': `TM-${ticket.id?.substring(0, 8) || ''}`
          })
        }

        if (otHours > 0) {
          const otRate = rate * 1.5
          const amount = otHours * otRate
          totalAmount += amount
          laborTotal += amount
          rows.push({
            'Job Number': jobNumber,
            'Extra': '',
            'Cost Type': SAGE_COST_TYPE_MAP.labor,
            'Category': laborCategory,
            'Trans Date': workDate,
            'Description': `OT Labor - ${worker.name || 'Worker'} (${worker.classification || 'General'})`,
            'Units': otHours.toFixed(2),
            'Unit Cost': otRate.toFixed(2),
            'Amount': amount.toFixed(2),
            'Vendor': worker.name || '',
            'Reference': `TM-${ticket.id?.substring(0, 8) || ''}`
          })
        }
      }

      // Material entries
      let materialTotal = 0
      for (const item of (ticket.t_and_m_items || [])) {
        const qty = parseFloat(item.quantity) || 0
        const unitCost = item.materials_equipment?.cost_per_unit || 0
        if (qty > 0 && unitCost > 0) {
          const amount = qty * unitCost
          totalAmount += amount
          materialTotal += amount
          rows.push({
            'Job Number': jobNumber,
            'Extra': '',
            'Cost Type': SAGE_COST_TYPE_MAP.material,
            'Category': materialCategory,
            'Trans Date': workDate,
            'Description': `Material - ${item.materials_equipment?.name || item.description || 'Material'}`,
            'Units': qty.toFixed(2),
            'Unit Cost': unitCost.toFixed(2),
            'Amount': amount.toFixed(2),
            'Vendor': '',
            'Reference': `TM-${ticket.id?.substring(0, 8) || ''}`
          })
        }
      }

      totalLaborAmount += laborTotal
      totalMaterialAmount += materialTotal
    }

    const duration = Math.round(performance.now() - start)
    observe.query('exportJobCostTransactions', { duration, rows: rows.length, project_id: projectId })

    return {
      rows,
      summary: {
        rowCount: rows.length,
        totalAmount,
        totalLaborAmount,
        totalMaterialAmount,
        ticketCount: (tickets || []).length,
        jobNumber,
        projectName: project.name
      }
    }
  } catch (error) {
    observe.error('database', { message: error.message, operation: 'exportJobCostTransactions', project_id: projectId })
    throw error
  }
}

/**
 * Export approved CORs in Sage's Change Order format.
 *
 * @param {string} projectId - UUID of the project
 * @returns {Promise<{ rows: object[], summary: object }>}
 */
export async function exportChangeOrderSummary(projectId) {
  if (!isSupabaseConfigured || !projectId) return { rows: [], summary: {} }

  const start = performance.now()
  try {
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, name, job_number')
      .eq('id', projectId)
      .single()

    if (projErr) throw projErr

    const { data: cors, error: corErr } = await supabase
      .from('change_order_requests')
      .select(`
        id, cor_number, title, status, cor_total, approved_at,
        cost_code_id,
        cost_codes (code, description, category),
        change_order_labor (description, total),
        change_order_materials (description, total),
        change_order_equipment (description, total),
        change_order_subcontractors (description, total)
      `)
      .eq('project_id', projectId)
      .order('cor_number', { ascending: true })

    if (corErr) throw corErr

    const jobNumber = project.job_number || project.name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')
    const rows = []
    let totalOriginal = 0
    let totalRevised = 0

    for (const co of (cors || [])) {
      const labor = (co.change_order_labor || []).reduce((s, l) => s + (parseInt(l.total) || 0), 0) / 100
      const materials = (co.change_order_materials || []).reduce((s, m) => s + (parseInt(m.total) || 0), 0) / 100
      const equipment = (co.change_order_equipment || []).reduce((s, e) => s + (parseInt(e.total) || 0), 0) / 100
      const subs = (co.change_order_subcontractors || []).reduce((s, sc) => s + (parseInt(sc.total) || 0), 0) / 100
      const originalAmount = labor + materials + equipment + subs
      const revisedAmount = (co.cor_total || 0) / 100

      totalOriginal += originalAmount
      totalRevised += revisedAmount

      rows.push({
        'Job Number': jobNumber,
        'Change Order Number': co.cor_number || '',
        'Description': co.title || '',
        'Status': co.status || '',
        'Original Amount': originalAmount.toFixed(2),
        'Revised Amount': revisedAmount.toFixed(2),
        'Approved Date': co.approved_at ? formatSageDate(co.approved_at.split('T')[0]) : '',
        'Cost Code': co.cost_codes?.code || '',
        'Labor': labor.toFixed(2),
        'Material': materials.toFixed(2),
        'Equipment': equipment.toFixed(2),
        'Subcontract': subs.toFixed(2)
      })
    }

    const duration = Math.round(performance.now() - start)
    observe.query('exportChangeOrderSummary', { duration, rows: rows.length, project_id: projectId })

    return {
      rows,
      summary: {
        rowCount: rows.length,
        totalOriginal,
        totalRevised,
        jobNumber,
        projectName: project.name
      }
    }
  } catch (error) {
    observe.error('database', { message: error.message, operation: 'exportChangeOrderSummary', project_id: projectId })
    throw error
  }
}

/**
 * Export the company's cost codes for importing into Sage's Job Cost setup.
 *
 * @param {string} companyId - UUID of the company
 * @returns {Promise<{ rows: object[], summary: object }>}
 */
export async function exportCostCodeStructure(companyId) {
  if (!isSupabaseConfigured || !companyId) return { rows: [], summary: {} }

  const start = performance.now()
  try {
    const { data: costCodes, error } = await supabase
      .from('cost_codes')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('code', { ascending: true })

    if (error) throw error

    const rows = (costCodes || []).map(cc => ({
      'Cost Code': cc.code,
      'Description': cc.description,
      'Cost Type': SAGE_COST_TYPE_MAP[cc.category] || 5,
      'Cost Type Name': cc.category || 'other',
      'Parent/Phase': cc.parent_code || ''
    }))

    const duration = Math.round(performance.now() - start)
    observe.query('exportCostCodeStructure', { duration, rows: rows.length, company_id: companyId })

    return {
      rows,
      summary: {
        rowCount: rows.length,
        categories: [...new Set((costCodes || []).map(c => c.category))]
      }
    }
  } catch (error) {
    observe.error('database', { message: error.message, operation: 'exportCostCodeStructure', company_id: companyId })
    throw error
  }
}

/**
 * Convert rows (array of flat objects) to a Sage-compatible CSV string.
 * Uses comma delimiter with double-quote text qualifiers.
 * Dates in MM/DD/YYYY, amounts as plain numbers.
 */
export function toSageCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const headerLine = headers.map(h => `"${h}"`).join(',')
  const dataLines = rows.map(row =>
    headers.map(key => {
      const val = row[key]
      if (val == null) return '""'
      const str = String(val)
      return `"${str.replace(/"/g, '""')}"`
    }).join(',')
  )
  return [headerLine, ...dataLines].join('\n')
}

/**
 * Trigger a file download in the browser.
 */
export function downloadSageCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Format date as MM/DD/YYYY for Sage
function formatSageDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}
