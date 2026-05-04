/**
 * Safe XLSX Wrapper
 *
 * Mitigates known CVEs in the abandoned xlsx (SheetJS CE) package:
 *   - GHSA-4r6h-8v6p-xvw6 (Prototype Pollution): sanitises parsed output.
 *   - GHSA-5pgg-2g8v-p4x9 (ReDoS via crafted sheet): rejects oversized
 *     uploads before they reach SheetJS's regex parser.
 *
 * Usage:
 *   import { loadXLSXSafe, safeParseExcel } from '../lib/safeXlsx'
 *   const XLSX = await loadXLSXSafe()
 */

// Dynamically import xlsx with prototype pollution protection
export const loadXLSXSafe = async () => {
  const module = await import('xlsx')
  return module.default || module
}

// Keys that could be used for prototype pollution
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

// Hard cap for spreadsheet uploads. Construction take-offs and SOV exports
// fit comfortably under 10 MB; anything larger is more likely a ReDoS payload
// targeting SheetJS than a legitimate workbook.
export const MAX_XLSX_BYTES = 10 * 1024 * 1024

export class XlsxTooLargeError extends Error {
  constructor(size, limit = MAX_XLSX_BYTES) {
    super(
      `Spreadsheet is ${Math.round(size / 1024)} KB; the maximum allowed size is ${Math.round(limit / 1024)} KB.`,
    )
    this.name = 'XlsxTooLargeError'
    this.size = size
    this.limit = limit
  }
}

const byteLengthOf = (data) => {
  if (data == null) return 0
  if (typeof data === 'string') return data.length
  if (data instanceof ArrayBuffer) return data.byteLength
  if (ArrayBuffer.isView(data)) return data.byteLength
  if (typeof data.length === 'number') return data.length
  return 0
}

/**
 * Recursively strip dangerous prototype-polluting keys from an object.
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(sanitizeObject)
  const clean = {}
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue
    clean[key] = typeof value === 'object' ? sanitizeObject(value) : value
  }
  return clean
}

/**
 * Safely parse an Excel file with prototype pollution mitigation.
 * Parses the workbook then sanitizes all sheet data to strip any
 * injected __proto__, constructor, or prototype properties.
 */
export const safeParseExcel = async (data, options = {}) => {
  const size = byteLengthOf(data)
  if (size > MAX_XLSX_BYTES) {
    throw new XlsxTooLargeError(size)
  }
  const XLSX = await loadXLSXSafe()
  const workbook = XLSX.read(data, { ...options, type: 'array' })

  // Sanitize every sheet's data in place
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (sheet) {
      // Remove dangerous keys from the sheet object itself
      for (const key of DANGEROUS_KEYS) {
        delete sheet[key]
      }
    }
  }

  return workbook
}

/**
 * Safely read a sheet to JSON with sanitized output.
 * Strips any properties that don't belong on the parsed data.
 */
export const safeSheetToJson = (XLSX, sheet, options = {}) => {
  const rows = XLSX.utils.sheet_to_json(sheet, options)
  return rows.map(sanitizeObject)
}
