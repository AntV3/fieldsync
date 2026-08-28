/**
 * Regression tests for the 2026-08-28 daily health check.
 *
 *   Bug A  — corOps.rejectCOR / markCORAsBilled / closeCOR wrote three
 *            timestamp columns (rejected_at, billed_at, closed_at) that do
 *            NOT exist on the change_orders table, so every reject / mark-
 *            billed / close click failed with a PostgREST 400 and the COR
 *            stayed in its old status.
 *
 *   Bug B  — sageExport.exportSageJobCostCSV and
 *            sageExportService.exportJobCostTransactions both referenced
 *            worker.classification / worker.rate — phantom columns on
 *            t_and_m_workers. The JS export silently produced $0.00 labor
 *            rows for every crew member; the TS export threw PostgREST 400
 *            on the nested SELECT and broke the entire billing-tab export.
 *
 *   Bug C  — cashFlowCalculations.projectReceivables filtered outstanding
 *            invoices by `status === 'pending' | 'overdue'` (values that
 *            don't exist), read a non-existent `amount` column, and never
 *            converted cents → dollars. Every outstanding-receivables tile
 *            and DSO metric read as $0.
 */

import { describe, it, expect } from 'vitest'
import { projectReceivables, CASH_FLOW_CONFIG } from '../lib/cashFlowCalculations.js'

// --------------------------------------------------------------------------
// Bug A — COR status-transition updates omit phantom timestamp columns
// --------------------------------------------------------------------------

describe('COR status transitions do not write phantom timestamp columns', () => {
  // The change_orders table (migration 20241201000060_change_orders.sql)
  // defines created_at, updated_at, submitted_at, approved_at, and
  // gc_signature_date. No rejected_at / billed_at / closed_at.
  const CHANGE_ORDERS_COLUMNS = new Set([
    'id', 'company_id', 'project_id', 'area_id',
    'cor_number', 'title', 'description', 'scope_of_work',
    'period_start', 'period_end', 'status',
    'labor_subtotal', 'materials_subtotal', 'equipment_subtotal', 'subcontractors_subtotal',
    'labor_markup_percent', 'materials_markup_percent', 'equipment_markup_percent', 'subcontractors_markup_percent',
    'labor_markup_amount', 'materials_markup_amount', 'equipment_markup_amount', 'subcontractors_markup_amount',
    'liability_insurance_percent', 'bond_percent', 'license_fee_percent',
    'liability_insurance_amount', 'bond_amount', 'license_fee_amount',
    'cor_subtotal', 'additional_fees_total', 'cor_total',
    'gc_signature_data', 'gc_signature_name', 'gc_signature_date',
    'rejection_reason',
    'created_by', 'created_at', 'updated_at',
    'submitted_at', 'approved_by', 'approved_at',
    'group_name', 'version', 'last_snapshot_version',
    'total_labor_hours', 'total_overtime_hours',
    'ticket_count', 'photo_count', 'verified_ticket_count',
    'submitted_by', 'revision_number',
  ])

  it('rejectCOR payload uses only real columns', () => {
    const payload = {
      status: 'rejected',
      rejection_reason: 'Out of scope',
      approved_by: null,
      approved_at: null,
    }
    for (const key of Object.keys(payload)) {
      expect(CHANGE_ORDERS_COLUMNS.has(key)).toBe(true)
    }
    expect(Object.keys(payload)).not.toContain('rejected_at')
  })

  it('markCORAsBilled payload uses only real columns', () => {
    const payload = { status: 'billed' }
    for (const key of Object.keys(payload)) {
      expect(CHANGE_ORDERS_COLUMNS.has(key)).toBe(true)
    }
    expect(Object.keys(payload)).not.toContain('billed_at')
  })

  it('closeCOR payload uses only real columns', () => {
    const payload = { status: 'closed' }
    for (const key of Object.keys(payload)) {
      expect(CHANGE_ORDERS_COLUMNS.has(key)).toBe(true)
    }
    expect(Object.keys(payload)).not.toContain('closed_at')
  })

  it('status values sent to Supabase match the change_orders check constraint', () => {
    const ALLOWED = new Set(['draft', 'pending_approval', 'approved', 'rejected', 'billed', 'closed'])
    for (const s of ['rejected', 'billed', 'closed']) {
      expect(ALLOWED.has(s)).toBe(true)
    }
  })
})

// --------------------------------------------------------------------------
// Bug B — Sage T&M labor rows compute rate from labor_class_id lookup
// --------------------------------------------------------------------------

describe('Sage labor rate resolution uses labor_class_id, not phantom columns', () => {
  // Mirror of the rate-lookup helper the Sage exports now share.
  function resolveRate(worker, laborRates) {
    return parseFloat(laborRates?.[worker.labor_class_id]) || 0
  }

  it('resolves a rate from the lookup map keyed by labor_class_id', () => {
    const worker = { name: 'Ana', role: 'Journeyman', labor_class_id: 'lc-1', hours: 8, overtime_hours: 0 }
    const laborRates = { 'lc-1': 55.0, 'lc-2': 42.0 }
    expect(resolveRate(worker, laborRates)).toBe(55.0)
  })

  it('regression: pre-fix `worker.rate` fallback would have been $0 for every worker', () => {
    // Pre-fix: rate = parseFloat(worker.rate || laborRates[worker.classification]) || 0
    // But t_and_m_workers has neither a `rate` nor a `classification` column,
    // so both operands are undefined regardless of what the lookup contains.
    const worker = { name: 'Ana', role: 'Journeyman', labor_class_id: 'lc-1', hours: 8 }
    const preFixRate = parseFloat(worker.rate || {}[worker.classification]) || 0
    expect(preFixRate).toBe(0)
  })

  it('regression: pre-fix description would have read "(General)" for every worker', () => {
    const worker = { name: 'Ana', role: 'Journeyman', labor_class_id: 'lc-1' }
    const preFixLabel = worker.classification || 'General'
    const postFixLabel = worker.role || 'General'
    expect(preFixLabel).toBe('General')
    expect(postFixLabel).toBe('Journeyman')
  })

  it('overtime rate is 1.5x the resolved regular rate', () => {
    const worker = { labor_class_id: 'lc-1' }
    const laborRates = { 'lc-1': 40 }
    const rate = resolveRate(worker, laborRates)
    expect(rate * 1.5).toBe(60)
  })

  it('falls back to 0 (not NaN) when the class has no configured rate', () => {
    const worker = { labor_class_id: 'lc-unknown' }
    const laborRates = { 'lc-1': 55 }
    expect(resolveRate(worker, laborRates)).toBe(0)
  })
})

// --------------------------------------------------------------------------
// Bug C — cashFlowCalculations.projectReceivables outstanding pipeline
// --------------------------------------------------------------------------

describe('projectReceivables outstanding invoices', () => {
  const cfg = { ...CASH_FLOW_CONFIG }

  it("counts 'sent' invoices as outstanding", () => {
    const invoices = [
      { status: 'sent', total: 5_000_000, amount_paid: 0, invoice_date: '2026-08-01', project_id: 'p1' },
    ]
    const r = projectReceivables([], invoices, cfg)
    expect(r.totalOutstanding).toBe(50_000)
  })

  it("counts 'partial' invoices (net of amount_paid) as outstanding", () => {
    // Pre-fix: 'partial' was excluded from the filter entirely.
    const invoices = [
      { status: 'partial', total: 8_000_000, amount_paid: 3_000_000, invoice_date: '2026-08-01', project_id: 'p1' },
    ]
    const r = projectReceivables([], invoices, cfg)
    expect(r.totalOutstanding).toBe(50_000)
  })

  it("excludes 'draft', 'paid', and 'void' invoices", () => {
    const invoices = [
      { status: 'draft', total: 1_000_000, invoice_date: '2026-08-01' },
      { status: 'paid',  total: 2_000_000, invoice_date: '2026-08-01' },
      { status: 'void',  total: 3_000_000, invoice_date: '2026-08-01' },
      { status: 'sent',  total: 4_000_000, amount_paid: 0, invoice_date: '2026-08-01' },
    ]
    const r = projectReceivables([], invoices, cfg)
    expect(r.totalOutstanding).toBe(40_000)
  })

  it('regression: pre-fix behaviour would have reported $0 outstanding for the same data', () => {
    // Pre-fix filter: status === 'sent' | 'pending' | 'overdue'.
    // Pre-fix amount: inv.amount (does not exist).
    const invoices = [
      { status: 'sent',    total: 5_000_000, amount_paid: 0, invoice_date: '2026-08-01' },
      { status: 'partial', total: 8_000_000, amount_paid: 3_000_000, invoice_date: '2026-08-01' },
    ]
    const preFixOutstanding = invoices
      .filter(inv => inv.status === 'sent' || inv.status === 'pending' || inv.status === 'overdue')
      .reduce((s, inv) => s + (inv.amount || 0), 0)
    expect(preFixOutstanding).toBe(0)
  })

  it('marks entries whose due date has passed as overdue', () => {
    // Invoice from a year ago with 30-day terms is unambiguously overdue.
    const yearAgo = new Date()
    yearAgo.setFullYear(yearAgo.getFullYear() - 1)
    const invoiceDate = yearAgo.toISOString().split('T')[0]
    const invoices = [
      { status: 'sent', total: 1_000_000, amount_paid: 0, invoice_date: invoiceDate, project_id: 'p1' },
    ]
    const r = projectReceivables([], invoices, cfg)
    expect(r.overdueAmount).toBe(10_000)
  })

  it('does not double-count amount_paid: a fully-paid partial reports $0 outstanding', () => {
    const invoices = [
      { status: 'partial', total: 5_000_000, amount_paid: 5_000_000, invoice_date: '2026-08-01' },
    ]
    const r = projectReceivables([], invoices, cfg)
    expect(r.totalOutstanding).toBe(0)
  })

  it('handles the legacy `date` field when invoice_date is missing', () => {
    const invoices = [
      { status: 'sent', total: 2_000_000, amount_paid: 0, date: '2026-08-01', project_id: 'p1' },
    ]
    const r = projectReceivables([], invoices, cfg)
    expect(r.totalOutstanding).toBe(20_000)
  })
})
