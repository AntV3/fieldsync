/**
 * Regression tests for the AIA / Sage schedule-of-values helper.
 *
 * The exports historically read `area.sov_value` — a field that does not
 * exist in the areas table (the real column is `scheduled_value`). That
 * always resolved to `undefined` and the fallback treated `area.weight`
 * (a 0–100 percentage) as if it were dollars. On a $1M contract with
 * four equal areas at weight 25, G702/G703 would emit $100 in SOV rows
 * instead of $1,000,000.
 */
import { describe, it, expect } from 'vitest'
import { computeAreaScheduledValue, buildG703Lines } from '../lib/aiaBillingExport'

describe('computeAreaScheduledValue', () => {
  it('uses the explicit scheduled_value (dollars) when present', () => {
    expect(computeAreaScheduledValue({ scheduled_value: 250000 }, 1_000_000)).toBe(250000)
  })

  it('never confuses the weight percentage for a dollar value', () => {
    // Weight is a percentage; on a $1M contract weight=25 must yield $250k, not $25.
    expect(computeAreaScheduledValue({ weight: 25 }, 1_000_000)).toBe(250000)
  })

  it('prefers scheduled_value over weight when both are set', () => {
    expect(
      computeAreaScheduledValue({ scheduled_value: 300000, weight: 25 }, 1_000_000)
    ).toBe(300000)
  })

  it('falls back to square_footage * price_per_sqft when scheduled_value is missing', () => {
    expect(
      computeAreaScheduledValue({ square_footage: 1200, price_per_sqft: 45 }, 500_000)
    ).toBe(54000)
  })

  it('returns 0 when nothing is set', () => {
    expect(computeAreaScheduledValue({}, 0)).toBe(0)
    expect(computeAreaScheduledValue({ weight: 25 }, 0)).toBe(0)
  })

  it('ignores the legacy misspelled sov_value field', () => {
    // If someone somehow persisted a stray sov_value (nonexistent column but
    // possible via a spread), we still trust the real schema field.
    expect(
      computeAreaScheduledValue({ sov_value: 999, scheduled_value: 100 }, 1_000_000)
    ).toBe(100)
    // With only the phantom field, we fall through to weight/contract.
    expect(
      computeAreaScheduledValue({ sov_value: 999, weight: 10 }, 1_000_000)
    ).toBe(100000)
  })
})

describe('buildG703Lines SOV totals', () => {
  it('emits the full contract value across areas, not a fraction of it', () => {
    const project = { name: 'Test Job', contract_value: 1_000_000 }
    const areas = [
      { id: 'a1', name: 'Phase 1', status: 'not_started', weight: 25 },
      { id: 'a2', name: 'Phase 2', status: 'not_started', weight: 25 },
      { id: 'a3', name: 'Phase 3', status: 'not_started', weight: 25 },
      { id: 'a4', name: 'Phase 4', status: 'not_started', weight: 25 }
    ]
    const lines = buildG703Lines(project, areas)
    const total = lines.reduce((sum, l) => sum + l.scheduled_value, 0)
    expect(total).toBe(1_000_000)
  })

  it('uses explicit scheduled_value when the area has one', () => {
    const project = { name: 'Test Job', contract_value: 1_000_000 }
    const areas = [
      { id: 'a1', name: 'Phase 1', status: 'not_started', scheduled_value: 400_000 },
      { id: 'a2', name: 'Phase 2', status: 'not_started', scheduled_value: 600_000 }
    ]
    const lines = buildG703Lines(project, areas)
    expect(lines[0].scheduled_value).toBe(400_000)
    expect(lines[1].scheduled_value).toBe(600_000)
  })
})
