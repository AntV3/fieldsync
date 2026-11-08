import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// AcceptInvite ends in window.location.href='/dashboard', which triggers a
// full page reload. useAuthState then reads localStorage.selectedCompanyId
// to pick the active company — if it still points at the user's previous
// company, the new membership looks like it didn't take.

const invitation = {
  token: 'tkn-123',
  company_id: 'co-B',
  invited_access_level: 'member',
  invited_company_role: 'estimator',
  companies: { name: 'Company B' },
}

const currentUser = { id: 'u-1', email: 'pat@example.com' }

const hoisted = vi.hoisted(() => ({
  getInvitationByToken: vi.fn(),
  acceptInvitation: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../lib/supabase', () => ({
  db: {
    getInvitationByToken: hoisted.getInvitationByToken,
    acceptInvitation: hoisted.acceptInvitation,
  },
  supabase: {
    auth: {
      getUser: hoisted.getUser,
      signInWithPassword: hoisted.signInWithPassword,
      signOut: hoisted.signOut,
    },
  },
}))

vi.mock('../lib/BrandingContext', () => ({
  useBranding: () => ({ branding: {} }),
  BrandingProvider: ({ children }) => children,
}))

import AcceptInvite from '../components/auth/AcceptInvite'

const renderInvite = () => {
  const onShowToast = vi.fn()
  return {
    onShowToast,
    utils: render(
      <MemoryRouter initialEntries={[`/invite/${invitation.token}`]}>
        <Routes>
          <Route path="/invite/:token" element={<AcceptInvite onShowToast={onShowToast} />} />
        </Routes>
      </MemoryRouter>
    ),
  }
}

describe('AcceptInvite — selectedCompanyId after joining', () => {
  beforeEach(() => {
    hoisted.getInvitationByToken.mockReset()
    hoisted.acceptInvitation.mockReset()
    hoisted.getUser.mockReset()
    hoisted.signInWithPassword.mockReset()
    localStorage.clear()
    localStorage.setItem('selectedCompanyId', 'co-A') // user is signed into Company A
    // The handler does window.location.href='/dashboard' which jsdom treats
    // as a navigation; guard it so the assertions after can still run.
    Object.defineProperty(window, 'location', {
      value: { href: '/invite/tkn-123', assign: vi.fn() },
      writable: true,
    })
  })

  it('writes invitation.company_id to selectedCompanyId when an authenticated user joins', async () => {
    hoisted.getInvitationByToken.mockResolvedValue(invitation)
    hoisted.getUser.mockResolvedValue({ data: { user: currentUser } })
    hoisted.acceptInvitation.mockResolvedValue({ success: true })

    const { onShowToast } = renderInvite()

    const joinBtn = await screen.findByRole('button', { name: /join company b/i })
    fireEvent.click(joinBtn)

    await waitFor(() => expect(hoisted.acceptInvitation).toHaveBeenCalledWith('tkn-123', 'u-1'))
    expect(localStorage.getItem('selectedCompanyId')).toBe('co-B')
    expect(onShowToast).toHaveBeenCalledWith(expect.stringMatching(/joined/i), 'success')
  })

  it('writes invitation.company_id when an existing user signs in from the invite page', async () => {
    hoisted.getInvitationByToken.mockResolvedValue(invitation)
    hoisted.getUser.mockResolvedValue({ data: { user: null } }) // not authenticated yet
    hoisted.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    })
    hoisted.acceptInvitation.mockResolvedValue({ success: true })

    renderInvite()

    fireEvent.click(await screen.findByRole('button', { name: /sign in instead/i }))
    const emailInput = await screen.findByPlaceholderText('Email')
    const passwordInput = screen.getByPlaceholderText('Password')
    fireEvent.change(emailInput, { target: { value: 'pat@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in & join/i }))

    await waitFor(() => expect(hoisted.acceptInvitation).toHaveBeenCalled())
    expect(localStorage.getItem('selectedCompanyId')).toBe('co-B')
  })

  it('leaves selectedCompanyId alone if accept fails (user stays on Company A)', async () => {
    hoisted.getInvitationByToken.mockResolvedValue(invitation)
    hoisted.getUser.mockResolvedValue({ data: { user: currentUser } })
    hoisted.acceptInvitation.mockResolvedValue({ success: false, error: 'already a member' })

    renderInvite()

    fireEvent.click(await screen.findByRole('button', { name: /join company b/i }))
    await waitFor(() => expect(hoisted.acceptInvitation).toHaveBeenCalled())
    expect(localStorage.getItem('selectedCompanyId')).toBe('co-A')
  })
})
