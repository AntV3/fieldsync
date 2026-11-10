import { describe, it, expect } from 'vitest'
import { matchesStatusFilter, canApproveTicket, sortTicketsForReview } from '../lib/tmStatus'

describe('matchesStatusFilter', () => {
  const statuses = ['pending', 'foreman_signed', 'client_signed', 'approved', 'billed', 'rejected']

  it("'all' matches every status", () => {
    statuses.forEach(status => {
      expect(matchesStatusFilter({ status }, 'all')).toBe(true)
    })
  })

  it("'pending' matches the three statuses awaiting approval", () => {
    expect(matchesStatusFilter({ status: 'pending' }, 'pending')).toBe(true)
    expect(matchesStatusFilter({ status: 'foreman_signed' }, 'pending')).toBe(true)
    expect(matchesStatusFilter({ status: 'client_signed' }, 'pending')).toBe(true)
    expect(matchesStatusFilter({ status: 'approved' }, 'pending')).toBe(false)
    expect(matchesStatusFilter({ status: 'billed' }, 'pending')).toBe(false)
    expect(matchesStatusFilter({ status: 'rejected' }, 'pending')).toBe(false)
  })

  it('any other filter is an exact match', () => {
    expect(matchesStatusFilter({ status: 'approved' }, 'approved')).toBe(true)
    expect(matchesStatusFilter({ status: 'client_signed' }, 'approved')).toBe(false)
    expect(matchesStatusFilter({ status: 'billed' }, 'billed')).toBe(true)
    expect(matchesStatusFilter({ status: 'rejected' }, 'rejected')).toBe(true)
    expect(matchesStatusFilter({ status: 'foreman_signed' }, 'foreman_signed')).toBe(true)
    expect(matchesStatusFilter({ status: 'pending' }, 'foreman_signed')).toBe(false)
  })

  it('handles a missing ticket', () => {
    expect(matchesStatusFilter(null, 'all')).toBe(true)
    expect(matchesStatusFilter(null, 'pending')).toBe(false)
    expect(matchesStatusFilter(undefined, 'approved')).toBe(false)
  })
})

describe('canApproveTicket', () => {
  it('allows a client_signed ticket', () => {
    expect(canApproveTicket({ status: 'client_signed' })).toBe(true)
  })

  it('refuses tickets the client has not signed', () => {
    expect(canApproveTicket({ status: 'pending' })).toBe(false)
    expect(canApproveTicket({ status: 'foreman_signed', foreman_signature_data: 'x' })).toBe(false)
    expect(canApproveTicket({ status: 'foreman_signed', client_signature_data: '' })).toBe(false)
  })

  it('allows an awaiting ticket that carries a client authorization', () => {
    expect(canApproveTicket({ status: 'foreman_signed', client_signature_data: 'x' })).toBe(true)
    expect(canApproveTicket({ status: 'pending', client_signature_data: 'x' })).toBe(true)
    expect(canApproveTicket({ status: 'pending', gc_signature_data: 'x' })).toBe(true)
  })

  it('refuses tickets that are no longer awaiting approval, signed or not', () => {
    expect(canApproveTicket({ status: 'approved', client_signature_data: 'x' })).toBe(false)
    expect(canApproveTicket({ status: 'billed', client_signature_data: 'x' })).toBe(false)
    expect(canApproveTicket({ status: 'rejected', client_signature_data: 'x' })).toBe(false)
  })

  it('refuses a missing ticket', () => {
    expect(canApproveTicket(null)).toBe(false)
    expect(canApproveTicket(undefined)).toBe(false)
    expect(canApproveTicket({})).toBe(false)
  })
})

describe('sortTicketsForReview', () => {
  it('puts tickets the client has signed first, then oldest first', () => {
    const tickets = [
      { id: 'foreman-new', status: 'foreman_signed', work_date: '2026-11-05' },
      { id: 'client-new', status: 'client_signed', work_date: '2026-11-04' },
      { id: 'pending-old', status: 'pending', work_date: '2026-09-01' },
      { id: 'client-old', status: 'client_signed', work_date: '2026-10-01' },
      { id: 'foreman-with-client-sig', status: 'foreman_signed', client_signature_data: 'x', work_date: '2026-10-15' }
    ]
    expect(sortTicketsForReview(tickets).map(t => t.id)).toEqual([
      'client-old',
      'foreman-with-client-sig',
      'client-new',
      'pending-old',
      'foreman-new'
    ])
  })

  it('breaks ties on the same work date by creation time', () => {
    const tickets = [
      { id: 'b', status: 'client_signed', work_date: '2026-11-04', created_at: '2026-11-04T15:00:00Z' },
      { id: 'a', status: 'client_signed', work_date: '2026-11-04', created_at: '2026-11-04T09:00:00Z' }
    ]
    expect(sortTicketsForReview(tickets).map(t => t.id)).toEqual(['a', 'b'])
  })

  it('does not mutate its input and tolerates nothing', () => {
    const tickets = [
      { id: '1', status: 'foreman_signed', work_date: '2026-11-05' },
      { id: '2', status: 'client_signed', work_date: '2026-11-05' }
    ]
    const sorted = sortTicketsForReview(tickets)
    expect(tickets.map(t => t.id)).toEqual(['1', '2'])
    expect(sorted.map(t => t.id)).toEqual(['2', '1'])
    expect(sortTicketsForReview(null)).toEqual([])
  })
})
