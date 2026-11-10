import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const { mockDb, executeExport, generatePDFFromSnapshot } = vi.hoisted(() => ({
  mockDb: {
    getCORById: vi.fn(),
    subscribeToCorTickets: vi.fn(),
    unsubscribe: vi.fn(),
    resolvePhotoUrls: vi.fn(),
    submitCORForApproval: vi.fn(),
    getAllLaborClassRates: vi.fn(),
    getLaborRates: vi.fn()
  },
  executeExport: vi.fn(),
  generatePDFFromSnapshot: vi.fn()
}))

vi.mock('../lib/supabase', () => ({
  db: mockDb,
  supabase: {},
  isSupabaseConfigured: true
}))

vi.mock('../lib/corExportPipeline', () => ({
  executeExport,
  createSnapshot: vi.fn(() => ({ corData: {}, ticketsData: [], totals: {} }))
}))

vi.mock('../lib/corPdfGenerator', () => ({ generatePDFFromSnapshot }))
vi.mock('../lib/financialExport', () => ({ exportCORDetail: vi.fn() }))
vi.mock('../components/ui/SignatureCanvas', () => ({ default: () => null }))
vi.mock('../components/SignatureLinkGenerator', () => ({
  default: ({ documentId }) => <div data-testid="signature-link-generator" data-document-id={documentId} />
}))

import { PermissionsProvider } from '../lib/PermissionsContext'
import { ALL_PERMISSIONS } from '../lib/permissions'
import CORDetail from '../components/cor/CORDetail'

const cor = (overrides = {}) => ({
  id: 'cor-1',
  cor_number: 'COR-001',
  title: 'Extra demo',
  scope_of_work: 'Remove ceiling at level 2',
  status: 'draft',
  created_at: '2026-10-01T12:00:00Z',
  period_start: '2026-10-01',
  period_end: '2026-10-05',
  change_order_labor: [],
  change_order_materials: [],
  change_order_equipment: [],
  change_order_subcontractors: [],
  change_order_ticket_associations: [],
  ...overrides
})

const renderDetail = async (corRow, permissions = ALL_PERMISSIONS) => {
  mockDb.getCORById.mockResolvedValue(corRow)
  const onShowToast = vi.fn()
  const onStatusChange = vi.fn()
  render(
    <PermissionsProvider value={permissions}>
    <CORDetail
      cor={corRow}
      project={{ id: 'p1', name: 'Tower A' }}
      company={{ id: 'c1' }}
      areas={[]}
      onClose={vi.fn()}
      onEdit={vi.fn()}
      onShowToast={onShowToast}
      onStatusChange={onStatusChange}
    />
    </PermissionsProvider>
  )
  await screen.findByRole('heading', { name: corRow.title })
  return { onShowToast, onStatusChange }
}

describe('CORDetail approval and permissions', () => {
  beforeEach(() => {
    mockDb.subscribeToCorTickets.mockReturnValue(null)
    mockDb.getAllLaborClassRates.mockResolvedValue([])
    mockDb.getLaborRates.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('offers no office Approve on a COR that is with the client', async () => {
    await renderDetail(cor({ status: 'pending_approval' }))
    expect(screen.queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record that the client rejected this COR' })).toBeInTheDocument()
  })

  it('disables sending for a member without the send permission', async () => {
    await renderDetail(cor(), { ...ALL_PERMISSIONS, canSendCORs: false, enforced: true })
    const send = screen.getByRole('button', { name: /Submit & send for signature/ })
    expect(send).toBeDisabled()
    fireEvent.click(send)
    expect(mockDb.submitCORForApproval).not.toHaveBeenCalled()
  })
})

describe('CORDetail next step', () => {
  beforeEach(() => {
    mockDb.subscribeToCorTickets.mockReturnValue(null)
    mockDb.getAllLaborClassRates.mockResolvedValue([])
    mockDb.getLaborRates.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('submits a draft, then opens the signature link generator', async () => {
    mockDb.submitCORForApproval.mockResolvedValue({ id: 'cor-1', status: 'pending_approval' })
    const { onStatusChange } = await renderDetail(cor())

    const button = screen.getByRole('button', { name: 'Submit & send for signature' })
    expect(button).toHaveClass('btn-primary')
    fireEvent.click(button)

    const generator = await screen.findByTestId('signature-link-generator')
    expect(generator).toHaveAttribute('data-document-id', 'cor-1')
    expect(mockDb.submitCORForApproval).toHaveBeenCalledWith('cor-1')
    expect(onStatusChange).toHaveBeenCalled()
    // The COR is now pending: the draft action is gone, the link action is primary
    expect(screen.queryByRole('button', { name: 'Submit & send for signature' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get shareable signature link' })).toHaveClass('btn-primary')
  })

  it('shows a toast and does not open the generator when the submit fails', async () => {
    mockDb.submitCORForApproval.mockRejectedValue(new Error('boom'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { onShowToast, onStatusChange } = await renderDetail(cor())

    fireEvent.click(screen.getByRole('button', { name: 'Submit & send for signature' }))

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Could not submit COR. Nothing was sent.', 'error'))
    expect(screen.queryByTestId('signature-link-generator')).not.toBeInTheDocument()
    expect(onStatusChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Submit & send for signature' })).toBeEnabled()
    error.mockRestore()
  })

  it('makes the signature link the primary action while pending approval', async () => {
    await renderDetail(cor({ status: 'pending_approval' }))
    expect(screen.queryByRole('button', { name: 'Submit & send for signature' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get shareable signature link' })).toHaveClass('btn-primary')
  })

  it('keeps the signature link secondary once approved', async () => {
    await renderDetail(cor({ status: 'approved' }))
    expect(screen.getByRole('button', { name: 'Get shareable signature link' })).toHaveClass('btn-secondary')
  })
})

describe('CORDetail PDF export toast', () => {
  beforeEach(() => {
    mockDb.subscribeToCorTickets.mockReturnValue(null)
    mockDb.getAllLaborClassRates.mockResolvedValue([])
    mockDb.getLaborRates.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reports a download when the pipeline produced a file, cached or not', async () => {
    executeExport.mockResolvedValue({ success: true, cached: true, fileName: 'COR-001_export.pdf' })
    const { onShowToast } = await renderDetail(cor())

    fireEvent.click(screen.getByRole('button', { name: 'Export COR to PDF' }))

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('PDF downloaded', 'success'))
    expect(generatePDFFromSnapshot).not.toHaveBeenCalled()
    expect(onShowToast).not.toHaveBeenCalledWith('PDF downloaded (cached)', 'success')
  })

  it('generates the file directly when the pipeline returns no file', async () => {
    executeExport.mockResolvedValue({ success: true, cached: true, pdfUrl: 'COR-001_export.pdf' })
    generatePDFFromSnapshot.mockResolvedValue({ success: true, fileName: 'COR-001_export.pdf' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { onShowToast } = await renderDetail(cor())

    fireEvent.click(screen.getByRole('button', { name: 'Export COR to PDF' }))

    await waitFor(() => expect(generatePDFFromSnapshot).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('PDF downloaded', 'success'))
    expect(onShowToast.mock.calls.filter(([, type]) => type === 'success')).toHaveLength(1)
    warn.mockRestore()
  })

  it('shows an error and no success toast when no file can be produced', async () => {
    executeExport.mockRejectedValue(new Error('rpc missing'))
    generatePDFFromSnapshot.mockRejectedValue(new Error('render failed'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { onShowToast } = await renderDetail(cor())

    fireEvent.click(screen.getByRole('button', { name: 'Export COR to PDF' }))

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Error generating PDF', 'error'))
    expect(onShowToast.mock.calls.some(([, type]) => type === 'success')).toBe(false)
    warn.mockRestore()
    error.mockRestore()
  })
})
