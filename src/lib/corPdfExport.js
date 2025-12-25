import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  formatCurrency,
  formatPercent,
  centsToDollars,
  calculateCORTotals,
  formatDate,
  formatDateRange
} from './corCalculations'

// Helper to convert hex color to RGB array
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [30, 41, 59]
}

// Load image as base64
const loadImageAsBase64 = (url) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Export a Change Order Request to PDF
 * @param {Object} cor - The COR data object
 * @param {Object} project - The project data
 * @param {Object} company - The company data
 * @param {Object} branding - Optional branding settings
 * @returns {Promise<void>}
 */
export async function exportCORToPDF(cor, project, company, branding = {}) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let yPos = margin

  // Calculate totals
  const totals = calculateCORTotals(cor)

  // Colors
  const primaryColor = branding.primaryColor ? hexToRgb(branding.primaryColor) : [30, 58, 138]
  const headerBg = [241, 245, 249]

  // Load company logo if available
  let logoBase64 = null
  if (branding.logoUrl) {
    try {
      logoBase64 = await loadImageAsBase64(branding.logoUrl)
    } catch (e) {
      console.error('Error loading logo:', e)
    }
  }

  // ============================================
  // HEADER
  // ============================================

  // Company Logo or Name
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, yPos, 40, 15)
      yPos += 20
    } catch (e) {
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...primaryColor)
      doc.text(company?.name || 'Company Name', margin, yPos + 10)
      yPos += 20
    }
  } else {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text(company?.name || 'Company Name', margin, yPos + 10)
    yPos += 20
  }

  // Title
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('CHANGE ORDER REQUEST', margin, yPos)
  yPos += 10

  // COR Number and Status
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(cor.cor_number || 'COR-XXXX', margin, yPos)

  // Status badge
  const statusText = cor.status?.replace('_', ' ').toUpperCase() || 'DRAFT'
  doc.setTextColor(...primaryColor)
  doc.text(statusText, pageWidth - margin - doc.getTextWidth(statusText), yPos)
  yPos += 12

  // Divider line
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(0.5)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 10

  // ============================================
  // PROJECT & COR INFO
  // ============================================

  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)

  // Two column layout for project info
  const col1X = margin
  const col2X = pageWidth / 2

  doc.setFont('helvetica', 'bold')
  doc.text('Project:', col1X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(project?.name || 'Project Name', col1X + 25, yPos)

  doc.setFont('helvetica', 'bold')
  doc.text('Job #:', col2X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(project?.job_number || 'N/A', col2X + 25, yPos)
  yPos += 6

  doc.setFont('helvetica', 'bold')
  doc.text('Period:', col1X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDateRange(cor.period_start, cor.period_end), col1X + 25, yPos)

  doc.setFont('helvetica', 'bold')
  doc.text('Date:', col2X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(cor.created_at), col2X + 25, yPos)
  yPos += 10

  // COR Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(cor.title || 'Untitled Change Order', margin, yPos)
  yPos += 8

  // Scope of Work
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  const scopeLines = doc.splitTextToSize(cor.scope_of_work || 'No scope of work provided.', pageWidth - (margin * 2))
  doc.text(scopeLines, margin, yPos)
  yPos += (scopeLines.length * 5) + 10

  // ============================================
  // LABOR SECTION
  // ============================================

  if (cor.change_order_labor?.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('LABOR', margin, yPos)
    yPos += 6

    autoTable(doc, {
      startY: yPos,
      head: [['Class', 'Type', 'Reg Hrs', 'Reg Rate', 'OT Hrs', 'OT Rate', 'Total']],
      body: cor.change_order_labor.map(item => [
        item.labor_class,
        item.wage_type,
        item.regular_hours.toString(),
        `$${centsToDollars(item.regular_rate)}/hr`,
        item.overtime_hours?.toString() || '-',
        item.overtime_hours ? `$${centsToDollars(item.overtime_rate)}/hr` : '-',
        formatCurrency(item.total)
      ]),
      foot: [[
        { content: `Subtotal: ${formatCurrency(totals.labor_subtotal)}`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `+${formatPercent(cor.labor_markup_percent || 1500)} Markup`, colSpan: 1, styles: { halign: 'right' } },
        { content: formatCurrency(totals.labor_subtotal + totals.labor_markup_amount), styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: headerBg, textColor: [0, 0, 0], fontSize: 8 },
      theme: 'striped'
    })

    yPos = doc.lastAutoTable.finalY + 10
  }

  // ============================================
  // MATERIALS SECTION
  // ============================================

  if (cor.change_order_materials?.length > 0) {
    // Check if we need a new page
    if (yPos > pageHeight - 80) {
      doc.addPage()
      yPos = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('MATERIALS', margin, yPos)
    yPos += 6

    autoTable(doc, {
      startY: yPos,
      head: [['Description', 'Source', 'Qty', 'Unit', 'Unit Cost', 'Total']],
      body: cor.change_order_materials.map(item => [
        item.description,
        item.source_reference || item.source_type,
        item.quantity.toString(),
        item.unit,
        `$${centsToDollars(item.unit_cost)}`,
        formatCurrency(item.total)
      ]),
      foot: [[
        { content: `Subtotal: ${formatCurrency(totals.materials_subtotal)}`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `+${formatPercent(cor.materials_markup_percent || 1500)} Markup`, colSpan: 1, styles: { halign: 'right' } },
        { content: formatCurrency(totals.materials_subtotal + totals.materials_markup_amount), styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: headerBg, textColor: [0, 0, 0], fontSize: 8 },
      theme: 'striped'
    })

    yPos = doc.lastAutoTable.finalY + 10
  }

  // ============================================
  // EQUIPMENT SECTION
  // ============================================

  if (cor.change_order_equipment?.length > 0) {
    if (yPos > pageHeight - 80) {
      doc.addPage()
      yPos = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('EQUIPMENT', margin, yPos)
    yPos += 6

    autoTable(doc, {
      startY: yPos,
      head: [['Description', 'Source', 'Qty', 'Unit', 'Unit Cost', 'Total']],
      body: cor.change_order_equipment.map(item => [
        item.description,
        item.source_reference || item.source_type,
        item.quantity.toString(),
        item.unit,
        `$${centsToDollars(item.unit_cost)}`,
        formatCurrency(item.total)
      ]),
      foot: [[
        { content: `Subtotal: ${formatCurrency(totals.equipment_subtotal)}`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `+${formatPercent(cor.equipment_markup_percent || 1500)} Markup`, colSpan: 1, styles: { halign: 'right' } },
        { content: formatCurrency(totals.equipment_subtotal + totals.equipment_markup_amount), styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: headerBg, textColor: [0, 0, 0], fontSize: 8 },
      theme: 'striped'
    })

    yPos = doc.lastAutoTable.finalY + 10
  }

  // ============================================
  // SUBCONTRACTORS SECTION
  // ============================================

  if (cor.change_order_subcontractors?.length > 0) {
    if (yPos > pageHeight - 80) {
      doc.addPage()
      yPos = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text('SUBCONTRACTORS', margin, yPos)
    yPos += 6

    autoTable(doc, {
      startY: yPos,
      head: [['Company', 'Description', 'Source', 'Amount']],
      body: cor.change_order_subcontractors.map(item => [
        item.company_name,
        item.description,
        item.source_reference || item.source_type,
        formatCurrency(item.total)
      ]),
      foot: [[
        { content: `Subtotal: ${formatCurrency(totals.subcontractors_subtotal)}`, colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `+${formatPercent(cor.subcontractors_markup_percent || 500)} Markup`, colSpan: 1, styles: { halign: 'right' } },
        { content: formatCurrency(totals.subcontractors_subtotal + totals.subcontractors_markup_amount), styles: { fontStyle: 'bold' } }
      ]],
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      footStyles: { fillColor: headerBg, textColor: [0, 0, 0], fontSize: 8 },
      theme: 'striped'
    })

    yPos = doc.lastAutoTable.finalY + 10
  }

  // ============================================
  // TOTALS SECTION
  // ============================================

  if (yPos > pageHeight - 100) {
    doc.addPage()
    yPos = margin
  }

  // Totals box
  doc.setFillColor(...headerBg)
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 70, 3, 3, 'F')

  yPos += 10
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)

  const totalsCol1 = margin + 10
  const totalsCol2 = pageWidth - margin - 60

  // COR Subtotal
  doc.text('COR Subtotal:', totalsCol1, yPos)
  doc.setFont('helvetica', 'bold')
  doc.text(formatCurrency(totals.cor_subtotal), totalsCol2, yPos, { align: 'right' })
  yPos += 8

  // Additional Fees
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Liability Insurance (${formatPercent(cor.liability_insurance_percent || 144)}):`, totalsCol1, yPos)
  doc.text(formatCurrency(totals.liability_insurance_amount), totalsCol2, yPos, { align: 'right' })
  yPos += 6

  doc.text(`Bond (${formatPercent(cor.bond_percent || 100)}):`, totalsCol1, yPos)
  doc.text(formatCurrency(totals.bond_amount), totalsCol2, yPos, { align: 'right' })
  yPos += 6

  doc.text(`City License Fee (${formatPercent(cor.license_fee_percent || 10)}):`, totalsCol1, yPos)
  doc.text(formatCurrency(totals.license_fee_amount), totalsCol2, yPos, { align: 'right' })
  yPos += 10

  // Grand Total
  doc.setFillColor(...primaryColor)
  doc.roundedRect(totalsCol1 - 5, yPos - 3, pageWidth - (margin * 2) - 10, 16, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('COR TOTAL:', totalsCol1, yPos + 8)
  doc.text(formatCurrency(totals.cor_total), totalsCol2, yPos + 8, { align: 'right' })
  yPos += 25

  // ============================================
  // SIGNATURE SECTION
  // ============================================

  if (yPos > pageHeight - 80) {
    doc.addPage()
    yPos = margin
  }

  yPos += 10
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('APPROVAL', margin, yPos)
  yPos += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  // Signature line
  doc.setDrawColor(0, 0, 0)
  doc.line(margin, yPos + 15, margin + 70, yPos + 15)
  doc.text('GC Signature', margin, yPos + 22)

  doc.line(margin + 90, yPos + 15, margin + 150, yPos + 15)
  doc.text('Date', margin + 90, yPos + 22)

  // If signature exists, add it
  if (cor.gc_signature) {
    try {
      doc.addImage(cor.gc_signature, 'PNG', margin, yPos - 5, 60, 20)
      doc.text(cor.gc_signer_name || '', margin, yPos + 28)
      doc.text(formatDate(cor.signed_at), margin + 90, yPos + 10)
    } catch (e) {
      console.error('Error adding signature:', e)
    }
  }

  // ============================================
  // FOOTER
  // ============================================

  const footerY = pageHeight - 10
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, margin, footerY)
  doc.text('Page 1', pageWidth - margin, footerY, { align: 'right' })

  // Save the PDF
  const fileName = `${cor.cor_number || 'COR'}_${project?.job_number || 'export'}.pdf`
  doc.save(fileName)
}
