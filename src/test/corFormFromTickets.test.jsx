import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    getTMTickets: vi.fn(),
    getAllLaborClassRates: vi.fn(),
    getLaborRates: vi.fn(),
    getAllMaterialsEquipment: vi.fn(),
    getNextCORNumber: vi.fn(),
    createCOR: vi.fn(),
    updateCOR: vi.fn(),
    saveCORLineItems: vi.fn(),
    assignTicketToCOR: vi.fn(),
    markTicketAssociationImported: vi.fn(),
    submitCORForApproval: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  db: mockDb,
  supabase: {},
  isSupabaseConfigured: true
}))

import CORForm from '../components/cor/CORForm'
import { buildCORTitleFromTickets } from '../lib/corCalculations'

const project = { id: 'p1', name: 'Tower A' }
const company = { id: 'c1', name: 'Demo Co' }

const ticket = (overrides = {}) => ({
  id: 't1',
  work_date: '2026-10-05',
  status: 'approved',
  assigned_cor_id: null,
  ce_pco_number: null,
  notes: 'Extra demo',
  t_and_m_workers: [{ id: 'w1', name: 'Ana', role: 'Laborer', hours: 8 }],
  t_and_m_items: [],
  ...overrides
})

const renderForm = (props = {}) => {
  const onShowToast = vi.fn()
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <CORForm
      project={project}
      company={company}
      areas={[]}
      onShowToast={onShowToast}
      onSaved={onSaved}
      onClose={onClose}
      {...props}
    />
  )
  return { onShowToast, onSaved, onClose }
}

const titleInput = () => screen.getByPlaceholderText(/Additional Demolition Work/)
const importSelected = async (count) => {
  const button = await screen.findByRole('button', { name: new RegExp(`Import ${count} Ticket`) })
  fireEvent.click(button)
  await waitFor(() => expect(screen.queryByText('Import from Time & Material Tickets', { selector: 'h2' })).not.toBeInTheDocument())
}

describe('buildCORTitleFromTickets', () => {
  it('uses the CE/PCO number when every ticket shares it', () => {
    expect(buildCORTitleFromTickets([
      { work_date: '2026-10-05', ce_pco_number: 'CE-12' },
      { work_date: '2026-10-09', ce_pco_number: ' ce-12 ' }
    ])).toBe('T&M - CE-12')
  })

  it('uses the date range when the numbers differ', () => {
    expect(buildCORTitleFromTickets([
      { work_date: '2026-10-09', ce_pco_number: 'CE-12' },
      { work_date: '2026-10-05', ce_pco_number: 'PCO-7' },
      { work_date: '2026-10-07', ce_pco_number: 'CE-12' }
    ])).toBe('T&M tickets Oct 5, 2026 - Oct 9, 2026')
  })

  it('uses the date range when some tickets have no number', () => {
    expect(buildCORTitleFromTickets([
      { work_date: '2026-10-05', ce_pco_number: 'CE-12' },
      { work_date: '2026-10-06', ce_pco_number: null }
    ])).toBe('T&M tickets Oct 5, 2026 - Oct 6, 2026')
  })

  it('shows one date when all tickets are from the same day', () => {
    expect(buildCORTitleFromTickets([
      { work_date: '2026-10-05' },
      { work_date: '2026-10-05' }
    ])).toBe('T&M tickets Oct 5, 2026')
  })

  it('falls back to ticket_date and handles timestamps', () => {
    expect(buildCORTitleFromTickets([
      { ticket_date: '2026-10-05T14:00:00Z' },
      { work_date: '2026-10-08' }
    ])).toBe('T&M tickets Oct 5, 2026 - Oct 8, 2026')
  })

  it('returns an empty string with no tickets', () => {
    expect(buildCORTitleFromTickets([])).toBe('')
    expect(buildCORTitleFromTickets(undefined)).toBe('')
  })
})

describe('CORForm built from tickets', () => {
  beforeEach(() => {
    mockDb.getAllLaborClassRates.mockResolvedValue([])
    mockDb.getLaborRates.mockResolvedValue([])
    mockDb.getAllMaterialsEquipment.mockResolvedValue([])
    mockDb.getNextCORNumber.mockResolvedValue('COR-007')
    mockDb.createCOR.mockResolvedValue({ id: 'cor-new', status: 'draft' })
    mockDb.updateCOR.mockResolvedValue({ id: 'cor-1', status: 'draft' })
    mockDb.saveCORLineItems.mockResolvedValue(undefined)
    mockDb.assignTicketToCOR.mockResolvedValue({})
    mockDb.markTicketAssociationImported.mockResolvedValue(undefined)
    mockDb.submitCORForApproval.mockResolvedValue({ id: 'cor-new', status: 'pending_approval' })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not open the ticket picker for a plain new COR', async () => {
    mockDb.getTMTickets.mockResolvedValue([])
    renderForm()
    await waitFor(() => expect(mockDb.getNextCORNumber).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Ready for COR' })).not.toBeInTheDocument()
    expect(mockDb.getTMTickets).not.toHaveBeenCalled()
  })

  it('opens the picker on "Ready for COR" when startWithTickets is set', async () => {
    mockDb.getTMTickets.mockResolvedValue([ticket()])
    renderForm({ startWithTickets: true })
    const ready = await screen.findByRole('button', { name: 'Ready for COR' })
    expect(ready).toHaveAttribute('aria-pressed', 'true')
  })

  it('ignores startWithTickets when editing an existing COR', async () => {
    mockDb.getTMTickets.mockResolvedValue([ticket()])
    renderForm({ startWithTickets: true, existingCOR: { id: 'cor-1', title: 'Existing', status: 'draft' } })
    await waitFor(() => expect(mockDb.getAllMaterialsEquipment).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Ready for COR' })).not.toBeInTheDocument()
  })

  it('prefills an empty title from the shared CE/PCO number', async () => {
    mockDb.getTMTickets.mockResolvedValue([
      ticket({ id: 't1', ce_pco_number: 'CE-12', work_date: '2026-10-05' }),
      ticket({ id: 't2', ce_pco_number: 'CE-12', work_date: '2026-10-06' })
    ])
    renderForm({ startWithTickets: true })
    await importSelected(2)
    expect(titleInput()).toHaveValue('T&M - CE-12')
  })

  it('prefills an empty title with the date range when numbers differ', async () => {
    mockDb.getTMTickets.mockResolvedValue([
      ticket({ id: 't1', ce_pco_number: 'CE-12', work_date: '2026-10-05' }),
      ticket({ id: 't2', ce_pco_number: 'PCO-7', work_date: '2026-10-09' })
    ])
    renderForm({ startWithTickets: true })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all 2 tickets' }))
    await importSelected(2)
    expect(titleInput()).toHaveValue('T&M tickets Oct 5, 2026 - Oct 9, 2026')
  })

  it('never overwrites a title the user typed', async () => {
    mockDb.getTMTickets.mockResolvedValue([ticket({ id: 't1', ce_pco_number: 'CE-12' })])
    renderForm()
    fireEvent.change(titleInput(), { target: { value: 'Stair 3 rework' } })
    fireEvent.click(screen.getByRole('button', { name: /Import from Time & Material Tickets/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /^Select ticket from/ }))
    await importSelected(1)
    expect(titleInput()).toHaveValue('Stair 3 rework')
  })

  it('links tickets before submitting for approval', async () => {
    mockDb.getTMTickets.mockResolvedValue([ticket({ id: 't1', ce_pco_number: 'CE-12' })])
    const { onShowToast, onSaved } = renderForm({ startWithTickets: true })
    await importSelected(1)
    fireEvent.change(screen.getByPlaceholderText('Describe the scope of work'), { target: { value: 'Extra demo at level 2' } })
    fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))

    await waitFor(() => expect(mockDb.submitCORForApproval).toHaveBeenCalledWith('cor-new'))
    expect(mockDb.assignTicketToCOR).toHaveBeenCalledWith('t1', 'cor-new')
    expect(mockDb.assignTicketToCOR.mock.invocationCallOrder[0])
      .toBeLessThan(mockDb.submitCORForApproval.mock.invocationCallOrder[0])
    expect(onShowToast).toHaveBeenCalledWith('COR submitted for approval', 'success')
    expect(onSaved).toHaveBeenCalledWith({ id: 'cor-new', status: 'pending_approval' })
  })

  it('keeps the COR a draft and says how many tickets failed to link', async () => {
    mockDb.getTMTickets.mockResolvedValue([
      ticket({ id: 't1', ce_pco_number: 'CE-12', work_date: '2026-10-05' }),
      ticket({ id: 't2', ce_pco_number: 'CE-12', work_date: '2026-10-06' })
    ])
    mockDb.assignTicketToCOR.mockImplementation(async (ticketId) => {
      if (ticketId === 't2') throw new Error('link failed')
      return {}
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { onShowToast, onSaved, onClose } = renderForm({ startWithTickets: true })
    await importSelected(2)
    fireEvent.change(screen.getByPlaceholderText('Describe the scope of work'), { target: { value: 'Extra demo at level 2' } })
    fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockDb.submitCORForApproval).not.toHaveBeenCalled()
    expect(onShowToast).toHaveBeenCalledWith(
      'COR saved as draft, not submitted. 1 ticket could not be linked.',
      'warning'
    )
    expect(onSaved).toHaveBeenCalledWith({ id: 'cor-new', status: 'draft' })
    warn.mockRestore()
  })
})
