import { describe, it, expect } from 'vitest'
import { PERMISSIONS, ALL_PERMISSIONS, resolvePermissions, guardMessage } from '../lib/permissions'

const row = (overrides = {}) => ({
  can_approve_tickets: false,
  can_send_cors: false,
  can_sign_for_foreman: false,
  can_manage_client_access: false,
  ...overrides
})

describe('resolvePermissions', () => {
  it('restricts nothing while the database has no permission columns', () => {
    expect(resolvePermissions({ isAdmin: false, row: null })).toEqual(ALL_PERMISSIONS)
    expect(resolvePermissions().enforced).toBe(false)
  })

  it('gives a member only what an administrator granted', () => {
    const p = resolvePermissions({ isAdmin: false, row: row({ can_send_cors: true }) })
    expect(p).toEqual({
      canApproveTickets: false,
      canSendCORs: true,
      canSignForForeman: false,
      canManageClientAccess: false,
      enforced: true
    })
  })

  it('gives an administrator everything whatever the row says', () => {
    const p = resolvePermissions({ isAdmin: true, row: row() })
    for (const { key } of PERMISSIONS) expect(p[key]).toBe(true)
    expect(p.enforced).toBe(true)
  })

  it('treats anything but true as not granted', () => {
    const p = resolvePermissions({ isAdmin: false, row: row({ can_approve_tickets: 'true', can_send_cors: null }) })
    expect(p.canApproveTickets).toBe(false)
    expect(p.canSendCORs).toBe(false)
  })
})

describe('guardMessage', () => {
  it('shows the database refusal for permission and rule errors', () => {
    expect(guardMessage({ code: '42501', message: 'No permission.' }, 'fallback')).toBe('No permission.')
    expect(guardMessage({ code: 'P0001', message: 'Needs the client signature' }, 'fallback')).toBe('Needs the client signature')
  })

  it('falls back for anything else', () => {
    expect(guardMessage({ code: '23505', message: 'duplicate key' }, 'fallback')).toBe('fallback')
    expect(guardMessage(new Error('network'), 'fallback')).toBe('fallback')
    expect(guardMessage(null, 'fallback')).toBe('fallback')
  })
})
