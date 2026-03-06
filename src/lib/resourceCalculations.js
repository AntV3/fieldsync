/**
 * Resource Capacity Planning
 *
 * Cross-project resource allocation and capacity analysis:
 * - Crew utilization tracking
 * - Cross-project allocation views
 * - Over/under allocation detection
 * - Capacity forecasting
 */

/**
 * Analyze resource capacity across all projects
 *
 * @param {Array} projects - Projects with crew and schedule data
 * @param {Array} crewCheckins - Recent crew check-in records
 * @param {Object} options - Configuration options
 * @returns {Object} Resource capacity analysis
 */
export function analyzeResourceCapacity({
  projects = [],
  crewCheckins = [],
  options = {},
}) {
  const {
    totalCrewAvailable = null,
    workdaysPerWeek = 5,
    hoursPerDay = 8,
  } = options

  // Current allocation by project
  const allocation = calculateCurrentAllocation(projects, crewCheckins)

  // Utilization metrics
  const utilization = calculateUtilization(allocation, totalCrewAvailable, workdaysPerWeek, hoursPerDay)

  // Demand forecast (next 4 weeks)
  const demandForecast = forecastResourceDemand(projects, allocation)

  // Identify conflicts and risks
  const conflicts = identifyResourceConflicts(allocation, demandForecast, totalCrewAvailable)

  // Weekly heatmap data
  const heatmap = buildAllocationHeatmap(projects, crewCheckins)

  return {
    allocation,
    utilization,
    demandForecast,
    conflicts,
    heatmap,
    summary: buildResourceSummary(allocation, utilization, conflicts),
  }
}

/**
 * Calculate current resource allocation per project
 */
export function calculateCurrentAllocation(projects, crewCheckins) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const projectAllocation = projects
    .filter(p => {
      const progress = p.progress || p.progressPercent || 0
      return progress > 0 && progress < 100
    })
    .map(project => {
      // Get recent crew check-ins for this project
      const projectCheckins = crewCheckins.filter(c =>
        c.project_id === project.id &&
        new Date(c.check_in_date || c.created_at) >= weekAgo
      )

      // Average daily crew size
      const dailyCounts = {}
      for (const checkin of projectCheckins) {
        const date = (checkin.check_in_date || checkin.created_at || '').split('T')[0]
        if (!dailyCounts[date]) dailyCounts[date] = 0
        dailyCounts[date] += checkin.worker_count || (checkin.workers || []).length || 1
      }

      const daysWithCrew = Object.keys(dailyCounts).length
      const totalWorkerDays = Object.values(dailyCounts).reduce((s, c) => s + c, 0)
      const avgDailyCrew = daysWithCrew > 0 ? totalWorkerDays / daysWithCrew : 0

      // Estimated crew need based on remaining work and schedule
      const estimatedNeed = estimateCrewNeed(project)

      return {
        projectId: project.id,
        projectName: project.name,
        progress: project.progress || project.progressPercent || 0,
        currentCrew: Math.round(avgDailyCrew * 10) / 10,
        estimatedNeed,
        daysActive: daysWithCrew,
        totalWorkerDays,
        status: getProjectPhase(project),
        priority: getProjectPriority(project),
      }
    })

  // Sort by priority (critical first)
  projectAllocation.sort((a, b) => b.priority - a.priority)

  return {
    projects: projectAllocation,
    totalAllocated: projectAllocation.reduce((s, p) => s + p.currentCrew, 0),
    totalNeeded: projectAllocation.reduce((s, p) => s + p.estimatedNeed, 0),
    activeProjects: projectAllocation.filter(p => p.currentCrew > 0).length,
  }
}

/**
 * Calculate overall utilization metrics
 */
export function calculateUtilization(allocation, totalCrewAvailable, workdaysPerWeek, hoursPerDay) {
  const totalAllocated = allocation.totalAllocated
  const totalNeeded = allocation.totalNeeded

  // Crew utilization rate
  const utilizationRate = totalCrewAvailable && totalCrewAvailable > 0
    ? roundTo((totalAllocated / totalCrewAvailable) * 100, 1)
    : null

  // Allocation efficiency (how well crew is distributed vs need)
  const allocationEfficiency = totalNeeded > 0
    ? roundTo((totalAllocated / totalNeeded) * 100, 1)
    : 100

  // Per-project utilization
  const projectUtilization = allocation.projects.map(p => ({
    projectId: p.projectId,
    projectName: p.projectName,
    allocated: p.currentCrew,
    needed: p.estimatedNeed,
    utilization: p.estimatedNeed > 0
      ? roundTo((p.currentCrew / p.estimatedNeed) * 100, 1)
      : 100,
    status: getUtilizationStatus(p.currentCrew, p.estimatedNeed),
  }))

  return {
    totalCrewAvailable,
    totalAllocated: roundTo(totalAllocated, 1),
    totalNeeded: roundTo(totalNeeded, 1),
    utilizationRate,
    allocationEfficiency,
    spare: totalCrewAvailable ? roundTo(totalCrewAvailable - totalAllocated, 1) : null,
    overAllocated: projectUtilization.filter(p => p.status === 'over').length,
    underAllocated: projectUtilization.filter(p => p.status === 'under').length,
    balanced: projectUtilization.filter(p => p.status === 'balanced').length,
    projectUtilization,
  }
}

/**
 * Forecast resource demand for upcoming weeks
 */
export function forecastResourceDemand(projects, currentAllocation) {
  const weeks = []
  const now = new Date()

  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(now.getTime() + w * 7 * 24 * 60 * 60 * 1000)
    const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    const projectDemand = currentAllocation.projects.map(pa => {
      const project = projects.find(p => p.id === pa.projectId)
      if (!project) return { projectId: pa.projectId, demand: 0 }

      // Adjust demand based on project phase
      const phase = getProjectPhase(project)
      let demandMultiplier = 1.0
      if (phase === 'mobilizing') demandMultiplier = 1.3
      else if (phase === 'peak') demandMultiplier = 1.1
      else if (phase === 'closeout') demandMultiplier = 0.6

      // Check if project will be active this week
      const endDate = project.endDate || project.end_date
      if (endDate && new Date(endDate) < weekStart) {
        return { projectId: pa.projectId, projectName: pa.projectName, demand: 0 }
      }

      return {
        projectId: pa.projectId,
        projectName: pa.projectName,
        demand: roundTo(pa.estimatedNeed * demandMultiplier, 1),
      }
    })

    weeks.push({
      week: w + 1,
      label: weekLabel,
      totalDemand: roundTo(projectDemand.reduce((s, p) => s + p.demand, 0), 1),
      projects: projectDemand.filter(p => p.demand > 0),
    })
  }

  return weeks
}

/**
 * Identify resource conflicts and risks
 */
export function identifyResourceConflicts(allocation, demandForecast, totalCrewAvailable) {
  const conflicts = []

  // Check for over-allocation
  for (const project of allocation.projects) {
    if (project.currentCrew > 0 && project.estimatedNeed > 0) {
      if (project.currentCrew > project.estimatedNeed * 1.3) {
        conflicts.push({
          type: 'warning',
          category: 'over_staffed',
          title: `${project.projectName} Over-Staffed`,
          description: `${project.currentCrew} crew allocated but only ${project.estimatedNeed} needed.`,
          action: 'Consider reallocating excess crew',
          projectId: project.projectId,
        })
      }
    }
  }

  // Check for under-allocation on critical projects
  for (const project of allocation.projects) {
    if (project.estimatedNeed > 0 && project.currentCrew < project.estimatedNeed * 0.7) {
      const deficit = roundTo(project.estimatedNeed - project.currentCrew, 1)
      conflicts.push({
        type: project.priority >= 3 ? 'critical' : 'warning',
        category: 'under_staffed',
        title: `${project.projectName} Under-Staffed`,
        description: `Needs ${deficit} more crew members to maintain schedule.`,
        action: 'Assign additional crew or adjust schedule',
        projectId: project.projectId,
      })
    }
  }

  // Check future demand vs capacity
  if (totalCrewAvailable) {
    for (const week of demandForecast) {
      if (week.totalDemand > totalCrewAvailable) {
        conflicts.push({
          type: 'warning',
          category: 'capacity_exceeded',
          title: `Capacity Exceeded Week of ${week.label}`,
          description: `Demand of ${week.totalDemand} exceeds available crew of ${totalCrewAvailable}.`,
          action: 'Stagger project schedules or hire temporary crew',
        })
        break // Only flag first occurrence
      }
    }
  }

  // Sort by severity
  const priorityOrder = { critical: 0, warning: 1, info: 2 }
  conflicts.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type])

  return conflicts
}

/**
 * Build weekly allocation heatmap
 */
export function buildAllocationHeatmap(projects, crewCheckins) {
  const now = new Date()
  const weeks = []

  for (let w = -3; w <= 0; w++) {
    const weekStart = new Date(now.getTime() + w * 7 * 24 * 60 * 60 * 1000)
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    const weekLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    const projectCrews = {}
    for (const checkin of crewCheckins) {
      const checkinDate = new Date(checkin.check_in_date || checkin.created_at)
      if (checkinDate >= weekStart && checkinDate < weekEnd) {
        if (!projectCrews[checkin.project_id]) {
          projectCrews[checkin.project_id] = { totalWorkers: 0, days: 0 }
        }
        projectCrews[checkin.project_id].totalWorkers += checkin.worker_count || (checkin.workers || []).length || 1
        projectCrews[checkin.project_id].days += 1
      }
    }

    const cells = projects.map(p => {
      const crew = projectCrews[p.id]
      const avg = crew ? roundTo(crew.totalWorkers / Math.max(1, crew.days), 1) : 0
      return {
        projectId: p.id,
        projectName: p.name,
        avgCrew: avg,
        intensity: getHeatmapIntensity(avg),
      }
    })

    weeks.push({ week: weekLabel, cells })
  }

  return weeks
}

// ---- Helper Functions ----

function estimateCrewNeed(project) {
  const progress = project.progress || project.progressPercent || 0
  const startDate = project.startDate || project.start_date
  const endDate = project.endDate || project.end_date
  const contractValue = (project.contractValue || project.contract_value || 0)

  if (progress >= 100 || !endDate) return 0

  // Estimate based on remaining work and time
  const remaining = 100 - progress
  const now = new Date()
  const end = new Date(endDate)
  const daysRemaining = Math.max(1, (end - now) / (1000 * 60 * 60 * 24))
  const workdaysRemaining = daysRemaining * (5 / 7)

  // Rough heuristic: contract value / typical daily crew cost
  const dailyCrewCost = 3000 // ~$375/hr x 8hrs
  const totalLaborBudget = contractValue * 0.55 // 55% labor ratio
  const remainingLabor = totalLaborBudget * (remaining / 100)
  const neededCrewDays = remainingLabor / dailyCrewCost

  return roundTo(Math.max(1, neededCrewDays / workdaysRemaining), 1)
}

function getProjectPhase(project) {
  const progress = project.progress || project.progressPercent || 0
  if (progress < 10) return 'mobilizing'
  if (progress < 80) return 'peak'
  if (progress < 95) return 'finishing'
  return 'closeout'
}

function getProjectPriority(project) {
  const endDate = project.endDate || project.end_date
  const progress = project.progress || project.progressPercent || 0

  if (!endDate) return 1

  const now = new Date()
  const end = new Date(endDate)
  const daysLeft = (end - now) / (1000 * 60 * 60 * 24)
  const remainingWork = 100 - progress

  // Higher priority = more urgent
  if (daysLeft < 14 && remainingWork > 20) return 5 // Critical
  if (daysLeft < 30 && remainingWork > 30) return 4 // High
  if (daysLeft < 60 && remainingWork > 50) return 3 // Medium-high
  if (remainingWork > 70) return 2 // Medium
  return 1 // Normal
}

function getUtilizationStatus(allocated, needed) {
  if (needed <= 0) return 'balanced'
  const ratio = allocated / needed
  if (ratio >= 1.3) return 'over'
  if (ratio >= 0.7) return 'balanced'
  return 'under'
}

function getHeatmapIntensity(avgCrew) {
  if (avgCrew <= 0) return 0
  if (avgCrew <= 2) return 1
  if (avgCrew <= 5) return 2
  if (avgCrew <= 10) return 3
  return 4
}

function buildResourceSummary(allocation, utilization, conflicts) {
  const criticalCount = conflicts.filter(c => c.type === 'critical').length
  const warningCount = conflicts.filter(c => c.type === 'warning').length

  let status = 'healthy'
  let label = 'Resources well-balanced'

  if (criticalCount > 0) {
    status = 'critical'
    label = `${criticalCount} critical resource issue${criticalCount > 1 ? 's' : ''}`
  } else if (warningCount > 0) {
    status = 'warning'
    label = `${warningCount} resource concern${warningCount > 1 ? 's' : ''}`
  } else if (utilization.utilizationRate !== null && utilization.utilizationRate > 90) {
    status = 'warning'
    label = 'Near full capacity'
  }

  return {
    status,
    label,
    activeProjects: allocation.activeProjects,
    totalCrew: utilization.totalAllocated,
    criticalCount,
    warningCount,
  }
}

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export default {
  analyzeResourceCapacity,
  calculateCurrentAllocation,
  calculateUtilization,
  forecastResourceDemand,
  identifyResourceConflicts,
  buildAllocationHeatmap,
}
