/**
 * Progress Photo PDF Export
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a professional, modern PDF document presenting project progress
 * photos organized by date. Designed for owner reports, client presentations,
 * and project documentation.
 *
 * Design system matches the existing FieldSync export family.
 */

import { loadImagesAsBase64 } from './imageUtils'

const loadJsPDF = () => import('jspdf')

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 18
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const COLORS = {
  dark: [17, 24, 39],
  text: [51, 65, 85],
  mid: [71, 85, 105],
  subtle: [148, 163, 184],
  surface: [248, 250, 252],
  border: [226, 232, 240],
  white: [255, 255, 255],
  accent: [30, 58, 95],
  blue: [59, 130, 246],
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}

const fmtDateShort = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtToday = () => {
  return new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}

function drawRule(doc, x1, y, x2, color = COLORS.border, weight = 0.3) {
  doc.setDrawColor(...color)
  doc.setLineWidth(weight)
  doc.line(x1, y, x2, y)
}

function checkPage(doc, y, needed) {
  if (y + needed > PAGE_HEIGHT - 20) {
    doc.addPage()
    return MARGIN + 5
  }
  return y
}

// ── Cover page ──────────────────────────────────────────────────────────────

function drawCoverPage(doc, projectName, totalPhotos, dateRange, totalDates) {
  // Full-page accent band at top
  doc.setFillColor(...COLORS.accent)
  doc.rect(0, 0, PAGE_WIDTH, 100, 'F')

  // Subtle diagonal accent
  doc.setFillColor(255, 255, 255)
  doc.setGState(new doc.GState({ opacity: 0.05 }))
  doc.rect(0, 60, PAGE_WIDTH, 2, 'F')
  doc.rect(0, 70, PAGE_WIDTH, 1, 'F')
  doc.setGState(new doc.GState({ opacity: 1 }))

  // Title
  doc.setFontSize(32)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('PROGRESS PHOTOS', MARGIN, 45)

  // Project name
  doc.setFontSize(16)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(220, 230, 245)
  doc.text(projectName, MARGIN, 60)

  // Report date
  doc.setFontSize(10)
  doc.setTextColor(180, 200, 220)
  doc.text(`Report generated ${fmtToday()}`, MARGIN, 75)

  // Stats cards below the band
  const cardY = 120
  const cardW = CONTENT_WIDTH / 3 - 6
  const cards = [
    { label: 'Total Photos', value: String(totalPhotos) },
    { label: 'Date Coverage', value: `${totalDates} date${totalDates !== 1 ? 's' : ''}` },
    { label: 'Date Range', value: dateRange },
  ]

  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + 9)

    // Card background
    doc.setFillColor(...COLORS.surface)
    doc.roundedRect(x, cardY, cardW, 32, 3, 3, 'F')

    // Card border
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, cardY, cardW, 32, 3, 3, 'S')

    // Accent bar at top of card
    doc.setFillColor(...COLORS.accent)
    doc.rect(x, cardY, cardW, 2.5, 'F')
    // Round top corners
    doc.setFillColor(...COLORS.surface)
    doc.rect(x + 0.3, cardY + 2.5, cardW - 0.6, 1, 'F')

    // Value
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text(card.value, x + cardW / 2, cardY + 17, { align: 'center' })

    // Label
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.mid)
    doc.text(card.label.toUpperCase(), x + cardW / 2, cardY + 26, { align: 'center' })
  })

  // Table of contents hint
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.subtle)
  doc.text('Photos are organized chronologically by date, newest first.', MARGIN, 175)

  drawRule(doc, MARGIN, 180, MARGIN + CONTENT_WIDTH, COLORS.border, 0.3)

  // Footer on cover
  doc.setFontSize(7)
  doc.setTextColor(...COLORS.subtle)
  doc.text('FieldSync Progress Photo Report', MARGIN, PAGE_HEIGHT - 12)
  doc.text(fmtToday(), PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 12, { align: 'right' })
}

// ── Photo pages ─────────────────────────────────────────────────────────────

function drawDateHeader(doc, dateStr, photoCount, y) {
  // Date accent bar
  doc.setFillColor(...COLORS.accent)
  doc.rect(MARGIN, y, 3, 7, 'F')

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  doc.text(fmtDate(dateStr), MARGIN + 8, y + 5.5)

  // Photo count badge
  const countText = `${photoCount} photo${photoCount !== 1 ? 's' : ''}`
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.mid)
  const dateTextWidth = doc.getTextWidth(fmtDate(dateStr))
  doc.text(countText, MARGIN + 8 + dateTextWidth + 6, y + 5.5)

  // Thin rule under the header
  drawRule(doc, MARGIN, y + 10, MARGIN + CONTENT_WIDTH, COLORS.border, 0.4)

  return y + 14
}

function drawPhotoWithCaption(doc, imageData, photo, x, y, w, h, getAreaName) {
  // Photo shadow
  doc.setFillColor(220, 220, 225)
  doc.roundedRect(x + 1, y + 1, w, h, 1.5, 1.5, 'F')

  if (imageData) {
    // Photo border
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.4)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S')

    // Clip and draw image
    doc.addImage(imageData, 'JPEG', x + 0.5, y + 0.5, w - 1, h - 1)
  } else {
    doc.setFillColor(...COLORS.surface)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F')
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.subtle)
    doc.text('Photo unavailable', x + w / 2, y + h / 2, { align: 'center' })
  }

  // Caption below photo
  let captionY = y + h + 3

  // Source badge
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.accent)
  doc.text(photo.source.toUpperCase(), x, captionY)
  captionY += 3

  // Area name
  const areaName = getAreaName(photo.areaId)
  if (areaName) {
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.mid)
    doc.text(areaName, x, captionY)
    captionY += 3
  }

  // Description (truncated)
  if (photo.description) {
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.text)
    const maxChars = Math.floor(w * 2.5)
    const desc = photo.description.length > maxChars
      ? photo.description.substring(0, maxChars) + '...'
      : photo.description
    const lines = doc.splitTextToSize(desc, w)
    doc.text(lines.slice(0, 2), x, captionY)
    captionY += lines.slice(0, 2).length * 3
  }

  return captionY + 2
}

function addPageFooters(doc, projectName) {
  const totalPages = doc.internal.getNumberOfPages()

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const fy = PAGE_HEIGHT - 10

    drawRule(doc, MARGIN, fy - 4, PAGE_WIDTH - MARGIN, COLORS.border, 0.3)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.subtle)
    doc.text(`${projectName} — Progress Photos`, MARGIN, fy)
    doc.text(`Page ${i} of ${totalPages}`, PAGE_WIDTH - MARGIN, fy, { align: 'right' })
  }
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportProgressPhotosPDF({
  photos,
  photosByDate,
  availableDates,
  projectName,
  areas,
  getAreaName,
}) {
  const { default: jsPDF } = await loadJsPDF()

  // Pre-load all photo images as base64
  const urls = photos.map(p => p.url)
  const base64Images = await loadImagesAsBase64(urls, 10000, 0.85)
  const imageMap = {}
  photos.forEach((p, i) => { imageMap[p.id] = base64Images[i] })

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Date range
  const newest = availableDates[0]
  const oldest = availableDates[availableDates.length - 1]
  const dateRange = newest === oldest
    ? fmtDateShort(newest)
    : `${fmtDateShort(oldest)} – ${fmtDateShort(newest)}`

  // ── Cover page
  drawCoverPage(doc, projectName, photos.length, dateRange, availableDates.length)

  // ── Photo pages, grouped by date
  // Layout: 2 photos per row, large format for clarity
  const photoW = (CONTENT_WIDTH - 8) / 2  // ~83mm each
  const photoH = 62  // 4:3 aspect roughly
  const captionSpace = 14
  const rowHeight = photoH + captionSpace + 4

  for (const date of availableDates) {
    const datePhotos = photosByDate[date] || []
    if (datePhotos.length === 0) continue

    doc.addPage()
    let y = MARGIN

    // Date header
    y = drawDateHeader(doc, date, datePhotos.length, y)

    // Render photos in pairs
    for (let i = 0; i < datePhotos.length; i += 2) {
      y = checkPage(doc, y, rowHeight + 5)

      // If we just added a page, redraw the date header for continuity
      if (y < MARGIN + 10) {
        y = drawDateHeader(doc, date, datePhotos.length, y)
      }

      // Left photo
      const photo1 = datePhotos[i]
      const x1 = MARGIN
      const bottomY1 = drawPhotoWithCaption(
        doc, imageMap[photo1.id], photo1, x1, y, photoW, photoH, getAreaName
      )

      // Right photo (if exists)
      let bottomY2 = bottomY1
      if (i + 1 < datePhotos.length) {
        const photo2 = datePhotos[i + 1]
        const x2 = MARGIN + photoW + 8
        bottomY2 = drawPhotoWithCaption(
          doc, imageMap[photo2.id], photo2, x2, y, photoW, photoH, getAreaName
        )
      }

      y = Math.max(bottomY1, bottomY2) + 4
    }
  }

  // ── Summary page
  doc.addPage()
  let y = MARGIN

  // Summary header
  doc.setFillColor(...COLORS.accent)
  doc.rect(MARGIN, y, 3, 7, 'F')
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  doc.text('Photo Summary', MARGIN + 8, y + 5.5)
  y += 14

  drawRule(doc, MARGIN, y, MARGIN + CONTENT_WIDTH, COLORS.border, 0.4)
  y += 8

  // Summary table
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.mid)
  doc.text('DATE', MARGIN, y)
  doc.text('SOURCE', MARGIN + 90, y)
  doc.text('PHOTOS', MARGIN + CONTENT_WIDTH, y, { align: 'right' })
  y += 3
  drawRule(doc, MARGIN, y, MARGIN + CONTENT_WIDTH, COLORS.border, 0.3)
  y += 5

  for (const date of availableDates) {
    const datePhotos = photosByDate[date] || []
    y = checkPage(doc, y, 8)

    // Alternate row background
    const rowIdx = availableDates.indexOf(date)
    if (rowIdx % 2 === 0) {
      doc.setFillColor(...COLORS.surface)
      doc.rect(MARGIN - 2, y - 4, CONTENT_WIDTH + 4, 7, 'F')
    }

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.text)
    doc.text(fmtDate(date), MARGIN, y)

    // Source breakdown
    const tmCount = datePhotos.filter(p => p.source === 'Time & Material').length
    const drCount = datePhotos.filter(p => p.source === 'Daily Report').length
    const sources = []
    if (tmCount > 0) sources.push(`T&M: ${tmCount}`)
    if (drCount > 0) sources.push(`Daily: ${drCount}`)
    doc.setTextColor(...COLORS.mid)
    doc.text(sources.join(', '), MARGIN + 90, y)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text(String(datePhotos.length), MARGIN + CONTENT_WIDTH, y, { align: 'right' })

    y += 7
  }

  // Total row
  y += 2
  drawRule(doc, MARGIN, y, MARGIN + CONTENT_WIDTH, COLORS.accent, 0.5)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  doc.text('TOTAL', MARGIN, y)
  doc.text(String(photos.length), MARGIN + CONTENT_WIDTH, y, { align: 'right' })

  // ── Add page footers
  addPageFooters(doc, projectName)

  // ── Save
  const safeName = projectName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)
  const today = new Date().toISOString().slice(0, 10)
  doc.save(`${safeName}_Progress_Photos_${today}.pdf`)
}
