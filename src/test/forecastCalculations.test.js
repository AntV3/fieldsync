/**
 * Forecast math must stay finite for a T&M-only project: no contract value
 * (BAC 0) and no schedule dates. The schedule forecast returns a stub with
 * projectedEnd null, which ProjectHealthOverview treats as "no schedule data".
 */
import { describe, it, expect } from 'vitest'
import {
  generateProjectForecast,
  forecastCosts,
  forecastSchedule,
  calculateScenarios
} from '../lib/forecastCalculations'

// Walk an object and fail on any non-finite number (NaN / ±Infinity)
function expectAllNumbersFinite(value, path = 'root', seen = new Set()) {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} is ${value}`).toBe(true)
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const [k, v] of Object.entries(value)) expectAllNumbersFinite(v, `${path}.${k}`, seen)
}

const emptyInputs = {
  contractValue: 0,
  changeOrderValue: 0,
  progressPercent: 0,
  actualCosts: 0,
  startDate: null,
  endDate: null,
  costHistory: [],
  progressHistory: []
}

describe('forecastSchedule without dates', () => {
  it('returns the stub with projectedEnd null and no NaN', () => {
    const result = forecastSchedule({ progressPercent: 0, startDate: null, endDate: null })
    expect(result.projectedEnd).toBeNull()
    expect(result.daysRemaining).toBeNull()
    expect(result.slippage).toBe(0)
    expect(result.weeklyProgress).toEqual([])
    expectAllNumbersFinite(result)
  })

  it('treats undefined dates and a lone start date the same way', () => {
    expect(forecastSchedule({ progressPercent: 30 }).projectedEnd).toBeNull()
    expect(forecastSchedule({ progressPercent: 30, startDate: '2026-01-01' }).projectedEnd).toBeNull()
  })
})

describe('forecastCosts with a zero budget', () => {
  it('returns finite zeros instead of dividing by BAC', () => {
    const result = forecastCosts({ actualCosts: 0, bac: 0, progressPercent: 0 })
    expect(result.bestEstimate).toBe(0)
    expect(result.eac).toBe(0)
    expect(result.etc).toBe(0)
    expect(result.range).toEqual({ optimistic: 0, pessimistic: 0 })
    expectAllNumbersFinite(result)
  })

  it('stays finite with costs logged against a zero budget', () => {
    const result = forecastCosts({ actualCosts: 4200, bac: 0, progressPercent: 35 })
    expectAllNumbersFinite(result)
  })
})

describe('generateProjectForecast for a T&M-only project', () => {
  it('contract 0 and no dates → finite numbers everywhere and projectedEnd null', () => {
    const forecast = generateProjectForecast(emptyInputs)
    expect(forecast.schedule.projectedEnd).toBeNull()
    expect(forecast.cost.bestEstimate).toBe(0)
    expect(forecast.productivity.trend).toBe('insufficient_data')
    expect(Array.isArray(forecast.insights)).toBe(true)
    expect(forecast.confidence).toBe('low')
    expectAllNumbersFinite(forecast)
  })

  it('contract 0 with progress and costs but no dates stays finite', () => {
    const forecast = generateProjectForecast({
      ...emptyInputs,
      progressPercent: 40,
      actualCosts: 12500,
      costHistory: [
        { date: '2026-10-01', dailyCost: 500 },
        { date: '2026-10-02', dailyCost: 700 },
        { date: '2026-10-03', dailyCost: 600 }
      ],
      progressHistory: [
        { date: '2026-10-01', progress: 10 },
        { date: '2026-10-02', progress: 25 },
        { date: '2026-10-03', progress: 40 }
      ]
    })
    expect(forecast.schedule.projectedEnd).toBeNull()
    expectAllNumbersFinite(forecast)
  })

  it('a contract value with no dates still forecasts cost but no end date', () => {
    const forecast = generateProjectForecast({
      ...emptyInputs,
      contractValue: 100000,
      progressPercent: 40,
      actualCosts: 30000
    })
    expect(forecast.schedule.projectedEnd).toBeNull()
    expect(forecast.cost.bestEstimate).toBeGreaterThan(0)
    expectAllNumbersFinite(forecast)
  })

  it('accepts null as the contract value the way a raw project row carries it', () => {
    const forecast = generateProjectForecast({ ...emptyInputs, contractValue: null })
    expect(forecast.schedule.projectedEnd).toBeNull()
    expectAllNumbersFinite(forecast)
  })
})

describe('calculateScenarios without dates', () => {
  it('returns no scenarios instead of NaN dates', () => {
    const scenarios = calculateScenarios(
      { progressPercent: 40, actualCosts: 1000, contractValue: 0, startDate: null, endDate: null },
      [{ label: 'Add 25% Crew', paceMultiplier: 1.2, costMultiplier: 1.25 }]
    )
    expect(scenarios).toEqual([])
  })
})
