import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach } from 'vitest'

// What stays on a device: the project PIN is never cached, and signing out
// clears cached company data but keeps unsent work.
let om

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  const { vi } = await import('vitest')
  vi.resetModules()
  om = await import('../lib/offlineManager')
  localStorage.clear()
})

describe('offline device data', () => {
  it('never writes the project PIN or its hash to the device', async () => {
    await om.cacheProjects([{ id: 'p1', company_id: 'c1', name: 'Job', pin: '4815', pin_hash: '$2a$10$x' }])
    const [cached] = await om.getCachedProjects('c1')
    expect(cached).toMatchObject({ id: 'p1', name: 'Job' })
    expect(cached).not.toHaveProperty('pin')
    expect(cached).not.toHaveProperty('pin_hash')
  })

  it('clears cached company data on sign-out but keeps unsent work', async () => {
    await om.cacheProjects([{ id: 'p1', company_id: 'c1', name: 'Job' }])
    await om.addPendingAction(om.ACTION_TYPES.SEND_MESSAGE, { projectId: 'p1', content: 'unsent' })
    localStorage.setItem('fieldsync_foreman_name', 'Sam')

    await om.clearOfflineCaches()

    expect(await om.getCachedProjects('c1')).toEqual([])
    expect(await om.getPendingActionCount()).toBe(1)
    expect(localStorage.getItem('fieldsync_foreman_name')).toBeNull()
  })
})
