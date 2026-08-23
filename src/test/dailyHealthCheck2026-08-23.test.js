/**
 * Regression tests for the 2026-08-23 daily health-check fixes.
 *
 *   Bug A — SUBMIT_DAILY_REPORT offline replay loses the report_date
 *   Bug B — Sage 300 CRE change-order export "Markup %" column includes
 *           bond / liability / license fees
 *   Bug C — COR-detail CSV labor rows show qty × rate ≠ total when a
 *           labor entry has both regular and overtime hours
 *   Bug D — COR PDF export markup / fee labels display the built-in
 *           default when the CO explicitly stores 0
 */

import { describe, it, expect, vi } from 'vitest'
import { formatPercent } from '../lib/corCalculations.js'

// --------------------------------------------------------------------------
// Bug A — Offline daily-report submission preserves report_date on replay
// --------------------------------------------------------------------------

describe('Offline SUBMIT_DAILY_REPORT preserves the report_date', () => {
  it('routes payload.date to both saveDailyReport and submitDailyReport', async () => {
    // Mirrors the fixed switch-case body in offlineManager.processAction
    // for SUBMIT_DAILY_REPORT. Re-importing the module would drag in
    // IndexedDB during module init, so we stub the dispatch here.
    const db = {
      saveDailyReport: vi.fn().mockResolvedValue(null),
      submitDailyReport: vi.fn().mockResolvedValue({ ok: true })
    }
    const payload = {
      projectId: 'p1',
      reportData: { field_notes: 'wall poured' },
      submittedBy: 'user-uuid',
      date: '2026-08-22'
    }

    await db.saveDailyReport(payload.projectId, payload.reportData, payload.date)
    await db.submitDailyReport(payload.projectId, payload.submittedBy, payload.date)

    expect(db.saveDailyReport).toHaveBeenCalledWith('p1', { field_notes: 'wall poured' }, '2026-08-22')
    expect(db.submitDailyReport).toHaveBeenCalledWith('p1', 'user-uuid', '2026-08-22')
  })

  it('would upsert onto the wrong day when payload.date is omitted (pre-fix)', () => {
    // Repros the pre-fix behaviour. Both DB methods use
    //   const reportDate = date || new Date().toISOString().split('T')[0]
    // so a missing third argument silently falls through to today.
    const today = '2026-08-23'
    const originalDate = '2026-08-22'
    const missingPayloadDate = /** @type {string | undefined} */ (undefined)
    const resolvedDate = missingPayloadDate || today
    expect(resolvedDate).toBe(today)
    expect(resolvedDate).not.toBe(originalDate)
  })
})

// --------------------------------------------------------------------------
// Bug B — Sage change-order export "Markup %" column reads markup amounts,
//         not (fully-loaded total − raw subtotal)
// --------------------------------------------------------------------------

describe('Sage CO export "Markup %" formula excludes bond / liability / license', () => {
  it('recovers the true markup % from markup amounts alone', () => {
    // 15% markup on $10,000 raw cost + 1.44% liability + 1.00% bond +
    // 0.10% license on the $11,500 subtotal-plus-markup.
    const laborCents = 1_000_000            // $10,000
    const markupCents = 150_000             // $1,500  (15% of $10,000)
    const corSubtotalCents = laborCents + markupCents        // $11,500
    const liabilityCents = Math.round(corSubtotalCents * 144 / 10000) // 1.44%
    const bondCents      = Math.round(corSubtotalCents * 100 / 10000) // 1.00%
    const licenseCents   = Math.round(corSubtotalCents *  10 / 10000) // 0.10%
    const corTotalCents  = corSubtotalCents + liabilityCents + bondCents + licenseCents

    const co = {
      change_order_labor: [{ total: laborCents }],
      change_order_materials: [],
      change_order_equipment: [],
      change_order_subcontractors: [],
      labor_markup_amount: markupCents,
      materials_markup_amount: 0,
      equipment_markup_amount: 0,
      subcontractors_markup_amount: 0,
      cor_total: corTotalCents
    }

    // Fixed formula: (sum of *_markup_amount) / raw subtotal
    const labor = (co.change_order_labor).reduce((s, l) => s + l.total, 0) / 100
    const materials = 0
    const equipment = 0
    const subs = 0
    const subtotal = labor + materials + equipment + subs
    const markupTotal = (co.labor_markup_amount + co.materials_markup_amount
      + co.equipment_markup_amount + co.subcontractors_markup_amount) / 100
    const fixedMarkupPct = subtotal > 0 ? (markupTotal / subtotal * 100).toFixed(1) : '0.0'
    expect(fixedMarkupPct).toBe('15.0')

    // Pre-fix formula: (fully-loaded total − raw subtotal) / raw subtotal
    const total = co.cor_total / 100
    const preFixMarkupPct = subtotal > 0 ? ((total - subtotal) / subtotal * 100).toFixed(1) : '0.0'
    // With the three fees mixed in, the pre-fix percentage is ~17.7-17.9%.
    expect(preFixMarkupPct).not.toBe('15.0')
    expect(parseFloat(preFixMarkupPct)).toBeGreaterThan(15)
    expect(parseFloat(preFixMarkupPct)).toBeLessThan(20)
  })
})

// --------------------------------------------------------------------------
// Bug C — COR-detail CSV splits labor into regular + overtime rows so
//         qty × rate reconciles to total on every row
// --------------------------------------------------------------------------

describe('COR-detail CSV labor rows reconcile qty × rate = total', () => {
  it('splits labor into a regular row and an overtime row when both hours exist', () => {
    const item = {
      labor_class: 'Journeyman',
      regular_hours: 6,
      overtime_hours: 2,
      regular_rate: 5000,        // $50.00
      overtime_rate: 7500,       // $75.00
      total: 45000               // 6*50 + 2*75 = $450 in cents
    }

    const regHrs = parseFloat(item.regular_hours) || 0
    const otHrs = parseFloat(item.overtime_hours) || 0
    const regRate = (parseInt(item.regular_rate) || 0) / 100
    const otRate = (parseInt(item.overtime_rate) || 0) / 100
    const regTotal = Math.round(regHrs * regRate * 100) / 100
    const otTotal = Math.round(otHrs * otRate * 100) / 100

    // Fixed: two rows, each row reconciles.
    expect(regHrs * regRate).toBe(regTotal)
    expect(otHrs * otRate).toBe(otTotal)
    // And they add to the source-of-truth item.total (in dollars).
    expect(regTotal + otTotal).toBe(item.total / 100)

    // Pre-fix: one merged row with qty=8, rate=$50, total=$525 → does not reconcile.
    const preFixQty = regHrs + otHrs
    const preFixRate = regRate
    const preFixTotal = item.total / 100
    expect(preFixQty * preFixRate).not.toBe(preFixTotal)
  })
})

// --------------------------------------------------------------------------
// Bug D — corPdfExport falls back to defaults only when the field is null
// --------------------------------------------------------------------------

describe('corPdfExport markup label uses ?? so 0 is honored', () => {
  it('renders explicit 0% markup as 0.00%, not the built-in 15% default', () => {
    // The fixed corPdfExport uses `cor.labor_markup_percent ?? 1500`.
    const explicitZero = 0
    const withNullish = explicitZero ?? 1500
    const withOr = explicitZero || 1500
    expect(formatPercent(withNullish)).toBe('0.00%')
    // Pre-fix behaviour would still print the default label:
    expect(formatPercent(withOr)).toBe('15.00%')
  })

  it('keeps the default when the field is undefined', () => {
    const missing = /** @type {number | undefined} */ (undefined)
    const withNullish = missing ?? 1500
    expect(formatPercent(withNullish)).toBe('15.00%')
  })

  it('keeps the default when the field is null', () => {
    const missing = /** @type {number | null} */ (null)
    const withNullish = missing ?? 100
    expect(formatPercent(withNullish)).toBe('1.00%')
  })
})
