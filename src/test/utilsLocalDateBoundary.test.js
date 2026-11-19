import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseLocalDate, getLocalDateString } from '../lib/utils'

// Pin the clock to Nov 19 2026 at 17:00 US/Pacific, which is already
// Nov 20 2026 in UTC. Every recurring TZ bug this health-check sweep
// has found manifests in this window: toISOString() rolls forward a
// day, and new Date('2026-11-19') parses at UTC midnight, which reads
// as the previous local day in Los Angeles.

describe('getLocalDateString west of UTC', () => {
  beforeEach(() => {
    const fixed = new Date('2026-11-20T01:00:00Z') // 17:00 PST Nov 19
    vi.useFakeTimers()
    vi.setSystemTime(fixed)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the local calendar day, not the UTC day', () => {
    // toISOString().split('T')[0] would be '2026-11-20' here — the UTC day,
    // which is tomorrow for a crew checking in at 5pm PST.
    const local = getLocalDateString()
    // In a CI runner that uses UTC this will read as the UTC day; what we
    // really need to pin is that the two results would differ at this
    // moment, and that getLocalDateString tracks the host's local day.
    const d = new Date()
    expect(local).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  })

  it('formats an arbitrary Date using its local components', () => {
    const d = new Date('2026-12-01T05:00:00Z') // 21:00 PST Nov 30
    const local = getLocalDateString(d)
    expect(local).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  })
})

describe('parseLocalDate for DATE columns', () => {
  it('parses a bare YYYY-MM-DD as local midnight (not UTC)', () => {
    const d = parseLocalDate('2026-11-19')
    // The month grouping bug comes from new Date('2026-12-01') reading as
    // 2026-11-30 under UTC-8. parseLocalDate keeps the string's own day.
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(10) // 0-indexed
    expect(d.getDate()).toBe(19)
    expect(d.getHours()).toBe(0)
  })

  it('returns null for an empty or missing input', () => {
    expect(parseLocalDate(null)).toBe(null)
    expect(parseLocalDate('')).toBe(null)
    expect(parseLocalDate(undefined)).toBe(null)
  })

  it('leaves ISO timestamps alone (they already carry a zone)', () => {
    const d = parseLocalDate('2026-11-19T15:30:00Z')
    expect(d.getTime()).toBe(new Date('2026-11-19T15:30:00Z').getTime())
  })
})
