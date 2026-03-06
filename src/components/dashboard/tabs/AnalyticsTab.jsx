import { useMemo } from 'react'
import { BarChart3, GitBranch, Banknote, Users, Award, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { ForecastChart, CashFlowChart, ResourceCapacityChart } from '../../charts'
import { BenchmarkComparison, useCompanyAverages, INDUSTRY_BENCHMARKS } from '../BenchmarkComparison'
import { ProjectionsPanel } from '../ProjectionCard'
import ProjectHealthOverview from '../ProjectHealthOverview'
import { generateProjectForecast, calculateScenarios } from '../../../lib/forecastCalculations'
import { generateCashFlowProjection } from '../../../lib/cashFlowCalculations'
import { analyzeResourceCapacity } from '../../../lib/resourceCalculations'

/**
 * AnalyticsTab
 *
 * Project analytics dashboard organized around project health:
 * 1. Health Overview — at-a-glance status of budget, schedule, cash flow, resources
 * 2. Financial Projections — where the project is heading cost/margin-wise
 * 3. Predictive Forecast — detailed cost & schedule forecast with charts
 * 4. What-If Scenarios — scenario modeling
 * 5. Cash Flow — inflow/outflow projections
 * 6. Resource Capacity — crew allocation and demand
 * 7. Benchmarks — comparison to industry standards
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
      {/* Executive Summary Banner */}
      {forecast && (
        <div className="analytics-executive-banner">
          <div className="analytics-executive-banner__inner">
            <h3 className="analytics-executive-banner__title">Executive Summary</h3>
            <div className="analytics-executive-banner__items">
              {forecast.cost && (
                <div className="analytics-executive-banner__item">
                  {forecast.cost.bestEstimate <= (revisedContractValue || 0)
                    ? <TrendingDown size={16} className="analytics-executive-banner__icon analytics-executive-banner__icon--positive" />
                    : <TrendingUp size={16} className="analytics-executive-banner__icon analytics-executive-banner__icon--negative" />
                  }
                  <span>Projected cost: <strong>${Math.round((forecast.cost.bestEstimate || 0) / 1000)}K</strong></span>
                </div>
              )}
              {forecast.schedule && (
                <div className="analytics-executive-banner__item">
                  <Clock size={16} className="analytics-executive-banner__icon" />
                  <span>
                    {forecast.schedule.slippage > 0
                      ? <>{forecast.schedule.slippage} days behind schedule</>
                      : forecast.schedule.slippage < 0
                        ? <>{Math.abs(forecast.schedule.slippage)} days ahead of schedule</>
                        : <>On schedule</>
                    }
                  </span>
                </div>
              )}
              {projections?.estimatedFinalMargin != null && (
                <div className="analytics-executive-banner__item">
                  {projections.estimatedFinalMargin >= 0
                    ? <CheckCircle2 size={16} className="analytics-executive-banner__icon analytics-executive-banner__icon--positive" />
                    : <AlertTriangle size={16} className="analytics-executive-banner__icon analytics-executive-banner__icon--negative" />
                  }
                  <span>Est. margin: <strong>{projections.estimatedFinalMargin.toFixed(1)}%</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1. Project Health Overview — the big picture */}
      <div className="analytics-section">
        <ProjectHealthOverview
          forecast={forecast}
          cashFlow={cashFlow}
          resourceData={resourceData}
          progress={progress}
          revisedContractValue={revisedContractValue}
          projectData={projectData}
          changeOrderValue={changeOrderValue}
          selectedProject={selectedProject}
        />
      </div>

      {/* 2. Projections summary */}
      {projections && (
        <div className="analytics-section">
          <ProjectionsPanel {...projections} />
        </div>
      )}

      <hr className="analytics-divider" />

      {/* 3. Predictive Forecast */}
      <div className="analytics-section">
        <div className="analytics-section__header">
          <BarChart3 size={20} className="analytics-section__header-icon" />
          <h3 className="analytics-section__title">Predictive Forecast</h3>
        </div>
        <ForecastChart
          forecast={forecast}
          contractValue={revisedContractValue}
        />
      </div>

      <hr className="analytics-divider" />

      {/* 4. Scenarios */}
      {scenarios.length > 0 && (
        <>
          <div className="analytics-section">
            <div className="analytics-section__header">
              <GitBranch size={20} className="analytics-section__header-icon" />
              <h3 className="analytics-section__title">What-If Scenarios</h3>
            </div>
            <div className="analytics-scenarios">
              <div className="analytics-scenarios__grid">
                {scenarios.map((scenario, i) => {
                  const isGood = scenario.meetsDeadline && scenario.meetsMargin
                  const isPartial = scenario.meetsDeadline || scenario.meetsMargin
                  const statusClass = isGood ? 'analytics-scenario--good' : isPartial ? 'analytics-scenario--partial' : 'analytics-scenario--bad'

                  return (
                    <div key={i} className={`analytics-scenario ${statusClass}`}>
                      <div className="analytics-scenario__header">
                        <span className="analytics-scenario__status-icon">
                          {isGood
                            ? <CheckCircle2 size={18} className="analytics-scenario__icon analytics-scenario__icon--good" />
                            : isPartial
                              ? <AlertTriangle size={18} className="analytics-scenario__icon analytics-scenario__icon--partial" />
                              : <XCircle size={18} className="analytics-scenario__icon analytics-scenario__icon--bad" />
                          }
                        </span>
                        <span className="analytics-scenario__label">{scenario.label}</span>
                      </div>
                      <div className="analytics-scenario__values">
                        <div className="analytics-scenario__metric">
                          <span className="analytics-scenario__metric-label">Cost</span>
                          <span className="analytics-scenario__metric-value">${Math.round(scenario.projectedCost / 1000)}K</span>
                        </div>
                        <div className="analytics-scenario__metric">
                          <span className="analytics-scenario__metric-label">Margin</span>
                          <span className="analytics-scenario__metric-value">{scenario.margin}%</span>
                        </div>
                        <div className="analytics-scenario__metric">
                          <span className="analytics-scenario__metric-label">Schedule</span>
                          <span className="analytics-scenario__metric-value">
                            {scenario.slippage > 0 ? `+${scenario.slippage}d late` : scenario.slippage < 0 ? `${Math.abs(scenario.slippage)}d early` : 'On time'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <hr className="analytics-divider" />
        </>
      )}

      {/* 5. Cash Flow */}
      <div className="analytics-section">
        <div className="analytics-section__header">
          <Banknote size={20} className="analytics-section__header-icon" />
          <h3 className="analytics-section__title">Cash Flow</h3>
        </div>
        <CashFlowChart cashFlow={cashFlow} />
      </div>

      <hr className="analytics-divider" />

      {/* 6. Resource Capacity — full width now */}
      <div className="analytics-section">
        <div className="analytics-section__header">
          <Users size={20} className="analytics-section__header-icon" />
          <h3 className="analytics-section__title">Resource Capacity</h3>
        </div>
        <ResourceCapacityChart resourceData={resourceData} />
      </div>

      <hr className="analytics-divider" />

      {/* 7. Benchmarks */}
      <div className="analytics-section">
        <div className="analytics-section__header">
          <Award size={20} className="analytics-section__header-icon" />
          <h3 className="analytics-section__title">Industry Benchmarks</h3>
        </div>
        <BenchmarkComparison
          projectMetrics={benchmarkMetrics}
          companyAverages={companyAverages}
        />
      </div>
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
