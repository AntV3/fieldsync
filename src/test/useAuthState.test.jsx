import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { authListeners, mockAuth } = vi.hoisted(() => {
  const authListeners = []
  const mockAuth = {
    getUser: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn((cb) => {
      authListeners.push(cb)
      return { data: { subscription: { unsubscribe: () => {} } } }
    }),
  }
  return { authListeners, mockAuth }
})

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: mockAuth, from: vi.fn() },
  auth: { signOut: vi.fn().mockResolvedValue(undefined) },
  db: { getUserCompanies: vi.fn().mockResolvedValue([]) },
  clearFieldSession: vi.fn().mockResolvedValue(undefined),
}))

import useAuthState from '../hooks/useAuthState'

const sessionMissing = () => {
  const err = new Error('Auth session missing!')
  err.name = 'AuthSessionMissingError'
  return err
}

describe('useAuthState on a guest page load (no office session)', () => {
  let navigate, showToast
  beforeEach(() => {
    authListeners.length = 0
    navigate = vi.fn()
    showToast = vi.fn()
    mockAuth.signOut.mockClear()
    mockAuth.getUser.mockReset()
  })

  it('does not sign out or redirect when there is simply no session', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: sessionMissing() })
    const { result } = renderHook(() =>
      useAuthState({ navigate, locationPathname: '/login/field', showToast })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockAuth.signOut).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('still clears a genuinely invalid session', async () => {
    const err = new Error('Invalid Refresh Token')
    err.name = 'AuthApiError'
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: err })
    const { result } = renderHook(() =>
      useAuthState({ navigate, locationPathname: '/dashboard', showToast })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('ignores a SIGNED_OUT event while no office user is signed in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: sessionMissing() })
    const { result } = renderHook(() =>
      useAuthState({ navigate, locationPathname: '/invite/abc', showToast })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(authListeners.length).toBeGreaterThan(0)
    await act(async () => {
      for (const cb of authListeners) await cb('SIGNED_OUT', null)
    })
    expect(navigate).not.toHaveBeenCalled()
  })
})
