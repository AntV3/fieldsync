import { describe, it, expect } from 'vitest'
import { projectReceivables, CASH_FLOW_CONFIG } from '../lib/cashFlowCalculations'

describe('projectReceivables outstanding-invoice filter', () => {
  const now = new Date()
  const invoices = [
    { id: 'draft-1', status: 'draft', amount: 1000, project_id: 'p', created_at: now.toISOString() },
    { id: 'sent-1', status: 'sent', amount: 2000, project_id: 'p', created_at: now.toISOString() },
    { id: 'partial-1', status: 'partial', amount: 3000, project_id: 'p', created_at: now.toISOString() },
    { id: 'paid-1', status: 'paid', amount: 4000, project_id: 'p', created_at: now.toISOString() },
    { id: 'void-1', status: 'void', amount: 5000, project_id: 'p', created_at: now.toISOString() }
  ]

  it('includes both sent AND partial invoices as outstanding receivables', () => {
    const result = projectReceivables([], invoices, CASH_FLOW_CONFIG)
    const outstanding = result.entries.filter(e => e.type === 'outstanding').map(e => e.amount)
    expect(outstanding).toContain(2000)
    expect(outstanding).toContain(3000) // was dropped before the fix
    expect(result.totalOutstanding).toBe(2000 + 3000)
  })

  it('excludes draft, paid, and void invoices', () => {
    const result = projectReceivables([], invoices, CASH_FLOW_CONFIG)
    const outstanding = result.entries.filter(e => e.type === 'outstanding').map(e => e.amount)
    expect(outstanding).not.toContain(1000)
    expect(outstanding).not.toContain(4000)
    expect(outstanding).not.toContain(5000)
  })
})
