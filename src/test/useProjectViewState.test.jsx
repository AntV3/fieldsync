import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useProjectViewState from '../hooks/useProjectViewState'

describe('useProjectViewState office deep links', () => {
  it('openTicketReview lands on the full ticket list with a fresh pending request', () => {
    const { result } = renderHook(() => useProjectViewState())
    expect(result.current.ticketReviewRequest).toBeNull()

    act(() => result.current.openTicketReview())
    expect(result.current.activeProjectTab).toBe('financials')
    expect(result.current.financialsSection).toBe('tickets')
    expect(result.current.tmViewMode).toBe('full')
    const first = result.current.ticketReviewRequest
    expect(first).toEqual({ key: expect.any(Number), filter: 'pending' })

    // Asking again while already there still produces a new key
    act(() => result.current.handleBackToTMPreview())
    act(() => result.current.openTicketReview())
    expect(result.current.tmViewMode).toBe('full')
    expect(result.current.ticketReviewRequest.key).toBeGreaterThan(first.key)
  })

  it('openCORs lands on the expanded COR list with the requested filter', () => {
    const { result } = renderHook(() => useProjectViewState())
    expect(result.current.corFilterRequest).toBeNull()
    expect(result.current.corListExpanded).toBe(false)

    act(() => result.current.openCORs('draft'))
    expect(result.current.activeProjectTab).toBe('financials')
    expect(result.current.financialsSection).toBe('cors')
    expect(result.current.corListExpanded).toBe(true)
    const first = result.current.corFilterRequest
    expect(first).toEqual({ key: expect.any(Number), filter: 'draft' })

    act(() => result.current.openCORs('pending_approval'))
    expect(result.current.corFilterRequest.filter).toBe('pending_approval')
    expect(result.current.corFilterRequest.key).toBeGreaterThan(first.key)
    expect(result.current.corListExpanded).toBe(true)
  })

  it('a request ends when the user leaves its section, so returning does not re-apply it', () => {
    const { result } = renderHook(() => useProjectViewState())
    act(() => result.current.openTicketReview())
    act(() => result.current.setFinancialsSection('cors'))
    expect(result.current.ticketReviewRequest).toBeNull()

    act(() => result.current.openCORs('draft'))
    act(() => result.current.setActiveProjectTab('overview'))
    expect(result.current.corFilterRequest).toBeNull()

    // Opening one does not disturb the other while it is still on screen
    act(() => result.current.openTicketReview())
    expect(result.current.ticketReviewRequest).not.toBeNull()
    expect(result.current.corFilterRequest).toBeNull()
  })

  it('handleBuildCORFromTickets opens a new COR on the ticket picker; closing resets it', () => {
    const { result } = renderHook(() => useProjectViewState())
    expect(result.current.corFormStartWithTickets).toBe(false)

    act(() => result.current.handleEditCOR({ id: 'cor-1' }))
    act(() => result.current.setShowCORForm(false))

    act(() => result.current.handleBuildCORFromTickets())
    expect(result.current.showCORForm).toBe(true)
    expect(result.current.editingCOR).toBeNull()
    expect(result.current.corFormStartWithTickets).toBe(true)

    act(() => result.current.setShowCORForm(false))
    expect(result.current.corFormStartWithTickets).toBe(false)
  })

  it('handleCreateCOR and handleEditCOR never start on the ticket picker', () => {
    const { result } = renderHook(() => useProjectViewState())
    act(() => result.current.handleBuildCORFromTickets())
    act(() => result.current.handleCreateCOR())
    expect(result.current.showCORForm).toBe(true)
    expect(result.current.corFormStartWithTickets).toBe(false)

    act(() => result.current.handleBuildCORFromTickets())
    act(() => result.current.handleEditCOR({ id: 'cor-1' }))
    expect(result.current.editingCOR).toEqual({ id: 'cor-1' })
    expect(result.current.corFormStartWithTickets).toBe(false)
  })

  it('resetSections clears both requests and the ticket-picker flag', () => {
    const { result } = renderHook(() => useProjectViewState())
    act(() => result.current.openTicketReview())
    act(() => result.current.handleBuildCORFromTickets())
    act(() => result.current.resetSections())
    expect(result.current.activeProjectTab).toBe('overview')
    expect(result.current.ticketReviewRequest).toBeNull()
    expect(result.current.corFilterRequest).toBeNull()
    expect(result.current.corFormStartWithTickets).toBe(false)
  })

  it('isModalOpen follows the modals that cover the page', () => {
    const { result } = renderHook(() => useProjectViewState())
    expect(result.current.isModalOpen).toBe(false)
    act(() => result.current.handleCreateTMTicket())
    expect(result.current.isModalOpen).toBe(true)
    act(() => result.current.setShowTMTicketModal(false))
    expect(result.current.isModalOpen).toBe(false)
    act(() => result.current.setCORDisplayMode('log'))
    expect(result.current.isModalOpen).toBe(true)
  })
})
