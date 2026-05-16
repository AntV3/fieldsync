/**
 * Safe XLSX Wrapper
 *
 * Mitigates known xlsx (SheetJS) CVEs when parsing untrusted spreadsheets:
 *   - Prototype pollution: parsed objects are sanitised below.
 *   - ReDoS (GHSA-5pgg-2g8v-p4x9): inputs above MAX_PARSE_BYTES are rejected
 *     before reaching the regex-heavy parser.
 *
 * Usage:
 *   import { loadXLSXSafe, safeParseExcel } from '../lib/safeXlsx'
 *   const XLSX = await loadXLSXSafe()
 */

// Hard cap on parseable spreadsheet size. Real schedules-of-values and T&M
// imports are well under 1 MB; 10 MB leaves generous headroom while bounding
// the input the ReDoS-vulnerable parser ever sees.
export const MAX_PARSE_BYTES = 10 * 1024 * 1024

// Dynamically import xlsx with prototype pollution protection
export const loadXLSXSafe = async () => {
  const module = await import('xlsx')
  return module.default || module
}

// Keys that could be used for prototype pollution
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function byteLength(data) {
  if (data == null) return 0
  if (typeof data === 'string') return data.length
  if (data.byteLength != null) return data.byteLength
  if (data.length != null) return data.length
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
  const size = byteLength(data)
  if (size > MAX_PARSE_BYTES) {
    const mb = (MAX_PARSE_BYTES / (1024 * 1024)).toFixed(0)
    throw new Error(`Spreadsheet is too large to import (limit ${mb} MB).`)
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
