import { useMemo } from 'react'
import { generateProjectForecast } from '../lib/forecastCalculations'
import { generateCashFlowProjection } from '../lib/cashFlowCalculations'
import { analyzeResourceCapacity } from '../lib/resourceCalculations'

/**
 * useProjectAnalytics
 *
 * Shared analytics computations for a single project: predictive forecast,
 * cash flow projection, resource capacity, and financial projections.
 * Used by both the Overview tab (health gauge) and the full Analytics view
 * so the numbers always agree.
 */
export default function useProjectAnalytics({
  selectedProject,
  projectData,
  progress,
  billable,
  revisedContractValue,
  changeOrderValue,
  allProjects = [],
  crewCheckins = [],
  invoices = [],
}) {
  // ---- Predictive Forecast ----
  const forecast = useMemo(() => {
    if (!selectedProject || progress <= 0) return null

    const costHistory = buildCostHistory(projectData)
    const progressHistory = buildProgressHistory(projectData, progress)

    return generateProjectForecast({
      contractValue: selectedProject.contract_value || selectedProject.contractValue || 0,
      changeOrderValue: changeOrderValue || 0,
      progressPercent: progress,
      actualCosts: projectData?.allCostsTotal || billable || 0,
      startDate: selectedProject.start_date || selectedProject.startDate,
      endDate: selectedProject.end_date || selectedProject.endDate,
      costHistory,
      progressHistory,
    })
  }, [selectedProject, projectData, progress, billable, changeOrderValue])

  // ---- Cash Flow ----
  const cashFlow = useMemo(() => {
    // Portfolio projects from useDashboardData carry actual costs on
    // `allCostsTotal`; cashFlowCalculations reads `totalCosts`, so map here
    // to keep the burn-rate proxy on real cost data.
    const projects = allProjects.length > 0
      ? allProjects.map(p => ({ ...p, totalCosts: p.allCostsTotal || 0 }))
      : selectedProject ? [{
        id: selectedProject.id,
        name: selectedProject.name,
        contractValue: selectedProject.contract_value || selectedProject.contractValue || 0,
        changeOrderValue: changeOrderValue || 0,
        progress,
        totalCosts: projectData?.allCostsTotal || 0,
        totalBilled: projectData?.totalBilled || 0,
        startDate: selectedProject.start_date || selectedProject.startDate,
        endDate: selectedProject.end_date || selectedProject.endDate,
      }] : []

    if (projects.length === 0) return null

    return generateCashFlowProjection({
      projects,
      invoices,
    })
  }, [selectedProject, allProjects, projectData, invoices, progress, changeOrderValue])

  // ---- Resource Capacity ----
  const resourceData = useMemo(() => {
    const projects = allProjects.length > 0 ? allProjects : selectedProject ? [{
      id: selectedProject.id,
      name: selectedProject.name,
      progress,
      contractValue: selectedProject.contract_value || selectedProject.contractValue || 0,
      startDate: selectedProject.start_date || selectedProject.startDate,
      endDate: selectedProject.end_date || selectedProject.endDate,
    }] : []

    if (projects.length === 0 || crewCheckins.length === 0) return null

    return analyzeResourceCapacity({
      projects,
      crewCheckins,
    })
  }, [selectedProject, allProjects, crewCheckins, progress])

  // ---- Projections (from forecast) ----
  const projections = useMemo(() => {
    if (!forecast || !forecast.cost) return null
    return {
      estimatedCompletionCost: forecast.cost.bestEstimate,
      estimatedFinalMargin: revisedContractValue > 0
        ? ((revisedContractValue - forecast.cost.bestEstimate) / revisedContractValue) * 100
        : null,
      estimatedCompletionDate: forecast.schedule?.projectedEnd,
      originalBudget: revisedContractValue,
      plannedMargin: 20,
      plannedCompletionDate: selectedProject?.end_date || selectedProject?.endDate,
    }
  }, [forecast, revisedContractValue, selectedProject])

  return { forecast, cashFlow, resourceData, projections }
}

// ---- Data Helpers ----

function buildCostHistory(projectData) {
  if (!projectData) return []

  const entries = []

  if (projectData.laborByDate && Array.isArray(projectData.laborByDate)) {
    for (const entry of projectData.laborByDate) {
      const date = entry.date || entry.work_date
      if (!date) continue
      entries.push({
        date,
        dailyCost: entry.total || entry.cost || entry.amount || 0,
      })
    }
  }

  if (projectData.materialsEquipmentByDate && Array.isArray(projectData.materialsEquipmentByDate)) {
    for (const entry of projectData.materialsEquipmentByDate) {
      const date = entry.date || entry.work_date
      if (!date) continue
      const existing = entries.find(e => e.date === date)
      if (existing) {
        existing.dailyCost += entry.total || entry.cost || entry.amount || 0
      } else {
        entries.push({
          date,
          dailyCost: entry.total || entry.cost || entry.amount || 0,
        })
      }
    }
  }

  return entries.sort((a, b) => new Date(a.date) - new Date(b.date))
}

function buildProgressHistory(projectData, currentProgress) {
  if (projectData?.progressSnapshots && Array.isArray(projectData.progressSnapshots)) {
    return projectData.progressSnapshots.map(s => ({
      date: s.date,
      progress: s.progress,
    }))
  }

  if (projectData?.dailyReports && Array.isArray(projectData.dailyReports) && projectData.dailyReports.length > 0) {
    const sorted = [...projectData.dailyReports]
      .filter(r => r.created_at || r.date)
      .sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date))

    if (sorted.length > 0) {
      return sorted.map((r, i) => ({
        date: (r.created_at || r.date).split('T')[0],
        progress: (currentProgress / sorted.length) * (i + 1),
      }))
    }
  }

  return []
}
