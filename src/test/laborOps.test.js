import { describe, it, expect, beforeEach, vi } from 'vitest'

// laborOps.getLaborClasses active filter, against a fake Supabase client.

const { client } = vi.hoisted(() => ({ client: { from: vi.fn(), rpc: vi.fn() } }))

vi.mock('../lib/db/client', () => ({
  supabase: client,
  isSupabaseConfigured: true,
  getClient: () => client,
  sanitizeFormData: (v) => v,
  sanitize: { text: (v) => (v == null ? '' : String(v).trim()) },
  cacheData: vi.fn(),
  getCachedData: vi.fn()
}))

import { laborOps } from '../lib/db/laborOps'

const ROWS = [
  { id: 'lc-1', name: 'Foreman', active: true, labor_categories: { id: 'cat-1', name: 'Supervision' } },
  { id: 'lc-2', name: 'Old Class', active: false, labor_categories: null }
]

const classesChain = (result = { data: ROWS, error: null }) => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn()
  }
  chain.order.mockReturnValueOnce(chain).mockReturnValueOnce(Promise.resolve(result))
  client.from.mockReturnValue(chain)
  return chain
}

describe('laborOps.getLaborClasses', () => {
  beforeEach(() => client.from.mockReset())

  it('filters to active classes by default (unchanged behaviour)', async () => {
    const chain = classesChain()
    await expect(laborOps.getLaborClasses('co-1')).resolves.toEqual(ROWS)
    expect(client.from).toHaveBeenCalledWith('labor_classes')
    expect(chain.select.mock.calls[0][0]).toContain('labor_categories (id, name)')
    expect(chain.eq.mock.calls).toEqual([['company_id', 'co-1'], ['active', true]])
    expect(chain.order.mock.calls).toEqual([['sort_order'], ['name']])
  })

  it('keeps the active filter when includeInactive is false', async () => {
    const chain = classesChain()
    await laborOps.getLaborClasses('co-1', { includeInactive: false })
    expect(chain.eq).toHaveBeenCalledWith('active', true)
  })

  it('omits the active filter when includeInactive is true', async () => {
    const chain = classesChain()
    await expect(laborOps.getLaborClasses('co-1', { includeInactive: true })).resolves.toEqual(ROWS)
    expect(chain.eq.mock.calls).toEqual([['company_id', 'co-1']])
    expect(chain.order.mock.calls).toEqual([['sort_order'], ['name']])
  })

  it('returns [] for null data and throws the Supabase error', async () => {
    classesChain({ data: null, error: null })
    await expect(laborOps.getLaborClasses('co-1', { includeInactive: true })).resolves.toEqual([])

    const error = { code: '42501', message: 'denied' }
    classesChain({ data: null, error })
    await expect(laborOps.getLaborClasses('co-1')).rejects.toBe(error)
  })
})
