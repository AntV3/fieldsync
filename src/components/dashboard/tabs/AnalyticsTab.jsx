import { useMemo } from 'react'
import { BarChart3, TrendingUp, Users, Shield, TrendingDown } from 'lucide-react'
import { CollapsibleSection } from '../../ui'
import { ForecastChart } from '../../charts'
import { ProjectionsPanel } from '../ProjectionCard'
import ProjectHealthOverview from '../ProjectHealthOverview'
import EarnedValueCard from '../../charts/EarnedValueCard'
import TradeKPICard from '../TradeKPICard'
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
  onShowToast,
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
      {/* Project Health Overview */}
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

      {/* Crew & Safety */}
      <div className="analytics-two-col">
        <div className="analytics-card">
          <div className="analytics-card-header">
            <div className="analytics-card-title">
              <Users size={18} />
              <h3>Crew Analytics</h3>
            </div>
            <span className="analytics-card-badge">{projectData?.uniqueWorkerCount || 0} workers</span>
          </div>
          <div className="analytics-card-body">
            <div className="analytics-stat-grid">
              <div className="analytics-stat">
                <span className="analytics-stat-value">{projectData?.uniqueWorkerCount || 0}</span>
                <span className="analytics-stat-label">Total Workers</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{projectData?.avgCrewSize || 0}</span>
                <span className="analytics-stat-label">Avg Crew / Day</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{projectData?.peakCrewSize || 0}</span>
                <span className="analytics-stat-label">Peak Crew Size</span>
              </div>
              <div className="analytics-stat">
                <span className="analytics-stat-value">{projectData?.crewDaysTracked || 0}</span>
                <span className="analytics-stat-label">Days Tracked</span>
              </div>
            </div>
            {(projectData?.crewTrend || 0) !== 0 && (
              <div className={`analytics-trend-badge ${projectData.crewTrend > 0 ? 'up' : 'down'}`}>
                {projectData.crewTrend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>{Math.abs(Math.round(projectData.crewTrend))}% {projectData.crewTrend > 0 ? 'increase' : 'decrease'} vs prior week</span>
              </div>
            )}
            {projectData?.crewByDate && Object.keys(projectData.crewByDate).length > 0 && (
              <CollapsibleSection
                title="Crew Size Trend"
                variant="compact"
                summary={`Last ${Math.min(Object.keys(projectData.crewByDate).length, 14)} days`}
              >
                <div className="analytics-mini-chart">
                  <div className="analytics-mini-chart-label">Recent Crew Size</div>
                  <div className="analytics-mini-bars">
                    {Object.keys(projectData.crewByDate).sort().slice(-14).map(date => {
                      const count = projectData.crewByDate[date]
                      const max = projectData.peakCrewSize || 1
                      return (
                        <div key={date} className="analytics-mini-bar-wrap" title={`${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${count} workers`}>
                          <div className="analytics-mini-bar" style={{ height: `${(count / max) * 100}%` }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CollapsibleSection>
            )}
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-card-header">
            <div className="analytics-card-title">
              <Shield size={18} />
              <h3>Safety Dashboard</h3>
            </div>
            <span className={`reports-section-badge ${(projectData?.injuryReportsCount || 0) > 0 ? 'warning' : 'success'}`}>
              {(projectData?.injuryReportsCount || 0) > 0
                ? `${projectData.injuryReportsCount} incident${projectData.injuryReportsCount !== 1 ? 's' : ''}`
                : 'No incidents'
              }
            </span>
          </div>
          <div className="analytics-card-body">
            <div className="analytics-safety-hero">
              <div className={`reports-safety-days ${(projectData?.daysSinceLastInjury === null || projectData?.daysSinceLastInjury > 30) ? 'excellent' : projectData?.daysSinceLastInjury > 7 ? 'good' : 'caution'}`}>
                <span className="reports-safety-days-value">
                  {projectData?.daysSinceLastInjury !== null ? projectData.daysSinceLastInjury : '--'}
                </span>
                <span className="reports-safety-days-label">
                  {projectData?.daysSinceLastInjury !== null ? 'Days Since Last Incident' : 'No Incidents Recorded'}
                </span>
              </div>
            </div>
            <CollapsibleSection
              title="Safety Breakdown"
              variant="compact"
              summary={`${projectData?.injuryReportsCount || 0} incidents, ${projectData?.oshaRecordable || 0} OSHA`}
            >
              <div className="analytics-stat-grid">
                <div className="analytics-stat">
                  <span className="analytics-stat-value">{projectData?.injuryReportsCount || 0}</span>
                  <span className="analytics-stat-label">Total Incidents</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-value">{projectData?.oshaRecordable || 0}</span>
                  <span className="analytics-stat-label">OSHA Recordable</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-value">{projectData?.reportsWithIssues || 0}</span>
                  <span className="analytics-stat-label">Reports w/ Issues</span>
                </div>
                <div className="analytics-stat">
                  <span className="analytics-stat-value">{projectData?.laborManDays || 0}</span>
                  <span className="analytics-stat-label">Total Man-Days</span>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>

      {/* Earned Value Analysis */}
      {selectedProject?.contract_value > 0 && (
        <div className="analytics-section">
          <EarnedValueCard
            contractValue={selectedProject.contract_value}
            changeOrderValue={changeOrderValue || 0}
            progressPercent={progress}
            actualCosts={projectData?.allCostsTotal || 0}
            startDate={selectedProject.start_date}
            endDate={selectedProject.end_date}
            areas={areas}
          />
        </div>
      )}

      {/* Trade-Specific KPIs */}
      <div className="analytics-section">
        <TradeKPICard projectId={selectedProject?.id} projectData={projectData} />
      </div>

      {/* Financial Projections */}
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

      {/* Predictive Forecast */}
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
