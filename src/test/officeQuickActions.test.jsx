import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import OfficeQuickActions from '../components/dashboard/OfficeQuickActions'
import { EMPTY_QUEUE_COUNTS } from '../lib/officeActions'

const counts = (overrides = {}) => ({ ...EMPTY_QUEUE_COUNTS, ...overrides })

// Dashboard owns the open state; this stands in for it
function Harness({ onAction = () => {}, startOpen = false, ...props }) {
  const [open, setOpen] = useState(startOpen)
  return <OfficeQuickActions open={open} onOpenChange={setOpen} onAction={onAction} {...props} />
}

const fab = () => screen.getByRole('button', { name: /^Quick actions/ })
const openSheet = () => {
  fireEvent.click(fab())
  return screen.getByRole('dialog', { name: 'Quick actions' })
}
const rowButton = (sheet, label) => within(sheet).getByRole('button', { name: new RegExp(`^${label}`) })

const projectCounts = counts({ readyToApprove: 3, awaitingSignature: 2, readyForCOR: 4, draftCORs: 1, withClient: 2 })

describe('OfficeQuickActions (project scope)', () => {
  it('shows the floating button with the review count and no sheet until tapped', () => {
    render(<Harness scope="project" counts={projectCounts} />)
    expect(fab()).toHaveAccessibleName('Quick actions, 3 tickets to review')
    expect(fab()).toHaveTextContent('3')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a dot instead of a number when only later steps have work', () => {
    const { container } = render(<Harness scope="project" counts={counts({ draftCORs: 2 })} />)
    expect(fab()).toHaveAccessibleName('Quick actions, items waiting')
    expect(container.querySelector('.oqa-badge--dot')).toBeInTheDocument()
  })

  it('opens a modal sheet with every row and its count', () => {
    render(<Harness scope="project" counts={projectCounts} />)
    const sheet = openSheet()
    expect(sheet).toHaveAttribute('aria-modal', 'true')

    const rows = within(sheet).getAllByRole('listitem')
    expect(rows.map(li => li.querySelector('.oqa-row-label').textContent)).toEqual([
      'Review tickets',
      'Build COR from tickets',
      'Send COR',
      'Returned by client',
      'Waiting on client',
      'New COR',
      'Find a ticket or COR'
    ])
    expect(rows.map(li => li.querySelector('.oqa-count')?.textContent ?? null)).toEqual(['3', '4', '1', '0', '2', null, null])
    expect(within(sheet).getByText('Signed by client, ready for approval · 2 waiting on client signature')).toBeInTheDocument()
    expect(within(sheet).queryByText("You're caught up")).not.toBeInTheDocument()
  })

  it('moves focus into the sheet and back to the button on close', () => {
    render(<Harness scope="project" counts={projectCounts} />)
    fab().focus()
    const sheet = openSheet()
    expect(sheet).toHaveFocus()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close quick actions' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fab()).toHaveFocus()
  })

  it('closes on Escape and on a backdrop tap, but not on a tap inside the sheet', () => {
    const { container } = render(<Harness scope="project" counts={projectCounts} />)
    let sheet = openSheet()
    fireEvent.click(sheet)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    sheet = openSheet()
    expect(sheet).toBeInTheDocument()
    fireEvent.click(container.querySelector('.oqa-overlay'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reports the tapped row and closes', () => {
    const onAction = vi.fn()
    render(<Harness scope="project" counts={projectCounts} onAction={onAction} />)
    fireEvent.click(rowButton(openSheet(), 'Review tickets'))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith('review', undefined)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    for (const [label, id] of [
      ['Build COR from tickets', 'buildCor'],
      ['Send COR', 'sendCor'],
      ['Waiting on client', 'waiting'],
      ['New COR', 'newCor'],
      ['Find a ticket or COR', 'search']
    ]) {
      fireEvent.click(rowButton(openSheet(), label))
      expect(onAction).toHaveBeenLastCalledWith(id, undefined)
    }
  })

  it('zero state: says caught up, dims the counted rows, keeps them tappable', () => {
    const onAction = vi.fn()
    render(<Harness scope="project" counts={counts()} onAction={onAction} />)
    expect(fab()).toHaveAccessibleName('Quick actions')
    const sheet = openSheet()
    expect(within(sheet).getByText("You're caught up")).toBeInTheDocument()
    expect(within(sheet).getAllByText('Nothing waiting')).toHaveLength(5)

    const review = rowButton(sheet, 'Review tickets')
    expect(review).toHaveClass('oqa-row--dim')
    expect(review).toBeEnabled()
    expect(rowButton(sheet, 'New COR')).not.toHaveClass('oqa-row--dim')
    fireEvent.click(review)
    expect(onAction).toHaveBeenCalledWith('review', undefined)
  })

  it('does not claim to be caught up while the counts are unknown', () => {
    render(<Harness scope="project" counts={null} />)
    const sheet = openSheet()
    expect(within(sheet).queryByText("You're caught up")).not.toBeInTheDocument()
    expect(sheet.querySelector('.oqa-count')).toBeNull()
    expect(sheet.querySelector('.oqa-row--dim')).toBeNull()
  })

  it('marks the waiting row when a COR has been out more than a week', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    render(<Harness scope="project" counts={counts({ withClient: 1, oldestWithClientAt: tenDaysAgo })} />)
    const sheet = openSheet()
    expect(rowButton(sheet, 'Waiting on client')).toHaveClass('oqa-row--warn')
    expect(within(sheet).getByText('Oldest sent 10 days ago')).toBeInTheDocument()
  })

  it('footer: Field entry expands in place to its two children', () => {
    const onAction = vi.fn()
    render(<Harness scope="project" counts={projectCounts} onAction={onAction} />)
    const sheet = openSheet()
    expect(within(sheet).queryByRole('button', { name: 'T&M ticket' })).not.toBeInTheDocument()

    const fieldEntry = within(sheet).getByRole('button', { name: 'Field entry' })
    expect(fieldEntry).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(fieldEntry)
    expect(fieldEntry).toHaveAttribute('aria-expanded', 'true')
    expect(onAction).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'T&M ticket' })).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Daily report' }))
    expect(onAction).toHaveBeenCalledWith('dailyReport', undefined)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(within(openSheet()).getByRole('button', { name: 'Field entry' }))
    fireEvent.click(screen.getByRole('button', { name: 'T&M ticket' }))
    expect(onAction).toHaveBeenLastCalledWith('tmTicket', undefined)
  })

  it('footer: COR log, and no New project link in a project', () => {
    const onAction = vi.fn()
    render(<Harness scope="project" counts={projectCounts} onAction={onAction} />)
    const sheet = openSheet()
    expect(within(sheet).queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'COR log' }))
    expect(onAction).toHaveBeenCalledWith('corLog', undefined)
  })

  it('renders nothing when hidden, and closes a sheet that was open', () => {
    const { container, rerender } = render(<Harness scope="project" counts={projectCounts} hidden />)
    expect(container).toBeEmptyDOMElement()

    rerender(<Harness scope="project" counts={projectCounts} />)
    openSheet()
    rerender(<Harness scope="project" counts={projectCounts} hidden />)
    expect(container).toBeEmptyDOMElement()
    // Un-hiding does not bring the old sheet back
    rerender(<Harness scope="project" counts={projectCounts} />)
    expect(fab()).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('OfficeQuickActions (portfolio scope)', () => {
  const alpha = { id: 'p-alpha', name: 'Alpha Tower', job_number: '1001', counts: counts({ readyToApprove: 2, draftCORs: 1 }) }
  const bravo = { id: 'p-bravo', name: 'Bravo Mall', job_number: '1002', counts: counts({ readyToApprove: 5 }) }
  const charlie = { id: 'p-charlie', name: 'Charlie Depot', counts: counts() }
  const projects = [charlie, alpha, bravo]
  const totals = counts({ readyToApprove: 7, draftCORs: 1 })

  it('goes straight to the project when exactly one has items for the row', () => {
    const onAction = vi.fn()
    render(<Harness scope="portfolio" counts={totals} projects={projects} onAction={onAction} />)
    fireEvent.click(rowButton(openSheet(), 'Send COR'))
    expect(onAction).toHaveBeenCalledWith('sendCor', alpha)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('swaps to a project picker when several projects have items', () => {
    const onAction = vi.fn()
    render(<Harness scope="portfolio" counts={totals} projects={projects} onAction={onAction} />)
    const sheet = openSheet()
    fireEvent.click(rowButton(sheet, 'Review tickets'))

    expect(onAction).not.toHaveBeenCalled()
    expect(within(sheet).getByRole('heading', { name: 'Review tickets' })).toBeInTheDocument()
    expect(sheet).toHaveFocus()

    // Projects with tickets first (biggest count first), then the rest
    const list = within(sheet).getByRole('list', { name: 'Projects' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map(li => li.querySelector('.oqa-row-label').textContent)).toEqual(['Bravo Mall', 'Alpha Tower', 'Charlie Depot'])
    expect(items.map(li => li.querySelector('.oqa-count').textContent)).toEqual(['5', '2', '0'])

    fireEvent.click(within(list).getByRole('button', { name: /Alpha Tower/ }))
    expect(onAction).toHaveBeenCalledWith('review', alpha)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('picker has a way back to the main list', () => {
    render(<Harness scope="portfolio" counts={totals} projects={projects} />)
    const sheet = openSheet()
    fireEvent.click(rowButton(sheet, 'Review tickets'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Back to quick actions' }))
    expect(within(sheet).getByRole('heading', { name: 'Quick actions' })).toBeInTheDocument()
    expect(rowButton(sheet, 'Send COR')).toBeInTheDocument()
  })

  it('asks for a project when none has items for the row', () => {
    const onAction = vi.fn()
    render(<Harness scope="portfolio" counts={totals} projects={projects} onAction={onAction} />)
    const sheet = openSheet()
    fireEvent.click(rowButton(sheet, 'Waiting on client'))
    expect(onAction).not.toHaveBeenCalled()
    expect(within(sheet).getByRole('heading', { name: 'Waiting on client' })).toBeInTheDocument()
  })

  it('New COR lists every project in order, without counts', () => {
    const onAction = vi.fn()
    render(<Harness scope="portfolio" counts={totals} projects={projects} onAction={onAction} />)
    const sheet = openSheet()
    fireEvent.click(rowButton(sheet, 'New COR'))

    const list = within(sheet).getByRole('list', { name: 'Projects' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map(li => li.querySelector('.oqa-row-label').textContent)).toEqual(['Charlie Depot', 'Alpha Tower', 'Bravo Mall'])
    expect(list.querySelector('.oqa-count')).toBeNull()

    fireEvent.click(within(list).getByRole('button', { name: /Charlie Depot/ }))
    expect(onAction).toHaveBeenCalledWith('newCor', charlie)
  })

  it('search and New project need no project', () => {
    const onAction = vi.fn()
    render(<Harness scope="portfolio" counts={totals} projects={projects} onAction={onAction} />)
    fireEvent.click(rowButton(openSheet(), 'Find a ticket or COR'))
    expect(onAction).toHaveBeenLastCalledWith('search', undefined)

    const sheet = openSheet()
    expect(within(sheet).queryByRole('button', { name: 'Field entry' })).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'New project' }))
    expect(onAction).toHaveBeenLastCalledWith('newProject', undefined)
  })

  it('each opening starts on the main list again', () => {
    render(<Harness scope="portfolio" counts={totals} projects={projects} />)
    let sheet = openSheet()
    fireEvent.click(rowButton(sheet, 'Review tickets'))
    fireEvent.keyDown(document, { key: 'Escape' })
    sheet = openSheet()
    expect(within(sheet).getByRole('heading', { name: 'Quick actions' })).toBeInTheDocument()
  })

  it('can open directly on the picker for a row (portfolio tiles)', () => {
    const onAction = vi.fn()
    render(<Harness scope="portfolio" counts={totals} projects={projects} onAction={onAction} startOpen pickerRowId="review" />)
    const sheet = screen.getByRole('dialog', { name: 'Quick actions' })
    expect(within(sheet).getByRole('heading', { name: 'Review tickets' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: /Bravo Mall/ }))
    expect(onAction).toHaveBeenCalledWith('review', bravo)
  })
})
