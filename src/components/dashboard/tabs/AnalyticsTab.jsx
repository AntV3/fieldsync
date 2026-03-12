import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { CollapsibleSection } from '../../ui'
import { ForecastChart } from '../../charts'
import ProjectHealthOverview from '../ProjectHealthOverview'
import { generateProjectForecast } from '../../../lib/forecastCalculations'

/**
 * AnalyticsTab
 *
 * Streamlined project analytics focused on what a PM/owner needs:
 * 1. Project Health — at-a-glance status with key projections
 * 2. Forecast — predictive cost & schedule chart (collapsible)
 */
export default function AnalyticsTab({
  selectedProject,
  projectData,
  progress,
  billable,
  revisedContractValue,
  changeOrderValue,
  areas,
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

  // ---- Projections (derived from forecast) ----
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

  // Forecast summary for collapsible header
  const forecastSummary = forecast?.schedule
    ? (forecast.schedule.slippage > 0
      ? `${forecast.schedule.slippage}d behind`
      : forecast.schedule.slippage < 0
        ? `${Math.abs(forecast.schedule.slippage)}d ahead`
        : 'On schedule')
    : 'No data'

  return (
    <div className="pv-tab-panel analytics-tab animate-fade-in">
      {/* 1. Project Health — always visible */}
      <div className="analytics-section">
        <ProjectHealthOverview
          forecast={forecast}
          cashFlow={null}
          resourceData={null}
          progress={progress}
          revisedContractValue={revisedContractValue}
          projectData={projectData}
          changeOrderValue={changeOrderValue}
          selectedProject={selectedProject}
          projections={projections}
        />
      </div>

      {/* 2. Forecast — collapsible drill-down */}
      <div className="analytics-section">
        <CollapsibleSection
          title="Forecast"
          icon={<BarChart3 size={18} />}
          summary={forecastSummary}
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
