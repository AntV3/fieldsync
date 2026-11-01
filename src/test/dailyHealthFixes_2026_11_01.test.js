/**
 * Daily health-check regression suite (2026-11-01)
 *
 * Guards against the T&M status-taxonomy regressions that survived PR #356
 * (which added the full `pending → foreman_signed → client_signed → approved
 *  → billed` lifecycle plus the `tmStatus.js` helpers):
 *
 *   1. ForemanMetrics.jsx filtered `pendingTickets` and `signedTickets` with
 *      the old enum ('pending', 'draft', 'signed') and never counted the
 *      real intermediate states. A foreman who had signed and submitted
 *      five tickets saw "0 signed, 0 pending" on their metrics page.
 *   2. ForemanMetrics.jsx totalled T&M value from `t.total_amount`, a column
 *      that does not exist on t_and_m_tickets. The billable amount lives on
 *      `change_order_value` (dollars). The Time & Material Value tile never
 *      rendered because the summed value was always 0.
 *   3. tmOps.getChangeOrderTotals counted the office-side "pending" bucket
 *      with `ticket.status === 'pending'`, so field-submitted tickets
 *      (which arrive as 'foreman_signed') never reached the office
 *      dashboard's "N change orders pending" attention item.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { isAwaitingApproval, TM_AWAITING_APPROVAL_STATUSES } from '../lib/tmStatus'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoFile = (p) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8')

// ============================================================
// 1 & 2. ForemanMetrics — correct status filters, real value column
// ============================================================

describe('ForemanMetrics — T&M status filters follow the real lifecycle', () => {
  const src = repoFile('src/components/ForemanMetrics.jsx')

  it('counts pending via isAwaitingApproval, never the stale (pending || draft) pair', () => {
    expect(src).toMatch(/isAwaitingApproval\(t\.status\)/)
    expect(src).not.toMatch(/t\.status === 'pending' \|\| t\.status === 'draft'/)
  })

  it('counts signed via the real statuses (foreman_signed, client_signed, approved, billed)', () => {
    expect(src).toMatch(/'foreman_signed'/)
    expect(src).toMatch(/'client_signed'/)
    // The old phantom 'signed' label must not survive.
    expect(src).not.toMatch(/t\.status === 'signed'/)
  })

  it('totals ticket value from change_order_value, not the phantom total_amount column', () => {
    expect(src).toMatch(/change_order_value/)
    // t_and_m_tickets has no total_amount column — see migrations for the
    // columns that do exist (approved_by_*, change_order_value, …).
    expect(src).not.toMatch(/t\.total_amount/)
  })

  it('isAwaitingApproval covers every state the office still has to act on', () => {
    expect(TM_AWAITING_APPROVAL_STATUSES).toEqual(expect.arrayContaining([
      'pending', 'foreman_signed', 'client_signed'
    ]))
    expect(isAwaitingApproval('pending')).toBe(true)
    expect(isAwaitingApproval('foreman_signed')).toBe(true)
    expect(isAwaitingApproval('client_signed')).toBe(true)
    expect(isAwaitingApproval('approved')).toBe(false)
    expect(isAwaitingApproval('billed')).toBe(false)
    expect(isAwaitingApproval('rejected')).toBe(false)
  })
})

// ============================================================
// 3. tmOps.getChangeOrderTotals — pending bucket spans the whole wait
// ============================================================

describe('getChangeOrderTotals — pending count includes field-signed tickets', () => {
  const src = repoFile('src/lib/db/tmOps.js')

  it('routes the "office still has to act" bucket through isAwaitingApproval', () => {
    expect(src).toMatch(/isAwaitingApproval\(ticket\.status\)/)
    // The old bare-equality check would miss foreman_signed and client_signed.
    expect(src).not.toMatch(/else if \(ticket\.status === 'pending'\)/)
  })

  it('imports the shared status helper so the enum stays in one place', () => {
    expect(src).toMatch(/from '\.\.\/tmStatus'/)
  })

  it('approved + billed are still the only statuses that add to totalApproved', () => {
    // Guard against a different kind of regression: inflating revenue by
    // double-counting signed-but-not-yet-approved tickets as approved.
    expect(src).toMatch(/ticket\.status === 'approved' \|\| ticket\.status === 'billed'/)
  })
})
