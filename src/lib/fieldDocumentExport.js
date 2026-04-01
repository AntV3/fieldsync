/**
 * Field Document PDF Export
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports field-submitted documents (daily reports, incident reports,
 * crew check-ins) as clean, branded, professional PDF reports.
 *
 * Design system mirrors the COR and Invoice generators for a unified
 * look across all FieldSync exports.
 */

import { db } from './supabase'
import { hexToRgb, loadImagesAsBase64 } from './imageUtils'

const loadJsPDF = () => import('jspdf')
const loadAutoTable = () => import('jspdf-autotable')

const PAGE_WIDTH = 210 // A4 width in mm
// const PAGE_HEIGHT = 297 // A4 height in mm (used dynamically via doc.internal)
const MARGIN = 20
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

// ── Design tokens ───────────────────────────────────────────────────────────

const COLORS = {
  dark: [17, 24, 39],       // near-black headings
  text: [51, 65, 85],       // body text
  mid: [71, 85, 105],       // secondary / labels
  subtle: [148, 163, 184],  // light labels / rules
  surface: [248, 250, 252], // table alt rows / boxes
  border: [226, 232, 240],  // thin rules
  white: [255, 255, 255],
  green: [16, 185, 129],
  amber: [217, 119, 6],
  red: [220, 38, 38],
  blue: [59, 130, 246],
}

const SEVERITY = {
  minor:     { color: [16, 185, 129],  label: 'MINOR' },
  serious:   { color: [245, 158, 11],  label: 'SERIOUS' },
  critical:  { color: [220, 38, 38],   label: 'CRITICAL' },
  near_miss: { color: [59, 130, 246],  label: 'NEAR MISS' },
}

// ── Formatting helpers ──────────────────────────────────────────────────────

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'))
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  })
}

const formatShortDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Shared PDF primitives ───────────────────────────────────────────────────

function getPrimaryColor(context) {
  const hex = context?.branding?.primaryColor
    || context?.company?.branding_color
    || context?.company?.primary_color
  return hex ? hexToRgb(hex) : [30, 58, 95]
}

/**
 * Draw the branded header band at the top of the first page.
 */
function drawHeaderBand(doc, title, subtitle, primary, context) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const headerH = 38

  doc.setFillColor(...primary)
  doc.rect(0, 0, pageWidth, headerH, 'F')

  // Company name
  const companyName = context?.company?.name || ''
  if (companyName) {
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(companyName, MARGIN, headerH / 2 - 4)

    const contact = [context?.company?.phone, context?.company?.email].filter(Boolean)
    if (contact.length) {
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(220, 230, 245)
      doc.text(contact.join('  ·  '), MARGIN, headerH / 2 + 3)
    }
  }

  // Title — right side
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(title, pageWidth - MARGIN, headerH / 2 - 1, { align: 'right' })

  // Subtitle — right side below title
  if (subtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(220, 230, 245)
    doc.text(subtitle, pageWidth - MARGIN, headerH / 2 + 8, { align: 'right' })
  }

  return headerH
}

/**
 * Draw a section title with accent bar.
 */
function drawSectionTitle(doc, title, y, primary) {
  doc.setFillColor(...primary)
  doc.rect(MARGIN, y, 3, 6, 'F')

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  doc.text(title, MARGIN + 8, y + 5)

  return y + 12
}

/**
 * Draw a thin horizontal rule.
 */
function drawRule(doc, x1, y, x2, color = COLORS.border, weight = 0.3) {
  doc.setDrawColor(...color)
  doc.setLineWidth(weight)
  doc.line(x1, y, x2, y)
}

/**
 * Add page footers to every page of the document.
 */
function addPageFooters(doc, documentLabel) {
  const totalPages = doc.internal.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const fy = pageHeight - 10

    drawRule(doc, MARGIN, fy - 4, pageWidth - MARGIN, COLORS.border, 0.3)

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.subtle)
    doc.text(
      `${documentLabel}  ·  Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      MARGIN, fy
    )
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - MARGIN, fy, { align: 'right' })
  }
}

/**
 * Check if we need a new page, adding one if necessary.
 */
function checkPage(doc, y, needed = 30) {
  if (y + needed > doc.internal.pageSize.getHeight() - 22) {
    doc.addPage()
    return MARGIN
  }
  return y
}

/**
 * Draw project info strip.
 */
function drawProjectStrip(doc, project, y) {
  doc.setFillColor(...COLORS.surface)
  doc.roundedRect(MARGIN, y - 3, CONTENT_WIDTH, 10, 2, 2, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.mid)
  doc.text('Project:', MARGIN + 5, y + 3)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  const projLabel = (project?.name || 'Untitled')
    + (project?.job_number ? `  (Job #${project.job_number})` : '')
  doc.text(projLabel, MARGIN + 24, y + 3)

  return y + 14
}

/**
 * Render a photo grid into the document.
 */
function renderPhotoGrid(doc, photoImages, y) {
  const photoWidth = 54
  const photoHeight = 44
  const photoGap = 5
  const photosPerRow = 3
  let xPos = MARGIN

  for (let i = 0; i < photoImages.length; i++) {
    if (i > 0 && i % photosPerRow === 0) {
      xPos = MARGIN
      y += photoHeight + photoGap
    }

    if (y + photoHeight > doc.internal.pageSize.getHeight() - 22) {
      doc.addPage()
      y = MARGIN
      xPos = MARGIN
    }

    if (photoImages[i]) {
      // Light shadow effect
      doc.setFillColor(230, 230, 230)
      doc.rect(xPos + 1, y + 1, photoWidth, photoHeight, 'F')
      // Photo border
      doc.setDrawColor(...COLORS.border)
      doc.setLineWidth(0.5)
      doc.rect(xPos, y, photoWidth, photoHeight, 'S')
      doc.addImage(photoImages[i], 'JPEG', xPos, y, photoWidth, photoHeight)
    } else {
      doc.setFillColor(...COLORS.surface)
      doc.rect(xPos, y, photoWidth, photoHeight, 'F')
      doc.setDrawColor(...COLORS.border)
      doc.setLineWidth(0.3)
      doc.rect(xPos, y, photoWidth, photoHeight, 'S')
      doc.setFontSize(7)
      doc.setTextColor(...COLORS.subtle)
      doc.text('Photo unavailable', xPos + photoWidth / 2, y + photoHeight / 2, { align: 'center' })
    }

    xPos += photoWidth + photoGap
  }

  return y + photoHeight + 8
}

// ══════════════════════════════════════════════════════════════════════════════
// DAILY REPORTS PDF
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Export daily reports as a professional branded PDF.
 *
 * @param {Array}  reports  - Daily report objects
 * @param {Object} project  - Project info
 * @param {Object} [context] - Optional { company, branding } for branded header
 */
export async function exportDailyReportsPDF(reports, project, context = {}) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  await loadAutoTable()
  const doc = new jsPDF()

  const primary = getPrimaryColor(context)

  // ── Header band ──
  const headerH = drawHeaderBand(doc, 'DAILY REPORTS', `${reports.length} report${reports.length !== 1 ? 's' : ''}`, primary, context)
  let y = headerH + 12

  // ── Project strip ──
  y = drawProjectStrip(doc, project, y)

  // ── Date range summary ──
  if (reports.length > 0) {
    const dates = reports.map(r => r.report_date).filter(Boolean).sort()
    if (dates.length > 1) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.mid)
      doc.text(`Covering: ${formatShortDate(dates[0])} — ${formatShortDate(dates[dates.length - 1])}`, MARGIN, y)
      y += 8
    }
  }

  // ── Pre-load all report photos ──
  const reportPhotoData = {}
  for (const report of reports) {
    if (report.photos?.length > 0) {
      try {
        const signedUrls = await db.resolvePhotoUrls(report.photos)
        const base64Images = await loadImagesAsBase64(signedUrls, 10000)
        reportPhotoData[report.id] = base64Images.filter(Boolean)
      } catch (e) {
        console.error('Error loading photos for report:', report.id, e)
        reportPhotoData[report.id] = []
      }
    }
  }

  // ── Each report ──
  for (let idx = 0; idx < reports.length; idx++) {
    const report = reports[idx]
    y = checkPage(doc, y, 50)

    // Report card header
    doc.setFillColor(...primary)
    doc.rect(MARGIN, y, 3, 12, 'F')

    doc.setFillColor(...COLORS.surface)
    doc.rect(MARGIN + 3, y, CONTENT_WIDTH - 3, 12, 'F')

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text(formatDate(report.report_date), MARGIN + 8, y + 8)

    // Status badge
    const isSubmitted = report.status === 'submitted'
    const badgeColor = isSubmitted ? COLORS.green : COLORS.amber
    const badgeText = isSubmitted ? 'SUBMITTED' : 'DRAFT'
    const badgeW = doc.getTextWidth(badgeText) + 8

    doc.setFillColor(...badgeColor)
    doc.roundedRect(PAGE_WIDTH - MARGIN - badgeW - 4, y + 2, badgeW, 7, 1.5, 1.5, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(badgeText, PAGE_WIDTH - MARGIN - badgeW / 2 - 4, y + 7, { align: 'center' })

    y += 16

    // Metrics row
    const actualPhotos = report.photos?.length || report.photos_count || 0
    const actualTasks = report.completed_tasks?.length || report.tasks_completed || 0
    const metrics = [
      `Crew: ${report.crew_count || 0}`,
      `Tasks: ${actualTasks}/${report.tasks_total || 0}`,
      `Time and Material Tickets: ${report.tm_tickets_count || 0}`,
      `Photos: ${actualPhotos}`
    ]

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.mid)
    doc.text(metrics.join('    ·    '), MARGIN + 8, y)
    y += 7

    // Crew list — grouped by role
    if (report.crew_list?.length > 0) {
      y = checkPage(doc, y, 15)

      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.mid)
      doc.text('CREW', MARGIN + 8, y)
      y += 1
      drawRule(doc, MARGIN + 8, y, MARGIN + 40, COLORS.border)
      y += 4

      const crewGroups = {}
      report.crew_list.forEach(w => {
        const role = w.role || 'Other'
        if (!crewGroups[role]) crewGroups[role] = []
        crewGroups[role].push(w)
      })

      doc.setFontSize(8)
      for (const [role, workers] of Object.entries(crewGroups)) {
        y = checkPage(doc, y, 6)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...COLORS.dark)
        doc.text(`${role} (${workers.length}):`, MARGIN + 10, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...COLORS.text)
        const names = workers.map(w => w.name).join(', ')
        const nameLines = doc.splitTextToSize(names, CONTENT_WIDTH - 55)
        doc.text(nameLines, MARGIN + 52, y)
        y += nameLines.length * 3.5 + 2
      }
      y += 2
    }

    // Field notes
    if (report.field_notes) {
      y = checkPage(doc, y, 15)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.mid)
      doc.text('FIELD NOTES', MARGIN + 8, y)
      y += 1
      drawRule(doc, MARGIN + 8, y, MARGIN + 40, COLORS.border)
      y += 4

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.text)
      const noteLines = doc.splitTextToSize(report.field_notes, CONTENT_WIDTH - 16)
      doc.text(noteLines, MARGIN + 10, y)
      y += noteLines.length * 4 + 3
    }

    // Issues
    if (report.issues) {
      y = checkPage(doc, y, 15)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.amber)
      doc.text('ISSUES', MARGIN + 8, y)
      y += 1
      drawRule(doc, MARGIN + 8, y, MARGIN + 30, [245, 158, 11])
      y += 4

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.text)
      const issueLines = doc.splitTextToSize(report.issues, CONTENT_WIDTH - 16)
      doc.text(issueLines, MARGIN + 10, y)
      y += issueLines.length * 4 + 3
    }

    // Photos
    const photoImages = reportPhotoData[report.id]
    if (photoImages?.length > 0) {
      y = checkPage(doc, y, 55)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.mid)
      doc.text('PHOTOS', MARGIN + 8, y)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.blue)
      doc.text(`${photoImages.length} photo${photoImages.length !== 1 ? 's' : ''}`, MARGIN + 26, y)
      y += 5

      y = renderPhotoGrid(doc, photoImages, y)
    }

    y += 4

    // Divider between reports
    if (idx < reports.length - 1) {
      drawRule(doc, MARGIN, y, PAGE_WIDTH - MARGIN, COLORS.border, 0.5)
      y += 8
    }
  }

  // ── Footers ──
  addPageFooters(doc, `Daily Reports — ${project?.name || ''}`)

  const fileName = `${(project?.name || 'Project').replace(/\s+/g, '_')}_Daily_Reports_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

// ══════════════════════════════════════════════════════════════════════════════
// INCIDENT / INJURY REPORTS PDF
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Export incident/injury reports as a professional branded PDF.
 *
 * @param {Array}  reports  - Injury report objects
 * @param {Object} project  - Project info
 * @param {Object} [context] - Optional { company, branding }
 */
export async function exportIncidentReportsPDF(reports, project, context = {}) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  await loadAutoTable()
  const doc = new jsPDF()

  const primary = getPrimaryColor(context)

  // ── Header band ──
  const headerH = drawHeaderBand(doc, 'INCIDENT REPORTS', `${reports.length} report${reports.length !== 1 ? 's' : ''}`, primary, context)
  let y = headerH + 12

  // ── Project strip ──
  y = drawProjectStrip(doc, project, y)

  // ── Summary stats ──
  const openCount = reports.filter(r => r.status === 'open').length
  const closedCount = reports.filter(r => r.status !== 'open').length
  const critCount = reports.filter(r => r.injury_type === 'critical').length

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.mid)
  const summary = [`Open: ${openCount}`, `Closed: ${closedCount}`]
  if (critCount > 0) summary.push(`Critical: ${critCount}`)
  doc.text(summary.join('    ·    '), MARGIN, y)
  y += 10

  // ── Each incident ──
  reports.forEach((report, idx) => {
    y = checkPage(doc, y, 50)

    const sev = SEVERITY[report.injury_type] || { color: [128, 128, 128], label: (report.injury_type || 'UNKNOWN').toUpperCase() }

    // Severity accent bar + card background
    doc.setFillColor(...sev.color)
    doc.rect(MARGIN, y, 3, 16, 'F')

    doc.setFillColor(...COLORS.surface)
    doc.rect(MARGIN + 3, y, CONTENT_WIDTH - 3, 16, 'F')

    // Date
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text(formatDate(report.incident_date), MARGIN + 8, y + 6)

    // Severity badge
    const badgeText = sev.label
    const badgeW = doc.getTextWidth(badgeText) + 8
    doc.setFillColor(...sev.color)
    doc.roundedRect(MARGIN + 8, y + 9, badgeW, 5.5, 1, 1, 'F')
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(badgeText, MARGIN + 8 + badgeW / 2, y + 13, { align: 'center' })

    // Status badge (right side)
    const isOpen = report.status === 'open'
    const statusColor = isOpen ? COLORS.amber : COLORS.green
    const statusText = isOpen ? 'OPEN' : 'CLOSED'
    const statusW = doc.getTextWidth(statusText) + 8
    doc.setFillColor(...statusColor)
    doc.roundedRect(PAGE_WIDTH - MARGIN - statusW - 4, y + 3, statusW, 7, 1.5, 1.5, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(statusText, PAGE_WIDTH - MARGIN - statusW / 2 - 4, y + 8, { align: 'center' })

    y += 20

    // Description
    if (report.description) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.mid)
      doc.text('DESCRIPTION', MARGIN + 8, y)
      y += 1
      drawRule(doc, MARGIN + 8, y, MARGIN + 45, COLORS.border)
      y += 4

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.text)
      const lines = doc.splitTextToSize(report.description, CONTENT_WIDTH - 16)
      doc.text(lines, MARGIN + 10, y)
      y += lines.length * 4 + 3
    }

    // Location
    if (report.location) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.mid)
      doc.text('LOCATION', MARGIN + 8, y)
      y += 1
      drawRule(doc, MARGIN + 8, y, MARGIN + 35, COLORS.border)
      y += 4

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.text)
      doc.text(report.location, MARGIN + 10, y)
      y += 6
    }

    // Corrective actions
    if (report.corrective_actions) {
      y = checkPage(doc, y, 12)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.green)
      doc.text('CORRECTIVE ACTIONS', MARGIN + 8, y)
      y += 1
      drawRule(doc, MARGIN + 8, y, MARGIN + 55, [16, 185, 129])
      y += 4

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.text)
      const actionLines = doc.splitTextToSize(report.corrective_actions, CONTENT_WIDTH - 16)
      doc.text(actionLines, MARGIN + 10, y)
      y += actionLines.length * 4 + 3
    }

    y += 6

    // Divider
    if (idx < reports.length - 1) {
      drawRule(doc, MARGIN, y, PAGE_WIDTH - MARGIN, COLORS.border, 0.5)
      y += 8
    }
  })

  // ── Footers ──
  addPageFooters(doc, `Incident Reports — ${project?.name || ''}`)

  const fileName = `${(project?.name || 'Project').replace(/\s+/g, '_')}_Incident_Reports_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

// ══════════════════════════════════════════════════════════════════════════════
// CREW CHECK-IN HISTORY PDF
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Export crew check-in history as a professional branded PDF.
 *
 * @param {Array}  checkins - Crew check-in objects
 * @param {Object} project  - Project info
 * @param {Object} [context] - Optional { company, branding }
 */
export async function exportCrewCheckinsPDF(checkins, project, context = {}) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  const autoTableModule = await loadAutoTable()
  const autoTable = autoTableModule.default
  const doc = new jsPDF()

  const primary = getPrimaryColor(context)

  // ── Header band ──
  const headerH = drawHeaderBand(doc, 'CREW CHECK-INS', `${checkins.length} check-in${checkins.length !== 1 ? 's' : ''}`, primary, context)
  let y = headerH + 12

  // ── Project strip ──
  y = drawProjectStrip(doc, project, y)

  // ── Total workers summary ──
  const totalWorkers = checkins.reduce((sum, c) => sum + (c.workers?.length || 0), 0)
  const uniqueNames = new Set()
  checkins.forEach(c => (c.workers || []).forEach(w => uniqueNames.add(w.name)))

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.mid)
  doc.text(`Total check-ins: ${totalWorkers}    ·    Unique workers: ${uniqueNames.size}`, MARGIN, y)
  y += 10

  // ── Each check-in ──
  checkins.forEach((checkin, idx) => {
    y = checkPage(doc, y, 30)
    const workers = checkin.workers || []

    // Date header card
    doc.setFillColor(...primary)
    doc.rect(MARGIN, y, 3, 10, 'F')

    doc.setFillColor(...COLORS.surface)
    doc.rect(MARGIN + 3, y, CONTENT_WIDTH - 3, 10, 'F')

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text(formatDate(checkin.check_in_date), MARGIN + 8, y + 7)

    // Worker count badge
    const countText = `${workers.length} worker${workers.length !== 1 ? 's' : ''}`
    const countW = doc.getTextWidth(countText) + 8
    doc.setFillColor(...primary)
    doc.roundedRect(PAGE_WIDTH - MARGIN - countW - 4, y + 1.5, countW, 7, 1.5, 1.5, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(countText, PAGE_WIDTH - MARGIN - countW / 2 - 4, y + 6.5, { align: 'center' })

    y += 14

    // Worker table using autoTable
    if (workers.length > 0) {
      // Check if any workers have signatures
      const hasSignatures = workers.some(w => w.signature_data)

      // Group workers by role for cleaner display
      const roleGroups = {}
      workers.forEach(w => {
        const role = w.role || 'Laborer'
        if (!roleGroups[role]) roleGroups[role] = []
        roleGroups[role].push(w)
      })

      const tableBody = []
      let rowNum = 1
      for (const [role, group] of Object.entries(roleGroups)) {
        group.forEach(w => {
          const row = [
            rowNum.toString(),
            w.name || '—',
            role,
          ]
          if (hasSignatures) {
            row.push(w.ssn_last4 || '—')
            row.push(w.signature_data ? 'Signed' : '—')
          }
          tableBody.push(row)
          rowNum++
        })
      }

      const tableHead = hasSignatures
        ? [['#', 'Name', 'Role', 'SSN Last 4', 'Status']]
        : [['#', 'Name', 'Role']]

      const columnStyles = hasSignatures
        ? {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 50 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 22, halign: 'center' },
            4: { cellWidth: 20, halign: 'center' },
          }
        : {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 80 },
            2: { cellWidth: 'auto' },
          }

      autoTable(doc, {
        startY: y,
        head: tableHead,
        body: tableBody,
        theme: 'plain',
        styles: {
          fontSize: 8,
          cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
          textColor: COLORS.text,
        },
        headStyles: {
          fillColor: primary,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: { fillColor: COLORS.surface },
        columnStyles,
        margin: { left: MARGIN + 5, right: MARGIN + 5 },
      })

      y = doc.lastAutoTable.finalY + 6

      // Render signature images for signed workers
      if (hasSignatures) {
        const signedWorkers = workers.filter(w => w.signature_data)
        if (signedWorkers.length > 0) {
          y = checkPage(doc, y, 20)

          doc.setFontSize(8)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...COLORS.dark)
          doc.text('Signatures', MARGIN + 5, y)
          y += 4

          signedWorkers.forEach(w => {
            y = checkPage(doc, y, 28)

            // Signature row: name + printed name + signature image + SSN
            const sigX = MARGIN + 5
            const sigImgW = 50
            const sigImgH = 15

            // Name label
            doc.setFontSize(7.5)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(...COLORS.dark)
            doc.text(w.printed_name || w.name || '—', sigX, y + 4)

            // SSN last 4
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(...COLORS.mid)
            doc.text(`SSN: ••••${w.ssn_last4 || ''}`, sigX + 60, y + 4)

            // Signed timestamp
            if (w.signed_at) {
              doc.setFontSize(6.5)
              doc.text(formatShortDate(w.signed_at), sigX + 90, y + 4)
            }

            // Signature image
            try {
              doc.addImage(w.signature_data, 'PNG', sigX, y + 6, sigImgW, sigImgH)
            } catch {
              doc.setFontSize(7)
              doc.setTextColor(...COLORS.subtle)
              doc.text('[signature]', sigX, y + 14)
            }

            // Signature line
            drawRule(doc, sigX, y + 22, sigX + sigImgW, COLORS.border, 0.3)

            y += 26
          })
        }
      }
    }

    y += 4

    // Divider
    if (idx < checkins.length - 1) {
      drawRule(doc, MARGIN, y, PAGE_WIDTH - MARGIN, COLORS.border, 0.5)
      y += 8
    }
  })

  // ── Footers ──
  addPageFooters(doc, `Crew Check-Ins — ${project?.name || ''}`)

  const fileName = `${(project?.name || 'Project').replace(/\s+/g, '_')}_Crew_Checkins_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED FIELD DOCUMENTS PDF
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Export ALL field documents as a single consolidated PDF with a professional
 * cover page and clearly separated sections.
 *
 * @param {Object} params
 * @param {Array}  params.dailyReports
 * @param {Array}  params.incidentReports
 * @param {Array}  params.crewCheckins
 * @param {Object} params.project
 * @param {Object} [params.context] - Optional { company, branding }
 */
export async function exportAllFieldDocumentsPDF({ dailyReports = [], incidentReports = [], crewCheckins = [], project, context = {} }) {
  const jsPDFModule = await loadJsPDF()
  const jsPDF = jsPDFModule.default
  const autoTableModule = await loadAutoTable()
  const autoTable = autoTableModule.default
  const doc = new jsPDF()

  const pageWidth = doc.internal.pageSize.getWidth()
  const _pageHeight = doc.internal.pageSize.getHeight()
  const primary = getPrimaryColor(context)

  // ══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════════════════════════

  // Full-width header band
  const coverH = 56
  doc.setFillColor(...primary)
  doc.rect(0, 0, pageWidth, coverH, 'F')

  // Company name
  const companyName = context?.company?.name || ''
  if (companyName) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(companyName, MARGIN, 22)

    const contact = [context?.company?.phone, context?.company?.email].filter(Boolean)
    if (contact.length) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(220, 230, 245)
      doc.text(contact.join('  ·  '), MARGIN, 30)
    }
  }

  // Title
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('FIELD DOCUMENTS', pageWidth - MARGIN, 25, { align: 'right' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(220, 230, 245)
  doc.text('Consolidated Report', pageWidth - MARGIN, 35, { align: 'right' })

  let y = coverH + 16

  // Project info
  y = drawProjectStrip(doc, project, y)
  y += 2

  // Generation info
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.mid)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`, MARGIN, y)
  y += 12

  // ── Document summary table ──
  y = drawSectionTitle(doc, 'Document Summary', y, primary)

  const summaryTableBody = [
    ['Daily Reports', dailyReports.length.toString(), dailyReports.length > 0 ? 'Included' : '—'],
    ['Incident Reports', incidentReports.length.toString(), incidentReports.length > 0 ? 'Included' : '—'],
    ['Crew Check-Ins', crewCheckins.length.toString(), crewCheckins.length > 0 ? 'Included' : '—'],
  ]

  autoTable(doc, {
    startY: y,
    head: [['Document Type', 'Count', 'Status']],
    body: summaryTableBody,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
      textColor: COLORS.dark,
    },
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: COLORS.surface },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 'auto', halign: 'center' },
    },
    margin: { left: MARGIN, right: MARGIN },
  })

  y = doc.lastAutoTable.finalY + 12

  // Key metrics
  const totalCrewCount = dailyReports.reduce((s, r) => s + (r.crew_count || 0), 0)
  const totalIncidents = incidentReports.length
  const totalCheckins = crewCheckins.reduce((s, c) => s + (c.workers?.length || 0), 0)

  if (totalCrewCount > 0 || totalIncidents > 0 || totalCheckins > 0) {
    y = drawSectionTitle(doc, 'Key Metrics', y, primary)

    const metricsBody = []
    if (totalCrewCount > 0) metricsBody.push(['Total Crew-Days', totalCrewCount.toString()])
    if (totalIncidents > 0) {
      const openInc = incidentReports.filter(r => r.status === 'open').length
      metricsBody.push(['Total Incidents', `${totalIncidents} (${openInc} open)`])
    }
    if (totalCheckins > 0) metricsBody.push(['Total Worker Check-Ins', totalCheckins.toString()])

    autoTable(doc, {
      startY: y,
      body: metricsBody,
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 6, right: 6 },
        textColor: COLORS.dark,
      },
      alternateRowStyles: { fillColor: COLORS.surface },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold', textColor: COLORS.mid },
        1: { cellWidth: 'auto' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DAILY REPORTS SECTION
  // ══════════════════════════════════════════════════════════════════════════

  if (dailyReports.length > 0) {
    // Pre-load all report photos
    const reportPhotoData = {}
    for (const report of dailyReports) {
      if (report.photos?.length > 0) {
        try {
          const signedUrls = await db.resolvePhotoUrls(report.photos)
          const base64Images = await loadImagesAsBase64(signedUrls, 10000)
          reportPhotoData[report.id] = base64Images.filter(Boolean)
        } catch (e) {
          console.error('Error loading photos for report:', report.id, e)
          reportPhotoData[report.id] = []
        }
      }
    }

    // Section cover
    doc.addPage()
    y = MARGIN

    // Section header bar
    doc.setFillColor(...primary)
    doc.rect(MARGIN, y, CONTENT_WIDTH, 14, 'F')
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('DAILY REPORTS', MARGIN + 8, y + 10)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${dailyReports.length} report${dailyReports.length !== 1 ? 's' : ''}`, pageWidth - MARGIN - 8, y + 10, { align: 'right' })
    y += 20

    for (let idx = 0; idx < dailyReports.length; idx++) {
      const report = dailyReports[idx]
      y = checkPage(doc, y, 40)

      // Report header
      doc.setFillColor(...primary)
      doc.rect(MARGIN, y, 3, 10, 'F')
      doc.setFillColor(...COLORS.surface)
      doc.rect(MARGIN + 3, y, CONTENT_WIDTH - 3, 10, 'F')

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.dark)
      doc.text(formatDate(report.report_date), MARGIN + 8, y + 7)

      // Metrics inline
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.mid)
      const consolidatedTasks = report.completed_tasks?.length || report.tasks_completed || 0
      const consolidatedPhotos = report.photos?.length || report.photos_count || 0
      doc.text(
        `Crew: ${report.crew_count || 0}  ·  Tasks: ${consolidatedTasks}/${report.tasks_total || 0}  ·  Time and Material: ${report.tm_tickets_count || 0}  ·  Photos: ${consolidatedPhotos}`,
        pageWidth - MARGIN - 5, y + 7, { align: 'right' }
      )
      y += 14

      // Crew grouped by class/role
      if (report.crew_list?.length > 0) {
        const crewGroups = {}
        report.crew_list.forEach(w => {
          const role = w.role || 'Other'
          if (!crewGroups[role]) crewGroups[role] = []
          crewGroups[role].push(w)
        })

        doc.setFontSize(8)
        for (const [role, workers] of Object.entries(crewGroups)) {
          y = checkPage(doc, y, 6)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...COLORS.dark)
          doc.text(`${role} (${workers.length}):`, MARGIN + 8, y)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(...COLORS.text)
          const names = workers.map(w => w.name).join(', ')
          const nameLines = doc.splitTextToSize(names, CONTENT_WIDTH - 55)
          doc.text(nameLines, MARGIN + 50, y)
          y += nameLines.length * 3.5 + 1
        }
        y += 3
      }

      doc.setTextColor(...COLORS.text)
      doc.setFontSize(9)

      if (report.field_notes) {
        doc.setFont('helvetica', 'normal')
        const lines = doc.splitTextToSize(report.field_notes, CONTENT_WIDTH - 12)
        doc.text(lines, MARGIN + 6, y)
        y += lines.length * 4 + 2
      }

      if (report.issues) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...COLORS.amber)
        doc.text('Issues:', MARGIN + 6, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...COLORS.text)
        const issueLines = doc.splitTextToSize(report.issues, CONTENT_WIDTH - 28)
        doc.text(issueLines, MARGIN + 22, y)
        y += issueLines.length * 4 + 2
      }

      // Photos
      const photoImages = reportPhotoData[report.id]
      if (photoImages?.length > 0) {
        y = checkPage(doc, y, 55)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...COLORS.mid)
        doc.text('Photos:', MARGIN + 6, y)
        y += 5

        y = renderPhotoGrid(doc, photoImages, y)
      }

      y += 4
      if (idx < dailyReports.length - 1) {
        drawRule(doc, MARGIN, y, PAGE_WIDTH - MARGIN, COLORS.border, 0.5)
        y += 6
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INCIDENT REPORTS SECTION
  // ══════════════════════════════════════════════════════════════════════════

  if (incidentReports.length > 0) {
    doc.addPage()
    y = MARGIN

    // Section header bar
    doc.setFillColor(...primary)
    doc.rect(MARGIN, y, CONTENT_WIDTH, 14, 'F')
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('INCIDENT / INJURY REPORTS', MARGIN + 8, y + 10)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${incidentReports.length} report${incidentReports.length !== 1 ? 's' : ''}`, pageWidth - MARGIN - 8, y + 10, { align: 'right' })
    y += 20

    incidentReports.forEach((report, idx) => {
      y = checkPage(doc, y, 35)

      const sev = SEVERITY[report.injury_type] || { color: [128, 128, 128], label: (report.injury_type || '').replace('_', ' ').toUpperCase() }

      // Severity accent + header
      doc.setFillColor(...sev.color)
      doc.rect(MARGIN, y, 3, 12, 'F')
      doc.setFillColor(...COLORS.surface)
      doc.rect(MARGIN + 3, y, CONTENT_WIDTH - 3, 12, 'F')

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.dark)
      doc.text(formatDate(report.incident_date), MARGIN + 8, y + 5)

      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.mid)
      doc.text(`${sev.label}  ·  ${(report.status || '').toUpperCase()}`, MARGIN + 8, y + 10)
      y += 16

      doc.setTextColor(...COLORS.text)
      doc.setFontSize(9)

      if (report.description) {
        doc.setFont('helvetica', 'normal')
        const lines = doc.splitTextToSize(report.description, CONTENT_WIDTH - 12)
        doc.text(lines, MARGIN + 6, y)
        y += lines.length * 4 + 2
      }

      if (report.location) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...COLORS.mid)
        doc.setFontSize(8)
        doc.text('Location: ', MARGIN + 6, y)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...COLORS.text)
        doc.setFontSize(9)
        doc.text(report.location, MARGIN + 24, y)
        y += 6
      }

      y += 6
      if (idx < incidentReports.length - 1) {
        drawRule(doc, MARGIN, y, PAGE_WIDTH - MARGIN, COLORS.border, 0.5)
        y += 6
      }
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREW CHECK-INS SECTION
  // ══════════════════════════════════════════════════════════════════════════

  if (crewCheckins.length > 0) {
    doc.addPage()
    y = MARGIN

    // Section header bar
    doc.setFillColor(...primary)
    doc.rect(MARGIN, y, CONTENT_WIDTH, 14, 'F')
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('CREW CHECK-IN HISTORY', MARGIN + 8, y + 10)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${crewCheckins.length} check-in${crewCheckins.length !== 1 ? 's' : ''}`, pageWidth - MARGIN - 8, y + 10, { align: 'right' })
    y += 20

    crewCheckins.forEach((checkin, idx) => {
      y = checkPage(doc, y, 30)
      const workers = checkin.workers || []

      // Date header card
      doc.setFillColor(...primary)
      doc.rect(MARGIN, y, 3, 10, 'F')
      doc.setFillColor(...COLORS.surface)
      doc.rect(MARGIN + 3, y, CONTENT_WIDTH - 3, 10, 'F')

      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...COLORS.dark)
      doc.text(formatDate(checkin.check_in_date), MARGIN + 8, y + 7)

      // Worker count badge
      const countText = `${workers.length} worker${workers.length !== 1 ? 's' : ''}`
      const countW = doc.getTextWidth(countText) + 8
      doc.setFillColor(...primary)
      doc.roundedRect(pageWidth - MARGIN - countW - 4, y + 1.5, countW, 7, 1.5, 1.5, 'F')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(countText, pageWidth - MARGIN - countW / 2 - 4, y + 6.5, { align: 'center' })

      y += 14

      if (workers.length > 0) {
        // Check if any workers have signatures
        const hasSignatures = workers.some(w => w.signature_data)

        // Group workers by role
        const roleGroups = {}
        workers.forEach(w => {
          const role = w.role || 'Laborer'
          if (!roleGroups[role]) roleGroups[role] = []
          roleGroups[role].push(w)
        })

        const tableBody = []
        let rowNum = 1
        for (const [role, group] of Object.entries(roleGroups)) {
          group.forEach(w => {
            const row = [
              rowNum.toString(),
              w.name || '—',
              role,
            ]
            if (hasSignatures) {
              row.push(w.ssn_last4 || '—')
              row.push(w.signature_data ? 'Signed' : '—')
            }
            tableBody.push(row)
            rowNum++
          })
        }

        const tableHead = hasSignatures
          ? [['#', 'Name', 'Role', 'SSN Last 4', 'Status']]
          : [['#', 'Name', 'Role']]

        const columnStyles = hasSignatures
          ? {
              0: { cellWidth: 10, halign: 'center' },
              1: { cellWidth: 50 },
              2: { cellWidth: 'auto' },
              3: { cellWidth: 22, halign: 'center' },
              4: { cellWidth: 20, halign: 'center' },
            }
          : {
              0: { cellWidth: 10, halign: 'center' },
              1: { cellWidth: 80 },
              2: { cellWidth: 'auto' },
            }

        autoTable(doc, {
          startY: y,
          head: tableHead,
          body: tableBody,
          theme: 'plain',
          styles: {
            fontSize: 8,
            cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
            textColor: COLORS.text,
          },
          headStyles: {
            fillColor: primary,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
          },
          alternateRowStyles: { fillColor: COLORS.surface },
          columnStyles,
          margin: { left: MARGIN + 5, right: MARGIN + 5 },
        })

        y = doc.lastAutoTable.finalY + 6

        // Render signature images for signed workers
        if (hasSignatures) {
          const signedWorkers = workers.filter(w => w.signature_data)
          if (signedWorkers.length > 0) {
            y = checkPage(doc, y, 20)

            doc.setFontSize(8)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(...COLORS.dark)
            doc.text('Signatures', MARGIN + 5, y)
            y += 4

            signedWorkers.forEach(w => {
              y = checkPage(doc, y, 28)

              const sigX = MARGIN + 5
              const sigImgW = 50
              const sigImgH = 15

              // Name label
              doc.setFontSize(7.5)
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(...COLORS.dark)
              doc.text(w.printed_name || w.name || '—', sigX, y + 4)

              // SSN last 4
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(...COLORS.mid)
              doc.text(`SSN: ••••${w.ssn_last4 || ''}`, sigX + 60, y + 4)

              // Signed timestamp
              if (w.signed_at) {
                doc.setFontSize(6.5)
                doc.text(formatShortDate(w.signed_at), sigX + 90, y + 4)
              }

              // Signature image
              try {
                doc.addImage(w.signature_data, 'PNG', sigX, y + 6, sigImgW, sigImgH)
              } catch {
                doc.setFontSize(7)
                doc.setTextColor(...COLORS.subtle)
                doc.text('[signature]', sigX, y + 14)
              }

              // Signature line
              drawRule(doc, sigX, y + 22, sigX + sigImgW, COLORS.border, 0.3)

              y += 26
            })
          }
        }
      }

      y += 4

      if (idx < crewCheckins.length - 1) {
        drawRule(doc, MARGIN, y, PAGE_WIDTH - MARGIN, COLORS.border, 0.5)
        y += 8
      }
    })
  }

  // ── Footers on every page ──
  addPageFooters(doc, `Field Documents — ${project?.name || ''}`)

  const fileName = `${(project?.name || 'Project').replace(/\s+/g, '_')}_Field_Documents_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}
