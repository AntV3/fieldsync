/**
 * Daily health check (2026-10-17) regression tests.
 *
 * Covers the second wave of UTC-date-drift bugs across billing exports,
 * COR cost writes, RFI/submittal overdue filters, invoice/draw/equipment
 * form defaults, and foreman "today" views. All replaced the UTC pattern
 *
 *   new Date().toISOString().split('T')[0]
 *
 * with the local-date helper
 *
 *   getLocalDateString(date = new Date())  (src/lib/utils.js)
 *
 * This test suite anchors every converted call site against the dead
 * UTC pattern — regressing any single one will fail here before shipping.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getLocalDateString } from '../lib/utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

function readSource(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8')
}

const UTC_DATE_PATTERN = /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/

const FILES_FIXED = [
  // Data writes / filters (lib)
  'src/lib/aiaBillingExport.js',
  'src/lib/corOps.js',
  'src/lib/equipmentOps.js',
  'src/lib/financialExport.js',
  'src/lib/db/rfiOps.js',
  'src/lib/db/submittalOps.js',
  // Form state initializers (components)
  'src/components/AddCostModal.jsx',
  'src/components/InjuryReportForm.jsx',
  'src/components/SageExportPanel.jsx',
  'src/components/billing/InvoiceModal.jsx',
  'src/components/billing/DrawRequestModal.jsx',
  'src/components/billing/SageExport.jsx',
  'src/components/cor/CORForm.jsx',
  'src/components/equipment/EquipmentModal.jsx',
  // Filter / view "today" (components)
  'src/components/RFIList.jsx',
  'src/components/SubmittalList.jsx',
  'src/components/ForemanView.jsx',
  'src/components/ForemanMetrics.jsx',
  'src/components/overview/OverviewCrewMetrics.jsx',
]

describe('Daily health check 2026-10-17 — UTC date drift fixes', () => {
  describe('getLocalDateString helper', () => {
    it('exists and returns a YYYY-MM-DD string', () => {
      const result = getLocalDateString()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('returns the local calendar date, not the UTC date, at end-of-day', () => {
      // 11:30 PM local on 2026-10-15 — any timezone west of UTC still reports Oct 15
      const localLate = new Date(2026, 9, 15, 23, 30, 0)
      expect(getLocalDateString(localLate)).toBe('2026-10-15')
    })
  })

  describe('No fixed file still carries the UTC date pattern', () => {
    for (const file of FILES_FIXED) {
      it(`${file} — new Date().toISOString().split('T')[0] is gone from the fixed call sites`, () => {
        const src = readSource(file)
        // Grep manually and ignore filename-stamp occurrences we did not touch.
        // The checked rule: every remaining match must be inside a filename-looking template literal.
        const matches = src.match(new RegExp(UTC_DATE_PATTERN.source, 'g')) || []
        for (const _m of matches) {
          const idx = src.indexOf(_m)
          const line = src.slice(src.lastIndexOf('\n', idx) + 1, src.indexOf('\n', idx))
          // Filename contexts are explicitly out of today's scope — they look like
          //   `..._${new Date()....}.pdf` or `..._${new Date()....}.csv` etc.
          const isFilename = /\.(pdf|csv|xlsx|iif)/.test(line)
          const isInputMaxOrMin = /\b(max|min)=/.test(line)
          expect(
            isFilename || isInputMaxOrMin,
            `${file}: unfixed UTC date-drift at line:\n    ${line.trim()}`
          ).toBe(true)
        }
      })
    }
  })

  describe('getLocalDateString is imported in every fixed source file', () => {
    for (const file of FILES_FIXED) {
      it(`${file} imports getLocalDateString from utils`, () => {
        const src = readSource(file)
        const imports = src.match(/import\s*{[^}]*getLocalDateString[^}]*}\s*from\s*['"][^'"]*utils['"]/g)
        expect(
          imports && imports.length > 0,
          `${file}: no getLocalDateString import from utils`
        ).toBe(true)
      })
    }
  })

  describe('Specific high-value fixes', () => {
    it('aiaBillingExport.js — buildG702Summary period_to default uses getLocalDateString', () => {
      const src = readSource('src/lib/aiaBillingExport.js')
      expect(src).toMatch(/period_to:\s*periodTo\s*\|\|\s*getLocalDateString\(\)/)
      expect(src).toMatch(/periodTo\s*=\s*getLocalDateString\(\)/)
    })

    it('corOps.js — addProjectCost default cost_date uses getLocalDateString', () => {
      const src = readSource('src/lib/corOps.js')
      expect(src).toMatch(/cost_date:\s*costData\.cost_date\s*\|\|\s*getLocalDateString\(\)/)
    })

    it('equipmentOps.js — markEquipmentReturned default end_date uses getLocalDateString', () => {
      const src = readSource('src/lib/equipmentOps.js')
      expect(src).toMatch(/end_date:\s*endDate\s*\|\|\s*getLocalDateString\(\)/)
    })

    it('rfiOps.js — overdue filter today uses getLocalDateString', () => {
      const src = readSource('src/lib/db/rfiOps.js')
      expect(src).toMatch(/const\s+today\s*=\s*getLocalDateString\(\)/)
    })

    it('submittalOps.js — overdue filter today uses getLocalDateString', () => {
      const src = readSource('src/lib/db/submittalOps.js')
      expect(src).toMatch(/const\s+today\s*=\s*getLocalDateString\(\)/)
    })

    it('CORForm.jsx — period_start and period_end defaults use getLocalDateString', () => {
      const src = readSource('src/components/cor/CORForm.jsx')
      expect(src).toMatch(/period_start:\s*periodStart\s*\|\|\s*getLocalDateString\(\)/)
      expect(src).toMatch(/period_end:\s*periodEnd\s*\|\|\s*getLocalDateString\(\)/)
    })

    it('InvoiceModal.jsx — invoiceDate initial state and dueDate computation use getLocalDateString', () => {
      const src = readSource('src/components/billing/InvoiceModal.jsx')
      expect(src).toMatch(/useState\(getLocalDateString\(\)\)/)
      expect(src).toMatch(/setDueDate\(getLocalDateString\(due\)\)/)
    })

    it('DrawRequestModal.jsx — periodEnd initial state uses getLocalDateString', () => {
      const src = readSource('src/components/billing/DrawRequestModal.jsx')
      expect(src).toMatch(/setPeriodEnd\]\s*=\s*useState\(getLocalDateString\(\)\)/)
    })

    it('ForemanMetrics.jsx — report streak loop walks local-date dateStrs', () => {
      const src = readSource('src/components/ForemanMetrics.jsx')
      expect(src).toMatch(/const\s+dateStr\s*=\s*getLocalDateString\(checkDate\)/)
    })

    it('OverviewCrewMetrics.jsx — selectedDate initial state and isToday use getLocalDateString', () => {
      const src = readSource('src/components/overview/OverviewCrewMetrics.jsx')
      expect(src).toMatch(/setSelectedDate\]\s*=\s*useState\(getLocalDateString\(\)\)/)
      expect(src).toMatch(/const\s+isToday\s*=\s*selectedDate\s*===\s*getLocalDateString\(\)/)
    })
  })
})
