import { describe, it, expect } from 'vitest'
import { initOfflineDB, hasIndexedDB, IDBUnavailableError } from '../lib/offlineManager'

describe('offlineManager IndexedDB availability guard', () => {
  it('hasIndexedDB() returns false in the jsdom test environment', () => {
    expect(hasIndexedDB()).toBe(false)
  })

  it('initOfflineDB() rejects with IDBUnavailableError when IndexedDB is missing', async () => {
    await expect(initOfflineDB()).rejects.toBeInstanceOf(IDBUnavailableError)
  })

  it('IDBUnavailableError carries a distinctive name so callers can filter it out of logs', async () => {
    try {
      await initOfflineDB()
      expect.fail('expected initOfflineDB to reject')
    } catch (err) {
      expect(err?.name).toBe('IDBUnavailableError')
    }
  })
})
