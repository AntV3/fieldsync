import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { mockDb, isFieldMode } = vi.hoisted(() => ({
  mockDb: {
    getSignatureRequestsForDocument: vi.fn(),
    createSignatureRequest: vi.fn(),
    resendSignatureRequest: vi.fn(),
    revokeSignatureRequest: vi.fn()
  },
  isFieldMode: vi.fn(() => false)
}))

vi.mock('../lib/supabase', () => ({
  db: mockDb,
  isFieldMode,
  supabase: {},
  isSupabaseConfigured: true
}))

import SignatureLinkGenerator from '../components/SignatureLinkGenerator'

const MIN = 60 * 1000
const ago = (ms) => new Date(Date.now() - ms).toISOString()
const inFuture = (ms) => new Date(Date.now() + ms).toISOString()

const project = {
  id: 'p1',
  name: 'Tower A',
  general_contractor: 'Big GC Inc',
  contractor_contact: 'Gina Contact',
  contractor_email: 'gina@biggc.com'
}

const requestRow = (overrides = {}) => ({
  id: 'req1',
  document_type: 'cor',
  document_id: 'cor1',
  signature_token: 'sig_aaaaaaaa11111111',
  status: 'pending',
  view_count: 0,
  expires_at: inFuture(7 * 24 * 60 * MIN),
  recipient_email: 'gina@biggc.com',
  recipient_name: 'Gina Contact',
  sent_at: null,
  last_sent_at: null,
  send_count: 0,
  resend_requested_at: null,
  created_at: ago(60 * MIN),
  signatures: [],
  email_outbox: [],
  ...overrides
})

const renderGenerator = (props = {}) => {
  const onShowToast = vi.fn()
  const utils = render(
    <SignatureLinkGenerator
      documentType="cor"
      documentId="cor1"
      companyId="c1"
      projectId="p1"
      project={project}
      documentTitle="COR 7: Extra work"
      onClose={vi.fn()}
      onShowToast={onShowToast}
      {...props}
    />
  )
  return { ...utils, onShowToast }
}

const emailInput = () => screen.getByLabelText('Client email')
const nameInput = () => screen.getByLabelText('Client name')

describe('SignatureLinkGenerator', () => {
  let originalHref

  beforeEach(() => {
    vi.clearAllMocks()
    isFieldMode.mockReturnValue(false)
    mockDb.getSignatureRequestsForDocument.mockResolvedValue([])
    originalHref = window.location.href
  })

  afterEach(() => {
    cleanup()
  })

  describe('recipient prefill and validation', () => {
    it('prefills email and contact name from the project', async () => {
      renderGenerator()
      await waitFor(() => expect(mockDb.getSignatureRequestsForDocument).toHaveBeenCalled())

      expect(emailInput()).toHaveValue('gina@biggc.com')
      expect(nameInput()).toHaveValue('Gina Contact')
      expect(screen.getByRole('button', { name: /Generate & Email/ })).toBeInTheDocument()
    })

    it('falls back to general_contractor for the name and leaves email empty without contractor_email', async () => {
      renderGenerator({ project: { id: 'p1', general_contractor: 'Big GC Inc' } })
      await waitFor(() => expect(mockDb.getSignatureRequestsForDocument).toHaveBeenCalled())

      expect(emailInput()).toHaveValue('')
      expect(nameInput()).toHaveValue('Big GC Inc')
      expect(screen.getByRole('button', { name: 'Generate Link' })).toBeInTheDocument()
    })

    it('valid email: creates the request with the recipient, never assigns mailto:, toasts', async () => {
      mockDb.createSignatureRequest.mockResolvedValue(requestRow({ id: 'new1', created_at: new Date().toISOString() }))
      const { onShowToast } = renderGenerator()
      await waitFor(() => expect(mockDb.getSignatureRequestsForDocument).toHaveBeenCalled())

      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/ }))

      await waitFor(() => expect(mockDb.createSignatureRequest).toHaveBeenCalledTimes(1))
      const args = mockDb.createSignatureRequest.mock.calls[0]
      expect(args[0]).toBe('cor')
      expect(args[1]).toBe('cor1')
      expect(args[2]).toBe('c1')
      expect(args[3]).toBe('p1')
      expect(args[4]).toBeNull()
      expect(typeof args[5]).toBe('string') // 30-day default expiry
      expect(args[6]).toEqual({ email: 'gina@biggc.com', name: 'Gina Contact' })

      await waitFor(() => expect(onShowToast).toHaveBeenCalledWith(
        expect.stringContaining('email queued to gina@biggc.com'), 'success'
      ))
      expect(window.location.href).toBe(originalHref)
      expect(window.location.href.startsWith('mailto:')).toBe(false)
      expect(screen.queryByText(/Outlook opened/)).not.toBeInTheDocument()
      expect(screen.getByLabelText('New signature link')).toHaveValue(`${window.location.origin}/sign/sig_aaaaaaaa11111111`)
      // the new link shows its queued status
      expect(within(screen.getByTestId('new-link-email-status')).getByText(/Queued/)).toBeInTheDocument()
    })

    it('invalid email: shows an inline error and makes no call', async () => {
      renderGenerator()
      await waitFor(() => expect(mockDb.getSignatureRequestsForDocument).toHaveBeenCalled())

      fireEvent.change(emailInput(), { target: { value: 'not-an-email' } })
      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/ }))

      expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
      expect(emailInput()).toHaveAttribute('aria-invalid', 'true')
      expect(mockDb.createSignatureRequest).not.toHaveBeenCalled()

      // editing clears the error
      fireEvent.change(emailInput(), { target: { value: 'ok@example.com' } })
      expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument()
    })

    it('no email: button reads "Generate Link" and the recipient is null', async () => {
      mockDb.createSignatureRequest.mockResolvedValue(requestRow({ id: 'new1', recipient_email: null, recipient_name: null }))
      const { onShowToast } = renderGenerator()
      await waitFor(() => expect(mockDb.getSignatureRequestsForDocument).toHaveBeenCalled())

      fireEvent.change(emailInput(), { target: { value: '  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Generate Link' }))

      await waitFor(() => expect(mockDb.createSignatureRequest).toHaveBeenCalledTimes(1))
      expect(mockDb.createSignatureRequest.mock.calls[0][6]).toBeNull()
      await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Signature link created', 'success'))
      expect(screen.getByTestId('new-link-email-status')).toBeEmptyDOMElement()
    })

    it('shows an "Open in email app" mailto link next to Copy for the new link', async () => {
      mockDb.createSignatureRequest.mockResolvedValue(requestRow({ id: 'new1' }))
      renderGenerator()
      await waitFor(() => expect(mockDb.getSignatureRequestsForDocument).toHaveBeenCalled())

      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/ }))

      const link = await screen.findByRole('link', { name: /Open in email app/ })
      const href = link.getAttribute('href')
      expect(href.startsWith('mailto:gina@biggc.com?subject=')).toBe(true)
      expect(decodeURIComponent(href)).toContain('/sign/sig_aaaaaaaa11111111')
      expect(screen.getByRole('button', { name: /Copy/ })).toBeInTheDocument()
    })
  })

  describe('email status and resend', () => {
    it('renders "Emailed to … · Sent …" for a sent outbox row', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({
          last_sent_at: ago(2 * 60 * MIN),
          email_outbox: [{ id: 'o1', status: 'sent', attempts: 1, sent_at: ago(2 * 60 * MIN), last_error: null, created_at: ago(2 * 60 * MIN) }]
        })
      ])
      renderGenerator()

      expect(await screen.findByText(/Emailed to gina@biggc\.com · Sent 2h ago/)).toBeInTheDocument()
    })

    it('renders "Queued" for a pending outbox row', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ email_outbox: [{ id: 'o1', status: 'pending', attempts: 0, sent_at: null, last_error: null, created_at: ago(MIN) }] })
      ])
      renderGenerator()

      expect(await screen.findByText(/Queued/)).toBeInTheDocument()
    })

    it('renders "Email failed — <last_error>" for failed and dead rows', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ id: 'r1', email_outbox: [{ id: 'o1', status: 'failed', attempts: 1, sent_at: null, last_error: 'API key is invalid', created_at: ago(30 * MIN) }] }),
        requestRow({ id: 'r2', signature_token: 'sig_bbbbbbbb22222222', email_outbox: [{ id: 'o2', status: 'dead', attempts: 5, sent_at: null, last_error: 'Mailbox does not exist', created_at: ago(30 * MIN) }] })
      ])
      renderGenerator()

      expect(await screen.findByText('Email failed — API key is invalid')).toBeInTheDocument()
      expect(screen.getByText('Email failed — Mailbox does not exist')).toBeInTheDocument()
    })

    it('uses the latest outbox row when there are several', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({
          email_outbox: [
            { id: 'o1', status: 'sent', attempts: 1, sent_at: ago(60 * MIN), last_error: null, created_at: ago(60 * MIN) },
            { id: 'o2', status: 'failed', attempts: 1, sent_at: null, last_error: 'rate limited', created_at: ago(10 * MIN) }
          ]
        })
      ])
      renderGenerator()

      expect(await screen.findByText('Email failed — rate limited')).toBeInTheDocument()
      expect(screen.queryByText(/Emailed to/)).not.toBeInTheDocument()
    })

    it('renders nothing when there is no outbox row and no recipient', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ recipient_email: null, recipient_name: null })
      ])
      renderGenerator()

      const card = await screen.findByTestId('signature-request-req1')
      expect(within(card).queryByText(/Queued|Emailed|Email failed/)).not.toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: /Resend email/ })).not.toBeInTheDocument()
    })

    it('Resend calls resendSignatureRequest and reloads', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({
          last_sent_at: ago(20 * MIN),
          email_outbox: [{ id: 'o1', status: 'sent', attempts: 1, sent_at: ago(20 * MIN), last_error: null, created_at: ago(20 * MIN) }]
        })
      ])
      mockDb.resendSignatureRequest.mockResolvedValue(requestRow({ resend_requested_at: new Date().toISOString() }))
      const { onShowToast } = renderGenerator()

      const button = await screen.findByRole('button', { name: /Resend email/ })
      expect(button).toBeEnabled()
      fireEvent.click(button)

      await waitFor(() => expect(mockDb.resendSignatureRequest).toHaveBeenCalledWith('req1'))
      await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Email queued to gina@biggc.com', 'success'))
      await waitFor(() => expect(mockDb.getSignatureRequestsForDocument).toHaveBeenCalledTimes(2))
    })

    it('disables Resend within 5 minutes of the last send', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({
          last_sent_at: ago(2 * MIN),
          email_outbox: [{ id: 'o1', status: 'sent', attempts: 1, sent_at: ago(2 * MIN), last_error: null, created_at: ago(2 * MIN) }]
        })
      ])
      renderGenerator()

      const button = await screen.findByRole('button', { name: /Resend email/ })
      expect(button).toBeDisabled()
      expect(screen.getByText(/Wait \d min/)).toBeInTheDocument()
    })

    it('disables Resend within 5 minutes of a resend request', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ last_sent_at: ago(60 * MIN), resend_requested_at: ago(MIN) })
      ])
      renderGenerator()

      expect(await screen.findByRole('button', { name: /Resend email/ })).toBeDisabled()
    })

    it('shows the server throttle error verbatim', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ last_sent_at: ago(60 * MIN) })
      ])
      mockDb.resendSignatureRequest.mockRejectedValue(new Error('Please wait a few minutes before resending'))
      const { onShowToast } = renderGenerator()

      fireEvent.click(await screen.findByRole('button', { name: /Resend email/ }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Please wait a few minutes before resending')
      expect(onShowToast).toHaveBeenCalledWith('Please wait a few minutes before resending', 'error')
    })

    it.each([
      ['completed', {}],
      ['revoked', {}],
      ['expired', {}],
      ['pending past expires_at', { status: 'pending', expires_at: ago(MIN) }]
    ])('hides Resend for %s requests', async (label, extra) => {
      const status = label.split(' ')[0]
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ status, last_sent_at: ago(60 * MIN), ...extra })
      ])
      renderGenerator()

      const card = await screen.findByTestId('signature-request-req1')
      expect(within(card).queryByRole('button', { name: /Resend email/ })).not.toBeInTheDocument()
    })

    it('shows a pending request past its expiry as Expired', async () => {
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ status: 'pending', expires_at: ago(MIN) })
      ])
      renderGenerator()

      const card = await screen.findByTestId('signature-request-req1')
      expect(within(card).getByText('Expired')).toBeInTheDocument()
    })
  })

  describe('field mode', () => {
    beforeEach(() => {
      isFieldMode.mockReturnValue(true)
    })

    it('shows status and Resend only for the just-created request', async () => {
      const created = requestRow({ id: 'new1', created_at: ago(10 * MIN), signature_token: 'sig_cccccccc33333333' })
      // Even if the field client could list other requests, they get no status/resend.
      mockDb.getSignatureRequestsForDocument.mockResolvedValue([
        requestRow({ id: 'old1', last_sent_at: ago(60 * MIN), email_outbox: [{ id: 'o1', status: 'sent', attempts: 1, sent_at: ago(60 * MIN), last_error: null, created_at: ago(60 * MIN) }] })
      ])
      mockDb.createSignatureRequest.mockResolvedValue(created)
      mockDb.resendSignatureRequest.mockResolvedValue({ ...created, resend_requested_at: new Date().toISOString() })
      renderGenerator({ documentType: 'tm_ticket', documentId: 't1' })

      const oldCard = await screen.findByTestId('signature-request-old1')
      expect(within(oldCard).queryByText(/Emailed|Queued/)).not.toBeInTheDocument()
      expect(within(oldCard).queryByRole('button', { name: /Resend email/ })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Generate & Email/ }))

      const status = await screen.findByTestId('new-link-email-status')
      await waitFor(() => expect(within(status).getByText(/Queued for gina@biggc\.com/)).toBeInTheDocument())
      const resend = within(status).getByRole('button', { name: /Resend email/ })
      expect(resend).toBeEnabled()

      fireEvent.click(resend)
      await waitFor(() => expect(mockDb.resendSignatureRequest).toHaveBeenCalledWith('new1'))
      // the returned row's resend_requested_at starts a new 5-minute throttle
      await waitFor(() => expect(within(status).getByRole('button', { name: /Resend email/ })).toBeDisabled())
      expect(within(oldCard).queryByRole('button', { name: /Resend email/ })).not.toBeInTheDocument()
    })
  })

  it('imports lucide-react exactly once', () => {
    const source = readFileSync(resolve(__dirname, '../components/SignatureLinkGenerator.jsx'), 'utf8')
    const imports = source.match(/from ['"]lucide-react['"]/g) || []
    expect(imports).toHaveLength(1)
    expect(source).toMatch(/import \{[^}]*\bRefreshCw\b[^}]*\bSend\b[^}]*\} from 'lucide-react'/)
    expect(source).not.toMatch(/window\.location\.href\s*=/)
  })
})
