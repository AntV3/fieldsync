import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClipboardList, MessageSquareText, Info } from 'lucide-react'
import TabSubNav from '../components/dashboard/tabs/TabSubNav'

const countableItems = [
  { id: 'reports', label: 'Reports', shortLabel: 'Reports', icon: ClipboardList, description: 'Daily logs', count: 3 },
  { id: 'rfis', label: 'RFIs', shortLabel: 'RFIs', icon: MessageSquareText, description: 'Requests', count: 0 }
]

const plainItems = [
  { id: 'details', label: 'Details', shortLabel: 'Details', icon: Info, description: 'Project info' }
]

describe('TabSubNav', () => {
  it('shows a count badge only for items with count > 0', () => {
    render(
      <TabSubNav
        title="Field Activity"
        items={countableItems}
        activeSection="reports"
        onSectionChange={() => {}}
      />
    )
    // Reports (count 3) gets a badge
    expect(screen.getByText('3')).toBeInTheDocument()
    // RFIs (count 0) gets no "0" badge anywhere
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('dims empty items with an (empty) hint but keeps them clickable', () => {
    const onSectionChange = vi.fn()
    render(
      <TabSubNav
        title="Field Activity"
        items={countableItems}
        activeSection="reports"
        onSectionChange={onSectionChange}
      />
    )
    const rfiButton = screen.getByRole('button', { name: /RFIs/ })
    expect(rfiButton.className).toContain('is-empty')
    expect(screen.getByText('(empty)')).toBeInTheDocument()

    fireEvent.click(rfiButton)
    expect(onSectionChange).toHaveBeenCalledWith('rfis')
  })

  it('does not apply empty treatment to non-countable items', () => {
    render(
      <TabSubNav
        title="Project Info"
        items={plainItems}
        activeSection="details"
        onSectionChange={() => {}}
      />
    )
    const detailsButton = screen.getByRole('button', { name: /Details/ })
    expect(detailsButton.className).not.toContain('is-empty')
    expect(screen.queryByText('(empty)')).not.toBeInTheDocument()
  })

  it('marks the active section with aria-current', () => {
    render(
      <TabSubNav
        title="Field Activity"
        items={countableItems}
        activeSection="reports"
        onSectionChange={() => {}}
      />
    )
    const active = screen.getByRole('button', { name: /Reports/ })
    expect(active).toHaveAttribute('aria-current', 'page')
  })
})
