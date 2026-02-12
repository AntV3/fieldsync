import { useMemo } from 'react'
import { calculateRiskScore, generateSmartAlerts, calculateProjections } from '../lib/riskCalculations'

/**
 * Computes portfolio-level financial metrics, project health, schedule metrics,
 * and risk analysis from enhanced project data.
 * Extracted from Dashboard.jsx for maintainability.
 */
export default function usePortfolioMetrics(projectsData) {
  const portfolioMetrics = useMemo(() => {
    const totalOriginalContract = projectsData.reduce((sum, p) => sum + (p.contract_value || 0), 0)
    const totalChangeOrders = projectsData.reduce((sum, p) => sum + (p.changeOrderValue || 0), 0)
    const totalPortfolioValue = totalOriginalContract + totalChangeOrders
    const totalEarned = projectsData.reduce((sum, p) => sum + (p.billable || 0), 0)
    const totalRemaining = totalPortfolioValue - totalEarned

    const weightedCompletion = totalPortfolioValue > 0
      ? Math.round((totalEarned / totalPortfolioValue) * 100)
      : 0

    const totalPendingCORValue = projectsData.reduce((sum, p) => sum + (p.corPendingValue || 0), 0)
    const totalPendingCORCount = projectsData.reduce((sum, p) => sum + (p.corPendingCount || 0), 0)

    return {
      totalOriginalContract,
      totalChangeOrders,
      totalPortfolioValue,
      totalEarned,
      totalRemaining,
      weightedCompletion,
      totalPendingCORValue,
      totalPendingCORCount
    }
  }, [projectsData])

  const projectHealth = useMemo(() => {
    let complete = 0
    let onTrack = 0
    let atRisk = 0
    let overBudget = 0
    let withChangeOrders = 0

    for (const p of projectsData) {
      const contractVal = p.revisedContractValue || p.contract_value
      if (p.progress >= 100) complete++
      if (p.progress < 100 && p.billable <= contractVal * (p.progress / 100) * 1.1) onTrack++
      if (p.billable > contractVal * 0.9 && p.progress < 90) atRisk++
      if (p.billable > contractVal) overBudget++
      if ((p.changeOrderValue || 0) > 0) withChangeOrders++
    }

    return {
      projectsComplete: complete,
      projectsOnTrack: onTrack,
      projectsAtRisk: atRisk,
      projectsOverBudget: overBudget,
      projectsWithChangeOrders: withChangeOrders
    }
  }, [projectsData])

  const scheduleMetrics = useMemo(() => {
    let ahead = 0
    let onTrack = 0
    let behind = 0
    let overLabor = 0
    let underLabor = 0
    let onTrackLabor = 0

    for (const p of projectsData) {
      if (p.hasScheduleData) {
        if (p.scheduleStatus === 'ahead') ahead++
        else if (p.scheduleStatus === 'behind') behind++
        else onTrack++
      }
      if (p.hasLaborData) {
        if (p.laborStatus === 'over') overLabor++
        else if (p.laborStatus === 'under') underLabor++
        else onTrackLabor++
      }
    }

    return {
      scheduleAhead: ahead,
      scheduleOnTrack: onTrack,
      scheduleBehind: behind,
      laborOver: overLabor,
      laborUnder: underLabor,
      laborOnTrack: onTrackLabor,
      hasAnyScheduleData: ahead + onTrack + behind > 0,
      hasAnyLaborData: overLabor + underLabor + onTrackLabor > 0
    }
  }, [projectsData])

  const riskAnalysis = useMemo(() => {
    const projectRisks = projectsData.map(p => {
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
