/**
 * Regression tests for the 2026-08-29 daily health check.
 *
 *   Bug A — Sage Job Cost CSV silently dropped every custom-named T&M
 *           material. `t_and_m_items` rows added through the "custom" flow
 *           carry `custom_name` / `custom_category` and set
 *           `material_equipment_id = null`, so the join to
 *           `materials_equipment` returns nothing. The exporter previously
 *           gated the row on `unitCost > 0`, which is impossible for a
 *           custom item, so the accountant's Sage import never saw the
 *           consumable that was actually used.
 *
 *   Bug B — useDashboardData summed `invoices.total` (INTEGER cents) as
 *           dollars into `project.totalBilled`. cashFlowCalculations then
 *           computed `unbilled = max(0, earned − billed)`; because cents is
 *           100× dollars, that clamped to 0 for every invoiced project and
 *           the projected-inflow chart understated monthly receivables by
 *           the entire unbilled amount.
 */

import { describe, it, expect } from 'vitest'
import { projectReceivables, CASH_FLOW_CONFIG } from '../lib/cashFlowCalculations.js'

// --------------------------------------------------------------------------
// Bug A — Sage Job Cost CSV row emission for custom T&M materials
// --------------------------------------------------------------------------

describe('Sage Job Cost CSV row emission for T&M materials', () => {
  // Mirror the description/unit-cost logic in sageExport.exportSageJobCostCSV.
  function buildRow(item) {
    const qty = parseFloat(item.quantity) || 0
    if (qty <= 0) return null
    const unitCost = parseFloat(item.materials_equipment?.cost_per_unit) || 0
    const catalogName = item.materials_equipment?.name
    const customName = item.custom_name
    const description = catalogName
      ? `Material - ${catalogName}`
      : customName
        ? `Material (custom) - ${customName}`
        : `Material - ${item.description || 'Unnamed item'}`
    return { description, units: qty, unitCost, amount: qty * unitCost }
  }

  it('emits a row for a catalog item with a joined materials_equipment record', () => {
    const item = {
      material_equipment_id: 'me-1',
      materials_equipment: { name: 'Rebar #4', cost_per_unit: 12 },
      quantity: 10,
    }
    const row = buildRow(item)
    expect(row).not.toBeNull()
    expect(row.description).toBe('Material - Rebar #4')
    expect(row.unitCost).toBe(12)
    expect(row.amount).toBe(120)
  })

  it('emits a row for a custom-named item with no catalog join and zero unit cost', () => {
    // Regression: pre-fix, the `unitCost > 0` guard skipped this entirely
    // and the custom consumable disappeared from the Sage import.
    const item = {
      material_equipment_id: null,
      custom_name: '6-mil poly sheeting',
      custom_category: 'Materials',
      materials_equipment: null,
      quantity: 5,
    }
    const row = buildRow(item)
    expect(row).not.toBeNull()
    expect(row.description).toBe('Material (custom) - 6-mil poly sheeting')
    expect(row.unitCost).toBe(0)
    expect(row.amount).toBe(0)
  })

  it('still skips zero-quantity rows (nothing to bill or track)', () => {
    expect(buildRow({ custom_name: 'foo', quantity: 0 })).toBeNull()
    expect(buildRow({ material_equipment_id: 'me-1', materials_equipment: { name: 'x', cost_per_unit: 5 }, quantity: 0 })).toBeNull()
  })

  it('regression: pre-fix guard "qty > 0 && unitCost > 0" swallowed every custom material', () => {
    const preFixEmits = (item) => {
      const qty = parseFloat(item.quantity) || 0
      const unitCost = item.materials_equipment?.cost_per_unit || 0
      return qty > 0 && unitCost > 0
    }
    const customItem = {
      material_equipment_id: null,
      custom_name: 'Silica dust vacuum bag',
      materials_equipment: null,
      quantity: 4,
    }
    expect(preFixEmits(customItem)).toBe(false)
    // The post-fix behaviour keeps the row.
    expect(buildRow(customItem)).not.toBeNull()
  })
})

// --------------------------------------------------------------------------
// Bug B — useDashboardData totalBilled cents-to-dollars conversion
// --------------------------------------------------------------------------

describe('useDashboardData totalBilled invoice normalization', () => {
  // Mirror of the totalBilled aggregation in useDashboardData.
  function totalBilledFor(projectInvoices) {
    return (projectInvoices || [])
      .filter((inv) => inv && inv.status !== 'draft' && inv.status !== 'void')
      .reduce((sum, inv) => {
        const totalCents = parseFloat(inv.total)
        if (Number.isFinite(totalCents)) return sum + totalCents / 100
        const amount = parseFloat(inv.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)
  }

  it('converts invoices.total (cents) into dollars', () => {
    const invoices = [
      { status: 'sent', total: 5_000_000 }, // $50,000
      { status: 'partial', total: 8_000_000 }, // $80,000
      { status: 'paid', total: 1_000_000 }, // $10,000
    ]
    expect(totalBilledFor(invoices)).toBe(140_000)
  })

  it('excludes draft and void invoices from the billed total', () => {
    const invoices = [
      { status: 'draft', total: 5_000_000 },
      { status: 'void', total: 5_000_000 },
      { status: 'sent', total: 3_000_000 },
    ]
    expect(totalBilledFor(invoices)).toBe(30_000)
  })

  it('falls back to a dollar `amount` field when `total` is absent', () => {
    // Some legacy code paths / test fixtures still pass a flat dollar
    // `amount` field; keep the fallback so we don't zero those out either.
    const invoices = [
      { status: 'sent', amount: 12_500 },
      { status: 'sent', total: 4_000_000 },
    ]
    expect(totalBilledFor(invoices)).toBe(52_500)
  })

  it('handles missing or malformed rows without throwing', () => {
    expect(totalBilledFor([])).toBe(0)
    expect(totalBilledFor(null)).toBe(0)
    expect(totalBilledFor([null, { status: 'sent' }])).toBe(0)
  })

  it('regression: cash-flow unbilled_earned no longer clamps to 0 when invoices are cents', () => {
    // A $500K project at 30% progress with $50K billed → unbilled $100K.
    const contractValue = 500_000
    const progress = 30
    const earned = (progress / 100) * contractValue
    const invoices = [
      { status: 'sent', total: 5_000_000 }, // $50,000 in cents
    ]

    // Pre-fix: totalBilled was 5_000_000 (cents summed as dollars), so
    // earned − billed = 150_000 − 5_000_000 = negative → clamped to 0.
    const preFixBilled = invoices.reduce((s, i) => s + parseFloat(i.total), 0)
    const preFixUnbilled = Math.max(0, earned - preFixBilled)
    expect(preFixBilled).toBe(5_000_000)
    expect(preFixUnbilled).toBe(0)

    // Post-fix: totalBilled = 50_000 dollars; unbilled = 100_000.
    const postFixBilled = totalBilledFor(invoices)
    const postFixUnbilled = Math.max(0, earned - postFixBilled)
    expect(postFixBilled).toBe(50_000)
    expect(postFixUnbilled).toBe(100_000)
  })

  it('projectReceivables sees a healthy unbilled entry when totalBilled is in dollars', () => {
    // Integration-style check: with dollar-denominated totalBilled the
    // cash-flow forecast produces a real unbilled_earned line.
    const projects = [
      {
        id: 'p1',
        name: 'Test',
        contract_value: 500_000,
        progress: 30,
        totalBilled: 50_000,
      },
    ]
    const result = projectReceivables(projects, [], CASH_FLOW_CONFIG)
    const unbilled = result.entries.find((e) => e.type === 'unbilled_earned' && e.projectId === 'p1')
    expect(unbilled).toBeDefined()
    expect(unbilled.amount).toBe(100_000)
  })
})
