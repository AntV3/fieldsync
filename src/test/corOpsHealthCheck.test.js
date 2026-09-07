import { describe, it, expect, beforeEach, vi } from 'vitest'

// Fluent Supabase query-builder mock. Each terminal call resolves to the
// captured chain so the test can assert exactly which columns/filters were
// used on the write. Only the surface that corOps calls into is modeled.
function makeQueryBuilder() {
  const state = {
    table: null,
    update: null,
    inserts: [],
    ids: null,
    statusIn: null,
    selected: null,
    matchedRows: []
  }
  const builder = {
    __state: state,
    from(table) { state.table = table; return this },
    update(patch) { state.update = patch; return this },
    insert(row) { state.inserts.push(row); return Promise.resolve({ data: null, error: null }) },
    select(cols) { state.selected = cols ?? '*'; return this },
    eq() { return this },
    in(col, values) {
      if (col === 'id') state.ids = values
      if (col === 'status') state.statusIn = values
      return this
    },
    single() {
      // Return the first "matched" row if the mock says the filter passed,
      // otherwise emulate PGRST116 (zero rows).
      const row = state.matchedRows[0]
      if (!row) {
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST116', message: 'no rows' }
        })
      }
      return Promise.resolve({ data: row, error: null })
    },
    then(onFulfilled, onRejected) {
      // For calls that terminate without .single() (e.g. bulk update .select),
      // return the matched rows list.
      return Promise.resolve({
        data: state.matchedRows,
        error: null
      }).then(onFulfilled, onRejected)
    }
  }
  return builder
}

const currentBuilder = { ref: null }

vi.mock('../lib/supabaseClient', () => {
  return {
    isSupabaseConfigured: true,
    supabase: {
      from(table) {
        const b = makeQueryBuilder()
        b.from(table)
        currentBuilder.ref = b
        return b
      }
    }
  }
})

vi.mock('../lib/fieldSession', () => ({ getClient: () => null }))
vi.mock('../lib/observability', () => ({ observe: { error: () => {}, event: () => {} } }))
vi.mock('../lib/offlineManager', () => ({ generateTempId: () => 'tmp-1' }))
vi.mock('../lib/localStorageHelpers', () => ({
  getLocalData: () => ({}),
  setLocalData: () => {}
}))
vi.mock('../lib/sanitize', () => ({ sanitize: { text: (s) => s } }))

const { corOps } = await import('../lib/corOps')

describe('saveCORSignature (post-approval)', () => {
  beforeEach(() => { currentBuilder.ref = null })

  it('filters on status=approved (not pending_approval)', async () => {
    // Set up a "matched" approved row so single() returns it.
    // The mock captures the last builder chain used.
    const originalFrom = (await import('../lib/supabaseClient')).supabase.from
    // Preload rows for the next .single() call
    const matchedRow = { id: 'cor-1', status: 'approved' }
    const spyFrom = (table) => {
      const b = makeQueryBuilder()
      b.from(table)
      b.__state.matchedRows = [matchedRow]
      currentBuilder.ref = b
      return b
    }
    // Swap in the row-emitting version just for this call.
    const client = (await import('../lib/supabaseClient')).supabase
    const originalImpl = client.from
    client.from = spyFrom
    try {
      const row = await corOps.saveCORSignature('cor-1', 'data:image/png;base64,AAAA', 'John Doe')
      expect(row).toEqual(matchedRow)
    } finally {
      client.from = originalImpl
    }

    expect(currentBuilder.ref.__state.table).toBe('change_orders')
    // Must gate on the status the UI actually exposes (approved).
    expect(currentBuilder.ref.__state.statusIn).toEqual(['approved'])
    // Must NOT re-write status (approveCOR already set approved_at/by;
    // rewriting status would clobber nothing but muddies the audit trail).
    expect(currentBuilder.ref.__state.update).not.toHaveProperty('status')
    // Must write the signature columns.
    expect(currentBuilder.ref.__state.update.gc_signature_data).toBeTruthy()
    expect(currentBuilder.ref.__state.update.gc_signature_name).toBe('John Doe')
    expect(typeof currentBuilder.ref.__state.update.gc_signature_date).toBe('string')
  })
})

describe('markItemsBilled bulk flip', () => {
  beforeEach(() => { currentBuilder.ref = null })

  it('gates the change_orders update on status=approved', async () => {
    // Track every builder created across the call.
    const builders = []
    const client = (await import('../lib/supabaseClient')).supabase
    const originalImpl = client.from
    client.from = (table) => {
      const b = makeQueryBuilder()
      b.from(table)
      // matchedRows stays empty — we're only asserting on the filter,
      // not on the audit-log follow-up.
      builders.push(b)
      currentBuilder.ref = b
      return b
    }
    try {
      await corOps.markItemsBilled(['cor-1', 'cor-2'], [], 'user-1')
    } finally {
      client.from = originalImpl
    }

    const corBuilder = builders.find(b => b.__state.table === 'change_orders')
    expect(corBuilder).toBeTruthy()
    expect(corBuilder.__state.ids).toEqual(['cor-1', 'cor-2'])
    expect(corBuilder.__state.statusIn).toEqual(['approved'])
    // Must record the billed_at timestamp, not just flip status.
    expect(corBuilder.__state.update.status).toBe('billed')
    expect(typeof corBuilder.__state.update.billed_at).toBe('string')
  })

  it('gates the t_and_m_tickets update on status=approved', async () => {
    const builders = []
    const client = (await import('../lib/supabaseClient')).supabase
    const originalImpl = client.from
    client.from = (table) => {
      const b = makeQueryBuilder()
      b.from(table)
      builders.push(b)
      return b
    }
    try {
      await corOps.markItemsBilled([], ['tm-1'])
    } finally {
      client.from = originalImpl
    }

    const tmBuilder = builders.find(b => b.__state.table === 't_and_m_tickets')
    expect(tmBuilder).toBeTruthy()
    expect(tmBuilder.__state.ids).toEqual(['tm-1'])
    expect(tmBuilder.__state.statusIn).toEqual(['approved'])
  })
})
