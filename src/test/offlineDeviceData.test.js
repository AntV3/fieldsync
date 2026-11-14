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

  it('also clears worker names, trade pricing and PIN counters from localStorage', async () => {
    // Company data a previous foreman left on the device.
    localStorage.setItem('fieldsync_dismissed_workers_p1', JSON.stringify(['Carlos M.', 'Pete R.']))
    localStorage.setItem('trade_config_c1', JSON.stringify({ laborClasses: [{ name: 'Carpenter', rate: 95 }] }))
    localStorage.setItem('trade_overrides_p1', JSON.stringify({ labor: { carpenter: 110 } }))
    localStorage.setItem('pin_attempts_ACME01', '3')
    localStorage.setItem('pin_lockout_ACME01', String(Date.now() + 60000))
    localStorage.setItem('fm_pinned_p1', JSON.stringify(['tm', 'report']))
    localStorage.setItem('fm_dismissed_rejections_p1', JSON.stringify(['t-1:2026-01-01T00:00:00Z']))

    // Unsent work and device preferences the next foreman should still have.
    localStorage.setItem('tm_draft_p1', JSON.stringify({ workers: [{ name: 'Sam' }] }))
    localStorage.setItem('fieldsync-theme', 'dark')
    localStorage.setItem('fieldsync-login-type', 'field')
    localStorage.setItem('fieldsync-tm-default-view', 'list')
    localStorage.setItem('fieldsync-cookie-consent', 'accepted')

    await om.clearOfflineCaches()

    // Company data gone.
    expect(localStorage.getItem('fieldsync_dismissed_workers_p1')).toBeNull()
    expect(localStorage.getItem('trade_config_c1')).toBeNull()
    expect(localStorage.getItem('trade_overrides_p1')).toBeNull()
    expect(localStorage.getItem('pin_attempts_ACME01')).toBeNull()
    expect(localStorage.getItem('pin_lockout_ACME01')).toBeNull()
    expect(localStorage.getItem('fm_pinned_p1')).toBeNull()
    expect(localStorage.getItem('fm_dismissed_rejections_p1')).toBeNull()

    // Unsent work survives.
    expect(localStorage.getItem('tm_draft_p1')).not.toBeNull()

    // Device preferences survive.
    expect(localStorage.getItem('fieldsync-theme')).toBe('dark')
    expect(localStorage.getItem('fieldsync-login-type')).toBe('field')
    expect(localStorage.getItem('fieldsync-tm-default-view')).toBe('list')
    expect(localStorage.getItem('fieldsync-cookie-consent')).toBe('accepted')
  })
})
