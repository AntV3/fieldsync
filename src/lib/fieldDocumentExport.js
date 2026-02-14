/**
 * Field Document PDF Export
 * Exports field-submitted documents (daily reports, incident reports, crew check-ins)
 * as a consolidated or individual PDF report.
 */

const loadJsPDF = () => import('jspdf')

const PAGE_WIDTH = 210 // A4 width in mm
const MARGIN = 14
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

/**
 * Format currency for display
 */
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)
}

/**
 * Format date for display
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'))
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Add page footer
 */
const addFooter = (doc, pageNum, totalPages) => {
  const y = doc.internal.pageSize.height - 8
  doc.setFontSize(7)
  doc.setTextColor(128, 128, 128)
  doc.text(`Page ${pageNum} of ${totalPages}`, MARGIN, y)
  doc.setTextColor(180, 180, 180)
  doc.text('Generated with FieldSync', PAGE_WIDTH / 2, y, { align: 'center' })
  doc.setTextColor(128, 128, 128)
  doc.text(`Generated ${new Date().toLocaleString()}`, PAGE_WIDTH - MARGIN, y, { align: 'right' })
}

/**
 * Check if we need a new page
 */
const checkPage = (doc, y, needed = 30) => {
  if (y + needed > doc.internal.pageSize.height - 20) {
    doc.addPage()
    return 20
  }
  return y
}

/**
 * Export daily reports as PDF
 * @param {Array} reports - Daily report objects
 * @param {Object} project - Project info
 * @returns {Promise<void>}
 */
export async function exportDailyReportsPDF(reports, project) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  const doc = new jsPDF()

  let y = 20

  // Title
  doc.setFontSize(18)
  doc.setFont(undefined, 'bold')
  doc.text('Daily Reports', PAGE_WIDTH / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(11)
  doc.setFont(undefined, 'normal')
  doc.text(`Project: ${project.name}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 6
  doc.text(`${reports.length} report${reports.length !== 1 ? 's' : ''}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 12

  // Each report
  reports.forEach((report, idx) => {
    y = checkPage(doc, y, 60)

    // Report header
    doc.setDrawColor(200, 200, 200)
    doc.setFillColor(245, 247, 250)
    doc.roundedRect(MARGIN, y - 2, CONTENT_WIDTH, 10, 2, 2, 'F')

    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(`${formatDate(report.report_date)}`, MARGIN + 4, y + 5)

    const statusText = report.status === 'submitted' ? 'Submitted' : 'Draft'
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')
    doc.text(statusText, PAGE_WIDTH - MARGIN - 4, y + 5, { align: 'right' })
    y += 14

    doc.setTextColor(0, 0, 0)

    // Metrics row
    doc.setFontSize(9)
    const metrics = [
      `Crew: ${report.crew_count || 0}`,
      `Tasks: ${report.tasks_completed || 0}/${report.tasks_total || 0}`,
      `T&M Tickets: ${report.tm_tickets_count || 0}`,
      `Photos: ${report.photos_count || 0}`
    ]
    doc.text(metrics.join('    |    '), MARGIN + 4, y)
    y += 7

    // Crew list
    if (report.crew_list?.length > 0) {
      doc.setFont(undefined, 'bold')
      doc.text('Crew:', MARGIN + 4, y)
      doc.setFont(undefined, 'normal')
      const crewNames = report.crew_list.map(w => `${w.name} (${w.role || 'Laborer'})`).join(', ')
      const crewLines = doc.splitTextToSize(crewNames, CONTENT_WIDTH - 8)
      y += 4
      doc.text(crewLines, MARGIN + 4, y)
      y += crewLines.length * 4 + 2
    }

    // Field notes
    if (report.field_notes) {
      y = checkPage(doc, y, 15)
      doc.setFont(undefined, 'bold')
      doc.text('Field Notes:', MARGIN + 4, y)
      doc.setFont(undefined, 'normal')
      y += 4
      const noteLines = doc.splitTextToSize(report.field_notes, CONTENT_WIDTH - 8)
      doc.text(noteLines, MARGIN + 4, y)
      y += noteLines.length * 4 + 2
    }

    // Issues
    if (report.issues) {
      y = checkPage(doc, y, 15)
      doc.setFont(undefined, 'bold')
      doc.text('Issues:', MARGIN + 4, y)
      doc.setFont(undefined, 'normal')
      y += 4
      const issueLines = doc.splitTextToSize(report.issues, CONTENT_WIDTH - 8)
      doc.text(issueLines, MARGIN + 4, y)
      y += issueLines.length * 4 + 2
    }

    y += 8

    // Divider
    if (idx < reports.length - 1) {
      doc.setDrawColor(220, 220, 220)
      doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
      y += 6
    }
  })

  const fileName = `${project.name}_Daily_Reports_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

/**
 * Export incident/injury reports as PDF
 * @param {Array} reports - Injury report objects
 * @param {Object} project - Project info
 * @returns {Promise<void>}
 */
export async function exportIncidentReportsPDF(reports, project) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  const doc = new jsPDF()

  let y = 20

  // Title
  doc.setFontSize(18)
  doc.setFont(undefined, 'bold')
  doc.text('Incident / Injury Reports', PAGE_WIDTH / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(11)
  doc.setFont(undefined, 'normal')
  doc.text(`Project: ${project.name}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 6
  doc.text(`${reports.length} report${reports.length !== 1 ? 's' : ''}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 12

  reports.forEach((report, idx) => {
    y = checkPage(doc, y, 50)

    // Header bar
    const severityColors = {
      minor: [34, 197, 94],
      serious: [245, 158, 11],
      critical: [239, 68, 68],
      near_miss: [59, 130, 246]
    }
    const color = severityColors[report.injury_type] || [128, 128, 128]

    doc.setFillColor(...color)
    doc.roundedRect(MARGIN, y - 2, 3, 14, 1, 1, 'F')

    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(`${formatDate(report.incident_date)}`, MARGIN + 8, y + 4)

    doc.setFontSize(9)
    const typeLabel = (report.injury_type || '').replace('_', ' ').toUpperCase()
    doc.text(typeLabel, MARGIN + 8, y + 10)

    doc.setFont(undefined, 'normal')
    doc.text(report.status === 'open' ? 'OPEN' : 'CLOSED', PAGE_WIDTH - MARGIN - 4, y + 4, { align: 'right' })
    y += 16

    doc.setTextColor(0, 0, 0)

    // Description
    if (report.description) {
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.text('Description:', MARGIN + 4, y)
      doc.setFont(undefined, 'normal')
      y += 4
      const lines = doc.splitTextToSize(report.description, CONTENT_WIDTH - 8)
      doc.text(lines, MARGIN + 4, y)
      y += lines.length * 4 + 2
    }

    // Location
    if (report.location) {
      doc.setFont(undefined, 'bold')
      doc.text('Location: ', MARGIN + 4, y)
      doc.setFont(undefined, 'normal')
      doc.text(report.location, MARGIN + 30, y)
      y += 6
    }

    y += 6

    if (idx < reports.length - 1) {
      doc.setDrawColor(220, 220, 220)
      doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
      y += 6
    }
  })

  const fileName = `${project.name}_Incident_Reports_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

/**
 * Export crew check-in history as PDF
 * @param {Array} checkins - Crew check-in objects
 * @param {Object} project - Project info
 * @returns {Promise<void>}
 */
export async function exportCrewCheckinsPDF(checkins, project) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  const doc = new jsPDF()

  let y = 20

  doc.setFontSize(18)
  doc.setFont(undefined, 'bold')
  doc.text('Crew Check-In History', PAGE_WIDTH / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(11)
  doc.setFont(undefined, 'normal')
  doc.text(`Project: ${project.name}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 6
  doc.text(`${checkins.length} check-in${checkins.length !== 1 ? 's' : ''}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 12

  checkins.forEach((checkin, idx) => {
    y = checkPage(doc, y, 30)
    const workers = checkin.workers || []

    // Date header
    doc.setFillColor(245, 247, 250)
    doc.roundedRect(MARGIN, y - 2, CONTENT_WIDTH, 9, 2, 2, 'F')

    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(formatDate(checkin.check_in_date), MARGIN + 4, y + 4)
    doc.setFont(undefined, 'normal')
    doc.text(`${workers.length} workers`, PAGE_WIDTH - MARGIN - 4, y + 4, { align: 'right' })
    y += 12

    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)

    // Worker list as table
    if (workers.length > 0) {
      doc.setFont(undefined, 'bold')
      doc.text('Name', MARGIN + 4, y)
      doc.text('Role', 110, y)
      y += 5

      doc.setFont(undefined, 'normal')
      workers.forEach(w => {
        y = checkPage(doc, y, 6)
        doc.text(w.name || '—', MARGIN + 4, y)
        doc.text(w.role || 'Laborer', 110, y)
        y += 4.5
      })
    }

    y += 6

    if (idx < checkins.length - 1) {
      doc.setDrawColor(220, 220, 220)
      doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
      y += 5
    }
  })

  const fileName = `${project.name}_Crew_Checkins_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

/**
 * Export ALL field documents as a single consolidated PDF
 * @param {Object} params
 * @param {Array} params.dailyReports
 * @param {Array} params.incidentReports
 * @param {Array} params.crewCheckins
 * @param {Object} params.project
 * @returns {Promise<void>}
 */
export async function exportAllFieldDocumentsPDF({ dailyReports = [], incidentReports = [], crewCheckins = [], project }) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  const doc = new jsPDF()

  let y = 20

  // Cover page
  doc.setFontSize(22)
  doc.setFont(undefined, 'bold')
  doc.text('Field Documents Report', PAGE_WIDTH / 2, y, { align: 'center' })
  y += 10

  doc.setFontSize(13)
  doc.setFont(undefined, 'normal')
  doc.text(`Project: ${project.name}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, PAGE_WIDTH / 2, y, { align: 'center' })
  y += 16

  // Summary table
  doc.setFontSize(11)
  doc.setFont(undefined, 'bold')
  doc.text('Document Summary', MARGIN, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont(undefined, 'normal')
  const summaryItems = [
    [`Daily Reports`, `${dailyReports.length}`],
    [`Incident Reports`, `${incidentReports.length}`],
    [`Crew Check-Ins`, `${crewCheckins.length}`]
  ]
  summaryItems.forEach(([label, count]) => {
    doc.text(label, MARGIN + 4, y)
    doc.text(count, 100, y)
    y += 6
  })

  // Daily Reports Section
  if (dailyReports.length > 0) {
    doc.addPage()
    y = 20

    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Daily Reports', MARGIN, y)
    y += 10

    dailyReports.forEach((report, idx) => {
      y = checkPage(doc, y, 40)

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(formatDate(report.report_date), MARGIN + 2, y)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      doc.text(`Crew: ${report.crew_count || 0} | Tasks: ${report.tasks_completed || 0}/${report.tasks_total || 0} | T&M: ${report.tm_tickets_count || 0}`, MARGIN + 60, y)
      y += 6

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(9)

      if (report.field_notes) {
        const lines = doc.splitTextToSize(report.field_notes, CONTENT_WIDTH - 4)
        doc.text(lines, MARGIN + 2, y)
        y += lines.length * 4 + 2
      }

      if (report.issues) {
        doc.setFont(undefined, 'bold')
        doc.text('Issues: ', MARGIN + 2, y)
        doc.setFont(undefined, 'normal')
        const issueLines = doc.splitTextToSize(report.issues, CONTENT_WIDTH - 20)
        doc.text(issueLines, MARGIN + 20, y)
        y += issueLines.length * 4 + 2
      }

      y += 4
      if (idx < dailyReports.length - 1) {
        doc.setDrawColor(220, 220, 220)
        doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
        y += 4
      }
    })
  }

  // Incident Reports Section
  if (incidentReports.length > 0) {
    doc.addPage()
    y = 20

    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Incident / Injury Reports', MARGIN, y)
    y += 10

    incidentReports.forEach((report, idx) => {
      y = checkPage(doc, y, 35)

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(formatDate(report.incident_date), MARGIN + 2, y)
      doc.setFontSize(8)
      doc.setFont(undefined, 'normal')
      const typeLabel = (report.injury_type || '').replace('_', ' ').toUpperCase()
      doc.text(`${typeLabel} — ${report.status?.toUpperCase() || ''}`, MARGIN + 60, y)
      y += 6

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(9)

      if (report.description) {
        const lines = doc.splitTextToSize(report.description, CONTENT_WIDTH - 4)
        doc.text(lines, MARGIN + 2, y)
        y += lines.length * 4 + 2
      }

      if (report.location) {
        doc.text(`Location: ${report.location}`, MARGIN + 2, y)
        y += 5
      }

      y += 4
      if (idx < incidentReports.length - 1) {
        doc.setDrawColor(220, 220, 220)
        doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
        y += 4
      }
    })
  }

  // Crew Check-Ins Section
  if (crewCheckins.length > 0) {
    doc.addPage()
    y = 20

    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Crew Check-In History', MARGIN, y)
    y += 10

    crewCheckins.forEach((checkin, idx) => {
      y = checkPage(doc, y, 20)
      const workers = checkin.workers || []

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.setTextColor(30, 30, 30)
      doc.text(formatDate(checkin.check_in_date), MARGIN + 2, y)
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      doc.text(`${workers.length} workers`, MARGIN + 60, y)
      y += 6

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(8)

      if (workers.length > 0) {
        const workerList = workers.map(w => `${w.name} (${w.role || 'Laborer'})`).join(', ')
        const lines = doc.splitTextToSize(workerList, CONTENT_WIDTH - 4)
        doc.text(lines, MARGIN + 2, y)
        y += lines.length * 3.5 + 3
      }

      if (idx < crewCheckins.length - 1) {
        doc.setDrawColor(230, 230, 230)
        doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
        y += 3
      }
    })
  }

  const fileName = `${project.name}_Field_Documents_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}
