import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getLocalDateString } from '../lib/utils'

// equipmentOps.markEquipmentReturned must default end_date to the user's
// local calendar day, not the UTC day. The read path
// (equipmentOps.calculateProjectEquipmentCost / calculateDaysOnSite) parses
// end_date through parseLocalDate, so writing the UTC day inflates the
// inclusive-day bill by one for any late-afternoon return in negative-UTC
// timezones (e.g. 17:30 PST already reads as the next UTC day).

vi.mock('../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false
}))

describe('equipmentOps.markEquipmentReturned end_date timezone', () => {
  let equipmentOps

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    const mod = await import('../lib/equipmentOps')
    equipmentOps = mod.equipmentOps
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('defaults end_date to the local calendar day', async () => {
    // 01:30 UTC on 2026-11-21 — i.e. still 2026-11-20 in any west-of-UTC
    // timezone. The broken code used toISOString().split('T')[0] which
    // returns '2026-11-21' at this instant regardless of TZ.
    vi.setSystemTime(new Date('2026-11-21T01:30:00.000Z'))

    let captured = null
    const spy = vi
      .spyOn(equipmentOps, 'updateProjectEquipment')
      .mockImplementation(async (_id, updates) => {
        captured = updates
        return { id: _id, ...updates }
      })

    await equipmentOps.markEquipmentReturned('pe-1')

    expect(captured).toBeTruthy()
    expect(captured.end_date).toBe(getLocalDateString(new Date()))
    spy.mockRestore()
  })

  it('does not stamp the UTC day when the local day is behind UTC', async () => {
    // Simulate LA/PST (UTC-8): at 01:30 UTC on 2026-11-21 it is 17:30 PST on
    // 2026-11-20. We cannot change the runtime TZ mid-process, so stub the
    // local-day getters to return the PST calendar day deterministically.
    // Toxic to leave on; restored in afterEach via restoreAllMocks.
    vi.setSystemTime(new Date('2026-11-21T01:30:00.000Z'))
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(10) // November (0-indexed)
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(20)

    let captured = null
    const spy = vi
      .spyOn(equipmentOps, 'updateProjectEquipment')
      .mockImplementation(async (_id, updates) => {
        captured = updates
        return { id: _id, ...updates }
      })

    await equipmentOps.markEquipmentReturned('pe-1')

    // With the fix, end_date is the local day; without it (toISOString) the
    // row would have been stamped 2026-11-21, inflating the inclusive-day
    // bill by one at calculateProjectEquipmentCost time.
    expect(captured.end_date).toBe('2026-11-20')
    expect(captured.end_date).not.toBe('2026-11-21')
    spy.mockRestore()
  })

  it('passes a caller-supplied end_date through verbatim', async () => {
    vi.setSystemTime(new Date('2026-11-21T01:30:00.000Z'))

    let captured = null
    const spy = vi
      .spyOn(equipmentOps, 'updateProjectEquipment')
      .mockImplementation(async (_id, updates) => {
        captured = updates
        return { id: _id, ...updates }
      })

    await equipmentOps.markEquipmentReturned('pe-1', '2026-10-15')

    expect(captured.end_date).toBe('2026-10-15')
    spy.mockRestore()
  })
})
