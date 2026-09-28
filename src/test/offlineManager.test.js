import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  initOfflineDB,
  isOfflineStorageSupported,
  getPendingActionCount,
  OFFLINE_UNAVAILABLE_CODE,
} from '../lib/offlineManager'

describe('offlineManager IndexedDB availability guard', () => {
  const originalIdb = globalThis.indexedDB

  beforeEach(() => {
    delete globalThis.indexedDB
  })

  afterEach(() => {
    if (originalIdb === undefined) delete globalThis.indexedDB
    else globalThis.indexedDB = originalIdb
    vi.restoreAllMocks()
  })

  it('reports offline storage as unsupported when indexedDB is absent', () => {
    expect(isOfflineStorageSupported()).toBe(false)
  })

  it('initOfflineDB rejects with OFFLINE_UNAVAILABLE_CODE instead of ReferenceError', async () => {
    await expect(initOfflineDB()).rejects.toMatchObject({
      code: OFFLINE_UNAVAILABLE_CODE,
    })
  })

  it('does not touch the (missing) indexedDB global at all', async () => {
    // Any bare `indexedDB.open(...)` call would throw ReferenceError, not our
    // typed rejection — this guards against a regression that removes the check.
    try {
      await initOfflineDB()
    } catch (err) {
      expect(err.name).not.toBe('ReferenceError')
      expect(err.code).toBe(OFFLINE_UNAVAILABLE_CODE)
    }
  })

  it('getPendingActionCount returns 0 when offline storage is unavailable', async () => {
    await expect(getPendingActionCount()).resolves.toBe(0)
  })
})
