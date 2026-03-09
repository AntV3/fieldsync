import { useMemo } from 'react'
import { calculateRiskScore, generateSmartAlerts, calculateProjections } from '../lib/riskCalculations'

/**
 * Computes portfolio-level financial metrics, project health, schedule metrics,
 * and risk analysis from enhanced project data.
 *
 * OPTIMIZED: Single-pass loop computes portfolio, health, and schedule metrics
 * simultaneously instead of 3 separate iterations over projectsData.
 * Risk analysis only runs on projects that have detailed data loaded.
 */
export default function usePortfolioMetrics(projectsData) {
  // Single-pass computation for portfolio, health, and schedule metrics
  const { portfolioMetrics, projectHealth, scheduleMetrics } = useMemo(() => {
    // Portfolio accumulators
    let totalOriginalContract = 0
    let totalChangeOrders = 0
    let totalEarned = 0
    let totalPendingCORValue = 0
    let totalPendingCORCount = 0

    // Health accumulators
    let complete = 0
    let onTrack = 0
    let atRisk = 0
    let overBudget = 0
    let withChangeOrders = 0

    // Schedule accumulators
    let ahead = 0
    let schedOnTrack = 0
    let behind = 0
    let overLabor = 0
    let underLabor = 0
    let onTrackLabor = 0

    // Single pass over all projects
    for (const p of projectsData) {
      // Portfolio
      totalOriginalContract += p.contract_value || 0
      totalChangeOrders += p.changeOrderValue || 0
      totalEarned += p.billable || 0
      totalPendingCORValue += p.corPendingValue || 0
      totalPendingCORCount += p.corPendingCount || 0

      // Health
      const contractVal = p.revisedContractValue || p.contract_value
      if (p.progress >= 100) complete++
      if (p.progress < 100 && p.billable <= contractVal * (p.progress / 100) * 1.1) onTrack++
      if (p.billable > contractVal * 0.9 && p.progress < 90) atRisk++
      if (p.billable > contractVal) overBudget++
      if ((p.changeOrderValue || 0) > 0) withChangeOrders++

      // Schedule
      if (p.hasScheduleData) {
        if (p.scheduleStatus === 'ahead') ahead++
        else if (p.scheduleStatus === 'behind') behind++
        else schedOnTrack++
      }
      if (p.hasLaborData) {
        if (p.laborStatus === 'over') overLabor++
        else if (p.laborStatus === 'under') underLabor++
        else onTrackLabor++
      }
    }

    const totalPortfolioValue = totalOriginalContract + totalChangeOrders

    return {
      portfolioMetrics: {
        totalOriginalContract,
        totalChangeOrders,
        totalPortfolioValue,
        totalEarned,
        totalRemaining: totalPortfolioValue - totalEarned,
        weightedCompletion: totalPortfolioValue > 0
          ? Math.round((totalEarned / totalPortfolioValue) * 100)
          : 0,
        totalPendingCORValue,
        totalPendingCORCount
      },
      projectHealth: {
        projectsComplete: complete,
        projectsOnTrack: onTrack,
        projectsAtRisk: atRisk,
        projectsOverBudget: overBudget,
        projectsWithChangeOrders: withChangeOrders
      },
      scheduleMetrics: {
        scheduleAhead: ahead,
        scheduleOnTrack: schedOnTrack,
        scheduleBehind: behind,
        laborOver: overLabor,
        laborUnder: underLabor,
        laborOnTrack: onTrackLabor,
        hasAnyScheduleData: ahead + schedOnTrack + behind > 0,
        hasAnyLaborData: overLabor + underLabor + onTrackLabor > 0
      }
    }
  }, [projectsData])

  // Risk analysis: only compute for projects with loaded detail data
  const riskAnalysis = useMemo(() => {
    const projectRisks = projectsData
      .filter(p => p._detailsLoaded) // Skip projects without detailed data
      .map(p => {
        const riskInput = {
          id: p.id,
          name: p.name,
          totalCosts: p.totalCosts || 0,
          earnedRevenue: p.billable || 0,
          actualProgress: p.progress || 0,
          expectedProgress: p.expectedProgress || p.progress,
          pendingCORValue: p.corPendingValue || 0,
          contractValue: p.revisedContractValue || p.contract_value || 0,
          lastReportDate: p.lastDailyReport,
          recentInjuryCount: p.recentInjuryCount || 0,
          startDate: p.start_date
        }

        const riskResult = calculateRiskScore(riskInput)
        const alerts = generateSmartAlerts(riskResult, { ...riskInput, name: p.name })
        const projections = calculateProjections(riskInput)

        const alertsWithProject = alerts.map(a => ({
          ...a,
          projectName: p.name,
          projectId: p.id
        }))

        return {
          projectId: p.id,
          projectName: p.name,
          riskScore: riskResult.score,
          riskStatus: riskResult.status,
          riskLabel: riskResult.label,
          factors: riskResult.factors,
          alerts: alertsWithProject,
          projections
        }
      })

    const allAlerts = projectRisks
      .flatMap(p => p.alerts)
      .sort((a, b) => {
        const priority = { critical: 0, warning: 1, info: 2 }
        return priority[a.type] - priority[b.type]
      })

    return {
      projectRisks,
      allAlerts,
      criticalCount: allAlerts.filter(a => a.type === 'critical').length,
      warningCount: allAlerts.filter(a => a.type === 'warning').length
    }
  }, [projectsData])

  return { portfolioMetrics, projectHealth, scheduleMetrics, riskAnalysis }
}
