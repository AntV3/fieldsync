import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    db: {
      getCompanyByCode: vi.fn(),
      getProjectByPinSecure: vi.fn(),
    },
    getFieldSession: vi.fn(),
    clearFieldSession: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../lib/supabase', () => supabaseMock)
vi.mock('../components/Logo', () => ({
  default: () => null,
}))

import FieldLogin from '../components/auth/FieldLogin'

describe('FieldLogin remember-me auto-resume', () => {
  let onForemanAccess, onShowToast

  beforeEach(() => {
    localStorage.clear()
    onForemanAccess = vi.fn()
    onShowToast = vi.fn()
    supabaseMock.getFieldSession.mockReset()
  })

  const renderFieldLogin = () =>
    render(
      <MemoryRouter>
        <FieldLogin onForemanAccess={onForemanAccess} onShowToast={onShowToast} />
      </MemoryRouter>
    )

  it('records the login type as "field" when auto-resuming a remember-me session', async () => {
    supabaseMock.getFieldSession.mockReturnValue({
      token: 'tok-1',
      projectId: 'proj-1',
      projectName: 'Sunrise Apartments',
      companyId: 'co-1',
      companyName: 'Acme Co',
      companyCode: 'ACME',
      remembered: true,
    })
    localStorage.setItem('fieldsync_foreman_name', 'Sam Rivera')

    renderFieldLogin()

    await waitFor(() => expect(onForemanAccess).toHaveBeenCalledTimes(1))
    expect(onForemanAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'proj-1', company_id: 'co-1' }),
      'Sam Rivera'
    )
    // PR #372 smart-routes /login based on this key; without it the next
    // cold start on /login would land on LoginChooser instead of /login/field.
    expect(localStorage.getItem('fieldsync-login-type')).toBe('field')
  })

  it('does not auto-complete when no foreman name is saved', async () => {
    supabaseMock.getFieldSession.mockReturnValue({
      token: 'tok-1',
      projectId: 'proj-1',
      projectName: 'Sunrise Apartments',
      companyId: 'co-1',
      companyName: 'Acme Co',
      companyCode: 'ACME',
    })

    renderFieldLogin()

    // Give the effect a tick; onForemanAccess should not be called.
    await new Promise((r) => setTimeout(r, 10))
    expect(onForemanAccess).not.toHaveBeenCalled()
    expect(localStorage.getItem('fieldsync-login-type')).toBeNull()
  })

  it('does not auto-complete when there is no remembered field session', async () => {
    supabaseMock.getFieldSession.mockReturnValue(null)

    renderFieldLogin()

    await new Promise((r) => setTimeout(r, 10))
    expect(onForemanAccess).not.toHaveBeenCalled()
    expect(localStorage.getItem('fieldsync-login-type')).toBeNull()
  })
})
