import { describe, it, expect } from 'vitest'
import { getProfitVariant } from '../components/HeroMetrics'

// The severity ranking of the four variants, most-alarming first, used to
// assert the "thinner-margin-must-not-look-safer" contract.
const SEVERITY = { danger: 3, warning: 2, default: 1, success: 0 }

describe('getProfitVariant', () => {
  it('reports awaiting-cost state as neutral default', () => {
    expect(getProfitVariant(0, true)).toBe('default')
    expect(getProfitVariant(-50, true)).toBe('default')
    expect(getProfitVariant(100, true)).toBe('default')
  })

  it('flags a negative margin as danger', () => {
    expect(getProfitVariant(-0.5, false)).toBe('danger')
    expect(getProfitVariant(-25, false)).toBe('danger')
  })

  it('flags a thin (0–10%) margin as warning', () => {
    // Previously these silently returned "default" while a HEALTHIER 15%
    // returned "warning" — an inverted ordering.
    expect(getProfitVariant(0, false)).toBe('warning')
    expect(getProfitVariant(5, false)).toBe('warning')
    expect(getProfitVariant(9.99, false)).toBe('warning')
  })

  it('treats an industry-average (10–20%) margin as neutral default', () => {
    // Previously flagged as warning; a decent margin should not raise an
    // amber alert on the dashboard.
    expect(getProfitVariant(10, false)).toBe('default')
    expect(getProfitVariant(15, false)).toBe('default')
    expect(getProfitVariant(19.99, false)).toBe('default')
  })

  it('treats a strong (>=20%) margin as success', () => {
    expect(getProfitVariant(20, false)).toBe('success')
    expect(getProfitVariant(35, false)).toBe('success')
  })

  it('never ranks a thinner margin as less alarming than a healthier one', () => {
    // Sweep 1% steps from -20 to +40 and assert the contract holds.
    const samples = []
    for (let m = -20; m <= 40; m += 1) {
      samples.push({ margin: m, variant: getProfitVariant(m, false) })
    }
    for (let i = 0; i < samples.length - 1; i++) {
      const thinner = samples[i]
      const healthier = samples[i + 1]
      expect(
        SEVERITY[thinner.variant],
        `severity(margin=${thinner.margin})=${thinner.variant} must be >= severity(margin=${healthier.margin})=${healthier.variant}`
      ).toBeGreaterThanOrEqual(SEVERITY[healthier.variant])
    }
  })
})
