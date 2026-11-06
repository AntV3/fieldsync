import { describe, it, expect, beforeEach, vi } from 'vitest'

// Office and field writes on signature_requests go through RPCs on the
// session client (getClient: office JWT or the field client with the
// x-field-session header). The public signing reads/writes stay on the
// signing client (item 1).
const { signingClient, sessionClient, getSigningClient, getClient, supabaseFrom } = vi.hoisted(() => {
  const signingClient = { rpc: vi.fn(), from: vi.fn() }
  const sessionClient = { rpc: vi.fn(), from: vi.fn() }
  return {
    signingClient,
    sessionClient,
    getSigningClient: vi.fn(() => signingClient),
    getClient: vi.fn(() => sessionClient),
    supabaseFrom: vi.fn()
  }
})

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: supabaseFrom, rpc: vi.fn() },
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

// Chainable PostgREST query builder stub: every builder method returns the
// builder; awaiting it resolves to the queued result.
function queryBuilder(result) {
  const builder = {}
  for (const m of ['select', 'eq', 'order', 'insert', 'update', 'single']) {
    builder[m] = vi.fn(() => builder)
  }
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return builder
}

const ROW = {
  id: 'req1',
  signature_token: 'sig_abc',
  status: 'pending',
  expires_at: '2026-12-05T00:00:00.000Z',
  recipient_email: 'gc@example.com',
  recipient_name: 'Gina GC',
  sent_at: null,
  last_sent_at: null,
  send_count: 0,
  resend_requested_at: null,
  created_at: '2026-11-05T12:00:00.000Z'
}

describe('corOps signature request writes (create/resend RPCs)', () => {
  beforeEach(() => {
    sessionClient.rpc.mockReset()
    sessionClient.from.mockReset()
    signingClient.rpc.mockReset()
    signingClient.from.mockReset()
    supabaseFrom.mockReset()
    getClient.mockClear()
    getSigningClient.mockClear()
  })

  describe('createSignatureRequest', () => {
    it('calls create_signature_request with exactly the six p_* params', async () => {
      sessionClient.rpc.mockResolvedValue({ data: ROW, error: null })

      const result = await corOps.createSignatureRequest(
        'cor', 'cor1', 'company1', 'proj1', 'user1', '2026-12-05T00:00:00.000Z',
        { email: ' gc@example.com ', name: ' Gina GC ' }
      )

      expect(sessionClient.rpc).toHaveBeenCalledTimes(1)
      expect(sessionClient.rpc).toHaveBeenCalledWith('create_signature_request', {
        p_document_type: 'cor',
        p_document_id: 'cor1',
        p_project_id: 'proj1',
        p_expires_at: '2026-12-05T00:00:00.000Z',
        p_recipient_email: 'gc@example.com',
        p_recipient_name: 'Gina GC'
      })
      const params = sessionClient.rpc.mock.calls[0][1]
      expect(Object.keys(params).sort()).toEqual([
        'p_document_id', 'p_document_type', 'p_expires_at', 'p_project_id', 'p_recipient_email', 'p_recipient_name'
      ])
      // company_id / created_by are derived server-side
      expect(JSON.stringify(params)).not.toContain('company1')
      expect(JSON.stringify(params)).not.toContain('user1')
      expect(result).toEqual(ROW)
    })

    it('never inserts directly or mints the token client-side', async () => {
      sessionClient.rpc.mockResolvedValue({ data: ROW, error: null })

      await corOps.createSignatureRequest('tm_ticket', 't1', 'c1', 'p1', null, null, { email: 'gc@example.com', name: 'G' })

      const names = sessionClient.rpc.mock.calls.map(c => c[0])
      expect(names).toEqual(['create_signature_request'])
      expect(names).not.toContain('generate_signature_token')
      expect(sessionClient.from).not.toHaveBeenCalled()
      expect(supabaseFrom).not.toHaveBeenCalled()
      expect(signingClient.rpc).not.toHaveBeenCalled()
    })

    it('sends null recipient fields when no recipient is given (legacy 6-arg call)', async () => {
      sessionClient.rpc.mockResolvedValue({ data: { ...ROW, recipient_email: null }, error: null })

      await corOps.createSignatureRequest('tm_ticket', 't1', 'c1', 'p1', null, null)

      expect(sessionClient.rpc).toHaveBeenCalledWith('create_signature_request', {
        p_document_type: 'tm_ticket',
        p_document_id: 't1',
        p_project_id: 'p1',
        p_expires_at: null,
        p_recipient_email: null,
        p_recipient_name: null
      })
    })

    it('treats an explicit null recipient and a blank email as no recipient', async () => {
      sessionClient.rpc.mockResolvedValue({ data: ROW, error: null })

      await corOps.createSignatureRequest('cor', 'cor1', 'c1', 'p1', null, null, null)
      await corOps.createSignatureRequest('cor', 'cor1', 'c1', 'p1', null, null, { email: '   ', name: 'Someone' })

      for (const call of sessionClient.rpc.mock.calls) {
        expect(call[1].p_recipient_email).toBeNull()
        expect(call[1].p_recipient_name).toBeNull()
      }
    })

    it('sends a null name when only an email is given', async () => {
      sessionClient.rpc.mockResolvedValue({ data: ROW, error: null })

      await corOps.createSignatureRequest('cor', 'cor1', 'c1', 'p1', null, null, { email: 'gc@example.com', name: '' })

      expect(sessionClient.rpc.mock.calls[0][1]).toMatchObject({
        p_recipient_email: 'gc@example.com',
        p_recipient_name: null
      })
    })

    it('throws the RPC error unchanged (authorization / validation)', async () => {
      const error = { code: '42501', message: 'Not authorized for this project' }
      sessionClient.rpc.mockResolvedValue({ data: null, error })

      await expect(
        corOps.createSignatureRequest('cor', 'cor1', 'c1', 'p1', null, null, null)
      ).rejects.toBe(error)
    })
  })

  describe('resendSignatureRequest', () => {
    it('calls resend_signature_request with p_request_id and returns the row', async () => {
      const updated = { ...ROW, resend_requested_at: '2026-11-05T12:10:00.000Z' }
      sessionClient.rpc.mockResolvedValue({ data: updated, error: null })

      const result = await corOps.resendSignatureRequest('req1')

      expect(sessionClient.rpc).toHaveBeenCalledTimes(1)
      expect(sessionClient.rpc).toHaveBeenCalledWith('resend_signature_request', { p_request_id: 'req1' })
      expect(sessionClient.from).not.toHaveBeenCalled()
      expect(result).toEqual(updated)
    })

    it('throws the throttle error with its message verbatim', async () => {
      sessionClient.rpc.mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'Please wait a few minutes before resending' }
      })

      await expect(corOps.resendSignatureRequest('req1'))
        .rejects.toMatchObject({ message: 'Please wait a few minutes before resending' })
    })
  })

  describe('getSignatureRequestsForDocument', () => {
    it('embeds signatures and email_outbox delivery columns', async () => {
      const rows = [{ ...ROW, signatures: [], email_outbox: [{ id: 'o1', status: 'sent' }] }]
      const builder = queryBuilder({ data: rows, error: null })
      sessionClient.from.mockReturnValue(builder)

      const result = await corOps.getSignatureRequestsForDocument('cor', 'cor1')

      expect(sessionClient.from).toHaveBeenCalledWith('signature_requests')
      expect(builder.select).toHaveBeenCalledTimes(1)
      const columns = builder.select.mock.calls[0][0]
      expect(columns).toContain('signatures (*)')
      expect(columns).toContain('email_outbox (id, status, attempts, sent_at, last_error, created_at)')
      expect(builder.eq).toHaveBeenCalledWith('document_type', 'cor')
      expect(builder.eq).toHaveBeenCalledWith('document_id', 'cor1')
      expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(result).toEqual(rows)
    })

    it('falls back to the plain select when the email_outbox embed is missing (PGRST200)', async () => {
      const rows = [{ ...ROW, signatures: [] }]
      const failing = queryBuilder({ data: null, error: { code: 'PGRST200', message: 'Could not find a relationship' } })
      const plain = queryBuilder({ data: rows, error: null })
      sessionClient.from.mockReturnValueOnce(failing).mockReturnValueOnce(plain)

      const result = await corOps.getSignatureRequestsForDocument('tm_ticket', 't1')

      expect(sessionClient.from).toHaveBeenCalledTimes(2)
      expect(failing.select.mock.calls[0][0]).toContain('email_outbox (')
      const fallbackColumns = plain.select.mock.calls[0][0]
      expect(fallbackColumns).toContain('signatures (*)')
      expect(fallbackColumns).not.toContain('email_outbox')
      expect(plain.eq).toHaveBeenCalledWith('document_type', 'tm_ticket')
      expect(plain.eq).toHaveBeenCalledWith('document_id', 't1')
      expect(result).toEqual(rows)
    })

    it('does not fall back on other errors', async () => {
      const error = { code: '42501', message: 'permission denied' }
      sessionClient.from.mockReturnValue(queryBuilder({ data: null, error }))

      await expect(corOps.getSignatureRequestsForDocument('cor', 'cor1')).rejects.toBe(error)
      expect(sessionClient.from).toHaveBeenCalledTimes(1)
    })

    it('returns [] for a null result', async () => {
      sessionClient.from.mockReturnValue(queryBuilder({ data: null, error: null }))
      await expect(corOps.getSignatureRequestsForDocument('cor', 'cor1')).resolves.toEqual([])
    })
  })

  describe('public signing paths stay on item 1 token RPCs', () => {
    it('addSignature calls public_add_signature on the signing client', async () => {
      signingClient.rpc.mockResolvedValue({ data: { signature: { id: 's1' } }, error: null })

      await corOps.addSignature('sig_abc', 1, { signature: 'data:image/png;base64,xx', signerName: 'G' })

      expect(getSigningClient).toHaveBeenCalledWith('sig_abc')
      expect(signingClient.rpc).toHaveBeenCalledWith('public_add_signature', expect.objectContaining({ p_token: 'sig_abc', p_slot: 1 }))
      expect(signingClient.from).not.toHaveBeenCalled()
      expect(sessionClient.from).not.toHaveBeenCalled()
    })

    it('getDocumentForSigning calls public_get_document_for_signing on the signing client', async () => {
      signingClient.rpc.mockResolvedValue({ data: { id: 'cor1' }, error: null })

      await corOps.getDocumentForSigning('sig_abc')

      expect(signingClient.rpc).toHaveBeenCalledWith('public_get_document_for_signing', { p_token: 'sig_abc' })
      expect(signingClient.from).not.toHaveBeenCalled()
    })

    it('does not expose submitPublicSignature', () => {
      expect(corOps.submitPublicSignature).toBeUndefined()
    })
  })
})
