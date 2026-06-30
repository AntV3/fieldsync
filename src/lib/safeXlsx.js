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

// Hard cap on parsed input. The xlsx (SheetJS) ReDoS advisory
// (GHSA-5pgg-2g8v-p4x9) is amplified by large inputs; capping the byte
// size before handing data to XLSX.read bounds the worst case. 10 MB is
// comfortably above any real area/task import spreadsheet.
const MAX_PARSE_BYTES = 10 * 1024 * 1024

/** Best-effort byte length for ArrayBuffer / TypedArray / array inputs. */
function byteLengthOf(data) {
  if (!data) return 0
  if (typeof data.byteLength === 'number') return data.byteLength
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
  const { maxBytes = MAX_PARSE_BYTES, ...readOptions } = options
  const size = byteLengthOf(data)
  if (size > maxBytes) {
    throw new Error(
      `Spreadsheet is too large to import (${Math.round(size / 1024 / 1024)} MB). ` +
        `Maximum is ${Math.round(maxBytes / 1024 / 1024)} MB.`
    )
  }
  const XLSX = await loadXLSXSafe()
  const workbook = XLSX.read(data, { ...readOptions, type: 'array' })

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
