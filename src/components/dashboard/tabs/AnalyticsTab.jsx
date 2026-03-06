import { useMemo } from 'react'
import { ForecastChart, CashFlowChart, ResourceCapacityChart, QualityMetricsChart } from '../../charts'
import { BenchmarkComparison, useCompanyAverages, INDUSTRY_BENCHMARKS } from '../BenchmarkComparison'
import { ProjectionsPanel } from '../ProjectionCard'
import { generateProjectForecast, calculateScenarios } from '../../../lib/forecastCalculations'
import { generateCashFlowProjection } from '../../../lib/cashFlowCalculations'
import { analyzeResourceCapacity } from '../../../lib/resourceCalculations'
import { calculateQualityMetrics } from '../../../lib/qualityCalculations'

/**
 * AnalyticsTab
 *
 * Advanced analytics dashboard combining:
 * - Predictive Forecasting
 * - Cash Flow Projections
 * - Resource Capacity Planning
 * - Quality Metrics
 * - Industry Benchmarking
 */
export default function AnalyticsTab({
  selectedProject,
  projectData,
  progress,
  billable,
  revisedContractValue,
  changeOrderValue,
  areas,
  // Portfolio data (for multi-project views)
  allProjects = [],
  crewCheckins = [],
  invoices = [],
  punchListItems = [],
  dailyReports = [],
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

  // ---- Scenarios ----
  const scenarios = useMemo(() => {
    if (!selectedProject || progress <= 0) return []
    return calculateScenarios({
      contractValue: selectedProject.contract_value || selectedProject.contractValue || 0,
      changeOrderValue: changeOrderValue || 0,
      progressPercent: progress,
      actualCosts: projectData?.allCostsTotal || billable || 0,
      startDate: selectedProject.start_date || selectedProject.startDate,
      endDate: selectedProject.end_date || selectedProject.endDate,
    })
  }, [selectedProject, projectData, progress, billable, changeOrderValue])

  // ---- Cash Flow ----
  const cashFlow = useMemo(() => {
    const projects = allProjects.length > 0 ? allProjects : selectedProject ? [{
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

  // ---- Quality Metrics ----
  const quality = useMemo(() => {
    if (!punchListItems || punchListItems.length === 0) {
      // Return basic quality metrics even without punch list data
      if (areas.length === 0) return null
      return calculateQualityMetrics({
        punchListItems: [],
        areas,
        dailyReports,
        contractValue: revisedContractValue || 0,
        totalCosts: projectData?.allCostsTotal || 0,
      })
    }

    return calculateQualityMetrics({
      punchListItems,
      areas,
      dailyReports,
      contractValue: revisedContractValue || 0,
      totalCosts: projectData?.allCostsTotal || 0,
    })
  }, [punchListItems, areas, dailyReports, revisedContractValue, projectData])

  // ---- Benchmarks ----
  const companyAverages = useCompanyAverages(allProjects)
  const benchmarkMetrics = useMemo(() => {
    if (!projectData) return {}

    const totalCosts = projectData.allCostsTotal || 0
    const earnedRevenue = billable || 0
    const contractVal = revisedContractValue || 0

    return {
      profitMargin: earnedRevenue > 0 ? ((earnedRevenue - totalCosts) / earnedRevenue) * 100 : null,
      costRatio: earnedRevenue > 0 ? (totalCosts / earnedRevenue) * 100 : null,
      changeOrderRate: contractVal > 0 ? (changeOrderValue / contractVal) * 100 : null,
      safetyIncidentRate: projectData.recentInjuryCount ?? 0,
    }
  }, [projectData, billable, revisedContractValue, changeOrderValue])

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

  return (
    <div className="pv-tab-panel analytics-tab animate-fade-in">
      {/* Projections summary */}
      {projections && (
        <ProjectionsPanel {...projections} />
      )}

      {/* Predictive Forecast */}
      <ForecastChart
        forecast={forecast}
        contractValue={revisedContractValue}
      />

      {/* Scenarios */}
      {scenarios.length > 0 && (
        <div className="analytics-scenarios">
          <h4 className="analytics-scenarios__title">What-If Scenarios</h4>
          <div className="analytics-scenarios__grid">
            {scenarios.map((scenario, i) => (
              <div
                key={i}
                className={`analytics-scenario ${scenario.meetsDeadline && scenario.meetsMargin ? 'analytics-scenario--good' : scenario.meetsDeadline || scenario.meetsMargin ? 'analytics-scenario--partial' : 'analytics-scenario--bad'}`}
              >
                <div className="analytics-scenario__label">{scenario.label}</div>
                <div className="analytics-scenario__values">
                  <span>Cost: ${Math.round(scenario.projectedCost / 1000)}K</span>
                  <span>Margin: {scenario.margin}%</span>
                  <span>{scenario.slippage > 0 ? `+${scenario.slippage}d late` : scenario.slippage < 0 ? `${Math.abs(scenario.slippage)}d early` : 'On time'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash Flow */}
      <CashFlowChart cashFlow={cashFlow} />

      {/* Two-column layout for Resource + Quality */}
      <div className="analytics-split">
        <ResourceCapacityChart resourceData={resourceData} />
        <QualityMetricsChart quality={quality} />
      </div>

      {/* Benchmarks */}
      <BenchmarkComparison
        projectMetrics={benchmarkMetrics}
        companyAverages={companyAverages}
      />
    </div>
  )
}

// ---- Data Helpers ----

/**
 * Build cost history from project data
 * Extracts daily cost entries from available data sources
 */
function buildCostHistory(projectData) {
  if (!projectData) return []

  const entries = []

  // From labor by date
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

  // Merge materials by date
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

/**
 * Build progress history from available data
 */
function buildProgressHistory(projectData, currentProgress) {
  // If we have crew check-in history with progress snapshots, use those
  if (projectData?.progressSnapshots && Array.isArray(projectData.progressSnapshots)) {
    return projectData.progressSnapshots.map(s => ({
      date: s.date,
      progress: s.progress,
    }))
  }

  // Fallback: estimate from daily reports (if available)
  if (projectData?.dailyReports && Array.isArray(projectData.dailyReports) && projectData.dailyReports.length > 0) {
    const sorted = [...projectData.dailyReports]
      .filter(r => r.created_at || r.date)
      .sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date))

    if (sorted.length > 0) {
      // Interpolate progress over the report dates
      return sorted.map((r, i) => ({
        date: (r.created_at || r.date).split('T')[0],
        progress: (currentProgress / sorted.length) * (i + 1),
      }))
    }
  }

  return []
}
