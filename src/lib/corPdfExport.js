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

// Helper to format time (HH:MM or HH:MM:SS to 9:00am format)
const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${minutes}${ampm}`
}

// Format time period for workers
const formatTimePeriod = (worker) => {
  if (worker.time_started && worker.time_ended) {
    return `${formatTime(worker.time_started)} - ${formatTime(worker.time_ended)}`
  }
  return '-'
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
 * Pre-verify all photos in T&M tickets before export
 * Creates a manifest of verified photos and tracks failures
 * @param {Object[]} tmTickets - T&M tickets with photos
 * @returns {Promise<Object>} Photo manifest with verification status
 */
export async function verifyPhotosForExport(tmTickets) {
  if (!tmTickets || tmTickets.length === 0) {
    return { totalPhotos: 0, verified: 0, failed: 0, issues: [], manifest: [] }
  }

  const manifest = []
  let verified = 0
  let failed = 0
  const issues = []

  for (const ticket of tmTickets) {
    if (!ticket.photos || ticket.photos.length === 0) continue

    for (const photoUrl of ticket.photos) {
      const entry = {
        ticketId: ticket.id,
        workDate: ticket.work_date,
        url: photoUrl,
        verified: false,
        error: null
      }

      try {
        // Try to load the image to verify accessibility
        const imgData = await loadImageAsBase64(photoUrl)
        if (imgData) {
          entry.verified = true
          verified++
        } else {
          entry.error = 'Failed to load image'
          failed++
          issues.push({
            ticketId: ticket.id,
            workDate: ticket.work_date,
            url: photoUrl,
            error: 'Failed to load image'
          })
        }
      } catch (err) {
        entry.error = err.message || 'Unknown error'
        failed++
        issues.push({
          ticketId: ticket.id,
          workDate: ticket.work_date,
          url: photoUrl,
          error: entry.error
        })
      }

      manifest.push(entry)
    }
  }

  return {
    totalPhotos: verified + failed,
    verified,
    failed,
    issues,
    manifest,
    allVerified: failed === 0,
    verifiedAt: new Date().toISOString()
  }
}

/**
 * Create a frozen snapshot of COR data at export time for dispute purposes
 * @param {Object} cor - The COR data object
 * @param {Object[]} tmTickets - Associated T&M tickets
 * @param {Object} photoManifest - Photo verification manifest
 * @param {Object} totals - Calculated totals
 * @returns {Object} Frozen snapshot ready for database storage
 */
export function createExportSnapshot(cor, tmTickets, photoManifest, totals) {
  // Create a SHA256-like checksum from the data (simplified for client-side)
  const dataString = JSON.stringify({ cor, tmTickets, photoManifest, totals })
  let hash = 0
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const checksum = Math.abs(hash).toString(16).padStart(16, '0')

  return {
    cor_data: {
      id: cor.id,
      cor_number: cor.cor_number,
      title: cor.title,
      description: cor.description,
      status: cor.status,
      created_at: cor.created_at,
      submitted_at: cor.submitted_at,
      labor_items: cor.labor_items,
      material_items: cor.material_items,
      equipment_items: cor.equipment_items,
      gc_markup_percent: cor.gc_markup_percent,
      profit_markup_percent: cor.profit_markup_percent
    },
    tickets_data: (tmTickets || []).map(ticket => ({
      id: ticket.id,
      work_date: ticket.work_date,
      ce_pco_number: ticket.ce_pco_number,
      notes: ticket.notes,
      status: ticket.status,
      created_at: ticket.created_at,
      workers: ticket.t_and_m_workers || [],
      items: ticket.t_and_m_items || [],
      photos: ticket.photos || [],
      client_signature_name: ticket.client_signature_name,
      client_signature_date: ticket.client_signature_date
    })),
    photos_manifest: photoManifest,
    totals_snapshot: totals,
    checksum: checksum
  }
}

/**
 * Export a Change Order Request to PDF
 * @param {Object} cor - The COR data object
 * @param {Object} project - The project data
 * @param {Object} company - The company data
 * @param {Object} branding - Optional branding settings
 * @param {Object[]} tmTickets - Optional T&M tickets for backup documentation
 * @param {Object} options - Export options (verifyPhotos, createSnapshot)
 * @returns {Promise<Object>} Export result with optional snapshot and verification data
 */
export async function exportCORToPDF(cor, project, company, branding = {}, tmTickets = null, options = {}) {
  const { verifyPhotos = false, createSnapshot = false } = options

  // Photo verification (optional, for dispute-ready exports)
  let photoManifest = null
  if (verifyPhotos && tmTickets?.length > 0) {
    photoManifest = await verifyPhotosForExport(tmTickets)
  }
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
  // SIGNATURE SECTION (Dual Signatures)
  // ============================================

  if (yPos > pageHeight - 120) {
    doc.addPage()
    yPos = margin
  }

  yPos += 10
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('AUTHORIZATION', margin, yPos)
  yPos += 15

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setDrawColor(0, 0, 0)

  // Helper function to render a signature block
  const renderSignatureBlock = (startY, label, signatureData, signerName, signerTitle, signerCompany, signedDate) => {
    // Label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(label, margin, startY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    const sigLineY = startY + 20

    // Signature line
    doc.line(margin, sigLineY, margin + 70, sigLineY)
    doc.text('Signature', margin, sigLineY + 8)

    // Title/Company line
    doc.line(margin + 85, sigLineY, margin + 145, sigLineY)
    doc.text('Title / Company', margin + 85, sigLineY + 8)

    // Date line
    doc.line(pageWidth - margin - 40, sigLineY, pageWidth - margin, sigLineY)
    doc.text('Date', pageWidth - margin - 40, sigLineY + 8)

    // If signature exists, add it
    if (signatureData) {
      try {
        doc.addImage(signatureData, 'PNG', margin, sigLineY - 18, 60, 18)
        if (signerName) {
          doc.setFontSize(8)
          doc.text(signerName, margin, sigLineY + 15)
        }
        if (signerTitle || signerCompany) {
          const titleCompany = [signerTitle, signerCompany].filter(Boolean).join(' - ')
          doc.text(titleCompany, margin + 85, sigLineY - 5)
        }
        if (signedDate) {
          doc.text(formatDate(signedDate), pageWidth - margin - 40, sigLineY - 5)
        }
      } catch (e) {
        console.error('Error adding signature:', e)
      }
    } else {
      // Show "Awaiting Signature" when not yet signed
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(150, 150, 150)
      doc.text('Awaiting Signature', margin + 5, sigLineY - 5)
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
    }

    return sigLineY + 25
  }

  // GC Signature (Signature 1)
  yPos = renderSignatureBlock(
    yPos,
    'GC AUTHORIZATION',
    cor.gc_signature_data || cor.gc_signature,
    cor.gc_signature_name || cor.gc_signer_name,
    cor.gc_signature_title,
    cor.gc_signature_company,
    cor.gc_signature_date || cor.signed_at
  )

  yPos += 10

  // Client Signature (Signature 2)
  yPos = renderSignatureBlock(
    yPos,
    'CLIENT AUTHORIZATION',
    cor.client_signature_data,
    cor.client_signature_name,
    cor.client_signature_title,
    cor.client_signature_company,
    cor.client_signature_date
  )

  // ============================================
  // T&M BACKUP SECTION (if tickets provided)
  // ============================================

  if (tmTickets && tmTickets.length > 0) {
    doc.addPage()
    yPos = margin

    // Backup section header
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text('T&M BACKUP DOCUMENTATION', margin, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`${tmTickets.length} T&M ticket${tmTickets.length > 1 ? 's' : ''} associated with this COR`, margin, yPos)
    yPos += 12

    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 10

    // Render each ticket
    for (const ticket of tmTickets) {
      // Check if we need a new page
      if (yPos > pageHeight - 100) {
        doc.addPage()
        yPos = margin
      }

      // Ticket header
      doc.setFillColor(245, 247, 250)
      doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 18, 2, 2, 'F')

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(`T&M Ticket — ${formatDate(ticket.work_date)}`, margin + 5, yPos + 7)

      if (ticket.ce_pco_number) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text(`CE/PCO: ${ticket.ce_pco_number}`, margin + 5, yPos + 14)
      }

      // Status badge
      const statusColors = {
        pending: [217, 119, 6],
        approved: [5, 150, 105],
        billed: [37, 99, 235]
      }
      const statusColor = statusColors[ticket.status] || [100, 100, 100]
      doc.setFontSize(8)
      doc.setTextColor(...statusColor)
      doc.text(ticket.status?.toUpperCase() || 'PENDING', pageWidth - margin - 30, yPos + 10)

      yPos += 24

      // Description/Notes
      if (ticket.notes) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(80, 80, 80)
        const notesLines = doc.splitTextToSize(ticket.notes, pageWidth - (margin * 2) - 10)
        doc.text(notesLines, margin + 5, yPos)
        yPos += (notesLines.length * 4) + 6
      }

      // Workers table
      if (ticket.t_and_m_workers?.length > 0) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text('Labor:', margin + 5, yPos)
        yPos += 4

        autoTable(doc, {
          startY: yPos,
          head: [['Worker', 'Time', 'Class', 'Hrs', 'OT']],
          body: ticket.t_and_m_workers.map(w => [
            w.name,
            formatTimePeriod(w),
            w.role || w.labor_class || 'Laborer',
            w.hours?.toString() || '0',
            w.overtime_hours?.toString() || '-'
          ]),
          margin: { left: margin + 5, right: margin },
          headStyles: { fillColor: [100, 116, 139], textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
          bodyStyles: { fontSize: 7, cellPadding: 2 },
          theme: 'grid',
          tableWidth: 'auto'
        })

        yPos = doc.lastAutoTable.finalY + 8
      }

      // Items table (materials/equipment)
      if (ticket.t_and_m_items?.length > 0) {
        if (yPos > pageHeight - 60) {
          doc.addPage()
          yPos = margin
        }

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text('Materials/Equipment:', margin + 5, yPos)
        yPos += 4

        autoTable(doc, {
          startY: yPos,
          head: [['Item', 'Qty', 'Unit', 'Unit Cost', 'Total']],
          body: ticket.t_and_m_items.map(item => [
            item.materials_equipment?.name || item.description || 'Item',
            item.quantity?.toString() || '1',
            item.materials_equipment?.unit || 'ea',
            item.materials_equipment?.cost_per_unit ? `$${item.materials_equipment.cost_per_unit}` : '-',
            item.materials_equipment?.cost_per_unit && item.quantity
              ? `$${(item.quantity * item.materials_equipment.cost_per_unit).toFixed(2)}`
              : '-'
          ]),
          margin: { left: margin + 5, right: margin },
          headStyles: { fillColor: [100, 116, 139], textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
          bodyStyles: { fontSize: 7, cellPadding: 2 },
          theme: 'grid',
          tableWidth: 'auto'
        })

        yPos = doc.lastAutoTable.finalY + 8
      }

      // Photos
      if (ticket.photos?.length > 0) {
        if (yPos > pageHeight - 80) {
          doc.addPage()
          yPos = margin
        }

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text(`Photos (${ticket.photos.length}):`, margin + 5, yPos)
        yPos += 6

        let xPos = margin + 5
        const photoWidth = 45
        const photoHeight = 35
        const photosPerRow = 3

        for (let i = 0; i < ticket.photos.length; i++) {
          // Check if we need to wrap to next row
          if (i > 0 && i % photosPerRow === 0) {
            xPos = margin + 5
            yPos += photoHeight + 5
          }

          // Check if we need a new page
          if (yPos + photoHeight > pageHeight - 20) {
            doc.addPage()
            yPos = margin
            xPos = margin + 5
          }

          try {
            const imgData = await loadImageAsBase64(ticket.photos[i])
            if (imgData) {
              doc.addImage(imgData, 'JPEG', xPos, yPos, photoWidth, photoHeight)
            } else {
              // Draw placeholder for failed images
              doc.setFillColor(240, 240, 240)
              doc.rect(xPos, yPos, photoWidth, photoHeight, 'F')
              doc.setFontSize(7)
              doc.setTextColor(150, 150, 150)
              doc.text('Photo unavailable', xPos + 5, yPos + photoHeight / 2)
            }
          } catch (e) {
            // Draw placeholder for failed images
            doc.setFillColor(240, 240, 240)
            doc.rect(xPos, yPos, photoWidth, photoHeight, 'F')
            doc.setFontSize(7)
            doc.setTextColor(150, 150, 150)
            doc.text('Photo unavailable', xPos + 5, yPos + photoHeight / 2)
          }

          xPos += photoWidth + 5
        }

        yPos += photoHeight + 10
      }

      // Client Signature Verification Block (if ticket was signed)
      if (ticket.client_signature_data) {
        if (yPos > pageHeight - 40) {
          doc.addPage()
          yPos = margin
        }

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(16, 185, 129) // Green color
        doc.text('Client Verification', margin + 5, yPos)
        yPos += 5

        try {
          // Add signature image
          doc.addImage(ticket.client_signature_data, 'PNG', margin + 5, yPos, 40, 15)

          // Add signer info next to signature
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(0, 0, 0)

          const signerName = ticket.client_signature_name || 'Client'
          const signerTitle = ticket.client_signature_title || ''
          const signerCompany = ticket.client_signature_company || ''
          const signedDate = ticket.client_signature_date
            ? formatDate(ticket.client_signature_date)
            : ''

          doc.text(signerName, margin + 50, yPos + 5)
          if (signerTitle || signerCompany) {
            doc.setTextColor(100, 100, 100)
            doc.text(`${signerTitle}${signerTitle && signerCompany ? ', ' : ''}${signerCompany}`, margin + 50, yPos + 9)
          }
          if (signedDate) {
            doc.setTextColor(100, 100, 100)
            doc.text(`Verified: ${signedDate}`, margin + 50, yPos + 13)
          }

          yPos += 20
        } catch (e) {
          // If signature image fails, just show text
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(0, 0, 0)
          doc.text(`Verified by ${ticket.client_signature_name || 'Client'}`, margin + 5, yPos + 5)
          yPos += 10
        }
      }

      // Ticket divider
      yPos += 5
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.2)
      doc.line(margin, yPos, pageWidth - margin, yPos)
      yPos += 10
    }
  }

  // ============================================
  // FOOTER (on all pages)
  // ============================================

  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const footerY = pageHeight - 10
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, margin, footerY)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
  }

  // Save the PDF
  const fileName = `${cor.cor_number || 'COR'}_${project?.job_number || 'export'}${tmTickets?.length ? '_with_backup' : ''}.pdf`
  doc.save(fileName)

  // Build export result
  const result = {
    success: true,
    fileName,
    exportedAt: new Date().toISOString(),
    photoManifest
  }

  // Create snapshot for dispute-ready export (if requested)
  if (createSnapshot) {
    result.snapshot = createExportSnapshot(cor, tmTickets, photoManifest, totals)
  }

  return result
}
