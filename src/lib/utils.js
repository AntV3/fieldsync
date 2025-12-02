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
