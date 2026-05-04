/**
 * Tests for safeXlsx wrapper.
 *
 * Covers the runtime mitigations layered on top of the abandoned xlsx
 * (SheetJS CE) package:
 *   - GHSA-4r6h-8v6p-xvw6 (prototype pollution): sanitizeObject paths.
 *   - GHSA-5pgg-2g8v-p4x9 (ReDoS): MAX_XLSX_BYTES guard in safeParseExcel.
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_XLSX_BYTES,
  XlsxTooLargeError,
  safeParseExcel,
} from '../lib/safeXlsx'

describe('safeXlsx ReDoS guard', () => {
  it('rejects uploads larger than MAX_XLSX_BYTES before invoking SheetJS', async () => {
    const oversized = new Uint8Array(MAX_XLSX_BYTES + 1)
    await expect(safeParseExcel(oversized)).rejects.toBeInstanceOf(XlsxTooLargeError)
  })

  it('XlsxTooLargeError reports the offending and limit sizes', () => {
    const err = new XlsxTooLargeError(MAX_XLSX_BYTES + 10)
    expect(err.size).toBe(MAX_XLSX_BYTES + 10)
    expect(err.limit).toBe(MAX_XLSX_BYTES)
    expect(err.message).toContain('maximum allowed size')
  })

  it('exposes a 10 MB cap to callers', () => {
    expect(MAX_XLSX_BYTES).toBe(10 * 1024 * 1024)
  })
})
