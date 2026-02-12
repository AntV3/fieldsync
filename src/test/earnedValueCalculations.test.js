import { describe, it, expect } from 'vitest'
import { calculateEarnedValue, generateSCurveData } from '../lib/earnedValueCalculations'

describe('Earned Value Calculations', () => {
  const baseProject = {
    contractValue: 1000000,
    changeOrderValue: 50000,
    progressPercent: 50,
    actualCosts: 480000,
    startDate: '2025-06-01',
    endDate: '2027-06-01',
    areas: []
  }

  describe('calculateEarnedValue', () => {
    it('calculates BAC correctly with change orders', () => {
      const result = calculateEarnedValue(baseProject)
      expect(result.bac).toBe(1050000) // 1M + 50K
    })

    it('calculates earned value from progress', () => {
      const result = calculateEarnedValue(baseProject)
      expect(result.earnedValue).toBe(525000) // 50% of 1.05M
    })

    it('calculates CPI correctly', () => {
      const result = calculateEarnedValue(baseProject)
      // CPI = EV / AC = 525000 / 480000 ≈ 1.09
      expect(result.cpi).toBeGreaterThan(1)
      expect(result.cpi).toBeCloseTo(1.09, 1)
    })

    it('returns CPI >= 1 when under budget', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        actualCosts: 400000 // Less than earned
      })
      expect(result.cpi).toBeGreaterThan(1)
      expect(result.cpiLabel).toBe('Under Budget')
    })

    it('returns CPI < 1 when over budget', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        actualCosts: 700000 // More than earned
      })
      expect(result.cpi).toBeLessThan(1)
      expect(result.cpiLabel).toMatch(/Over/)
    })

    it('calculates positive cost variance when under budget', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        actualCosts: 400000
      })
      expect(result.costVariance).toBeGreaterThan(0)
    })

    it('calculates negative cost variance when over budget', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        actualCosts: 700000
      })
      expect(result.costVariance).toBeLessThan(0)
    })

    it('calculates EAC and ETC', () => {
      const result = calculateEarnedValue(baseProject)
      // EAC = BAC / CPI
      expect(result.eac).toBeGreaterThan(0)
      // ETC = EAC - AC
      expect(result.etc).toBe(result.eac - baseProject.actualCosts)
    })

    it('returns healthy status when CPI and SPI are good', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        actualCosts: 400000 // Well under budget
      })
      expect(result.healthStatus).toBe('healthy')
    })

    it('returns critical status when CPI is very low', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        progressPercent: 20,
        actualCosts: 600000 // Way over for progress
      })
      expect(result.healthStatus).toBe('critical')
    })

    it('handles zero actual costs gracefully', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        actualCosts: 0
      })
      expect(result.cpi).toBe(1) // Default when no costs
      expect(result.costVariance).toBe(result.earnedValue)
    })

    it('handles zero contract value', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        contractValue: 0,
        changeOrderValue: 0
      })
      expect(result.bac).toBe(0)
      expect(result.earnedValue).toBe(0)
      expect(result.budgetUtilization).toBe(0)
    })

    it('handles missing dates gracefully', () => {
      const result = calculateEarnedValue({
        ...baseProject,
        startDate: null,
        endDate: null
      })
      expect(result.plannedValue).toBe(0)
      expect(result.projectedEndDate).toBeNull()
      expect(result.percentScheduled).toBe(0)
    })

    it('calculates budget utilization percentage', () => {
      const result = calculateEarnedValue(baseProject)
      // 480K / 1.05M ≈ 45.7%
      expect(result.budgetUtilization).toBeGreaterThan(40)
      expect(result.budgetUtilization).toBeLessThan(50)
    })

    it('calculates earned percent', () => {
      const result = calculateEarnedValue(baseProject)
      expect(result.earnedPercent).toBe(50) // 50% progress
    })
  })

  describe('generateSCurveData', () => {
    it('returns empty array without dates', () => {
      const data = generateSCurveData({
        ...baseProject,
        startDate: null,
        endDate: null
      })
      expect(data).toEqual([])
    })

    it('returns data points for valid project', () => {
      const data = generateSCurveData(baseProject)
      expect(data.length).toBeGreaterThan(0)
    })

    it('each point has plannedValue', () => {
      const data = generateSCurveData(baseProject)
      for (const point of data) {
        expect(point).toHaveProperty('plannedValue')
        expect(point).toHaveProperty('date')
      }
    })

    it('planned value increases over time', () => {
      const data = generateSCurveData(baseProject)
      for (let i = 1; i < data.length; i++) {
        expect(data[i].plannedValue).toBeGreaterThanOrEqual(data[i - 1].plannedValue)
      }
    })

    it('last planned value equals BAC', () => {
      const data = generateSCurveData(baseProject)
      const lastPoint = data[data.length - 1]
      expect(lastPoint.plannedValue).toBe(1050000)
    })
  })
})
