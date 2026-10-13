import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import usePortfolioMetrics from '../hooks/usePortfolioMetrics'

// Minimal "enhanced project" shaped like what useDashboardData.loadProjectDetails
// emits. The field names here MUST match that producer; the risk engine
// consumes `allCostsTotal`, not `totalCosts`, and prior regressions silently
// zeroed the budget risk factor for every project.
function enhancedProject(overrides = {}) {
  return {
    id: overrides.id || 'p1',
    name: overrides.name || 'Test project',
    contract_value: 100000,
    revisedContractValue: 100000,
    changeOrderValue: 0,
    billable: 50000,
    progress: 50,
    allCostsTotal: 60000,
    totalBilled: 40000,
    corPendingValue: 0,
    corPendingCount: 0,
    lastDailyReport: new Date().toISOString(),
    recentInjuryCount: 0,
    start_date: '2026-01-01',
    hasScheduleData: false,
    hasLaborData: false,
    _detailsLoaded: true,
    ...overrides,
  }
}

describe('usePortfolioMetrics riskAnalysis cost mapping', () => {
  it('reads allCostsTotal (not totalCosts) when scoring budget risk', () => {
    // Costs well over earned revenue should surface a critical budget alert
    const project = enhancedProject({
      allCostsTotal: 120_000, // 240% of earned revenue
      billable: 50_000,
      progress: 50,
    })

    const { result } = renderHook(() => usePortfolioMetrics([project]))

    const risk = result.current.riskAnalysis.projectRisks[0]
    expect(risk).toBeDefined()
    expect(risk.factors.budget.ratio).toBeCloseTo(2.4, 5)
    expect(risk.factors.budget.status).toBe('critical')
    expect(result.current.riskAnalysis.criticalCount).toBeGreaterThan(0)
    expect(
      result.current.riskAnalysis.allAlerts.some(a => a.title === 'Budget Alert')
    ).toBe(true)
  })

  it('derives estimatedCompletionCost from allCostsTotal, not 0', () => {
    const project = enhancedProject({
      allCostsTotal: 60_000,
      progress: 50,
      revisedContractValue: 100_000,
    })

    const { result } = renderHook(() => usePortfolioMetrics([project]))

    const projections = result.current.riskAnalysis.projectRisks[0].projections
    // 60k spent at 50% progress → 120k projected final cost
    expect(projections.estimatedCompletionCost).toBe(120_000)
    // Would have been 100% margin before the fix
    expect(projections.estimatedFinalMargin).toBeLessThan(0)
  })

  it('still accepts the legacy totalCosts shape as a fallback', () => {
    // Keeps older callers (and tests) working even without allCostsTotal
    const project = enhancedProject({
      allCostsTotal: undefined,
      totalCosts: 80_000,
      billable: 50_000,
    })

    const { result } = renderHook(() => usePortfolioMetrics([project]))
    const risk = result.current.riskAnalysis.projectRisks[0]
    expect(risk.factors.budget.ratio).toBeCloseTo(1.6, 5)
  })
})
