import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    getTMTickets: vi.fn(),
    getAllLaborClassRates: vi.fn(),
    getLaborRates: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  db: mockDb,
  supabase: {},
  isSupabaseConfigured: true
}))

import TicketSelector from '../components/cor/TicketSelector'

const ticket = (overrides = {}) => ({
  id: 'ticket-0001',
  work_date: '2026-10-05',
  status: 'approved',
  assigned_cor_id: null,
  ce_pco_number: null,
  notes: '',
  t_and_m_workers: [],
  t_and_m_items: [],
  ...overrides
})

const renderSelector = async (tickets, props = {}) => {
  mockDb.getTMTickets.mockResolvedValue(tickets)
  const onImport = vi.fn()
  const onClose = vi.fn()
  const onShowToast = vi.fn()
  render(
    <TicketSelector
      projectId="p1"
      companyId="c1"
      project={{ id: 'p1' }}
      onImport={onImport}
      onClose={onClose}
      onShowToast={onShowToast}
      {...props}
    />
  )
  await screen.findByText('Import from Time & Material Tickets')
  return { onImport, onClose, onShowToast }
}

const filterButton = (name) => screen.getByRole('button', { name, pressed: undefined })
const checkedTicketBoxes = () =>
  screen.getAllByRole('checkbox', { name: /^Select ticket from/ }).filter(box => box.checked)

describe('TicketSelector', () => {
  beforeEach(() => {
    mockDb.getAllLaborClassRates.mockResolvedValue([])
    mockDb.getLaborRates.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the ticket description from notes', async () => {
    await renderSelector([ticket({ notes: 'Removed ceiling tile in corridor B' })])
    expect(screen.getByText('Removed ceiling tile in corridor B')).toBeInTheDocument()
    expect(screen.queryByText('No description')).not.toBeInTheDocument()
  })

  it('searches the notes text', async () => {
    await renderSelector([
      ticket({ id: 't1', notes: 'Removed ceiling tile' }),
      ticket({ id: 't2', notes: 'Patched drywall' })
    ])
    fireEvent.change(screen.getByLabelText('Search tickets'), { target: { value: 'drywall' } })
    expect(screen.getByText('Patched drywall')).toBeInTheDocument()
    expect(screen.queryByText('Removed ceiling tile')).not.toBeInTheDocument()
  })

  it('keeps "Unassigned" as the default filter and selects nothing', async () => {
    await renderSelector([ticket({ id: 't1' }), ticket({ id: 't2', status: 'pending' })])
    expect(filterButton('Unassigned')).toHaveAttribute('aria-pressed', 'true')
    expect(checkedTicketBoxes()).toHaveLength(0)
  })

  it('"Ready for COR" lists only approved tickets with no COR', async () => {
    await renderSelector([
      ticket({ id: 't1', notes: 'Ready one' }),
      ticket({ id: 't2', notes: 'Still pending', status: 'pending' }),
      ticket({ id: 't3', notes: 'Client signed only', status: 'client_signed' }),
      ticket({ id: 't4', notes: 'Already on a COR', assigned_cor_id: 'cor-9' }),
      ticket({ id: 't5', notes: 'Billed already', status: 'billed' })
    ], { initialFilter: 'ready' })

    expect(filterButton('Ready for COR')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Ready one')).toBeInTheDocument()
    expect(screen.queryByText('Still pending')).not.toBeInTheDocument()
    expect(screen.queryByText('Client signed only')).not.toBeInTheDocument()
    expect(screen.queryByText('Already on a COR')).not.toBeInTheDocument()
    expect(screen.queryByText('Billed already')).not.toBeInTheDocument()
  })

  it('groups ready tickets by CE/PCO number, with unnumbered tickets last', async () => {
    await renderSelector([
      ticket({ id: 't1', notes: 'No number', work_date: '2026-10-09' }),
      ticket({ id: 't2', notes: 'CE 12 day one', ce_pco_number: 'CE-12', work_date: '2026-10-05' }),
      ticket({ id: 't3', notes: 'CE 12 day two', ce_pco_number: ' ce-12 ', work_date: '2026-10-06' }),
      ticket({ id: 't4', notes: 'PCO 7 work', ce_pco_number: 'PCO-7', work_date: '2026-10-01' })
    ], { initialFilter: 'ready' })

    const groups = screen.getAllByRole('region')
    expect(groups.map(g => g.getAttribute('aria-label'))).toEqual([
      'CE/PCO ce-12',
      'CE/PCO PCO-7',
      'No CE/PCO number'
    ])

    const ce12 = within(groups[0])
    expect(ce12.getByText('2 tickets')).toBeInTheDocument()
    expect(ce12.getByText('CE 12 day one')).toBeInTheDocument()
    expect(ce12.getByText('CE 12 day two')).toBeInTheDocument()
    expect(within(groups[1]).getByText('1 ticket')).toBeInTheDocument()
    expect(within(groups[2]).getByText('No number')).toBeInTheDocument()
  })

  it('preselects nothing when ready tickets span more than one CE/PCO group', async () => {
    await renderSelector([
      ticket({ id: 't1', ce_pco_number: 'CE-12' }),
      ticket({ id: 't2', ce_pco_number: 'PCO-7' })
    ], { initialFilter: 'ready' })

    expect(checkedTicketBoxes()).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Import 0 Tickets/ })).toBeDisabled()
  })

  it('preselects every ready ticket when they share one CE/PCO group', async () => {
    const { onImport } = await renderSelector([
      ticket({ id: 't1', ce_pco_number: 'CE-12', work_date: '2026-10-05' }),
      ticket({ id: 't2', ce_pco_number: 'CE-12', work_date: '2026-10-06' }),
      ticket({ id: 't3', ce_pco_number: 'CE-99', status: 'pending' })
    ], { initialFilter: 'ready' })

    expect(checkedTicketBoxes()).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /Import 2 Tickets/ }))
    await vi.waitFor(() => expect(onImport).toHaveBeenCalledTimes(1))
    const payload = onImport.mock.calls[0][0]
    expect([...payload.ticketIds].sort()).toEqual(['t1', 't2'])
    expect(payload.tickets).toEqual(expect.arrayContaining([
      { id: 't1', work_date: '2026-10-05', ce_pco_number: 'CE-12' },
      { id: 't2', work_date: '2026-10-06', ce_pco_number: 'CE-12' }
    ]))
  })

  it('preselects nothing when every ready ticket is missing a CE/PCO number (NO_CE_PCO is not one change event)', async () => {
    await renderSelector([
      ticket({ id: 't1', ce_pco_number: null, notes: 'Patch here' }),
      ticket({ id: 't2', ce_pco_number: '', notes: 'Patch there' }),
      ticket({ id: 't3', ce_pco_number: '   ', notes: 'Something else' })
    ], { initialFilter: 'ready' })

    expect(checkedTicketBoxes()).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Import 0 Tickets/ })).toBeDisabled()
  })

  it('does not preselect when opened on another filter', async () => {
    await renderSelector([
      ticket({ id: 't1', ce_pco_number: 'CE-12' }),
      ticket({ id: 't2', ce_pco_number: 'CE-12' })
    ], { initialFilter: 'approved' })
    expect(checkedTicketBoxes()).toHaveLength(0)
  })

  it('"Select group" selects and clears one CE/PCO group', async () => {
    await renderSelector([
      ticket({ id: 't1', ce_pco_number: 'CE-12' }),
      ticket({ id: 't2', ce_pco_number: 'CE-12' }),
      ticket({ id: 't3', ce_pco_number: 'PCO-7' })
    ], { initialFilter: 'ready' })

    const ce12 = within(screen.getByRole('region', { name: 'CE/PCO CE-12' }))
    fireEvent.click(ce12.getByRole('button', { name: 'Select group' }))
    expect(checkedTicketBoxes()).toHaveLength(2)
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(ce12.getByRole('button', { name: 'Clear group' }))
    expect(checkedTicketBoxes()).toHaveLength(0)
  })

  it('marks tickets that are not approved in the other filters and does not let them be picked', async () => {
    await renderSelector([
      ticket({ id: 't1', notes: 'Approved work' }),
      ticket({ id: 't2', notes: 'Unsigned work', status: 'foreman_signed', work_date: '2026-10-02' })
    ])

    expect(screen.getAllByText('Approve this ticket first')).toHaveLength(1)
    const unsignedBox = screen.getByRole('checkbox', { name: 'Select ticket from Oct 2, 2026' })
    expect(unsignedBox).toBeDisabled()
  })

  it('"Select All" skips tickets that are on another COR', async () => {
    await renderSelector([
      ticket({ id: 't1' }),
      ticket({ id: 't2', assigned_cor_id: 'cor-other', work_date: '2026-10-02' })
    ], { initialFilter: 'all' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all 1 tickets' }))
    expect(checkedTicketBoxes()).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: 'Select ticket from Oct 2, 2026' })).toBeDisabled()
  })

  it('offers a way out when nothing is ready', async () => {
    await renderSelector([ticket({ id: 't1', status: 'pending', notes: 'Waiting on client' })], { initialFilter: 'ready' })
    expect(screen.getByText('No approved tickets are waiting for a COR')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show unassigned tickets' }))
    expect(screen.getByText('Waiting on client')).toBeInTheDocument()
  })
})
