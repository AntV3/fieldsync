import { describe, it, expect } from 'vitest'
import {
  calculateRiskScore,
  calculateBudgetFactor,
  calculateScheduleFactor,
  calculateCORExposureFactor,
  calculateActivityFactor,
  calculateSafetyFactor,
  generateSmartAlerts,
  calculateProjections,
  DEFAULT_THRESHOLDS
} from '../lib/riskCalculations'

describe('calculateBudgetFactor', () => {
  it('returns healthy status when costs are below 60% of revenue', () => {
    const result = calculateBudgetFactor(50000, 100000)
    expect(result.status).toBe('healthy')
    expect(result.score).toBe(0)
    expect(result.ratio).toBe(0.5)
  })

  it('returns warning status when costs are between 60-75% of revenue', () => {
    const result = calculateBudgetFactor(70000, 100000)
    expect(result.status).toBe('warning')
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThan(60)
  })

  it('returns critical status when costs exceed 85% of revenue', () => {
    const result = calculateBudgetFactor(90000, 100000)
    expect(result.status).toBe('critical')
    expect(result.score).toBeGreaterThanOrEqual(60)
  })

  it('handles zero revenue gracefully', () => {
    const result = calculateBudgetFactor(10000, 0)
    expect(result.status).toBe('healthy')
    expect(result.score).toBe(0)
  })

  it('handles zero costs', () => {
    const result = calculateBudgetFactor(0, 100000)
    expect(result.status).toBe('healthy')
    expect(result.ratio).toBe(0)
  })
})

describe('calculateScheduleFactor', () => {
  it('returns healthy when ahead of schedule', () => {
    const result = calculateScheduleFactor(80, 70) // 80% done, expected 70%
    expect(result.status).toBe('healthy')
    expect(result.score).toBe(0)
  })

  it('returns healthy when on schedule', () => {
    const result = calculateScheduleFactor(50, 50)
    expect(result.status).toBe('healthy')
    expect(result.variance).toBe(0)
  })

  it('returns warning when slightly behind', () => {
    const result = calculateScheduleFactor(70, 80) // 10% behind
    expect(result.status).toBe('warning')
    expect(result.score).toBeGreaterThan(0)
  })

  it('returns critical when significantly behind', () => {
    const result = calculateScheduleFactor(50, 80) // 37.5% behind
    expect(result.status).toBe('critical')
    expect(result.score).toBe(100) // Maxed out
  })

  it('handles zero expected progress', () => {
    const result = calculateScheduleFactor(50, 0)
    expect(result.status).toBe('healthy')
    expect(result.score).toBe(0)
  })
})

describe('calculateCORExposureFactor', () => {
  it('returns healthy when no pending CORs', () => {
    const result = calculateCORExposureFactor(0, 100000)
    expect(result.status).toBe('healthy')
    expect(result.score).toBe(0)
  })

  it('returns healthy when COR exposure is low', () => {
    const result = calculateCORExposureFactor(3000, 100000) // 3%
    expect(result.status).toBe('healthy')
  })

  it('returns warning when COR exposure is moderate', () => {
    const result = calculateCORExposureFactor(12000, 100000) // 12%
    expect(result.status).toBe('warning')
  })

  it('returns critical when COR exposure is high', () => {
    const result = calculateCORExposureFactor(30000, 100000) // 30%
    expect(result.status).toBe('critical')
  })

  it('handles zero contract value', () => {
    const result = calculateCORExposureFactor(10000, 0)
    expect(result.status).toBe('healthy')
    expect(result.score).toBe(0)
  })
})

describe('calculateActivityFactor', () => {
  it('returns healthy when report filed today', () => {
    const today = new Date().toISOString()
    const result = calculateActivityFactor(today)
    expect(result.status).toBe('healthy')
    expect(result.daysSince).toBe(0)
  })

  it('returns healthy when report filed yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const result = calculateActivityFactor(yesterday)
    expect(result.status).toBe('healthy')
    expect(result.daysSince).toBe(1)
  })

  it('returns warning when report is 3 days old', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const result = calculateActivityFactor(threeDaysAgo)
    expect(result.status).toBe('warning')
    expect(result.daysSince).toBe(3)
  })

  it('returns critical when no reports filed', () => {
    const result = calculateActivityFactor(null)
    expect(result.status).toBe('critical')
    expect(result.score).toBe(100)
  })

  it('returns critical when report is very old', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const result = calculateActivityFactor(tenDaysAgo)
    expect(result.status).toBe('critical')
  })
})

describe('calculateSafetyFactor', () => {
  it('returns healthy when no injuries', () => {
    const result = calculateSafetyFactor(0)
    expect(result.status).toBe('healthy')
    expect(result.score).toBe(0)
  })

  it('returns warning when one injury', () => {
    const result = calculateSafetyFactor(1)
    expect(result.status).toBe('warning')
  })

  it('returns critical when multiple injuries', () => {
    const result = calculateSafetyFactor(3)
    expect(result.status).toBe('critical')
    expect(result.score).toBe(100)
  })
})

describe('calculateRiskScore', () => {
  it('returns healthy score for well-performing project', () => {
    const project = {
      totalCosts: 50000,
      earnedRevenue: 100000,
      actualProgress: 60,
      expectedProgress: 55,
      pendingCORValue: 2000,
      contractValue: 150000,
      lastReportDate: new Date().toISOString(),
      recentInjuryCount: 0
    }

    const result = calculateRiskScore(project)
    expect(result.status).toBe('healthy')
    expect(result.score).toBeLessThanOrEqual(25)
  })

  it('returns warning score for project with some issues', () => {
    const project = {
      totalCosts: 70000,
      earnedRevenue: 100000,
      actualProgress: 50,
      expectedProgress: 60,
      pendingCORValue: 15000,
      contractValue: 150000,
      lastReportDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      recentInjuryCount: 0
    }

    const result = calculateRiskScore(project)
    expect(result.status).toBe('warning')
    expect(result.score).toBeGreaterThan(25)
    expect(result.score).toBeLessThanOrEqual(60)
  })

  it('returns critical score for troubled project', () => {
    const project = {
      totalCosts: 95000,
      earnedRevenue: 100000,
      actualProgress: 40,
      expectedProgress: 70,
      pendingCORValue: 40000,
      contractValue: 150000,
      lastReportDate: null,
      recentInjuryCount: 2
    }

    const result = calculateRiskScore(project)
    expect(result.status).toBe('critical')
    expect(result.score).toBeGreaterThan(60)
  })

  it('includes breakdown of all factors', () => {
    const project = {
      totalCosts: 60000,
      earnedRevenue: 100000,
      actualProgress: 50,
      expectedProgress: 50,
      pendingCORValue: 5000,
      contractValue: 150000,
      lastReportDate: new Date().toISOString(),
      recentInjuryCount: 0
    }

    const result = calculateRiskScore(project)
    expect(result.factors).toBeDefined()
    expect(result.factors.budget).toBeDefined()
    expect(result.factors.schedule).toBeDefined()
    expect(result.factors.corExposure).toBeDefined()
    expect(result.factors.activity).toBeDefined()
    expect(result.factors.safety).toBeDefined()
  })
})

describe('generateSmartAlerts', () => {
  it('generates critical alert for budget issues', () => {
    const project = {
      id: 'test-1',
      name: 'Test Project',
      totalCosts: 90000,
      earnedRevenue: 100000,
      actualProgress: 80,
      expectedProgress: 80,
      pendingCORValue: 0,
      contractValue: 150000,
      lastReportDate: new Date().toISOString(),
      recentInjuryCount: 0
    }

    const riskResult = calculateRiskScore(project)
    const alerts = generateSmartAlerts(riskResult, project)

    const budgetAlert = alerts.find(a => a.title === 'Budget Alert' || a.title === 'Budget Watch')
    expect(budgetAlert).toBeDefined()
  })

  it('generates no alerts for healthy project', () => {
    const project = {
      id: 'test-2',
      name: 'Healthy Project',
      totalCosts: 40000,
      earnedRevenue: 100000,
      actualProgress: 60,
      expectedProgress: 55,
      pendingCORValue: 2000,
      contractValue: 150000,
      lastReportDate: new Date().toISOString(),
      recentInjuryCount: 0
    }

    const riskResult = calculateRiskScore(project)
    const alerts = generateSmartAlerts(riskResult, project)

    // Should have few or no alerts
    expect(alerts.filter(a => a.type === 'critical').length).toBe(0)
  })

  it('sorts alerts by priority', () => {
    const project = {
      id: 'test-3',
      name: 'Troubled Project',
      totalCosts: 95000,
      earnedRevenue: 100000,
      actualProgress: 40,
      expectedProgress: 70,
      pendingCORValue: 40000,
      contractValue: 150000,
      lastReportDate: null,
      recentInjuryCount: 2
    }

    const riskResult = calculateRiskScore(project)
    const alerts = generateSmartAlerts(riskResult, project)

    // Critical alerts should come first
    if (alerts.length > 1) {
      const criticalIndexes = alerts
        .map((a, i) => a.type === 'critical' ? i : -1)
        .filter(i => i >= 0)
      const warningIndexes = alerts
        .map((a, i) => a.type === 'warning' ? i : -1)
        .filter(i => i >= 0)

      if (criticalIndexes.length && warningIndexes.length) {
        expect(Math.max(...criticalIndexes)).toBeLessThan(Math.min(...warningIndexes))
      }
    }
  })
})

describe('calculateProjections', () => {
  it('calculates estimated completion cost', () => {
    const project = {
      actualProgress: 50,
      totalCosts: 75000,
      earnedRevenue: 100000,
      contractValue: 200000
    }

    const result = calculateProjections(project)
    expect(result.estimatedCompletionCost).toBe(150000) // 75000 / 0.5 = 150000
  })

  it('calculates estimated final margin', () => {
    const project = {
      actualProgress: 50,
      totalCosts: 75000,
      earnedRevenue: 100000,
      contractValue: 200000
    }

    const result = calculateProjections(project)
    // (200000 - 150000) / 200000 = 25%
    expect(result.estimatedFinalMargin).toBe(25)
  })

  it('handles zero progress', () => {
    const project = {
      actualProgress: 0,
      totalCosts: 0,
      earnedRevenue: 0,
      contractValue: 200000
    }

    const result = calculateProjections(project)
    expect(result.estimatedCompletionCost).toBeNull()
  })

  it('handles 100% progress', () => {
    const project = {
      actualProgress: 100,
      totalCosts: 180000,
      earnedRevenue: 200000,
      contractValue: 200000
    }

    const result = calculateProjections(project)
    expect(result.estimatedCompletionCost).toBe(180000)
    expect(result.estimatedFinalMargin).toBe(10) // (200k - 180k) / 200k = 10%
  })
})

describe('DEFAULT_THRESHOLDS', () => {
  it('has all required threshold categories', () => {
    expect(DEFAULT_THRESHOLDS.budget).toBeDefined()
    expect(DEFAULT_THRESHOLDS.schedule).toBeDefined()
    expect(DEFAULT_THRESHOLDS.corExposure).toBeDefined()
    expect(DEFAULT_THRESHOLDS.activity).toBeDefined()
    expect(DEFAULT_THRESHOLDS.safety).toBeDefined()
  })

  it('has healthy, warning, and critical values for each category', () => {
    Object.values(DEFAULT_THRESHOLDS).forEach(category => {
      expect(category.healthy).toBeDefined()
      expect(category.warning).toBeDefined()
      expect(category.critical).toBeDefined()
    })
  })

  it('has thresholds in correct order (healthy < warning < critical)', () => {
    Object.entries(DEFAULT_THRESHOLDS).forEach(([name, category]) => {
      expect(category.healthy).toBeLessThanOrEqual(category.warning)
      expect(category.warning).toBeLessThanOrEqual(category.critical)
    })
  })
})
