import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockDb } = vi.hoisted(() => ({
  mockDb: { getClientPortalAccess: vi.fn(), grantClientPortalAccess: vi.fn(), revokeClientPortalAccess: vi.fn() }
}))
vi.mock('../lib/supabase', () => ({ db: mockDb }))

import ClientAccessPanel, { accessState } from '../components/ClientAccessPanel'
import { PermissionsProvider } from '../lib/PermissionsContext'
import { ALL_PERMISSIONS } from '../lib/permissions'

const grant = (overrides = {}) => ({
  id: 'a1', contact_name: 'Pat GC', contact_email: 'pat@gc.test', access_token: 'cp_token_1234567890',
  expires_at: null, revoked_at: null, last_viewed_at: null, ...overrides
})

const renderPanel = (permissions = ALL_PERMISSIONS) => {
  const onNotify = vi.fn()
  render(
    <PermissionsProvider value={permissions}>
      <ClientAccessPanel project={{ id: 'p1', name: 'Tower A' }} onNotify={onNotify} />
    </PermissionsProvider>
  )
  return { onNotify }
}

describe('accessState', () => {
  it('is removed, expired or active', () => {
    const now = new Date('2026-11-20T00:00:00Z').getTime()
    expect(accessState(grant(), now)).toBe('active')
    expect(accessState(grant({ expires_at: '2026-11-19T00:00:00Z' }), now)).toBe('expired')
    expect(accessState(grant({ expires_at: '2026-12-19T00:00:00Z' }), now)).toBe('active')
    expect(accessState(grant({ revoked_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-19T00:00:00Z' }), now)).toBe('removed')
  })
})

describe('ClientAccessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('renders nothing while the database has no client portal', async () => {
    mockDb.getClientPortalAccess.mockResolvedValue(null)
    const { container } = render(<ClientAccessPanel project={{ id: 'p1' }} />)
    await waitFor(() => expect(mockDb.getClientPortalAccess).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('gives a contact access and copies their link', async () => {
    mockDb.getClientPortalAccess.mockResolvedValueOnce([]).mockResolvedValueOnce([grant()])
    mockDb.grantClientPortalAccess.mockResolvedValue(grant())
    const { onNotify } = renderPanel()

    expect(await screen.findByText('No client has access to this project yet.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: ' Pat GC ' } })
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'pat@gc.test' } })
    fireEvent.click(screen.getByRole('button', { name: /Give access/ }))

    await waitFor(() => expect(mockDb.grantClientPortalAccess).toHaveBeenCalledTimes(1))
    const [projectId, details] = mockDb.grantClientPortalAccess.mock.calls[0]
    expect(projectId).toBe('p1')
    expect(details).toMatchObject({ name: 'Pat GC', email: 'pat@gc.test' })
    expect(new Date(details.expiresAt).getTime()).toBeGreaterThan(Date.now())
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/\/portal\/cp_token_1234567890$/)))
    expect(await screen.findByText('Pat GC')).toBeInTheDocument()
    expect(onNotify).toHaveBeenCalledWith('success', 'Access created for Pat GC. Link copied.')
  })

  it('removes access after confirming', async () => {
    mockDb.getClientPortalAccess.mockResolvedValueOnce([grant()])
      .mockResolvedValueOnce([grant({ revoked_at: '2026-11-10T00:00:00Z' })])
    mockDb.revokeClientPortalAccess.mockResolvedValue({})
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove access for Pat GC' }))
    await waitFor(() => expect(mockDb.revokeClientPortalAccess).toHaveBeenCalledWith('a1'))
    expect(await screen.findByText(/Removed/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copy link/ })).not.toBeInTheDocument()
  })

  it('lets a member without the permission see and copy, but not grant or remove', async () => {
    mockDb.getClientPortalAccess.mockResolvedValue([grant()])
    renderPanel({ ...ALL_PERMISSIONS, canManageClientAccess: false, enforced: true })

    expect(await screen.findByRole('button', { name: /Copy link/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Give access/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove access for Pat GC' })).not.toBeInTheDocument()
  })
})
