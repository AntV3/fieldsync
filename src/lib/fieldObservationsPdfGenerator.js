// ============================================
// Field Observations PDF Generator
// ============================================
// Produces a branded, professional PDF of field observations
// (photos + description + timestamp) suitable for billing
// backup on unit-priced work or any project that needs a
// chronological record of on-site activity.
// ============================================

import { hexToRgb, loadImageAsBase64, loadImagesAsBase64 } from './imageUtils'

const formatDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const formatDateTime = (iso) => {
  if (!iso) return '—'
  return `${formatDate(iso)} at ${formatTime(iso)}`
}

/**
 * Generate a PDF of field observations.
 *
 * @param {Array} observations - sorted chronologically (any order accepted; we re-sort ascending)
 * @param {Object} context - { project, company, branding, dateRange }
 */
export async function generateFieldObservationsPDF(observations, context = {}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { project, company, branding = {}, dateRange = {} } = context

  // Resolve signed URLs for every photo up front (batch-friendly)
  const allPhotoPaths = observations.flatMap(o => o.photos || [])
  let resolvedUrls = allPhotoPaths
  try {
    const { db } = await import('./supabase')
    resolvedUrls = await db.resolvePhotoUrls(allPhotoPaths)
  } catch { /* fall back to raw */ }
  const pathToUrl = {}
  allPhotoPaths.forEach((path, i) => { pathToUrl[path] = resolvedUrls[i] })

  const doc = new jsPDF('p', 'mm', 'letter')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18
  let yPos = margin

  const primaryColor = branding.primaryColor
    ? hexToRgb(branding.primaryColor)
    : [30, 58, 95]

  // Sort ascending so the log reads as a timeline
  const sorted = [...observations].sort((a, b) =>
    new Date(a.observed_at) - new Date(b.observed_at)
  )

  // ============================================
  // COVER PAGE
  // ============================================

  // Top accent bar
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageWidth, 3, 'F')
  yPos = 14

  // Logo or company name
  if (branding.logoUrl) {
    try {
      const logoData = await loadImageAsBase64(branding.logoUrl)
      if (logoData) {
        doc.addImage(logoData, 'PNG', margin, yPos, 40, 15)
      } else if (company?.name) {
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...primaryColor)
        doc.text(company.name, margin, yPos + 10)
      }
    } catch {
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

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('FIELD OBSERVATIONS', pageWidth - margin, yPos + 7, { align: 'right' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text('Project Backup Documentation', pageWidth - margin, yPos + 13, { align: 'right' })

  yPos += 24

  // Separator lines
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(0.8)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 2
  doc.setLineWidth(0.2)
  doc.setDrawColor(200, 210, 220)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 10

  // Project info
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text(project?.name || 'Project', margin, yPos)
  yPos += 7

  doc.setFontSize(9.5)
  const infoCol2X = margin + 80

  if (project?.job_number) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Job #:', margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    doc.text(project.job_number, margin + 18, yPos)
  }
  if (project?.address) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Address:', infoCol2X, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    doc.text(project.address, infoCol2X + 18, yPos)
  }
  yPos += 6

  // Date range
  const rangeStart = dateRange.start || (sorted[0]?.observed_at)
  const rangeEnd = dateRange.end || (sorted[sorted.length - 1]?.observed_at)
  if (rangeStart || rangeEnd) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Period:', margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    const rangeText = `${formatDate(rangeStart)} — ${formatDate(rangeEnd)}`
    doc.text(rangeText, margin + 18, yPos)
    yPos += 6
  }

  yPos += 4

  // Summary card
  const uniqueDays = new Set(sorted.map(o => o.observation_date)).size
  const totalPhotos = sorted.reduce((s, o) => s + (o.photos?.length || 0), 0)
  const foremen = [...new Set(sorted.map(o => o.foreman_name).filter(Boolean))]

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(margin, yPos, pageWidth - margin * 2, 34, 3, 3, 'FD')
  doc.setFillColor(...primaryColor)
  doc.rect(margin, yPos, 3, 34, 'F')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 116, 139)
  doc.text('SUMMARY', margin + 8, yPos + 8)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(51, 65, 85)

  const sumCol1 = margin + 8
  const sumCol2 = margin + 70
  let sumY = yPos + 15

  doc.setFont('helvetica', 'bold'); doc.text('Observations:', sumCol1, sumY)
  doc.setFont('helvetica', 'normal'); doc.text(String(sorted.length), sumCol1 + 28, sumY)

  doc.setFont('helvetica', 'bold'); doc.text('Days Logged:', sumCol2, sumY)
  doc.setFont('helvetica', 'normal'); doc.text(String(uniqueDays), sumCol2 + 28, sumY)

  sumY += 6
  doc.setFont('helvetica', 'bold'); doc.text('Photos:', sumCol1, sumY)
  doc.setFont('helvetica', 'normal'); doc.text(String(totalPhotos), sumCol1 + 28, sumY)

  if (foremen.length > 0) {
    doc.setFont('helvetica', 'bold'); doc.text('Recorded by:', sumCol2, sumY)
    doc.setFont('helvetica', 'normal')
    const foremenText = foremen.length > 3
      ? `${foremen.slice(0, 3).join(', ')} +${foremen.length - 3}`
      : foremen.join(', ')
    doc.text(foremenText, sumCol2 + 28, sumY)
  }

  yPos += 40

  // Generated footer on cover
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  const now = new Date()
  doc.text(
    `Generated: ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    margin, yPos
  )
  yPos += 10

  // ============================================
  // CHRONOLOGICAL LOG TABLE (quick reference)
  // ============================================

  if (sorted.length > 0) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = margin + 5 }

    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos - 1, pageWidth - margin * 2, 8, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text('Log Summary', margin + 4, yPos + 4.5)
    yPos += 12

    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Date', 'Time', 'Location', 'Photos', 'Description']],
      body: sorted.map((o, i) => [
        String(i + 1),
        formatDate(o.observed_at),
        formatTime(o.observed_at),
        o.location || '—',
        o.photos?.length ? String(o.photos.length) : '—',
        o.description || ''
      ]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8, cellPadding: 3 },
      bodyStyles: { fontSize: 8, cellPadding: 3, valign: 'top' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'right' },
        1: { cellWidth: 22 },
        2: { cellWidth: 16 },
        3: { cellWidth: 30 },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 'auto' }
      },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      theme: 'striped',
      tableLineColor: [226, 232, 240],
      tableLineWidth: 0.2
    })

    yPos = doc.lastAutoTable.finalY + 8
  }

  // ============================================
  // DETAIL ENTRIES (one per page when photos are present)
  // ============================================

  for (let i = 0; i < sorted.length; i++) {
    const obs = sorted[i]
    doc.addPage()
    yPos = margin + 4

    // Entry header
    doc.setFillColor(...primaryColor)
    doc.rect(margin, yPos, 4, 22, 'F')
    doc.setFillColor(248, 250, 252)
    doc.rect(margin + 4, yPos, pageWidth - margin * 2 - 4, 22, 'F')

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text(`OBSERVATION #${i + 1}`, margin + 10, yPos + 8)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(formatDateTime(obs.observed_at), margin + 10, yPos + 15)

    if (obs.foreman_name) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 116, 139)
      doc.text(`Recorded by: ${obs.foreman_name}`, pageWidth - margin - 4, yPos + 15, { align: 'right' })
    }

    yPos += 30

    // Location
    if (obs.location) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 116, 139)
      doc.text('LOCATION', margin, yPos)
      yPos += 5
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(30, 41, 59)
      doc.text(obs.location, margin, yPos)
      yPos += 8
    }

    // Description
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('DESCRIPTION', margin, yPos)
    yPos += 5

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    const descLines = doc.splitTextToSize(obs.description || '—', pageWidth - margin * 2)
    doc.text(descLines, margin, yPos)
    yPos += descLines.length * 4.5 + 8

    // Photos
    if (obs.photos?.length > 0) {
      if (yPos > pageHeight - 70) { doc.addPage(); yPos = margin + 4 }

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 116, 139)
      doc.text(`PHOTOS (${obs.photos.length})`, margin, yPos)
      yPos += 6

      const urls = obs.photos.map(p => pathToUrl[p] || p)
      const images = await loadImagesAsBase64(urls, 10000)

      const photoWidth = 55
      const photoHeight = 45
      const photoGap = 6
      const photosPerRow = 3
      let xPos = margin

      for (let p = 0; p < obs.photos.length; p++) {
        if (p > 0 && p % photosPerRow === 0) {
          xPos = margin
          yPos += photoHeight + photoGap + 4
        }
        if (yPos + photoHeight > pageHeight - 20) {
          doc.addPage()
          yPos = margin + 4
          xPos = margin
        }
        const imgData = images[p]
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

      yPos += photoHeight + 10
    }
  }

  // ============================================
  // HEADER ACCENT + FOOTER (all pages)
  // ============================================

  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)

    // Accent on pages after cover
    if (i > 1) {
      doc.setFillColor(...primaryColor)
      doc.rect(0, 0, pageWidth, 2.5, 'F')
    }

    const footerY = pageHeight - 10
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4)

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)

    const footerLeft = company?.name
      ? `${company.name}  |  Field Observations  |  ${project?.name || ''}`
      : `Field Observations  |  ${project?.name || ''}`
    doc.text(footerLeft, margin, footerY)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
  }

  // ============================================
  // SAVE
  // ============================================

  const safeName = (project?.name || 'project').replace(/[^\w-]+/g, '_').slice(0, 40)
  const fileName = `Field_Observations_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)

  return {
    success: true,
    fileName,
    pageCount: totalPages,
    observationCount: sorted.length
  }
}

export default { generateFieldObservationsPDF }
