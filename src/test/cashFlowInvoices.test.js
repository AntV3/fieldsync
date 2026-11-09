import { describe, it, expect } from 'vitest'
import { projectReceivables } from '../lib/cashFlowCalculations'

const CFG = { receivableDays: 30, retentionPercent: 10, billingCycleWeeks: 4, forecastMonths: 6 }

describe('projectReceivables - invoice schema alignment', () => {
  it('converts invoices.total (cents) to dollars for the outstanding entry amount', () => {
    const now = new Date()
    const invoices = [
      {
        id: 'inv-1',
        project_id: 'p-1',
        status: 'sent',
        total: 1200000,       // $12,000 in cents (migration 20241201000050_billing.sql)
        amount_paid: 0,
        invoice_date: now.toISOString().slice(0, 10),
        created_at: now.toISOString(),
      },
    ]

    const result = projectReceivables([], invoices, CFG)
    const outstanding = result.entries.filter(e => e.type === 'outstanding')

    expect(outstanding).toHaveLength(1)
    // The pre-fix code read a non-existent inv.amount column and pushed 0,
    // so a $12k outstanding invoice contributed $0 to the forecast.
    expect(outstanding[0].amount).toBe(12000)
    expect(result.totalOutstanding).toBe(12000)
  })

  it('nets amount_paid out of a partial-pay invoice', () => {
    const invoices = [
      {
        id: 'inv-2',
        project_id: 'p-1',
        status: 'partial',
        total: 500000,        // $5,000 billed
        amount_paid: 150000,  // $1,500 already paid
        created_at: new Date().toISOString(),
      },
    ]

    const result = projectReceivables([], invoices, CFG)
    const outstanding = result.entries.filter(e => e.type === 'outstanding')

    expect(outstanding).toHaveLength(1)
    expect(outstanding[0].amount).toBe(3500) // $5000 - $1500 outstanding
  })

  it('ignores invoices whose status is not sent or partial', () => {
    // The invoices.status CHECK constraint allows draft/sent/partial/paid/void;
    // the prior 'pending'/'overdue' filter never matched any real row, and now
    // paid/void/draft must stay excluded.
    const invoices = [
      { id: 'd', status: 'draft',   total: 100000, created_at: new Date().toISOString() },
      { id: 'p', status: 'paid',    total: 200000, created_at: new Date().toISOString() },
      { id: 'v', status: 'void',    total: 300000, created_at: new Date().toISOString() },
      { id: 'x', status: 'pending', total: 400000, created_at: new Date().toISOString() }, // not a real status
    ]

    const result = projectReceivables([], invoices, CFG)
    expect(result.entries.filter(e => e.type === 'outstanding')).toHaveLength(0)
    expect(result.totalOutstanding).toBe(0)
  })

  it('skips an invoice whose outstanding balance is zero or negative', () => {
    const invoices = [
      {
        id: 'overpaid',
        status: 'partial',
        total: 100000,
        amount_paid: 100000, // fully paid but still flagged partial
        created_at: new Date().toISOString(),
      },
    ]

    const result = projectReceivables([], invoices, CFG)
    expect(result.entries.filter(e => e.type === 'outstanding')).toHaveLength(0)
  })

  it('uses invoice_date (the real column) for the entry date', () => {
    const invoices = [
      {
        id: 'd1',
        status: 'sent',
        total: 100000,
        invoice_date: '2026-06-15',
        created_at: '2026-06-20T10:00:00Z',
      },
    ]
    const result = projectReceivables([], invoices, CFG)
    const entry = result.entries.find(e => e.type === 'outstanding')
    expect(entry.date).toBe('2026-06-15')
  })
})
