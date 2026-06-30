import { describe, it, expect } from 'vitest'
import { safeParseExcel } from '../lib/safeXlsx'

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
