/**
 * Invoice PDF Generator
 *
 * Generates professional invoice PDFs with company branding.
 * Uses jsPDF with autoTable plugin for consistent formatting.
 */

import { formatCurrency } from './corCalculations'

/**
 * Generate an invoice PDF
 *
 * @param {Object} invoice - Invoice data with items
 * @param {Object} project - Project data
 * @param {Object} company - Company data with branding
 * @returns {Promise<jsPDF>} The generated PDF document
 */
export async function generateInvoicePDF(invoice, project, company) {
  // Dynamic imports for code splitting
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF('portrait')
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 20

  // Colors
  const primaryColor = [33, 33, 33] // Dark gray
  const accentColor = [59, 130, 246] // Blue
  const lightGray = [156, 163, 175]
  const borderColor = [229, 231, 235]

  let yPos = margin

  // ============================================
  // HEADER: Company Info & Logo
  // ============================================

  // Company name
  doc.setFontSize(18)
  doc.setFont(undefined, 'bold')
  doc.setTextColor(...primaryColor)
  doc.text(company?.name || 'Company Name', margin, yPos)

  // Company details (right-aligned)
  doc.setFontSize(9)
  doc.setFont(undefined, 'normal')
  doc.setTextColor(...lightGray)
  const companyDetails = []
  if (company?.phone) companyDetails.push(company.phone)
  if (company?.email) companyDetails.push(company.email)
  if (company?.address) companyDetails.push(company.address)

  let rightY = yPos
  companyDetails.forEach(detail => {
    doc.text(detail, pageWidth - margin, rightY, { align: 'right' })
    rightY += 4
  })

  yPos += 15

  // INVOICE title
  doc.setFontSize(28)
  doc.setFont(undefined, 'bold')
  doc.setTextColor(...accentColor)
  doc.text('INVOICE', margin, yPos)

  yPos += 15

  // ============================================
  // INVOICE DETAILS
  // ============================================

  // Invoice number, date, due date - left side
  doc.setFontSize(10)
  doc.setFont(undefined, 'normal')
  doc.setTextColor(...primaryColor)

  const detailsLeft = [
    ['Invoice #:', invoice.invoice_number],
    ['Invoice Date:', formatDate(invoice.invoice_date)],
    ['Due Date:', invoice.due_date ? formatDate(invoice.due_date) : 'Upon Receipt'],
    ['Terms:', invoice.terms || 'Net 30']
  ]

  let leftY = yPos
  detailsLeft.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold')
    doc.text(label, margin, leftY)
    doc.setFont(undefined, 'normal')
    doc.text(value, margin + 30, leftY)
    leftY += 5
  })

  // Bill To - right side
  const billToX = pageWidth / 2
  doc.setFont(undefined, 'bold')
  doc.setTextColor(...lightGray)
  doc.text('BILL TO', billToX, yPos)

  doc.setFont(undefined, 'normal')
  doc.setTextColor(...primaryColor)
  let billY = yPos + 5
  if (invoice.bill_to_name) {
    doc.text(invoice.bill_to_name, billToX, billY)
    billY += 4
  }
  if (invoice.bill_to_address) {
    // Split address if too long
    const addressLines = doc.splitTextToSize(invoice.bill_to_address, 80)
    addressLines.forEach(line => {
      doc.text(line, billToX, billY)
      billY += 4
    })
  }
  if (invoice.bill_to_contact) {
    doc.text(invoice.bill_to_contact, billToX, billY)
  }

  yPos = Math.max(leftY, billY) + 10

  // Project info
  doc.setFontSize(9)
  doc.setTextColor(...lightGray)
  doc.text(`Project: ${project.name}${project.job_number ? ` (Job #${project.job_number})` : ''}`, margin, yPos)

  yPos += 10

  // ============================================
  // LINE ITEMS TABLE
  // ============================================

  const tableData = (invoice.invoice_items || []).map((item, index) => [
    index + 1,
    item.reference_number || '-',
    item.description,
    formatCurrency(item.amount)
  ])

  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Ref', 'Description', 'Amount']],
    body: tableData,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: primaryColor,
      lineColor: borderColor,
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [249, 250, 251],
      textColor: primaryColor,
      fontStyle: 'bold',
      lineWidth: { bottom: 0.5 },
      lineColor: borderColor
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 25 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 30, halign: 'right' }
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255]
    },
    margin: { left: margin, right: margin }
  })

  yPos = doc.lastAutoTable.finalY + 10

  // ============================================
  // TOTALS SECTION
  // ============================================

  const totalsX = pageWidth - margin - 80
  const totalsValueX = pageWidth - margin

  // Subtotal
  doc.setFontSize(10)
  doc.setFont(undefined, 'normal')
  doc.setTextColor(...primaryColor)
  doc.text('Subtotal', totalsX, yPos)
  doc.text(formatCurrency(invoice.subtotal), totalsValueX, yPos, { align: 'right' })
  yPos += 6

  // Retention (if applicable)
  if (invoice.retention_percent > 0) {
    const retentionPct = invoice.retention_percent / 100 // Convert from basis points
    doc.text(`Retention (${retentionPct}%)`, totalsX, yPos)
    doc.setTextColor(220, 38, 38) // Red
    doc.text(`-${formatCurrency(invoice.retention_amount)}`, totalsValueX, yPos, { align: 'right' })
    doc.setTextColor(...primaryColor)
    yPos += 6
  }

  // Divider line
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(0.5)
  doc.line(totalsX - 5, yPos, totalsValueX, yPos)
  yPos += 6

  // Total Due
  doc.setFontSize(12)
  doc.setFont(undefined, 'bold')
  doc.text('Total Due', totalsX, yPos)
  doc.setTextColor(...accentColor)
  doc.text(formatCurrency(invoice.total), totalsValueX, yPos, { align: 'right' })

  yPos += 15

  // ============================================
  // NOTES & PAYMENT INFO
  // ============================================

  if (invoice.notes) {
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.setTextColor(...lightGray)
    doc.text('Notes:', margin, yPos)
    yPos += 5

    doc.setFont(undefined, 'normal')
    doc.setTextColor(...primaryColor)
    const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2)
    noteLines.forEach(line => {
      doc.text(line, margin, yPos)
      yPos += 4
    })
  }

  // ============================================
  // FOOTER
  // ============================================

  const footerY = pageHeight - 15
  doc.setFontSize(8)
  doc.setTextColor(...lightGray)
  doc.text(
    `Invoice ${invoice.invoice_number} | Generated ${new Date().toLocaleDateString()}`,
    margin,
    footerY
  )
  doc.setTextColor(180, 180, 180)
  doc.text('Generated with FieldSync', pageWidth / 2, footerY, { align: 'center' })
  doc.setTextColor(...lightGray)
  doc.text(`Page 1 of 1`, pageWidth - margin, footerY, { align: 'right' })

  return doc
}

/**
 * Generate and download invoice PDF
 */
export async function downloadInvoicePDF(invoice, project, company) {
  const doc = await generateInvoicePDF(invoice, project, company)
  const fileName = `Invoice_${invoice.invoice_number}_${project.job_number || project.name.replace(/\s+/g, '_')}.pdf`
  doc.save(fileName)
  return fileName
}

/**
 * Generate invoice PDF as blob for email/preview
 */
export async function getInvoicePDFBlob(invoice, project, company) {
  const doc = await generateInvoicePDF(invoice, project, company)
  return doc.output('blob')
}

// Helper function to format date
function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}
