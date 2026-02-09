/**
 * FieldSync Offline Sync Integration Tests
 *
 * Tests the core sync mechanism: pending action queue, conflict detection
 * during sync, retry/dead-letter behavior, and the async mutex.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// Complete in-memory IndexedDB mock
// ============================================

const createMockObjectStore = (data, autoIncrement = false, storeName = '') => {
  const store = {
    _data: data,
    _pendingOps: 0,
    _tx: null,

    put(item) {
      const key = item.id ?? item.key
      data[key] = JSON.parse(JSON.stringify(item))
      store._pendingOps++
      const req = { result: key, onsuccess: null, onerror: null }
      Promise.resolve().then(() => {
        req.onsuccess?.()
        store._pendingOps--
        if (store._pendingOps === 0 && store._tx?.oncomplete) {
          Promise.resolve().then(() => store._tx.oncomplete())
        }
      })
      return req
    },

    add(item) {
      if (autoIncrement && item.id === undefined) {
        item.id = autoIncrementCounters[storeName]++
      }
      const key = item.id ?? item.key
      data[key] = JSON.parse(JSON.stringify(item))
      store._pendingOps++
      const req = { result: key, onsuccess: null, onerror: null }
      Promise.resolve().then(() => {
        req.onsuccess?.()
        store._pendingOps--
        if (store._pendingOps === 0 && store._tx?.oncomplete) {
          Promise.resolve().then(() => store._tx.oncomplete())
        }
      })
      return req
    },

    get(key) {
      const result = data[key] ? JSON.parse(JSON.stringify(data[key])) : undefined
      const req = { result, onsuccess: null, onerror: null }
      Promise.resolve().then(() => req.onsuccess?.())
      return req
    },

    getAll() {
      const result = Object.values(data).map(v => JSON.parse(JSON.stringify(v)))
      const req = { result, onsuccess: null, onerror: null }
      Promise.resolve().then(() => req.onsuccess?.())
      return req
    },

    delete(key) {
      delete data[key]
      const req = { result: undefined, onsuccess: null, onerror: null }
      Promise.resolve().then(() => req.onsuccess?.())
      return req
    },

    clear() {
      Object.keys(data).forEach(k => delete data[k])
      const req = { result: undefined, onsuccess: null, onerror: null }
      Promise.resolve().then(() => req.onsuccess?.())
      return req
    },

    index(indexName) {
      return {
        getAll(value) {
          const filtered = Object.values(data)
            .filter(item => {
              // Match items where any indexed field equals the value
              return item[indexName] === value ||
                item.project_id === value ||
                item.company_id === value
            })
            .map(v => JSON.parse(JSON.stringify(v)))
          const req = { result: filtered, onsuccess: null, onerror: null }
          Promise.resolve().then(() => req.onsuccess?.())
          return req
        }
      }
    },

    createIndex() { return {} }
  }

  return store
}

// Store registry — persists across transactions
const storeData = {}
const storeConfig = {
  'pending_actions': { autoIncrement: true },
}
// Auto-increment counters persist across transactions (like real IDB)
const autoIncrementCounters = {}

const createMockDB = () => {
  const database = {
    transaction(storeName, mode) {
      if (!storeData[storeName]) storeData[storeName] = {}
      const isAutoIncrement = storeConfig[storeName]?.autoIncrement || false
      if (isAutoIncrement && !autoIncrementCounters[storeName]) {
        autoIncrementCounters[storeName] = 1
      }
      const objStore = createMockObjectStore(storeData[storeName], isAutoIncrement, storeName)
      const tx = {
        oncomplete: null,
        onerror: null,
        objectStore(name) {
          objStore._tx = tx
          return objStore
        }
      }
      return tx
    }
  }
  return database
}

let mockDB

const mockIndexedDB = {
  open(name, version) {
    mockDB = createMockDB()
    const req = {
      result: mockDB,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null
    }
    Promise.resolve().then(() => {
      if (req.onupgradeneeded) {
        req.onupgradeneeded({
          target: {
            result: {
              objectStoreNames: { contains: () => false },
              createObjectStore: (name, opts) => {
                storeData[name] = storeData[name] || {}
                if (opts?.autoIncrement) {
                  storeConfig[name] = { autoIncrement: true }
                }
                return { createIndex: () => {} }
              }
            }
          }
        })
      }
      req.onsuccess?.()
    })
    return req
  }
}

// Install mocks before importing modules
vi.stubGlobal('indexedDB', mockIndexedDB)
if (typeof navigator === 'undefined' || !navigator.onLine) {
  vi.stubGlobal('navigator', { onLine: true })
}

// ============================================
// Import modules under test (after mocks)
// ============================================
import {
  syncPendingActions,
  addPendingAction,
  getPendingActions,
  removePendingAction,
  updatePendingAction,
  initOfflineDB,
  ACTION_TYPES,
  getConnectionStatus,
  updateCachedAreaStatus,
  cacheAreas,
  getCachedAreas,
  saveToStore,
  getFromStore,
  STORES,
  _resetSyncState
} from '../lib/offlineManager'
import { detectConflict, stampForOffline, RESOLUTION_STRATEGIES } from '../lib/conflictDetection'

// Helper to clear all stores and reset sync state between tests
const clearAllStores = () => {
  Object.keys(storeData).forEach(key => {
    Object.keys(storeData[key]).forEach(k => delete storeData[key][k])
  })
  // Reset auto-increment counters
  Object.keys(autoIncrementCounters).forEach(key => {
    autoIncrementCounters[key] = 1
  })
  // Reset the sync mutex so tests don't leak state
  _resetSyncState()
}

// ============================================
// Test: ACTION_TYPES enum
// ============================================
describe('ACTION_TYPES', () => {
  it('should define all expected action types', () => {
    expect(ACTION_TYPES.UPDATE_AREA_STATUS).toBe('UPDATE_AREA_STATUS')
    expect(ACTION_TYPES.CREATE_TM_TICKET).toBe('CREATE_TM_TICKET')
    expect(ACTION_TYPES.SAVE_CREW_CHECKIN).toBe('SAVE_CREW_CHECKIN')
    expect(ACTION_TYPES.SUBMIT_DAILY_REPORT).toBe('SUBMIT_DAILY_REPORT')
    expect(ACTION_TYPES.SEND_MESSAGE).toBe('SEND_MESSAGE')
    expect(ACTION_TYPES.CREATE_MATERIAL_REQUEST).toBe('CREATE_MATERIAL_REQUEST')
  })
})

// ============================================
// Test: Pending actions queue
// ============================================
describe('Pending actions queue', () => {
  beforeEach(async () => {
    clearAllStores()
    await initOfflineDB()
  })

  it('should add and retrieve pending actions', async () => {
    const id = await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      areaId: 'a1',
      status: 'done'
    })

    expect(id).toBeDefined()

    const actions = await getPendingActions()
    expect(actions.length).toBe(1)
    expect(actions[0].type).toBe(ACTION_TYPES.UPDATE_AREA_STATUS)
    expect(actions[0].payload.areaId).toBe('a1')
    expect(actions[0].attempts).toBe(0)
    expect(actions[0].created_at).toBeDefined()
  })

  it('should remove pending action by id', async () => {
    const id = await addPendingAction(ACTION_TYPES.SEND_MESSAGE, {
      projectId: 'p1',
      content: 'Hello'
    })

    await removePendingAction(id)

    const actions = await getPendingActions()
    expect(actions.length).toBe(0)
  })

  it('should update pending action metadata', async () => {
    const id = await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
      projectId: 'p1',
      workers: ['w1']
    })

    await updatePendingAction(id, {
      attempts: 3,
      last_error: 'Network timeout'
    })

    const actions = await getPendingActions()
    expect(actions[0].attempts).toBe(3)
    expect(actions[0].last_error).toBe('Network timeout')
  })
})

// ============================================
// Test: Offline cache operations
// ============================================
describe('Offline cache operations', () => {
  beforeEach(async () => {
    clearAllStores()
    await initOfflineDB()
  })

  it('should cache and retrieve areas by project', async () => {
    const areas = [
      { id: 'a1', project_id: 'p1', status: 'not_started', name: 'Area A', weight: 50, updated_at: '2025-01-01T00:00:00Z' },
      { id: 'a2', project_id: 'p1', status: 'working', name: 'Area B', weight: 50, updated_at: '2025-01-01T00:00:00Z' }
    ]
    await cacheAreas(areas)

    const cached = await getCachedAreas('p1')
    expect(cached.length).toBe(2)
    // Verify stamp was applied
    expect(cached[0]._cachedAt).toBeDefined()
    expect(cached[0]._cachedValues).toBeDefined()
    expect(cached[0]._cachedValues.status).toBe('not_started')
  })

  it('should update cached area status with offline tracking', async () => {
    await saveToStore(STORES.AREAS, {
      id: 'a1',
      project_id: 'p1',
      status: 'not_started',
      updated_at: '2025-01-01T00:00:00Z'
    })

    const updated = await updateCachedAreaStatus('a1', 'working')
    expect(updated.status).toBe('working')
    expect(updated._offlineModifiedAt).toBeDefined()

    // Verify persisted
    const fromStore = await getFromStore(STORES.AREAS, 'a1')
    expect(fromStore.status).toBe('working')
  })

  it('should return undefined when updating non-existent area', async () => {
    const result = await updateCachedAreaStatus('nonexistent', 'done')
    expect(result).toBeUndefined()
  })
})

// ============================================
// Test: Sync mutex behavior
// ============================================
describe('syncPendingActions mutex', () => {
  beforeEach(async () => {
    clearAllStores()
    await initOfflineDB()
  })

  it('should return results when no actions pending', async () => {
    const mockDb = { updateAreaStatus: vi.fn(), getArea: vi.fn() }

    const result = await syncPendingActions(mockDb)
    expect(result).toEqual({ synced: 0, failed: 0, conflicts: [], deadLettered: 0 })
  })

  it('should process a simple UPDATE_AREA_STATUS action', async () => {
    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      areaId: 'area-1',
      status: 'done'
    })

    const mockDb = {
      updateAreaStatus: vi.fn().mockResolvedValue({ id: 'area-1', status: 'done' }),
      getArea: vi.fn().mockResolvedValue(null)
    }

    const result = await syncPendingActions(mockDb)
    expect(result.synced).toBe(1)
    expect(result.failed).toBe(0)
    expect(mockDb.updateAreaStatus).toHaveBeenCalledWith('area-1', 'done', undefined)

    // Verify action was removed from queue
    const remaining = await getPendingActions()
    expect(remaining.length).toBe(0)
  })

  it('should increment attempt count on failure', async () => {
    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      areaId: 'area-1',
      status: 'working'
    })

    const mockDb = {
      updateAreaStatus: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
      getArea: vi.fn().mockResolvedValue(null)
    }

    const result = await syncPendingActions(mockDb)
    expect(result.failed).toBe(1)
    expect(result.synced).toBe(0)

    // Verify action still in queue with attempt count
    const actions = await getPendingActions()
    expect(actions.length).toBe(1)
    expect(actions[0].attempts).toBe(1)
    expect(actions[0].last_error).toBe('Failed to fetch')
  })

  it('should dead-letter actions after MAX_SYNC_ATTEMPTS (10)', async () => {
    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      areaId: 'area-1',
      status: 'done'
    })

    // Manually set attempts to the limit
    const actions = await getPendingActions()
    await updatePendingAction(actions[0].id, { attempts: 10 })

    const mockDb = { updateAreaStatus: vi.fn(), getArea: vi.fn() }

    const result = await syncPendingActions(mockDb)
    expect(result.deadLettered).toBe(1)
    expect(result.synced).toBe(0)
    // The db operation should NOT have been called
    expect(mockDb.updateAreaStatus).not.toHaveBeenCalled()

    // Verify action was marked dead-lettered
    const remaining = await getPendingActions()
    expect(remaining[0].dead_lettered).toBe(true)
    expect(remaining[0].dead_lettered_at).toBeDefined()
  })

  it('should handle concurrent sync calls via mutex (returns same promise)', async () => {
    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      areaId: 'area-1',
      status: 'done'
    })

    let resolveDb
    const dbPromise = new Promise(resolve => { resolveDb = resolve })

    const mockDb = {
      updateAreaStatus: vi.fn().mockImplementation(() => dbPromise),
      getArea: vi.fn().mockResolvedValue(null)
    }

    // Fire two syncs concurrently
    const promise1 = syncPendingActions(mockDb)
    const promise2 = syncPendingActions(mockDb)

    // They should be the same promise (mutex)
    expect(promise1).toBe(promise2)

    // Resolve the db call
    resolveDb({ id: 'area-1', status: 'done' })

    const [result1, result2] = await Promise.all([promise1, promise2])
    expect(result1).toBe(result2)
    expect(result1.synced).toBe(1)

    // The db method should only have been called once
    expect(mockDb.updateAreaStatus).toHaveBeenCalledTimes(1)
  })
})

// ============================================
// Test: Conflict detection during sync
// ============================================
describe('syncPendingActions conflict detection', () => {
  beforeEach(async () => {
    clearAllStores()
    await initOfflineDB()
  })

  it('should detect conflict and call onConflict callback', async () => {
    // Set up a cached area that was modified offline
    // _cachedAt must be BEFORE the server's updated_at so conflict detection triggers
    const cachedArea = {
      id: 'area-1',
      project_id: 'proj-1',
      status: 'working', // locally changed from 'not_started' to 'working'
      updated_at: '2025-01-01T00:00:00Z',
      _cachedAt: '2025-01-01T00:00:00Z', // cached at original fetch time
      _cachedValues: { status: 'not_started' }, // original value before local edit
      _offlineModifiedAt: '2025-01-01T01:00:00Z'
    }
    await saveToStore(STORES.AREAS, cachedArea)

    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      id: 'area-1',
      areaId: 'area-1',
      status: 'working'
    })

    const serverArea = {
      id: 'area-1',
      project_id: 'proj-1',
      status: 'done',
      updated_at: '2025-01-01T02:00:00Z' // Server changed AFTER our cache time
    }

    const onConflict = vi.fn().mockResolvedValue(RESOLUTION_STRATEGIES.KEEP_LOCAL)

    const mockDb = {
      updateAreaStatus: vi.fn().mockResolvedValue(serverArea),
      getArea: vi.fn().mockResolvedValue(serverArea)
    }

    const result = await syncPendingActions(mockDb, { onConflict })
    expect(result.conflicts.length).toBe(1)
    expect(onConflict).toHaveBeenCalledTimes(1)
    // With KEEP_LOCAL, the action should still be processed
    expect(result.synced).toBe(1)
  })

  it('should skip action when conflict resolved as KEEP_SERVER', async () => {
    const cachedArea = {
      id: 'area-2',
      project_id: 'proj-1',
      status: 'working',
      updated_at: '2025-01-01T00:00:00Z',
      _cachedAt: '2025-01-01T00:00:00Z',
      _cachedValues: { status: 'not_started' },
      _offlineModifiedAt: '2025-01-01T01:00:00Z'
    }
    await saveToStore(STORES.AREAS, cachedArea)

    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      id: 'area-2',
      areaId: 'area-2',
      status: 'working'
    })

    const serverArea = {
      id: 'area-2',
      status: 'done',
      updated_at: '2025-01-01T02:00:00Z'
    }

    const onConflict = vi.fn().mockResolvedValue(RESOLUTION_STRATEGIES.KEEP_SERVER)
    const mockDb = {
      updateAreaStatus: vi.fn(),
      getArea: vi.fn().mockResolvedValue(serverArea)
    }

    const result = await syncPendingActions(mockDb, { onConflict })
    expect(result.conflicts.length).toBe(1)
    // Action should NOT be processed — KEEP_SERVER means discard local change
    expect(mockDb.updateAreaStatus).not.toHaveBeenCalled()
    expect(result.synced).toBe(0)

    // Action should be removed from the queue
    const remaining = await getPendingActions()
    expect(remaining.length).toBe(0)
  })

  it('should handle onConflict callback errors gracefully', async () => {
    const cachedArea = {
      id: 'area-3',
      project_id: 'proj-1',
      status: 'working',
      updated_at: '2025-01-01T00:00:00Z',
      _cachedAt: '2025-01-01T00:00:00Z',
      _cachedValues: { status: 'not_started' },
      _offlineModifiedAt: '2025-01-01T01:00:00Z'
    }
    await saveToStore(STORES.AREAS, cachedArea)

    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      id: 'area-3',
      areaId: 'area-3',
      status: 'working'
    })

    const serverArea = {
      id: 'area-3',
      status: 'done',
      updated_at: '2025-01-01T02:00:00Z'
    }

    // Callback throws an error
    const onConflict = vi.fn().mockRejectedValue(new Error('UI crashed'))
    const mockDb = {
      updateAreaStatus: vi.fn().mockResolvedValue(serverArea),
      getArea: vi.fn().mockResolvedValue(serverArea)
    }

    // Should not throw — callback error is caught, defaults to KEEP_LOCAL
    const result = await syncPendingActions(mockDb, { onConflict })
    expect(result.conflicts.length).toBe(1)
    expect(result.synced).toBe(1)
  })
})

// ============================================
// Test: Multiple action types in sync queue
// ============================================
describe('syncPendingActions with multiple action types', () => {
  beforeEach(async () => {
    clearAllStores()
    await initOfflineDB()
  })

  it('should process different action types correctly', async () => {
    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: 'a1', status: 'done' })
    await addPendingAction(ACTION_TYPES.SEND_MESSAGE, {
      projectId: 'p1',
      senderType: 'foreman',
      senderName: 'John',
      content: 'All done'
    })
    await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
      projectId: 'p1',
      workers: ['w1', 'w2'],
      checkInDate: '2025-01-15'
    })

    const mockDb = {
      updateAreaStatus: vi.fn().mockResolvedValue({ id: 'a1', status: 'done' }),
      getArea: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn().mockResolvedValue({ id: 'm1' }),
      saveCrewCheckin: vi.fn().mockResolvedValue({ id: 'cc1' })
    }

    const result = await syncPendingActions(mockDb)
    expect(result.synced).toBe(3)
    expect(result.failed).toBe(0)
    expect(mockDb.updateAreaStatus).toHaveBeenCalledTimes(1)
    expect(mockDb.sendMessage).toHaveBeenCalledWith('p1', 'foreman', 'John', 'All done')
    expect(mockDb.saveCrewCheckin).toHaveBeenCalledWith('p1', ['w1', 'w2'], '2025-01-15')
  })

  it('should continue processing after individual action failure', async () => {
    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: 'a1', status: 'done' })
    await addPendingAction(ACTION_TYPES.SEND_MESSAGE, {
      projectId: 'p1',
      senderType: 'foreman',
      senderName: 'John',
      content: 'test'
    })

    const mockDb = {
      updateAreaStatus: vi.fn().mockRejectedValue(new Error('Server error')),
      getArea: vi.fn().mockResolvedValue(null),
      sendMessage: vi.fn().mockResolvedValue({ id: 'm1' })
    }

    const result = await syncPendingActions(mockDb)
    expect(result.synced).toBe(1) // message succeeded
    expect(result.failed).toBe(1) // area update failed

    // Failed action should still be in the queue, successful one removed
    const remaining = await getPendingActions()
    expect(remaining.length).toBe(1)
    expect(remaining[0].type).toBe(ACTION_TYPES.UPDATE_AREA_STATUS)
  })
})

// ============================================
// Test: stampForOffline integration
// ============================================
describe('stampForOffline for sync', () => {
  it('should stamp records with cache metadata', () => {
    const record = { id: '1', status: 'working', name: 'Test', weight: 50 }
    const stamped = stampForOffline(record, ['status', 'weight'])

    expect(stamped._cachedAt).toBeDefined()
    expect(stamped._cachedValues.status).toBe('working')
    expect(stamped._cachedValues.weight).toBe(50)
    expect(stamped.id).toBe('1')
    expect(stamped.name).toBe('Test')
  })

  it('should deep copy tracked values to prevent mutation', () => {
    const record = { id: '1', metadata: { tags: ['a', 'b'] } }
    const stamped = stampForOffline(record, ['metadata'])

    // Mutate original
    record.metadata.tags.push('c')

    // Cached values should be unaffected
    expect(stamped._cachedValues.metadata.tags).toEqual(['a', 'b'])
  })
})

// ============================================
// Test: Connection status
// ============================================
describe('Connection status', () => {
  it('should report current connection status', () => {
    expect(getConnectionStatus()).toBe(true)
  })
})

// ============================================
// Test: Dead-lettering non-retryable errors
// ============================================
describe('Non-retryable error dead-lettering', () => {
  beforeEach(async () => {
    clearAllStores()
    await initOfflineDB()
  })

  it('should immediately dead-letter auth/permission errors', async () => {
    await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, {
      areaId: 'a1',
      status: 'done'
    })

    // Simulate a PostgreSQL permission error
    const permError = new Error('permission denied for table areas')
    permError.code = '42501'

    const mockDb = {
      updateAreaStatus: vi.fn().mockRejectedValue(permError),
      getArea: vi.fn().mockResolvedValue(null)
    }

    const result = await syncPendingActions(mockDb)
    expect(result.failed).toBe(1)
    expect(result.deadLettered).toBe(1)

    // Verify action was marked as non-retryable
    const remaining = await getPendingActions()
    expect(remaining[0].dead_lettered).toBe(true)
    expect(remaining[0].retryable).toBe(false)
  })
})
