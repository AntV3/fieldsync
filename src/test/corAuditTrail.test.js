/**
 * COR audit-trail regression tests.
 *
 * `cor_status_history` is used for dispute resolution: every transition of a
 * change order must produce a row. Three paths used to skip it — bulk
 * markItemsBilled from the invoicing flow, the generic updateChangeOrderStatus
 * admin action, and the auto-approval that happens when a GC signs a COR —
 * these tests keep them wired up.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedHistory = []
const updatedChangeOrders = []

function makeChangeOrdersBuilder() {
  const state = { updates: null, filters: {}, idFilter: null }

  const builder = {
    update(payload) {
      state.updates = payload
      updatedChangeOrders.push(payload)
      return builder
    },
    eq(col, val) {
      state.filters[col] = val
      if (col === 'id') state.idFilter = val
      return builder
    },
    in(col, vals) {
      state.filters[col] = vals
      if (col === 'id') state.idFilter = vals
      return builder
    },
    select() {
      return builder
    },
    single() {
      return Promise.resolve({
        data: { id: state.idFilter || 'test-id', status: state.updates?.status },
        error: null
      })
    },
    then(onFulfilled, onRejected) {
      const ids = Array.isArray(state.idFilter) ? state.idFilter : [state.idFilter].filter(Boolean)
      return Promise.resolve({
        data: ids.map(id => ({ id, status: state.updates?.status })),
        error: null
      }).then(onFulfilled, onRejected)
    }
  }
  return builder
}

const supabaseMock = {
  from(table) {
    if (table === 'cor_status_history') {
      return {
        insert(row) {
          insertedHistory.push(row)
          return Promise.resolve({ data: null, error: null })
        }
      }
    }
    if (table === 'change_orders') {
      return makeChangeOrdersBuilder()
    }
    if (table === 't_and_m_tickets') {
      return {
        update: () => ({
          in: () => Promise.resolve({ data: null, error: null })
        })
      }
    }
    return {}
  }
}

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: supabaseMock
}))

vi.mock('../lib/fieldSession', () => ({
  getClient: () => supabaseMock,
  getSupabaseClient: () => supabaseMock,
  isFieldMode: () => false
}))

vi.mock('../lib/observability', () => ({
  observe: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

const loadOps = async () => {
  const mod = await import('../lib/corOps.js')
  return mod.corOps || mod.default || mod
}

beforeEach(() => {
  insertedHistory.length = 0
  updatedChangeOrders.length = 0
})

describe('COR audit trail — cor_status_history is written on every status transition', () => {
  it('markItemsBilled logs one history row per COR and sets billed_at', async () => {
    const ops = await loadOps()
    await ops.markItemsBilled(['cor-a', 'cor-b'], ['tm-1'], 'user-42')

    expect(updatedChangeOrders[0]).toMatchObject({ status: 'billed' })
    expect(updatedChangeOrders[0].billed_at).toEqual(expect.any(String))

    const logged = insertedHistory.map(r => r.change_order_id).sort()
    expect(logged).toEqual(['cor-a', 'cor-b'])
    for (const row of insertedHistory) {
      expect(row.status).toBe('billed')
      expect(row.changed_by).toBe('user-42')
    }
  })

  it('updateChangeOrderStatus writes a history row after a valid transition', async () => {
    const ops = await loadOps()
    await ops.updateChangeOrderStatus('cor-x', 'approved')

    expect(insertedHistory).toHaveLength(1)
    expect(insertedHistory[0]).toMatchObject({
      change_order_id: 'cor-x',
      status: 'approved'
    })
  })

  it('saveCORSignature writes an approved history row after GC signs', async () => {
    const ops = await loadOps()
    await ops.saveCORSignature('cor-sig', 'data:image/png;base64,fake', 'Jane GC')

    expect(insertedHistory).toHaveLength(1)
    expect(insertedHistory[0].change_order_id).toBe('cor-sig')
    expect(insertedHistory[0].status).toBe('approved')
    expect(insertedHistory[0].notes).toMatch(/Jane GC/)
  })
})
