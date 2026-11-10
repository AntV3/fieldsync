import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const { mockDb, signingClient, getSigningClient, exportCORToPDF, exportTMTicketToPDF } = vi.hoisted(() => ({
  mockDb: {
    getSignatureRequestByToken: vi.fn(),
    getDocumentForSigning: vi.fn(),
    addSignature: vi.fn(),
    resolvePhotoUrls: vi.fn(),
    isFreshSignedPhotoUrl: vi.fn(),
    getCORTickets: vi.fn()
  },
  signingClient: { _tag: 'signing-client' },
  getSigningClient: vi.fn(),
  exportCORToPDF: vi.fn(),
  exportTMTicketToPDF: vi.fn()
}))

vi.mock('../lib/supabase', () => ({
  db: mockDb,
  supabase: {},
  isSupabaseConfigured: true
}))

vi.mock('../lib/signingClient', () => ({
  getSigningClient,
  resetSigningClient: vi.fn()
}))

vi.mock('../lib/corPdfExport', () => ({
  exportCORToPDF,
  exportTMTicketToPDF
}))

// jsdom has no canvas; stand in for the drawing modal with a button that
// submits a fixed signature payload through onSave.
vi.mock('../components/ui/SignatureCanvas', () => ({
  default: ({ onSave, onClose, slot }) => (
    <div data-testid="signature-canvas">
      <button onClick={() => onSave({
        signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
        signerName: 'QA GC',
        signerTitle: 'PM',
        signerCompany: 'GC Co',
        signedAt: '2026-11-05T12:00:00.000Z'
      })}>
        Submit mock signature {slot}
      </button>
      <button onClick={onClose}>Close mock</button>
    </div>
  )
}))

import SignaturePage from '../components/SignaturePage'

const TOKEN = 'sig_test'
const SIGNED_A = 'https://example.supabase.co/storage/v1/object/sign/tm-photos/c/p/t/a.jpg?token=a'
const SIGNED_B = 'https://example.supabase.co/storage/v1/object/sign/tm-photos/c/p/t/b.jpg?token=b'

const projects = {
  id: 'p1',
  name: 'Test Project',
  job_number: 'J-100',
  companies: { id: 'c1', name: 'Acme Builders', logo_url: null }
}

const pendingRequest = (overrides = {}) => ({
  id: 'req1',
  document_type: 'tm_ticket',
  document_id: 'tkt1',
  status: 'pending',
  signature_token: TOKEN,
  signatures: [],
  ...overrides
})

const ticketDoc = (overrides = {}) => ({
  id: 'tkt1',
  project_id: 'p1',
  work_date: '2026-11-04',
  ce_pco_number: 'PCO-7',
  notes: 'Extra trenching',
  status: 'foreman_signed',
  photos: ['c/p/t/a.jpg', 'c/p/t/b.jpg'],
  foreman_signature_data: 'data:image/png;base64,Zm9yZW1hbg==',
  foreman_signature_name: 'Frank Foreman',
  projects,
  t_and_m_workers: [
    { id: 'w1', name: 'Alice Worker', role: 'Operator', hours: 8, overtime_hours: 2, time_started: '07:00', time_ended: '17:00' }
  ],
  t_and_m_items: [
    { id: 'i1', custom_name: null, quantity: 3, materials_equipment: { id: 'm1', name: 'Rebar', unit: 'ton', category: 'material' } }
  ],
  ...overrides
})

const corDoc = (overrides = {}) => ({
  id: 'cor1',
  project_id: 'p1',
  cor_number: 'COR-001',
  title: 'Added scope',
  scope_of_work: 'Dig more',
  status: 'pending_approval',
  period_start: '2026-11-01',
  period_end: '2026-11-04',
  created_at: '2026-11-01T00:00:00Z',
  projects,
  change_order_labor: [{ id: 'l1', labor_class: 'Operator', wage_type: 'regular', regular_hours: 8, regular_rate: 5000, overtime_hours: 0, overtime_rate: 7500, total: 40000 }],
  change_order_materials: [],
  change_order_equipment: [],
  change_order_subcontractors: [],
  backup_tickets: [ticketDoc({ assigned_cor_id: 'cor1' })],
  ...overrides
})

const completedSignature = {
  id: 'sig1',
  signature_request_id: 'req1',
  signature_slot: 1,
  signature_image: 'data:image/png;base64,c2lnbmVk',
  signer_name: 'QA GC',
  signer_title: 'PM',
  signer_company: 'GC Co',
  signed_at: '2026-11-05T12:00:00.000Z'
}

describe('<SignaturePage />', () => {
  let originalFetch

  beforeEach(() => {
    vi.clearAllMocks()
    // The page logs expected signing failures; keep the test output clean
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    originalFetch = global.fetch
    global.fetch = vi.fn(() => Promise.reject(new Error('network calls are not allowed in tests')))
    getSigningClient.mockReturnValue(signingClient)
    mockDb.resolvePhotoUrls.mockImplementation(async (paths) => paths.map((p, i) => (i === 0 ? SIGNED_A : SIGNED_B)))
    // Stand-in for the JWT exp check: anything under /object/sign/ is "still valid"
    mockDb.isFreshSignedPhotoUrl.mockImplementation((url) => typeof url === 'string' && url.includes('/storage/v1/object/sign/'))
    mockDb.getCORTickets.mockRejectedValue(new Error('getCORTickets must not be used by the signing page'))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  describe('T&M ticket', () => {
    it('loads via the token RPC and renders workers, items and one image per resolved photo', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest())
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())

      render(<SignaturePage signatureToken={TOKEN} />)

      await screen.findByText('Alice Worker')
      expect(mockDb.getDocumentForSigning).toHaveBeenCalledWith(TOKEN)
      expect(mockDb.getDocumentForSigning).toHaveBeenCalledTimes(1)
      expect(getSigningClient).toHaveBeenCalledWith(TOKEN)
      expect(mockDb.resolvePhotoUrls).toHaveBeenCalledWith(['c/p/t/a.jpg', 'c/p/t/b.jpg'], signingClient)

      expect(screen.getByText('Acme Builders')).toBeInTheDocument()
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('CE/PCO: PCO-7')).toBeInTheDocument()
      expect(screen.getByText('Extra trenching')).toBeInTheDocument()
      expect(screen.getByText('Operator')).toBeInTheDocument()
      expect(screen.getByText('Rebar')).toBeInTheDocument()
      expect(screen.getByText('ton')).toBeInTheDocument()
      expect(screen.getByText('Signed by Foreman')).toBeInTheDocument()

      const photos = screen.getAllByAltText(/^Photo \d+$/)
      expect(photos).toHaveLength(2)
      expect(photos[0]).toHaveAttribute('src', SIGNED_A)
      expect(photos[1]).toHaveAttribute('src', SIGNED_B)

      expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('drops a photo that could not be signed without crashing', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest())
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())
      mockDb.resolvePhotoUrls.mockResolvedValue([SIGNED_A, null])

      render(<SignaturePage signatureToken={TOKEN} />)

      await screen.findByText('Alice Worker')
      const photos = screen.getAllByAltText(/^Photo \d+$/)
      expect(photos).toHaveLength(1)
      expect(photos[0]).toHaveAttribute('src', SIGNED_A)
      expect(screen.getByText('Photos (1)')).toBeInTheDocument()
    })

    it('submits the signature through addSignature(token, slot, payload) and reloads', async () => {
      mockDb.getSignatureRequestByToken
        .mockResolvedValueOnce(pendingRequest())
        .mockResolvedValue(pendingRequest({ status: 'completed', signatures: [completedSignature] }))
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())
      mockDb.addSignature.mockResolvedValue({ signature: completedSignature, document_status: 'client_signed', request_status: 'completed' })

      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Alice Worker')

      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Submit mock signature 2' }))

      await screen.findByText('Document Signed Successfully')

      expect(mockDb.addSignature).toHaveBeenCalledTimes(1)
      expect(mockDb.addSignature).toHaveBeenCalledWith(TOKEN, 2, expect.objectContaining({
        signerName: 'QA GC',
        signerTitle: 'PM',
        signerCompany: 'GC Co',
        signature: expect.stringMatching(/^data:image\/png;base64,/),
        userAgent: window.navigator.userAgent
      }))
      expect(mockDb.addSignature.mock.calls[0][2]).not.toHaveProperty('ipAddress')
      expect(mockDb.getSignatureRequestByToken).toHaveBeenCalledTimes(2)
      expect(mockDb.getDocumentForSigning).toHaveBeenCalledTimes(2)
      expect(global.fetch).not.toHaveBeenCalled()

      expect(screen.getByText('This document has been signed.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument()
    })

    it('shows an inline notice and reloads into the signed state on signing_already_signed', async () => {
      mockDb.getSignatureRequestByToken
        .mockResolvedValueOnce(pendingRequest())
        .mockResolvedValue(pendingRequest({ status: 'completed', signatures: [completedSignature] }))
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())
      mockDb.addSignature.mockRejectedValue(new Error('signing_already_signed'))

      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Alice Worker')

      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Submit mock signature 2' }))

      const notice = await screen.findByRole('status')
      expect(notice).toHaveTextContent('This document has already been signed.')
      await waitFor(() => expect(mockDb.getSignatureRequestByToken).toHaveBeenCalledTimes(2))

      expect(screen.queryByText('Unable to Load Document')).not.toBeInTheDocument()
      expect(screen.queryByTestId('signature-canvas')).not.toBeInTheDocument()
      expect(screen.queryByText('Document Signed Successfully')).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByText('This document has been signed.')).toBeInTheDocument())
      expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument()
    })

    it('shows an inline notice on signing_invalid_payload and keeps the document', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest())
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())
      mockDb.addSignature.mockRejectedValue({ message: 'signing_invalid_payload' })

      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Alice Worker')

      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Submit mock signature 2' }))

      const notice = await screen.findByRole('status')
      expect(notice).toHaveTextContent(/could not be accepted/)
      // The full-screen modal is closed so the notice is actually visible
      expect(screen.queryByTestId('signature-canvas')).not.toBeInTheDocument()
      expect(screen.queryByText('Unable to Load Document')).not.toBeInTheDocument()
      expect(screen.getByText('Alice Worker')).toBeInTheDocument()
      // The signer can try again
      expect(screen.getByRole('button', { name: 'Sign' })).toBeEnabled()
    })

    it('renders a second link for an already-signed ticket as signed (document slot, no request signature)', async () => {
      // A different signature_requests row for the same ticket: the request
      // has no signatures of its own, but the document carries the GC slot.
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest({ id: 'req2' }))
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc({
        status: 'client_signed',
        gc_signature_data: 'data:image/png;base64,c2lnbmVk',
        gc_signature_name: 'QA GC',
        gc_signature_title: 'PM',
        gc_signature_company: 'GC Co',
        gc_signature_date: '2026-11-05T12:00:00.000Z'
      }))

      render(<SignaturePage signatureToken={TOKEN} />)

      await screen.findByText('This document has been signed.')
      expect(screen.getByText('QA GC')).toBeInTheDocument()
      expect(screen.getByText(/PM.*GC Co/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument()
      expect(mockDb.addSignature).not.toHaveBeenCalled()
    })

    it('reloads into the signed state after signing_already_signed even when the request itself has no signature', async () => {
      // Slot filled on-site between page load and submit: the reload returns
      // the same pending request (signatures: []) but the document now
      // carries gc_signature_*; the Sign buttons must not come back.
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest())
      mockDb.getDocumentForSigning
        .mockResolvedValueOnce(ticketDoc())
        .mockResolvedValue(ticketDoc({ status: 'client_signed', gc_signature_data: 'data:image/png;base64,c2lnbmVk', gc_signature_name: 'Onsite GC' }))
      mockDb.addSignature.mockRejectedValue(new Error('signing_already_signed'))

      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Alice Worker')

      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Submit mock signature 2' }))

      const notice = await screen.findByRole('status')
      expect(notice).toHaveTextContent('This document has already been signed.')
      await waitFor(() => expect(screen.getByText('This document has been signed.')).toBeInTheDocument())
      expect(screen.getByText('Onsite GC')).toBeInTheDocument()
      expect(screen.queryByTestId('signature-canvas')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument()
    })

    it.each([
      ['signing_link_expired', 'This signature link has expired.'],
      ['signing_link_revoked', 'This signature link has been revoked.'],
      ['signing_link_invalid', 'This signature link is invalid or has expired.']
    ])('maps %s from addSignature to the full-page error copy', async (token, copy) => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest())
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())
      mockDb.addSignature.mockRejectedValue(new Error(token))

      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Alice Worker')

      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Submit mock signature 2' }))

      await screen.findByText('Unable to Load Document')
      expect(screen.getByText(copy)).toBeInTheDocument()
    })

    it('renders a completed request as the signed state with no Sign buttons', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest({ status: 'completed', signatures: [completedSignature] }))
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc({ status: 'client_signed', gc_signature_name: 'QA GC' }))

      render(<SignaturePage signatureToken={TOKEN} />)

      await screen.findByText('This document has been signed.')
      expect(screen.queryByText('Unable to Load Document')).not.toBeInTheDocument()
      expect(screen.queryByText('This document has already been fully signed.')).not.toBeInTheDocument()
      expect(screen.getByText('QA GC')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sign' })).not.toBeInTheDocument()
    })

    it('re-resolves photos before exporting the ticket PDF', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest({ status: 'completed', signatures: [completedSignature] }))
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())
      mockDb.addSignature.mockResolvedValue({})
      const RESIGNED = 'https://example.supabase.co/storage/v1/object/sign/tm-photos/c/p/t/a.jpg?token=fresh'
      mockDb.resolvePhotoUrls
        .mockResolvedValueOnce([SIGNED_A, SIGNED_B])
        .mockResolvedValue([RESIGNED, RESIGNED])
      exportTMTicketToPDF.mockResolvedValue()

      // Reach the signed overlay by signing from a pending view
      mockDb.getSignatureRequestByToken.mockResolvedValueOnce(pendingRequest())
      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Alice Worker')
      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Submit mock signature 2' }))
      await screen.findByText('Document Signed Successfully')

      fireEvent.click(screen.getByRole('button', { name: /Save a Copy/ }))

      await waitFor(() => expect(exportTMTicketToPDF).toHaveBeenCalledTimes(1))
      const [ticketArg] = exportTMTicketToPDF.mock.calls[0]
      expect(ticketArg.photos).toEqual([RESIGNED, RESIGNED])
      // Raw paths were re-signed with the signing client, not the on-screen URLs
      const lastResolve = mockDb.resolvePhotoUrls.mock.calls.at(-1)
      expect(lastResolve[0]).toEqual(['c/p/t/a.jpg', 'c/p/t/b.jpg'])
      expect(lastResolve[1]).toBe(signingClient)
    })

    it('keeps the still-valid on-screen photo URLs when the export-time re-sign fails', async () => {
      mockDb.getSignatureRequestByToken
        .mockResolvedValueOnce(pendingRequest())
        .mockResolvedValue(pendingRequest({ status: 'completed', signatures: [completedSignature] }))
      mockDb.getDocumentForSigning.mockResolvedValue(ticketDoc())
      mockDb.addSignature.mockResolvedValue({})
      // First two loads sign fine; the export-time call "fails" the way
      // resolvePhotoUrls does: it echoes the raw paths back.
      mockDb.resolvePhotoUrls
        .mockResolvedValueOnce([SIGNED_A, SIGNED_B])
        .mockResolvedValueOnce([SIGNED_A, SIGNED_B])
        .mockResolvedValue(['c/p/t/a.jpg', 'c/p/t/b.jpg'])
      exportTMTicketToPDF.mockResolvedValue()

      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Alice Worker')
      fireEvent.click(screen.getByRole('button', { name: 'Sign' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Submit mock signature 2' }))
      await screen.findByText('Document Signed Successfully')

      fireEvent.click(screen.getByRole('button', { name: /Save a Copy/ }))

      await waitFor(() => expect(exportTMTicketToPDF).toHaveBeenCalledTimes(1))
      const [ticketArg] = exportTMTicketToPDF.mock.calls[0]
      expect(ticketArg.photos).toEqual([SIGNED_A, SIGNED_B])
      // A raw path never reaches an <img> / the PDF
      expect(ticketArg.photos.every(u => u.startsWith('https://'))).toBe(true)
      const photos = screen.getAllByAltText(/^Photo \d+$/)
      expect(photos.map(p => p.getAttribute('src'))).toEqual([SIGNED_A, SIGNED_B])
    })
  })

  describe('request state copy', () => {
    it('shows the invalid copy when the token RPC returns null', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(null)
      render(<SignaturePage signatureToken="sig_nope" />)
      await screen.findByText('Unable to Load Document')
      expect(screen.getByText('This signature link is invalid or has expired.')).toBeInTheDocument()
      expect(mockDb.getDocumentForSigning).not.toHaveBeenCalled()
    })

    it('shows the expired copy for the time-expired marker (no id, no signatures)', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue({ status: 'expired', document_type: 'tm_ticket' })
      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Unable to Load Document')
      expect(screen.getByText('This signature link has expired.')).toBeInTheDocument()
      expect(mockDb.getDocumentForSigning).not.toHaveBeenCalled()
    })

    it('shows the revoked copy for a revoked request', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest({ status: 'revoked' }))
      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Unable to Load Document')
      expect(screen.getByText('This signature link has been revoked.')).toBeInTheDocument()
      expect(mockDb.getDocumentForSigning).not.toHaveBeenCalled()
    })

    it('shows the not-found copy when the document RPC returns null', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest())
      mockDb.getDocumentForSigning.mockResolvedValue(null)
      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('Unable to Load Document')
      expect(screen.getByText('The document associated with this link could not be found.')).toBeInTheDocument()
    })
  })

  describe('COR', () => {
    it('renders the COR with its backup tickets from the projection and never calls getCORTickets', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest({ document_type: 'cor', document_id: 'cor1' }))
      mockDb.getDocumentForSigning.mockResolvedValue(corDoc())

      render(<SignaturePage signatureToken={TOKEN} />)

      await screen.findByText('COR-001')
      expect(screen.getByText('Added scope')).toBeInTheDocument()
      expect(screen.getByText('Dig more')).toBeInTheDocument()
      expect(screen.getByText('Supporting Documentation')).toBeInTheDocument()
      expect(mockDb.getCORTickets).not.toHaveBeenCalled()
      expect(mockDb.resolvePhotoUrls).toHaveBeenCalledWith(['c/p/t/a.jpg', 'c/p/t/b.jpg'], signingClient)

      // Expand the backup section and the ticket to see its photos
      fireEvent.click(screen.getByText('View All Time and Material Tickets'))
      fireEvent.click(screen.getByText('PCO-7'))
      const evidence = screen.getAllByAltText(/^Evidence \d+$/)
      expect(evidence).toHaveLength(2)
      expect(evidence[0]).toHaveAttribute('src', SIGNED_A)
      expect(screen.getByRole('button', { name: 'Sign to approve' })).toBeInTheDocument()
    })

    it('renders a completed COR with the signature_image and no Sign buttons', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest({
        document_type: 'cor', document_id: 'cor1', status: 'completed', signatures: [completedSignature]
      }))
      mockDb.getDocumentForSigning.mockResolvedValue(corDoc({ status: 'approved' }))

      render(<SignaturePage signatureToken={TOKEN} />)

      await screen.findByText('This change order request has been signed.')
      const sigImg = screen.getByAltText('Signature')
      expect(sigImg).toHaveAttribute('src', completedSignature.signature_image)
      expect(screen.getByText('QA GC')).toBeInTheDocument()
      expect(screen.getByText(/PM.*GC Co/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sign to approve' })).not.toBeInTheDocument()
    })

    it('passes re-resolved backup tickets to exportCORToPDF on download', async () => {
      mockDb.getSignatureRequestByToken.mockResolvedValue(pendingRequest({ document_type: 'cor', document_id: 'cor1' }))
      mockDb.getDocumentForSigning.mockResolvedValue(corDoc())
      const RESIGNED_A = 'https://example.supabase.co/storage/v1/object/sign/tm-photos/c/p/t/a.jpg?token=fresh-a'
      const RESIGNED_B = 'https://example.supabase.co/storage/v1/object/sign/tm-photos/c/p/t/b.jpg?token=fresh-b'
      mockDb.resolvePhotoUrls
        .mockResolvedValueOnce([SIGNED_A, SIGNED_B])
        .mockResolvedValueOnce([RESIGNED_A, RESIGNED_B])
      exportCORToPDF.mockResolvedValue()

      render(<SignaturePage signatureToken={TOKEN} />)
      await screen.findByText('COR-001')

      fireEvent.click(screen.getByRole('button', { name: /Download COR \+ Backup/ }))

      await waitFor(() => expect(exportCORToPDF).toHaveBeenCalledTimes(1))
      const [docArg, projectArg, companyArg, , ticketsArg] = exportCORToPDF.mock.calls[0]
      expect(docArg.id).toBe('cor1')
      expect(projectArg.id).toBe('p1')
      expect(companyArg.name).toBe('Acme Builders')
      expect(ticketsArg).toHaveLength(1)
      expect(ticketsArg[0].id).toBe('tkt1')
      expect(ticketsArg[0].photos).toEqual([RESIGNED_A, RESIGNED_B])
      expect(mockDb.getCORTickets).not.toHaveBeenCalled()
      expect(mockDb.resolvePhotoUrls).toHaveBeenCalledTimes(2)
      expect(mockDb.resolvePhotoUrls.mock.calls[1]).toEqual([['c/p/t/a.jpg', 'c/p/t/b.jpg'], signingClient])
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
