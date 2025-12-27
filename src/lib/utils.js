export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function calculateProgress(areas) {
  if (!areas || areas.length === 0) return 0

  let progress = 0
  areas.forEach(area => {
    if (area.status === 'done') {
      progress += area.weight
    }
  })
  return Math.round(progress)
}

/**
 * Calculate progress based on SOV scheduled values when available
 * Falls back to percentage-based calculation if no scheduled values exist
 * @param {Array} areas - Array of area objects
 * @returns {Object} { progress, earnedValue, totalValue, isValueBased }
 */
export function calculateValueProgress(areas) {
  if (!areas || areas.length === 0) {
    return { progress: 0, earnedValue: 0, totalValue: 0, isValueBased: false }
  }

  // Check if any areas have scheduled values
  const hasScheduledValues = areas.some(a => a.scheduled_value > 0)

  if (hasScheduledValues) {
    // Value-based calculation using SOV amounts
    const totalValue = areas.reduce((sum, a) => sum + (a.scheduled_value || 0), 0)
    const earnedValue = areas
      .filter(a => a.status === 'done')
      .reduce((sum, a) => sum + (a.scheduled_value || 0), 0)
    const progress = totalValue > 0 ? Math.round((earnedValue / totalValue) * 100) : 0

    return { progress, earnedValue, totalValue, isValueBased: true }
  }

  // Fallback to percentage-based calculation
  const progress = areas
    .filter(a => a.status === 'done')
    .reduce((sum, a) => sum + (a.weight || 0), 0)

  return { progress: Math.round(progress), earnedValue: 0, totalValue: 0, isValueBased: false }
}

export function getOverallStatus(areas) {
  if (!areas || areas.length === 0) return 'not_started'
  
  const hasWorking = areas.some(a => a.status === 'working')
  const hasDone = areas.some(a => a.status === 'done')
  const allDone = areas.every(a => a.status === 'done')

  if (allDone) return 'done'
  if (hasWorking || hasDone) return 'working'
  return 'not_started'
}

export function getOverallStatusLabel(areas) {
  const status = getOverallStatus(areas)
  if (status === 'done') return 'Complete'
  if (status === 'working') return 'In Progress'
  return 'Not Started'
}

export function formatStatus(status) {
  if (status === 'not_started') return 'Not Started'
  if (status === 'working') return 'Working'
  if (status === 'done') return 'Done'
  return status
}

/**
 * Calculate schedule performance for a project
 * @param {Object} project - Project with start_date, end_date, progress, planned_man_days
 * @param {number} actualManDays - Actual man-days from crew check-ins
 * @returns {Object} { scheduleStatus, scheduleVariance, scheduleLabel, laborStatus, laborVariance, laborLabel, hasScheduleData, hasLaborData }
 */
export function calculateScheduleInsights(project, actualManDays = 0) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const result = {
    scheduleStatus: 'on_track',    // 'ahead' | 'on_track' | 'behind'
    scheduleVariance: 0,           // percentage variance
    scheduleLabel: 'On Track',     // display label
    laborStatus: 'on_track',       // 'under' | 'on_track' | 'over'
    laborVariance: 0,              // percentage variance
    laborLabel: null,              // display label (null if no planned_man_days)
    hasScheduleData: false,
    hasLaborData: false
  }

  // Schedule performance (time-based)
  if (project.start_date && project.end_date) {
    const startDate = new Date(project.start_date)
    const endDate = new Date(project.end_date)
    startDate.setHours(0, 0, 0, 0)
    endDate.setHours(0, 0, 0, 0)

    const totalDuration = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)))
    const elapsedDays = Math.max(0, Math.ceil((today - startDate) / (1000 * 60 * 60 * 24)))

    // Expected progress percentage based on time elapsed
    const expectedProgress = Math.min(100, (elapsedDays / totalDuration) * 100)
    const actualProgress = project.progress || 0

    // Calculate variance (positive = ahead, negative = behind)
    const progressDiff = actualProgress - expectedProgress
    result.scheduleVariance = Math.round(progressDiff)
    result.hasScheduleData = true

    // Determine status with 5% tolerance
    if (progressDiff > 5) {
      result.scheduleStatus = 'ahead'
      result.scheduleLabel = `Ahead of Schedule (+${result.scheduleVariance}%)`
    } else if (progressDiff < -5) {
      result.scheduleStatus = 'behind'
      result.scheduleLabel = `Behind Schedule (${result.scheduleVariance}%)`
    } else {
      result.scheduleStatus = 'on_track'
      result.scheduleLabel = 'On Track'
    }
  }

  // Labor performance (man-days based)
  if (project.planned_man_days && project.planned_man_days > 0) {
    const progress = project.progress || 0
    const expectedManDays = (progress / 100) * project.planned_man_days

    if (expectedManDays > 0 && actualManDays > 0) {
      // Variance: (actual - expected) / expected * 100
      // Positive = over (bad), Negative = under (good)
      const laborDiff = ((actualManDays - expectedManDays) / expectedManDays) * 100
      result.laborVariance = Math.round(laborDiff)
      result.hasLaborData = true

      // Determine status with 10% tolerance
      if (laborDiff > 10) {
        result.laborStatus = 'over'
        result.laborLabel = `Over Planned (+${result.laborVariance}% man-days)`
      } else if (laborDiff < -10) {
        result.laborStatus = 'under'
        result.laborLabel = `Under Planned (${result.laborVariance}% man-days)`
      } else {
        result.laborStatus = 'on_track'
        result.laborLabel = 'Labor On Track'
      }
    } else if (actualManDays > 0) {
      // Has actual man-days but can't calculate expected (progress is 0)
      result.hasLaborData = true
      result.laborLabel = `${actualManDays} man-days used`
    }
  }

  return result
}

/**
 * Check if a project should be auto-archived
 * @param {Object} project - Project with progress, status, and areas
 * @param {number} archiveDays - Days after completion to auto-archive (default 30)
 * @returns {boolean}
 */
export function shouldAutoArchive(project, archiveDays = 30) {
  // Already archived
  if (project.status === 'archived') return false

  // Not complete
  if (project.progress < 100) return false

  // Check if all areas are done
  const areas = project.areas || []
  if (areas.length === 0) return false

  const allDone = areas.every(a => a.status === 'done')
  if (!allDone) return false

  // Find when project was completed (most recent area updated_at)
  const lastUpdate = areas.reduce((latest, area) => {
    const areaDate = new Date(area.updated_at)
    return areaDate > latest ? areaDate : latest
  }, new Date(0))

  // If no valid date found, don't archive
  if (lastUpdate.getTime() === 0) return false

  const daysSinceCompletion = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24))
  return daysSinceCompletion >= archiveDays
}
