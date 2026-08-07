import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import usePortfolioMetrics from '../hooks/usePortfolioMetrics'

// Regression test for the daily health check finding:
// riskInput.totalCosts was reading `p.totalCosts`, but useDashboardData
// exposes it as `p.allCostsTotal`. That mismatch made the Budget factor
// always score 0 and made cost projections always show $0 completion cost
// with a 100% projected margin, regardless of actual burn.
describe('usePortfolioMetrics riskAnalysis', () => {
  const baseProject = {
    id: 'p1',
    name: 'Overrun Project',
    _detailsLoaded: true,
    contract_value: 100000,
    revisedContractValue: 100000,
    billable: 100000,
    progress: 50,
    expectedProgress: 50,
    corPendingValue: 0,
    lastDailyReport: new Date().toISOString(),
    recentInjuryCount: 0,
  }

  it('reads costs from allCostsTotal so an over-budget project is flagged critical', () => {
    const project = { ...baseProject, allCostsTotal: 90000 }
    const { result } = renderHook(() => usePortfolioMetrics([project]))

    const risk = result.current.riskAnalysis.projectRisks[0]
    expect(risk.factors.budget.ratio).toBeCloseTo(0.9, 5)
    expect(risk.factors.budget.status).toBe('critical')
  })

  it('projects a non-zero completion cost from allCostsTotal, not $0', () => {
    const project = { ...baseProject, allCostsTotal: 60000 }
    const { result } = renderHook(() => usePortfolioMetrics([project]))

    const projections = result.current.riskAnalysis.projectRisks[0].projections
    // At 50% progress with $60k burned, we expect ~$120k projected total.
    expect(projections.estimatedCompletionCost).toBe(120000)
    // Projected margin should reflect the overrun, not the buggy 100%.
    expect(projections.estimatedFinalMargin).toBeLessThan(0)
  })

  it('still treats a zero-cost project as healthy (no false positive)', () => {
    const project = { ...baseProject, allCostsTotal: 0 }
    const { result } = renderHook(() => usePortfolioMetrics([project]))

    const risk = result.current.riskAnalysis.projectRisks[0]
    expect(risk.factors.budget.status).toBe('healthy')
    expect(risk.factors.budget.ratio).toBe(0)
  })
})
