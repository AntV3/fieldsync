import { describe, it, expect, beforeEach, vi } from 'vitest'

const { sessionStorageApi, getSupabaseClient } = vi.hoisted(() => {
  const sessionStorageApi = {
    createSignedUrl: vi.fn(),
    createSignedUrls: vi.fn()
  }
  return {
    sessionStorageApi,
    getSupabaseClient: vi.fn(() => ({ storage: { from: () => sessionStorageApi } }))
  }
})

vi.mock('../lib/db/client', () => ({
  supabase: {},
  isSupabaseConfigured: true,
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn() },
  getClient: getSupabaseClient,
  getSupabaseClient,
  isFieldMode: () => false,
  getConnectionStatus: () => 'online',
  cacheTMTicket: vi.fn(),
  addPendingAction: vi.fn(),
  ACTION_TYPES: {},
  generateTempId: () => 'temp_1',
  sanitize: { text: (v) => v }
}))

import { tmOps, isFreshSignedPhotoUrl } from '../lib/db/tmOps'

const BASE = 'https://example.supabase.co/storage/v1/object'
const PATH = 'company/project/ticket/photo.jpg'

// Minimal unsigned JWT with the given exp (seconds since epoch)
const jwt = (payload) => {
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.signature`
}
const nowSec = () => Math.floor(Date.now() / 1000)
const signedUrl = (expSec, path = PATH) => `${BASE}/sign/tm-photos/${path}?token=${jwt({ exp: expSec, url: `tm-photos/${path}` })}`

const freshUrl = () => signedUrl(nowSec() + 3600)
const staleUrl = () => signedUrl(nowSec() - 10)
const almostExpiredUrl = () => signedUrl(nowSec() + 30) // inside the 60 s guard

describe('isFreshSignedPhotoUrl', () => {
  it('is true for a signed URL with more than the minimum TTL left', () => {
    expect(isFreshSignedPhotoUrl(freshUrl())).toBe(true)
  })

  it('is false for an expired signed URL', () => {
    expect(isFreshSignedPhotoUrl(staleUrl())).toBe(false)
  })

  it('is false when less than minTtlMs remains', () => {
    expect(isFreshSignedPhotoUrl(almostExpiredUrl())).toBe(false)
    expect(isFreshSignedPhotoUrl(almostExpiredUrl(), 1000)).toBe(true)
  })

  it('is false for a malformed token', () => {
    expect(isFreshSignedPhotoUrl(`${BASE}/sign/tm-photos/${PATH}?token=not-a-jwt`)).toBe(false)
    expect(isFreshSignedPhotoUrl(`${BASE}/sign/tm-photos/${PATH}?token=a.b.c`)).toBe(false)
    expect(isFreshSignedPhotoUrl(`${BASE}/sign/tm-photos/${PATH}?token=${jwt({ sub: 'x' })}`)).toBe(false)
    expect(isFreshSignedPhotoUrl(`${BASE}/sign/tm-photos/${PATH}`)).toBe(false)
  })

  it('is false for public URLs, raw paths and non-strings', () => {
    expect(isFreshSignedPhotoUrl(`${BASE}/public/tm-photos/${PATH}`)).toBe(false)
    expect(isFreshSignedPhotoUrl(PATH)).toBe(false)
    expect(isFreshSignedPhotoUrl(null)).toBe(false)
    expect(isFreshSignedPhotoUrl(undefined)).toBe(false)
    expect(isFreshSignedPhotoUrl(42)).toBe(false)
  })

  it('is exposed on the ops object too', () => {
    expect(tmOps.isFreshSignedPhotoUrl(freshUrl())).toBe(true)
  })
})

describe('resolvePhotoUrls', () => {
  beforeEach(() => {
    sessionStorageApi.createSignedUrl.mockReset()
    sessionStorageApi.createSignedUrls.mockReset()
    getSupabaseClient.mockClear()
  })

  it('passes a fresh signed URL through untouched without calling storage', async () => {
    const url = freshUrl()
    const result = await tmOps.resolvePhotoUrls([url])
    expect(result).toEqual([url])
    expect(sessionStorageApi.createSignedUrls).not.toHaveBeenCalled()
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })

  it('re-signs a stale signed URL by its storage path', async () => {
    const stale = staleUrl()
    const fresh = freshUrl()
    sessionStorageApi.createSignedUrls.mockResolvedValue({ data: [{ signedUrl: fresh }], error: null })

    const result = await tmOps.resolvePhotoUrls([stale])

    expect(sessionStorageApi.createSignedUrls).toHaveBeenCalledWith([PATH], 3600)
    expect(result).toEqual([fresh])
  })

  it('uses the optional client instead of the session client', async () => {
    const customStorage = { createSignedUrls: vi.fn().mockResolvedValue({ data: [{ signedUrl: 'https://signed/1' }], error: null }) }
    const customClient = { storage: { from: vi.fn(() => customStorage) } }

    const result = await tmOps.resolvePhotoUrls([PATH], customClient)

    expect(customClient.storage.from).toHaveBeenCalledWith('tm-photos')
    expect(customStorage.createSignedUrls).toHaveBeenCalledWith([PATH], 3600)
    expect(getSupabaseClient).not.toHaveBeenCalled()
    expect(sessionStorageApi.createSignedUrls).not.toHaveBeenCalled()
    expect(result).toEqual(['https://signed/1'])
  })

  it('mixes raw paths, legacy public URLs, fresh URLs and nulls while keeping positions', async () => {
    const fresh = freshUrl()
    const legacy = `${BASE}/public/tm-photos/legacy/one.jpg`
    sessionStorageApi.createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: 'https://signed/path' }, { signedUrl: 'https://signed/legacy' }],
      error: null
    })

    const result = await tmOps.resolvePhotoUrls([PATH, fresh, null, legacy])

    expect(sessionStorageApi.createSignedUrls).toHaveBeenCalledWith([PATH, 'legacy/one.jpg'], 3600)
    expect(result).toEqual(['https://signed/path', fresh, null, 'https://signed/legacy'])
  })

  it('maps a failed signature to null (null-on-failure semantics unchanged)', async () => {
    sessionStorageApi.createSignedUrls.mockResolvedValue({ data: [{ signedUrl: null, error: 'denied' }], error: null })
    const result = await tmOps.resolvePhotoUrls([PATH])
    expect(result).toEqual([null])
  })

  it('returns the input unchanged when storage throws', async () => {
    sessionStorageApi.createSignedUrls.mockRejectedValue(new Error('network'))
    const result = await tmOps.resolvePhotoUrls([PATH])
    expect(result).toEqual([PATH])
  })

  it('returns an empty array for empty input', async () => {
    expect(await tmOps.resolvePhotoUrls([])).toEqual([])
    expect(await tmOps.resolvePhotoUrls(null)).toEqual([])
  })
})

describe('resolvePhotoUrl', () => {
  beforeEach(() => {
    sessionStorageApi.createSignedUrl.mockReset()
    getSupabaseClient.mockClear()
  })

  it('passes a fresh signed URL through', async () => {
    const url = freshUrl()
    expect(await tmOps.resolvePhotoUrl(url)).toBe(url)
    expect(sessionStorageApi.createSignedUrl).not.toHaveBeenCalled()
  })

  it('re-signs a stale URL with the optional client', async () => {
    const customStorage = { createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null }) }
    const customClient = { storage: { from: () => customStorage } }

    const result = await tmOps.resolvePhotoUrl(staleUrl(), customClient)

    expect(customStorage.createSignedUrl).toHaveBeenCalledWith(PATH, 3600)
    expect(getSupabaseClient).not.toHaveBeenCalled()
    expect(result).toBe('https://signed/x')
  })

  it('returns null when signing fails', async () => {
    sessionStorageApi.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'denied' } })
    expect(await tmOps.resolvePhotoUrl(PATH)).toBeNull()
  })
})
