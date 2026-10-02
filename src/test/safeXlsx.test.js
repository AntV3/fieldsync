import { describe, it, expect } from 'vitest'
import {
  safeParseExcel,
  escapeXlsxCell,
  escapeXlsxRows,
  escapeXlsxObjectRows,
} from '../lib/safeXlsx'

describe('safeParseExcel input-size cap', () => {
  it('rejects input larger than the configured cap before parsing', async () => {
    // 2 MB payload against a 1 MB cap — must throw without invoking the
    // vulnerable XLSX.read path (mitigates GHSA-5pgg-2g8v-p4x9 amplification).
    const oversized = new Uint8Array(2 * 1024 * 1024)
    await expect(
      safeParseExcel(oversized, { maxBytes: 1 * 1024 * 1024 })
    ).rejects.toThrow(/too large/i)
  })

  it('reports the size and limit in the error message', async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024)
    await expect(
      safeParseExcel(oversized, { maxBytes: 1 * 1024 * 1024 })
    ).rejects.toThrow(/Maximum is 1 MB/)
  })

  it('uses the default 10 MB cap when none is supplied', async () => {
    const oversized = new Uint8Array(11 * 1024 * 1024)
    await expect(safeParseExcel(oversized)).rejects.toThrow(/too large/i)
  })
})

describe('escapeXlsxCell (formula-injection prevention)', () => {
  it("prefixes a leading '=' so Excel does not evaluate the cell", () => {
    expect(escapeXlsxCell('=HYPERLINK("http://evil")')).toBe(
      "'=HYPERLINK(\"http://evil\")"
    )
  })
  it("prefixes other trigger characters: + - @ \\t \\r", () => {
    expect(escapeXlsxCell('+SUM(A1)')).toBe("'+SUM(A1)")
    expect(escapeXlsxCell('-1+2')).toBe("'-1+2")
    expect(escapeXlsxCell('@cmd')).toBe("'@cmd")
    expect(escapeXlsxCell('\tcol')).toBe("'\tcol")
    expect(escapeXlsxCell('\rrow')).toBe("'\rrow")
  })
  it('leaves safe strings alone', () => {
    expect(escapeXlsxCell('Project Alpha')).toBe('Project Alpha')
    expect(escapeXlsxCell('123 Main St')).toBe('123 Main St')
    expect(escapeXlsxCell('')).toBe('')
  })
  it('passes non-strings through unchanged', () => {
    expect(escapeXlsxCell(42)).toBe(42)
    expect(escapeXlsxCell(null)).toBe(null)
    expect(escapeXlsxCell(undefined)).toBe(undefined)
    expect(escapeXlsxCell(true)).toBe(true)
  })
  it('escapes every string cell in a 2-D array sheet', () => {
    const rows = [
      ['Header', '=Hostile()'],
      [1, '+SUM(A1:A3)'],
    ]
    expect(escapeXlsxRows(rows)).toEqual([
      ['Header', "'=Hostile()"],
      [1, "'+SUM(A1:A3)"],
    ])
  })
  it('escapes every value in an array-of-objects sheet', () => {
    const rows = [
      { name: '=cmd|calc!A1', hours: 8 },
      { name: 'Alice', hours: 10 },
    ]
    expect(escapeXlsxObjectRows(rows)).toEqual([
      { name: "'=cmd|calc!A1", hours: 8 },
      { name: 'Alice', hours: 10 },
    ])
  })
})
