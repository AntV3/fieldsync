/**
 * Office work queue: queueOps.getOfficeQueueCounts (aggregation, paging,
 * error handling) and useOfficeQueue (scoping to the project list, totals,
 * refresh triggers, keeping the last good counts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  tables: {},      // table name -> rows (or an Error to fail the query)
  calls: [],       // one entry per request: { table, filters, range }
  configured: true
}))

// Minimal PostgREST query builder: records filters, applies them to h.tables
vi.mock('../lib/db/client', () => {
  const build = (table) => {
    const state = { table, filters: [], range: null }
    const builder = {
      select: () => builder,
      eq: (col, val) => { state.filters.push(['eq', col, val]); return builder },
      in: (col, vals) => { state.filters.push(['in', col, vals]); return builder },
      is: (col, val) => { state.filters.push(['is', col, val]); return builder },
      order: () => builder,
      range: (from, to) => {
        state.range = [from, to]
        h.calls.push(state)
        const source = h.tables[table]
        if (source instanceof Error) return Promise.resolve({ data: null, error: source })
        const rows = (source || []).filter(row => state.filters.every(([op, col, val]) => {
          if (col.startsWith('projects.')) return row.company_id === val
          if (op === 'eq') return row[col] === val
          if (op === 'in') return val.includes(row[col])
          return (row[col] ?? null) === val
        }))
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
      }
    }
    return builder
  }
  return {
    supabase: { from: (table) => build(table) },
    get isSupabaseConfigured() { return h.configured },
    observe: { query: () => {}, error: () => {} }
  }
})

const dbMock = vi.hoisted(() => ({ getOfficeQueueCounts: vi.fn() }))
vi.mock('../lib/supabase', () => ({ db: dbMock }))

import { queueOps } from '../lib/db/queueOps'
import useOfficeQueue from '../hooks/useOfficeQueue'

const ticket = (id, project_id, status, assigned_cor_id = null, company_id = 'c1') =>
  ({ id, project_id, status, assigned_cor_id, company_id })
const cor = (id, project_id, status, dates = {}, company_id = 'c1') =>
  ({ id, project_id, status, submitted_at: null, updated_at: null, created_at: null, company_id, ...dates })

describe('queueOps.getOfficeQueueCounts', () => {
  beforeEach(() => {
    h.tables = {}
    h.calls = []
    h.configured = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('counts each workflow stage per project', async () => {
    h.tables.t_and_m_tickets = [
      ticket('t1', 'p1', 'client_signed'),
      ticket('t2', 'p1', 'client_signed'),
      ticket('t3', 'p1', 'pending'),
      ticket('t4', 'p1', 'foreman_signed'),
      ticket('t5', 'p1', 'approved'),
      ticket('t6', 'p1', 'approved', 'cor-1'), // already on a COR
      ticket('t7', 'p1', 'billed'),
      ticket('t8', 'p1', 'rejected'),
      ticket('t9', 'p2', 'approved'),
      ticket('t10', 'p9', 'client_signed', null, 'other-company')
    ]
    h.tables.change_orders = [
      cor('c1', 'p1', 'draft'),
      cor('c2', 'p1', 'pending_approval', { submitted_at: '2026-11-01T00:00:00Z' }),
      cor('c3', 'p1', 'pending_approval', { submitted_at: '2026-10-20T00:00:00Z' }),
      cor('c4', 'p1', 'approved'),
      cor('c5', 'p2', 'draft'),
      cor('c6', 'p2', 'draft')
    ]

    const result = await queueOps.getOfficeQueueCounts('c1')
    expect(result).toEqual({
      p1: { readyToApprove: 2, awaitingSignature: 2, readyForCOR: 1, draftCORs: 1, returnedCORs: 0, withClient: 2, oldestWithClientAt: '2026-10-20T00:00:00Z' },
      p2: { readyToApprove: 0, awaitingSignature: 0, readyForCOR: 1, draftCORs: 2, returnedCORs: 0, withClient: 0, oldestWithClientAt: null }
    })
    // Every query is scoped to the company through the projects join
    expect(h.calls.length).toBe(3)
    for (const call of h.calls) {
      expect(call.filters).toContainEqual(['eq', 'projects.company_id', 'c1'])
    }
  })

  it('dates a COR with the client by submitted_at, then updated_at, then created_at', async () => {
    h.tables.change_orders = [
      cor('c1', 'p1', 'pending_approval', { updated_at: '2026-10-05T00:00:00Z', created_at: '2026-09-01T00:00:00Z' }),
      cor('c2', 'p2', 'pending_approval', { created_at: '2026-09-15T00:00:00Z' }),
      cor('c3', 'p3', 'pending_approval')
    ]
    const result = await queueOps.getOfficeQueueCounts('c1')
    expect(result.p1.oldestWithClientAt).toBe('2026-10-05T00:00:00Z')
    expect(result.p2.oldestWithClientAt).toBe('2026-09-15T00:00:00Z')
    expect(result.p3).toMatchObject({ withClient: 1, oldestWithClientAt: null })
  })

  it('reads past the 1000-row page limit', async () => {
    h.tables.t_and_m_tickets = Array.from({ length: 1500 }, (_, i) => ticket(`t${i}`, 'p1', 'client_signed'))
    const result = await queueOps.getOfficeQueueCounts('c1')
    expect(result.p1.readyToApprove).toBe(1500)
    const ticketPages = h.calls.filter(c => c.table === 't_and_m_tickets' && c.filters.some(f => f[0] === 'in'))
    expect(ticketPages.map(c => c.range)).toEqual([[0, 999], [1000, 1999]])
  })

  it('returns an empty map and logs when a query fails', async () => {
    h.tables.t_and_m_tickets = new Error('boom')
    await expect(queueOps.getOfficeQueueCounts('c1')).resolves.toEqual({})
    expect(console.error).toHaveBeenCalled()
  })

  it('rethrows instead when asked to', async () => {
    h.tables.change_orders = new Error('boom')
    await expect(queueOps.getOfficeQueueCounts('c1', { throwOnError: true })).rejects.toThrow('boom')
  })

  it('returns an empty map without a company or a backend', async () => {
    expect(await queueOps.getOfficeQueueCounts(null)).toEqual({})
    h.configured = false
    expect(await queueOps.getOfficeQueueCounts('c1')).toEqual({})
    expect(h.calls.length).toBe(0)
  })
})

describe('useOfficeQueue', () => {
  const company = { id: 'c1' }
  const projects = [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }]
  const p1 = { readyToApprove: 2, awaitingSignature: 1, readyForCOR: 0, draftCORs: 1, withClient: 1, oldestWithClientAt: '2026-11-01T00:00:00Z' }
  const p2 = { readyToApprove: 1, awaitingSignature: 0, readyForCOR: 3, draftCORs: 0, withClient: 2, oldestWithClientAt: '2026-10-01T00:00:00Z' }
  const archived = { readyToApprove: 9, awaitingSignature: 9, readyForCOR: 9, draftCORs: 9, withClient: 9, oldestWithClientAt: '2020-01-01T00:00:00Z' }

  beforeEach(() => {
    dbMock.getOfficeQueueCounts.mockReset()
  })

  it('loads counts, keeps only listed projects and totals them', async () => {
    dbMock.getOfficeQueueCounts.mockResolvedValue({ p1, p2, 'p-archived': archived })
    const { result } = renderHook(() => useOfficeQueue({ company, projects, refreshKey: 0 }))
    expect(result.current.ready).toBe(false)
    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledWith('c1', { throwOnError: true })
    expect(Object.keys(result.current.byProject)).toEqual(['p1', 'p2'])
    expect(result.current.totals).toEqual({
      readyToApprove: 3, awaitingSignature: 1, readyForCOR: 3, draftCORs: 1, returnedCORs: 0, withClient: 3,
      oldestWithClientAt: '2026-10-01T00:00:00Z'
    })
    expect(result.current.forProject('p1')).toEqual(p1)
    expect(result.current.forProject('p-archived')).toMatchObject({ readyToApprove: 0, withClient: 0 })
    expect(result.current.loading).toBe(false)
  })

  it('reloads when refreshKey changes and when the window regains focus', async () => {
    dbMock.getOfficeQueueCounts.mockResolvedValue({ p1 })
    const { result, rerender } = renderHook(({ refreshKey }) => useOfficeQueue({ company, projects, refreshKey }), { initialProps: { refreshKey: 0 } })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(1)

    dbMock.getOfficeQueueCounts.mockResolvedValue({ p1: { ...p1, readyToApprove: 7 } })
    rerender({ refreshKey: 1 })
    await waitFor(() => expect(result.current.forProject('p1').readyToApprove).toBe(7))
    expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(2)

    // Fresh counts are not re-read on focus; stale ones are
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(2)
    const realNow = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 60 * 1000)
    act(() => { window.dispatchEvent(new Event('focus')) })
    nowSpy.mockRestore()
    await waitFor(() => expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(3))
  })

  it('keeps the last good counts when a reload fails', async () => {
    dbMock.getOfficeQueueCounts.mockResolvedValue({ p1 })
    const { result, rerender } = renderHook(({ refreshKey }) => useOfficeQueue({ company, projects, refreshKey }), { initialProps: { refreshKey: 0 } })
    await waitFor(() => expect(result.current.ready).toBe(true))

    dbMock.getOfficeQueueCounts.mockRejectedValue(new Error('offline'))
    rerender({ refreshKey: 1 })
    await waitFor(() => expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ready).toBe(true)
    expect(result.current.forProject('p1')).toEqual(p1)
  })

  it('is not ready when the first load fails, and does not load without projects', async () => {
    dbMock.getOfficeQueueCounts.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useOfficeQueue({ company, projects, refreshKey: 0 }))
    await waitFor(() => expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ready).toBe(false)

    dbMock.getOfficeQueueCounts.mockClear()
    renderHook(() => useOfficeQueue({ company, projects: [], refreshKey: 0 }))
    expect(dbMock.getOfficeQueueCounts).not.toHaveBeenCalled()
  })

  it('runs one request at a time and catches up once afterwards', async () => {
    let release
    dbMock.getOfficeQueueCounts.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ p1 }) }))
    dbMock.getOfficeQueueCounts.mockResolvedValue({ p1: { ...p1, readyToApprove: 5 } })
    const { result, rerender } = renderHook(({ refreshKey }) => useOfficeQueue({ company, projects, refreshKey }), { initialProps: { refreshKey: 0 } })

    rerender({ refreshKey: 1 })
    rerender({ refreshKey: 2 })
    expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(1)

    await act(async () => { release() })
    await waitFor(() => expect(result.current.forProject('p1').readyToApprove).toBe(5))
    expect(dbMock.getOfficeQueueCounts).toHaveBeenCalledTimes(2)
  })
})
