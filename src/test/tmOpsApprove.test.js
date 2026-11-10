import { describe, it, expect, beforeEach, vi } from 'vitest'

// tmOps.approveTMTicket against a fake Supabase client: the office may not
// approve a ticket the client has not signed, so the update itself carries
// the rule and a refused update is reported as such.

const { client, chain, calls } = vi.hoisted(() => {
  const calls = []
  const chain = { result: { data: null, error: null } }
  for (const method of ['update', 'eq', 'in', 'or', 'select']) {
    chain[method] = (...args) => { calls.push([method, ...args]); return chain }
  }
  chain.single = () => Promise.resolve(chain.result)
  return { client: { from: (table) => { calls.push(['from', table]); return chain } }, chain, calls }
})

vi.mock('../lib/db/client', () => ({
  supabase: client,
  isSupabaseConfigured: true,
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), activity: vi.fn() },
  getClient: () => client,
  getSupabaseClient: () => client,
  isFieldMode: () => false,
  sanitizeFormData: (v) => v,
  sanitize: { text: (v) => (v == null ? '' : String(v)) },
  cacheData: vi.fn(),
  getCachedData: vi.fn()
}))

import { tmOps } from '../lib/db/tmOps'
import { canApproveTicket } from '../lib/tmStatus'

// Evaluate the update's filters against a row, the way PostgREST would
const matchesFilters = (row) => calls.every(([method, ...args]) => {
  if (method === 'eq') return row[args[0]] === args[1]
  if (method === 'in') return args[1].includes(row[args[0]])
  if (method === 'or') {
    return args[0].split(',').some(condition => {
      const [column, ...op] = condition.split('.')
      if (op.join('.') === 'not.is.null') return row[column] != null
      if (op[0] === 'eq') return row[column] === op.slice(1).join('.')
      throw new Error(`Unhandled condition: ${condition}`)
    })
  }
  return true
})

beforeEach(() => {
  calls.length = 0
  chain.result = { data: { id: 't-1', status: 'approved' }, error: null }
})

describe('tmOps.approveTMTicket', () => {
  it('approves through an update that only matches client-signed tickets', async () => {
    const result = await tmOps.approveTMTicket('t-1', 'u-1', 'Dana Lee', 250)
    expect(result).toEqual({ id: 't-1', status: 'approved' })

    expect(calls[0]).toEqual(['from', 't_and_m_tickets'])
    const update = calls.find(c => c[0] === 'update')[1]
    expect(update).toMatchObject({ status: 'approved', approved_by_user_id: 'u-1', approved_by_name: 'Dana Lee', change_order_value: 250 })

    const row = (overrides) => ({ id: 't-1', status: 'foreman_signed', client_signature_data: null, gc_signature_data: null, ...overrides })
    const rows = [
      row({ status: 'pending' }),
      row({}),
      row({ status: 'client_signed' }),
      row({ client_signature_data: 'sig' }),
      row({ status: 'pending', gc_signature_data: 'sig' }),
      row({ status: 'approved', client_signature_data: 'sig' }),
      row({ status: 'rejected', client_signature_data: 'sig' })
    ]
    // The data layer and the UI agree on which tickets can be approved
    for (const r of rows) expect(matchesFilters(r)).toBe(canApproveTicket(r))
    expect(matchesFilters(row({}))).toBe(false)
    expect(matchesFilters(row({ status: 'client_signed' }))).toBe(true)
  })

  it('reports a refused update (no matching row) as not approvable', async () => {
    chain.result = { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
    await expect(tmOps.approveTMTicket('t-1', 'u-1', 'Dana Lee', 250)).rejects.toMatchObject({ code: 'TM_NOT_APPROVABLE' })
  })

  it('passes other database errors through unchanged', async () => {
    const dbError = { code: '42501', message: 'permission denied' }
    chain.result = { data: null, error: dbError }
    await expect(tmOps.approveTMTicket('t-1', 'u-1', 'Dana Lee', 250)).rejects.toBe(dbError)
  })
})
