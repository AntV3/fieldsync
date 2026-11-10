import { describe, it, expect, beforeEach, vi } from 'vitest'

// tmOps.saveTMClientSignature: the server function records an on-site client
// signature when it exists; before that migration the app writes the row.

const { client, chain, state } = vi.hoisted(() => {
  const state = { rpcResult: { data: null, error: null }, updates: [] }
  const chain = { result: { data: { id: 't-1', status: 'client_signed' }, error: null } }
  for (const method of ['eq', 'select']) chain[method] = () => chain
  chain.update = (values) => { state.updates.push(values); return chain }
  chain.single = () => Promise.resolve(chain.result)
  const client = { from: () => chain, rpc: vi.fn(() => Promise.resolve(state.rpcResult)) }
  return { client, chain, state }
})

vi.mock('../lib/db/client', () => ({
  supabase: client,
  isSupabaseConfigured: true,
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), activity: vi.fn() },
  getClient: () => client,
  getSupabaseClient: () => client,
  isFieldMode: () => true,
  sanitizeFormData: (v) => v,
  sanitize: { text: (v) => (v == null ? '' : String(v)) },
  cacheData: vi.fn(),
  getCachedData: vi.fn()
}))

import { tmOps } from '../lib/db/tmOps'

const signature = { signature: 'data:image/png;base64,AAAA', signerName: 'Pat GC', signerTitle: 'Super', signerCompany: 'GC Inc', signedAt: '2026-11-10T10:00:00Z' }

describe('tmOps.saveTMClientSignature', () => {
  beforeEach(() => {
    client.rpc.mockClear()
    state.updates.length = 0
    chain.result = { data: { id: 't-1', status: 'client_signed' }, error: null }
  })

  it('records the signature through the server function and does not write the row itself', async () => {
    state.rpcResult = { data: { id: 't-1', status: 'client_signed' }, error: null }
    const result = await tmOps.saveTMClientSignature('t-1', signature)

    expect(client.rpc).toHaveBeenCalledWith('record_tm_client_signature', {
      p_ticket_id: 't-1',
      p_signature: expect.objectContaining({ signature: signature.signature, signerName: 'Pat GC', signerTitle: 'Super', signerCompany: 'GC Inc' })
    })
    expect(state.updates).toHaveLength(0)
    expect(result).toEqual({ id: 't-1', status: 'client_signed' })
  })

  it('falls back to writing the ticket when the function does not exist yet', async () => {
    state.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    const result = await tmOps.saveTMClientSignature('t-1', signature)

    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ client_signature_name: 'Pat GC', status: 'client_signed' })
    expect(result).toEqual({ id: 't-1', status: 'client_signed' })
  })

  it('passes a real refusal on without falling back', async () => {
    state.rpcResult = { data: null, error: { code: 'P0001', message: 'This ticket already has a client signature' } }
    await expect(tmOps.saveTMClientSignature('t-1', signature)).rejects.toMatchObject({ code: 'P0001' })
    expect(state.updates).toHaveLength(0)
  })
})
