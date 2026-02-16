/**
 * Certified Billing Package Generator
 *
 * Generates a complete, consolidated billing package PDF containing:
 * 1. Cover sheet with project summary
 * 2. Invoice summary
 * 3. COR breakdowns with line items
 * 4. T&M ticket backup with worker hours, materials, and photos
 * 5. Signature verification chain
 *
 * Designed to produce the documentation GCs require for payment approval.
 * Uses snapshot-based approach for determinism.
 */

import { formatCurrency, formatDate, formatDateRange } from './corCalculations'
import { hexToRgb, loadImageAsBase64, loadImagesAsBase64 } from './imageUtils'

const formatTime = (timeStr) => {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${minutes}${ampm}`
}

/**
 * Generate a complete certified billing package PDF.
 *
 * @param {Object} params
 * @param {Object[]} params.cors - Approved CORs with line items
 * @param {Object[]} params.tickets - Signed T&M tickets with workers/items/photos
 * @param {Object} params.invoice - Optional invoice data
 * @param {Object} params.project - Project data
 * @param {Object} params.company - Company data
 * @param {Object} params.branding - Company branding (logo, colors)
 * @param {Object} params.billTo - GC/client billing info
 * @returns {Promise<Object>} { success, fileName, pageCount }
 */
export async function generateBillingPackage({
  cors = [],
  tickets = [],
  invoice = null,
  project,
  company,
  branding = {},
  billTo = {}
}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let yPos = margin

  const primaryColor = branding.primaryColor
    ? hexToRgb(branding.primaryColor)
    : [30, 58, 95]

  // ============================================
  // PAGE 1: COVER SHEET
  // ============================================

  // Company header
  if (branding.logoUrl) {
    try {
      const logoData = await loadImageAsBase64(branding.logoUrl)
      if (logoData) {
        doc.addImage(logoData, 'PNG', margin, yPos, 45, 17)
      }
    } catch (_e) {
      if (company?.name) {
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...primaryColor)
        doc.text(company.name, margin, yPos + 10)
      }
    }
  } else if (company?.name) {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text(company.name, margin, yPos + 10)
  }

  // Company contact info
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  let contactY = yPos
  if (company?.phone) {
    doc.text(company.phone, pageWidth - margin, contactY, { align: 'right' })
    contactY += 4
  }
  if (company?.email) {
    doc.text(company.email, pageWidth - margin, contactY, { align: 'right' })
    contactY += 4
  }

  yPos += 25

  // Decorative lines
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(1)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 2
  doc.setLineWidth(0.3)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 20

  // Title
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('CERTIFIED BILLING PACKAGE', pageWidth / 2, yPos, { align: 'center' })
  yPos += 12

  // Project name
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(project?.name || 'Project', pageWidth / 2, yPos, { align: 'center' })
  yPos += 6
  if (project?.job_number) {
    doc.setFontSize(11)
    doc.text(`Job #${project.job_number}`, pageWidth / 2, yPos, { align: 'center' })
  }
  yPos += 20

  // Summary box
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(margin, yPos, pageWidth - margin * 2, 65, 3, 3, 'FD')

  const col1 = margin + 10
  const col2 = pageWidth / 2 + 10
  let boxY = yPos + 12

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('PACKAGE CONTENTS', col1, boxY)
  doc.setDrawColor(200, 210, 220)
  doc.line(col1, boxY + 3, pageWidth - margin - 10, boxY + 3)
  boxY += 12

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.setFontSize(9)

  doc.text(`Change Orders:`, col1, boxY)
  doc.setFont('helvetica', 'bold')
  doc.text(`${cors.length}`, col1 + 40, boxY)
  doc.setFont('helvetica', 'normal')

  doc.text(`T&M Tickets:`, col2, boxY)
  doc.setFont('helvetica', 'bold')
  doc.text(`${tickets.length}`, col2 + 40, boxY)
  doc.setFont('helvetica', 'normal')
  boxY += 7

  const totalCORValue = cors.reduce((sum, c) => sum + (c.cor_total || 0), 0)
  const totalTicketValue = tickets.reduce((sum, t) => sum + ((parseFloat(t.change_order_value) || 0) * 100), 0)

  doc.text(`COR Value:`, col1, boxY)
  doc.setFont('helvetica', 'bold')
  doc.text(formatCurrency(totalCORValue), col1 + 40, boxY)
  doc.setFont('helvetica', 'normal')

  const totalPhotos = tickets.reduce((sum, t) => sum + (t.photos?.length || 0), 0)
  doc.text(`Photos:`, col2, boxY)
  doc.setFont('helvetica', 'bold')
  doc.text(`${totalPhotos}`, col2 + 40, boxY)
  doc.setFont('helvetica', 'normal')
  boxY += 7

  const verifiedTickets = tickets.filter(t => t.client_signature_data)
  doc.text(`Client Verified:`, col1, boxY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(verifiedTickets.length > 0 ? 16 : 71, verifiedTickets.length > 0 ? 185 : 85, verifiedTickets.length > 0 ? 129 : 105)
  doc.text(`${verifiedTickets.length} of ${tickets.length} tickets`, col1 + 40, boxY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  boxY += 7

  if (invoice) {
    doc.text(`Invoice:`, col1, boxY)
    doc.setFont('helvetica', 'bold')
    doc.text(`${invoice.invoice_number} — ${formatCurrency(invoice.total || 0)}`, col1 + 40, boxY)
    doc.setFont('helvetica', 'normal')
  }

  yPos += 80

  // Bill To info
  if (billTo.name || invoice?.bill_to_name) {
    const btName = billTo.name || invoice?.bill_to_name
    const btAddress = billTo.address || invoice?.bill_to_address
    const btContact = billTo.contact || invoice?.bill_to_contact

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(120, 120, 120)
    doc.text('SUBMITTED TO:', margin, yPos)
    yPos += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    if (btName) { doc.text(btName, margin, yPos); yPos += 5 }
    if (btAddress) { doc.text(btAddress, margin, yPos); yPos += 5 }
    if (btContact) { doc.text(btContact, margin, yPos); yPos += 5 }
  }

  // Generation date and document ID
  yPos = pageHeight - 40
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  const genDate = new Date()
  doc.text(`Generated: ${genDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${genDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`, margin, yPos)
  yPos += 5
  const docId = crypto.randomUUID().substring(0, 16).toUpperCase()
  doc.text(`Document ID: ${docId}`, margin, yPos)

  // ============================================
  // COR DETAIL PAGES
  // ============================================

  for (const cor of cors) {
    doc.addPage()
    yPos = margin

    // COR header
    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos, pageWidth - margin * 2, 14, 'F')
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(`${cor.cor_number || 'COR'} — ${cor.title || 'Untitled'}`, margin + 5, yPos + 9)
    yPos += 20

    // COR meta
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    if (cor.period_start || cor.period_end) {
      doc.text(`Period: ${formatDateRange(cor.period_start, cor.period_end)}`, margin, yPos)
      yPos += 5
    }
    if (cor.scope_of_work) {
      doc.setFont('helvetica', 'bold')
      doc.text('Scope:', margin, yPos)
      doc.setFont('helvetica', 'normal')
      const scopeLines = doc.splitTextToSize(cor.scope_of_work, pageWidth - margin * 2 - 15)
      doc.text(scopeLines, margin + 15, yPos)
      yPos += scopeLines.length * 4 + 5
    }

    // Labor table
    if (cor.change_order_labor?.length > 0) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text('Labor', margin, yPos)
      yPos += 4

      autoTable(doc, {
        startY: yPos,
        head: [['Class', 'Wage Type', 'Reg Hrs', 'Reg Rate', 'OT Hrs', 'OT Rate', 'Total']],
        body: cor.change_order_labor.map(item => [
          item.labor_class || item.description,
          item.wage_type || 'Standard',
          item.regular_hours?.toString() || '0',
          formatCurrency(item.regular_rate),
          item.overtime_hours?.toString() || '0',
          formatCurrency(item.overtime_rate),
          formatCurrency(item.total)
        ]),
        margin: { left: margin, right: margin },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        theme: 'grid'
      })
      yPos = doc.lastAutoTable.finalY + 8
    }

    // Materials table
    if (cor.change_order_materials?.length > 0) {
      if (yPos > pageHeight - 50) { doc.addPage(); yPos = margin }
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text('Materials', margin, yPos)
      yPos += 4

      autoTable(doc, {
        startY: yPos,
        head: [['Description', 'Source', 'Qty', 'Unit Cost', 'Total']],
        body: cor.change_order_materials.map(item => [
          item.description,
          item.source_reference || '-',
          item.quantity?.toString() || '1',
          formatCurrency(item.unit_cost),
          formatCurrency(item.total)
        ]),
        margin: { left: margin, right: margin },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        theme: 'grid'
      })
      yPos = doc.lastAutoTable.finalY + 8
    }

    // Equipment table
    if (cor.change_order_equipment?.length > 0) {
      if (yPos > pageHeight - 50) { doc.addPage(); yPos = margin }
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text('Equipment', margin, yPos)
      yPos += 4

      autoTable(doc, {
        startY: yPos,
        head: [['Description', 'Qty', 'Unit Cost', 'Total']],
        body: cor.change_order_equipment.map(item => [
          item.description,
          item.quantity?.toString() || '1',
          formatCurrency(item.unit_cost),
          formatCurrency(item.total)
        ]),
        margin: { left: margin, right: margin },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        theme: 'grid'
      })
      yPos = doc.lastAutoTable.finalY + 8
    }

    // Subcontractors table
    if (cor.change_order_subcontractors?.length > 0) {
      if (yPos > pageHeight - 50) { doc.addPage(); yPos = margin }
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text('Subcontractors', margin, yPos)
      yPos += 4

      autoTable(doc, {
        startY: yPos,
        head: [['Company', 'Description', 'Total']],
        body: cor.change_order_subcontractors.map(item => [
          item.company_name || '-',
          item.description,
          formatCurrency(item.total)
        ]),
        margin: { left: margin, right: margin },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
        bodyStyles: { fontSize: 7, cellPadding: 2 },
        theme: 'grid'
      })
      yPos = doc.lastAutoTable.finalY + 8
    }

    // COR Total bar
    if (yPos > pageHeight - 30) { doc.addPage(); yPos = margin }
    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos, pageWidth - margin * 2, 10, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('COR TOTAL:', margin + 5, yPos + 7)
    doc.text(formatCurrency(cor.cor_total), pageWidth - margin - 5, yPos + 7, { align: 'right' })
    yPos += 15

    // Signature verification
    if (cor.gc_signature_data || cor.client_signature_data) {
      if (yPos > pageHeight - 30) { doc.addPage(); yPos = margin }

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(16, 185, 129)
      doc.text('SIGNATURES', margin, yPos)
      yPos += 5

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(71, 85, 105)
      if (cor.gc_signature_name) {
        doc.text(`GC: ${cor.gc_signature_name} — ${formatDate(cor.gc_signature_date)}`, margin, yPos)
        yPos += 4
      }
      if (cor.client_signature_name) {
        doc.text(`Client: ${cor.client_signature_name} — ${formatDate(cor.client_signature_date)}`, margin, yPos)
        yPos += 4
      }
    }
  }

  // ============================================
  // T&M TICKET BACKUP PAGES
  // ============================================

  if (tickets.length > 0) {
    doc.addPage()
    yPos = margin

    // Section title page
    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(0.8)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 15

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('T&M TICKET BACKUP', pageWidth / 2, yPos, { align: 'center' })
    yPos += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(`${tickets.length} tickets | ${totalPhotos} photos | ${verifiedTickets.length} client verified`, pageWidth / 2, yPos, { align: 'center' })
    yPos += 15

    // Summary table of all tickets
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'CE/PCO', 'Workers', 'Hours', 'Photos', 'Verified']],
      body: tickets.map(t => {
        const workers = t.t_and_m_workers || []
        const totalHrs = workers.reduce((s, w) => s + (parseFloat(w.hours) || 0) + (parseFloat(w.overtime_hours) || 0), 0)
        return [
          formatDate(t.work_date || t.ticket_date),
          t.ce_pco_number || '-',
          workers.length.toString(),
          totalHrs.toFixed(1),
          (t.photos?.length || 0).toString(),
          t.client_signature_data ? 'Yes' : 'No'
        ]
      }),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      theme: 'grid'
    })

    // Individual ticket detail pages
    for (const ticket of tickets) {
      doc.addPage()
      yPos = margin

      const hasVerification = !!ticket.client_signature_data
      const statusColor = hasVerification ? [16, 185, 129] : [245, 158, 11]

      // Ticket header
      doc.setFillColor(...statusColor)
      doc.rect(margin, yPos, 4, 18, 'F')
      doc.setFillColor(248, 250, 252)
      doc.rect(margin + 4, yPos, pageWidth - margin * 2 - 4, 18, 'F')

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text(`T&M TICKET — ${formatDate(ticket.work_date || ticket.ticket_date)}`, margin + 10, yPos + 7)

      if (ticket.ce_pco_number) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(59, 130, 246)
        doc.text(`CE/PCO: ${ticket.ce_pco_number}`, margin + 10, yPos + 14)
      }

      if (hasVerification) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(16, 185, 129)
        doc.text('CLIENT VERIFIED', pageWidth - margin - 30, yPos + 10)
      }

      yPos += 24

      // Description
      if (ticket.notes) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('DESCRIPTION', margin, yPos)
        yPos += 5
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(51, 65, 85)
        const notesLines = doc.splitTextToSize(ticket.notes, pageWidth - margin * 2)
        doc.text(notesLines, margin, yPos)
        yPos += notesLines.length * 4 + 6
      }

      // Workers table
      if (ticket.t_and_m_workers?.length > 0) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('LABOR', margin, yPos)
        yPos += 4

        autoTable(doc, {
          startY: yPos,
          head: [['Worker', 'Class', 'Reg Hrs', 'OT Hrs', 'Time In', 'Time Out']],
          body: ticket.t_and_m_workers.map(w => [
            w.name,
            w.role || w.labor_class || 'Laborer',
            w.hours?.toString() || '0',
            w.overtime_hours?.toString() || '-',
            formatTime(w.time_started),
            formatTime(w.time_ended)
          ]),
          margin: { left: margin, right: margin },
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
          bodyStyles: { fontSize: 7, cellPadding: 2 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'grid'
        })
        yPos = doc.lastAutoTable.finalY + 8
      }

      // Materials/Equipment
      if (ticket.t_and_m_items?.length > 0) {
        if (yPos > pageHeight - 50) { doc.addPage(); yPos = margin }
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text('MATERIALS / EQUIPMENT', margin, yPos)
        yPos += 4

        autoTable(doc, {
          startY: yPos,
          head: [['Item', 'Qty', 'Unit']],
          body: ticket.t_and_m_items.map(item => [
            item.custom_name || item.materials_equipment?.name || item.description || 'Item',
            item.quantity?.toString() || '1',
            item.materials_equipment?.unit || item.unit || 'ea'
          ]),
          margin: { left: margin, right: margin },
          headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 7, cellPadding: 2 },
          bodyStyles: { fontSize: 7, cellPadding: 2 },
          theme: 'grid'
        })
        yPos = doc.lastAutoTable.finalY + 8
      }

      // Photos
      if (ticket.photos?.length > 0) {
        if (yPos > pageHeight - 70) { doc.addPage(); yPos = margin }

        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(71, 85, 105)
        doc.text(`PHOTO EVIDENCE (${ticket.photos.length})`, margin, yPos)
        yPos += 6

        const photoImages = await loadImagesAsBase64(ticket.photos)
        let xPos = margin
        const photoWidth = 55
        const photoHeight = 45
        const photoGap = 5

        for (let i = 0; i < ticket.photos.length; i++) {
          if (i > 0 && i % 3 === 0) {
            xPos = margin
            yPos += photoHeight + photoGap + 2
          }
          if (yPos + photoHeight > pageHeight - 15) {
            doc.addPage()
            yPos = margin
            xPos = margin
          }

          const imgData = photoImages[i]
          if (imgData) {
            doc.setDrawColor(200, 200, 200)
            doc.rect(xPos - 0.5, yPos - 0.5, photoWidth + 1, photoHeight + 1, 'S')
            doc.addImage(imgData, 'JPEG', xPos, yPos, photoWidth, photoHeight)
          } else {
            doc.setFillColor(245, 245, 245)
            doc.rect(xPos, yPos, photoWidth, photoHeight, 'F')
            doc.setFontSize(7)
            doc.setTextColor(150, 150, 150)
            doc.text('Photo unavailable', xPos + 8, yPos + photoHeight / 2)
          }
          xPos += photoWidth + photoGap
        }
        yPos += photoHeight + 10
      }

      // Signature verification block
      if (ticket.client_signature_data) {
        if (yPos > pageHeight - 35) { doc.addPage(); yPos = margin }

        doc.setFillColor(240, 253, 244)
        doc.roundedRect(margin, yPos, pageWidth - margin * 2, 25, 3, 3, 'F')
        doc.setFillColor(16, 185, 129)
        doc.rect(margin, yPos, 4, 25, 'F')

        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(16, 185, 129)
        doc.text('CLIENT VERIFIED', margin + 10, yPos + 8)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(71, 85, 105)
        const signerInfo = [
          ticket.client_signature_name,
          ticket.client_signature_title,
          ticket.client_signature_company
        ].filter(Boolean).join(', ')
        doc.text(signerInfo, margin + 10, yPos + 15)
        if (ticket.client_signature_date) {
          doc.text(`Signed: ${formatDate(ticket.client_signature_date)}`, margin + 10, yPos + 21)
        }

        try {
          doc.addImage(ticket.client_signature_data, 'PNG', pageWidth - margin - 55, yPos + 3, 50, 19)
        } catch (_e) {
          // Signature image failed to load - text info is sufficient
        }
      }
    }
  }

  // ============================================
  // FOOTER ON ALL PAGES
  // ============================================

  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const footerY = pageHeight - 8
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`${project?.name || 'Project'} — Billing Package`, margin, footerY)
    doc.setTextColor(180, 180, 180)
    doc.text('Generated with FieldSync', pageWidth / 2, footerY, { align: 'center' })
    doc.setTextColor(150, 150, 150)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
  }

  // ============================================
  // SAVE
  // ============================================

  const dateSuffix = new Date().toISOString().split('T')[0]
  const fileName = `Billing_Package_${project?.job_number || project?.name?.replace(/\s+/g, '_') || 'export'}_${dateSuffix}.pdf`
  doc.save(fileName)

  return {
    success: true,
    fileName,
    pageCount: totalPages,
    documentId: docId,
    summary: {
      corCount: cors.length,
      ticketCount: tickets.length,
      photoCount: totalPhotos,
      verifiedCount: verifiedTickets.length,
      totalCORValue: totalCORValue,
      totalTicketValue: totalTicketValue
    }
  }
}

export default { generateBillingPackage }
