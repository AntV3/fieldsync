import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks. TMForm talks to the backend only through '../lib/supabase'; the
// offline helpers there are provided by the data layer, so they are mocked
// here with the shared contract's shapes.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const syncListeners = new Set()
  return {
    syncListeners,
    db: {
      getCrewCheckin: vi.fn(),
      getAssignableCORs: vi.fn(),
      subscribeToCORs: vi.fn(),
      unsubscribe: vi.fn(),
      getLaborClassesForField: vi.fn(),
      getPreviousTicketCrew: vi.fn(),
      submitTMTicketFull: vi.fn(),
      saveCustomFieldData: vi.fn(),
      uploadPhoto: vi.fn(),
      updateTMTicketPhotos: vi.fn(),
      importTicketDataToCOR: vi.fn(),
      markImportFailed: vi.fn(),
      saveTMForemanSignature: vi.fn(),
      getMaterialsEquipmentByCategory: vi.fn(),
      getCustomFieldData: vi.fn(),
      // Legacy calls that must no longer be made by the form
      createTMTicket: vi.fn(),
      addTMWorkers: vi.fn(),
      addTMItems: vi.fn(),
      deleteTMTicket: vi.fn()
    },
    getConnectionStatus: vi.fn(),
    isFieldMode: vi.fn(),
    classifySyncError: vi.fn(),
    savePendingTMTicket: vi.fn(),
    attachSignatureToPendingTicket: vi.fn(),
    onSyncStateChange: vi.fn()
  }
})

vi.mock('../lib/supabase', () => ({
  db: mocks.db,
  getConnectionStatus: mocks.getConnectionStatus,
  isFieldMode: mocks.isFieldMode,
  classifySyncError: mocks.classifySyncError,
  savePendingTMTicket: mocks.savePendingTMTicket,
  attachSignatureToPendingTicket: mocks.attachSignatureToPendingTicket,
  onSyncStateChange: mocks.onSyncStateChange
}))

vi.mock('../lib/imageUtils', () => ({
  compressImage: vi.fn(async (file) => file),
  getGPSLocation: vi.fn(async () => null)
}))

vi.mock('../components/ui/CustomFieldSection', () => ({ default: () => null }))

vi.mock('../lib/TradeConfigContext', () => ({
  useTradeConfig: () => ({ resolvedConfig: null, companyConfig: null }),
  TradeConfigProvider: ({ children }) => children
}))

import TMForm from '../components/TMForm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const project = { id: 'proj-1', name: 'Sunrise Apartments', company_id: 'company-1', work_type: 'demolition', job_type: 'standard' }
const DRAFT_KEY = `tm_draft_${project.id}`
const DRAFT_ID = '11111111-2222-4333-8444-555555555555'

// Same rules as the data layer's classifySyncError (plan: 'auth' for
// 42501/PGRST301/jwt; 'network' for empty-code fetch/abort/timeout and
// AbortError/TimeoutError; else 'server').
const classify = (err) => {
  const code = err?.code
  const msg = String(err?.message || '')
  if (code === '42501' || code === 'PGRST301' || /jwt/i.test(msg)) return 'auth'
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return 'network'
  if (!code && /failed to fetch|load failed|network|abort|timeout/i.test(msg)) return 'network'
  return 'server'
}

const fetchFailure = () => ({ message: 'TypeError: Failed to fetch', code: '' })

function seedDraft(overrides = {}) {
  const draft = {
    step: 4,
    workDate: '2026-11-04',
    cePcoNumber: 'PCO-7',
    notes: 'Demo of level 2 drywall',
    supervision: [{ name: '', hours: '', overtimeHours: '', role: 'Foreman' }],
    operators: [{ name: '', hours: '', overtimeHours: '' }],
    laborers: [{ name: 'Ana Lopez', hours: '8', overtimeHours: '2' }],
    items: [{ material_equipment_id: 'mat-1', name: 'Poly sheeting', quantity: 3, unit: 'roll' }],
    submittedByName: 'Sam Rivera',
    selectedCorId: '',
    clientSubmissionId: DRAFT_ID,
    savedAt: Date.now(),
    ...overrides
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  return draft
}

let onShowToast
let onSubmit

function renderForm() {
  onShowToast = vi.fn()
  onSubmit = vi.fn()
  return render(
    <TMForm
      project={project}
      companyId="company-1"
      onSubmit={onSubmit}
      onCancel={() => {}}
      onShowToast={onShowToast}
    />
  )
}

// Seeds a step-4 draft, renders the form and resumes it.
async function renderAtReview(draftOverrides) {
  seedDraft(draftOverrides)
  const utils = renderForm()
  fireEvent.click(screen.getByText('Resume Draft'))
  await screen.findByText('Submit Ticket')
  return utils
}

async function addPhotos(container, count) {
  const input = container.querySelector('input[type="file"]')
  const files = Array.from({ length: count }, (_, i) =>
    new File(['x'], `photo-${i + 1}.jpg`, { type: 'image/jpeg' })
  )
  fireEvent.change(input, { target: { files } })
  for (const f of files) {
    await screen.findByAltText(f.name)
  }
}

function clickSubmit() {
  fireEvent.click(screen.getByText('Submit Ticket').closest('button'))
}

function toastMessages() {
  return onShowToast.mock.calls.map(c => c[0])
}

function draftInStorage() {
  return JSON.parse(localStorage.getItem(DRAFT_KEY))
}

// Signature pad: jsdom has no canvas, so give it a 2D context and a PNG.
function stubCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}
  }))
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,iVBORw0KGgo=')
}

async function signAsForeman() {
  fireEvent.click(screen.getAllByText('Foreman signature required').find(el => el.closest('button')).closest('button'))
  const canvas = document.querySelector('canvas.tm-sig-canvas')
  fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 })
  fireEvent.mouseMove(canvas, { clientX: 40, clientY: 30 })
  fireEvent.mouseUp(canvas)
  fireEvent.click(screen.getByText('Submit Signature').closest('button'))
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mocks.syncListeners.clear()

  mocks.db.getCrewCheckin.mockResolvedValue(null)
  mocks.db.getAssignableCORs.mockResolvedValue([{ id: 'cor-1', title: 'COR 1', cor_number: 'COR-1', status: 'draft' }])
  mocks.db.subscribeToCORs.mockReturnValue(null)
  mocks.db.getLaborClassesForField.mockResolvedValue({ categories: [], classes: [] })
  mocks.db.saveCustomFieldData.mockResolvedValue({ success: true })
  mocks.db.uploadPhoto.mockImplementation(async (_c, _p, _t, file) => `https://cdn.test/${file.name}`)
  mocks.db.updateTMTicketPhotos.mockResolvedValue({})
  mocks.db.importTicketDataToCOR.mockResolvedValue({})
  mocks.db.saveTMForemanSignature.mockResolvedValue({})
  mocks.db.getMaterialsEquipmentByCategory.mockResolvedValue([])
  mocks.db.getCustomFieldData.mockResolvedValue({})

  mocks.getConnectionStatus.mockReturnValue(true)
  mocks.isFieldMode.mockReturnValue(true)
  mocks.classifySyncError.mockImplementation(classify)
  mocks.savePendingTMTicket.mockImplementation(async (record) => record)
  mocks.attachSignatureToPendingTicket.mockResolvedValue({ saved: true })
  mocks.onSyncStateChange.mockImplementation((cb) => {
    mocks.syncListeners.add(cb)
    return () => mocks.syncListeners.delete(cb)
  })

  if (!URL.createObjectURL) URL.createObjectURL = () => ''
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

describe('TMForm submit: online, field mode', () => {
  it('sends one RPC with the full record, then uploads photos, then shows step 5', async () => {
    mocks.db.submitTMTicketFull.mockResolvedValue({ id: 'ticket-1', replayed: false })
    const { container } = await renderAtReview()
    await addPhotos(container, 1)

    clickSubmit()

    expect(await screen.findByText('Time & Material Ticket Submitted!')).toBeInTheDocument()
    expect(mocks.db.submitTMTicketFull).toHaveBeenCalledTimes(1)
    const [record, opts] = mocks.db.submitTMTicketFull.mock.calls[0]
    expect(opts).toEqual({ timeoutMs: 12000 })
    expect(record.client_submission_id).toBe(DRAFT_ID)
    expect(record.payload).toMatchObject({
      project_id: 'proj-1',
      client_submission_id: DRAFT_ID,
      work_date: '2026-11-04',
      ce_pco_number: 'PCO-7',
      notes: 'Demo of level 2 drywall',
      created_by_name: 'Sam Rivera',
      workers: [{ name: 'Ana Lopez', hours: 8, overtime_hours: 2, role: 'Laborer', labor_class_id: null, time_started: null, time_ended: null }],
      items: [{ material_equipment_id: 'mat-1', custom_name: null, custom_category: null, quantity: 3 }]
    })

    expect(mocks.db.uploadPhoto).toHaveBeenCalledWith('company-1', 'proj-1', 'ticket-1', expect.any(File))
    expect(mocks.db.submitTMTicketFull.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.db.uploadPhoto.mock.invocationCallOrder[0])
    expect(mocks.db.updateTMTicketPhotos).toHaveBeenCalledWith('ticket-1', ['https://cdn.test/photo-1.jpg'], null)

    expect(mocks.savePendingTMTicket).not.toHaveBeenCalled()
    expect(mocks.db.createTMTicket).not.toHaveBeenCalled()
    expect(mocks.db.addTMWorkers).not.toHaveBeenCalled()
    expect(mocks.db.addTMItems).not.toHaveBeenCalled()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(toastMessages()).toContain('Time & Material ticket submitted!')
  })

  it('imports into the linked COR after a fresh submit', async () => {
    mocks.db.submitTMTicketFull.mockResolvedValue({ id: 'ticket-1', replayed: false })
    await renderAtReview({ selectedCorId: 'cor-1' })
    clickSubmit()
    await screen.findByText('Time & Material Ticket Submitted!')
    expect(mocks.db.submitTMTicketFull.mock.calls[0][0].payload.assigned_cor_id).toBe('cor-1')
    expect(mocks.db.importTicketDataToCOR).toHaveBeenCalledWith('ticket-1', 'cor-1', 'company-1', 'demolition', 'standard')
  })

  it('a photo upload failure after the RPC still clears the draft and reaches step 5 with a warning', async () => {
    mocks.db.submitTMTicketFull.mockResolvedValue({ id: 'ticket-1', replayed: false })
    mocks.db.uploadPhoto
      .mockResolvedValueOnce('https://cdn.test/photo-1.jpg')
      .mockRejectedValueOnce(new Error('Upload failed'))
    const { container } = await renderAtReview()
    await addPhotos(container, 2)

    clickSubmit()

    expect(await screen.findByText('Time & Material Ticket Submitted!')).toBeInTheDocument()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(onShowToast).toHaveBeenCalledWith('1/2 photos uploaded. 1 failed - can retry later.', 'warning')
    expect(screen.getByText('1 photo(s) failed to upload')).toBeInTheDocument()
    expect(mocks.db.deleteTMTicket).not.toHaveBeenCalled()
    expect(toastMessages()).not.toContain('Error submitting Time and Material ticket')
  })

  it('attaching photos failing after the RPC is a warning, not a failed submit', async () => {
    mocks.db.submitTMTicketFull.mockResolvedValue({ id: 'ticket-1', replayed: false })
    mocks.db.updateTMTicketPhotos.mockRejectedValue(new Error('boom'))
    const { container } = await renderAtReview()
    await addPhotos(container, 1)

    clickSubmit()

    expect(await screen.findByText('Time & Material Ticket Submitted!')).toBeInTheDocument()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(onShowToast.mock.calls.some(([, type]) => type === 'warning')).toBe(true)
    expect(toastMessages()).not.toContain('Error submitting Time and Material ticket')
  })

  it('a replayed submit shows "already submitted" and does not upload photos or re-import', async () => {
    mocks.db.submitTMTicketFull.mockResolvedValue({ id: 'ticket-1', replayed: true })
    const { container } = await renderAtReview({ selectedCorId: 'cor-1' })
    await addPhotos(container, 1)

    clickSubmit()

    expect(await screen.findByText('Time & Material Ticket Submitted!')).toBeInTheDocument()
    expect(onShowToast).toHaveBeenCalledWith('This ticket was already submitted', 'info')
    expect(mocks.db.uploadPhoto).not.toHaveBeenCalled()
    expect(mocks.db.updateTMTicketPhotos).not.toHaveBeenCalled()
    expect(mocks.db.importTicketDataToCOR).not.toHaveBeenCalled()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })
})

describe('TMForm submit: no route to the server, field mode', () => {
  it('a network error saves the ticket on the phone and shows "Saved on this phone"', async () => {
    mocks.db.submitTMTicketFull.mockRejectedValue(fetchFailure())
    await renderAtReview()

    clickSubmit()

    expect(await screen.findByText('Will sync automatically when you have signal')).toBeInTheDocument()
    expect(screen.getAllByText('Saved on this phone').length).toBeGreaterThan(0)
    expect(mocks.savePendingTMTicket).toHaveBeenCalledTimes(1)
    const record = mocks.savePendingTMTicket.mock.calls[0][0]
    expect(record).toMatchObject({
      client_submission_id: DRAFT_ID,
      project_id: 'proj-1',
      company_id: 'company-1',
      state: 'queued',
      attempts: 0,
      server_ticket_id: null,
      signature: null,
      photos: []
    })
    expect(record.payload.workers).toHaveLength(1)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(onShowToast.mock.calls.some(([, type]) => type === 'error')).toBe(false)
  })

  it('offline (no connection) skips the RPC and saves on the phone', async () => {
    mocks.getConnectionStatus.mockReturnValue(false)
    await renderAtReview()

    clickSubmit()

    expect(await screen.findByText('Will sync automatically when you have signal')).toBeInTheDocument()
    expect(mocks.db.submitTMTicketFull).not.toHaveBeenCalled()
    expect(mocks.savePendingTMTicket).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('an RPC that never answers is saved on the phone after the timeout', async () => {
    mocks.db.submitTMTicketFull.mockImplementation(() => new Promise(() => {}))
    await renderAtReview()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    clickSubmit()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(mocks.savePendingTMTicket).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(10500) })

    expect(mocks.savePendingTMTicket).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Will sync automatically when you have signal')).toBeInTheDocument()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('a data-layer abort after its timeout is treated as no signal', async () => {
    const abort = new Error('The operation was aborted.')
    abort.name = 'AbortError'
    mocks.db.submitTMTicketFull.mockRejectedValue(abort)
    await renderAtReview()

    clickSubmit()

    expect(await screen.findByText('Will sync automatically when you have signal')).toBeInTheDocument()
    expect(mocks.savePendingTMTicket).toHaveBeenCalledTimes(1)
  })

  it('with photos: "Keep editing" stays on step 4 with the photos', async () => {
    mocks.getConnectionStatus.mockReturnValue(false)
    const { container } = await renderAtReview()
    await addPhotos(container, 2)

    clickSubmit()

    expect(await screen.findByText(/Save the ticket without the 2 photo\(s\)\?/)).toBeInTheDocument()
    expect(screen.getByText('No signal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Keep editing'))

    await waitFor(() => expect(screen.queryByText(/Save the ticket without the 2 photo/)).not.toBeInTheDocument())
    expect(screen.getByText('Submit Ticket')).toBeInTheDocument()
    expect(screen.getByAltText('photo-1.jpg')).toBeInTheDocument()
    expect(screen.getByAltText('photo-2.jpg')).toBeInTheDocument()
    expect(mocks.savePendingTMTicket).not.toHaveBeenCalled()
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })

  it('with photos: "Save without photos" saves the ticket on the phone', async () => {
    mocks.db.submitTMTicketFull.mockRejectedValue(fetchFailure())
    const { container } = await renderAtReview()
    await addPhotos(container, 2)

    clickSubmit()

    fireEvent.click(await screen.findByText('Save without photos'))

    expect(await screen.findByText('Will sync automatically when you have signal')).toBeInTheDocument()
    expect(mocks.savePendingTMTicket).toHaveBeenCalledTimes(1)
    expect(mocks.savePendingTMTicket.mock.calls[0][0].photos).toEqual([])
    expect(mocks.db.uploadPhoto).not.toHaveBeenCalled()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('if the phone cannot store the ticket, says so and stays on step 4 with the draft', async () => {
    mocks.getConnectionStatus.mockReturnValue(false)
    mocks.savePendingTMTicket.mockRejectedValue(new Error('QuotaExceededError'))
    await renderAtReview()

    clickSubmit()

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith(
      'Could not save the ticket on this phone. Keep this screen open and try again.', 'error'
    ))
    expect(screen.getByText('Submit Ticket')).toBeInTheDocument()
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })

  it('a server (non-network) error shows the error toast and does not save on the phone', async () => {
    mocks.db.submitTMTicketFull.mockRejectedValue({ message: 'invalid input', code: '22023' })
    await renderAtReview()

    clickSubmit()

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Error submitting Time and Material ticket', 'error'))
    expect(mocks.savePendingTMTicket).not.toHaveBeenCalled()
    expect(screen.getByText('Submit Ticket')).toBeInTheDocument()
  })
})

describe('TMForm submit: office mode', () => {
  it('a network error toasts, stays on step 4, never saves locally, and retries with the same id', async () => {
    mocks.isFieldMode.mockReturnValue(false)
    mocks.getConnectionStatus.mockReturnValue(false)
    mocks.db.submitTMTicketFull
      .mockRejectedValueOnce(fetchFailure())
      .mockResolvedValueOnce({ id: 'ticket-1', replayed: false })
    await renderAtReview()

    clickSubmit()

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Error submitting Time and Material ticket', 'error'))
    expect(screen.getByText('Submit Ticket')).toBeInTheDocument()
    expect(mocks.savePendingTMTicket).not.toHaveBeenCalled()
    expect(screen.queryByText('Saved on this phone')).not.toBeInTheDocument()
    expect(draftInStorage().clientSubmissionId).toBe(DRAFT_ID)

    clickSubmit()

    expect(await screen.findByText('Time & Material Ticket Submitted!')).toBeInTheDocument()
    expect(mocks.db.submitTMTicketFull).toHaveBeenCalledTimes(2)
    const ids = mocks.db.submitTMTicketFull.mock.calls.map(([r]) => r.client_submission_id)
    expect(ids).toEqual([DRAFT_ID, DRAFT_ID])
    expect(mocks.savePendingTMTicket).not.toHaveBeenCalled()
  })
})

describe('TMForm draft round-trip', () => {
  const laborClasses = {
    categories: [{ id: 'cat-1', name: 'Field' }],
    classes: [
      { id: 'lc-1', name: 'Journeyman', category_id: 'cat-1' },
      { id: 'lc-2', name: 'Apprentice', category_id: 'cat-1' }
    ]
  }

  it('persists custom-class workers, custom fields and the submission id, and submits them after resume', async () => {
    mocks.db.getLaborClassesForField.mockResolvedValue(laborClasses)
    mocks.db.submitTMTicketFull.mockResolvedValue({ id: 'ticket-1', replayed: false })

    // First session: resume a draft with custom-class crew, edit, autosave.
    const first = await renderAtReview({
      laborers: [{ name: '', hours: '', overtimeHours: '' }],
      dynamicWorkers: {
        'lc-1': [{ name: 'Ana Lopez', hours: '8', overtimeHours: '2', timeStarted: '06:00', timeEnded: '16:30' }],
        'lc-2': [{ name: 'Ben Ortiz', hours: '8', overtimeHours: '', timeStarted: '', timeEnded: '' }]
      },
      activeLaborClassIds: ['lc-1', 'lc-2'],
      customFieldValues: { permit_number: 'P-42' }
    })
    await waitFor(() => expect(mocks.db.getLaborClassesForField).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Sam R.' } })

    await waitFor(() => expect(draftInStorage().submittedByName).toBe('Sam R.'))
    const saved = draftInStorage()
    expect(saved.clientSubmissionId).toBe(DRAFT_ID)
    expect(saved.activeLaborClassIds).toEqual(['lc-1', 'lc-2'])
    expect(saved.customFieldValues).toEqual({ permit_number: 'P-42' })
    expect(saved.dynamicWorkers['lc-1'][0]).toMatchObject({ name: 'Ana Lopez', hours: '8', overtimeHours: '2' })
    expect(saved.dynamicWorkers['lc-2'][0]).toMatchObject({ name: 'Ben Ortiz', hours: '8' })
    first.unmount()

    // Second session: the draft is still there; resume and submit.
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
    renderForm()
    fireEvent.click(screen.getByText('Resume Draft'))
    await screen.findByText('Submit Ticket')
    await screen.findByText('Ana Lopez')

    clickSubmit()

    await screen.findByText('Time & Material Ticket Submitted!')
    const [record] = mocks.db.submitTMTicketFull.mock.calls[0]
    expect(record.client_submission_id).toBe(DRAFT_ID)
    expect(record.payload.created_by_name).toBe('Sam R.')
    expect(record.payload.workers).toEqual([
      { name: 'Ana Lopez', hours: 8, overtime_hours: 2, time_started: '06:00', time_ended: '16:30', role: 'Journeyman', labor_class_id: 'lc-1' },
      { name: 'Ben Ortiz', hours: 8, overtime_hours: 0, time_started: null, time_ended: null, role: 'Apprentice', labor_class_id: 'lc-2' }
    ])
    expect(record.custom_field_data).toEqual({ permit_number: 'P-42' })
    expect(mocks.db.saveCustomFieldData).toHaveBeenCalledWith('proj-1', 'tm_ticket', 'ticket-1', { permit_number: 'P-42' })
  })

  it('a fresh form gets a UUID submission id and keeps it in the draft', async () => {
    renderForm()
    // Step 1: type a description so there is something to save.
    fireEvent.change(document.querySelector('textarea'), { target: { value: 'Removed ceiling tiles' } })
    await waitFor(() => expect(draftInStorage()?.notes).toBe('Removed ceiling tiles'))
    expect(draftInStorage().clientSubmissionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('TMForm step 5 for a ticket saved on the phone', () => {
  async function reachPendingStep5() {
    mocks.getConnectionStatus.mockReturnValue(false)
    await renderAtReview()
    clickSubmit()
    await screen.findByText('Will sync automatically when you have signal')
  }

  it('hides client signature options until the ticket syncs', async () => {
    await reachPendingStep5()
    expect(screen.getByText('Client signature is available after the ticket syncs')).toBeInTheDocument()
    expect(screen.queryByText('Sign Now (On-Site)')).not.toBeInTheDocument()
    expect(screen.queryByText('Send Signature Link')).not.toBeInTheDocument()
    // Done is gated on the foreman signature
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('foreman signature is written into the saved record; Done appears, skip-client is hidden', async () => {
    stubCanvas()
    await reachPendingStep5()

    await signAsForeman()

    await screen.findByText('Done')
    expect(mocks.attachSignatureToPendingTicket).toHaveBeenCalledWith(DRAFT_ID, expect.objectContaining({
      signature: 'data:image/png;base64,iVBORw0KGgo=',
      signerName: 'Sam Rivera',
      signerTitle: 'Foreman',
      signedAt: expect.any(String)
    }))
    expect(mocks.db.saveTMForemanSignature).not.toHaveBeenCalled()
    expect(onShowToast).toHaveBeenCalledWith('Foreman signature saved successfully', 'success')
    expect(screen.queryByText('Skip client signature for now')).not.toBeInTheDocument()
    expect(screen.getByText('Client signature is available after the ticket syncs')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Done').closest('button'))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('if the record already synced, the signature goes to the server ticket', async () => {
    stubCanvas()
    mocks.attachSignatureToPendingTicket.mockResolvedValue({ synced: true, server_ticket_id: 'server-7' })
    await reachPendingStep5()

    await signAsForeman()

    await screen.findByText('Done')
    expect(mocks.attachSignatureToPendingTicket).toHaveBeenCalledWith(DRAFT_ID, expect.any(Object))
    expect(mocks.db.saveTMForemanSignature).toHaveBeenCalledWith('server-7', expect.objectContaining({
      signature: 'data:image/png;base64,iVBORw0KGgo=',
      signerName: 'Sam Rivera'
    }))
  })

  it('swaps to the real ticket when this ticket syncs', async () => {
    await reachPendingStep5()
    expect(mocks.syncListeners.size).toBe(1)

    // Another ticket syncing is ignored
    act(() => {
      mocks.syncListeners.forEach(cb => cb({ type: 'ticket_synced', client_submission_id: 'other-id', ticket: { id: 'x' } }))
    })
    expect(screen.getByText('Client signature is available after the ticket syncs')).toBeInTheDocument()

    act(() => {
      mocks.syncListeners.forEach(cb => cb({ type: 'ticket_synced', client_submission_id: DRAFT_ID, ticket: { id: 'server-9' } }))
    })

    expect(await screen.findByText('Time & Material Ticket Submitted!')).toBeInTheDocument()
    expect(screen.queryByText('Client signature is available after the ticket syncs')).not.toBeInTheDocument()
    expect(screen.queryByText('Will sync automatically when you have signal')).not.toBeInTheDocument()
    expect(screen.getByText('Get Client Signature')).toBeInTheDocument()
    // Listener is released once the form leaves pending mode
    expect(mocks.syncListeners.size).toBe(0)
  })

  it('after the swap, the foreman signature goes straight to the server ticket', async () => {
    stubCanvas()
    await reachPendingStep5()
    act(() => {
      mocks.syncListeners.forEach(cb => cb({ type: 'ticket_synced', client_submission_id: DRAFT_ID, ticket: { id: 'server-9' } }))
    })
    await screen.findByText('Time & Material Ticket Submitted!')

    await signAsForeman()

    await screen.findByText('Done')
    expect(mocks.db.saveTMForemanSignature).toHaveBeenCalledWith('server-9', expect.any(Object))
    expect(mocks.attachSignatureToPendingTicket).not.toHaveBeenCalled()
    expect(screen.getByText('Skip client signature for now')).toBeInTheDocument()
  })
})
