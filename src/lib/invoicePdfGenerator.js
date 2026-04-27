/**
 * Invoice PDF Generator
 *
 * Generates professional, branded invoice PDFs.
 * Uses jsPDF with autoTable plugin for consistent formatting.
 */

import { formatCurrency } from './corCalculations'
import {
  resolvePrimaryColor,
  loadBrandLogo,
  drawDocumentHeader,
  drawContinuationAccent,
  applyDocumentFooters,
} from './pdfBranding'

// Helper: format a date string to long US format
function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Helper: draw a thin horizontal rule
function drawRule(doc, x1, y, x2, color = [226, 232, 240], weight = 0.3) {
  doc.setDrawColor(...color)
  doc.setLineWidth(weight)
  doc.line(x1, y, x2, y)
}

/**
 * Generate an invoice PDF
 *
 * @param {Object} invoice - Invoice data with items
 * @param {Object} project  - Project data
 * @param {Object} company  - Company data with branding
 * @returns {Promise<jsPDF>} The generated PDF document
 */
export async function generateInvoicePDF(invoice, project, company) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF('portrait', 'mm', 'letter')
  const pageWidth  = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 18
  const contentWidth = pageWidth - margin * 2

  // ─── Brand colours ───────────────────────────────────────────────────────────
  const primary  = resolvePrimaryColor({ company })
  const dark     = [17, 24, 39]             // near-black text
  const mid      = [71, 85, 105]            // secondary text
  const subtle   = [148, 163, 184]          // light labels / rules
  const surface  = [248, 250, 252]          // table alt rows / boxes
  const border   = [226, 232, 240]

  const brandLogo = await loadBrandLogo({ company })

  // ============================================================
  // EDITORIAL HEADER
  // ============================================================
  let y = drawDocumentHeader(doc, {
    title: 'Invoice',
    subtitle: invoice.invoice_number ? `# ${invoice.invoice_number}` : '',
    context: { company, project },
    brandLogo,
    primary,
  })

  // ============================================================
  // INVOICE META  (left)  +  BILL TO  (right)
  // ============================================================
  const metaTop = y
  const leftW  = contentWidth * 0.44
  const rightW = contentWidth * 0.44
  const rightX = margin + contentWidth - rightW

  // ── Left: invoice details ───────────────────────────────────
  const metaRows = [
    ['Invoice #',    invoice.invoice_number || '—'],
    ['Invoice Date', formatDate(invoice.invoice_date)],
    ['Due Date',     invoice.due_date ? formatDate(invoice.due_date) : 'Upon Receipt'],
    ['Terms',        invoice.terms || 'Net 30'],
  ]
  const labelCol = margin
  const valueCol = margin + 30

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...subtle)
  doc.text('INVOICE DETAILS', labelCol, y)
  y += 5
  drawRule(doc, labelCol, y, labelCol + leftW, border)
  y += 5

  metaRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...mid)
    doc.text(label, labelCol, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...dark)
    doc.text(String(value || '—'), valueCol, y)
    y += 5.5
  })

  // ── Right: Bill To ──────────────────────────────────────────
  let billY = metaTop

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...subtle)
  doc.text('BILL TO', rightX, billY)
  billY += 5
  drawRule(doc, rightX, billY, rightX + rightW, border)
  billY += 5

  if (invoice.bill_to_name) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...dark)
    doc.text(invoice.bill_to_name, rightX, billY)
    billY += 6
  }
  if (invoice.bill_to_address) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mid)
    const addrLines = doc.splitTextToSize(invoice.bill_to_address, rightW)
    addrLines.forEach(line => { doc.text(line, rightX, billY); billY += 4.5 })
  }
  if (invoice.bill_to_contact) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mid)
    doc.text(invoice.bill_to_contact, rightX, billY)
  }

  y = Math.max(y, billY) + 10

  // Project reference strip
  doc.setFillColor(...surface)
  doc.roundedRect(margin, y - 3, contentWidth, 9, 2, 2, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...mid)
  doc.text('Project:', margin + 4, y + 3)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...dark)
  const projLabel = (project?.name || '') + (project?.job_number ? `  (Job #${project.job_number})` : '')
  doc.text(projLabel, margin + 22, y + 3)
  y += 14

  // ============================================================
  // LINE ITEMS TABLE
  // ============================================================
  const tableData = (invoice.invoice_items || []).map((item, idx) => [
    (idx + 1).toString(),
    item.reference_number || '—',
    item.description || '—',
    formatCurrency(item.amount)
  ])

  autoTable(doc, {
    startY: y,
    head: [['#', 'Ref #', 'Description', 'Amount']],
    body: tableData.length > 0 ? tableData : [['', '', 'No line items', '']],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: dark,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    alternateRowStyles: { fillColor: surface },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 30, halign: 'right' }
    },
    margin: { left: margin, right: margin }
  })

  y = doc.lastAutoTable.finalY + 8

  // ============================================================
  // TOTALS BLOCK  (right-aligned)
  // ============================================================
  const totalsW   = 80
  const totalsX   = pageWidth - margin - totalsW
  const totalsVal = pageWidth - margin

  // Subtotal row
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...mid)
  doc.text('Subtotal', totalsX, y)
  doc.setTextColor(...dark)
  doc.text(formatCurrency(invoice.subtotal), totalsVal, y, { align: 'right' })
  y += 6

  // Retention (if applicable) — retention_percent stored in basis points (1000 = 10%)
  if (invoice.retention_percent > 0) {
    const pct = invoice.retention_percent / 100
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mid)
    doc.text(`Retention (${pct}%)`, totalsX, y)
    doc.setTextColor(220, 38, 38)
    doc.text(`-${formatCurrency(invoice.retention_amount)}`, totalsVal, y, { align: 'right' })
    y += 6
  }

  // Divider
  drawRule(doc, totalsX, y, totalsVal, border, 0.5)
  y += 6

  // Total Due — prominent branded block
  const totalBoxH = 12
  doc.setFillColor(...primary)
  doc.roundedRect(totalsX - 4, y - 3, totalsW + 4, totalBoxH, 2, 2, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Total Due', totalsX, y + 5)
  doc.text(formatCurrency(invoice.total), totalsVal, y + 5, { align: 'right' })
  y += totalBoxH + 10

  // ============================================================
  // NOTES
  // ============================================================
  if (invoice.notes) {
    if (y > pageHeight - 50) { doc.addPage(); y = margin }

    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...subtle)
    doc.text('NOTES', margin, y)
    y += 5
    drawRule(doc, margin, y, pageWidth - margin, border)
    y += 5

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...mid)
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth)
    noteLines.forEach(line => { doc.text(line, margin, y); y += 4.5 })
  }

  // ============================================================
  // CONTINUATION ACCENTS + FOOTERS (all pages)
  // ============================================================
  const totalPgs = doc.internal.getNumberOfPages()
  for (let i = 2; i <= totalPgs; i++) {
    doc.setPage(i)
    drawContinuationAccent(doc, { primary })
  }

  applyDocumentFooters(doc, {
    documentLabel: invoice.invoice_number
      ? `Invoice ${invoice.invoice_number}`
      : 'Invoice',
    context: { company, project },
    primary,
  })

  return doc
}

/**
 * Generate and download invoice PDF
 */
export async function downloadInvoicePDF(invoice, project, company) {
  const doc = await generateInvoicePDF(invoice, project, company)
  const safeName = (project?.name || 'Project').replace(/\s+/g, '_')
  const fileName = `Invoice_${invoice.invoice_number || 'draft'}_${project?.job_number || safeName}.pdf`
  doc.save(fileName)
  return fileName
}

/**
 * Generate invoice PDF as blob for email / preview
 */
export async function getInvoicePDFBlob(invoice, project, company) {
  const doc = await generateInvoicePDF(invoice, project, company)
  return doc.output('blob')
}
