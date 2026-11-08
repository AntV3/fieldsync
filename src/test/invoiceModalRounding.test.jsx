import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// db.createInvoice is where line items land in cents. This test guards the
// conversion for a T&M ticket whose change_order_value doesn't float-convert
// cleanly (1234.56 * 100 === 123456.00000000001 in IEEE-754), which would
// either break the INTEGER column insert or silently drop a cent.

const { createInvoice, getNextInvoiceNumber, markItemsBilled } = vi.hoisted(() => ({
  createInvoice: vi.fn().mockResolvedValue({ id: 'inv-1' }),
  getNextInvoiceNumber: vi.fn().mockResolvedValue('2026-0001'),
  markItemsBilled: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/supabase', () => ({
  db: { createInvoice, getNextInvoiceNumber, markItemsBilled },
}))

import InvoiceModal from '../components/billing/InvoiceModal'

describe('InvoiceModal line-item amount (dollars → cents)', () => {
  beforeEach(() => {
    createInvoice.mockClear()
    getNextInvoiceNumber.mockClear()
  })

  it('converts a T&M ticket change_order_value to an INTEGER number of cents', async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const project = { id: 'proj-1', name: 'Sunrise' }
    const company = { id: 'co-1', name: 'Acme' }
    const user = { id: 'u-1', name: 'Pat' }

    // 1234.56 * 100 === 123456.00000000001 — the exact float-drift case the
    // old code shipped into invoice_items.amount (declared INTEGER).
    const tickets = [{
      id: 't-1',
      ce_pco_number: 'PCO-1',
      work_date: '2026-11-05',
      change_order_value: 1234.56,
    }]

    render(
      <InvoiceModal
        project={project}
        company={company}
        user={user}
        selectedItems={{ cors: [], tickets }}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => expect(getNextInvoiceNumber).toHaveBeenCalled())

    const createBtn = await screen.findByRole('button', { name: /create invoice/i })
    fireEvent.click(createBtn)

    await waitFor(() => expect(createInvoice).toHaveBeenCalled())
    const [, items] = createInvoice.mock.calls[0]
    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(123456)
    expect(Number.isInteger(items[0].amount)).toBe(true)
  })

  it('rounds cent-rounding edge cases the same way for pennies like .33 and .67', async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const project = { id: 'proj-1', name: 'Sunrise' }
    const company = { id: 'co-1', name: 'Acme' }
    const user = { id: 'u-1', name: 'Pat' }

    const tickets = [
      { id: 't-1', ce_pco_number: '1', work_date: '2026-11-05', change_order_value: 1500.33 },
      { id: 't-2', ce_pco_number: '2', work_date: '2026-11-06', change_order_value: 42.67 },
    ]

    render(
      <InvoiceModal
        project={project}
        company={company}
        user={user}
        selectedItems={{ cors: [], tickets }}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    )

    await waitFor(() => expect(getNextInvoiceNumber).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: /create invoice/i }))

    await waitFor(() => expect(createInvoice).toHaveBeenCalled())
    const [, items] = createInvoice.mock.calls[0]
    expect(items.map(i => i.amount)).toEqual([150033, 4267])
    expect(items.every(i => Number.isInteger(i.amount))).toBe(true)
  })
})
