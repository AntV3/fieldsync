/**
 * AIA G702/G703 Billing Export
 *
 * Generates AIA-format billing documents from FieldSync project data.
 * G702 = Application and Certificate for Payment (summary)
 * G703 = Continuation Sheet (line-item breakdown by SOV/area)
 *
 * Output: PDF via jsPDF, CSV for import into other systems
 */

import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { toCSV } from './financialExport'

// ============================================
// G703 Continuation Sheet Data Builder
// ============================================

/**
 * Build G703 line items from project areas and financial data.
 * Each area becomes a schedule-of-values line item.
 */
export function buildG703Lines(project, areas, changeOrders = [], previousApplications = []) {
  const lines = []
  let itemNumber = 1

  // Calculate previous billing totals per area
  const previousByArea = {}
  for (const app of previousApplications) {
    for (const line of (app.lines || [])) {
      if (!previousByArea[line.area_id]) previousByArea[line.area_id] = 0
      previousByArea[line.area_id] += line.completed_this_period || 0
    }
  }

  // Original contract line items from areas
  for (const area of areas) {
    const scheduledValue = area.sov_value || area.weight || 0
    const previousWork = previousByArea[area.id] || 0
    const progressPct = area.status === 'done' ? 100 : area.status === 'working' ? 50 : 0
    const totalCompleted = scheduledValue * (progressPct / 100)
    const thisPeriodsWork = Math.max(0, totalCompleted - previousWork)

    // Retention: standard 10% until 50% complete, 5% after
    const retentionPct = progressPct >= 50 ? 5 : 10
    const retention = totalCompleted * (retentionPct / 100)

    lines.push({
      item_number: String(itemNumber++),
      description: area.name,
      area_id: area.id,
      scheduled_value: scheduledValue,
      previous_applications: previousWork,
      this_period_work: thisPeriodsWork,
      materials_stored: 0,
      total_completed: totalCompleted,
      percent_complete: progressPct,
      retention_pct: retentionPct,
      retention: retention,
      balance_to_finish: scheduledValue - totalCompleted
    })
  }

  // Approved change orders as additional line items
  const approvedCOs = (changeOrders || []).filter(co =>
    co.status === 'approved' || co.status === 'billed' || co.status === 'closed'
  )
  for (const co of approvedCOs) {
    const coValue = (co.cor_total || 0) / 100  // cents to dollars
    const billed = co.status === 'billed' || co.status === 'closed'

    lines.push({
      item_number: `CO-${co.cor_number || itemNumber}`,
      description: `CO #${co.cor_number}: ${co.title || 'Change Order'}`,
      area_id: null,
      scheduled_value: coValue,
      previous_applications: billed ? coValue : 0,
      this_period_work: billed ? 0 : coValue,
      materials_stored: 0,
      total_completed: coValue,
      percent_complete: 100,
      retention_pct: 10,
      retention: coValue * 0.10,
      balance_to_finish: 0
    })
  }

  return lines
}

/**
 * Build G702 summary from G703 lines
 */
export function buildG702Summary(project, g703Lines, applicationNumber = 1, periodTo = null) {
  const originalContract = project.contract_value || 0
  const changeOrderTotal = g703Lines
    .filter(l => l.item_number.startsWith('CO-'))
    .reduce((sum, l) => sum + l.scheduled_value, 0)

  const totalScheduledValue = g703Lines.reduce((sum, l) => sum + l.scheduled_value, 0)
  const totalPreviousWork = g703Lines.reduce((sum, l) => sum + l.previous_applications, 0)
  const totalMaterialsStored = g703Lines.reduce((sum, l) => sum + l.materials_stored, 0)
  const totalCompleted = g703Lines.reduce((sum, l) => sum + l.total_completed, 0)
  const totalRetention = g703Lines.reduce((sum, l) => sum + l.retention, 0)

  return {
    application_number: applicationNumber,
    period_to: periodTo || new Date().toISOString().split('T')[0],
    project_name: project.name,
    project_number: project.job_number || '',
    // Line 1: Original contract sum
    original_contract_sum: originalContract,
    // Line 2: Net change by change orders
    net_change_orders: changeOrderTotal,
    // Line 3: Contract sum to date (1 + 2)
    contract_sum_to_date: originalContract + changeOrderTotal,
    // Line 4: Total completed & stored to date
    total_completed_stored: totalCompleted + totalMaterialsStored,
    // Line 5: Retainage
    retainage: totalRetention,
    // Line 6: Total earned less retainage (4 - 5)
    total_earned_less_retainage: (totalCompleted + totalMaterialsStored) - totalRetention,
    // Line 7: Less previous certificates for payment
    previous_certificates: totalPreviousWork,
    // Line 8: Current payment due (6 - 7)
    current_payment_due: ((totalCompleted + totalMaterialsStored) - totalRetention) - totalPreviousWork,
    // Line 9: Balance to finish plus retainage
    balance_to_finish: totalScheduledValue - totalCompleted + totalRetention,
    // Summary percentages
    percent_complete: totalScheduledValue > 0
      ? Math.round((totalCompleted / totalScheduledValue) * 100)
      : 0
  }
}

// ============================================
// PDF Export
// ============================================

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
}

/**
 * Export AIA G702/G703 as PDF
 */
export function exportAIABillingPDF(project, areas, changeOrders = [], options = {}) {
  const {
    applicationNumber = 1,
    periodTo = new Date().toISOString().split('T')[0],
    previousApplications = [],
    architect = '',
    owner = '',
    contractDate = '',
    company = null
  } = options

  const g703Lines = buildG703Lines(project, areas, changeOrders, previousApplications)
  const g702 = buildG702Summary(project, g703Lines, applicationNumber, periodTo)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // ---- Discrete company wordmark in upper-left (does not disturb AIA layout) ----
  if (company?.name) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(company.name, 40, 22)
    const contact = [company.phone, company.email].filter(Boolean).join('  ·  ')
    if (contact) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text(contact, 40, 33)
    }
    doc.setTextColor(0, 0, 0)
  }

  // ---- G702 Page ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('APPLICATION AND CERTIFICATE FOR PAYMENT', pageWidth / 2, 30, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('AIA Document G702', pageWidth / 2, 42, { align: 'center' })

  // Project info block
  doc.setFontSize(10)
  const leftCol = 40
  const rightCol = pageWidth / 2 + 20
  let y = 65

  doc.text(`TO OWNER: ${owner || '_______________'}`, leftCol, y)
  doc.text(`APPLICATION NO: ${applicationNumber}`, rightCol, y)
  y += 14
  doc.text(`PROJECT: ${project.name}`, leftCol, y)
  doc.text(`PERIOD TO: ${periodTo}`, rightCol, y)
  y += 14
  doc.text(`PROJECT NO: ${project.job_number || ''}`, leftCol, y)
  doc.text(`CONTRACT DATE: ${contractDate || project.start_date || ''}`, rightCol, y)
  y += 14
  doc.text(`VIA ARCHITECT: ${architect || '_______________'}`, leftCol, y)
  doc.text(`CONTRACT FOR: ${project.work_type || 'General Construction'}`, rightCol, y)

  // G702 Summary table
  y += 25
  doc.autoTable({
    startY: y,
    head: [['Line', 'Description', 'Amount']],
    body: [
      ['1', 'ORIGINAL CONTRACT SUM', formatCurrency(g702.original_contract_sum)],
      ['2', 'Net change by Change Orders', formatCurrency(g702.net_change_orders)],
      ['3', 'CONTRACT SUM TO DATE (Line 1 + 2)', formatCurrency(g702.contract_sum_to_date)],
      ['4', 'TOTAL COMPLETED & STORED TO DATE', formatCurrency(g702.total_completed_stored)],
      ['5', 'RETAINAGE', formatCurrency(g702.retainage)],
      ['6', 'TOTAL EARNED LESS RETAINAGE (Line 4 - 5)', formatCurrency(g702.total_earned_less_retainage)],
      ['7', 'LESS PREVIOUS CERTIFICATES FOR PAYMENT', formatCurrency(g702.previous_certificates)],
      ['8', 'CURRENT PAYMENT DUE (Line 6 - 7)', formatCurrency(g702.current_payment_due)],
      ['9', 'BALANCE TO FINISH, INCLUDING RETAINAGE', formatCurrency(g702.balance_to_finish)]
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [51, 51, 51] },
    columnStyles: {
      0: { cellWidth: 40, halign: 'center' },
      1: { cellWidth: 400 },
      2: { cellWidth: 120, halign: 'right' }
    },
    margin: { left: leftCol }
  })

  // Signature lines
  const sigY = doc.lastAutoTable.finalY + 30
  doc.setFontSize(9)
  doc.text('CONTRACTOR:', leftCol, sigY)
  doc.line(leftCol + 80, sigY, leftCol + 250, sigY)
  doc.text('Date:', leftCol + 260, sigY)
  doc.line(leftCol + 290, sigY, leftCol + 380, sigY)

  doc.text('ARCHITECT:', rightCol, sigY)
  doc.line(rightCol + 80, sigY, rightCol + 250, sigY)
  doc.text('Date:', rightCol + 260, sigY)
  doc.line(rightCol + 290, sigY, rightCol + 380, sigY)

  // ---- G703 Page ----
  doc.addPage('landscape')
  doc.setFontSize(14)
  doc.text('CONTINUATION SHEET', pageWidth / 2, 30, { align: 'center' })
  doc.setFontSize(9)
  doc.text('AIA Document G703', pageWidth / 2, 42, { align: 'center' })
  doc.text(`Application No: ${applicationNumber}    Period To: ${periodTo}`, pageWidth / 2, 54, { align: 'center' })

  // G703 table
  const tableBody = g703Lines.map(line => [
    line.item_number,
    line.description,
    formatCurrency(line.scheduled_value),
    formatCurrency(line.previous_applications),
    formatCurrency(line.this_period_work),
    formatCurrency(line.materials_stored),
    formatCurrency(line.total_completed),
    `${line.percent_complete}%`,
    formatCurrency(line.balance_to_finish),
    formatCurrency(line.retention)
  ])

  // Totals row
  const totals = g703Lines.reduce((acc, l) => ({
    scheduled: acc.scheduled + l.scheduled_value,
    previous: acc.previous + l.previous_applications,
    thisPeriod: acc.thisPeriod + l.this_period_work,
    materials: acc.materials + l.materials_stored,
    completed: acc.completed + l.total_completed,
    balance: acc.balance + l.balance_to_finish,
    retention: acc.retention + l.retention
  }), { scheduled: 0, previous: 0, thisPeriod: 0, materials: 0, completed: 0, balance: 0, retention: 0 })

  tableBody.push([
    '', 'TOTALS',
    formatCurrency(totals.scheduled),
    formatCurrency(totals.previous),
    formatCurrency(totals.thisPeriod),
    formatCurrency(totals.materials),
    formatCurrency(totals.completed),
    totals.scheduled > 0 ? `${Math.round((totals.completed / totals.scheduled) * 100)}%` : '0%',
    formatCurrency(totals.balance),
    formatCurrency(totals.retention)
  ])

  doc.autoTable({
    startY: 65,
    head: [[
      { content: 'Item\nNo.', styles: { halign: 'center' } },
      'Description of Work',
      { content: 'Scheduled\nValue', styles: { halign: 'right' } },
      { content: 'From Previous\nApplication', styles: { halign: 'right' } },
      { content: 'This Period', styles: { halign: 'right' } },
      { content: 'Materials\nStored', styles: { halign: 'right' } },
      { content: 'Total\nCompleted', styles: { halign: 'right' } },
      { content: '%\n(G/C)', styles: { halign: 'center' } },
      { content: 'Balance to\nFinish', styles: { halign: 'right' } },
      { content: 'Retainage', styles: { halign: 'right' } }
    ]],
    body: tableBody,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [51, 51, 51], fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 35, halign: 'center' },
      1: { cellWidth: 160 },
      2: { cellWidth: 70, halign: 'right' },
      3: { cellWidth: 70, halign: 'right' },
      4: { cellWidth: 65, halign: 'right' },
      5: { cellWidth: 60, halign: 'right' },
      6: { cellWidth: 70, halign: 'right' },
      7: { cellWidth: 35, halign: 'center' },
      8: { cellWidth: 70, halign: 'right' },
      9: { cellWidth: 65, halign: 'right' }
    },
    margin: { left: 20, right: 20 },
    didParseCell(data) {
      // Bold the totals row
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [240, 240, 240]
      }
    }
  })

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 20
  doc.setFontSize(7)
  doc.text(`Generated by FieldSync on ${new Date().toLocaleDateString()}`, 20, footerY)
  doc.text(`Page 2 of 2`, pageWidth - 60, footerY)

  // First page footer
  doc.setPage(1)
  doc.text(`Generated by FieldSync on ${new Date().toLocaleDateString()}`, 20, footerY)
  doc.text(`Page 1 of 2`, pageWidth - 60, footerY)

  const filename = `AIA_G702_G703_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_App${applicationNumber}_${periodTo}.pdf`
  doc.save(filename)

  return { g702, g703Lines, filename }
}

// ============================================
// CSV Export (for import into other billing systems)
// ============================================

export function exportAIABillingCSV(project, areas, changeOrders = [], options = {}) {
  const {
    applicationNumber = 1,
    previousApplications = []
  } = options

  const g703Lines = buildG703Lines(project, areas, changeOrders, previousApplications)

  const headers = [
    { key: 'item_number', label: 'Item No.' },
    { key: 'description', label: 'Description of Work' },
    { key: 'scheduled_value', label: 'Scheduled Value' },
    { key: 'previous_applications', label: 'From Previous Application' },
    { key: 'this_period_work', label: 'This Period' },
    { key: 'materials_stored', label: 'Materials Stored' },
    { key: 'total_completed', label: 'Total Completed & Stored' },
    { key: 'percent_complete', label: '% Complete' },
    { key: 'balance_to_finish', label: 'Balance to Finish' },
    { key: 'retention', label: 'Retainage' }
  ]

  const csv = toCSV(headers, g703Lines)

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AIA_G703_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_App${applicationNumber}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return g703Lines
}
