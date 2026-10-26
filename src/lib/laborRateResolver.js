/**
 * Labor rate resolution.
 *
 * The Pricing screen stores labor-class rates with `work_type = 'labor'` and
 * `job_type` in { 'standard', 'prevailing' }. Projects, on the other hand, carry
 * `work_type` like 'demolition' / 'environmental' and `job_type` like
 * 'standard' / 'prevailing_wage'. Older data may use 'pla' for prevailing wage.
 *
 * Every lookup that joins those two worlds goes through this module so the
 * keys always line up and a configured rate is never silently treated as $0.
 */

export const GENERIC_WORK_TYPE = 'labor'

/** Collapse every spelling of a job type into 'standard' or 'prevailing'. */
export function normalizeJobType(jobType) {
  const value = String(jobType || '').trim().toLowerCase()
  if (value === 'prevailing' || value === 'prevailing_wage' || value === 'pla') {
    return 'prevailing'
  }
  return 'standard'
}

/**
 * Pick the best rate row for a labor class given a project's work/job type.
 *
 * Preference order:
 *   1. exact work_type + job_type
 *   2. generic 'labor' work_type + job_type (what the Pricing screen writes)
 *   3. any work_type with a matching job_type
 *   4. exact work_type with any job_type
 *   5. the first row at all
 *
 * @param {Array<{work_type?: string, job_type?: string, regular_rate?: number|string, overtime_rate?: number|string}>} rates
 * @param {{ workType?: string, jobType?: string }} context
 * @returns {{ regular_rate: number, overtime_rate: number } | null}
 */
export function resolveClassRate(rates, { workType, jobType } = {}) {
  if (!Array.isArray(rates) || rates.length === 0) return null

  const wantedJob = normalizeJobType(jobType)
  const wantedWork = String(workType || '').trim().toLowerCase()

  const rows = rates.map(r => ({
    row: r,
    work: String(r.work_type || '').trim().toLowerCase(),
    job: normalizeJobType(r.job_type)
  }))

  const pick =
    rows.find(r => r.work === wantedWork && r.job === wantedJob) ||
    rows.find(r => r.work === GENERIC_WORK_TYPE && r.job === wantedJob) ||
    rows.find(r => r.job === wantedJob) ||
    rows.find(r => r.work === wantedWork) ||
    rows[0]

  if (!pick) return null
  return {
    regular_rate: parseFloat(pick.row.regular_rate) || 0,
    overtime_rate: parseFloat(pick.row.overtime_rate) || 0
  }
}

/**
 * Build lookups from the shape returned by `db.getAllLaborClassRates(companyId)`:
 *   [{ id, name, labor_class_rates: [...] }, ...]
 *
 * @returns {{ byId: Record<string, {regular_rate:number, overtime_rate:number}>,
 *             byName: Record<string, {regular_rate:number, overtime_rate:number}> }}
 */
export function buildClassRateLookup(classes, context = {}) {
  const byId = {}
  const byName = {}
  ;(classes || []).forEach(lc => {
    const resolved = resolveClassRate(lc.labor_class_rates, context)
    if (!resolved) return
    if (lc.id) byId[lc.id] = resolved
    if (lc.name) byName[String(lc.name).trim().toLowerCase()] = resolved
  })
  return { byId, byName }
}

/**
 * Look up a rate for a single T&M worker using the lookups above.
 * Falls back from labor_class_id → labor class name → legacy role name.
 */
export function rateForWorker(worker, lookup) {
  if (!worker || !lookup) return null
  if (worker.labor_class_id && lookup.byId?.[worker.labor_class_id]) {
    return lookup.byId[worker.labor_class_id]
  }
  const name = (worker.labor_classes?.name || worker.labor_class || worker.role || '')
    .toString().trim().toLowerCase()
  if (name && lookup.byName?.[name]) return lookup.byName[name]
  return null
}

/**
 * Dollar value of a T&M ticket: labor at resolved rates plus materials at
 * catalog or custom unit cost. Overtime falls back to 1.5x regular when no
 * overtime rate is configured.
 *
 * @returns {{ labor: number, materials: number, total: number }} in dollars
 */
export function calculateTicketValue(ticket, lookup) {
  let labor = 0
  let materials = 0

  ;(ticket?.t_and_m_workers || []).forEach(worker => {
    const rate = rateForWorker(worker, lookup)
    if (!rate) return
    const regHrs = parseFloat(worker.hours) || 0
    const otHrs = parseFloat(worker.overtime_hours) || 0
    const otRate = rate.overtime_rate > 0 ? rate.overtime_rate : rate.regular_rate * 1.5
    labor += regHrs * rate.regular_rate + otHrs * otRate
  })

  ;(ticket?.t_and_m_items || []).forEach(item => {
    const qty = parseFloat(item.quantity) || 0
    const unitCost = parseFloat(item.unit_cost) || parseFloat(item.materials_equipment?.cost_per_unit) || 0
    materials += qty * unitCost
  })

  const round = n => Math.round(n * 100) / 100
  return { labor: round(labor), materials: round(materials), total: round(labor + materials) }
}
