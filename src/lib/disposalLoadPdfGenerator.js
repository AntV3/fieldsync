/**
 * Disposal Load PDF & CSV Export
 * ─────────────────────────────────────────────────────────────────────────────
 * Produces a branded, printable record of disposal loads and trucks used for a
 * project. The PDF is intended as backup documentation for unit-priced haul-off
 * work, tipping-fee reconciliation, and owner/GC billing packets.
 *
 * The design language mirrors the Field Observations and Field Document
 * exporters so all FieldSync PDFs feel like one family.
 */

import {
  resolvePrimaryColor,
  loadBrandLogo,
  drawDocumentHeader,
  drawContinuationAccent,
  applyDocumentFooters,
} from './pdfBranding'

const LOAD_TYPE_LABELS = {
  concrete: 'Concrete',
  trash: 'Trash',
  metals: 'Metals',
  hazardous_waste: 'Hazardous Waste',
  copper: 'Copper',
  asphalt: 'Asphalt',
}

const LOAD_TYPE_ORDER = ['concrete', 'asphalt', 'metals', 'copper', 'hazardous_waste', 'trash']

const formatTypeLabel = (type) =>
  LOAD_TYPE_LABELS[type] ||
  (type ? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')

const parseDate = (iso) => {
  if (!iso) return null
  return new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
}

const formatLongDate = (iso) => {
  const d = parseDate(iso)
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const formatShortDate = (iso) => {
  const d = parseDate(iso)
  if (!d || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const todayIso = () => new Date().toISOString().split('T')[0]

const safeFileName = (s) => (s || 'project').replace(/[^\w-]+/g, '_').slice(0, 40)

// ─────────────────────────────────────────────────────────────────────────────
// Shape the raw rows into everything the PDF / CSV needs.
// ─────────────────────────────────────────────────────────────────────────────

export function buildDisposalReport({ loads = [], truckCounts = [], dateRange = {} } = {}) {
  const normalized = loads.map((l) => ({
    date: l.load_date || l.work_date,
    type: l.load_type,
    count: Number(l.load_count) || 0,
    notes: l.notes || '',
  }))

  const trucksByDate = {}
  for (const t of truckCounts) {
    if (t?.work_date) trucksByDate[t.work_date] = Number(t.truck_count) || 0
  }

  // Totals per type
  const typeTotals = {}
  for (const l of normalized) {
    typeTotals[l.type] = (typeTotals[l.type] || 0) + l.count
  }

  const orderedTypes = [
    ...LOAD_TYPE_ORDER.filter((t) => typeTotals[t] > 0),
    ...Object.keys(typeTotals).filter((t) => !LOAD_TYPE_ORDER.includes(t)),
  ]

  // Daily aggregates
  const dailyMap = {}
  for (const l of normalized) {
    if (!l.date) continue
    if (!dailyMap[l.date]) {
      dailyMap[l.date] = { date: l.date, total: 0, byType: {}, trucks: trucksByDate[l.date] || 0 }
    }
    dailyMap[l.date].byType[l.type] = (dailyMap[l.date].byType[l.type] || 0) + l.count
    dailyMap[l.date].total += l.count
  }
  // Make sure truck-only days still show up
  for (const [date, trucks] of Object.entries(trucksByDate)) {
    if (trucks > 0 && !dailyMap[date]) {
      dailyMap[date] = { date, total: 0, byType: {}, trucks }
    }
  }

  const daily = Object.values(dailyMap).sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  )

  const totalLoads = normalized.reduce((s, l) => s + l.count, 0)
  const totalTrucks = Object.values(trucksByDate).reduce((s, n) => s + n, 0)
  const activeDays = daily.filter((d) => d.total > 0 || d.trucks > 0).length

  const dates = daily.map((d) => d.date).sort()
  const periodStart = dateRange.start || dates[0] || null
  const periodEnd = dateRange.end || dates[dates.length - 1] || null

  return {
    totals: { loads: totalLoads, trucks: totalTrucks, activeDays, entryCount: normalized.length },
    typeTotals,
    orderedTypes,
    daily,
    period: { start: periodStart, end: periodEnd },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  dark: [17, 24, 39],
  text: [51, 65, 85],
  mid: [71, 85, 105],
  subtle: [148, 163, 184],
  surface: [248, 250, 252],
  border: [226, 232, 240],
  white: [255, 255, 255],
}

export async function generateDisposalLoadsPDF({
  loads = [],
  truckCounts = [],
  project,
  company,
  branding = {},
  dateRange = {},
} = {}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const report = buildDisposalReport({ loads, truckCounts, dateRange })

  const doc = new jsPDF('p', 'mm', 'letter')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2

  const primary = resolvePrimaryColor({ branding, company })
  const brandLogo = await loadBrandLogo({ branding, company })

  // ── Header ─────────────────────────────────────────────────────────────────
  let y = drawDocumentHeader(doc, {
    title: 'Disposal Load Log',
    subtitle: 'Haul-off documentation',
    context: { company, branding, project },
    brandLogo,
    primary,
  })

  // ── Project strip ──────────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.surface)
  doc.roundedRect(margin, y - 3, contentWidth, 10, 2, 2, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.mid)
  doc.text('Project:', margin + 4, y + 3)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.dark)
  const projLabel =
    (project?.name || 'Untitled') +
    (project?.job_number ? `  (Job #${project.job_number})` : '')
  doc.text(projLabel, margin + 20, y + 3)
  y += 14

  // Period line
  if (report.period.start || report.period.end) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.mid)
    const rangeText =
      report.period.start && report.period.end && report.period.start !== report.period.end
        ? `Period: ${formatShortDate(report.period.start)} — ${formatShortDate(report.period.end)}`
        : `Period: ${formatShortDate(report.period.start || report.period.end)}`
    doc.text(rangeText, margin, y)
    y += 8
  }

  // ── Summary card ──────────────────────────────────────────────────────────
  const cardH = 26
  doc.setFillColor(...COLORS.surface)
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentWidth, cardH, 2, 2, 'FD')
  doc.setFillColor(...primary)
  doc.rect(margin, y, 2.5, cardH, 'F')

  const statX = [margin + 10, margin + 65, margin + 115, margin + 160]
  const statY = y + 10
  const metricLabelY = y + 17

  const stats = [
    { label: 'TOTAL LOADS', value: String(report.totals.loads) },
    { label: 'TRUCKS USED', value: String(report.totals.trucks) },
    { label: 'ACTIVE DAYS', value: String(report.totals.activeDays) },
    { label: 'ENTRIES', value: String(report.totals.entryCount) },
  ]

  stats.forEach((s, i) => {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text(s.value, statX[i], statY)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.subtle)
    doc.text(s.label, statX[i], metricLabelY)
  })

  y += cardH + 8

  // ── Totals by material type ────────────────────────────────────────────────
  if (report.orderedTypes.length > 0) {
    doc.setFillColor(...primary)
    doc.rect(margin, y, 3, 6, 'F')
    doc.setFontSize(10.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text('By Material Type', margin + 7, y + 5)
    y += 10

    autoTable(doc, {
      startY: y,
      head: [['Material', 'Loads', '% of Total']],
      body: report.orderedTypes.map((t) => {
        const count = report.typeTotals[t]
        const pct = report.totals.loads > 0
          ? `${Math.round((count / report.totals.loads) * 100)}%`
          : '0%'
        return [formatTypeLabel(t), String(count), pct]
      }),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primary, textColor: [255, 255, 255], fontSize: 9, cellPadding: 3 },
      bodyStyles: { fontSize: 9, cellPadding: 3, textColor: COLORS.text },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
      },
      theme: 'striped',
      tableLineColor: COLORS.border,
      tableLineWidth: 0.2,
    })

    y = doc.lastAutoTable.finalY + 10
  }

  // ── Daily detail table ─────────────────────────────────────────────────────
  if (report.daily.length > 0) {
    if (y > pageHeight - 60) { doc.addPage(); y = margin + 4 }

    doc.setFillColor(...primary)
    doc.rect(margin, y, 3, 6, 'F')
    doc.setFontSize(10.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COLORS.dark)
    doc.text('Daily Detail', margin + 7, y + 5)
    y += 10

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Loads', 'Trucks', 'Breakdown']],
      body: report.daily.map((d) => {
        const breakdown = Object.entries(d.byType)
          .sort((a, b) => b[1] - a[1])
          .map(([t, c]) => `${formatTypeLabel(t)}: ${c}`)
          .join(', ') || '—'
        return [
          formatLongDate(d.date),
          String(d.total),
          d.trucks ? String(d.trucks) : '—',
          breakdown,
        ]
      }),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: primary, textColor: [255, 255, 255], fontSize: 9, cellPadding: 3 },
      bodyStyles: { fontSize: 8.5, cellPadding: 3, valign: 'top', textColor: COLORS.text },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 16, halign: 'right' },
        2: { cellWidth: 16, halign: 'right' },
        3: { cellWidth: 'auto' },
      },
      theme: 'striped',
      tableLineColor: COLORS.border,
      tableLineWidth: 0.2,
    })

    y = doc.lastAutoTable.finalY + 8
  } else {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...COLORS.subtle)
    doc.text('No disposal loads recorded for this period.', margin, y + 4)
    y += 14
  }

  // ── Continuation accents + footers ─────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i)
    drawContinuationAccent(doc, { primary })
  }

  applyDocumentFooters(doc, {
    documentLabel: project?.name
      ? `Disposal Log · ${project.name}`
      : 'Disposal Log',
    context: { company, branding, project },
    primary,
  })

  const fileName = `Disposal_Log_${safeFileName(project?.name)}_${todayIso()}.pdf`
  doc.save(fileName)

  return {
    success: true,
    fileName,
    pageCount: totalPages,
    totalLoads: report.totals.loads,
    totalTrucks: report.totals.trucks,
    activeDays: report.totals.activeDays,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────

function escapeCSV(value) {
  if (value == null) return ''
  if (typeof value === 'number') return String(value)
  let str = String(value)
  if (/^[=+\-@\t\r\n]/.test(str)) str = "'" + str
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCSV(headers, rows) {
  const headerLine = headers.map((h) => escapeCSV(h.label)).join(',')
  const dataLines = rows.map((row) => headers.map((h) => escapeCSV(row[h.key])).join(','))
  return [headerLine, ...dataLines].join('\n')
}

function downloadFile(content, filename, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportDisposalLoadsCSV({
  loads = [],
  truckCounts = [],
  project,
  dateRange = {},
} = {}) {
  const report = buildDisposalReport({ loads, truckCounts, dateRange })

  const headers = [
    { key: 'date', label: 'Date' },
    { key: 'totalLoads', label: 'Total Loads' },
    { key: 'trucks', label: 'Trucks Used' },
  ]

  // One column per material type that appeared
  const typeCols = report.orderedTypes.map((t) => ({ key: `type_${t}`, label: formatTypeLabel(t) }))
  const allHeaders = [...headers, ...typeCols]

  const rows = report.daily.map((d) => {
    const row = {
      date: d.date,
      totalLoads: d.total,
      trucks: d.trucks || 0,
    }
    for (const t of report.orderedTypes) {
      row[`type_${t}`] = d.byType[t] || 0
    }
    return row
  })

  // Total row
  if (rows.length > 0) {
    const totalRow = {
      date: 'TOTAL',
      totalLoads: report.totals.loads,
      trucks: report.totals.trucks,
    }
    for (const t of report.orderedTypes) {
      totalRow[`type_${t}`] = report.typeTotals[t] || 0
    }
    rows.push(totalRow)
  }

  const csv = toCSV(allHeaders, rows)
  const fileName = `Disposal_Log_${safeFileName(project?.name)}_${todayIso()}.csv`
  downloadFile(csv, fileName)

  return {
    success: true,
    fileName,
    rowCount: rows.length,
    totalLoads: report.totals.loads,
    totalTrucks: report.totals.trucks,
  }
}

export default { generateDisposalLoadsPDF, exportDisposalLoadsCSV, buildDisposalReport }
