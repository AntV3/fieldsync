/**
 * Regression tests for the IndexedDB guard in offlineManager.
 *
 * JSDOM does not implement IndexedDB. Before the guard, importing
 * offlineManager and calling store operations threw
 * `ReferenceError: indexedDB is not defined`, which spammed stderr and
 * surfaced in production as unhandled rejections for users in private-mode
 * browsers, SSR, cross-origin iframes, and sandboxed WebViews.
 *
 * These tests confirm every public read/write operation resolves to a safe
 * default (null, undefined, [], or 0) when IndexedDB is unavailable, so
 * callers never need their own try/catch around offline cache calls.
 */
import { describe, it, expect } from 'vitest'
import {
  initOfflineDB,
  saveToStore,
  saveAllToStore,
  getFromStore,
  getAllFromStore,
  getByIndex,
  deleteFromStore,
  addPendingAction,
  getPendingActions,
  getPendingActionCount,
  updatePendingAction,
  STORES,
  ACTION_TYPES
} from '../lib/offlineManager'

describe('offlineManager — IndexedDB unavailable environments', () => {
  it('initOfflineDB resolves with null instead of throwing a ReferenceError', async () => {
    const result = await initOfflineDB()
    expect(result).toBeNull()
  })

  it('saveToStore no-ops and returns null', async () => {
    const result = await saveToStore(STORES.PROJECTS, { id: '1', name: 'x' })
    expect(result).toBeNull()
  })

  it('saveAllToStore no-ops without throwing', async () => {
    await expect(saveAllToStore(STORES.AREAS, [{ id: 'a' }])).resolves.toBeUndefined()
  })

  it('getFromStore returns undefined (missing record)', async () => {
    const result = await getFromStore(STORES.PROJECTS, '1')
    expect(result).toBeUndefined()
  })

  it('getAllFromStore returns an empty array (empty cache)', async () => {
    const result = await getAllFromStore(STORES.PROJECTS)
    expect(result).toEqual([])
  })

  it('getByIndex returns an empty array (empty cache)', async () => {
    const result = await getByIndex(STORES.AREAS, 'project_id', 'p1')
    expect(result).toEqual([])
  })

  it('deleteFromStore no-ops without throwing', async () => {
    await expect(deleteFromStore(STORES.PROJECTS, '1')).resolves.toBeUndefined()
  })

  it('addPendingAction returns null (queue disabled)', async () => {
    const result = await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, { foo: 'bar' })
    expect(result).toBeNull()
  })

  it('getPendingActions returns an empty array', async () => {
    const result = await getPendingActions()
    expect(result).toEqual([])
  })

  it('getPendingActionCount returns 0 (no pending)', async () => {
    const result = await getPendingActionCount()
    expect(result).toBe(0)
  })

  it('updatePendingAction returns null (nothing to update)', async () => {
    const result = await updatePendingAction(1, { attempts: 2 })
    expect(result).toBeNull()
  })
})
