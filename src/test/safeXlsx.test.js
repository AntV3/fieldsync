import { describe, it, expect } from 'vitest'
import { safeParseExcel, safeAoaToSheet, safeJsonToSheet } from '../lib/safeXlsx'

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

describe('safeAoaToSheet / safeJsonToSheet formula-injection escape', () => {
  // A string that starts with =, +, -, @, tab or newline is a formula to
  // Excel and LibreOffice. The exporter must prefix a single quote so the
  // cell renders as text when a user-authored value (COR title, worker
  // name, ticket notes) happens to begin that way.
  const fakeXLSX = {
    utils: {
      aoa_to_sheet: (aoa) => aoa,
      json_to_sheet: (rows) => rows
    }
  }

  it('prefixes a quote to an array-of-arrays row whose cell starts with =', () => {
    const sheet = safeAoaToSheet(fakeXLSX, [['Safe title', '=HYPERLINK("http://x","click")']])
    expect(sheet[0][1]).toBe("'=HYPERLINK(\"http://x\",\"click\")")
    expect(sheet[0][0]).toBe('Safe title')
  })

  it('prefixes a quote to an array-of-objects cell starting with + / - / @', () => {
    const sheet = safeJsonToSheet(fakeXLSX, [
      { Worker: '+Alice', Notes: '@everyone', Role: '-Laborer' }
    ])
    expect(sheet[0].Worker).toBe("'+Alice")
    expect(sheet[0].Notes).toBe("'@everyone")
    expect(sheet[0].Role).toBe("'-Laborer")
  })

  it('leaves numbers, nulls, and safe strings untouched', () => {
    const sheet = safeJsonToSheet(fakeXLSX, [
      { Amount: 1234.56, Name: 'Normal Co', Empty: '', Missing: null, Negative: -5 }
    ])
    expect(sheet[0]).toEqual({ Amount: 1234.56, Name: 'Normal Co', Empty: '', Missing: null, Negative: -5 })
  })
})
