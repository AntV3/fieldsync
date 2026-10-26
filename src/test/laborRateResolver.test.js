import { describe, it, expect } from 'vitest'
import {
  normalizeJobType,
  resolveClassRate,
  buildClassRateLookup,
  rateForWorker,
  calculateTicketValue
} from '../lib/laborRateResolver'
import { TM_AWAITING_APPROVAL_STATUSES, isAwaitingApproval, hasClientAuthorization } from '../lib/tmStatus'

describe('normalizeJobType', () => {
  it('maps every prevailing-wage spelling to "prevailing"', () => {
    expect(normalizeJobType('prevailing')).toBe('prevailing')
    expect(normalizeJobType('prevailing_wage')).toBe('prevailing')
    expect(normalizeJobType('PLA')).toBe('prevailing')
  })

  it('defaults everything else to "standard"', () => {
    expect(normalizeJobType('standard')).toBe('standard')
    expect(normalizeJobType(undefined)).toBe('standard')
    expect(normalizeJobType('')).toBe('standard')
  })
})

describe('resolveClassRate', () => {
  // What the Pricing screen actually writes
  const pricingRows = [
    { work_type: 'labor', job_type: 'standard', regular_rate: '55', overtime_rate: '82.5' },
    { work_type: 'labor', job_type: 'prevailing', regular_rate: '95', overtime_rate: '142.5' }
  ]

  it('matches Pricing-screen rows for a demolition / standard project', () => {
    expect(resolveClassRate(pricingRows, { workType: 'demolition', jobType: 'standard' }))
      .toEqual({ regular_rate: 55, overtime_rate: 82.5 })
  })

  it('matches Pricing-screen rows for a prevailing_wage project', () => {
    expect(resolveClassRate(pricingRows, { workType: 'environmental', jobType: 'prevailing_wage' }))
      .toEqual({ regular_rate: 95, overtime_rate: 142.5 })
  })

  it('prefers an exact work_type match when one exists', () => {
    const rows = [
      ...pricingRows,
      { work_type: 'demolition', job_type: 'standard', regular_rate: 60, overtime_rate: 90 }
    ]
    expect(resolveClassRate(rows, { workType: 'demolition', jobType: 'standard' }))
      .toEqual({ regular_rate: 60, overtime_rate: 90 })
  })

  it('treats legacy "pla" rows as prevailing', () => {
    const rows = [{ work_type: 'abatement', job_type: 'pla', regular_rate: 70, overtime_rate: 105 }]
    expect(resolveClassRate(rows, { workType: 'demolition', jobType: 'prevailing_wage' }))
      .toEqual({ regular_rate: 70, overtime_rate: 105 })
  })

  it('falls back to any row rather than $0 when job types do not line up', () => {
    const rows = [{ work_type: 'labor', job_type: 'standard', regular_rate: 55, overtime_rate: 0 }]
    expect(resolveClassRate(rows, { workType: 'demolition', jobType: 'prevailing_wage' }))
      .toEqual({ regular_rate: 55, overtime_rate: 0 })
  })

  it('returns null with no rows', () => {
    expect(resolveClassRate([], {})).toBeNull()
    expect(resolveClassRate(undefined, {})).toBeNull()
  })
})

describe('buildClassRateLookup / rateForWorker', () => {
  const classes = [
    { id: 'c1', name: 'Laborer', labor_class_rates: [{ work_type: 'labor', job_type: 'standard', regular_rate: 55, overtime_rate: 82.5 }] },
    { id: 'c2', name: 'Operator', labor_class_rates: [{ work_type: 'labor', job_type: 'standard', regular_rate: 75, overtime_rate: 112.5 }] },
    { id: 'c3', name: 'Unpriced', labor_class_rates: [] }
  ]
  const lookup = buildClassRateLookup(classes, { workType: 'demolition', jobType: 'standard' })

  it('indexes by id and by lower-cased name, skipping unpriced classes', () => {
    expect(Object.keys(lookup.byId).sort()).toEqual(['c1', 'c2'])
    expect(lookup.byName.laborer.regular_rate).toBe(55)
    expect(lookup.byName.unpriced).toBeUndefined()
  })

  it('resolves a worker by labor_class_id first', () => {
    expect(rateForWorker({ labor_class_id: 'c2', role: 'Laborer' }, lookup).regular_rate).toBe(75)
  })

  it('falls back to the joined class name, then the legacy role', () => {
    expect(rateForWorker({ labor_classes: { name: 'Operator' } }, lookup).regular_rate).toBe(75)
    expect(rateForWorker({ role: 'laborer' }, lookup).regular_rate).toBe(55)
    expect(rateForWorker({ role: 'Foreman' }, lookup)).toBeNull()
  })
})

describe('calculateTicketValue', () => {
  const lookup = buildClassRateLookup([
    { id: 'c1', name: 'Laborer', labor_class_rates: [{ work_type: 'labor', job_type: 'standard', regular_rate: 50, overtime_rate: 0 }] }
  ], { workType: 'demolition', jobType: 'standard' })

  it('prices labor at resolved rates with 1.5x OT fallback, plus materials', () => {
    const ticket = {
      t_and_m_workers: [
        { labor_class_id: 'c1', hours: 8, overtime_hours: 2 },
        { role: 'Unknown Role', hours: 8 }
      ],
      t_and_m_items: [
        { quantity: 3, materials_equipment: { cost_per_unit: 10 } },
        { quantity: 2, unit_cost: 7.5 }
      ]
    }
    const value = calculateTicketValue(ticket, lookup)
    expect(value.labor).toBe(8 * 50 + 2 * 75)
    expect(value.materials).toBe(30 + 15)
    expect(value.total).toBe(550 + 45)
  })

  it('returns zeros for an empty ticket', () => {
    expect(calculateTicketValue({}, lookup)).toEqual({ labor: 0, materials: 0, total: 0 })
  })
})

describe('tmStatus', () => {
  it('counts every pre-approval state as awaiting approval', () => {
    expect(TM_AWAITING_APPROVAL_STATUSES).toEqual(['pending', 'foreman_signed', 'client_signed'])
    expect(isAwaitingApproval('foreman_signed')).toBe(true)
    expect(isAwaitingApproval('client_signed')).toBe(true)
    expect(isAwaitingApproval('approved')).toBe(false)
    expect(isAwaitingApproval('rejected')).toBe(false)
  })

  it('accepts either the GC or the client slot as authorization', () => {
    expect(hasClientAuthorization({ client_signature_data: 'x' })).toBe(true)
    expect(hasClientAuthorization({ gc_signature_data: 'x' })).toBe(true)
    expect(hasClientAuthorization({})).toBe(false)
  })
})
