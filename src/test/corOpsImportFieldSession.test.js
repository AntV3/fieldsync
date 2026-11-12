import { describe, it, expect, vi } from 'vitest'

// A field (PIN) session gets its own client; the office uses `supabase`
const { supabase, fieldClient } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  fieldClient: { from: vi.fn() }
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase,
  isSupabaseConfigured: true,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
}))
vi.mock('../lib/fieldSession', () => ({
  getClient: () => fieldClient,
  getFieldClient: () => fieldClient,
  getSupabaseClient: () => fieldClient,
  getFieldSession: () => ({ token: 't', projectId: 'p1' }),
  isFieldMode: () => true
}))
vi.mock('../lib/signingClient', () => ({ getSigningClient: vi.fn(), resetSigningClient: vi.fn() }))
vi.mock('../lib/observability', () => ({
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), event: vi.fn(), activity: vi.fn() }
}))
vi.mock('../lib/offlineManager', () => ({ generateTempId: () => 'temp_1' }))

import { corOps } from '../lib/corOps'

describe('corOps.importTicketDataToCOR from a field session', () => {
  it('leaves pricing to the office and touches no table', async () => {
    const result = await corOps.importTicketDataToCOR('t1', 'cor1', 'co1', 'demolition', 'standard')

    expect(result).toMatchObject({ skipped: true, leftForOffice: true })
    expect(fieldClient.from).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
