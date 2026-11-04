import { describe, it, expect } from 'vitest'
import { buildG703Lines, buildG702Summary } from '../lib/aiaBillingExport'
import { areaScheduledValueDollars } from '../lib/scheduleOfValues'

describe('areaScheduledValueDollars', () => {
  it('prefers explicit scheduled_value in dollars', () => {
    const area = { scheduled_value: 250000, weight: 25, square_footage: 1000, price_per_sqft: 300 }
    expect(areaScheduledValueDollars(area, 1_000_000)).toBe(250000)
  })

  it('falls back to square_footage × price_per_sqft when scheduled_value is missing', () => {
    const area = { square_footage: 1200, price_per_sqft: 450 }
    expect(areaScheduledValueDollars(area, 1_000_000)).toBe(540000)
  })

  it('falls back to weight % of project contract when sqft/price are missing', () => {
    const area = { weight: 25 }
    expect(areaScheduledValueDollars(area, 1_000_000)).toBe(250000)
  })

  it('returns 0 for an area with no SOV signal', () => {
    expect(areaScheduledValueDollars({}, 1_000_000)).toBe(0)
  })

  it('never reads area.sov_value (phantom column)', () => {
    const area = { sov_value: 999999, weight: 25 }
    expect(areaScheduledValueDollars(area, 1_000_000)).toBe(250000)
  })
})

describe('buildG703Lines › uses scheduled_value from the SOV column, not area.weight', () => {
  it('bills from scheduled_value dollars when present', () => {
    const project = { id: 'p1', name: 'Test', contract_value: 1_000_000 }
    const areas = [
      { id: 'a1', name: 'Phase 1', status: 'done', scheduled_value: 250000, weight: 25 },
      { id: 'a2', name: 'Phase 2', status: 'done', scheduled_value: 250000, weight: 25 },
      { id: 'a3', name: 'Phase 3', status: 'done', scheduled_value: 250000, weight: 25 },
      { id: 'a4', name: 'Phase 4', status: 'done', scheduled_value: 250000, weight: 25 },
    ]

    const lines = buildG703Lines(project, areas)
    expect(lines).toHaveLength(4)
    for (const line of lines) {
      expect(line.scheduled_value).toBe(250000)
      expect(line.total_completed).toBe(250000)
    }

    const g702 = buildG702Summary(project, lines)
    // The bug: when scheduled_value was read as area.weight (25), g702 summed to $100.
    expect(g702.total_completed_stored).toBe(1_000_000)
    expect(g702.percent_complete).toBe(100)
  })

  it('falls back to weight % × contract_value when scheduled_value is absent', () => {
    const project = { id: 'p1', name: 'Test', contract_value: 1_000_000 }
    const areas = [
      { id: 'a1', name: 'Phase 1', status: 'done', weight: 40 },
      { id: 'a2', name: 'Phase 2', status: 'working', weight: 60 },
    ]
    const lines = buildG703Lines(project, areas)
    expect(lines[0].scheduled_value).toBe(400000)
    expect(lines[1].scheduled_value).toBe(600000)
    // Phase 2 is 'working' → 50% complete
    expect(lines[1].total_completed).toBe(300000)
  })

  it('falls back to square_footage × price_per_sqft when weight is absent', () => {
    const project = { id: 'p1', name: 'Test', contract_value: 0 }
    const areas = [
      { id: 'a1', name: 'Slab', status: 'done', square_footage: 1500, price_per_sqft: 200 },
    ]
    const lines = buildG703Lines(project, areas)
    expect(lines[0].scheduled_value).toBe(300000)
  })
})
