import { describe, it, expect, beforeEach, vi } from 'vitest'

// corOps talks to Supabase through the signing client (x-signing-token
// header) when a token is given, and falls back to the session client.
const { signingClient, fallbackClient, getSigningClient, getClient } = vi.hoisted(() => {
  const signingClient = { rpc: vi.fn(), from: vi.fn() }
  const fallbackClient = { rpc: vi.fn(), from: vi.fn() }
  return {
    signingClient,
    fallbackClient,
    getSigningClient: vi.fn(() => signingClient),
    getClient: vi.fn(() => fallbackClient)
  }
})

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  isSupabaseConfigured: true,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
}))

vi.mock('../lib/fieldSession', () => ({
  getClient,
  getFieldClient: getClient,
  getSupabaseClient: getClient,
  getFieldSession: () => null,
  isFieldMode: () => false
}))

vi.mock('../lib/signingClient', () => ({
  getSigningClient,
  resetSigningClient: vi.fn()
}))

vi.mock('../lib/observability', () => ({
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), event: vi.fn() }
}))

vi.mock('../lib/offlineManager', () => ({
  generateTempId: () => 'temp_1'
}))

import { corOps } from '../lib/corOps'

const TOKEN = 'sig_test0001'

describe('corOps public signing RPCs', () => {
  beforeEach(() => {
    signingClient.rpc.mockReset()
    signingClient.from.mockReset()
    fallbackClient.rpc.mockReset()
    fallbackClient.from.mockReset()
    getSigningClient.mockClear()
    getClient.mockClear()
    getSigningClient.mockImplementation(() => signingClient)
  })

  describe('getSignatureRequestByToken', () => {
    it('calls public_get_signature_request_by_token with p_token on the signing client', async () => {
      const row = { id: 'req1', status: 'pending', document_type: 'tm_ticket', signatures: [] }
      signingClient.rpc.mockResolvedValue({ data: row, error: null })

      const result = await corOps.getSignatureRequestByToken(TOKEN)

      expect(getSigningClient).toHaveBeenCalledWith(TOKEN)
      expect(signingClient.rpc).toHaveBeenCalledTimes(1)
      expect(signingClient.rpc).toHaveBeenCalledWith('public_get_signature_request_by_token', { p_token: TOKEN })
      expect(result).toEqual(row)
    })

    it('no longer calls increment_signature_view_count', async () => {
      signingClient.rpc.mockResolvedValue({ data: null, error: null })

      await corOps.getSignatureRequestByToken(TOKEN)

      const names = signingClient.rpc.mock.calls.map(c => c[0])
      expect(names).not.toContain('increment_signature_view_count')
      expect(fallbackClient.rpc).not.toHaveBeenCalled()
    })

    it('passes through the expired marker shape unchanged', async () => {
      const marker = { status: 'expired', document_type: 'cor' }
      signingClient.rpc.mockResolvedValue({ data: marker, error: null })

      await expect(corOps.getSignatureRequestByToken(TOKEN)).resolves.toEqual(marker)
    })

    it('falls back to the session client when no signing client is available', async () => {
      getSigningClient.mockImplementation(() => null)
      fallbackClient.rpc.mockResolvedValue({ data: null, error: null })

      await corOps.getSignatureRequestByToken(TOKEN)

      expect(fallbackClient.rpc).toHaveBeenCalledWith('public_get_signature_request_by_token', { p_token: TOKEN })
      expect(signingClient.rpc).not.toHaveBeenCalled()
    })
  })

  describe('getDocumentForSigning', () => {
    it('takes only the token and calls public_get_document_for_signing', async () => {
      const doc = { id: 'tkt1', projects: { id: 'p1', companies: { name: 'Acme' } } }
      signingClient.rpc.mockResolvedValue({ data: doc, error: null })

      const result = await corOps.getDocumentForSigning(TOKEN)

      expect(corOps.getDocumentForSigning.length).toBe(1)
      expect(signingClient.rpc).toHaveBeenCalledTimes(1)
      expect(signingClient.rpc).toHaveBeenCalledWith('public_get_document_for_signing', { p_token: TOKEN })
      expect(result).toEqual(doc)
    })

    it('returns null when the RPC returns null', async () => {
      signingClient.rpc.mockResolvedValue({ data: null, error: null })
      await expect(corOps.getDocumentForSigning('sig_nope')).resolves.toBeNull()
    })

    it('throws the RPC error', async () => {
      signingClient.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
      await expect(corOps.getDocumentForSigning(TOKEN)).rejects.toMatchObject({ message: 'boom' })
    })
  })

  describe('addSignature', () => {
    const payload = {
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
      signerName: 'QA GC',
      signerTitle: 'PM',
      signerCompany: 'GC Co',
      signedAt: '2026-11-05T12:00:00.000Z',
      userAgent: 'vitest-ua'
    }

    it('calls public_add_signature with p_token, p_slot and the exact p_signature keys', async () => {
      const response = { signature: { id: 's1' }, document_status: 'client_signed', request_status: 'completed' }
      signingClient.rpc.mockResolvedValue({ data: response, error: null })

      const result = await corOps.addSignature(TOKEN, 1, payload)

      expect(signingClient.rpc).toHaveBeenCalledTimes(1)
      const [name, args] = signingClient.rpc.mock.calls[0]
      expect(name).toBe('public_add_signature')
      expect(Object.keys(args).sort()).toEqual(['p_signature', 'p_slot', 'p_token'])
      expect(args.p_token).toBe(TOKEN)
      expect(args.p_slot).toBe(1)
      expect(Object.keys(args.p_signature).sort()).toEqual(
        ['signature', 'signedAt', 'signerCompany', 'signerName', 'signerTitle', 'userAgent']
      )
      expect(args.p_signature).toEqual(payload)
      expect(result).toEqual(response)
    })

    it('never sends an ipAddress and nulls missing optional fields', async () => {
      signingClient.rpc.mockResolvedValue({ data: {}, error: null })

      await corOps.addSignature(TOKEN, 2, {
        signature: payload.signature,
        signerName: 'Only Name',
        ipAddress: '203.0.113.9'
      })

      const args = signingClient.rpc.mock.calls[0][1]
      expect(args.p_slot).toBe(2)
      expect(args.p_signature).not.toHaveProperty('ipAddress')
      expect(args.p_signature.signerTitle).toBeNull()
      expect(args.p_signature.signerCompany).toBeNull()
      expect(args.p_signature.userAgent).toBeNull()
      expect(typeof args.p_signature.signedAt).toBe('string')
    })

    it('surfaces the stable error token in error.message', async () => {
      signingClient.rpc.mockResolvedValue({ data: null, error: { message: 'signing_already_signed' } })

      await expect(corOps.addSignature(TOKEN, 1, payload)).rejects.toMatchObject({ message: 'signing_already_signed' })
    })

    it('does not write to the signatures table directly', async () => {
      signingClient.rpc.mockResolvedValue({ data: {}, error: null })
      signingClient.from.mockImplementation(() => { throw new Error('direct table access is not allowed') })

      await expect(corOps.addSignature(TOKEN, 1, payload)).resolves.toEqual({})

      expect(signingClient.from).not.toHaveBeenCalled()
      expect(fallbackClient.from).not.toHaveBeenCalled()
      expect(fallbackClient.rpc).not.toHaveBeenCalled()
      expect(signingClient.rpc).toHaveBeenCalledTimes(1)
      expect(signingClient.rpc.mock.calls[0][0]).toBe('public_add_signature')
    })
  })

  it('no longer exposes syncSignatureToDocument', () => {
    expect(corOps.syncSignatureToDocument).toBeUndefined()
  })

  it('keeps _logCORStatusChange for in-app COR flows', () => {
    expect(typeof corOps._logCORStatusChange).toBe('function')
  })
})
