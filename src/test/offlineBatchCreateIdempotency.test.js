import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Regression: before the 2026-11-08 fix, the batch create path in
// syncPendingActions ran processAction BEFORE markAsSynced. A crash between
// the server-side write and the local marker write caused the action to be
// replayed on next sync — duplicate crew check-ins, daily reports and chat
// messages. The fix mirrors the update path: mark the idempotency key as
// synced BEFORE processing, and clear the marker if processing fails.

let om
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  om = await import('../lib/offlineManager')
})

afterEach(() => {
  vi.restoreAllMocks()
})

const readSyncedMarker = async (key) => {
  const rec = await om.getFromStore(om.STORES.CACHED_DATA, `synced_${key}`)
  return rec || null
}

describe('syncPendingActions — batch create idempotency ordering', () => {
  it('writes the synced marker BEFORE processAction runs', async () => {
    await om.addPendingAction(om.ACTION_TYPES.SAVE_CREW_CHECKIN, {
      projectId: 'proj-1',
      workers: [{ name: 'Ana' }],
      checkInDate: '2026-11-08',
    })
    const [queued] = await om.getPendingActions()
    expect(queued.idempotency_key).toBeTruthy()

    let markerDuringCall = null
    const db = {
      saveCrewCheckin: vi.fn().mockImplementation(async () => {
        markerDuringCall = await readSyncedMarker(queued.idempotency_key)
        return { id: 'ck-1' }
      }),
    }

    const result = await om.syncPendingActions(db)

    expect(db.saveCrewCheckin).toHaveBeenCalledTimes(1)
    expect(result.synced).toBe(1)
    expect(markerDuringCall).not.toBeNull()
    expect(await om.getPendingActions()).toHaveLength(0)
    // Marker persists (lets a post-processAction crash still dedupe on retry).
    expect(await readSyncedMarker(queued.idempotency_key)).not.toBeNull()
  })

  it('clears the synced marker when processAction fails so the retry can re-run', async () => {
    await om.addPendingAction(om.ACTION_TYPES.SEND_MESSAGE, {
      projectId: 'proj-1',
      senderType: 'foreman',
      senderName: 'Ana',
      content: 'running late',
    })
    const [queued] = await om.getPendingActions()

    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('TypeError: Failed to fetch'))
      .mockResolvedValueOnce({ id: 'm-1' })
    const db = { sendMessage }

    const r1 = await om.syncPendingActions(db)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(r1.failed).toBe(1)
    expect(await readSyncedMarker(queued.idempotency_key)).toBeNull()
    const after1 = await om.getPendingActions()
    expect(after1).toHaveLength(1)
    expect(after1[0].attempts).toBe(1)

    const r2 = await om.syncPendingActions(db)
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(r2.synced).toBe(1)
    expect(await om.getPendingActions()).toHaveLength(0)
  })

  it('skips processAction entirely if the marker is already set (post-crash recovery)', async () => {
    await om.addPendingAction(om.ACTION_TYPES.SUBMIT_DAILY_REPORT, {
      projectId: 'proj-1',
      reportData: { weather: 'clear' },
      submittedBy: 'u-1',
    })
    const [queued] = await om.getPendingActions()

    // Simulate: last sync ran processAction successfully and wrote the
    // marker, then the app crashed before removePendingAction ran.
    await om.saveToStore(om.STORES.CACHED_DATA, {
      key: `synced_${queued.idempotency_key}`,
      synced_at: '2026-11-08T12:00:00.000Z',
    })

    const db = {
      saveDailyReport: vi.fn(),
      submitDailyReport: vi.fn(),
    }
    const r = await om.syncPendingActions(db)

    expect(db.saveDailyReport).not.toHaveBeenCalled()
    expect(db.submitDailyReport).not.toHaveBeenCalled()
    expect(r.synced).toBe(1)
    expect(await om.getPendingActions()).toHaveLength(0)
  })
})
