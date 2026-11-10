import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const { mockDb, navigate } = vi.hoisted(() => ({
  mockDb: { getClientPortal: vi.fn(), openClientPortalCOR: vi.fn() },
  navigate: vi.fn()
}))
vi.mock('../lib/supabase', () => ({ db: mockDb }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

import ClientPortal from '../components/ClientPortal'

const portal = (cors) => ({
  contact_name: 'Pat GC',
  expires_at: null,
  project: { id: 'p1', name: 'Tower A', job_number: '2201', company_name: 'Acme Demo', company_logo_url: null },
  change_orders: cors
})
const cor = (overrides = {}) => ({
  id: 'c1', cor_number: 'COR-001', title: 'Extra trenching', cor_total: 284600, stage: 'with_client',
  revision_number: 1, sent_to_client_at: '2026-11-05T12:00:00Z', ...overrides
})

describe('ClientPortal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups the project change orders by where they stand', async () => {
    mockDb.getClientPortal.mockResolvedValue(portal([
      cor(),
      cor({ id: 'c2', cor_number: 'COR-002', title: 'Slab repair', stage: 'approved', approved_at: '2026-11-02T12:00:00Z' }),
      cor({ id: 'c3', cor_number: 'COR-003', title: 'Fence', stage: 'voided', voided_at: '2026-11-03T12:00:00Z', void_reason: 'Scope cancelled' }),
      cor({ id: 'c4', cor_number: 'COR-004', title: 'Paving', stage: 'returned', revision_number: 2 })
    ]))
    render(<ClientPortal accessToken="cp_token" />)

    expect(await screen.findByRole('heading', { name: 'Tower A' })).toBeInTheDocument()
    expect(screen.getByText(/for Pat GC/)).toBeInTheDocument()
    const waiting = screen.getByRole('region', { name: 'Waiting for your signature (1)' })
    expect(within(waiting).getByText(/COR-001 · Extra trenching/)).toBeInTheDocument()
    expect(within(waiting).getByText('$2,846.00')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Approved (1)' })).toBeInTheDocument()
    const voided = screen.getByRole('region', { name: 'Voided (1)' })
    expect(within(voided).getByText(/Scope cancelled/)).toBeInTheDocument()
    // Returned and voided change orders are listed but have nothing to open
    expect(within(voided).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/COR-004 \(rev 2\) · Paving/)).toBeInTheDocument()
  })

  it('opens a change order on its signing page', async () => {
    mockDb.getClientPortal.mockResolvedValue(portal([cor()]))
    mockDb.openClientPortalCOR.mockResolvedValue('sig_abc12345')
    render(<ClientPortal accessToken="cp_token" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open COR-001: Extra trenching' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/sign/sig_abc12345'))
    expect(mockDb.openClientPortalCOR).toHaveBeenCalledWith('cp_token', 'c1')
  })

  it('says so when access was removed or the link expired', async () => {
    mockDb.getClientPortal.mockRejectedValueOnce(new Error('portal_link_revoked'))
    const { unmount } = render(<ClientPortal accessToken="cp_token" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Access to this project has been removed.')
    unmount()

    mockDb.getClientPortal.mockRejectedValueOnce(new Error('portal_link_expired'))
    render(<ClientPortal accessToken="cp_token" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired.')
  })

  it('has a plain empty state', async () => {
    mockDb.getClientPortal.mockResolvedValue(portal([]))
    render(<ClientPortal accessToken="cp_token" />)
    expect(await screen.findByText('No change orders have been sent to you on this project yet.')).toBeInTheDocument()
  })
})
