/**
 * Payroll Export Module
 * Generates payroll-ready CSV exports in formats compatible with
 * ADP, Paychex, and Gusto payroll systems.
 *
 * Uses T&M ticket worker data (most accurate) with crew check-in fallback.
 */

import { toCSV } from './financialExport'

// Trigger file download in browser
function downloadFile(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Aggregate T&M worker hours by worker name, project, date, and labor class.
 * Returns a flat array of payroll line items.
 */
export function aggregateWorkerHours(tmTickets) {
  const map = new Map()

  for (const ticket of tmTickets) {
    const projectName = ticket.projects?.name || 'Unknown Project'
    const jobNumber = ticket.projects?.job_number || ''
    const workDate = ticket.work_date

    for (const worker of (ticket.t_and_m_workers || [])) {
      const key = `${worker.name}|${workDate}|${projectName}|${worker.labor_class || worker.role || 'Laborer'}`

      if (map.has(key)) {
        const existing = map.get(key)
        existing.regularHours += parseFloat(worker.hours) || 0
        existing.overtimeHours += parseFloat(worker.overtime_hours) || 0
      } else {
        map.set(key, {
          employeeName: worker.name,
          date: workDate,
          projectName,
          jobNumber,
          laborClass: worker.labor_class || worker.role || 'Laborer',
          regularHours: parseFloat(worker.hours) || 0,
          overtimeHours: parseFloat(worker.overtime_hours) || 0,
          timeStarted: worker.time_started || '',
          timeEnded: worker.time_ended || ''
        })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const nameCompare = a.employeeName.localeCompare(b.employeeName)
    if (nameCompare !== 0) return nameCompare
    return a.date.localeCompare(b.date)
  })
}

/**
 * Export payroll data in ADP format (Run Powered by ADP CSV)
 * ADP expects: Employee ID, Employee Name, Hours Worked, OT Hours, Earnings Code, Department
 */
export function exportPayrollADP(tmTickets, companyName, dateRange) {
  const rows = aggregateWorkerHours(tmTickets)

  const headers = [
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'date', label: 'Work Date' },
    { key: 'earningsCode', label: 'Earnings Code' },
    { key: 'regularHours', label: 'Hours' },
    { key: 'overtimeHours', label: 'OT Hours' },
    { key: 'totalHours', label: 'Total Hours' },
    { key: 'laborClass', label: 'Department' },
    { key: 'jobNumber', label: 'Job Code' },
    { key: 'projectName', label: 'Project' }
  ]

  const csvRows = rows.map(r => ({
    ...r,
    earningsCode: 'REG',
    totalHours: (r.regularHours + r.overtimeHours).toFixed(2),
    regularHours: r.regularHours.toFixed(2),
    overtimeHours: r.overtimeHours.toFixed(2)
  }))

  const csv = toCSV(headers, csvRows)
  const filename = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Payroll_ADP_${dateRange.start}_to_${dateRange.end}.csv`
  downloadFile(csv, filename)
  return filename
}

/**
 * Export payroll data in Paychex format
 * Paychex Flex CSV: Employee Name, Check Date, Hours, OT Hours, Job Code
 */
export function exportPayrollPaychex(tmTickets, companyName, dateRange) {
  const rows = aggregateWorkerHours(tmTickets)

  const headers = [
    { key: 'employeeName', label: 'Employee Name' },
    { key: 'date', label: 'Check Date' },
    { key: 'regularHours', label: 'Regular Hours' },
    { key: 'overtimeHours', label: 'Overtime Hours' },
    { key: 'totalHours', label: 'Total Hours' },
    { key: 'laborClass', label: 'Pay Code' },
    { key: 'jobNumber', label: 'Job Number' },
    { key: 'projectName', label: 'Location' }
  ]

  const csvRows = rows.map(r => ({
    ...r,
    totalHours: (r.regularHours + r.overtimeHours).toFixed(2),
    regularHours: r.regularHours.toFixed(2),
    overtimeHours: r.overtimeHours.toFixed(2)
  }))

  const csv = toCSV(headers, csvRows)
  const filename = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Payroll_Paychex_${dateRange.start}_to_${dateRange.end}.csv`
  downloadFile(csv, filename)
  return filename
}

/**
 * Export payroll data in Gusto format
 * Gusto CSV Import: Employee, Date, Regular Hours, Overtime Hours, Job
 */
export function exportPayrollGusto(tmTickets, companyName, dateRange) {
  const rows = aggregateWorkerHours(tmTickets)

  const headers = [
    { key: 'employeeName', label: 'Employee' },
    { key: 'date', label: 'Date' },
    { key: 'regularHours', label: 'Regular Hours' },
    { key: 'overtimeHours', label: 'Overtime Hours' },
    { key: 'laborClass', label: 'Classification' },
    { key: 'jobNumber', label: 'Job' },
    { key: 'projectName', label: 'Project' }
  ]

  const csvRows = rows.map(r => ({
    ...r,
    regularHours: r.regularHours.toFixed(2),
    overtimeHours: r.overtimeHours.toFixed(2)
  }))

  const csv = toCSV(headers, csvRows)
  const filename = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Payroll_Gusto_${dateRange.start}_to_${dateRange.end}.csv`
  downloadFile(csv, filename)
  return filename
}

/**
 * Export generic payroll summary CSV (works with any provider)
 * Groups by worker across the entire date range
 */
export function exportPayrollSummary(tmTickets, companyName, dateRange) {
  const rows = aggregateWorkerHours(tmTickets)

  // Aggregate by worker across all dates
  const workerMap = new Map()
  for (const row of rows) {
    const key = `${row.employeeName}|${row.laborClass}`
    if (workerMap.has(key)) {
      const existing = workerMap.get(key)
      existing.regularHours += row.regularHours
      existing.overtimeHours += row.overtimeHours
      existing.daysWorked += 1
      if (!existing.projects.includes(row.projectName)) {
        existing.projects.push(row.projectName)
      }
    } else {
      workerMap.set(key, {
        employeeName: row.employeeName,
        laborClass: row.laborClass,
        regularHours: row.regularHours,
        overtimeHours: row.overtimeHours,
        daysWorked: 1,
        projects: [row.projectName]
      })
    }
  }

  const headers = [
    { key: 'employeeName', label: 'Employee' },
    { key: 'laborClass', label: 'Classification' },
    { key: 'regularHours', label: 'Regular Hours' },
    { key: 'overtimeHours', label: 'Overtime Hours' },
    { key: 'totalHours', label: 'Total Hours' },
    { key: 'daysWorked', label: 'Days Worked' },
    { key: 'projects', label: 'Projects' }
  ]

  const csvRows = Array.from(workerMap.values()).map(r => ({
    ...r,
    totalHours: (r.regularHours + r.overtimeHours).toFixed(2),
    regularHours: r.regularHours.toFixed(2),
    overtimeHours: r.overtimeHours.toFixed(2),
    projects: r.projects.join('; ')
  }))

  const csv = toCSV(headers, csvRows)
  const filename = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Payroll_Summary_${dateRange.start}_to_${dateRange.end}.csv`
  downloadFile(csv, filename)
  return filename
}

export default {
  aggregateWorkerHours,
  exportPayrollADP,
  exportPayrollPaychex,
  exportPayrollGusto,
  exportPayrollSummary
}
