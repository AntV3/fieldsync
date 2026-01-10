/**
 * Draw Request PDF Generator
 *
 * Generates AIA G702/G703 style pay application PDFs.
 * G702 = Application Summary (Page 1)
 * G703 = Continuation Sheet / Schedule of Values (Page 2+)
 */

import { formatCurrency } from './corCalculations'

/**
 * Generate a draw request PDF (AIA G702/G703 format)
 *
 * @param {Object} drawRequest - Draw request data with items
 * @param {Object} project - Project data
 * @param {Object} company - Company data
 * @returns {Promise<jsPDF>} The generated PDF document
 */
export async function generateDrawRequestPDF(drawRequest, project, company) {
  // Dynamic imports for code splitting
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF('portrait')
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 15

  // Colors
  const primaryColor = [33, 33, 33]
  const headerBg = [59, 130, 246]
  const lightGray = [156, 163, 175]
  const borderColor = [209, 213, 219]

  // ============================================
  // PAGE 1: G702 - APPLICATION SUMMARY
  // ============================================

  let yPos = margin

  // Header
  doc.setFillColor(...headerBg)
  doc.rect(0, 0, pageWidth, 25, 'F')

  doc.setFontSize(16)
  doc.setFont(undefined, 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('APPLICATION AND CERTIFICATE FOR PAYMENT', pageWidth / 2, 12, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont(undefined, 'normal')
  doc.text('AIA Document G702', pageWidth / 2, 20, { align: 'center' })

  yPos = 35

  // Project & Application Info (two columns)
  doc.setTextColor(...primaryColor)
  doc.setFontSize(9)

  // Left column - Project Info
  doc.setFont(undefined, 'bold')
  doc.text('TO OWNER:', margin, yPos)
  doc.setFont(undefined, 'normal')
  doc.text(project.general_contractor || 'Owner Name', margin, yPos + 5)

  doc.setFont(undefined, 'bold')
  doc.text('PROJECT:', margin, yPos + 15)
  doc.setFont(undefined, 'normal')
  doc.text(project.name || 'Project Name', margin, yPos + 20)
  if (project.job_number) {
    doc.text(`Job #: ${project.job_number}`, margin, yPos + 25)
  }

  // Right column - Application Info
  const rightCol = pageWidth / 2 + 10

  doc.setFont(undefined, 'bold')
  doc.text('FROM CONTRACTOR:', rightCol, yPos)
  doc.setFont(undefined, 'normal')
  doc.text(company?.name || 'Contractor Name', rightCol, yPos + 5)

  doc.setFont(undefined, 'bold')
  doc.text('APPLICATION NO:', rightCol, yPos + 15)
  doc.setFont(undefined, 'normal')
  doc.text(String(drawRequest.draw_number), rightCol + 35, yPos + 15)

  doc.setFont(undefined, 'bold')
  doc.text('PERIOD TO:', rightCol, yPos + 22)
  doc.setFont(undefined, 'normal')
  doc.text(formatDate(drawRequest.period_end), rightCol + 25, yPos + 22)

  yPos += 40

  // Contract Summary Table
  doc.setFont(undefined, 'bold')
  doc.setFontSize(10)
  doc.text('CONTRACTOR\'S APPLICATION FOR PAYMENT', margin, yPos)
  yPos += 8

  const contractData = [
    ['1.', 'ORIGINAL CONTRACT SUM', formatCurrency(drawRequest.original_contract)],
    ['2.', 'Net change by Change Orders', formatCurrency(drawRequest.approved_changes)],
    ['3.', 'CONTRACT SUM TO DATE (Line 1 + 2)', formatCurrency(drawRequest.original_contract + drawRequest.approved_changes)],
    ['4.', 'TOTAL COMPLETED & STORED TO DATE', formatCurrency((drawRequest.previous_billings || 0) + (drawRequest.current_billing || 0))],
    ['5.', 'RETAINAGE:', ''],
    ['', `    ${(drawRequest.retention_percent / 100).toFixed(1)}% of Completed Work`, formatCurrency(drawRequest.retention_held)],
    ['6.', 'TOTAL EARNED LESS RETAINAGE (Line 4 less Line 5)', formatCurrency((drawRequest.previous_billings || 0) + (drawRequest.current_billing || 0) - drawRequest.retention_held)],
    ['7.', 'LESS PREVIOUS CERTIFICATES FOR PAYMENT', formatCurrency(drawRequest.previous_billings - (drawRequest.previous_retention || 0))],
    ['8.', 'CURRENT PAYMENT DUE', formatCurrency(drawRequest.current_billing - (drawRequest.retention_held - (drawRequest.previous_retention || 0)))],
    ['9.', 'BALANCE TO FINISH, INCLUDING RETAINAGE', formatCurrency(drawRequest.original_contract + drawRequest.approved_changes - (drawRequest.previous_billings || 0) - (drawRequest.current_billing || 0) + drawRequest.retention_held)]
  ]

  autoTable(doc, {
    startY: yPos,
    body: contractData,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: primaryColor
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 100 },
      2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      // Bold important rows
      if ([0, 2, 3, 7, 8].includes(data.row.index)) {
        data.cell.styles.fontStyle = 'bold'
      }
      // Highlight current payment due
      if (data.row.index === 8) {
        data.cell.styles.fillColor = [254, 249, 195]
      }
    },
    margin: { left: margin, right: margin }
  })

  yPos = doc.lastAutoTable.finalY + 15

  // Signature Lines
  doc.setFontSize(8)
  doc.setTextColor(...lightGray)

  // Contractor Signature
  doc.text('CONTRACTOR:', margin, yPos)
  doc.line(margin + 25, yPos, margin + 85, yPos)
  doc.text('Date:', margin + 90, yPos)
  doc.line(margin + 100, yPos, margin + 130, yPos)

  yPos += 15

  // Notary / Certification Text
  doc.setFontSize(7)
  doc.text(
    'The undersigned Contractor certifies that to the best of the Contractor\'s knowledge, information and belief,',
    margin, yPos
  )
  doc.text(
    'the Work covered by this Application for Payment has been completed in accordance with the Contract Documents.',
    margin, yPos + 4
  )

  // Footer
  const footerY = pageHeight - 10
  doc.setFontSize(7)
  doc.text(`Draw Request #${drawRequest.draw_number} | ${project.name} | Page 1`, pageWidth / 2, footerY, { align: 'center' })

  // ============================================
  // PAGE 2+: G703 - CONTINUATION SHEET (SOV)
  // ============================================

  doc.addPage()
  yPos = margin

  // Header
  doc.setFillColor(...headerBg)
  doc.rect(0, 0, pageWidth, 20, 'F')

  doc.setFontSize(12)
  doc.setFont(undefined, 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('CONTINUATION SHEET', pageWidth / 2, 10, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont(undefined, 'normal')
  doc.text('AIA Document G703', pageWidth / 2, 16, { align: 'center' })

  yPos = 28

  // Project info
  doc.setTextColor(...primaryColor)
  doc.setFontSize(8)
  doc.text(`Project: ${project.name}`, margin, yPos)
  doc.text(`Application #: ${drawRequest.draw_number}`, pageWidth - margin - 40, yPos)
  doc.text(`Period To: ${formatDate(drawRequest.period_end)}`, pageWidth - margin - 40, yPos + 5)

  yPos += 12

  // Schedule of Values Table
  const items = drawRequest.draw_request_items || []
  const tableData = items.map(item => {
    const prevPct = ((item.previous_percent || 0) / 100).toFixed(0)
    const currPct = ((item.current_percent || 0) / 100).toFixed(0)
    const totalPct = (((item.previous_percent || 0) + (item.current_percent || 0)) / 100).toFixed(0)

    return [
      item.item_number || '',
      item.description || '',
      formatCurrency(item.scheduled_value),
      `${prevPct}%`,
      formatCurrency(item.previous_amount),
      `${currPct}%`,
      formatCurrency(item.current_amount),
      `${totalPct}%`,
      formatCurrency((item.previous_amount || 0) + (item.current_amount || 0)),
      formatCurrency(item.scheduled_value - (item.previous_amount || 0) - (item.current_amount || 0))
    ]
  })

  // Calculate totals
  const totals = items.reduce((acc, item) => ({
    scheduled: acc.scheduled + (item.scheduled_value || 0),
    previous: acc.previous + (item.previous_amount || 0),
    current: acc.current + (item.current_amount || 0)
  }), { scheduled: 0, previous: 0, current: 0 })

  // Add totals row
  tableData.push([
    '',
    'TOTALS',
    formatCurrency(totals.scheduled),
    '',
    formatCurrency(totals.previous),
    '',
    formatCurrency(totals.current),
    '',
    formatCurrency(totals.previous + totals.current),
    formatCurrency(totals.scheduled - totals.previous - totals.current)
  ])

  autoTable(doc, {
    startY: yPos,
    head: [[
      '#',
      'Description of Work',
      'Scheduled\nValue',
      'Prev\n%',
      'Previous\nAmount',
      'This\n%',
      'This Period\nAmount',
      'Total\n%',
      'Total\nCompleted',
      'Balance\nTo Finish'
    ]],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 2,
      textColor: primaryColor,
      lineColor: borderColor,
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: primaryColor,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 45 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 12, halign: 'center' },
      8: { cellWidth: 22, halign: 'right' },
      9: { cellWidth: 22, halign: 'right' }
    },
    didParseCell: function(data) {
      // Style totals row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [249, 250, 251]
      }
    },
    margin: { left: margin, right: margin }
  })

  // Footer
  const page2FooterY = pageHeight - 10
  doc.setFontSize(7)
  doc.setTextColor(...lightGray)
  doc.text(`Draw Request #${drawRequest.draw_number} | ${project.name} | Page 2`, pageWidth / 2, page2FooterY, { align: 'center' })

  return doc
}

/**
 * Generate and download draw request PDF
 */
export async function downloadDrawRequestPDF(drawRequest, project, company) {
  const doc = await generateDrawRequestPDF(drawRequest, project, company)
  const fileName = `Draw_${drawRequest.draw_number}_${project.job_number || project.name.replace(/\s+/g, '_')}.pdf`
  doc.save(fileName)
  return fileName
}

/**
 * Generate draw request PDF as blob
 */
export async function getDrawRequestPDFBlob(drawRequest, project, company) {
  const doc = await generateDrawRequestPDF(drawRequest, project, company)
  return doc.output('blob')
}

// Helper function to format date
function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
