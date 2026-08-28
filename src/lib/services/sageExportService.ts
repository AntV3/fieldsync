/**
 * Sage 300 CRE Export Service
 *
 * Service layer that queries Supabase and formats data for Sage 300 CRE import.
 * Uses the existing db facade for all database operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as maybeSupabase, isSupabaseConfigured } from '../supabaseClient'
import { observe } from '../observability'
import type {
  ChangeOrderLineItemRow,
  ChangeOrderRequestRow,
  CostCodeRow,
  ProjectRow,
  TMItemRow,
  TMTicketRow,
  TMWorkerRow
} from '../types/database'

// Every exported function guards on isSupabaseConfigured before touching the
// client, so the null case (demo mode) never reaches a query.
const supabase = maybeSupabase as SupabaseClient

/** A single flat row destined for a Sage CSV file */
export type SageRow = Record<string, string | number>

export interface JobCostExportSummary {
  rowCount: number
  totalAmount: number
  totalLaborAmount: number
  totalMaterialAmount: number
  ticketCount: number
  jobNumber: string
  projectName: string
}

export interface ChangeOrderExportSummary {
  rowCount: number
  totalOriginal: number
  totalRevised: number
  jobNumber: string
  projectName: string
}

export interface CostCodeExportSummary {
  rowCount: number
  categories: (string | null)[]
}

export interface SageExportResult<TSummary> {
  rows: SageRow[]
  summary: TSummary | Record<string, never>
}

export interface JobCostExportOptions {
  /** Filter tickets on or after this date (YYYY-MM-DD) */
  startDate?: string
  /** Filter tickets on or before this date (YYYY-MM-DD) */
  endDate?: string
}

/** T&M ticket row shape returned by the joined export query */
interface TMTicketExportRow extends TMTicketRow {
  cost_codes?: Pick<CostCodeRow, 'id' | 'code' | 'description' | 'category'> | null
  t_and_m_workers?: TMWorkerRow[] | null
  t_and_m_items?: TMItemRow[] | null
}

/** COR row shape returned by the joined export query */
interface CORExportRow extends ChangeOrderRequestRow {
  cost_codes?: Pick<CostCodeRow, 'code' | 'description' | 'category'> | null
  change_order_labor?: ChangeOrderLineItemRow[] | null
  change_order_materials?: ChangeOrderLineItemRow[] | null
  change_order_equipment?: ChangeOrderLineItemRow[] | null
  change_order_subcontractors?: ChangeOrderLineItemRow[] | null
}

// Sage 300 CRE cost type codes: 1=Material, 2=Labor, 3=Equipment, 4=Subcontract, 5=Other
const SAGE_COST_TYPE_MAP: Record<string, number> = {
  material: 1,
  labor: 2,
  equipment: 3,
  subcontractor: 4,
  other: 5
}

// Default category (cost code) fallbacks when ticket has no cost code assigned
const DEFAULT_CATEGORIES: Record<string, string> = {
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
 */
export async function exportJobCostTransactions(
  projectId: string,
  options: JobCostExportOptions = {}
): Promise<SageExportResult<JobCostExportSummary>> {
  if (!isSupabaseConfigured || !projectId) return { rows: [], summary: {} }

  const start = performance.now()
  try {
    // Fetch project for job number and rate-lookup keys
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, name, job_number, company_id, work_type, job_type')
      .eq('id', projectId)
      .single()

    if (projErr) throw projErr
    const typedProject = project as Pick<
      ProjectRow,
      'id' | 'name' | 'job_number' | 'company_id' | 'work_type' | 'job_type'
    >

    // Build a labor_class_id → hourly rate lookup for the project's
    // work_type/job_type. t_and_m_workers has no rate column — rate lives
    // in labor_class_rates and must be joined here rather than selected off
    // the worker row (that select returned a PostgREST 400 and aborted the
    // whole export).
    const workType = typedProject.work_type || 'demolition'
    const jobType = typedProject.job_type || 'standard'
    const laborRates: Record<string, number> = {}
    if (typedProject.company_id) {
      const { data: rateRows, error: rateErr } = await supabase
        .from('labor_class_rates')
        .select('labor_class_id, regular_rate')
        .eq('work_type', workType)
        .eq('job_type', jobType)
      if (rateErr) {
        observe.error('database', {
          message: rateErr.message,
          operation: 'exportJobCostTransactions.laborRates',
          project_id: projectId
        })
      } else {
        for (const r of (rateRows || []) as { labor_class_id: string; regular_rate: string | number }[]) {
          laborRates[r.labor_class_id] = parseFloat(String(r.regular_rate)) || 0
        }
      }
    }

    // Fetch T&M tickets with workers and items, joined to cost codes
    let query = supabase
      .from('t_and_m_tickets')
      .select(`
        id, work_date, notes, status,
        cost_code_id,
        cost_codes (id, code, description, category),
        t_and_m_workers (name, role, hours, overtime_hours, labor_class_id),
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

    const jobNumber = typedProject.job_number || typedProject.name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')
    const rows: SageRow[] = []
    let totalAmount = 0
    let totalLaborAmount = 0
    let totalMaterialAmount = 0

    for (const ticket of ((tickets || []) as unknown as TMTicketExportRow[])) {
      const costCode = ticket.cost_codes
      const workDate = formatSageDate(ticket.work_date)
      // Use the ticket's cost code if assigned, otherwise use type-specific defaults
      const laborCategory = costCode?.code || DEFAULT_CATEGORIES.labor
      const materialCategory = costCode?.code || DEFAULT_CATEGORIES.material

      // Labor entries
      let laborTotal = 0
      for (const worker of (ticket.t_and_m_workers || [])) {
        const regHours = parseFloat(String(worker.hours)) || 0
        const otHours = parseFloat(String(worker.overtime_hours)) || 0
        const rate = worker.labor_class_id ? (laborRates[worker.labor_class_id] || 0) : 0
        const roleLabel = worker.role || 'General'

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
            'Description': `Labor - ${worker.name || 'Worker'} (${roleLabel})`,
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
            'Description': `OT Labor - ${worker.name || 'Worker'} (${roleLabel})`,
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
        const qty = parseFloat(String(item.quantity)) || 0
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
        projectName: typedProject.name
      }
    }
  } catch (error) {
    observe.error('database', { message: (error as Error).message, operation: 'exportJobCostTransactions', project_id: projectId })
    throw error
  }
}

/**
 * Export approved CORs in Sage's Change Order format.
 */
export async function exportChangeOrderSummary(projectId: string): Promise<SageExportResult<ChangeOrderExportSummary>> {
  if (!isSupabaseConfigured || !projectId) return { rows: [], summary: {} }

  const start = performance.now()
  try {
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, name, job_number')
      .eq('id', projectId)
      .single()

    if (projErr) throw projErr
    const typedProject = project as Pick<ProjectRow, 'id' | 'name' | 'job_number'>

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

    const jobNumber = typedProject.job_number || typedProject.name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')
    const rows: SageRow[] = []
    let totalOriginal = 0
    let totalRevised = 0

    const sumCents = (items: ChangeOrderLineItemRow[] | null | undefined): number =>
      (items || []).reduce((s, item) => s + (parseInt(String(item.total)) || 0), 0) / 100

    for (const co of ((cors || []) as unknown as CORExportRow[])) {
      const labor = sumCents(co.change_order_labor)
      const materials = sumCents(co.change_order_materials)
      const equipment = sumCents(co.change_order_equipment)
      const subs = sumCents(co.change_order_subcontractors)
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
        projectName: typedProject.name
      }
    }
  } catch (error) {
    observe.error('database', { message: (error as Error).message, operation: 'exportChangeOrderSummary', project_id: projectId })
    throw error
  }
}

/**
 * Export the company's cost codes for importing into Sage's Job Cost setup.
 */
export async function exportCostCodeStructure(companyId: string): Promise<SageExportResult<CostCodeExportSummary>> {
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

    const typedCostCodes = (costCodes || []) as CostCodeRow[]
    const rows: SageRow[] = typedCostCodes.map(cc => ({
      'Cost Code': cc.code,
      'Description': cc.description || '',
      'Cost Type': (cc.category && SAGE_COST_TYPE_MAP[cc.category]) || 5,
      'Cost Type Name': cc.category || 'other',
      'Parent/Phase': cc.parent_code || ''
    }))

    const duration = Math.round(performance.now() - start)
    observe.query('exportCostCodeStructure', { duration, rows: rows.length, company_id: companyId })

    return {
      rows,
      summary: {
        rowCount: rows.length,
        categories: [...new Set(typedCostCodes.map(c => c.category))]
      }
    }
  } catch (error) {
    observe.error('database', { message: (error as Error).message, operation: 'exportCostCodeStructure', company_id: companyId })
    throw error
  }
}

/**
 * Convert rows (array of flat objects) to a Sage-compatible CSV string.
 * Uses comma delimiter with double-quote text qualifiers.
 * Dates in MM/DD/YYYY, amounts as plain numbers.
 */
export function toSageCSV(rows: SageRow[]): string {
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
export function downloadSageCSV(csvContent: string, filename: string): void {
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
function formatSageDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}
