import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const { mockDb } = vi.hoisted(() => ({ mockDb: { getTMTickets: vi.fn() } }))
vi.mock('../lib/supabase', () => ({ db: mockDb }))
vi.mock('../components/TMClientSignature', () => ({
  default: ({ ticketId, onSave }) => (
    <div data-testid="client-signature" data-ticket={ticketId}>
      <button onClick={() => onSave({})}>Save mock signature</button>
    </div>
  )
}))
vi.mock('../components/TMForemanSignature', () => ({
  default: ({ ticketId, onSave }) => (
    <div data-testid="foreman-signature" data-ticket={ticketId}>
      <button onClick={() => onSave({})}>Save foreman signature</button>
    </div>
  )
}))
vi.mock('../components/SignatureLinkGenerator', () => ({
  default: ({ documentId }) => <div data-testid="signature-link" data-ticket={documentId} />
}))

import FieldTicketList, { fieldTicketState } from '../components/FieldTicketList'

const today = new Date().toISOString().slice(0, 10)
const ticket = (overrides = {}) => ({
  id: 't1',
  work_date: today,
  status: 'foreman_signed',
  foreman_signature_data: 'foreman-sig',
  notes: 'Extra trenching',
  t_and_m_workers: [{ name: 'A', hours: 8, overtime_hours: 2 }],
  t_and_m_items: [],
  ...overrides
})

const renderList = (props = {}) => render(
  <FieldTicketList project={{ id: 'p1', name: 'Tower A' }} companyId="c1" onBack={vi.fn()} onShowToast={vi.fn()} {...props} />
)

describe('fieldTicketState', () => {
  it('names what each ticket still needs', () => {
    expect(fieldTicketState(ticket()).state).toBe('needs_signature')
    expect(fieldTicketState(ticket({ status: 'pending' })).state).toBe('needs_signature')
    expect(fieldTicketState(ticket({ status: 'pending', foreman_signature_data: null })).state).toBe('needs_foreman_signature')
    expect(fieldTicketState(ticket({ status: 'client_signed' })).state).toBe('signed')
    expect(fieldTicketState(ticket({ client_signature_data: 'sig' })).state).toBe('signed')
    expect(fieldTicketState(ticket({ status: 'approved' })).state).toBe('approved')
    expect(fieldTicketState(ticket({ status: 'rejected', rejection_reason: ' Hours ' }))).toEqual(
      { state: 'rejected', label: 'Rejected by the office', detail: 'Hours' }
    )
  })
})

describe('FieldTicketList', () => {
  beforeEach(() => mockDb.getTMTickets.mockReset())

  it('lists recent tickets and counts the ones still needing the client signature', async () => {
    mockDb.getTMTickets.mockResolvedValue([
      ticket(),
      ticket({ id: 't2', status: 'client_signed', notes: 'Signed work' }),
      ticket({ id: 't3', status: 'approved', work_date: '2020-01-01', notes: 'Old approved' }),
      ticket({ id: 't4', work_date: '2020-01-02', notes: 'Old but unsigned' })
    ])
    renderList()

    expect(await screen.findByText('2 tickets still need the client signature.')).toBeInTheDocument()
    expect(screen.getByText('Signed work')).toBeInTheDocument()
    expect(screen.getByText('Old but unsigned')).toBeInTheDocument()
    expect(screen.queryByText('Old approved')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Client signs now/ })).toHaveLength(2)
    expect(screen.getAllByText(/1 crew · 10 hrs/)).toHaveLength(3)
  })

  it('collects the client signature later and reloads', async () => {
    mockDb.getTMTickets.mockResolvedValueOnce([ticket()])
      .mockResolvedValueOnce([ticket({ status: 'client_signed' })])
    renderList()

    fireEvent.click(await screen.findByRole('button', { name: /Client signs now/ }))
    const modal = await screen.findByTestId('client-signature')
    expect(modal).toHaveAttribute('data-ticket', 't1')
    fireEvent.click(within(modal).getByRole('button', { name: 'Save mock signature' }))

    expect(await screen.findByText('Client signed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Client signs now/ })).not.toBeInTheDocument()
    expect(mockDb.getTMTickets).toHaveBeenCalledTimes(2)
  })

  it('offers a signature link for a client who is not on site', async () => {
    mockDb.getTMTickets.mockResolvedValue([ticket()])
    renderList()
    fireEvent.click(await screen.findByRole('button', { name: /Send link/ }))
    expect(await screen.findByTestId('signature-link')).toHaveAttribute('data-ticket', 't1')
  })

  it('says so and offers a retry when tickets cannot be loaded', async () => {
    mockDb.getTMTickets.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    renderList({ onNewTicket: vi.fn() })
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(screen.getByText(/No tickets on this project/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /New T&M ticket/ })).toBeInTheDocument()
  })
})

describe('FieldTicketList office-entered ticket', () => {
  beforeEach(() => mockDb.getTMTickets.mockReset())

  it('lets the foreman sign a ticket the office entered, then asks for the client signature', async () => {
    mockDb.getTMTickets
      .mockResolvedValueOnce([ticket({ status: 'pending', foreman_signature_data: null })])
      .mockResolvedValueOnce([ticket()])
    renderList()

    expect(await screen.findByText('Needs your signature')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Client signs now/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sign as foreman/ }))
    const modal = await screen.findByTestId('foreman-signature')
    fireEvent.click(within(modal).getByRole('button', { name: 'Save foreman signature' }))

    expect(await screen.findByRole('button', { name: /Client signs now/ })).toBeInTheDocument()
  })
})
