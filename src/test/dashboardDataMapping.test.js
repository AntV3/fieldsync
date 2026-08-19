import { describe, it, expect } from 'vitest'
import { sumInvoicesToDollars } from '../hooks/useDashboardData'
import { buildRiskInput } from '../hooks/usePortfolioMetrics'
import { calculateRiskScore } from '../lib/riskCalculations'

describe('sumInvoicesToDollars', () => {
  it('converts invoice.total from cents to dollars', () => {
    const invoices = [
      { status: 'sent', total: 3_000_000 },
      { status: 'paid', total: 2_500_000 },
    ]
    expect(sumInvoicesToDollars(invoices)).toBe(55_000)
  })

  it('ignores draft invoices', () => {
    const invoices = [
      { status: 'draft', total: 9_999_999 },
      { status: 'sent', total: 1_000_000 },
    ]
    expect(sumInvoicesToDollars(invoices)).toBe(10_000)
  })

  it('falls back to legacy amount field when total is missing', () => {
    const invoices = [{ status: 'sent', amount: 4_200_000 }]
    expect(sumInvoicesToDollars(invoices)).toBe(42_000)
  })

  it('returns 0 for empty / null / missing input rather than NaN', () => {
    expect(sumInvoicesToDollars([])).toBe(0)
    expect(sumInvoicesToDollars(null)).toBe(0)
    expect(sumInvoicesToDollars(undefined)).toBe(0)
    expect(sumInvoicesToDollars([{ status: 'sent' }])).toBe(0)
  })

  it('handles string cents values from the Supabase driver', () => {
    const invoices = [{ status: 'sent', total: '1500000' }]
    expect(sumInvoicesToDollars(invoices)).toBe(15_000)
  })
})

describe('buildRiskInput', () => {
  it('reads costs from allCostsTotal (the field emitted by useDashboardData)', () => {
    const enhancedProject = {
      id: 'p1',
      name: 'Test',
      allCostsTotal: 60_000,
      billable: 100_000,
      progress: 60,
    }
    const input = buildRiskInput(enhancedProject)
    expect(input.totalCosts).toBe(60_000)
  })

  it('regression: does NOT read the phantom `totalCosts` field', () => {
    // A prior version of this mapping read `p.totalCosts`, which does not
    // exist on the enhanced project shape and silently forced budget factor
    // to 0 for every project. If the caller ever accidentally has a
    // `totalCosts` field, we still want the real `allCostsTotal` to win —
    // otherwise the regression can hide again.
    const enhancedProject = {
      id: 'p1',
      name: 'Test',
      allCostsTotal: 90_000,
      totalCosts: 0,
      billable: 100_000,
      progress: 60,
    }
    const input = buildRiskInput(enhancedProject)
    expect(input.totalCosts).toBe(90_000)
  })

  it('feeds a real budget-warning through calculateRiskScore', () => {
    const enhancedProject = {
      id: 'p1',
      name: 'Test',
      allCostsTotal: 70_000,
      billable: 100_000,
      progress: 70,
      contract_value: 200_000,
    }
    const risk = calculateRiskScore(buildRiskInput(enhancedProject))
    expect(risk.factors.budget.status).not.toBe('healthy')
  })

  it('would have reported the previously-broken project as healthy', () => {
    // Reproduce the pre-fix behaviour by manually feeding totalCosts=0
    // (the value the old mapping produced) and confirm calculateRiskScore
    // agrees that would have been misreported. This anchors the fix.
    const brokenInput = {
      id: 'p1',
      name: 'Test',
      totalCosts: 0,
      earnedRevenue: 100_000,
      actualProgress: 70,
      expectedProgress: 70,
      pendingCORValue: 0,
      contractValue: 200_000,
      lastReportDate: null,
      recentInjuryCount: 0,
      startDate: null,
    }
    const risk = calculateRiskScore(brokenInput)
    expect(risk.factors.budget.status).toBe('healthy')
  })
})
