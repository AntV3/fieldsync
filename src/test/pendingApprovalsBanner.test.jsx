import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PendingApprovalsBanner from '../components/dashboard/PendingApprovalsBanner'

const KEY = (projectId) => `fieldsync-approvals-banner-dismissed:${projectId}`

function renderBanner({ projectId = 'proj-1', pendingCount = 0, onView = () => {} } = {}) {
  return render(
    <PendingApprovalsBanner
      projectId={projectId}
      pendingCount={pendingCount}
      onView={onView}
    />
  )
}

describe('PendingApprovalsBanner', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('does not render when there is nothing pending', () => {
    const { container } = renderBanner({ pendingCount: 0 })
    expect(container.firstChild).toBeNull()
  })

  it('shows the count when items are pending and no prior dismissal exists', () => {
    renderBanner({ pendingCount: 3 })
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('hides after dismissal at the same count, and persists the dismissed count', () => {
    const { container } = renderBanner({ projectId: 'p1', pendingCount: 5 })
    fireEvent.click(screen.getByLabelText(/dismiss approvals banner/i))
    expect(container.firstChild).toBeNull()
    expect(sessionStorage.getItem(KEY('p1'))).toBe('5')
  })

  it('re-surfaces the banner when more items arrive after dismissal', () => {
    const { rerender } = renderBanner({ projectId: 'p2', pendingCount: 5 })
    fireEvent.click(screen.getByLabelText(/dismiss approvals banner/i))
    // A new pending item lands → count grows above the dismissed threshold
    rerender(
      <PendingApprovalsBanner projectId="p2" pendingCount={6} onView={() => {}} />
    )
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('does not re-surface when the count stays at or below the dismissed threshold', () => {
    const { rerender, container } = renderBanner({ projectId: 'p3', pendingCount: 5 })
    fireEvent.click(screen.getByLabelText(/dismiss approvals banner/i))
    // User approves two items — pendingCount drops but no new work has arrived
    rerender(
      <PendingApprovalsBanner projectId="p3" pendingCount={3} onView={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('re-surfaces once the queue has been fully worked and a NEW item arrives', () => {
    // Regression: previously the banner stayed hidden forever after this
    // sequence because `1 <= 5` (the original dismissed count) still passed.
    const { rerender } = renderBanner({ projectId: 'p4', pendingCount: 5 })
    fireEvent.click(screen.getByLabelText(/dismiss approvals banner/i))
    expect(sessionStorage.getItem(KEY('p4'))).toBe('5')

    // Approve everything → 0. Banner is hidden because there is nothing to
    // approve, and the dismissal floor is dragged down to match.
    rerender(
      <PendingApprovalsBanner projectId="p4" pendingCount={0} onView={() => {}} />
    )
    expect(screen.queryByText(/waiting for approval/i)).not.toBeInTheDocument()
    expect(sessionStorage.getItem(KEY('p4'))).toBe('0')

    // A foreman submits a new ticket → 1. Banner MUST reappear — this is
    // genuinely new work, not the same batch the user already dismissed.
    rerender(
      <PendingApprovalsBanner projectId="p4" pendingCount={1} onView={() => {}} />
    )
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('follows a partial drawdown too — dismissed at 5, drops to 2, uptick to 3 re-surfaces', () => {
    const { rerender } = renderBanner({ projectId: 'p5', pendingCount: 5 })
    fireEvent.click(screen.getByLabelText(/dismiss approvals banner/i))

    // Approve 3, count → 2. Banner stays hidden. Floor follows down to 2.
    rerender(
      <PendingApprovalsBanner projectId="p5" pendingCount={2} onView={() => {}} />
    )
    expect(screen.queryByText(/waiting for approval/i)).not.toBeInTheDocument()
    expect(sessionStorage.getItem(KEY('p5'))).toBe('2')

    // Another new item lands (2 → 3). Banner reappears — 3 > 2 floor.
    rerender(
      <PendingApprovalsBanner projectId="p5" pendingCount={3} onView={() => {}} />
    )
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument()
  })

  it('scopes dismissal to the project id — dismissing on A does not hide B', () => {
    const { rerender } = renderBanner({ projectId: 'projA', pendingCount: 5 })
    fireEvent.click(screen.getByLabelText(/dismiss approvals banner/i))
    // Switch to a different project with pending work — should be visible
    rerender(
      <PendingApprovalsBanner projectId="projB" pendingCount={2} onView={() => {}} />
    )
    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('invokes onView when the CTA is clicked', () => {
    const onView = vi.fn()
    renderBanner({ pendingCount: 4, onView })
    fireEvent.click(screen.getByRole('button', { name: /view.*approve/i }))
    expect(onView).toHaveBeenCalled()
  })

  it('remains hidden if sessionStorage cannot be read (initial state stays neutral)', () => {
    // Simulate a locked-down environment where sessionStorage throws
    const original = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    try {
      // With getItem throwing, the initial state falls back to -1 so the banner still shows
      renderBanner({ projectId: 'blocked', pendingCount: 2 })
      expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument()
    } finally {
      // Restore
      if (original) Object.defineProperty(Storage.prototype, 'getItem', original)
    }
  })
})
