import { describe, it, expect } from 'vitest'
import {
  detectConflict,
  resolveConflict,
  stampForOffline,
  buildConflictSummary,
  RESOLUTION_STRATEGIES
} from '../lib/conflictDetection'

describe('detectConflict', () => {
  it('returns no conflict when records are null', () => {
    expect(detectConflict(null, { id: 1 })).toEqual({ hasConflict: false, conflicts: [] })
    expect(detectConflict({ id: 1 }, null)).toEqual({ hasConflict: false, conflicts: [] })
  })

  it('returns no conflict when server has not changed since cache', () => {
    const local = { id: 1, status: 'done', _cachedAt: '2025-01-10T12:00:00Z', updated_at: '2025-01-10T12:00:00Z' }
    const server = { id: 1, status: 'working', updated_at: '2025-01-10T11:00:00Z' }
    const result = detectConflict(local, server)
    expect(result.hasConflict).toBe(false)
  })

  it('detects conflict when both local and server changed the same field', () => {
    const local = {
      id: 1,
      status: 'done',
      _cachedAt: '2025-01-10T12:00:00Z',
      _cachedValues: { status: 'working' },
      updated_at: '2025-01-10T13:00:00Z'
    }
    const server = { id: 1, status: 'not_started', updated_at: '2025-01-10T14:00:00Z' }
    const result = detectConflict(local, server, ['status'])
    expect(result.hasConflict).toBe(true)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].field).toBe('status')
    expect(result.conflicts[0].localValue).toBe('done')
    expect(result.conflicts[0].serverValue).toBe('not_started')
  })

  it('returns no conflict when only server changed (local unchanged)', () => {
    const local = {
      id: 1,
      status: 'working',
      _cachedAt: '2025-01-10T12:00:00Z',
      _cachedValues: { status: 'working' }
    }
    const server = { id: 1, status: 'done', updated_at: '2025-01-10T14:00:00Z' }
    const result = detectConflict(local, server, ['status'])
    expect(result.hasConflict).toBe(false)
  })

  it('handles multiple conflicting fields', () => {
    const local = {
      id: 1,
      status: 'done',
      weight: 30,
      _cachedAt: '2025-01-10T12:00:00Z',
      _cachedValues: { status: 'working', weight: 20 }
    }
    const server = { id: 1, status: 'not_started', weight: 40, updated_at: '2025-01-10T14:00:00Z' }
    const result = detectConflict(local, server, ['status', 'weight'])
    expect(result.hasConflict).toBe(true)
    expect(result.conflicts).toHaveLength(2)
  })

  it('auto-detects fields when compareFields is empty', () => {
    const local = {
      id: 1,
      status: 'done',
      name: 'Area A',
      _cachedAt: '2025-01-10T12:00:00Z',
      updated_at: '2025-01-10T13:00:00Z'
    }
    const server = { id: 1, status: 'working', name: 'Area A', updated_at: '2025-01-10T14:00:00Z' }
    const result = detectConflict(local, server)
    expect(result.hasConflict).toBe(true)
  })
})

describe('resolveConflict', () => {
  const local = { id: 1, status: 'done', name: 'Local' }
  const server = { id: 1, status: 'working', name: 'Server' }

  it('keeps local record with KEEP_LOCAL strategy', () => {
    const result = resolveConflict(local, server, RESOLUTION_STRATEGIES.KEEP_LOCAL)
    expect(result.status).toBe('done')
    expect(result.name).toBe('Local')
    expect(result._resolved).toBe(true)
  })

  it('keeps server record with KEEP_SERVER strategy', () => {
    const result = resolveConflict(local, server, RESOLUTION_STRATEGIES.KEEP_SERVER)
    expect(result.status).toBe('working')
    expect(result.name).toBe('Server')
    expect(result._resolved).toBe(true)
  })

  it('merges fields with MERGE strategy', () => {
    const result = resolveConflict(local, server, RESOLUTION_STRATEGIES.MERGE, {
      status: 'local',
      name: 'server'
    })
    expect(result.status).toBe('done')
    expect(result.name).toBe('Server')
    expect(result._resolved).toBe(true)
  })

  it('defaults to server for unknown strategy', () => {
    const result = resolveConflict(local, server, 'unknown')
    expect(result.status).toBe('working')
  })
})

describe('stampForOffline', () => {
  it('adds _cachedAt timestamp', () => {
    const record = { id: 1, status: 'working' }
    const stamped = stampForOffline(record)
    expect(stamped._cachedAt).toBeDefined()
    expect(new Date(stamped._cachedAt).getTime()).toBeGreaterThan(0)
  })

  it('tracks specified fields in _cachedValues', () => {
    const record = { id: 1, status: 'working', weight: 20 }
    const stamped = stampForOffline(record, ['status', 'weight'])
    expect(stamped._cachedValues.status).toBe('working')
    expect(stamped._cachedValues.weight).toBe(20)
  })

  it('does not add _cachedValues when no trackFields specified', () => {
    const stamped = stampForOffline({ id: 1 })
    expect(stamped._cachedValues).toBeUndefined()
  })

  it('deep copies tracked values to prevent mutation', () => {
    const record = { id: 1, items: [{ name: 'a' }] }
    const stamped = stampForOffline(record, ['items'])
    record.items[0].name = 'b'
    expect(stamped._cachedValues.items[0].name).toBe('a')
  })
})

describe('buildConflictSummary', () => {
  it('returns null when no conflict', () => {
    expect(buildConflictSummary({ hasConflict: false, conflicts: [] })).toBeNull()
  })

  it('returns deletion summary when record deleted on server', () => {
    const summary = buildConflictSummary({ hasConflict: true, deletedOnServer: true, conflicts: [] }, 'area')
    expect(summary.title).toBe('Area was deleted')
    expect(summary.severity).toBe('warning')
  })

  it('returns field-level summary for modified records', () => {
    const summary = buildConflictSummary({
      hasConflict: true,
      conflicts: [
        { field: 'status', localValue: 'done', serverValue: 'working' },
        { field: 'weight', localValue: 30, serverValue: 40 }
      ]
    }, 'area')
    expect(summary.title).toBe('Area was modified')
    expect(summary.description).toContain('status, weight')
    expect(summary.conflictCount).toBe(2)
  })

  it('marks severity as warning for 3+ conflicting fields', () => {
    const summary = buildConflictSummary({
      hasConflict: true,
      conflicts: [
        { field: 'a' }, { field: 'b' }, { field: 'c' }
      ]
    })
    expect(summary.severity).toBe('warning')
  })
})
