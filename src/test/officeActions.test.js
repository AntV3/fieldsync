import { describe, it, expect } from 'vitest'
import {
  getOfficeQuickActions,
  getRowCount,
  isCaughtUp,
  pickProjectForRow,
  daysWaitingOnClient,
  EMPTY_QUEUE_COUNTS
} from '../lib/officeActions'

const NOW = new Date('2026-11-10T12:00:00Z').getTime()
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()

const counts = (overrides = {}) => ({ ...EMPTY_QUEUE_COUNTS, ...overrides })
const actions = (overrides, scope = 'project') =>
  getOfficeQuickActions({ scope, counts: counts(overrides), now: NOW })
const row = (result, id) => result.rows.find(r => r.id === id)

describe('getOfficeQuickActions rows', () => {
  it('returns the rows in workflow order for both scopes', () => {
    const order = ['review', 'buildCor', 'sendCor', 'returned', 'waiting', 'newCor', 'search']
    expect(actions({}).rows.map(r => r.id)).toEqual(order)
    expect(actions({}, 'portfolio').rows.map(r => r.id)).toEqual(order)
  })

  it('labels the rows', () => {
    expect(actions({}).rows.map(r => r.label)).toEqual([
      'Review tickets',
      'Build COR from tickets',
      'Send COR',
      'Returned by client',
      'Waiting on client',
      'New COR',
      'Find a ticket or COR'
    ])
  })

  it('maps each count to its row and leaves New COR and search without one', () => {
    const result = actions({ readyToApprove: 4, awaitingSignature: 9, readyForCOR: 3, draftCORs: 2, withClient: 1 })
    expect(row(result, 'review').count).toBe(4)
    expect(row(result, 'buildCor').count).toBe(3)
    expect(row(result, 'sendCor').count).toBe(2)
    expect(row(result, 'waiting').count).toBe(1)
    expect(row(result, 'newCor').count).toBeNull()
    expect(row(result, 'search').count).toBeNull()
  })

  it('dims counted rows with nothing waiting, never the uncounted ones', () => {
    const result = actions({ readyToApprove: 2 })
    expect(row(result, 'review').dimmed).toBe(false)
    expect(row(result, 'buildCor').dimmed).toBe(true)
    expect(row(result, 'sendCor').dimmed).toBe(true)
    expect(row(result, 'waiting').dimmed).toBe(true)
    expect(row(result, 'newCor').dimmed).toBe(false)
    expect(row(result, 'search').dimmed).toBe(false)
  })

  it('treats missing or bad counts as zero', () => {
    const result = getOfficeQuickActions({ scope: 'project', counts: { readyToApprove: undefined, draftCORs: -3, withClient: 'x' }, now: NOW })
    expect(result.rows.slice(0, 4).map(r => r.count)).toEqual([0, 0, 0, 0])
    expect(result.badge).toBeNull()
  })
})

describe('getOfficeQuickActions subtitles', () => {
  it('review: ready tickets, with and without tickets waiting on the client', () => {
    expect(row(actions({ readyToApprove: 2 }), 'review').subtitle).toBe('Signed by client, ready for approval')
    expect(row(actions({ readyToApprove: 2, awaitingSignature: 3 }), 'review').subtitle)
      .toBe('Signed by client, ready for approval · 3 waiting on client signature')
  })

  it('review: only unsigned tickets does not claim anything is ready', () => {
    expect(row(actions({ awaitingSignature: 5 }), 'review').subtitle).toBe('5 waiting on client signature')
  })

  it('review: nothing at all', () => {
    expect(row(actions({}), 'review').subtitle).toBe('Nothing waiting')
  })

  it('buildCor and sendCor describe the work or say nothing is waiting', () => {
    const busy = actions({ readyForCOR: 1, draftCORs: 1 })
    expect(row(busy, 'buildCor').subtitle).toBe('Approved tickets not on a COR yet')
    expect(row(busy, 'sendCor').subtitle).toBe('Drafts to finish and send for signature')
    const idle = actions({})
    expect(row(idle, 'buildCor').subtitle).toBe('Nothing waiting')
    expect(row(idle, 'sendCor').subtitle).toBe('Nothing waiting')
  })

  it('waiting: says how long the oldest COR has been out', () => {
    expect(row(actions({ withClient: 2, oldestWithClientAt: daysAgo(3) }), 'waiting').subtitle).toBe('Oldest sent 3 days ago')
    expect(row(actions({ withClient: 1, oldestWithClientAt: daysAgo(1) }), 'waiting').subtitle).toBe('Oldest sent 1 day ago')
    expect(row(actions({ withClient: 1, oldestWithClientAt: daysAgo(0) }), 'waiting').subtitle).toBe('Oldest sent today')
  })

  it('waiting: unknown send date and empty queue', () => {
    expect(row(actions({ withClient: 2 }), 'waiting').subtitle).toBe('Sent for signature')
    expect(row(actions({ withClient: 2, oldestWithClientAt: 'not a date' }), 'waiting').subtitle).toBe('Sent for signature')
    expect(row(actions({ withClient: 0, oldestWithClientAt: daysAgo(30) }), 'waiting').subtitle).toBe('Nothing waiting')
  })

  it('waiting: warns only when the oldest COR is more than 7 days out', () => {
    expect(row(actions({ withClient: 1, oldestWithClientAt: daysAgo(7) }), 'waiting').tone).toBe('default')
    expect(row(actions({ withClient: 1, oldestWithClientAt: daysAgo(8) }), 'waiting').tone).toBe('warn')
    expect(row(actions({ withClient: 0, oldestWithClientAt: daysAgo(30) }), 'waiting').tone).toBe('default')
    expect(row(actions({ withClient: 1 }), 'waiting').tone).toBe('default')
  })
})

describe('getOfficeQuickActions badge', () => {
  it('shows the number of tickets ready to approve', () => {
    expect(actions({ readyToApprove: 5, readyForCOR: 2 }).badge).toBe(5)
  })

  it('falls back to a dot when only later steps have work', () => {
    expect(actions({ readyForCOR: 1 }).badge).toBe('dot')
    expect(actions({ draftCORs: 1 }).badge).toBe('dot')
    expect(actions({ withClient: 1 }).badge).toBe('dot')
  })

  it('is empty when nothing is waiting, and a dot when tickets still need the client signature', () => {
    expect(actions({}).badge).toBeNull()
    expect(actions({ awaitingSignature: 6 }).badge).toBe('dot')
  })
})

describe('getOfficeQuickActions footer', () => {
  it('project scope: field entry (with its two children) and the COR log', () => {
    expect(actions({}, 'project').footer).toEqual([
      {
        id: 'fieldEntry',
        label: 'Field entry',
        children: [
          { id: 'tmTicket', label: 'T&M ticket' },
          { id: 'dailyReport', label: 'Daily report' }
        ]
      },
      { id: 'corLog', label: 'COR log' }
    ])
  })

  it('portfolio scope: new project only', () => {
    expect(actions({}, 'portfolio').footer).toEqual([{ id: 'newProject', label: 'New project' }])
  })
})

describe('change orders the client returned', () => {
  it('get their own row, count toward the badge dot, and keep the office from being caught up', () => {
    const result = actions({ returnedCORs: 2 })
    const row = result.rows.find(r => r.id === 'returned')
    expect(row).toMatchObject({ label: 'Returned by client', count: 2, dimmed: false })
    expect(row.subtitle).toBe('Sent back with comments. Revise and resend.')
    expect(result.badge).toBe('dot')
    expect(isCaughtUp({ returnedCORs: 1 })).toBe(false)
  })
})

describe('counts that are not loaded yet', () => {
  it('shows no counts, no badge and no "nothing waiting" claims', () => {
    const result = getOfficeQuickActions({ scope: 'project', counts: null, now: NOW })
    expect(result.badge).toBeNull()
    expect(result.rows.map(r => r.count)).toEqual([null, null, null, null, null, null, null])
    expect(result.rows.some(r => r.dimmed)).toBe(false)
    expect(result.rows.some(r => r.subtitle === 'Nothing waiting')).toBe(false)
    expect(isCaughtUp(null)).toBe(false)
  })
})

describe('helpers', () => {
  it('isCaughtUp is true only when nothing is waiting, unsigned tickets included', () => {
    expect(isCaughtUp(counts())).toBe(true)
    expect(isCaughtUp(counts({ awaitingSignature: 4 }))).toBe(false)
    expect(isCaughtUp(counts({ readyToApprove: 1 }))).toBe(false)
    expect(isCaughtUp(counts({ readyForCOR: 1 }))).toBe(false)
    expect(isCaughtUp(counts({ draftCORs: 1 }))).toBe(false)
    expect(isCaughtUp(counts({ withClient: 1 }))).toBe(false)
  })

  it('getRowCount reads the count behind a row', () => {
    const c = counts({ readyToApprove: 1, readyForCOR: 2, draftCORs: 3, withClient: 4 })
    expect(getRowCount('review', c)).toBe(1)
    expect(getRowCount('buildCor', c)).toBe(2)
    expect(getRowCount('sendCor', c)).toBe(3)
    expect(getRowCount('waiting', c)).toBe(4)
    expect(getRowCount('newCor', c)).toBe(0)
    expect(getRowCount('review', undefined)).toBe(0)
  })

  it('daysWaitingOnClient counts whole days and never goes negative', () => {
    expect(daysWaitingOnClient(counts({ oldestWithClientAt: daysAgo(2.9) }), NOW)).toBe(2)
    expect(daysWaitingOnClient(counts({ oldestWithClientAt: daysAgo(-1) }), NOW)).toBe(0)
    expect(daysWaitingOnClient(counts(), NOW)).toBeNull()
  })

  it('pickProjectForRow goes straight to the only project with items, else asks', () => {
    const a = { id: 'a', name: 'A', counts: counts({ readyToApprove: 2 }) }
    const b = { id: 'b', name: 'B', counts: counts({ draftCORs: 1 }) }
    const c = { id: 'c', name: 'C', counts: counts({ readyToApprove: 1 }) }
    expect(pickProjectForRow('review', [a, b])).toBe(a)
    expect(pickProjectForRow('sendCor', [a, b])).toBe(b)
    expect(pickProjectForRow('review', [a, b, c])).toBeNull()
    expect(pickProjectForRow('waiting', [a, b])).toBeNull()
    // New COR has no count, so it always asks when there is a choice
    expect(pickProjectForRow('newCor', [a, b])).toBeNull()
    // A single project is never a choice
    expect(pickProjectForRow('newCor', [a])).toBe(a)
    expect(pickProjectForRow('waiting', [a])).toBe(a)
    expect(pickProjectForRow('review', [])).toBeNull()
  })
})
