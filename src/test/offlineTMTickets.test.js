import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Offline T&M submit: the pending_tm_tickets store, its sync state machine,
// bounded retries and the sync event bus (src/lib/offlineManager.js).
// Every test gets a fresh IndexedDB and a fresh module (module-level state:
// connection, in-flight sync, retry backoff, listeners).

let om

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  om = await import('../lib/offlineManager')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const PNG_SIG = {
  signature: 'data:image/png;base64,AAAA',
  signerName: 'Sam Rivera',
  signerTitle: 'Foreman',
  signedAt: '2026-11-05T12:05:00.000Z'
}

let seq = 0
const makeRecord = (overrides = {}) => {
  seq++
  const id = overrides.client_submission_id || `csid-${seq}`
  const projectId = overrides.project_id || 'proj-1'
  return {
    client_submission_id: id,
    project_id: projectId,
    company_id: 'co-1',
    created_at: new Date(Date.UTC(2026, 10, 5, 12, 0, seq)).toISOString(),
    payload: {
      project_id: projectId,
      client_submission_id: id,
      work_date: '2026-11-05',
      ce_pco_number: null,
      assigned_cor_id: null,
      notes: 'Demo wall',
      created_by_name: 'Sam',
      workers: [{ name: 'Ana', hours: 8, overtime_hours: 2, time_started: null, time_ended: null, role: 'Laborer', labor_class_id: null }],
      items: [{ material_equipment_id: 'me-1', custom_name: null, custom_category: null, quantity: 3 }]
    },
    signature: null,
    custom_field_data: {},
    cor_import: null,
    photos: [],
    ...overrides
  }
}

const serverRow = (record, extra = {}) => ({
  id: `srv-${record.client_submission_id}`,
  project_id: record.project_id,
  status: record.signature ? 'foreman_signed' : 'pending',
  foreman_signature_data: record.signature ? record.signature.signature : null,
  replayed: false,
  ...extra
})

const makeApi = (overrides = {}) => ({
  submitTMTicketFull: vi.fn(async (record) => serverRow(record)),
  saveTMForemanSignature: vi.fn().mockResolvedValue({}),
  saveCustomFieldData: vi.fn().mockResolvedValue({ success: true }),
  importTicketDataToCOR: vi.fn().mockResolvedValue({}),
  markImportFailed: vi.fn().mockResolvedValue({}),
  ...overrides
})

const networkError = () => ({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' })
const authError = () => ({ message: 'permission denied for project', code: '42501' })
const serverError = () => ({ message: 'invalid input syntax for type numeric', code: '22P02' })

const collectEvents = () => {
  const events = []
  om.onSyncStateChange(e => events.push(e))
  return events
}

// IndexedDB (fake-indexeddb) runs on real setImmediate; spin it until `cond`.
const flushUntil = async (cond, max = 500) => {
  for (let i = 0; i < max; i++) {
    if (cond()) return
    await new Promise(r => setImmediate(r))
  }
  throw new Error('flushUntil: condition never became true')
}
const flush = async (n = 50) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r))
}

describe('pending ticket store', () => {
  it('saves a record with defaults and lists it by project, oldest first', async () => {
    const a = makeRecord()
    const b = makeRecord({ project_id: 'proj-2' })
    const c = makeRecord()
    const { state: _s, attempts: _a, ...withoutState } = a
    const saved = await om.savePendingTMTicket(withoutState)
    expect(saved.state).toBe('queued')
    expect(saved.attempts).toBe(0)
    await om.savePendingTMTicket(c)
    await om.savePendingTMTicket(b)

    const all = await om.getPendingTMTickets()
    expect(all.map(r => r.client_submission_id)).toEqual([a, b, c].map(r => r.client_submission_id))
    const proj1 = await om.getPendingTMTickets({ projectId: 'proj-1' })
    expect(proj1.map(r => r.client_submission_id)).toEqual([a.client_submission_id, c.client_submission_id])

    const one = await om.getPendingTMTicket(a.client_submission_id)
    expect(one.payload.workers[0].hours).toBe(8)
    expect(one.photos).toEqual([])
  })

  it('fills created_at when missing and requires client_submission_id', async () => {
    const r = makeRecord()
    delete r.created_at
    const saved = await om.savePendingTMTicket(r)
    expect(typeof saved.created_at).toBe('string')
    await expect(om.savePendingTMTicket({ project_id: 'p' })).rejects.toThrow(/client_submission_id/)
  })

  it('updates and deletes, emitting summary_changed', async () => {
    const events = collectEvents()
    const r = await om.savePendingTMTicket(makeRecord())
    const updated = await om.updatePendingTMTicket(r.client_submission_id, { last_error: 'x' })
    expect(updated.last_error).toBe('x')
    expect(updated.payload.notes).toBe('Demo wall')
    expect(await om.updatePendingTMTicket('missing', { a: 1 })).toBeNull()
    await om.deletePendingTMTicket(r.client_submission_id)
    expect(await om.getPendingTMTicket(r.client_submission_id)).toBeNull()
    expect(events.filter(e => e.type === 'summary_changed').length).toBe(3)
  })

  it('caches arbitrary data by key', async () => {
    expect(await om.getCachedData('labor_classes_co-1')).toBeNull()
    await om.cacheData('labor_classes_co-1', { classes: [{ id: 'lc-1' }] })
    expect(await om.getCachedData('labor_classes_co-1')).toEqual({ classes: [{ id: 'lc-1' }] })
  })
})

describe('getPendingSyncSummary', () => {
  it('counts records by state, optionally per project', async () => {
    await om.savePendingTMTicket(makeRecord())
    await om.savePendingTMTicket(makeRecord({ state: 'syncing' }))
    await om.savePendingTMTicket(makeRecord({ state: 'needs_auth' }))
    await om.savePendingTMTicket(makeRecord({ state: 'failed', attempts: 10 }))
    await om.savePendingTMTicket(makeRecord({ project_id: 'proj-2' }))

    expect(await om.getPendingSyncSummary()).toEqual({ queued: 2, syncing: 1, needs_auth: 1, failed: 1, total: 5 })
    expect(await om.getPendingSyncSummary({ projectId: 'proj-1' })).toEqual({ queued: 1, syncing: 1, needs_auth: 1, failed: 1, total: 4 })
    expect(await om.getPendingSyncSummary({ projectId: 'proj-9' })).toEqual({ queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 })
  })

  it('returns zeros without throwing when IndexedDB is unavailable', async () => {
    const saved = globalThis.indexedDB
    try {
      delete globalThis.indexedDB
      vi.resetModules()
      const fresh = await import('../lib/offlineManager')
      expect(await fresh.getPendingSyncSummary()).toEqual({ queued: 0, syncing: 0, needs_auth: 0, failed: 0, total: 0 })
      expect(await fresh.syncPendingTMTickets(makeApi())).toEqual({ synced: 0, failed: 0, remaining: 0 })
    } finally {
      globalThis.indexedDB = saved
    }
  })
})

describe('classifySyncError', () => {
  it.each([
    [{ code: '42501', message: 'permission denied' }, 'auth'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'auth'],
    [{ code: '', message: 'JWT expired' }, 'auth'],
    [{ code: '', message: 'TypeError: Failed to fetch' }, 'network'],
    [{ code: '', message: 'TypeError: Load failed' }, 'network'],
    [{ code: '', message: 'NetworkError when attempting to fetch resource.' }, 'network'],
    [{ code: '', message: 'AbortError: This operation was aborted' }, 'network'],
    [{ code: '', message: 'Request timeout' }, 'network'],
    [Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }), 'network'],
    [Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }), 'network'],
    [{ code: '22P02', message: 'invalid input syntax' }, 'server'],
    [{ code: '23503', message: 'violates foreign key constraint (network_id)' }, 'server'],
    [{ code: '22023', message: 'Signature must be a PNG image' }, 'server'],
    [new Error('boom'), 'server'],
    [null, 'server']
  ])('%o -> %s', (err, expected) => {
    expect(om.classifySyncError(err)).toBe(expected)
  })

  it('treats anything as network while the browser reports offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(om.classifySyncError({ code: '22P02', message: 'x' })).toBe('network')
    expect(om.classifySyncError({ code: '42501', message: 'x' })).toBe('auth')
  })
})

describe('syncPendingTMTickets', () => {
  it('submits, marks synced with the server id, emits, then deletes', async () => {
    const record = await om.savePendingTMTicket(makeRecord())
    const id = record.client_submission_id
    const events = collectEvents()
    const states = []
    const api = makeApi({
      submitTMTicketFull: vi.fn(async (r, opts) => {
        states.push((await om.getPendingTMTicket(id)).state)
        expect(opts).toEqual({ timeoutMs: 30000 })
        return serverRow(r)
      })
    })
    api.saveTMForemanSignature.mockImplementation(async () => {})

    const listenerSaw = []
    om.onSyncStateChange(async (e) => {
      if (e.type === 'ticket_synced') listenerSaw.push(await om.getPendingTMTicket(id))
    })

    const result = await om.syncPendingTMTickets(api, { projectId: 'proj-1' })

    expect(result).toEqual({ synced: 1, failed: 0, remaining: 0 })
    expect(states).toEqual(['syncing'])
    expect(api.submitTMTicketFull).toHaveBeenCalledTimes(1)
    expect(api.submitTMTicketFull.mock.calls[0][0].client_submission_id).toBe(id)
    expect(listenerSaw[0]).toMatchObject({ state: 'synced', server_ticket_id: `srv-${id}` })
    expect(await om.getPendingTMTicket(id)).toBeNull()

    const types = events.map(e => e.type)
    expect(types[0]).toBe('sync_start')
    expect(events[0]).toEqual({ type: 'sync_start', count: 1 })
    expect(events.find(e => e.type === 'ticket_synced')).toMatchObject({
      client_submission_id: id,
      ticket: { id: `srv-${id}` }
    })
    expect(events.at(-1)).toEqual({ type: 'sync_complete', synced: 1, failed: 0, remaining: 0 })
    expect(types).toContain('summary_changed')
  })

  it('a second run makes no RPC', async () => {
    await om.savePendingTMTicket(makeRecord())
    const api = makeApi()
    await om.syncPendingTMTickets(api)
    const events = collectEvents()
    const second = await om.syncPendingTMTickets(api)
    expect(api.submitTMTicketFull).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ synced: 0, failed: 0, remaining: 0 })
    expect(events.find(e => e.type === 'sync_start')).toBeUndefined()
  })

  it('shares one in-flight run between concurrent callers', async () => {
    await om.savePendingTMTicket(makeRecord())
    const api = makeApi()
    const [a, b] = await Promise.all([om.syncPendingTMTickets(api), om.syncPendingTMTickets(api)])
    expect(a).toBe(b)
    expect(api.submitTMTicketFull).toHaveBeenCalledTimes(1)
  })

  it('treats a crash-left syncing record as queued', async () => {
    const r = await om.savePendingTMTicket(makeRecord({ state: 'syncing' }))
    const api = makeApi()
    const result = await om.syncPendingTMTickets(api)
    expect(result.synced).toBe(1)
    expect(await om.getPendingTMTicket(r.client_submission_id)).toBeNull()
  })

  it('syncs several records sequentially, oldest first', async () => {
    const a = await om.savePendingTMTicket(makeRecord())
    const b = await om.savePendingTMTicket(makeRecord())
    let active = 0
    let maxActive = 0
    const order = []
    const api = makeApi({
      submitTMTicketFull: vi.fn(async (r) => {
        active++
        maxActive = Math.max(maxActive, active)
        order.push(r.client_submission_id)
        await flush(5)
        active--
        return serverRow(r)
      })
    })
    const result = await om.syncPendingTMTickets(api)
    expect(result.synced).toBe(2)
    expect(maxActive).toBe(1)
    expect(order).toEqual([a.client_submission_id, b.client_submission_id])
  })

  it('network error: back to queued, stops the loop, does not count an attempt', async () => {
    const a = await om.savePendingTMTicket(makeRecord())
    const b = await om.savePendingTMTicket(makeRecord())
    const api = makeApi({ submitTMTicketFull: vi.fn().mockRejectedValue(networkError()) })
    const result = await om.syncPendingTMTickets(api)

    expect(api.submitTMTicketFull).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ synced: 0, failed: 0, remaining: 2 })
    const ra = await om.getPendingTMTicket(a.client_submission_id)
    expect(ra).toMatchObject({ state: 'queued', attempts: 0, last_error: 'TypeError: Failed to fetch' })
    expect((await om.getPendingTMTicket(b.client_submission_id)).state).toBe('queued')
  })

  it('abort and timeout failures are treated as network', async () => {
    const r = await om.savePendingTMTicket(makeRecord())
    const abort = Object.assign(new Error('Ticket submit timed out after 30s'), { name: 'AbortError', code: '' })
    const api = makeApi({ submitTMTicketFull: vi.fn().mockRejectedValue(abort) })
    await om.syncPendingTMTickets(api)
    expect(await om.getPendingTMTicket(r.client_submission_id)).toMatchObject({ state: 'queued', attempts: 0 })
  })

  describe('bounded retry after a network failure', () => {
    const setup = async (api) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const runs = []
      om.registerTicketDrain(() => {
        const p = om.syncPendingTMTickets(api)
        runs.push(p)
        return p
      })
      await om.savePendingTMTicket(makeRecord())
      const first = om.syncPendingTMTickets(api)
      runs.push(first)
      await first
      return runs
    }

    it('retries at 5 s, 15 s and 45 s, then stops', async () => {
      const api = makeApi({ submitTMTicketFull: vi.fn().mockRejectedValue(networkError()) })
      const runs = await setup(api)
      const calls = () => api.submitTMTicketFull.mock.calls.length
      expect(calls()).toBe(1)

      for (const [delay, expected] of [[5000, 2], [15000, 3], [45000, 4]]) {
        await vi.advanceTimersByTimeAsync(delay - 1)
        await flush(10)
        expect(calls()).toBe(expected - 1)
        await vi.advanceTimersByTimeAsync(1)
        await flushUntil(() => runs.length === expected)
        await runs.at(-1)
        expect(calls()).toBe(expected)
      }

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      await flush(20)
      expect(calls()).toBe(4)
      expect(om.scheduleRetry()).toBe(false)
    })

    it('stops after a successful retry and resets the backoff', async () => {
      const api = makeApi()
      api.submitTMTicketFull
        .mockRejectedValueOnce(networkError())
        .mockImplementation(async (r) => serverRow(r))
      const runs = await setup(api)

      await vi.advanceTimersByTimeAsync(5000)
      await flushUntil(() => runs.length === 2)
      const result = await runs[1]
      expect(result.synced).toBe(1)

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      await flush(20)
      expect(api.submitTMTicketFull).toHaveBeenCalledTimes(2)
      expect(runs.length).toBe(2)

      // Backoff was reset: the next failure starts again at 5 s.
      expect(om.scheduleRetry()).toBe(true)
      await vi.advanceTimersByTimeAsync(4999)
      expect(runs.length).toBe(2)
      await vi.advanceTimersByTimeAsync(1)
      await flushUntil(() => runs.length === 3)
    })
  })

  it('42501: needs_auth and one session_expired for the current project only', async () => {
    const a = await om.savePendingTMTicket(makeRecord({ project_id: 'proj-1' }))
    const b = await om.savePendingTMTicket(makeRecord({ project_id: 'proj-1' }))
    const c = await om.savePendingTMTicket(makeRecord({ project_id: 'proj-2' }))
    const events = collectEvents()
    const api = makeApi({ submitTMTicketFull: vi.fn().mockRejectedValue(authError()) })

    await om.syncPendingTMTickets(api, { projectId: 'proj-1' })

    for (const r of [a, b, c]) {
      expect(await om.getPendingTMTicket(r.client_submission_id)).toMatchObject({
        state: 'needs_auth',
        attempts: 0,
        last_error: 'permission denied for project'
      })
    }
    const expired = events.filter(e => e.type === 'session_expired')
    expect(expired).toEqual([{ type: 'session_expired', projectId: 'proj-1', count: 2 }])

    // needs_auth records are not retried until requeued
    api.submitTMTicketFull.mockClear()
    await om.syncPendingTMTickets(api, { projectId: 'proj-1' })
    expect(api.submitTMTicketFull).not.toHaveBeenCalled()
  })

  it('42501 on another project only parks the record (no session_expired)', async () => {
    await om.savePendingTMTicket(makeRecord({ project_id: 'proj-2' }))
    const events = collectEvents()
    const api = makeApi({ submitTMTicketFull: vi.fn().mockRejectedValue(authError()) })
    await om.syncPendingTMTickets(api, { projectId: 'proj-1' })
    await om.savePendingTMTicket(makeRecord({ project_id: 'proj-3' }))
    await om.syncPendingTMTickets(api) // no current project (office / logged out)
    expect(events.filter(e => e.type === 'session_expired')).toEqual([])
    expect((await om.getPendingSyncSummary()).needs_auth).toBe(2)
  })

  it('requeueNeedsAuthTickets only touches the given project', async () => {
    const a = await om.savePendingTMTicket(makeRecord({ project_id: 'proj-1', state: 'needs_auth', last_error: 'x' }))
    const b = await om.savePendingTMTicket(makeRecord({ project_id: 'proj-2', state: 'needs_auth' }))
    const c = await om.savePendingTMTicket(makeRecord({ project_id: 'proj-1', state: 'failed', attempts: 3 }))

    expect(await om.requeueNeedsAuthTickets('proj-1')).toBe(1)
    expect(await om.getPendingTMTicket(a.client_submission_id)).toMatchObject({ state: 'queued', last_error: null })
    expect((await om.getPendingTMTicket(b.client_submission_id)).state).toBe('needs_auth')
    expect((await om.getPendingTMTicket(c.client_submission_id)).state).toBe('failed')
    expect(await om.requeueNeedsAuthTickets(null)).toBe(0)
  })

  it('server error: failed with attempts + last_error; skipped and counted failed at 10', async () => {
    const r = await om.savePendingTMTicket(makeRecord())
    const id = r.client_submission_id
    const api = makeApi({ submitTMTicketFull: vi.fn().mockRejectedValue(serverError()) })

    const first = await om.syncPendingTMTickets(api)
    expect(first).toEqual({ synced: 0, failed: 1, remaining: 1 })
    expect(await om.getPendingTMTicket(id)).toMatchObject({
      state: 'failed',
      attempts: 1,
      last_error: 'invalid input syntax for type numeric'
    })

    await om.updatePendingTMTicket(id, { attempts: 9 })
    await om.syncPendingTMTickets(api)
    expect((await om.getPendingTMTicket(id)).attempts).toBe(10)
    expect(api.submitTMTicketFull).toHaveBeenCalledTimes(2)

    const events = collectEvents()
    const skipped = await om.syncPendingTMTickets(api)
    expect(api.submitTMTicketFull).toHaveBeenCalledTimes(2)
    expect(skipped).toEqual({ synced: 0, failed: 1, remaining: 1 })
    expect(events.find(e => e.type === 'sync_start')).toBeUndefined()
    expect((await om.getPendingSyncSummary()).failed).toBe(1)
  })

  it('a failed record keeps syncing alongside healthy ones', async () => {
    const bad = await om.savePendingTMTicket(makeRecord())
    const good = await om.savePendingTMTicket(makeRecord())
    const api = makeApi({
      submitTMTicketFull: vi.fn(async (r) => {
        if (r.client_submission_id === bad.client_submission_id) throw serverError()
        return serverRow(r)
      })
    })
    const result = await om.syncPendingTMTickets(api)
    expect(result).toEqual({ synced: 1, failed: 1, remaining: 1 })
    expect(await om.getPendingTMTicket(good.client_submission_id)).toBeNull()
  })
})

describe('signatures on pending tickets', () => {
  it('attaches before sync and the RPC carries it', async () => {
    const r = await om.savePendingTMTicket(makeRecord())
    const id = r.client_submission_id
    expect(await om.attachSignatureToPendingTicket(id, PNG_SIG)).toEqual({ saved: true })
    expect((await om.getPendingTMTicket(id)).signature).toEqual(PNG_SIG)

    const api = makeApi()
    await om.syncPendingTMTickets(api)
    expect(api.submitTMTicketFull.mock.calls[0][0].signature).toEqual(PNG_SIG)
    // Server row already carries the signature: no second write
    expect(api.saveTMForemanSignature).not.toHaveBeenCalled()
  })

  it('applies a locally captured signature the server row lacks (e.g. a replay)', async () => {
    const r = await om.savePendingTMTicket(makeRecord({ signature: PNG_SIG }))
    const api = makeApi({
      submitTMTicketFull: vi.fn(async (rec) => serverRow(rec, { foreman_signature_data: null, replayed: true }))
    })
    await om.syncPendingTMTickets(api)
    expect(api.saveTMForemanSignature).toHaveBeenCalledWith(`srv-${r.client_submission_id}`, PNG_SIG)
  })

  it('does not write once the record is synced; returns the server id instead', async () => {
    const r = await om.savePendingTMTicket(makeRecord())
    const id = r.client_submission_id
    await om.updatePendingTMTicket(id, { state: 'synced', server_ticket_id: 'srv-77' })
    expect(await om.attachSignatureToPendingTicket(id, PNG_SIG)).toEqual({ synced: true, server_ticket_id: 'srv-77' })
    expect((await om.getPendingTMTicket(id)).signature).toBeNull()
  })

  it('after the record is synced and deleted, still returns the server id', async () => {
    const r = await om.savePendingTMTicket(makeRecord())
    await om.syncPendingTMTickets(makeApi())
    expect(await om.attachSignatureToPendingTicket(r.client_submission_id, PNG_SIG)).toEqual({
      synced: true,
      server_ticket_id: `srv-${r.client_submission_id}`
    })
  })

  it('rejects for an unknown ticket', async () => {
    await expect(om.attachSignatureToPendingTicket('nope', PNG_SIG)).rejects.toThrow(/not found/)
  })

  it('a signature attached while the RPC is in flight is applied before the record is deleted', async () => {
    const r = await om.savePendingTMTicket(makeRecord())
    const id = r.client_submission_id
    let recordAtSignatureSave
    const api = makeApi({
      submitTMTicketFull: vi.fn(async (rec) => {
        // Foreman signs on the pending screen while the request is out
        expect(await om.attachSignatureToPendingTicket(id, PNG_SIG)).toEqual({ saved: true })
        return serverRow(rec) // rec had no signature -> row lacks it
      }),
      saveTMForemanSignature: vi.fn(async () => {
        recordAtSignatureSave = await om.getPendingTMTicket(id)
        return {}
      })
    })

    const result = await om.syncPendingTMTickets(api)
    expect(api.saveTMForemanSignature).toHaveBeenCalledWith(`srv-${id}`, PNG_SIG)
    expect(recordAtSignatureSave).not.toBeNull()
    expect(recordAtSignatureSave.state).toBe('synced')
    expect(result.synced).toBe(1)
    expect(await om.getPendingTMTicket(id)).toBeNull()
  })

  it('keeps the record when applying the signature fails on the network', async () => {
    const r = await om.savePendingTMTicket(makeRecord({ signature: PNG_SIG }))
    const api = makeApi({
      submitTMTicketFull: vi.fn(async (rec) => serverRow(rec, { foreman_signature_data: null })),
      saveTMForemanSignature: vi.fn().mockRejectedValue(networkError())
    })
    await om.syncPendingTMTickets(api)
    expect(await om.getPendingTMTicket(r.client_submission_id)).toMatchObject({
      state: 'queued',
      server_ticket_id: `srv-${r.client_submission_id}`,
      signature: PNG_SIG
    })
  })
})

describe('custom fields and COR import after sync', () => {
  const extras = {
    custom_field_data: { scaffold_tag: 'A-12' },
    cor_import: { cor_id: 'cor-1', company_id: 'co-1', work_type: 'demolition', job_type: 'standard' }
  }

  it('runs both best-effort on a first submit', async () => {
    const r = await om.savePendingTMTicket(makeRecord(extras))
    const api = makeApi()
    await om.syncPendingTMTickets(api)
    const tid = `srv-${r.client_submission_id}`
    expect(api.saveCustomFieldData).toHaveBeenCalledWith('proj-1', 'tm_ticket', tid, { scaffold_tag: 'A-12' })
    expect(api.importTicketDataToCOR).toHaveBeenCalledWith(tid, 'cor-1', 'co-1', 'demolition', 'standard')
  })

  it('skips both on a replay', async () => {
    const r = await om.savePendingTMTicket(makeRecord(extras))
    const api = makeApi({ submitTMTicketFull: vi.fn(async (rec) => serverRow(rec, { replayed: true })) })
    await om.syncPendingTMTickets(api)
    expect(api.saveCustomFieldData).not.toHaveBeenCalled()
    expect(api.importTicketDataToCOR).not.toHaveBeenCalled()
    expect(await om.getPendingTMTicket(r.client_submission_id)).toBeNull()
  })

  it('a COR import failure is marked failed and the ticket still counts as synced', async () => {
    const r = await om.savePendingTMTicket(makeRecord(extras))
    const api = makeApi({
      importTicketDataToCOR: vi.fn().mockRejectedValue(new Error('import broke')),
      saveCustomFieldData: vi.fn().mockRejectedValue(new Error('rls'))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await om.syncPendingTMTickets(api)
    expect(result.synced).toBe(1)
    expect(api.markImportFailed).toHaveBeenCalledWith(`srv-${r.client_submission_id}`, 'cor-1', 'import broke')
    expect(await om.getPendingTMTicket(r.client_submission_id)).toBeNull()
  })

  it('skips custom fields when empty and COR import when absent', async () => {
    await om.savePendingTMTicket(makeRecord())
    const api = makeApi()
    await om.syncPendingTMTickets(api)
    expect(api.saveCustomFieldData).not.toHaveBeenCalled()
    expect(api.importTicketDataToCOR).not.toHaveBeenCalled()
  })
})

describe('onSyncStateChange', () => {
  it('returns an unsubscribe function and survives a throwing listener', async () => {
    const seen = []
    vi.spyOn(console, 'error').mockImplementation(() => {})
    om.onSyncStateChange(() => { throw new Error('bad listener') })
    const unsub = om.onSyncStateChange(e => seen.push(e.type))
    await om.savePendingTMTicket(makeRecord())
    expect(seen).toEqual(['summary_changed'])
    unsub()
    await om.savePendingTMTicket(makeRecord())
    expect(seen).toEqual(['summary_changed'])
  })
})

describe('database upgrade from v2', () => {
  const openV2 = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('fieldsync-offline', 2)
    req.onupgradeneeded = () => {
      const d = req.result
      d.createObjectStore('projects', { keyPath: 'id' }).createIndex('company_id', 'company_id')
      d.createObjectStore('areas', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      d.createObjectStore('crew_checkins', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      d.createObjectStore('tm_tickets', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      d.createObjectStore('daily_reports', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      d.createObjectStore('messages', { keyPath: 'id' }).createIndex('project_id', 'project_id')
      const pending = d.createObjectStore('pending_actions', { keyPath: 'id', autoIncrement: true })
      pending.createIndex('type', 'type')
      pending.createIndex('created_at', 'created_at')
      d.createObjectStore('cached_data', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  const put = (d, store, value) => new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })

  it('adds pending_tm_tickets, clears tm_tickets and keeps the legacy queue', async () => {
    const v2 = await openV2()
    await put(v2, 'tm_tickets', { id: 'temp_1', project_id: 'proj-1' })
    await put(v2, 'pending_actions', { type: 'SEND_MESSAGE', payload: {}, created_at: 'x' })
    await put(v2, 'cached_data', { key: 'labor_classes_co-1', data: { classes: [] } })
    v2.close()

    const d = await om.initOfflineDB()
    expect(d.version).toBe(3)
    expect(Array.from(d.objectStoreNames)).toContain('pending_tm_tickets')
    const tx = d.transaction(['pending_tm_tickets'], 'readonly')
    const store = tx.objectStore('pending_tm_tickets')
    expect(store.keyPath).toBe('client_submission_id')
    expect(Array.from(store.indexNames).sort()).toEqual(['project_id', 'state'])

    expect(await om.getAllFromStore('tm_tickets')).toEqual([])
    expect(await om.getPendingActionCount()).toBe(1)
    expect(await om.getCachedData('labor_classes_co-1')).toEqual({ classes: [] })

    await om.savePendingTMTicket(makeRecord())
    expect((await om.getPendingSyncSummary()).total).toBe(1)
  })
})
