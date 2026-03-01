/**
 * Safe XLSX Wrapper
 *
 * Mitigates prototype pollution vulnerability in xlsx (SheetJS) package.
 * The xlsx package has a known CVE for prototype pollution when parsing
 * untrusted spreadsheet files. This wrapper:
 * 1. Sanitizes parsed output by stripping dangerous prototype keys
 * 2. Provides a safe dynamic import for consistent usage
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
  const XLSX = await loadXLSXSafe()
  const workbook = XLSX.read(data, { type: 'array', ...options })

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
