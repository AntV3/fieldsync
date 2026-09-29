import { describe, it, expect } from 'vitest'
import { BUILT_IN_KPIS } from '../lib/tradeKpis'

describe('BUILT_IN_KPIS.budget_burn_rate', () => {
  const calc = BUILT_IN_KPIS.budget_burn_rate.calculate

  it('returns null when there is no contract value', () => {
    expect(calc({ project: { contract_value: 0 }, totalBilled: 5000 })).toBeNull()
    expect(calc({ project: {}, totalBilled: 5000 })).toBeNull()
  })

  it('returns null when no billing data has been captured yet', () => {
    expect(calc({ project: { contract_value: 100000 } })).toBeNull()
  })

  it('reads billed data from the `totalBilled` field exposed by useDashboardData', () => {
    // Previously the KPI only read `billedTotal`, which is never written
    // anywhere — the KPI returned null for every real project.
    expect(calc({ project: { contract_value: 100000 }, totalBilled: 25000 })).toBe(25)
    expect(calc({ project: { contract_value: 100000 }, totalBilled: 100000 })).toBe(100)
  })

  it('still accepts a legacy `billedTotal` field for old callers', () => {
    expect(calc({ project: { contract_value: 100000 }, billedTotal: 10000 })).toBe(10)
  })

  it('reports 0% when nothing has been billed but the contract exists', () => {
    expect(calc({ project: { contract_value: 100000 }, totalBilled: 0 })).toBe(0)
  })
})
