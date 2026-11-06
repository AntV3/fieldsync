/**
 * Project setup validation — the single home for the rules shared by the
 * New Project wizard (Setup.jsx) and the Edit Project form (useProjectEdit).
 *
 * Pure functions only: no React, no db. Every rule returns an error string
 * (or null) so the caller decides how to surface it (toast, inline, ...).
 *
 * Design (docs/LAUNCH_READINESS.md §2):
 *   - "Not set" is NULL in the database. A blank contract value maps to
 *     null; "0" is rejected so the UI never writes 0.
 *   - Schedule dates are both-or-neither; end must not be before start.
 *   - Areas are optional. Untouched rows (blank name AND blank weight) are
 *     ignored; a touched row needs a name and a weight > 0; named rows must
 *     total 100% (± 0.1).
 */

const isBlank = (v) => v === null || v === undefined || String(v).trim() === ''

const pick = (obj, snake, camel) => {
  if (!obj) return undefined
  return obj[snake] !== undefined ? obj[snake] : obj[camel]
}

/**
 * Foreman PIN: exactly 4 digits.
 * @param {string|number|null|undefined} pin
 * @returns {{ ok: boolean, error: string|null }}
 */
export function validatePin(pin) {
  const str = isBlank(pin) ? '' : String(pin).trim()
  if (str === '') {
    return { ok: false, error: 'Please enter a 4-digit PIN' }
  }
  if (!/^\d{4}$/.test(str)) {
    return { ok: false, error: 'PIN must be 4 digits' }
  }
  return { ok: true, error: null }
}

/**
 * Contract value (optional). Blank → null (stored as NULL). Anything else
 * must parse to a finite number greater than 0 — "0" is an error, not "none".
 * @param {string|number|null|undefined} raw
 * @returns {{ value: number|null, error: string|null }}
 */
export function validateContractValue(raw) {
  if (isBlank(raw)) {
    return { value: null, error: null }
  }
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).trim())
  if (!Number.isFinite(num) || num <= 0) {
    return { value: null, error: 'Please enter a valid contract value' }
  }
  return { value: num, error: null }
}

/**
 * Seed an input from a stored contract value. NULL (raw rows) and 0
 * (summary RPC / legacy rows) both render as an empty field, so the edit
 * form never shows "0" and never blocks a save with a value it did not get
 * from the user.
 * @param {number|string|null|undefined} v
 * @returns {string}
 */
export function contractValueToInput(v) {
  return Number(v) > 0 ? String(v) : ''
}

/**
 * Schedule dates are optional, but both-or-neither, and end must not be
 * before start (same-day is allowed, as today).
 * Accepts `{ start_date, end_date }` (also `{ startDate, endDate }`).
 * @returns {{ ok: boolean, error: string|null }}
 */
export function validateScheduleDates(dates) {
  const start = pick(dates, 'start_date', 'startDate')
  const end = pick(dates, 'end_date', 'endDate')
  const hasStart = !isBlank(start)
  const hasEnd = !isBlank(end)

  if (!hasStart && !hasEnd) {
    return { ok: true, error: null }
  }
  if (hasStart !== hasEnd) {
    return { ok: false, error: 'Enter both a start date and an end date, or leave both blank' }
  }
  const startMs = new Date(String(start).trim()).getTime()
  const endMs = new Date(String(end).trim()).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { ok: false, error: 'Please enter valid start and end dates' }
  }
  if (endMs < startMs) {
    return { ok: false, error: 'End date must be after start date' }
  }
  return { ok: true, error: null }
}

/**
 * Sum of area weights with float noise rounded away: 33.3 + 33.3 + 33.3 is
 * 99.89999999999999 in JS, which would sit a hair outside the ± 0.1
 * tolerance it clearly meets. Unparseable weights count as 0. Used by the
 * validator and by the edit form's totals row so both agree.
 * @param {Array<{ weight?: string|number|null }>} areas
 * @returns {number}
 */
export function sumAreaWeights(areas) {
  const rows = Array.isArray(areas) ? areas : []
  const raw = rows.reduce((sum, a) => sum + (parseFloat(a?.weight) || 0), 0)
  return Math.round(raw * 1000) / 1000
}

/**
 * Whether a (rounded) area-weight total counts as 100%.
 * @param {number} total
 * @returns {boolean}
 */
export function areaTotalWithinTolerance(total) {
  return Math.abs(Number(total) - 100) <= 0.1
}

/**
 * Work areas (optional).
 *   - Untouched rows (blank name AND blank weight) are ignored.
 *   - A touched row needs a non-empty name and a weight > 0.
 *   - Named rows must total 100% (± 0.1).
 * Returns the rows that will be saved (the original row objects, so ids /
 * tempPhaseId / group survive) — empty when there is an error or no rows.
 * @param {Array<{ name?: string, weight?: string|number|null }>} areas
 * @returns {{ ok: boolean, error: string|null, areas: Array }}
 */
export function validateOptionalAreas(areas) {
  const rows = Array.isArray(areas) ? areas : []
  const touched = rows.filter(a => a && !(isBlank(a.name) && isBlank(a.weight)))

  if (touched.length === 0) {
    return { ok: true, error: null, areas: [] }
  }

  // A weight on an unnamed row would pass a raw total check but be dropped
  // on save, silently skewing all progress math afterward.
  const unnamed = touched.find(a => isBlank(a.name))
  if (unnamed) {
    return {
      ok: false,
      error: 'Every area with a weight needs a name (or remove its weight)',
      areas: []
    }
  }

  const badWeight = touched.find(a => !(parseFloat(a.weight) > 0))
  if (badWeight) {
    return {
      ok: false,
      error: `Area "${String(badWeight.name).trim()}" needs a weight greater than 0`,
      areas: []
    }
  }

  if (!areaTotalWithinTolerance(sumAreaWeights(touched))) {
    return { ok: false, error: 'Area weights must total 100%', areas: [] }
  }

  return { ok: true, error: null, areas: touched }
}

/**
 * Phase names must be unique (case-insensitive, trimmed). Unnamed phases
 * are ignored, exactly as the wizard does today.
 * @param {Array<{ name?: string }>} phases
 * @returns {{ ok: boolean, error: string|null }}
 */
export function validatePhaseNames(phases) {
  const named = (Array.isArray(phases) ? phases : []).filter(p => p && !isBlank(p.name))
  const seen = new Set()
  for (const p of named) {
    const trimmed = String(p.name).trim()
    const key = trimmed.toLowerCase()
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate phase name: "${trimmed}"` }
    }
    seen.add(key)
  }
  return { ok: true, error: null }
}

/**
 * True when the progress-tracking step has nothing in it: no contract
 * value, no dates, no planned man-days, no touched area rows and no named
 * phases. Drives the "Skip for now" button and the Review card copy.
 * Accepts the wizard shape (camelCase) and the edit-form shape (snake_case).
 * @param {object} data
 * @returns {boolean}
 */
export function isProgressTrackingEmpty(data) {
  if (!data) return true
  if (!isBlank(pick(data, 'contract_value', 'contractValue'))) return false
  if (!isBlank(pick(data, 'start_date', 'startDate'))) return false
  if (!isBlank(pick(data, 'end_date', 'endDate'))) return false
  if (!isBlank(pick(data, 'planned_man_days', 'plannedManDays'))) return false

  const areas = Array.isArray(data.areas) ? data.areas : []
  if (areas.some(a => a && !(isBlank(a.name) && isBlank(a.weight)))) return false

  const phases = Array.isArray(data.phases) ? data.phases : []
  if (phases.some(p => p && !isBlank(p.name))) return false

  return true
}
