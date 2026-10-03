/**
 * Tests for the shared SOV helper that fixes a cross-cutting billing-math bug.
 *
 * Before `areaScheduledValueDollars`, three export sites (G702/G703 AIA billing,
 * Sage 300 project-setup, and the Sage export preview) read `area.sov_value`
 * with a `|| area.weight` fallback. `sov_value` is not a column on the `areas`
 * table (confirmed against supabase/migrations/), so the expression ALWAYS
 * fell through to `area.weight` — a 0–100 percent — rendered as a dollar
 * amount. The G703 for a $100M project with weights 25/25/50 totaled $100
 * (one hundred dollars). The helper centralizes the correct lookup and
 * matches `drawRequestOps.areaScheduledValueCents` so all four surfaces agree.
 */
import { describe, it, expect } from 'vitest'
import { areaScheduledValueDollars } from '../lib/utils'

describe('areaScheduledValueDollars', () => {
  it('prefers an explicit positive scheduled_value (dollars)', () => {
    expect(areaScheduledValueDollars({ scheduled_value: 42000, weight: 25 }, 1_000_000))
      .toBe(42000)
  })

  it('derives from contract_value × weight / 100 when scheduled_value is missing', () => {
    // A $100M job, this area at 25% weight → $25M
    expect(areaScheduledValueDollars({ weight: 25 }, 100_000_000))
      .toBe(25_000_000)
  })

  it('does NOT silently treat weight (percent) as a dollar amount — the pre-fix bug', () => {
    // Pre-fix: `area.sov_value || area.weight` evaluated to 25 dollars.
    // Post-fix: 0 when there's no contract value to derive against, instead
    // of a plausible-looking but six-orders-of-magnitude-wrong $25.
    expect(areaScheduledValueDollars({ weight: 25 }, 0)).toBe(0)
    expect(areaScheduledValueDollars({ weight: 25 })).toBe(0)
  })

  it('ignores zero/negative/NaN scheduled_value and falls through to the weight derivation', () => {
    expect(areaScheduledValueDollars({ scheduled_value: 0, weight: 50 }, 10_000))
      .toBe(5_000)
    expect(areaScheduledValueDollars({ scheduled_value: -1, weight: 50 }, 10_000))
      .toBe(5_000)
    expect(areaScheduledValueDollars({ scheduled_value: 'abc', weight: 50 }, 10_000))
      .toBe(5_000)
  })

  it('returns 0 when nothing is derivable', () => {
    expect(areaScheduledValueDollars({})).toBe(0)
    expect(areaScheduledValueDollars(null)).toBe(0)
    expect(areaScheduledValueDollars(undefined)).toBe(0)
    expect(areaScheduledValueDollars({ weight: 0 }, 100_000)).toBe(0)
  })

  it('ignores the phantom sov_value, square_footage, price_per_sqft fields', () => {
    // These are not columns on the areas table; they must never influence the result.
    expect(areaScheduledValueDollars(
      { sov_value: 99, square_footage: 500, price_per_sqft: 10, weight: 25 },
      100_000
    )).toBe(25_000)
  })
})
