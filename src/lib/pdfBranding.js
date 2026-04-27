/**
 * Shared PDF branding primitives.
 * ─────────────────────────────────────────────────────────────────────────────
 * One source of truth for how every FieldSync export looks. Keeping the
 * header, footer, logo placement, and colour tokens in a single module means
 * every PDF feels like part of the same family — clean, modern, elegant.
 *
 * Design intent
 *  • White, editorial header (no heavy colour bands) — colour is reserved for
 *    accents so logos and titles read clearly.
 *  • Logos render at their true aspect ratio inside a fixed bounding box, so
 *    nothing is stretched or squashed.
 *  • Hairline rules and disciplined typography (with letter-spacing on caps)
 *    do the heavy lifting visually.
 */

import { hexToRgb, loadLogoForPdf, fitLogo } from './imageUtils'

// ── Design tokens ───────────────────────────────────────────────────────────

export const BRAND = {
  primaryDefault: [30, 58, 95],   // FieldSync deep navy (fallback)
  ink:    [15, 23, 42],           // headlines
  text:   [51, 65, 85],           // body text
  mid:    [71, 85, 105],          // labels / secondary text
  subtle: [148, 163, 184],        // tertiary, footer copy
  hair:   [226, 232, 240],        // hairline rules
  faint:  [241, 245, 249],        // very light surface (alt rows)
  surface:[248, 250, 252],        // card / strip background
  white:  [255, 255, 255],
}

// Standard layout constants (Letter portrait)
export const LAYOUT = {
  margin: 18,
  headerHeight: 26,    // logo + title block above the divider
  headerDividerY: 32,  // y-coordinate of the primary hairline under header
  footerOffsetY: 10,   // distance from bottom of page
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the brand primary colour from any branding/company shape we use
 * across the codebase, returning an RGB triple ready for jsPDF.
 */
export function resolvePrimaryColor({ branding, company } = {}) {
  const hex = branding?.primaryColor
    || company?.branding_color
    || company?.primary_color
  return hex ? hexToRgb(hex) : [...BRAND.primaryDefault]
}

/**
 * Load the company logo (if any), preserving transparency. Returns null when
 * no logo is configured or fetching fails — callers should fall back to a
 * typographic wordmark.
 */
export async function loadBrandLogo({ branding, company } = {}) {
  const url = branding?.logoUrl || company?.logo_url
  if (!url) return null
  try {
    return await loadLogoForPdf(url)
  } catch {
    return null
  }
}

/**
 * Render text with letter-spacing approximation by drawing each character
 * separately. jsPDF doesn't expose tracking, so we fake it for headline caps.
 */
function drawTrackedText(doc, text, x, y, { trackEm = 0.08, align = 'left' } = {}) {
  if (!text) return
  const fontSize = doc.getFontSize()
  // 1em = font size in pt; convert pt → mm (1 pt = 0.3528 mm)
  const trackMm = fontSize * 0.3528 * trackEm
  const chars = String(text).split('')
  const widths = chars.map((c) => doc.getTextWidth(c))
  const total = widths.reduce((s, w) => s + w, 0) + trackMm * (chars.length - 1)

  let cursor = x
  if (align === 'right') cursor = x - total
  else if (align === 'center') cursor = x - total / 2

  chars.forEach((c, i) => {
    doc.text(c, cursor, y)
    cursor += widths[i] + trackMm
  })
}

// ── Header ──────────────────────────────────────────────────────────────────

/**
 * Draw a clean, editorial-style document header.
 *
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  [logo]  Company Name                       DOCUMENT TITLE       │
 *  │          phone · email                              Subtitle     │
 *  ├──────────────────────────────────────────────────────────────────┤   (hairline, primary color)
 *  ├──────────────────────────────────────────────────────────────────┤   (hairline, faint)
 *
 * @param {jsPDF} doc
 * @param {Object} opts
 * @param {string} opts.title          Headline e.g. "INVOICE"
 * @param {string} [opts.subtitle]     Sub-headline e.g. invoice number
 * @param {Object} opts.context        { company, branding, project? }
 * @param {Object} [opts.brandLogo]    Pre-loaded logo from loadBrandLogo()
 * @param {number[]} opts.primary      RGB primary colour
 * @returns {number} y-position to begin content
 */
export function drawDocumentHeader(doc, {
  title,
  subtitle,
  context = {},
  brandLogo,
  primary,
}) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = LAYOUT.margin
  const company = context.company || {}

  // Logo block (top-left). Bounding box: 38mm wide × 16mm tall.
  const logoBoxW = 38
  const logoBoxH = 16
  const logoTop = margin - 4   // baseline higher than text margin
  let textLeftX = margin

  if (brandLogo?.data) {
    const fit = fitLogo(brandLogo, logoBoxW, logoBoxH)
    // Vertically center logo inside the bounding box for clean alignment
    const yOffset = (logoBoxH - fit.height) / 2
    doc.addImage(
      brandLogo.data,
      brandLogo.format || 'PNG',
      margin,
      logoTop + yOffset,
      fit.width,
      fit.height,
    )
    textLeftX = margin + fit.width + 6
  }

  // Company wordmark (always shown, even with logo, as a small caps mark)
  if (company.name) {
    if (brandLogo?.data) {
      // With logo: small caps wordmark beside the logo, neutral colour.
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...BRAND.ink)
      doc.text(company.name, textLeftX, logoTop + 6.5)

      const contact = [company.phone, company.email].filter(Boolean).join('  ·  ')
      if (contact) {
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...BRAND.mid)
        doc.text(contact, textLeftX, logoTop + 11)
      }
    } else {
      // No logo: company name *is* the wordmark — bigger, in primary colour.
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...primary)
      doc.text(company.name, margin, logoTop + 8)

      const contact = [company.phone, company.email].filter(Boolean).join('  ·  ')
      if (contact) {
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...BRAND.mid)
        doc.text(contact, margin, logoTop + 13)
      }
    }
  }

  // Document title (right-aligned, tracked caps in primary)
  if (title) {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primary)
    drawTrackedText(doc, String(title).toUpperCase(), pageWidth - margin, logoTop + 6, {
      trackEm: 0.12,
      align: 'right',
    })
  }

  if (subtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BRAND.mid)
    doc.text(String(subtitle), pageWidth - margin, logoTop + 12, { align: 'right' })
  }

  // Hairline divider — 0.6mm primary line followed by 0.2mm faint line.
  const dividerY = LAYOUT.headerDividerY
  doc.setDrawColor(...primary)
  doc.setLineWidth(0.6)
  doc.line(margin, dividerY, pageWidth - margin, dividerY)
  doc.setDrawColor(...BRAND.hair)
  doc.setLineWidth(0.2)
  doc.line(margin, dividerY + 1.4, pageWidth - margin, dividerY + 1.4)

  return dividerY + 8
}

/**
 * Lighter top-of-page accent for continuation pages — a single thin primary
 * hairline beneath the header zone. Used when not redrawing the full header.
 */
export function drawContinuationAccent(doc, { primary }) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = LAYOUT.margin
  doc.setDrawColor(...primary)
  doc.setLineWidth(0.6)
  doc.line(margin, 12, pageWidth - margin, 12)
}

// ── Footer ──────────────────────────────────────────────────────────────────

/**
 * Apply a polished footer to every page of the document.
 * Left: document label + generated date. Right: page number.
 * Above the footer line: a faint hairline.
 */
export function applyDocumentFooters(doc, {
  documentLabel = '',
  context = {},
  primary,
}) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = LAYOUT.margin
  const total = doc.internal.getNumberOfPages()
  const company = context.company || {}

  const generatedOn = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  for (let i = 1; i <= total; i++) {
    doc.setPage(i)

    const fy = pageHeight - LAYOUT.footerOffsetY

    // Hairline rule above footer
    doc.setDrawColor(...BRAND.hair)
    doc.setLineWidth(0.3)
    doc.line(margin, fy - 4, pageWidth - margin, fy - 4)

    // Tiny primary tick on the left as a quiet brand cue
    doc.setFillColor(...primary)
    doc.rect(margin, fy - 4, 8, 0.6, 'F')

    // Left text
    const left = [
      company.name || '',
      documentLabel,
      `Generated ${generatedOn}`,
    ].filter(Boolean).join('  ·  ')

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BRAND.subtle)
    doc.text(left, margin, fy)

    // Right: page indicator
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND.mid)
    doc.text(`${i}`, pageWidth - margin, fy, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BRAND.subtle)
    const totalLabel = ` of ${total}`
    const numberWidth = doc.getTextWidth(`${i}`)
    doc.text(totalLabel, pageWidth - margin - numberWidth, fy, { align: 'right' })
  }
}

// ── Convenience: generic info strip ─────────────────────────────────────────

/**
 * Draw a clean, low-chrome project info strip — used on most documents below
 * the header to anchor the project context.
 */
export function drawProjectStrip(doc, { project, y, extraRight }) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = LAYOUT.margin
  const contentWidth = pageWidth - margin * 2

  doc.setFillColor(...BRAND.surface)
  doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'F')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND.mid)
  doc.text('PROJECT', margin + 5, y + 4.5)

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND.ink)
  const projLabel = (project?.name || 'Untitled')
    + (project?.job_number ? `   ·   Job #${project.job_number}` : '')
  doc.text(projLabel, margin + 22, y + 7.5)

  if (extraRight) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BRAND.mid)
    doc.text(extraRight, pageWidth - margin - 4, y + 7.5, { align: 'right' })
  }

  return y + 15
}

export default {
  BRAND,
  LAYOUT,
  resolvePrimaryColor,
  loadBrandLogo,
  drawDocumentHeader,
  drawContinuationAccent,
  applyDocumentFooters,
  drawProjectStrip,
}
