import { describe, it, expect, beforeEach, vi } from 'vitest'

// Records every filter call per table so the test can assert on the query
const { supabase, calls } = vi.hoisted(() => {
  const calls = {}
  const builder = (table) => {
    const b = {}
    for (const method of ['select', 'eq', 'is', 'or', 'order']) {
      b[method] = (...args) => { calls[table].push([method, ...args]); return b }
    }
    b.then = (resolve) => resolve({ data: [{ id: `${table}-1` }], error: null })
    return b
  }
  return {
    calls,
    supabase: { from: vi.fn((table) => { calls[table] = []; return builder(table) }) }
  }
})

vi.mock('../lib/supabaseClient', () => ({
  supabase,
  isSupabaseConfigured: true,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
}))
vi.mock('../lib/fieldSession', () => ({
  getClient: () => supabase,
  getFieldClient: () => supabase,
  getSupabaseClient: () => supabase,
  getFieldSession: () => null,
  isFieldMode: () => false
}))
vi.mock('../lib/signingClient', () => ({ getSigningClient: vi.fn(), resetSigningClient: vi.fn() }))
vi.mock('../lib/observability', () => ({
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), event: vi.fn() }
}))
vi.mock('../lib/offlineManager', () => ({ generateTempId: () => 'temp_1' }))

import { corOps } from '../lib/corOps'

describe('corOps.getBillableItems', () => {
  beforeEach(() => {
    for (const key of Object.keys(calls)) delete calls[key]
  })

  it('leaves tickets that are on a COR out of stand-alone billing', async () => {
    const result = await corOps.getBillableItems('p1')

    expect(calls.t_and_m_tickets).toContainEqual(['is', 'assigned_cor_id', null])
    expect(calls.t_and_m_tickets).toContainEqual(['eq', 'status', 'approved'])
    expect(calls.change_orders).toContainEqual(['eq', 'status', 'approved'])
    expect(result).toEqual({ cors: [{ id: 'change_orders-1' }], tickets: [{ id: 't_and_m_tickets-1' }] })
  })
})
