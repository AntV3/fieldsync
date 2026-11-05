import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// tmOps.submitTMTicketFull, the trimmed createTMTicket and the labor-class
// cache in laborOps, against a fake Supabase client.

const { client, cacheData, getCachedData, connection } = vi.hoisted(() => {
  const client = {
    rpc: vi.fn(),
    from: vi.fn()
  }
  return {
    client,
    cacheData: vi.fn(),
    getCachedData: vi.fn(),
    connection: { online: true }
  }
})

vi.mock('../lib/db/client', () => ({
  supabase: client,
  isSupabaseConfigured: true,
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn() },
  getClient: () => client,
  getSupabaseClient: () => client,
  isFieldMode: () => true,
  getConnectionStatus: () => connection.online,
  sanitizeFormData: (v) => v,
  // Mirrors the real sanitize.text contract closely enough for these tests
  sanitize: { text: (v) => (v == null ? '' : String(v).replace(/<[^>]*>/g, '').trim()) },
  cacheData,
  getCachedData
}))

import { tmOps, buildTMTicketFullPayload } from '../lib/db/tmOps'
import { laborOps } from '../lib/db/laborOps'
import { classifySyncError } from '../lib/offlineManager'

const PNG = 'data:image/png;base64,'

const makeRecord = (overrides = {}) => ({
  client_submission_id: 'csid-1',
  project_id: 'proj-1',
  company_id: 'co-1',
  created_at: '2026-11-05T12:00:00.000Z',
  state: 'queued',
  attempts: 0,
  payload: {
    project_id: 'proj-1',
    client_submission_id: 'csid-1',
    work_date: '2026-11-05',
    ce_pco_number: ' PCO-7 ',
    assigned_cor_id: 'cor-1',
    notes: '<b>Demo</b> wall',
    created_by_name: 'Sam',
    workers: [
      { name: 'Ana', hours: 8, overtime_hours: 2, time_started: '08:00', time_ended: '18:00', role: 'Foreman', labor_class_id: 'lc-1' },
      { name: 'Bo', hours: 2, overtime_hours: 0, time_started: null, time_ended: null, role: '', labor_class_id: null }
    ],
    items: [{ material_equipment_id: 'me-1', custom_name: null, custom_category: null, quantity: 3 }]
  },
  signature: null,
  custom_field_data: {},
  cor_import: null,
  photos: [],
  ...overrides
})

// rpc(...) returns a builder exposing abortSignal(), which returns the
// awaited promise — the same shape as postgrest-js.
const rpcResolving = (result) => {
  const builder = {
    signal: null,
    abortSignal: vi.fn((signal) => {
      builder.signal = signal
      return Promise.resolve(result)
    })
  }
  client.rpc.mockReturnValue(builder)
  return builder
}

describe('tmOps.submitTMTicketFull', () => {
  beforeEach(() => {
    client.rpc.mockReset()
    client.from.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends one create_tm_ticket_full call with the sanitized payload and an AbortSignal', async () => {
    const row = { id: 'tkt-1', status: 'pending', replayed: false }
    const builder = rpcResolving({ data: row, error: null })

    const result = await tmOps.submitTMTicketFull(makeRecord())

    expect(result).toEqual(row)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = client.rpc.mock.calls[0]
    expect(fn).toBe('create_tm_ticket_full')
    expect(args.p_payload).toEqual({
      project_id: 'proj-1',
      client_submission_id: 'csid-1',
      work_date: '2026-11-05',
      ce_pco_number: 'PCO-7',
      assigned_cor_id: 'cor-1',
      notes: 'Demo wall',
      created_by_name: 'Sam',
      workers: [
        { name: 'Ana', hours: 8, overtime_hours: 2, time_started: '08:00', time_ended: '18:00', role: 'Foreman', labor_class_id: 'lc-1' },
        { name: 'Bo', hours: 2, overtime_hours: 0, time_started: null, time_ended: null, role: 'Laborer', labor_class_id: null }
      ],
      items: [{ material_equipment_id: 'me-1', custom_name: null, custom_category: null, quantity: 3 }]
    })
    expect(args.p_payload).not.toHaveProperty('foreman_signature')
    expect(builder.abortSignal).toHaveBeenCalledTimes(1)
    expect(builder.signal).toBeInstanceOf(AbortSignal)
  })

  it('passes a long raw PNG signature through untouched', async () => {
    rpcResolving({ data: { id: 'tkt-1', status: 'foreman_signed', replayed: false }, error: null })
    const data = PNG + 'A'.repeat(150000)
    const signature = { signature: data, signerName: 'Sam R', signerTitle: 'Foreman', signedAt: '2026-11-05T12:05:00.000Z' }

    await tmOps.submitTMTicketFull(makeRecord({ signature }))

    const { p_payload } = client.rpc.mock.calls[0][1]
    expect(p_payload.foreman_signature).toEqual({
      data,
      name: 'Sam R',
      title: 'Foreman',
      date: '2026-11-05T12:05:00.000Z'
    })
    expect(p_payload.foreman_signature.data.length).toBe(data.length)
  })

  it('rejects a non-PNG signature with code 22023 before any request', async () => {
    const signature = { signature: 'data:image/jpeg;base64,abc', signerName: 'Sam', signedAt: 'x' }
    await expect(tmOps.submitTMTicketFull(makeRecord({ signature }))).rejects.toMatchObject({ code: '22023' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('rejects an oversize signature with code 22023 before any request', async () => {
    const signature = { signature: PNG + 'A'.repeat(2000000), signerName: 'Sam', signedAt: 'x' }
    await expect(tmOps.submitTMTicketFull(makeRecord({ signature }))).rejects.toMatchObject({ code: '22023' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('throws the Supabase error object as-is, code preserved', async () => {
    const error = { message: 'permission denied for project', code: '42501', details: null, hint: null }
    rpcResolving({ data: null, error })
    const thrown = await tmOps.submitTMTicketFull(makeRecord()).catch(e => e)
    expect(thrown).toBe(error)
    expect(classifySyncError(thrown)).toBe('auth')
  })

  it('a wrapped fetch failure classifies as network', async () => {
    rpcResolving({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
    const thrown = await tmOps.submitTMTicketFull(makeRecord()).catch(e => e)
    expect(classifySyncError(thrown)).toBe('network')
  })

  it('aborts after timeoutMs and rejects with an AbortError (network class), even if the request never settles', async () => {
    vi.useFakeTimers()
    const builder = {
      signal: null,
      abortSignal: vi.fn((signal) => {
        builder.signal = signal
        return new Promise(() => {}) // dead radio: never answers
      })
    }
    client.rpc.mockReturnValue(builder)

    const pending = tmOps.submitTMTicketFull(makeRecord(), { timeoutMs: 12000 })
    const settled = pending.catch(e => e)

    await vi.advanceTimersByTimeAsync(11999)
    expect(builder.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const err = await settled
    expect(builder.signal.aborted).toBe(true)
    expect(err.name).toBe('AbortError')
    expect(classifySyncError(err)).toBe('network')
  })

  it('maps an abort-wrapped Supabase error after the timeout to an AbortError', async () => {
    vi.useFakeTimers()
    const builder = {
      abortSignal: vi.fn((signal) => new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({
          data: null,
          error: { message: 'AbortError: This operation was aborted', code: '' }
        }))
      }))
    }
    client.rpc.mockReturnValue(builder)

    const settled = tmOps.submitTMTicketFull(makeRecord(), { timeoutMs: 500 }).catch(e => e)
    await vi.advanceTimersByTimeAsync(500)
    const err = await settled
    expect(err.name).toBe('AbortError')
    expect(classifySyncError(err)).toBe('network')
  })

  it('requires project_id and client_submission_id (22023, no request)', async () => {
    const record = makeRecord({ client_submission_id: undefined })
    record.payload = { ...record.payload, client_submission_id: undefined }
    await expect(tmOps.submitTMTicketFull(record)).rejects.toMatchObject({ code: '22023' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('buildTMTicketFullPayload falls back to record-level ids', () => {
    const record = makeRecord()
    delete record.payload.project_id
    delete record.payload.client_submission_id
    const p = buildTMTicketFullPayload(record)
    expect(p.project_id).toBe('proj-1')
    expect(p.client_submission_id).toBe('csid-1')
  })
})

describe('tmOps.createTMTicket (offline branches removed)', () => {
  const insertChain = (result) => {
    const chain = {
      insert: vi.fn(() => chain),
      select: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve(result))
    }
    client.from.mockReturnValue(chain)
    return chain
  }

  beforeEach(() => {
    client.from.mockReset()
    connection.online = true
  })

  it('inserts the ticket row and returns it', async () => {
    const chain = insertChain({ data: { id: 'real-1' }, error: null })
    const row = await tmOps.createTMTicket({ project_id: 'proj-1', work_date: '2026-11-05', notes: 'x' })
    expect(row).toEqual({ id: 'real-1' })
    expect(client.from).toHaveBeenCalledWith('t_and_m_tickets')
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'proj-1', status: 'pending' }))
  })

  it('no longer returns a temp id when the browser reports offline', async () => {
    connection.online = false
    insertChain({ data: { id: 'real-2' }, error: null })
    const row = await tmOps.createTMTicket({ project_id: 'proj-1', work_date: '2026-11-05' })
    expect(row.id).toBe('real-2')
    expect(String(row.id)).not.toMatch(/^temp_/)
  })

  it('throws a network error instead of queueing a hollow temp ticket', async () => {
    const error = { message: 'TypeError: Failed to fetch', code: '' }
    insertChain({ data: null, error })
    await expect(tmOps.createTMTicket({ project_id: 'proj-1', work_date: '2026-11-05' })).rejects.toBe(error)
  })
})

describe('laborOps.getLaborClassesForField cache', () => {
  const fallbackChain = (result) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve(result))
    }
    return chain
  }

  beforeEach(() => {
    client.rpc.mockReset()
    client.from.mockReset()
    cacheData.mockReset().mockResolvedValue(undefined)
    getCachedData.mockReset().mockResolvedValue(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    console.error.mockRestore?.()
  })

  it('caches the RPC result under labor_classes_<companyId>', async () => {
    client.rpc.mockResolvedValue({
      data: [{ id: 'lc-1', name: 'Operator', category_id: 'cat-1', category_name: 'Equipment' }],
      error: null
    })
    const result = await laborOps.getLaborClassesForField('co-1')
    const expected = {
      categories: [{ id: 'cat-1', name: 'Equipment' }],
      classes: [{ id: 'lc-1', name: 'Operator', category_id: 'cat-1' }]
    }
    expect(result).toEqual(expected)
    await vi.waitFor(() => expect(cacheData).toHaveBeenCalledWith('labor_classes_co-1', expected))
  })

  it('serves the cached copy when both the RPC and the fallback fail', async () => {
    const cached = { categories: [{ id: 'cat-1', name: 'Equipment' }], classes: [{ id: 'lc-1', name: 'Operator', category_id: 'cat-1' }] }
    getCachedData.mockResolvedValue(cached)
    const netErr = { message: 'TypeError: Failed to fetch', code: '' }
    client.rpc.mockResolvedValue({ data: null, error: netErr })
    client.from.mockImplementation(() => fallbackChain({ data: null, error: netErr }))

    const result = await laborOps.getLaborClassesForField('co-1')
    expect(result).toEqual(cached)
    expect(getCachedData).toHaveBeenCalledWith('labor_classes_co-1')
    expect(cacheData).not.toHaveBeenCalled()
  })

  it('serves the cache when the RPC call itself throws', async () => {
    const cached = { categories: [], classes: [{ id: 'lc-9', name: 'Helper', category_id: null }] }
    getCachedData.mockResolvedValue(cached)
    client.rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    client.from.mockImplementation(() => { throw new TypeError('Failed to fetch') })

    expect(await laborOps.getLaborClassesForField('co-1')).toEqual(cached)
  })

  it('returns empty lists when everything fails and nothing is cached', async () => {
    const netErr = { message: 'TypeError: Failed to fetch', code: '' }
    client.rpc.mockResolvedValue({ data: null, error: netErr })
    client.from.mockImplementation(() => fallbackChain({ data: null, error: netErr }))
    expect(await laborOps.getLaborClassesForField('co-1')).toEqual({ categories: [], classes: [] })
  })

  it('still returns live data when the cache write fails', async () => {
    cacheData.mockRejectedValue(new Error('IndexedDB is not available'))
    client.rpc.mockResolvedValue({ data: [{ id: 'lc-1', name: 'Operator', category_id: null }], error: null })
    const result = await laborOps.getLaborClassesForField('co-1')
    expect(result.classes).toHaveLength(1)
  })
})
