import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// TMList.handleApprove must refuse a ticket the client has not signed even if
// something calls it directly. The card is stubbed so the test can do that.

const mocks = vi.hoisted(() => ({
  realtime: { callback: null },
  db: {
    getTMTicketsPaginated: vi.fn(),
    isTicketEditable: vi.fn(),
    getTicketImportStatus: vi.fn(),
    getAllLaborClassRates: vi.fn(),
    subscribeToTMTickets: vi.fn(),
    unsubscribe: vi.fn(),
    approveTMTicket: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  db: mocks.db,
  supabase: {},
  isSupabaseConfigured: false
}))
vi.mock('../lib/BrandingContext', () => ({ useBranding: () => ({ branding: {} }) }))
vi.mock('../lib/pdfBranding', () => ({
  resolvePrimaryColor: vi.fn(),
  loadBrandLogo: vi.fn(),
  drawDocumentHeader: vi.fn(),
  drawContinuationAccent: vi.fn(),
  applyDocumentFooters: vi.fn()
}))
vi.mock('../lib/financialExport', () => ({ exportTMTicketsCSV: vi.fn() }))
vi.mock('../lib/safeXlsx', () => ({ loadXLSXSafe: vi.fn() }))
vi.mock('../components/SignatureLinkGenerator', () => ({ default: () => null }))
vi.mock('../components/tm/TMDashboard', () => ({ default: () => null }))
vi.mock('../components/tm/TMTicketCard', () => ({
  default: ({ ticket, onApprove }) => (
    <button type="button" onClick={() => onApprove(ticket)}>force approve {ticket.id}</button>
  )
}))

import TMList from '../components/TMList'

const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const makeTicket = (overrides = {}) => ({
  id: 't-1',
  project_id: 'p-1',
  work_date: today(),
  status: 'foreman_signed',
  foreman_signature_data: 'sig',
  assigned_cor_id: null,
  photos: [],
  t_and_m_workers: [],
  t_and_m_items: [],
  ...overrides
})

const NEEDS_SIGNATURE = 'This ticket needs the client signature before it can be approved.'

const setup = (tickets) => {
  mocks.db.getTMTicketsPaginated.mockResolvedValue({ tickets, hasMore: false, totalCount: tickets.length })
  const onShowToast = vi.fn()
  render(<TMList project={{ id: 'p-1' }} company={{ id: 'c-1' }} user={{ id: 'u-1', email: 'dana@example.com' }} onShowToast={onShowToast} />)
  return { onShowToast }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('fieldsync-tm-default-view', 'list')
  mocks.realtime.callback = null
  mocks.db.isTicketEditable.mockResolvedValue({ editable: true })
  mocks.db.getTicketImportStatus.mockResolvedValue({ import_status: 'completed' })
  mocks.db.getAllLaborClassRates.mockResolvedValue([])
  mocks.db.subscribeToTMTickets.mockImplementation((_id, cb) => { mocks.realtime.callback = cb; return { id: 'sub' } })
})

describe('TMList handleApprove client-signature rule', () => {
  it('refuses a foreman-signed ticket with a toast and no approval modal', async () => {
    const { onShowToast } = setup([makeTicket()])
    fireEvent.click(await screen.findByRole('button', { name: 'force approve t-1' }))
    expect(onShowToast).toHaveBeenCalledWith(NEEDS_SIGNATURE, 'error')
    expect(screen.queryByText('Approve T&M Ticket')).toBeNull()
    expect(mocks.db.approveTMTicket).not.toHaveBeenCalled()
  })

  it('refuses a plain pending ticket', async () => {
    const { onShowToast } = setup([makeTicket({ status: 'pending', foreman_signature_data: null })])
    fireEvent.click(await screen.findByRole('button', { name: 'force approve t-1' }))
    expect(onShowToast).toHaveBeenCalledWith(NEEDS_SIGNATURE, 'error')
    expect(screen.queryByText('Approve T&M Ticket')).toBeNull()
  })

  it('opens the approval modal for a client-signed ticket', async () => {
    const { onShowToast } = setup([makeTicket({ status: 'client_signed', client_signature_data: 'sig' })])
    fireEvent.click(await screen.findByRole('button', { name: 'force approve t-1' }))
    expect(screen.getByText('Approve T&M Ticket')).toBeInTheDocument()
    expect(onShowToast).not.toHaveBeenCalled()
  })

  it('re-checks on confirm when the ticket changed while the modal was open', async () => {
    const { onShowToast } = setup([makeTicket({ status: 'client_signed', client_signature_data: 'sig' })])
    fireEvent.click(await screen.findByRole('button', { name: 'force approve t-1' }))
    expect(screen.getByText('Approve T&M Ticket')).toBeInTheDocument()

    // A realtime refresh brings the ticket back without the client signature
    const refreshed = [makeTicket({ status: 'foreman_signed', client_signature_data: null })]
    mocks.db.getTMTicketsPaginated.mockResolvedValue({ tickets: refreshed, hasMore: false, totalCount: 1 })
    const callsBefore = mocks.db.getTMTicketsPaginated.mock.calls.length
    mocks.realtime.callback()
    await waitFor(() => expect(mocks.db.getTMTicketsPaginated.mock.calls.length).toBeGreaterThan(callsBefore))
    await waitFor(() => expect(mocks.db.getTMTicketsPaginated.mock.results.at(-1).value).resolves.toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /^Approve at/ }))
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith(NEEDS_SIGNATURE, 'error'))
    expect(mocks.db.approveTMTicket).not.toHaveBeenCalled()
    expect(screen.queryByText('Approve T&M Ticket')).toBeNull()
  })

  it('explains a refusal from the data layer and re-reads the list', async () => {
    const { onShowToast } = setup([makeTicket({ status: 'client_signed', client_signature_data: 'sig' })])
    fireEvent.click(await screen.findByRole('button', { name: 'force approve t-1' }))

    mocks.db.approveTMTicket.mockRejectedValue(Object.assign(new Error('not approvable'), { code: 'TM_NOT_APPROVABLE' }))
    const callsBefore = mocks.db.getTMTicketsPaginated.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /^Approve at/ }))

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith(
      'Ticket was not approved. It needs the client signature or was already handled.', 'error'
    ))
    expect(screen.queryByText('Approve T&M Ticket')).toBeNull()
    await waitFor(() => expect(mocks.db.getTMTicketsPaginated.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})
