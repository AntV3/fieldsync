import { describe, it, expect } from 'vitest'
import { corStage, corStageId, daysWithClient } from '../lib/corStage'

const NOW = new Date('2026-11-20T12:00:00Z').getTime()
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()

describe('corStage', () => {
  it('maps each status to its stage', () => {
    expect(corStageId({ status: 'draft' })).toBe('draft')
    expect(corStageId({ status: 'pending_approval' })).toBe('with_client')
    expect(corStageId({ status: 'rejected' })).toBe('returned')
    expect(corStageId({ status: 'approved' })).toBe('approved')
    expect(corStageId({ status: 'billed' })).toBe('billed')
    expect(corStageId({ status: 'closed' })).toBe('closed')
    expect(corStageId(null)).toBe('draft')
  })

  it('treats a COR with voided_at as voided whatever its status', () => {
    expect(corStage({ status: 'closed', voided_at: daysAgo(1), void_reason: ' Scope cancelled ' }, NOW))
      .toEqual({ id: 'voided', label: 'Voided', tone: 'neutral', detail: 'Scope cancelled', overdue: false })
  })

  it('counts days with the client from the sent date, falling back to submitted_at', () => {
    expect(daysWithClient({ status: 'pending_approval', sent_to_client_at: daysAgo(3), submitted_at: daysAgo(9) }, NOW)).toBe(3)
    expect(daysWithClient({ status: 'pending_approval', submitted_at: daysAgo(9) }, NOW)).toBe(9)
    expect(daysWithClient({ status: 'pending_approval' }, NOW)).toBeNull()
    expect(daysWithClient({ status: 'approved', sent_to_client_at: daysAgo(3) }, NOW)).toBeNull()
  })

  it('describes how long a COR has been out and flags it after a week', () => {
    expect(corStage({ status: 'pending_approval', sent_to_client_at: daysAgo(0) }, NOW).detail).toBe('Sent today')
    expect(corStage({ status: 'pending_approval', sent_to_client_at: daysAgo(1) }, NOW).detail).toBe('Sent 1 day ago')
    const late = corStage({ status: 'pending_approval', sent_to_client_at: daysAgo(8) }, NOW)
    expect(late).toMatchObject({ id: 'with_client', detail: 'Sent 8 days ago', overdue: true })
    expect(corStage({ status: 'pending_approval', sent_to_client_at: daysAgo(7) }, NOW).overdue).toBe(false)
  })

  it('carries the client comment on a returned COR', () => {
    expect(corStage({ status: 'rejected', rejection_reason: 'Pat GC: hours look high' }, NOW))
      .toMatchObject({ id: 'returned', label: 'Returned by client', detail: 'Pat GC: hours look high' })
  })
})
