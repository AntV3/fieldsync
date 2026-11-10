import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks. The data layer and the editability policy are provided by other
// modules (tmOps / laborOps / tmStatus); they are mocked here with the shared
// contract's shapes so these tests only exercise the UI.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  db: {
    getLaborClasses: vi.fn(),
    getMaterialsEquipment: vi.fn(),
    updateTMTicketContents: vi.fn(),
    getTMTicketById: vi.fn(),
    importTicketDataToCOR: vi.fn(),
    markImportFailed: vi.fn(),
    getTicketImportStatus: vi.fn(),
    getTMTicketsPaginated: vi.fn(),
    isTicketEditable: vi.fn(),
    getAllLaborClassRates: vi.fn(),
    subscribeToTMTickets: vi.fn(),
    unsubscribe: vi.fn(),
    resolvePhotoUrls: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  db: mocks.db,
  supabase: {},
  isSupabaseConfigured: false
}))

vi.mock('../lib/tmStatus', () => {
  const AWAITING = ['pending', 'foreman_signed', 'client_signed']
  const hasAnySignature = (t) => Boolean(t?.foreman_signature_data || t?.client_signature_data || t?.gc_signature_data)
  return {
    TM_AWAITING_APPROVAL_STATUSES: AWAITING,
    TM_COR_STATUSES_ALLOWING_TICKET_EDIT: ['draft', 'pending_approval'],
    isAwaitingApproval: (s) => AWAITING.includes(s),
    hasClientAuthorization: (t) => Boolean(t?.client_signature_data || t?.gc_signature_data),
    matchesStatusFilter: (t, f) => f === 'all' || (f === 'pending' ? AWAITING.includes(t?.status) : t?.status === f),
    canApproveTicket: (t) => AWAITING.includes(t?.status) &&
      (t.status === 'client_signed' || Boolean(t?.client_signature_data || t?.gc_signature_data)),
    sortTicketsForReview: (list) => [...(list || [])],
    hasAnySignature,
    getTicketEditability: (ticket, lockInfo) => {
      const flagsAfterSignature = hasAnySignature(ticket)
      if (lockInfo?.editable === false) {
        return { editable: false, locked: true, reason: lockInfo.reason ?? null, warnings: [], flagsAfterSignature }
      }
      if (ticket?.status === 'billed') {
        return { editable: false, locked: false, reason: 'This ticket has been billed and can no longer be edited.', warnings: [], flagsAfterSignature }
      }
      const warnings = []
      if (flagsAfterSignature) warnings.push('Saving will mark this ticket "Edited after signature".')
      if (ticket?.assigned_cor_id) warnings.push('Crew and material changes re-sync this ticket\'s lines on the linked COR at current rates.')
      if (ticket?.status === 'approved') warnings.push('This ticket is approved. Changing crew or materials can change its billable value.')
      return { editable: true, locked: false, reason: null, warnings, flagsAfterSignature }
    }
  }
})

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

import TMTicketEditModal from '../components/tm/TMTicketEditModal'
import TMTicketCard from '../components/tm/TMTicketCard'
import TMList from '../components/TMList'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const today = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const LABOR_CLASSES = [
  { id: 'lc-lab', name: 'Laborer', active: true },
  { id: 'lc-fore', name: 'Foreman', active: true },
  { id: 'lc-op', name: 'Operator', active: false }
]

const CATALOG = [
  { id: 'me-poly', name: 'Poly Sheeting', unit: 'roll', cost_per_unit: 10, category: 'Containment', active: true },
  { id: 'me-fan', name: 'Air Scrubber', unit: 'day', cost_per_unit: 80, category: 'Equipment', active: true }
]

// Laborer 50 / 75 OT. Ticket below prices at 8h * 50 + 3 * 10 = 430.
const RATE_LOOKUP = {
  byId: { 'lc-lab': { regular_rate: 50, overtime_rate: 75 }, 'lc-fore': { regular_rate: 60, overtime_rate: 90 } },
  byName: { laborer: { regular_rate: 50, overtime_rate: 75 }, foreman: { regular_rate: 60, overtime_rate: 90 } }
}

const makeTicket = (overrides = {}) => ({
  id: 't-1',
  project_id: 'p-1',
  work_date: '2026-11-03',
  ce_pco_number: 'PCO-7',
  notes: 'Demo wall in room 101',
  status: 'pending',
  change_order_value: null,
  assigned_cor_id: null,
  photos: [],
  t_and_m_workers: [
    { id: 'w-1', name: 'Ann Smith', role: 'Laborer', labor_class_id: 'lc-lab', hours: 8, overtime_hours: 0, time_started: '07:00', time_ended: '15:30' }
  ],
  t_and_m_items: [
    { id: 'i-1', material_equipment_id: 'me-poly', custom_name: null, custom_category: null, quantity: 3, materials_equipment: { name: 'Poly Sheeting', unit: 'roll', cost_per_unit: 10, category: 'Containment' } }
  ],
  ...overrides
})

// Rendered inside an async act() so the class/catalog loads settle first.
const renderModal = async (props = {}) => {
  const onSave = vi.fn()
  const onClose = vi.fn()
  let utils
  await act(async () => {
    utils = render(
      <TMTicketEditModal
        ticket={makeTicket()}
        companyId="c-1"
        rateLookup={RATE_LOOKUP}
        onSave={onSave}
        onClose={onClose}
        {...props}
      />
    )
  })
  return { ...utils, onSave, onClose }
}

const saveButton = () => screen.getByRole('button', { name: /save changes|saving/i })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.getLaborClasses.mockResolvedValue(LABOR_CLASSES)
  mocks.db.getMaterialsEquipment.mockResolvedValue(CATALOG)
  mocks.db.resolvePhotoUrls.mockResolvedValue([])
})

afterEach(() => {
  try { localStorage.clear() } catch (_e) { /* ignore */ }
})

// ---------------------------------------------------------------------------
// TMTicketEditModal
// ---------------------------------------------------------------------------

describe('TMTicketEditModal', () => {
  it('prefills date, CE/PCO, description, workers and items', async () => {
    await renderModal({
      ticket: makeTicket({
        t_and_m_workers: [
          { id: 'w-1', name: 'Ann Smith', role: 'Laborer', labor_class_id: 'lc-lab', hours: 8, overtime_hours: 0 },
          { id: 'w-2', name: 'Bob Jones', role: 'Laborer', labor_class_id: 'lc-lab', hours: 8, overtime_hours: 2 }
        ]
      })
    })

    expect(screen.getByLabelText('Work date')).toHaveValue('2026-11-03')
    expect(screen.getByLabelText('CE / PCO number')).toHaveValue('PCO-7')
    expect(screen.getByLabelText('Description')).toHaveValue('Demo wall in room 101')
    expect(screen.getByLabelText('Worker 1 name')).toHaveValue('Ann Smith')
    expect(screen.getByLabelText('Worker 2 name')).toHaveValue('Bob Jones')
    expect(screen.getByLabelText('Worker 2 regular hours')).toHaveValue(8)
    expect(screen.getByLabelText('Worker 2 overtime hours')).toHaveValue(2)
    expect(screen.getByLabelText('Quantity for Poly Sheeting')).toHaveValue(3)
    expect(screen.getByText('Poly Sheeting')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Worker 1 class')).toHaveValue('lc-lab'))
    expect(mocks.db.getLaborClasses).toHaveBeenCalledWith('c-1', { includeInactive: true })
    expect(screen.getByLabelText('Reason for edit (optional)')).toHaveValue('')
  })

  it('offers an inactive class as "(inactive)" and an unmatched legacy role as "(current)"', async () => {
    await renderModal({
      ticket: makeTicket({
        t_and_m_workers: [
          { id: 'w-1', name: 'Ann Smith', role: 'Laborer', labor_class_id: 'lc-lab', hours: 8, overtime_hours: 0 },
          { id: 'w-2', name: 'Olga Op', role: 'Operator', labor_class_id: 'lc-op', hours: 4, overtime_hours: 0 },
          { id: 'w-3', name: 'Sam Super', role: 'Supervisor', labor_class_id: null, hours: 2, overtime_hours: 0 }
        ]
      })
    })

    const w2 = screen.getByLabelText('Worker 2 class')
    await waitFor(() => expect(within(w2).getByRole('option', { name: 'Operator (inactive)' })).toBeInTheDocument())
    expect(w2).toHaveValue('lc-op')

    const w3 = screen.getByLabelText('Worker 3 class')
    const legacy = within(w3).getByRole('option', { name: 'Supervisor (current)' })
    expect(legacy.selected).toBe(true)

    // Active workers are not offered retired classes or someone else's legacy role
    const w1 = screen.getByLabelText('Worker 1 class')
    expect(within(w1).queryByRole('option', { name: /inactive/ })).toBeNull()
    expect(within(w1).queryByRole('option', { name: /current/ })).toBeNull()
  })

  it('keeps Save disabled until there is a valid change, and Escape closes without saving', async () => {
    const { onSave, onClose } = await renderModal()
    expect(saveButton()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Worker 1 regular hours'), { target: { value: '6' } })
    expect(saveButton()).toBeEnabled()

    // Cleared description
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '   ' } })
    expect(saveButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Demo wall' } })
    expect(saveButton()).toBeEnabled()

    // Item quantity 0
    fireEvent.change(screen.getByLabelText('Quantity for Poly Sheeting'), { target: { value: '0' } })
    expect(saveButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Quantity for Poly Sheeting'), { target: { value: '2' } })
    expect(saveButton()).toBeEnabled()

    // Negative hours
    fireEvent.change(screen.getByLabelText('Worker 1 overtime hours'), { target: { value: '-1' } })
    expect(saveButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Worker 1 overtime hours'), { target: { value: '0' } })

    // Invalid date
    fireEvent.change(screen.getByLabelText('Work date'), { target: { value: '' } })
    expect(saveButton()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Work date'), { target: { value: '2026-11-04' } })
    expect(saveButton()).toBeEnabled()

    // No workers
    fireEvent.click(screen.getByRole('button', { name: 'Remove worker 1' }))
    expect(saveButton()).toBeDisabled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the contract payload: fields, workers, items and edit note', async () => {
    const { onSave } = await renderModal()
    await screen.findByRole('option', { name: 'Air Scrubber (day)' })

    fireEvent.change(screen.getByLabelText('Worker 1 overtime hours'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /add worker/i }))
    fireEvent.change(screen.getByLabelText('Worker 2 name'), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText('Worker 2 class'), { target: { value: 'lc-fore' } })
    fireEvent.change(screen.getByLabelText('Worker 2 regular hours'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Quantity for Poly Sheeting'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Add from catalog'), { target: { value: 'me-fan' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    fireEvent.click(screen.getByRole('button', { name: /custom item/i }))
    fireEvent.change(screen.getByLabelText('Custom item name'), { target: { value: 'Duct tape' } })
    fireEvent.change(screen.getByLabelText('Custom item category'), { target: { value: 'Containment' } })
    fireEvent.click(screen.getByRole('button', { name: /add custom item/i }))
    fireEvent.change(screen.getByLabelText('CE / PCO number'), { target: { value: 'PCO-8' } })
    fireEvent.change(screen.getByLabelText('Reason for edit (optional)'), { target: { value: ' Foreman double-counted OT ' } })

    fireEvent.click(saveButton())

    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(['editNote', 'fields', 'items', 'workers'])
    expect(payload.fields).toEqual({ work_date: '2026-11-03', ce_pco_number: 'PCO-8', notes: 'Demo wall in room 101' })
    expect(payload.workers).toEqual([
      { name: 'Ann Smith', role: 'Laborer', hours: 8, overtime_hours: 2, time_started: '07:00', time_ended: '15:30', labor_class_id: 'lc-lab' },
      { name: 'Jane Doe', role: 'Foreman', hours: 4, overtime_hours: 0, time_started: null, time_ended: null, labor_class_id: 'lc-fore' }
    ])
    expect(payload.items).toEqual([
      { material_equipment_id: 'me-poly', custom_name: null, custom_category: null, quantity: 5 },
      { material_equipment_id: 'me-fan', custom_name: null, custom_category: null, quantity: 1 },
      { material_equipment_id: null, custom_name: 'Duct tape', custom_category: 'Containment', quantity: 1 }
    ])
    expect(payload.editNote).toBe('Foreman double-counted OT')
  })

  it('shows the signed and COR-linked warnings in the banner', async () => {
    await renderModal({
      ticket: makeTicket({ status: 'foreman_signed', foreman_signature_data: 'data:image/png;base64,AAA', assigned_cor_id: 'cor-1' })
    })
    const banner = screen.getByRole('note')
    expect(banner).toHaveTextContent('Saving will mark this ticket "Edited after signature".')
    expect(banner).toHaveTextContent(/re-sync this ticket's lines on the linked COR/)
  })

  it('shows no banner for an unsigned, unlinked pending ticket', async () => {
    await renderModal()
    expect(screen.queryByRole('note')).toBeNull()
  })

  describe('billable value block (approved tickets)', () => {
    it('is absent until crew changes, and unchecked when the approved value was negotiated', async () => {
      const { onSave } = await renderModal({ ticket: makeTicket({ status: 'approved', change_order_value: 500 }) })
      expect(screen.queryByRole('checkbox')).toBeNull()

      // Description-only edit: still no block
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Demo wall in room 102' } })
      expect(screen.queryByRole('checkbox')).toBeNull()

      fireEvent.change(screen.getByLabelText('Worker 1 regular hours'), { target: { value: '6' } })
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()
      expect(screen.getByText(/entered manually/i)).toBeInTheDocument()
      // 6h * 50 + 3 * 10
      expect(screen.getByText(/update the billable value to \$330\.00/i)).toBeInTheDocument()

      fireEvent.click(saveButton())
      expect(onSave.mock.calls[0][0].fields).not.toHaveProperty('change_order_value')
    })

    it('is checked when the approved value equals the computed value and sends the new value', async () => {
      const { onSave } = await renderModal({ ticket: makeTicket({ status: 'approved', change_order_value: 430 }) })
      fireEvent.change(screen.getByLabelText('Quantity for Poly Sheeting'), { target: { value: '5' } })

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toBeChecked()
      expect(screen.queryByText(/entered manually/i)).toBeNull()

      fireEvent.click(saveButton())
      expect(onSave.mock.calls[0][0].fields.change_order_value).toBe(450)
    })

    it('includes the value for a negotiated ticket only when the box is ticked', async () => {
      const { onSave } = await renderModal({ ticket: makeTicket({ status: 'approved', change_order_value: 500 }) })
      fireEvent.change(screen.getByLabelText('Worker 1 regular hours'), { target: { value: '6' } })
      fireEvent.click(screen.getByRole('checkbox'))
      fireEvent.click(saveButton())
      expect(onSave.mock.calls[0][0].fields.change_order_value).toBe(330)
    })

    it('is never shown for tickets that are not approved', async () => {
      await renderModal({ ticket: makeTicket({ status: 'foreman_signed', change_order_value: 430 }) })
      fireEvent.change(screen.getByLabelText('Worker 1 regular hours'), { target: { value: '6' } })
      expect(screen.queryByRole('checkbox')).toBeNull()
    })
  })

  it('disables the footer while saving and ignores Escape', async () => {
    const { onClose, rerender, onSave } = await renderModal()
    await screen.findByRole('option', { name: 'Foreman' })
    fireEvent.change(screen.getByLabelText('Worker 1 regular hours'), { target: { value: '6' } })
    rerender(
      <TMTicketEditModal
        ticket={makeTicket()}
        companyId="c-1"
        rateLookup={RATE_LOOKUP}
        saving
        onSave={onSave}
        onClose={onClose}
      />
    )
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// TMTicketCard
// ---------------------------------------------------------------------------

describe('TMTicketCard edit affordances', () => {
  const renderCard = (ticket, props = {}) => {
    const onEdit = vi.fn()
    render(
      <TMTicketCard
        ticket={ticket}
        isExpanded
        isSelected={false}
        isLocked={false}
        lockInfo={undefined}
        hasFailedImport={false}
        isRetrying={false}
        onToggleExpand={vi.fn()}
        onToggleSelect={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onUpdateStatus={vi.fn()}
        onDelete={vi.fn()}
        onOpenCorAssign={vi.fn()}
        onRetryImport={vi.fn()}
        onShowSignatureLink={vi.fn()}
        onEdit={onEdit}
        formatDate={(d) => `D(${String(d).slice(0, 10)})`}
        calculateTotalHours={() => 8}
        calculateTicketTotal={() => 30}
        {...props}
      />
    )
    return { onEdit }
  }

  const actionButtons = () => within(screen.getByRole('group', { name: 'Ticket actions' })).getAllByRole('button')

  it('puts an enabled Edit button first in the action bar', () => {
    const { onEdit } = renderCard(makeTicket({ status: 'foreman_signed', foreman_signature_data: 'x' }))
    const [first] = actionButtons()
    expect(first).toHaveTextContent('Edit')
    expect(first).toBeEnabled()
    fireEvent.click(first)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 't-1' }))
  })

  it('disables Edit with a tooltip on billed tickets', () => {
    renderCard(makeTicket({ status: 'billed' }))
    const [first] = actionButtons()
    expect(first).toHaveTextContent('Edit')
    expect(first).toBeDisabled()
    expect(first).toHaveAttribute('title', 'This ticket has been billed and can no longer be edited.')
  })

  it('has no Edit button on locked tickets', () => {
    renderCard(makeTicket({ assigned_cor_id: 'cor-1' }), {
      isLocked: true,
      lockInfo: { editable: false, lockedBy: { id: 'cor-1', status: 'approved', cor_number: 'COR-3' }, reason: 'This ticket is linked to COR-3 which has been approved' }
    })
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
  })

  it('shows no edit badge or notice on an unedited ticket', () => {
    renderCard(makeTicket())
    expect(screen.queryByText('Edited')).toBeNull()
    expect(screen.queryByText(/Edited by/)).toBeNull()
  })

  it('shows the "Edited" badge and notice for an edit without signatures', () => {
    renderCard(makeTicket({
      edit_count: 1,
      edited_at: '2026-11-05T15:00:00Z',
      edited_by_name: 'Alice Office',
      edited_after_signature: false,
      last_edit_note: 'Typo in PCO'
    }))
    const badge = screen.getByText('Edited', { selector: '.tm-edited-badge' })
    expect(badge).not.toHaveClass('after-signature')
    expect(screen.getByRole('note')).toHaveTextContent('Edited by Alice Office on D(2026-11-05) — Typo in PCO.')
    expect(screen.getByRole('note')).not.toHaveTextContent('Signatures were captured')
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', expect.stringMatching(/, edited$/))
  })

  it('shows the amber "Edited after signature" badge and the full notice with the edit count', () => {
    renderCard(makeTicket({
      status: 'foreman_signed',
      foreman_signature_data: 'x',
      edit_count: 2,
      edited_at: '2026-11-05T15:00:00Z',
      edited_by_name: 'Alice Office',
      edited_after_signature: true,
      last_edit_note: 'Foreman double-counted OT'
    }))
    const badge = screen.getByText('Edited after signature', { selector: '.tm-edited-badge' })
    expect(badge).toHaveClass('after-signature')
    expect(screen.getByText('Foreman', { selector: '.tm-foreman-signed-badge' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Edited by Alice Office on D(2026-11-05) — Foreman double-counted OT (2 edits). Signatures were captured before this edit.'
    )
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', expect.stringMatching(/, edited after signature$/))
  })
})

// ---------------------------------------------------------------------------
// TMList orchestration
// ---------------------------------------------------------------------------

describe('TMList handleSaveEdit', () => {
  let realtimeCallback
  const project = { id: 'p-1', work_type: 'demolition', job_type: 'standard' }
  const company = { id: 'c-1' }

  const setup = (ticketOverrides = {}) => {
    const ticket = makeTicket({ work_date: today(), assigned_cor_id: 'cor-1', ...ticketOverrides })
    mocks.db.getTMTicketsPaginated.mockResolvedValue({ tickets: [ticket], hasMore: false, totalCount: 1 })
    mocks.db.isTicketEditable.mockResolvedValue({ editable: true })
    mocks.db.getTicketImportStatus.mockResolvedValue({ import_status: 'completed', data_imported: true })
    mocks.db.getAllLaborClassRates.mockResolvedValue([])
    mocks.db.subscribeToTMTickets.mockImplementation((_id, cb) => { realtimeCallback = cb; return { id: 'sub' } })
    mocks.db.getTMTicketById.mockResolvedValue({ ...ticket, edit_count: 1, edited_at: new Date().toISOString(), edited_by_name: 'Alice Office' })
    const onShowToast = vi.fn()
    try { localStorage.setItem('fieldsync-tm-default-view', 'list') } catch (_e) { /* ignore */ }
    render(<TMList project={project} company={company} onShowToast={onShowToast} />)
    return { ticket, onShowToast }
  }

  const openEditAndChangeHours = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Expand ticket details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit this ticket' }))
    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('Worker 1 regular hours'), { target: { value: '6' } })
  }

  beforeEach(() => {
    realtimeCallback = null
  })

  it('re-imports into the COR when the server asks for a re-sync, then refreshes the row', async () => {
    const { onShowToast } = setup()
    mocks.db.updateTMTicketContents.mockResolvedValue({ ticket: { id: 't-1', assigned_cor_id: 'cor-1' }, contents_changed: true, cor_resync_required: true })
    mocks.db.importTicketDataToCOR.mockResolvedValue({})

    await openEditAndChangeHours()
    fireEvent.click(saveButton())

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Ticket updated', 'success'))
    expect(mocks.db.updateTMTicketContents).toHaveBeenCalledWith('t-1', expect.objectContaining({
      fields: expect.any(Object), workers: expect.any(Array), items: expect.any(Array)
    }))
    expect(mocks.db.importTicketDataToCOR).toHaveBeenCalledWith('t-1', 'cor-1', 'c-1', 'demolition', 'standard')
    expect(mocks.db.markImportFailed).not.toHaveBeenCalled()
    expect(mocks.db.getTMTicketById).toHaveBeenCalledWith('t-1')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Edited', { selector: '.tm-edited-badge' })).toBeInTheDocument()
  })

  it('does not re-import when the server did not ask for a re-sync', async () => {
    const { onShowToast } = setup()
    mocks.db.updateTMTicketContents.mockResolvedValue({ ticket: { id: 't-1' }, contents_changed: true, cor_resync_required: false })

    await openEditAndChangeHours()
    fireEvent.click(saveButton())

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Ticket updated', 'success'))
    expect(mocks.db.importTicketDataToCOR).not.toHaveBeenCalled()
  })

  it('marks the import failed and shows Import Failed when the re-sync throws', async () => {
    const { onShowToast } = setup()
    mocks.db.updateTMTicketContents.mockResolvedValue({ ticket: { id: 't-1', assigned_cor_id: 'cor-1' }, contents_changed: true, cor_resync_required: true })
    mocks.db.importTicketDataToCOR.mockRejectedValue(new Error('network down'))
    mocks.db.markImportFailed.mockResolvedValue(undefined)

    await openEditAndChangeHours()
    mocks.db.getTicketImportStatus.mockResolvedValue({ import_status: 'failed', data_imported: true })
    fireEvent.click(saveButton())

    await waitFor(() => expect(mocks.db.markImportFailed).toHaveBeenCalledWith('t-1', 'cor-1', 'network down'))
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith(expect.stringMatching(/Ticket updated.*Retry Sync/), 'warning'))
    expect(await screen.findByText(/Import Failed/)).toBeInTheDocument()
  })

  it('shows a P0001 refusal verbatim and keeps the modal open', async () => {
    const { onShowToast } = setup()
    const message = 'This ticket is on invoice INV-0042 and can no longer be edited'
    mocks.db.updateTMTicketContents.mockRejectedValue({ code: 'P0001', message })

    await openEditAndChangeHours()
    fireEvent.click(saveButton())

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith(message, 'error'))
    expect(mocks.db.importTicketDataToCOR).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Worker 1 regular hours')).toHaveValue(6)
  })

  it('reloads silently on realtime events and defers the reload while a save is in flight', async () => {
    setup()
    await openEditAndChangeHours()
    // Mount loads twice (project effect + filter effect); count from here.
    const base = mocks.db.getTMTicketsPaginated.mock.calls.length
    const loads = () => mocks.db.getTMTicketsPaginated.mock.calls.length - base

    // Realtime event with the modal open: list refreshes, modal and its text survive
    await act(async () => { realtimeCallback() })
    await waitFor(() => expect(loads()).toBe(1))
    expect(document.querySelector('.tm-loading-skeletons')).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Worker 1 regular hours')).toHaveValue(6)

    let resolveSave
    mocks.db.updateTMTicketContents.mockReturnValue(new Promise(r => { resolveSave = r }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.db.updateTMTicketContents).toHaveBeenCalled())

    await act(async () => { realtimeCallback() })
    expect(loads()).toBe(1)

    await act(async () => { resolveSave({ ticket: { id: 't-1' }, contents_changed: true, cor_resync_required: false }) })
    await waitFor(() => expect(loads()).toBe(2))
  })
})
