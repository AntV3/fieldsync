/**
 * Tests for the shared project setup validators
 * (src/lib/projectSetupValidation.js) used by the New Project wizard and
 * the Edit Project form. Pure functions — no mocks needed.
 * Run with: npx vitest run src/test/projectSetupValidation.test.js
 */
import { describe, it, expect } from 'vitest'
import {
  validatePin,
  validateContractValue,
  contractValueToInput,
  validateScheduleDates,
  validateOptionalAreas,
  validatePhaseNames,
  isProgressTrackingEmpty,
  sumAreaWeights,
  areaTotalWithinTolerance
} from '../lib/projectSetupValidation'

const blankArea = () => ({ name: '', weight: '', group: '', scheduledValue: null, tempPhaseId: null })

// Mirrors INITIAL_DATA in src/components/Setup.jsx (the wizard shape).
const INITIAL_DATA = {
  projectName: '',
  jobNumber: '',
  address: '',
  generalContractor: '',
  contractorContact: '',
  contractorPosition: '',
  contractorPhone: '',
  contractorEmail: '',
  clientContact: '',
  clientPosition: '',
  clientPhone: '',
  clientEmail: '',
  contractValue: '',
  pin: '',
  workType: 'demolition',
  jobType: 'standard',
  startDate: '',
  endDate: '',
  plannedManDays: '',
  phases: [],
  areas: [blankArea(), blankArea(), blankArea()]
}

// ============================================
// validatePin
// ============================================
describe('validatePin', () => {
  it('accepts exactly 4 digits', () => {
    expect(validatePin('1234')).toEqual({ ok: true, error: null })
    expect(validatePin('0000')).toEqual({ ok: true, error: null })
    expect(validatePin(' 4321 ')).toEqual({ ok: true, error: null })
  })

  it('asks for a PIN when blank', () => {
    expect(validatePin('')).toEqual({ ok: false, error: 'Please enter a 4-digit PIN' })
    expect(validatePin(null)).toEqual({ ok: false, error: 'Please enter a 4-digit PIN' })
    expect(validatePin(undefined)).toEqual({ ok: false, error: 'Please enter a 4-digit PIN' })
    expect(validatePin('   ')).toEqual({ ok: false, error: 'Please enter a 4-digit PIN' })
  })

  it('rejects the wrong length', () => {
    expect(validatePin('123')).toEqual({ ok: false, error: 'PIN must be 4 digits' })
    expect(validatePin('12345')).toEqual({ ok: false, error: 'PIN must be 4 digits' })
  })

  it('rejects non-digits', () => {
    expect(validatePin('12a4').ok).toBe(false)
    expect(validatePin('abcd').ok).toBe(false)
    expect(validatePin('12 4').ok).toBe(false)
    expect(validatePin('-123').ok).toBe(false)
    expect(validatePin('1.23').ok).toBe(false)
  })

  it('accepts a numeric 4-digit PIN', () => {
    expect(validatePin(1234)).toEqual({ ok: true, error: null })
  })
})

// ============================================
// validateContractValue
// ============================================
describe('validateContractValue', () => {
  it('maps blank to null with no error', () => {
    expect(validateContractValue('')).toEqual({ value: null, error: null })
    expect(validateContractValue(null)).toEqual({ value: null, error: null })
    expect(validateContractValue(undefined)).toEqual({ value: null, error: null })
    expect(validateContractValue('   ')).toEqual({ value: null, error: null })
  })

  it('rejects zero', () => {
    expect(validateContractValue('0')).toEqual({ value: null, error: 'Please enter a valid contract value' })
    expect(validateContractValue(0)).toEqual({ value: null, error: 'Please enter a valid contract value' })
    expect(validateContractValue('0.00')).toEqual({ value: null, error: 'Please enter a valid contract value' })
  })

  it('rejects negatives', () => {
    expect(validateContractValue('-1')).toEqual({ value: null, error: 'Please enter a valid contract value' })
    expect(validateContractValue(-500)).toEqual({ value: null, error: 'Please enter a valid contract value' })
  })

  it('rejects NaN and non-numeric input', () => {
    expect(validateContractValue('abc')).toEqual({ value: null, error: 'Please enter a valid contract value' })
    expect(validateContractValue(NaN)).toEqual({ value: null, error: 'Please enter a valid contract value' })
    expect(validateContractValue('$1,000')).toEqual({ value: null, error: 'Please enter a valid contract value' })
    expect(validateContractValue(Infinity)).toEqual({ value: null, error: 'Please enter a valid contract value' })
  })

  it('parses positive values', () => {
    expect(validateContractValue('365000')).toEqual({ value: 365000, error: null })
    expect(validateContractValue('1234.56')).toEqual({ value: 1234.56, error: null })
    expect(validateContractValue(' 42 ')).toEqual({ value: 42, error: null })
    expect(validateContractValue(99.5)).toEqual({ value: 99.5, error: null })
    expect(validateContractValue('0.01')).toEqual({ value: 0.01, error: null })
  })
})

// ============================================
// contractValueToInput
// ============================================
describe('contractValueToInput', () => {
  it('renders 0 as an empty field (summary RPC / legacy rows)', () => {
    expect(contractValueToInput(0)).toBe('')
    expect(contractValueToInput('0')).toBe('')
  })

  it('renders NULL / undefined / blank as an empty field', () => {
    expect(contractValueToInput(null)).toBe('')
    expect(contractValueToInput(undefined)).toBe('')
    expect(contractValueToInput('')).toBe('')
  })

  it('renders negatives and NaN as an empty field', () => {
    expect(contractValueToInput(-10)).toBe('')
    expect(contractValueToInput(NaN)).toBe('')
    expect(contractValueToInput('abc')).toBe('')
  })

  it('renders positive values as their string form', () => {
    expect(contractValueToInput(365000)).toBe('365000')
    expect(contractValueToInput(1234.5)).toBe('1234.5')
    expect(contractValueToInput('250000')).toBe('250000')
  })

  it('round-trips through validateContractValue', () => {
    expect(validateContractValue(contractValueToInput(365000)).value).toBe(365000)
    expect(validateContractValue(contractValueToInput(0)).value).toBeNull()
    expect(validateContractValue(contractValueToInput(null)).value).toBeNull()
  })
})

// ============================================
// validateScheduleDates
// ============================================
describe('validateScheduleDates', () => {
  it('passes when both dates are blank', () => {
    expect(validateScheduleDates({ start_date: '', end_date: '' })).toEqual({ ok: true, error: null })
    expect(validateScheduleDates({ start_date: null, end_date: null })).toEqual({ ok: true, error: null })
    expect(validateScheduleDates({})).toEqual({ ok: true, error: null })
    expect(validateScheduleDates(undefined)).toEqual({ ok: true, error: null })
  })

  it('rejects only a start date', () => {
    const res = validateScheduleDates({ start_date: '2026-01-01', end_date: '' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Enter both a start date and an end date, or leave both blank')
  })

  it('rejects only an end date', () => {
    const res = validateScheduleDates({ start_date: null, end_date: '2026-03-01' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Enter both a start date and an end date, or leave both blank')
  })

  it('rejects end before start with the existing wording', () => {
    expect(validateScheduleDates({ start_date: '2026-03-01', end_date: '2026-02-28' }))
      .toEqual({ ok: false, error: 'End date must be after start date' })
  })

  it('accepts end after start and same-day', () => {
    expect(validateScheduleDates({ start_date: '2026-01-01', end_date: '2026-03-01' })).toEqual({ ok: true, error: null })
    expect(validateScheduleDates({ start_date: '2026-01-01', end_date: '2026-01-01' })).toEqual({ ok: true, error: null })
  })

  it('rejects unparseable dates', () => {
    const res = validateScheduleDates({ start_date: 'not-a-date', end_date: '2026-01-01' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Please enter valid start and end dates')
  })

  it('also accepts the wizard camelCase keys', () => {
    expect(validateScheduleDates({ startDate: '2026-01-01', endDate: '' }).ok).toBe(false)
    expect(validateScheduleDates({ startDate: '2026-01-01', endDate: '2026-02-01' }).ok).toBe(true)
  })
})

// ============================================
// validateOptionalAreas
// ============================================
describe('validateOptionalAreas', () => {
  it('passes with no rows and returns no areas', () => {
    expect(validateOptionalAreas([])).toEqual({ ok: true, error: null, areas: [] })
    expect(validateOptionalAreas(undefined)).toEqual({ ok: true, error: null, areas: [] })
    expect(validateOptionalAreas(null)).toEqual({ ok: true, error: null, areas: [] })
  })

  it('ignores untouched rows (blank name AND blank weight)', () => {
    expect(validateOptionalAreas([blankArea(), blankArea(), blankArea()]))
      .toEqual({ ok: true, error: null, areas: [] })
    expect(validateOptionalAreas([{ name: '   ', weight: null }, { name: undefined, weight: undefined }]))
      .toEqual({ ok: true, error: null, areas: [] })
  })

  it('rejects a weight on an unnamed row', () => {
    const res = validateOptionalAreas([{ name: '', weight: '100' }])
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Every area with a weight needs a name (or remove its weight)')
    expect(res.areas).toEqual([])
  })

  it('rejects a named row with a blank weight', () => {
    const res = validateOptionalAreas([{ name: 'Lobby', weight: '' }])
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Area "Lobby" needs a weight greater than 0')
  })

  it('rejects a named row with a zero or negative weight', () => {
    expect(validateOptionalAreas([{ name: 'Lobby', weight: '0' }]).ok).toBe(false)
    expect(validateOptionalAreas([{ name: 'Lobby', weight: -5 }]).ok).toBe(false)
    expect(validateOptionalAreas([{ name: 'Lobby', weight: 'abc' }]).ok).toBe(false)
  })

  it('rejects a single named area at 60%', () => {
    const res = validateOptionalAreas([{ name: 'Lobby', weight: '60' }, blankArea()])
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Area weights must total 100%')
    expect(res.areas).toEqual([])
  })

  it('accepts named rows totalling 100 and returns the kept rows', () => {
    const a = { name: 'Lobby', weight: '60', tempPhaseId: 'p1' }
    const b = { name: 'Roof', weight: '40', id: 'area-2' }
    const res = validateOptionalAreas([a, blankArea(), b, blankArea()])
    expect(res).toEqual({ ok: true, error: null, areas: [a, b] })
    // the original row objects are returned, so ids / tempPhaseId survive
    expect(res.areas[0]).toBe(a)
    expect(res.areas[1]).toBe(b)
  })

  it('accepts numeric weights (edit form rows seeded from the DB)', () => {
    const res = validateOptionalAreas([{ id: '1', name: 'A', weight: 50 }, { id: '2', name: 'B', weight: 50 }])
    expect(res.ok).toBe(true)
    expect(res.areas).toHaveLength(2)
  })

  it('tolerates 100 +/- 0.1', () => {
    expect(validateOptionalAreas([{ name: 'A', weight: '33.3' }, { name: 'B', weight: '33.3' }, { name: 'C', weight: '33.3' }]).ok).toBe(true)
    expect(validateOptionalAreas([{ name: 'A', weight: '50.05' }, { name: 'B', weight: '50.05' }]).ok).toBe(true)
    expect(validateOptionalAreas([{ name: 'A', weight: '50' }, { name: 'B', weight: '49.9' }]).ok).toBe(true)
  })

  it('rejects totals outside the tolerance', () => {
    expect(validateOptionalAreas([{ name: 'A', weight: '50' }, { name: 'B', weight: '49.8' }]).ok).toBe(false)
    expect(validateOptionalAreas([{ name: 'A', weight: '50' }, { name: 'B', weight: '50.2' }]).ok).toBe(false)
    expect(validateOptionalAreas([{ name: 'A', weight: '60' }, { name: 'B', weight: '60' }]).error).toBe('Area weights must total 100%')
  })
})

// ============================================
// sumAreaWeights / areaTotalWithinTolerance
// ============================================
describe('sumAreaWeights / areaTotalWithinTolerance', () => {
  it('rounds float noise away so the totals row agrees with the validator', () => {
    const thirds = [{ weight: '33.3' }, { weight: '33.3' }, { weight: '33.3' }]
    expect(33.3 + 33.3 + 33.3).not.toBe(99.9) // the raw sum the old form compared
    expect(sumAreaWeights(thirds)).toBe(99.9)
    expect(areaTotalWithinTolerance(sumAreaWeights(thirds))).toBe(true)
    expect(areaTotalWithinTolerance(sumAreaWeights(thirds))).toBe(validateOptionalAreas(thirds.map((a, i) => ({ ...a, name: `A${i}` }))).ok)
  })

  it('counts blank or unparseable weights as 0 and handles non-arrays', () => {
    expect(sumAreaWeights([{ weight: '' }, { weight: 'abc' }, { weight: 40 }, {}])).toBe(40)
    expect(sumAreaWeights(null)).toBe(0)
    expect(sumAreaWeights([])).toBe(0)
  })

  it('applies the +/- 0.1 tolerance', () => {
    expect(areaTotalWithinTolerance(100)).toBe(true)
    expect(areaTotalWithinTolerance(99.9)).toBe(true)
    expect(areaTotalWithinTolerance(100.1)).toBe(true)
    expect(areaTotalWithinTolerance(99.8)).toBe(false)
    expect(areaTotalWithinTolerance(60)).toBe(false)
    expect(areaTotalWithinTolerance(NaN)).toBe(false)
  })
})

// ============================================
// validatePhaseNames
// ============================================
describe('validatePhaseNames', () => {
  it('passes with no phases', () => {
    expect(validatePhaseNames([])).toEqual({ ok: true, error: null })
    expect(validatePhaseNames(undefined)).toEqual({ ok: true, error: null })
    expect(validatePhaseNames(null)).toEqual({ ok: true, error: null })
  })

  it('ignores unnamed phases', () => {
    expect(validatePhaseNames([{ name: '' }, { name: '  ' }, { name: null }, {}])).toEqual({ ok: true, error: null })
  })

  it('passes with distinct names', () => {
    expect(validatePhaseNames([{ name: 'Demo' }, { name: 'Haul' }, { name: '' }])).toEqual({ ok: true, error: null })
  })

  it('rejects duplicates case-insensitively after trimming, with the existing wording', () => {
    expect(validatePhaseNames([{ name: 'Demo' }, { name: ' demo ' }]))
      .toEqual({ ok: false, error: 'Duplicate phase name: "demo"' })
    expect(validatePhaseNames([{ name: 'Phase 1' }, { name: 'Phase 2' }, { name: 'PHASE 1' }]).ok).toBe(false)
  })
})

// ============================================
// isProgressTrackingEmpty
// ============================================
describe('isProgressTrackingEmpty', () => {
  it('is true for the wizard INITIAL_DATA shape', () => {
    expect(isProgressTrackingEmpty(INITIAL_DATA)).toBe(true)
  })

  it('is true for a missing / minimal object', () => {
    expect(isProgressTrackingEmpty(undefined)).toBe(true)
    expect(isProgressTrackingEmpty(null)).toBe(true)
    expect(isProgressTrackingEmpty({})).toBe(true)
  })

  it('is true for the edit-form shape with nothing set', () => {
    expect(isProgressTrackingEmpty({
      contract_value: '',
      start_date: '',
      end_date: '',
      planned_man_days: '',
      areas: [{ id: null, name: '', weight: '', isNew: true }]
    })).toBe(true)
  })

  it('is false once a contract value is entered', () => {
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, contractValue: '365000' })).toBe(false)
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, contractValue: '0' })).toBe(false)
    expect(isProgressTrackingEmpty({ contract_value: '100' })).toBe(false)
  })

  it('is false once a date is entered', () => {
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, startDate: '2026-01-01' })).toBe(false)
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, endDate: '2026-01-01' })).toBe(false)
    expect(isProgressTrackingEmpty({ start_date: '2026-01-01' })).toBe(false)
    expect(isProgressTrackingEmpty({ end_date: '2026-01-01' })).toBe(false)
  })

  it('is false once planned man-days is entered', () => {
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, plannedManDays: '120' })).toBe(false)
    expect(isProgressTrackingEmpty({ planned_man_days: 120 })).toBe(false)
  })

  it('is false once an area row is touched', () => {
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, areas: [{ ...blankArea(), name: 'Lobby' }, blankArea()] })).toBe(false)
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, areas: [{ ...blankArea(), weight: '50' }] })).toBe(false)
    expect(isProgressTrackingEmpty({ areas: [{ id: '1', name: 'A', weight: 100 }] })).toBe(false)
  })

  it('is false once a phase is named', () => {
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, phases: [{ tempId: 't1', name: 'Demo' }] })).toBe(false)
  })

  it('stays true for unnamed phases', () => {
    expect(isProgressTrackingEmpty({ ...INITIAL_DATA, phases: [{ tempId: 't1', name: '' }] })).toBe(true)
  })
})
