// ============================================
// COR PDF Generator (Snapshot-Based)
// ============================================
// Generates PDF documents from frozen COR snapshots
//
// Key Principle: This module NEVER queries live data
// It only works with the snapshot provided to it
// This ensures deterministic, reproducible exports
// ============================================

import {
  formatCurrency,
  formatPercent,
  formatDate,
  formatDateRange,
  groupLaborByClassAndType,
  combineLaborGroupItems
} from './corCalculations'
import { loadImagesAsBase64 } from './imageUtils'
import {
  resolvePrimaryColor,
  loadBrandLogo,
  drawDocumentHeader,
  drawContinuationAccent,
  applyDocumentFooters,
} from './pdfBranding'

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${minutes}${ampm}`
}

const formatTimePeriod = (worker) => {
  if (worker.time_started && worker.time_ended) {
    return `${formatTime(worker.time_started)} - ${formatTime(worker.time_ended)}`
  }
  return '-'
}

// ============================================
// MAIN PDF GENERATOR
// ============================================

/**
 * Generate PDF from a frozen COR snapshot
 * This function ONLY uses data from the snapshot - never queries live data
 *
 * @param {Object} snapshot - Frozen snapshot from createSnapshot()
 * @param {Object} context - Additional context (project, company, branding)
 * @returns {Promise<Object>} PDF generation result
 */
export async function generatePDFFromSnapshot(snapshot, context = {}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { project, company, branding = {} } = context
  const cor = snapshot.corData
  const tickets = snapshot.ticketsData || []

  const doc = new jsPDF('p', 'mm', 'letter')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18

  const primaryColor = resolvePrimaryColor({ branding, company })
  const accentLight = [primaryColor[0] + Math.round((255 - primaryColor[0]) * 0.88), primaryColor[1] + Math.round((255 - primaryColor[1]) * 0.88), primaryColor[2] + Math.round((255 - primaryColor[2]) * 0.88)]
  const brandLogo = await loadBrandLogo({ branding, company })

  // ============================================
  // HEADER
  // ============================================

  let yPos = drawDocumentHeader(doc, {
    title: 'Change Order Request',
    subtitle: cor.cor_number || '',
    context: { company, branding, project },
    brandLogo,
    primary: primaryColor,
  })

  // ============================================
  // COR DETAILS - Info card style
  // ============================================

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text(cor.title || 'Untitled Change Order', margin, yPos)
  yPos += 8

  // Project info in a clean two-column layout
  doc.setFontSize(9.5)
  const infoCol1X = margin
  const infoCol2X = margin + 80

  if (project?.name) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Project:', infoCol1X, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    doc.text(project.name, infoCol1X + 22, yPos)
  }
  if (project?.job_number) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Job #:', infoCol2X, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    doc.text(project.job_number, infoCol2X + 18, yPos)
  }
  if (project?.name || project?.job_number) yPos += 5

  if (cor.period_start || cor.period_end) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Period:', infoCol1X, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    doc.text(formatDateRange(cor.period_start, cor.period_end), infoCol1X + 22, yPos)
    yPos += 5
  }

  yPos += 4

  // Scope of work
  if (cor.scope_of_work) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Scope of Work:', margin, yPos)
    yPos += 5

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(9)
    const scopeLines = doc.splitTextToSize(cor.scope_of_work, pageWidth - (margin * 2))
    doc.text(scopeLines, margin, yPos)
    yPos += (scopeLines.length * 4) + 6
  }

  // ============================================
  // LABOR TABLE (grouped by class and type)
  // ============================================

  if (cor.change_order_labor?.length > 0) {
    // Section header with accent
    doc.setFillColor(...accentLight)
    doc.rect(margin, yPos - 1, pageWidth - (margin * 2), 8, 'F')
    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos - 1, 3, 8, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Labor', margin + 7, yPos + 4.5)
    yPos += 12

    const laborGroups = groupLaborByClassAndType(cor.change_order_labor)

    // Build a lookup of ticket dates by labor class for source attribution
    const laborSourceMap = {}
    for (const ticket of tickets) {
      const workDate = ticket.work_date || ticket.ticket_date
      for (const worker of (ticket.t_and_m_workers || [])) {
        const className = (worker.labor_class || worker.role || 'laborer').toLowerCase()
        if (!laborSourceMap[className]) laborSourceMap[className] = []
        if (workDate && !laborSourceMap[className].includes(workDate)) {
          laborSourceMap[className].push(workDate)
        }
      }
    }

    for (const group of laborGroups) {
      if (yPos > pageHeight - 60) {
        doc.addPage()
        yPos = margin
      }

      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(71, 85, 105)
      doc.text(group.label, margin, yPos)

      // Show source Time and Material ticket dates for this labor class
      const groupClassName = (group.items[0]?.labor_class || '').toLowerCase()
      const sourceDates = laborSourceMap[groupClassName] || []
      if (sourceDates.length > 0) {
        const sortedDates = sourceDates.sort()
        const dateStr = sortedDates.map(d => formatDate(d)).join(', ')
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 116, 139)
        const sourceText = `Source: Time and Material Ticket${sortedDates.length > 1 ? 's' : ''} — ${dateStr}`
        const maxSourceWidth = pageWidth - (margin * 2) - doc.getTextWidth(group.label) - 10
        const truncatedSource = doc.getTextWidth(sourceText) > maxSourceWidth
          ? doc.splitTextToSize(sourceText, maxSourceWidth)[0]
          : sourceText
        doc.text(truncatedSource, pageWidth - margin, yPos, { align: 'right' })
      }
      yPos += 4

      const combinedItems = combineLaborGroupItems(group.items)

      autoTable(doc, {
        startY: yPos,
        head: [['Reg Hrs', 'Reg Rate', 'OT Hrs', 'OT Rate', 'Total']],
        body: combinedItems.map(item => [
          item.regular_hours?.toString() || '0',
          item.regular_rate ? formatCurrency(item.regular_rate) : '-',
          item.overtime_hours ? item.overtime_hours.toString() : '-',
          item.overtime_rate ? formatCurrency(item.overtime_rate) : '-',
          formatCurrency(item.total)
        ]),
        foot: [[
          { content: `${group.label} Subtotal`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: formatCurrency(group.subtotal), styles: { fontStyle: 'bold' } }
        ]],
        margin: { left: margin, right: margin },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3 },
        bodyStyles: { fontSize: 8, cellPadding: 3 },
        footStyles: { fillColor: [245, 247, 250], textColor: [30, 41, 59], fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 251, 253] },
        theme: 'striped',
        tableLineColor: [226, 232, 240],
        tableLineWidth: 0.2
      })

      yPos = doc.lastAutoTable.finalY + 5
    }

    // Labor subtotal bar
    doc.setFillColor(245, 247, 250)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 8, 1, 1, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(30, 41, 59)
    doc.text('Labor Subtotal', margin + 5, yPos + 5.5)
    doc.text(formatCurrency(cor.labor_subtotal), pageWidth - margin - 5, yPos + 5.5, { align: 'right' })
    yPos += 14
  }

  // ============================================
  // MATERIALS TABLE
  // ============================================

  if (cor.change_order_materials?.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage()
      yPos = margin
    }

    doc.setFillColor(...accentLight)
    doc.rect(margin, yPos - 1, pageWidth - (margin * 2), 8, 'F')
    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos - 1, 3, 8, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Materials', margin + 7, yPos + 4.5)
    yPos += 12

    autoTable(doc, {
      startY: yPos,
      head: [['Description', 'Source', 'Qty', 'Unit', 'Unit Cost', 'Total']],
      body: cor.change_order_materials.map(item => [
        item.description,
        item.source_reference || item.source_type || '-',
        item.quantity?.toString() || '1',
        item.unit || 'ea',
        formatCurrency(item.unit_cost),
        formatCurrency(item.total)
      ]),
      foot: [[
        { content: 'Materials Subtotal', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(cor.materials_subtotal), styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      footStyles: { fillColor: [245, 247, 250], textColor: [30, 41, 59], fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      theme: 'striped',
      tableLineColor: [226, 232, 240],
      tableLineWidth: 0.2
    })

    yPos = doc.lastAutoTable.finalY + 12
  }

  // ============================================
  // EQUIPMENT TABLE
  // ============================================

  if (cor.change_order_equipment?.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage()
      yPos = margin
    }

    doc.setFillColor(...accentLight)
    doc.rect(margin, yPos - 1, pageWidth - (margin * 2), 8, 'F')
    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos - 1, 3, 8, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Equipment', margin + 7, yPos + 4.5)
    yPos += 12

    autoTable(doc, {
      startY: yPos,
      head: [['Description', 'Source', 'Qty', 'Unit', 'Unit Cost', 'Total']],
      body: cor.change_order_equipment.map(item => [
        item.description,
        item.source_reference || item.source_type || '-',
        item.quantity?.toString() || '1',
        item.unit || 'day',
        formatCurrency(item.unit_cost),
        formatCurrency(item.total)
      ]),
      foot: [[
        { content: 'Equipment Subtotal', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(cor.equipment_subtotal), styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      footStyles: { fillColor: [245, 247, 250], textColor: [30, 41, 59], fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      theme: 'striped',
      tableLineColor: [226, 232, 240],
      tableLineWidth: 0.2
    })

    yPos = doc.lastAutoTable.finalY + 12
  }

  // ============================================
  // SUBCONTRACTORS TABLE
  // ============================================

  if (cor.change_order_subcontractors?.length > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage()
      yPos = margin
    }

    doc.setFillColor(...accentLight)
    doc.rect(margin, yPos - 1, pageWidth - (margin * 2), 8, 'F')
    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos - 1, 3, 8, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('Subcontractors', margin + 7, yPos + 4.5)
    yPos += 12

    autoTable(doc, {
      startY: yPos,
      head: [['Company Name', 'Description', 'Source', 'Qty', 'Unit', 'Unit Cost', 'Total']],
      body: cor.change_order_subcontractors.map(item => [
        item.company_name || '-',
        item.description,
        item.source_reference || item.source_type || '-',
        item.quantity?.toString() || '1',
        item.unit || 'lump sum',
        formatCurrency(item.unit_cost),
        formatCurrency(item.total)
      ]),
      foot: [[
        { content: 'Subcontractors Subtotal', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatCurrency(cor.subcontractors_subtotal), styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      footStyles: { fillColor: [245, 247, 250], textColor: [30, 41, 59], fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      theme: 'striped',
      tableLineColor: [226, 232, 240],
      tableLineWidth: 0.2
    })

    yPos = doc.lastAutoTable.finalY + 12
  }

  // ============================================
  // TOTALS SUMMARY
  // ============================================

  if (yPos > pageHeight - 100) {
    doc.addPage()
    yPos = margin
  }

  // Cost Summary section header
  doc.setFillColor(...accentLight)
  doc.rect(margin, yPos - 1, pageWidth - (margin * 2), 8, 'F')
  doc.setFillColor(...primaryColor)
  doc.rect(margin, yPos - 1, 3, 8, 'F')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('Cost Summary', margin + 7, yPos + 4.5)
  yPos += 12

  const summaryData = [
    ['Labor Subtotal', formatCurrency(cor.labor_subtotal)],
    [`   Markup (${formatPercent(cor.labor_markup_percent)})`, formatCurrency(cor.labor_markup_amount)],
    ['Materials Subtotal', formatCurrency(cor.materials_subtotal)],
    [`   Markup (${formatPercent(cor.materials_markup_percent)})`, formatCurrency(cor.materials_markup_amount)],
    ['Equipment Subtotal', formatCurrency(cor.equipment_subtotal)],
    [`   Markup (${formatPercent(cor.equipment_markup_percent)})`, formatCurrency(cor.equipment_markup_amount)],
    ['Subcontractors Subtotal', formatCurrency(cor.subcontractors_subtotal)],
    [`   Markup (${formatPercent(cor.subcontractors_markup_percent)})`, formatCurrency(cor.subcontractors_markup_amount)],
  ]

  autoTable(doc, {
    startY: yPos,
    body: summaryData,
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - (margin * 2),
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 45, halign: 'right' }
    },
    bodyStyles: { fontSize: 9, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    theme: 'plain',
    didParseCell: (data) => {
      // Style markup rows slightly differently (indented items)
      if (data.row.index % 2 === 1 && data.section === 'body') {
        data.cell.styles.textColor = [100, 116, 139]
        data.cell.styles.fontSize = 8.5
      }
    }
  })

  yPos = doc.lastAutoTable.finalY + 4

  // COR Subtotal bar
  doc.setFillColor(245, 247, 250)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 9, 1, 1, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  doc.text('COR Subtotal', margin + 6, yPos + 6)
  doc.text(formatCurrency(cor.cor_subtotal), pageWidth - margin - 6, yPos + 6, { align: 'right' })
  yPos += 13

  // Additional fees
  const feesData = [
    [`Liability Insurance (${formatPercent(cor.liability_insurance_percent)})`, formatCurrency(cor.liability_insurance_amount)],
    [`Bond (${formatPercent(cor.bond_percent)})`, formatCurrency(cor.bond_amount)],
    [`License Fee (${formatPercent(cor.license_fee_percent)})`, formatCurrency(cor.license_fee_amount)],
  ]

  autoTable(doc, {
    startY: yPos,
    body: feesData,
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - (margin * 2),
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 45, halign: 'right' }
    },
    bodyStyles: { fontSize: 8.5, cellPadding: 2.5, textColor: [100, 116, 139] },
    theme: 'plain'
  })

  yPos = doc.lastAutoTable.finalY + 4

  // COR Total - prominent bar
  doc.setFillColor(...primaryColor)
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 11, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text('COR TOTAL', margin + 6, yPos + 7.5)
  doc.text(formatCurrency(cor.cor_total), pageWidth - margin - 6, yPos + 7.5, { align: 'right' })
  yPos += 20

  // ============================================
  // T&M BACKUP DOCUMENTATION
  // ============================================

  if (tickets.length > 0) {
    // Add backup cover page
    doc.addPage()
    yPos = margin

    // Cover page header
    if (company?.name) {
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...primaryColor)
      doc.text(company.name, margin, yPos)
      yPos += 15
    }

    // Decorative lines
    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(0.8)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 3
    doc.setLineWidth(0.3)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 15

    // Title
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('SUPPORTING DOCUMENTATION', pageWidth / 2, yPos, { align: 'center' })
    yPos += 8

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text('Change Order Request Backup', pageWidth / 2, yPos, { align: 'center' })
    yPos += 20

    // COR reference
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(`COR Reference: ${cor.cor_number}`, margin, yPos)
    yPos += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    if (project?.name) {
      doc.text(`Project: ${project.name}`, margin, yPos)
      yPos += 5
    }
    if (project?.job_number) {
      doc.text(`Job #: ${project.job_number}`, margin, yPos)
      yPos += 5
    }
    yPos += 15

    // Summary box - dynamic height based on ticket count
    const ticketBreakdownHeight = (tickets.length > 0 && tickets.length <= 8)
      ? 9 + (tickets.length * 4.5)
      : 0
    const summaryBoxHeight = 55 + ticketBreakdownHeight
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), summaryBoxHeight, 3, 3, 'FD')

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('DOCUMENTATION SUMMARY', margin + 10, yPos + 12)

    doc.setDrawColor(226, 232, 240)
    doc.line(margin + 10, yPos + 16, pageWidth - margin - 10, yPos + 16)

    const summaryCol1 = margin + 15
    const summaryCol2 = margin + 80
    let summaryY = yPos + 25

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)

    doc.text('Time & Material Tickets:', summaryCol1, summaryY)
    doc.setFont('helvetica', 'bold')
    doc.text(String(tickets.length), summaryCol2, summaryY)
    doc.setFont('helvetica', 'normal')
    summaryY += 7

    doc.text('Total Labor:', summaryCol1, summaryY)
    doc.setFont('helvetica', 'bold')
    doc.text(`${snapshot.totals.totalLaborHours.toFixed(1)} hrs`, summaryCol2, summaryY)
    doc.setFont('helvetica', 'normal')
    summaryY += 7

    if (snapshot.totals.totalOTHours > 0) {
      doc.text('Total OT:', summaryCol1, summaryY)
      doc.setFont('helvetica', 'bold')
      doc.text(`${snapshot.totals.totalOTHours.toFixed(1)} hrs`, summaryCol2, summaryY)
      doc.setFont('helvetica', 'normal')
      summaryY += 7
    }

    // Show per-ticket hour breakdown for traceability
    if (tickets.length > 0 && tickets.length <= 8) {
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text('Hours by Time and Material Ticket:', summaryCol1, summaryY)
      summaryY += 5
      for (const ticket of tickets) {
        const tDate = formatDate(ticket.work_date || ticket.ticket_date)
        const tRegHrs = (ticket.t_and_m_workers || []).reduce((s, w) => s + (parseFloat(w.hours) || 0), 0)
        const tOTHrs = (ticket.t_and_m_workers || []).reduce((s, w) => s + (parseFloat(w.overtime_hours) || 0), 0)
        const otLabel = tOTHrs > 0 ? ` + ${tOTHrs.toFixed(1)} OT` : ''
        doc.text(`${tDate}: ${tRegHrs.toFixed(1)} reg hrs${otLabel}`, summaryCol1 + 5, summaryY)
        summaryY += 4.5
      }
      doc.setFontSize(10)
    }

    doc.text('Photo Evidence:', summaryCol1, summaryY)
    doc.setFont('helvetica', 'bold')
    doc.text(`${snapshot.totals.photoCount} photos`, summaryCol2, summaryY)
    doc.setFont('helvetica', 'normal')
    summaryY += 7

    doc.text('Client Verified:', summaryCol1, summaryY)
    doc.setFont('helvetica', 'bold')
    const verifiedColor = snapshot.totals.verifiedTicketCount > 0 ? [16, 185, 129] : [71, 85, 105]
    doc.setTextColor(...verifiedColor)
    doc.text(`${snapshot.totals.verifiedTicketCount} of ${tickets.length} tickets`, summaryCol2, summaryY)

    yPos += summaryBoxHeight + 15

    // Document ID and timestamp
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    const genDate = new Date(snapshot.createdAt)
    doc.text(`Generated: ${genDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${genDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`, margin, yPos)
    yPos += 6
    doc.text(`Document ID: ${snapshot.checksum.substring(0, 16).toUpperCase()}`, margin, yPos)

    // ============================================
    // INDIVIDUAL TICKET PAGES
    // ============================================

    for (const ticket of tickets) {
      doc.addPage()
      yPos = margin

      const hasVerification = !!ticket.client_signature_data

      // Ticket header with colored left border
      const headerHeight = 22
      const ticketStatusColor = hasVerification ? [16, 185, 129] : [245, 158, 11]

      doc.setFillColor(...ticketStatusColor)
      doc.rect(margin, yPos, 4, headerHeight, 'F')

      doc.setFillColor(248, 250, 252)
      doc.rect(margin + 4, yPos, pageWidth - (margin * 2) - 4, headerHeight, 'F')

      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text(`TIME & MATERIAL TICKET — ${formatDate(ticket.work_date || ticket.ticket_date)}`, margin + 10, yPos + 8)

      if (ticket.ce_pco_number) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(59, 130, 246)
        doc.text(`CE/PCO: ${ticket.ce_pco_number}`, margin + 10, yPos + 16)
      }

      if (hasVerification) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(16, 185, 129)
        doc.text('✓ CLIENT VERIFIED', pageWidth - margin - 35, yPos + 12)
      }

      yPos += headerHeight + 8

      // Description
      if (ticket.notes) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('DESCRIPTION', margin, yPos)
        yPos += 6

        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(51, 65, 85)
        const notesLines = doc.splitTextToSize(ticket.notes, pageWidth - (margin * 2))
        doc.text(notesLines, margin, yPos)
        yPos += (notesLines.length * 4) + 10
      }

      // Workers table
      if (ticket.t_and_m_workers?.length > 0) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('LABOR', margin, yPos)
        yPos += 6

        autoTable(doc, {
          startY: yPos,
          head: [['Worker', 'Time Period', 'Class', 'Reg Hrs', 'OT Hrs']],
          body: ticket.t_and_m_workers.map(w => [
            w.name,
            formatTimePeriod(w),
            w.role || w.labor_class || 'Laborer',
            w.hours?.toString() || '0',
            w.overtime_hours?.toString() || '-'
          ]),
          margin: { left: margin, right: margin },
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8, cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'grid'
        })

        yPos = doc.lastAutoTable.finalY + 10
      }

      // Materials/Equipment
      if (ticket.t_and_m_items?.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage()
          yPos = margin
        }

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('MATERIALS / EQUIPMENT', margin, yPos)

        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 116, 139)
        doc.text('Source: Time & Material Ticket', margin + 55, yPos)
        yPos += 6

        autoTable(doc, {
          startY: yPos,
          head: [['Item', 'Qty', 'Unit']],
          body: ticket.t_and_m_items.map(item => [
            item.custom_name || item.materials_equipment?.name || item.description || 'Unnamed Item',
            item.quantity?.toString() || '1',
            item.materials_equipment?.unit || item.unit || 'ea'
          ]),
          margin: { left: margin, right: margin },
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8, cellPadding: 3 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'grid'
        })

        yPos = doc.lastAutoTable.finalY + 10
      }

      // Photos
      if (ticket.photos?.length > 0) {
        if (yPos > pageHeight - 80) {
          doc.addPage()
          yPos = margin
        }

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('PHOTO DOCUMENTATION', margin, yPos)

        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(59, 130, 246)
        doc.text(`${ticket.photos.length} photo${ticket.photos.length !== 1 ? 's' : ''}`, margin + 50, yPos)
        yPos += 8

        let xPos = margin
        const photoWidth = 55
        const photoHeight = 45
        const photoGap = 6
        const photosPerRow = 3

        // Resolve storage paths to signed URLs before loading
        let photoUrls = ticket.photos
        try {
          const { db } = await import('./supabase')
          photoUrls = await db.resolvePhotoUrls(ticket.photos)
        } catch { /* use raw URLs as fallback */ }

        // Load all photos in parallel for faster PDF generation
        const photoImages = await loadImagesAsBase64(photoUrls)

        for (let i = 0; i < ticket.photos.length; i++) {
          if (i > 0 && i % photosPerRow === 0) {
            xPos = margin
            yPos += photoHeight + photoGap + 4
          }

          if (yPos + photoHeight > pageHeight - 20) {
            doc.addPage()
            yPos = margin
            xPos = margin
          }

          const imgData = photoImages[i]
          if (imgData) {
            doc.setDrawColor(200, 200, 200)
            doc.setLineWidth(1)
            doc.rect(xPos - 1, yPos - 1, photoWidth + 2, photoHeight + 2, 'S')
            doc.setFillColor(230, 230, 230)
            doc.rect(xPos + 2, yPos + 2, photoWidth, photoHeight, 'F')
            doc.addImage(imgData, 'JPEG', xPos, yPos, photoWidth, photoHeight)
          } else {
            doc.setFillColor(245, 245, 245)
            doc.rect(xPos, yPos, photoWidth, photoHeight, 'F')
            doc.setDrawColor(200, 200, 200)
            doc.rect(xPos, yPos, photoWidth, photoHeight, 'S')
            doc.setFontSize(7)
            doc.setTextColor(150, 150, 150)
            doc.text('Photo unavailable', xPos + 8, yPos + photoHeight / 2)
          }

          xPos += photoWidth + photoGap
        }

        yPos += photoHeight + 12
      }

      // Foreman signature block
      if (ticket.foreman_signature_data || ticket.foreman_signature_name) {
        if (yPos > pageHeight - 50) {
          doc.addPage()
          yPos = margin
        }

        const foremanBlockHeight = 32
        const foremanBlockWidth = pageWidth - (margin * 2)

        doc.setFillColor(239, 246, 255)
        doc.roundedRect(margin, yPos, foremanBlockWidth, foremanBlockHeight, 3, 3, 'F')

        doc.setFillColor(59, 130, 246)
        doc.rect(margin, yPos, 4, foremanBlockHeight, 'F')

        doc.setDrawColor(191, 219, 254)
        doc.setLineWidth(0.5)
        doc.line(margin + 4, yPos, margin + foremanBlockWidth, yPos)

        const foremanSealX = margin + 14
        const foremanSealY = yPos + foremanBlockHeight / 2
        doc.setFillColor(59, 130, 246)
        doc.circle(foremanSealX, foremanSealY, 6, 'F')
        doc.setFontSize(9)
        doc.setTextColor(255, 255, 255)
        doc.text('F', foremanSealX - 2, foremanSealY + 3)

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(59, 130, 246)
        doc.text('FOREMAN', margin + 26, yPos + 10)

        try {
          if (ticket.foreman_signature_data) {
            doc.addImage(ticket.foreman_signature_data, 'PNG', margin + 26, yPos + 13, 50, 16)
          }

          const foremanName = ticket.foreman_signature_name || 'Foreman'
          const foremanTitle = ticket.foreman_signature_title || ''
          const foremanDate = ticket.foreman_signature_date
            ? formatDate(ticket.foreman_signature_date)
            : ''

          const foremanInfoX = margin + 85

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(30, 41, 59)
          doc.text(foremanName, foremanInfoX, yPos + 12)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(71, 85, 105)
          if (foremanTitle) {
            doc.text(foremanTitle, foremanInfoX, yPos + 18)
          }
          if (foremanDate) {
            doc.setTextColor(100, 116, 139)
            doc.text(`Signed: ${foremanDate}`, foremanInfoX, yPos + 24)
          }
        } catch (_e) {
          const foremanName = ticket.foreman_signature_name || 'Foreman'
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          doc.setTextColor(30, 41, 59)
          doc.text(`Signed by: ${foremanName}`, margin + 26, yPos + 20)
        }

        yPos += foremanBlockHeight + 6
      }

      // Client verification block
      if (ticket.client_signature_data) {
        if (yPos > pageHeight - 50) {
          doc.addPage()
          yPos = margin
        }

        const verifyBlockHeight = 32
        const verifyBlockWidth = pageWidth - (margin * 2)

        doc.setFillColor(240, 253, 244)
        doc.roundedRect(margin, yPos, verifyBlockWidth, verifyBlockHeight, 3, 3, 'F')

        doc.setFillColor(16, 185, 129)
        doc.rect(margin, yPos, 4, verifyBlockHeight, 'F')

        doc.setDrawColor(187, 247, 208)
        doc.setLineWidth(0.5)
        doc.line(margin + 4, yPos, margin + verifyBlockWidth, yPos)

        const sealX = margin + 14
        const sealY = yPos + verifyBlockHeight / 2
        doc.setFillColor(16, 185, 129)
        doc.circle(sealX, sealY, 6, 'F')
        doc.setFontSize(9)
        doc.setTextColor(255, 255, 255)
        doc.text('✓', sealX - 2.5, sealY + 3)

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(16, 185, 129)
        doc.text('CLIENT VERIFIED', margin + 26, yPos + 10)

        try {
          const sigWidth = 50
          const sigHeight = 16
          doc.addImage(ticket.client_signature_data, 'PNG', margin + 26, yPos + 13, sigWidth, sigHeight)

          const signerName = ticket.client_signature_name || 'Client'
          const signerTitle = ticket.client_signature_title || ''
          const signerCompany = ticket.client_signature_company || ''
          const signedDate = ticket.client_signature_date
            ? formatDate(ticket.client_signature_date)
            : ''

          const infoX = margin + 85

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(30, 41, 59)
          doc.text(signerName, infoX, yPos + 12)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(71, 85, 105)
          if (signerTitle || signerCompany) {
            doc.text(`${signerTitle}${signerTitle && signerCompany ? ', ' : ''}${signerCompany}`, infoX, yPos + 18)
          }
          if (signedDate) {
            doc.setTextColor(100, 116, 139)
            doc.text(`Verified: ${signedDate}`, infoX, yPos + 24)
          }
        } catch (_e) {
          const signerName = ticket.client_signature_name || 'Client'
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)
          doc.setTextColor(30, 41, 59)
          doc.text(`Signed by: ${signerName}`, margin + 26, yPos + 20)
        }
      }
    }
  }

  // ============================================
  // CONTINUATION ACCENTS + FOOTERS (all pages)
  // ============================================

  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i)
    drawContinuationAccent(doc, { primary: primaryColor })
  }

  applyDocumentFooters(doc, {
    documentLabel: `Change Order ${cor.cor_number || ''}`.trim(),
    context: { company, branding, project },
    primary: primaryColor,
  })

  // ============================================
  // SAVE PDF
  // ============================================

  const fileName = `${cor.cor_number || 'COR'}_${project?.job_number || 'export'}${tickets.length ? '_with_backup' : ''}.pdf`
  doc.save(fileName)

  return {
    success: true,
    fileName,
    pageCount: totalPages,
    sizeBytes: doc.output().length
  }
}

// ============================================
// SINGLE TICKET PDF GENERATOR
// ============================================

/**
 * Generate PDF for a single T&M ticket from snapshot data
 * @param {Object} ticketData - Ticket data (can be from snapshot or live)
 * @param {Object} context - Project, company, branding
 * @returns {Promise<Object>} PDF generation result
 */
export async function generateTicketPDFFromData(ticketData, context = {}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { project, company, branding = {} } = context
  const ticket = ticketData

  const doc = new jsPDF('p', 'mm', 'letter')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18

  const primaryColor = resolvePrimaryColor({ branding, company })
  const brandLogo = await loadBrandLogo({ branding, company })

  // Header
  const ticketNumber = ticket.ce_pco_number || ticket.ticket_number || ''
  let yPos = drawDocumentHeader(doc, {
    title: 'Time & Material Ticket',
    subtitle: ticketNumber || formatDate(ticket.work_date || ticket.ticket_date),
    context: { company, branding, project },
    brandLogo,
    primary: primaryColor,
  })

  // Status badge
  const hasVerification = !!ticket.client_signature_data

  if (hasVerification) {
    doc.setFillColor(240, 253, 244)
    doc.roundedRect(pageWidth - margin - 48, yPos - 5, 48, 12, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(16, 185, 129)
    doc.text('✓ CLIENT VERIFIED', pageWidth - margin - 45, yPos + 3)
  } else {
    doc.setFillColor(255, 251, 235)
    doc.roundedRect(pageWidth - margin - 30, yPos - 5, 30, 12, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(217, 119, 6)
    doc.text('PENDING', pageWidth - margin - 27, yPos + 3)
  }
  yPos += 8

  // Metadata
  const metaItems = [
    ['Project:', project?.name || 'N/A'],
    ['Job #:', project?.job_number || 'N/A'],
    ['Work Date:', formatDate(ticket.work_date || ticket.ticket_date)],
  ]
  if (ticket.ce_pco_number) metaItems.push(['CE/PCO:', ticket.ce_pco_number])

  metaItems.forEach(([label, value]) => {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(71, 85, 105)
    doc.text(label, margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    doc.text(value, margin + 28, yPos)
    yPos += 6
  })

  yPos += 6

  // ============================================
  // DESCRIPTION
  // ============================================

  if (ticket.notes) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(71, 85, 105)
    doc.text('DESCRIPTION', margin, yPos)
    yPos += 5

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    const notesLines = doc.splitTextToSize(ticket.notes, pageWidth - margin * 2)
    doc.text(notesLines, margin, yPos)
    yPos += notesLines.length * 4 + 10
  }

  // ============================================
  // LABOR TABLE
  // ============================================

  if (ticket.t_and_m_workers?.length > 0) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = margin }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(71, 85, 105)
    doc.text('LABOR', margin, yPos)
    yPos += 5

    const totalReg = ticket.t_and_m_workers.reduce((s, w) => s + (parseFloat(w.hours) || 0), 0)
    const totalOT = ticket.t_and_m_workers.reduce((s, w) => s + (parseFloat(w.overtime_hours) || 0), 0)

    autoTable(doc, {
      startY: yPos,
      head: [['Worker', 'Time Period', 'Class', 'Reg Hrs', 'OT Hrs']],
      body: ticket.t_and_m_workers.map(w => [
        w.name,
        formatTimePeriod(w),
        w.role || w.labor_class || 'Laborer',
        w.hours?.toString() || '0',
        w.overtime_hours?.toString() || '-'
      ]),
      foot: [[
        { content: 'TOTAL HOURS', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: totalReg.toFixed(1), styles: { fontStyle: 'bold' } },
        { content: totalOT > 0 ? totalOT.toFixed(1) : '-', styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      footStyles: { fillColor: [248, 250, 252], textColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'grid'
    })

    yPos = doc.lastAutoTable.finalY + 10
  }

  // ============================================
  // MATERIALS / EQUIPMENT TABLE
  // ============================================

  if (ticket.t_and_m_items?.length > 0) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = margin }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(71, 85, 105)
    doc.text('MATERIALS / EQUIPMENT', margin, yPos)
    yPos += 5

    autoTable(doc, {
      startY: yPos,
      head: [['Item', 'Category', 'Qty', 'Unit']],
      body: ticket.t_and_m_items.map(item => [
        item.custom_name || item.materials_equipment?.name || item.description || 'Unnamed Item',
        item.custom_category || item.materials_equipment?.category || '-',
        item.quantity?.toString() || '1',
        item.materials_equipment?.unit || item.unit || 'ea'
      ]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'grid'
    })

    yPos = doc.lastAutoTable.finalY + 10
  }

  // ============================================
  // PHOTO DOCUMENTATION
  // ============================================

  if (ticket.photos?.length > 0) {
    if (yPos > pageHeight - 80) { doc.addPage(); yPos = margin }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(71, 85, 105)
    doc.text('PHOTO DOCUMENTATION', margin, yPos)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(59, 130, 246)
    doc.text(`${ticket.photos.length} photo${ticket.photos.length !== 1 ? 's' : ''}`, margin + 55, yPos)
    yPos += 8

    // Resolve storage paths to signed URLs before loading
    let photoUrls = ticket.photos
    try {
      const { db } = await import('./supabase')
      photoUrls = await db.resolvePhotoUrls(ticket.photos)
    } catch { /* use raw URLs as fallback */ }
    const photoImages = await loadImagesAsBase64(photoUrls, 10000)
    const photoWidth = 55
    const photoHeight = 45
    const photoGap = 6
    const photosPerRow = 3
    let xPos = margin

    for (let i = 0; i < ticket.photos.length; i++) {
      if (i > 0 && i % photosPerRow === 0) {
        xPos = margin
        yPos += photoHeight + photoGap + 4
      }
      if (yPos + photoHeight > pageHeight - 20) {
        doc.addPage()
        yPos = margin
        xPos = margin
      }
      const imgData = photoImages[i]
      if (imgData) {
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.5)
        doc.rect(xPos - 1, yPos - 1, photoWidth + 2, photoHeight + 2, 'S')
        doc.addImage(imgData, 'JPEG', xPos, yPos, photoWidth, photoHeight)
      } else {
        doc.setFillColor(245, 245, 245)
        doc.rect(xPos, yPos, photoWidth, photoHeight, 'F')
        doc.setDrawColor(200, 200, 200)
        doc.rect(xPos, yPos, photoWidth, photoHeight, 'S')
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text('Photo unavailable', xPos + 8, yPos + photoHeight / 2)
      }
      xPos += photoWidth + photoGap
    }

    yPos += photoHeight + 12
  }

  // ============================================
  // FOREMAN SIGNATURE BLOCK
  // ============================================

  if (ticket.foreman_signature_data || ticket.foreman_signature_name) {
    if (yPos > pageHeight - 50) { doc.addPage(); yPos = margin }

    const foremanBlockHeight = 34
    const foremanBlockWidth = pageWidth - margin * 2

    doc.setFillColor(239, 246, 255)
    doc.roundedRect(margin, yPos, foremanBlockWidth, foremanBlockHeight, 3, 3, 'F')
    doc.setFillColor(59, 130, 246)
    doc.rect(margin, yPos, 4, foremanBlockHeight, 'F')
    doc.setDrawColor(191, 219, 254)
    doc.setLineWidth(0.5)
    doc.line(margin + 4, yPos, margin + foremanBlockWidth, yPos)

    const foremanSealX = margin + 14
    const foremanSealY = yPos + foremanBlockHeight / 2
    doc.setFillColor(59, 130, 246)
    doc.circle(foremanSealX, foremanSealY, 6, 'F')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text('F', foremanSealX - 2, foremanSealY + 3)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(59, 130, 246)
    doc.text('FOREMAN', margin + 26, yPos + 10)

    try {
      if (ticket.foreman_signature_data) {
        doc.addImage(ticket.foreman_signature_data, 'PNG', margin + 26, yPos + 13, 50, 16)
      }
      const foremanInfoX = margin + 85
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(30, 41, 59)
      doc.text(ticket.foreman_signature_name || 'Foreman', foremanInfoX, yPos + 12)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(71, 85, 105)
      if (ticket.foreman_signature_title) {
        doc.text(ticket.foreman_signature_title, foremanInfoX, yPos + 18)
      }
      if (ticket.foreman_signature_date) {
        doc.setTextColor(100, 116, 139)
        doc.text(`Signed: ${formatDate(ticket.foreman_signature_date)}`, foremanInfoX, yPos + 25)
      }
    } catch (_e) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(30, 41, 59)
      doc.text(`Signed by: ${ticket.foreman_signature_name || 'Foreman'}`, margin + 26, yPos + 20)
    }

    yPos += foremanBlockHeight + 6
  }

  // ============================================
  // CLIENT VERIFICATION BLOCK
  // ============================================

  if (ticket.client_signature_data) {
    if (yPos > pageHeight - 50) { doc.addPage(); yPos = margin }

    const verifyBlockHeight = 34
    const verifyBlockWidth = pageWidth - margin * 2

    doc.setFillColor(240, 253, 244)
    doc.roundedRect(margin, yPos, verifyBlockWidth, verifyBlockHeight, 3, 3, 'F')
    doc.setFillColor(16, 185, 129)
    doc.rect(margin, yPos, 4, verifyBlockHeight, 'F')
    doc.setDrawColor(187, 247, 208)
    doc.setLineWidth(0.5)
    doc.line(margin + 4, yPos, margin + verifyBlockWidth, yPos)

    const sealX = margin + 14
    const sealY = yPos + verifyBlockHeight / 2
    doc.setFillColor(16, 185, 129)
    doc.circle(sealX, sealY, 6, 'F')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text('✓', sealX - 2.5, sealY + 3)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(16, 185, 129)
    doc.text('CLIENT VERIFIED', margin + 26, yPos + 10)

    try {
      doc.addImage(ticket.client_signature_data, 'PNG', margin + 26, yPos + 13, 50, 16)
      const infoX = margin + 85
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(30, 41, 59)
      doc.text(ticket.client_signature_name || 'Client', infoX, yPos + 12)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(71, 85, 105)
      const titleCompany = [ticket.client_signature_title, ticket.client_signature_company].filter(Boolean).join(', ')
      if (titleCompany) doc.text(titleCompany, infoX, yPos + 18)
      if (ticket.client_signature_date) {
        doc.setTextColor(100, 116, 139)
        doc.text(`Verified: ${formatDate(ticket.client_signature_date)}`, infoX, yPos + 25)
      }
    } catch (_e) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(30, 41, 59)
      doc.text(`Signed by: ${ticket.client_signature_name || 'Client'}`, margin + 26, yPos + 20)
    }
  }

  // ============================================
  // CONTINUATION ACCENTS + FOOTERS (all pages)
  // ============================================

  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i)
    drawContinuationAccent(doc, { primary: primaryColor })
  }

  applyDocumentFooters(doc, {
    documentLabel: ticketNumber
      ? `T&M Ticket ${ticketNumber}`
      : 'Time and Material Ticket',
    context: { company, branding, project },
    primary: primaryColor,
  })

  const ticketDate = formatDate(ticket.work_date || ticket.ticket_date).replace(/\//g, '-')
  const fileName = `Time_Material_Ticket_${ticketDate}${ticket.ce_pco_number ? '_' + ticket.ce_pco_number : ''}.pdf`
  doc.save(fileName)

  return { success: true, fileName, pageCount: totalPages }
}

// ============================================
// EXPORTS
// ============================================

export default {
  generatePDFFromSnapshot,
  generateTicketPDFFromData
}
