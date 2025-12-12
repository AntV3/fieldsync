import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

/**
 * Export T&M Ticket as PDF
 * Professional formatted PDF for construction T&M tickets
 */

export async function exportTMTicketPDF(ticket, project, company, workers, items) {
  const doc = new jsPDF()

  // Page dimensions
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 15
  let yPos = margin

  // ================================================
  // HEADER SECTION
  // ================================================

  // Company Name (if logo not available)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(company?.name || 'Company Name', margin, yPos)
  yPos += 10

  // Document Title
  doc.setFontSize(16)
  doc.setTextColor(66, 153, 225) // Blue
  doc.text('TIME & MATERIALS TICKET', pageWidth / 2, yPos, { align: 'center' })
  yPos += 12

  // Ticket Number (Large and prominent)
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.text(`Ticket #${ticket.ticket_number || 'N/A'}`, pageWidth - margin, yPos, { align: 'right' })
  yPos += 10

  // Divider line
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 8

  // ================================================
  // TICKET INFORMATION SECTION
  // ================================================

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  // Two columns layout
  const col1X = margin
  const col2X = pageWidth / 2 + 10

  // Left column
  doc.setFont('helvetica', 'bold')
  doc.text('Project:', col1X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(project?.name || 'N/A', col1X + 20, yPos)

  // Right column
  doc.setFont('helvetica', 'bold')
  doc.text('Work Date:', col2X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(ticket.work_date), col2X + 25, yPos)
  yPos += 6

  // Status
  doc.setFont('helvetica', 'bold')
  doc.text('Status:', col1X, yPos)
  doc.setFont('helvetica', 'normal')
  const statusText = ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)
  doc.text(statusText, col1X + 20, yPos)

  // CE/PCO Number (if exists)
  if (ticket.ce_pco_number) {
    doc.setFont('helvetica', 'bold')
    doc.text('CE/PCO #:', col2X, yPos)
    doc.setFont('helvetica', 'normal')
    doc.text(ticket.ce_pco_number, col2X + 25, yPos)
  }
  yPos += 6

  // Created By
  doc.setFont('helvetica', 'bold')
  doc.text('Created By:', col1X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(ticket.created_by_name || 'N/A', col1X + 25, yPos)

  // Created Date
  doc.setFont('helvetica', 'bold')
  doc.text('Created:', col2X, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDateTime(ticket.created_at), col2X + 20, yPos)
  yPos += 10

  // ================================================
  // LABOR SECTION
  // ================================================

  if (workers && workers.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('LABOR', margin, yPos)
    yPos += 6

    // Workers table
    const workerData = workers.map(worker => [
      worker.name,
      worker.role || 'N/A',
      worker.time_started || 'N/A',
      worker.time_ended || 'N/A',
      worker.hours?.toFixed(2) || '0.00',
      worker.overtime_hours?.toFixed(2) || '0.00',
      (worker.hours + (worker.overtime_hours || 0)).toFixed(2)
    ])

    doc.autoTable({
      startY: yPos,
      head: [['Worker Name', 'Role', 'Start Time', 'End Time', 'Reg Hours', 'OT Hours', 'Total Hours']],
      body: workerData,
      theme: 'grid',
      headStyles: {
        fillColor: [66, 153, 225],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 9
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 20 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 23, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    })

    yPos = doc.lastAutoTable.finalY + 6

    // Labor totals
    const totalRegHours = workers.reduce((sum, w) => sum + (w.hours || 0), 0)
    const totalOTHours = workers.reduce((sum, w) => sum + (w.overtime_hours || 0), 0)
    const totalHours = totalRegHours + totalOTHours

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total Labor Hours: ${totalHours.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' })
    doc.text(`(Regular: ${totalRegHours.toFixed(2)}, Overtime: ${totalOTHours.toFixed(2)})`,
      pageWidth - margin, yPos + 5, { align: 'right' })
    yPos += 12

    // Labor costs (if project has rates)
    if (project && (project.laborer_rate || project.operator_rate || project.foreman_rate)) {
      const rates = {
        laborer: parseFloat(project.laborer_rate) || 0,
        operator: parseFloat(project.operator_rate) || 0,
        foreman: parseFloat(project.foreman_rate) || 0
      }

      const costBreakdown = {
        laborer: { hours: 0, cost: 0 },
        operator: { hours: 0, cost: 0 },
        foreman: { hours: 0, cost: 0 }
      }

      workers.forEach(worker => {
        const hours = parseFloat(worker.total_hours) || parseFloat(worker.hours) || 0
        const role = worker.role
        if (costBreakdown[role]) {
          costBreakdown[role].hours += hours
          costBreakdown[role].cost += hours * rates[role]
        }
      })

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Labor Costs:', margin, yPos)
      yPos += 6

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      let totalLaborCost = 0

      Object.entries(costBreakdown).forEach(([role, data]) => {
        if (data.hours > 0) {
          const costText = `${role.charAt(0).toUpperCase() + role.slice(1)}: ${data.hours.toFixed(2)} hrs × $${rates[role].toFixed(2)}/hr = $${data.cost.toFixed(2)}`
          doc.text(costText, margin + 5, yPos)
          yPos += 5
          totalLaborCost += data.cost
        }
      })

      doc.setFont('helvetica', 'bold')
      doc.text(`Total Labor Cost: $${totalLaborCost.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' })
      yPos += 10
    }
  }

  // ================================================
  // MATERIALS & EQUIPMENT SECTION
  // ================================================

  if (items && items.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('MATERIALS & EQUIPMENT', margin, yPos)
    yPos += 6

    // Items table
    const itemData = items.map(item => [
      item.custom_name || item.name || 'N/A',
      item.custom_category || item.category || 'N/A',
      item.quantity?.toFixed(2) || '0.00',
      item.unit || 'EA'
    ])

    doc.autoTable({
      startY: yPos,
      head: [['Item', 'Category', 'Quantity', 'Unit']],
      body: itemData,
      theme: 'grid',
      headStyles: {
        fillColor: [66, 153, 225],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 9
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 20, halign: 'center' }
      },
      margin: { left: margin, right: margin }
    })

    yPos = doc.lastAutoTable.finalY + 10
  }

  // ================================================
  // NOTES SECTION
  // ================================================

  if (ticket.notes) {
    // Check if we need a new page
    if (yPos > pageHeight - 60) {
      doc.addPage()
      yPos = margin
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('NOTES', margin, yPos)
    yPos += 6

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const notesLines = doc.splitTextToSize(ticket.notes, pageWidth - 2 * margin)
    doc.text(notesLines, margin, yPos)
    yPos += (notesLines.length * 5) + 10
  }

  // ================================================
  // PHOTOS SECTION
  // ================================================

  const photos = ticket.photos || []
  if (photos.length > 0) {
    // Check if we need a new page
    if (yPos > pageHeight - 60) {
      doc.addPage()
      yPos = margin
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`PHOTOS (${photos.length})`, margin, yPos)
    yPos += 6

    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.text('Photos are available in the online ticket viewer.', margin, yPos)
    yPos += 10
  }

  // ================================================
  // APPROVAL SECTION
  // ================================================

  // Check if we need a new page for signature
  if (yPos > pageHeight - 50) {
    doc.addPage()
    yPos = margin
  }

  doc.setDrawColor(200, 200, 200)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('APPROVAL', margin, yPos)
  yPos += 8

  // Client signature if present
  if (ticket.client_signature_data) {
    doc.setFont('helvetica', 'normal')
    doc.text(`Signed By: ${ticket.client_signer_name}`, margin, yPos)
    yPos += 5
    doc.text(`Signed On: ${formatDateTime(ticket.client_signature_date)}`, margin, yPos)
    yPos += 8

    // Add signature image
    try {
      // Check if we have enough space for the signature
      if (yPos > pageHeight - 50) {
        doc.addPage()
        yPos = margin
      }

      doc.addImage(ticket.client_signature_data, 'PNG', margin, yPos, 80, 30)
      yPos += 35
    } catch (error) {
      console.error('Error adding signature to PDF:', error)
      doc.text('(Signature image not available)', margin, yPos)
      yPos += 10
    }
  } else if (ticket.status === 'approved' && ticket.approved_by_name) {
    // Fallback to old approval system
    doc.setFont('helvetica', 'normal')
    doc.text(`Approved By: ${ticket.approved_by_name}`, margin, yPos)
    yPos += 5
    doc.text(`Approved On: ${formatDateTime(ticket.approved_at)}`, margin, yPos)
    yPos += 10
  } else {
    // Signature line if not approved
    doc.setFont('helvetica', 'normal')
    doc.text('Signature: ____________________________________', margin, yPos)
    yPos += 8
    doc.text('Name: __________________', margin, yPos)
    yPos += 8
    doc.text('Date: __________________', margin, yPos)
    yPos += 10
  }

  // ================================================
  // FOOTER
  // ================================================

  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  doc.setFont('helvetica', 'italic')
  const footerText = `Generated by FieldSync on ${formatDateTime(new Date())}`
  doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' })

  doc.setTextColor(0, 0, 0) // Reset color

  // ================================================
  // SAVE PDF
  // ================================================

  const fileName = `TM-Ticket-${ticket.ticket_number}-${project?.name?.replace(/[^a-z0-9]/gi, '-')}.pdf`
  doc.save(fileName)

  return fileName
}

// Helper function to format date
function formatDate(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Helper function to format date and time
function formatDateTime(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}
