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
