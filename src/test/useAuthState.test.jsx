import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { authListeners, mockAuth, syncListeners, offline } = vi.hoisted(() => {
  const authListeners = []
  const mockAuth = {
    getUser: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn((cb) => {
      authListeners.push(cb)
      return { data: { subscription: { unsubscribe: () => {} } } }
    }),
  }
  const syncListeners = new Set()
  const offline = {
    clearFieldSession: vi.fn().mockResolvedValue(undefined),
    requeueNeedsAuthTickets: vi.fn().mockResolvedValue(0),
    drainPendingActions: vi.fn().mockResolvedValue(undefined),
    onSyncStateChange: vi.fn((cb) => {
      syncListeners.add(cb)
      return () => syncListeners.delete(cb)
    }),
  }
  return { authListeners, mockAuth, syncListeners, offline }
})

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: mockAuth, from: vi.fn() },
  auth: { signOut: vi.fn().mockResolvedValue(undefined) },
  db: { getUserCompanies: vi.fn().mockResolvedValue([]) },
  clearFieldSession: offline.clearFieldSession,
  requeueNeedsAuthTickets: offline.requeueNeedsAuthTickets,
  drainPendingActions: offline.drainPendingActions,
  onSyncStateChange: offline.onSyncStateChange,
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

describe('useAuthState offline T&M ticket recovery', () => {
  let navigate, showToast
  const project = { id: 'proj-1', name: 'Sunrise Apartments', company_id: 'co-1' }

  beforeEach(() => {
    authListeners.length = 0
    syncListeners.clear()
    navigate = vi.fn()
    showToast = vi.fn()
    mockAuth.getUser.mockReset()
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: sessionMissing() })
    offline.clearFieldSession.mockClear()
    offline.requeueNeedsAuthTickets.mockReset().mockResolvedValue(1)
    offline.drainPendingActions.mockReset().mockResolvedValue(undefined)
  })

  const renderOnFieldLogin = async () => {
    const hook = renderHook(() =>
      useAuthState({ navigate, locationPathname: '/login/field', showToast })
    )
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    return hook
  }

  it('requeues this project\'s needs_auth tickets and then drains after PIN login', async () => {
    const order = []
    offline.requeueNeedsAuthTickets.mockImplementation(async (id) => { order.push(`requeue:${id}`); return 1 })
    offline.drainPendingActions.mockImplementation(async () => { order.push('drain') })
    const { result } = await renderOnFieldLogin()

    act(() => { result.current.handleForemanAccess(project, 'Sam Rivera') })

    expect(navigate).toHaveBeenCalledWith('/field')
    expect(result.current.foremanProject).toEqual(project)
    await waitFor(() => expect(offline.drainPendingActions).toHaveBeenCalledTimes(1))
    expect(offline.requeueNeedsAuthTickets).toHaveBeenCalledWith('proj-1')
    expect(order).toEqual(['requeue:proj-1', 'drain'])
  })

  it('still drains when the requeue fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    offline.requeueNeedsAuthTickets.mockRejectedValue(new Error('IndexedDB is not available'))
    const { result } = await renderOnFieldLogin()
    act(() => { result.current.handleForemanAccess(project, 'Sam') })
    await waitFor(() => expect(offline.drainPendingActions).toHaveBeenCalledTimes(1))
    console.warn.mockRestore()
  })

  it('session_expired clears the field session, resets foreman state, toasts and opens the PIN screen', async () => {
    const { result } = await renderOnFieldLogin()
    act(() => { result.current.handleForemanAccess(project, 'Sam') })
    await waitFor(() => expect(offline.drainPendingActions).toHaveBeenCalled())
    navigate.mockClear()
    expect(syncListeners.size).toBe(1)

    await act(async () => {
      for (const cb of syncListeners) await cb({ type: 'session_expired', projectId: 'proj-1', count: 2 })
    })

    expect(offline.clearFieldSession).toHaveBeenCalledTimes(1)
    expect(result.current.foremanProject).toBeNull()
    expect(result.current.foremanName).toBe('')
    expect(showToast).toHaveBeenCalledWith(
      'Your field session expired. Enter your PIN to sync 2 saved tickets.',
      expect.any(String)
    )
    expect(navigate).toHaveBeenCalledWith('/login/field', { replace: true })
  })

  it('uses the singular for one saved ticket', async () => {
    await renderOnFieldLogin()
    await act(async () => {
      for (const cb of syncListeners) await cb({ type: 'session_expired', projectId: 'proj-1', count: 1 })
    })
    expect(showToast).toHaveBeenCalledWith(
      'Your field session expired. Enter your PIN to sync 1 saved ticket.',
      expect.any(String)
    )
  })

  it('ignores other sync events and unsubscribes on unmount', async () => {
    const { unmount } = await renderOnFieldLogin()
    await act(async () => {
      for (const cb of syncListeners) {
        await cb({ type: 'sync_complete', synced: 1, failed: 0, remaining: 0 })
        await cb({ type: 'summary_changed' })
      }
    })
    expect(offline.clearFieldSession).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    unmount()
    expect(syncListeners.size).toBe(0)
  })
})
