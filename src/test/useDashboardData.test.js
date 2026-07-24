import { describe, it, expect } from 'vitest'
import { getFieldActivityProjectId } from '../hooks/useDashboardData'

describe('getFieldActivityProjectId — field-activity payload guard', () => {
  it('returns the project id for an INSERT payload', () => {
    const payload = { eventType: 'INSERT', new: { project_id: 'proj-a' } }
    expect(getFieldActivityProjectId(payload)).toBe('proj-a')
  })

  it('returns the project id for an UPDATE payload', () => {
    const payload = {
      eventType: 'UPDATE',
      new: { project_id: 'proj-b' },
      old: { project_id: 'proj-b' }
    }
    expect(getFieldActivityProjectId(payload)).toBe('proj-b')
  })

  it('drops DELETE payloads so the LIVE feed does not pulse on removal', () => {
    // A foreman deleting a mistaken T&M ticket should not flash "New
    // activity" at the office user — nothing new landed.
    const payload = { eventType: 'DELETE', old: { project_id: 'proj-c' } }
    expect(getFieldActivityProjectId(payload)).toBeNull()
  })

  it('drops DELETE payloads even when new is present (defensive)', () => {
    const payload = { eventType: 'DELETE', old: { project_id: 'proj-d' }, new: { project_id: 'proj-d' } }
    expect(getFieldActivityProjectId(payload)).toBeNull()
  })

  it('falls back to payload.old.project_id when new is absent (UPDATE with REPLICA IDENTITY FULL)', () => {
    const payload = { eventType: 'UPDATE', old: { project_id: 'proj-e' } }
    expect(getFieldActivityProjectId(payload)).toBe('proj-e')
  })

  it('returns null when no project id is present anywhere', () => {
    expect(getFieldActivityProjectId({ eventType: 'INSERT', new: {} })).toBeNull()
    expect(getFieldActivityProjectId({ eventType: 'INSERT' })).toBeNull()
  })

  it('returns null for null / undefined payloads', () => {
    expect(getFieldActivityProjectId(null)).toBeNull()
    expect(getFieldActivityProjectId(undefined)).toBeNull()
  })
})
