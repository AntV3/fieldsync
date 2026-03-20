import { useMemo } from 'react'
import { BarChart3, TrendingUp } from 'lucide-react'
import { CollapsibleSection } from '../../ui'
import { ForecastChart } from '../../charts'
import { ProjectionsPanel } from '../ProjectionCard'
import ProjectHealthOverview from '../ProjectHealthOverview'
import { generateProjectForecast } from '../../../lib/forecastCalculations'
import { generateCashFlowProjection } from '../../../lib/cashFlowCalculations'
import { analyzeResourceCapacity } from '../../../lib/resourceCalculations'

/**
 * AnalyticsTab
 *
 * Minimalist project analytics focused on what matters:
 * 1. Health Overview — at-a-glance status of budget, schedule, cash flow, resources
 * 2. Financial Projections — where the project is heading cost/margin-wise
 * 3. Predictive Forecast — cost & schedule trend chart
 */
export default function AnalyticsTab({
  selectedProject,
  projectData,
  progress,
  billable,
  revisedContractValue,
  changeOrderValue,
  areas,
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

  // ---- Cash Flow (used by Health Overview) ----
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

  // ---- Resource Capacity (used by Health Overview) ----
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

  return (
    <div className="pv-tab-panel analytics-tab animate-fade-in">
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

      {/* 2. Financial Projections */}
      {projections && (
        <div className="analytics-section">
          <CollapsibleSection
            title="Financial Projections"
            icon={<TrendingUp size={18} />}
            defaultOpen
            summary={`Est. cost: $${Math.round((projections.estimatedCompletionCost || 0) / 1000)}K · Margin: ${projections.estimatedFinalMargin?.toFixed(1) ?? '--'}%`}
          >
            <ProjectionsPanel {...projections} />
          </CollapsibleSection>
        </div>
      )}

      {/* 3. Predictive Forecast */}
      <div className="analytics-section">
        <CollapsibleSection
          title="Predictive Forecast"
          icon={<BarChart3 size={18} />}
          defaultOpen
          summary={forecast?.schedule ? (forecast.schedule.slippage > 0 ? `${forecast.schedule.slippage}d behind` : forecast.schedule.slippage < 0 ? `${Math.abs(forecast.schedule.slippage)}d ahead` : 'On schedule') : 'No data'}
        >
          <ForecastChart
            forecast={forecast}
            contractValue={revisedContractValue}
          />
        </CollapsibleSection>
      </div>
    </div>
  )
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
