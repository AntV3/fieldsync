/**
 * Pending-approval count consistency
 *
 * Three surfaces on the office dashboard show a "pending approvals" count for
 * a project:
 *   1. Financials tab badge (`ProjectDetailView` line ~85)
 *   2. Pending Approvals banner below the sticky header (`ProjectDetailView` ~125)
 *   3. Overview "Open approvals" KPI card (`OverviewTab` ~60)
 *
 * All three must agree. Before this test they didn't: the tab badge used
 * `changeOrderPending` (pending T&M tickets tagged with a CE/PCO number,
 * from `getChangeOrderTotals`) while the banner and KPI used `corPendingCount`
 * (COR rows from `change_orders`, from `getCORStats`). Those are entirely
 * disjoint datasets and can — and do — disagree.
 *
 * This test locks in the single source of truth:
 *     pendingApprovals = pendingTickets + corPendingCount
 * and guards against the badge silently drifting back to a different formula.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const detailView = readFileSync(resolve(here, '../components/dashboard/ProjectDetailView.jsx'), 'utf8')
const overview = readFileSync(resolve(here, '../components/dashboard/tabs/OverviewTab.jsx'), 'utf8')

describe('Pending-approval count is consistent across the three surfaces', () => {
  it('Financials tab badge sums pendingTickets + corPendingCount', () => {
    // The badge is derived from a `pendingCount` local. Make sure it uses the
    // shared formula, not the deprecated changeOrderPending.
    expect(detailView).toMatch(
      /const pendingCount = \(projectData\?\.pendingTickets \|\| 0\) \+ \(projectData\?\.corPendingCount \|\| 0\)/
    )
    expect(detailView).not.toMatch(/pendingTickets[^\n]*\+[^\n]*changeOrderPending/)
  })

  it('PendingApprovalsBanner uses the same formula', () => {
    expect(detailView).toMatch(
      /pendingCount=\{\(projectData\?\.pendingTickets \|\| 0\) \+ \(projectData\?\.corPendingCount \|\| 0\)\}/
    )
  })

  it('Overview KPI card uses the same formula', () => {
    expect(overview).toMatch(
      /const pendingApprovalCount = \(projectData\?\.pendingTickets \|\| 0\) \+ \(projectData\?\.corPendingCount \|\| 0\)/
    )
  })

  it('Overview "Needs Attention" row for CORs uses corPendingCount (not changeOrderPending)', () => {
    // Labelling changeOrderPending as "change orders pending" was misleading —
    // it actually counts pending T&M tickets that carry a CE/PCO number.
    expect(overview).toMatch(/if \(projectData\?\.corPendingCount > 0\)/)
    expect(overview).not.toMatch(/if \(projectData\?\.changeOrderPending > 0\)/)
  })
})
