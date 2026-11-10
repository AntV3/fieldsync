import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    getCORs: vi.fn(),
    getCORStats: vi.fn(),
    subscribeToCORs: vi.fn(),
    unsubscribe: vi.fn(),
    submitCORForApproval: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  db: mockDb,
  supabase: {},
  isSupabaseConfigured: true
}))

vi.mock('../lib/BrandingContext', () => ({
  useBranding: () => ({ branding: {} })
}))

vi.mock('../components/cor/CORLog', () => ({ default: () => null }))

vi.mock('../components/SignatureLinkGenerator', () => ({
  default: ({ documentId, documentTitle }) => (
    <div data-testid="signature-link-generator" data-document-id={documentId}>{documentTitle}</div>
  )
}))

import CORList from '../components/cor/CORList'

const cor = (overrides = {}) => ({
  id: 'cor-1',
  cor_number: 'COR-001',
  title: 'Draft one',
  scope_of_work: 'Extra demo',
  status: 'draft',
  cor_total: 125000,
  created_at: new Date().toISOString(),
  period_start: '2026-10-01',
  period_end: '2026-10-05',
  ...overrides
})

const cors = [
  cor(),
  cor({ id: 'cor-2', cor_number: 'COR-002', title: 'Waiting on client', status: 'pending_approval' }),
  cor({ id: 'cor-3', cor_number: 'COR-003', title: 'Signed off', status: 'approved' })
]

const renderList = (props = {}) => {
  const onShowToast = vi.fn()
  const utils = render(
    <CORList
      project={{ id: 'p1', name: 'Tower A' }}
      company={{ id: 'c1' }}
      areas={[]}
      onShowToast={onShowToast}
      onViewCOR={vi.fn()}
      onEditCOR={vi.fn()}
      onCreateCOR={vi.fn()}
      {...props}
    />
  )
  return { onShowToast, ...utils }
}

const tab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

describe('CORList filterRequest', () => {
  beforeEach(() => {
    mockDb.getCORs.mockResolvedValue(cors)
    mockDb.getCORStats.mockResolvedValue(null)
    mockDb.subscribeToCORs.mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows every status when there is no request', async () => {
    renderList()
    expect(await screen.findByText('Draft one')).toBeInTheDocument()
    expect(screen.getByText('Waiting on client')).toBeInTheDocument()
    expect(tab('All')).toHaveAttribute('aria-selected', 'true')
  })

  it('applies the requested status on mount', async () => {
    renderList({ filterRequest: { key: 1, filter: 'draft' } })
    expect(await screen.findByText('Draft one')).toBeInTheDocument()
    expect(screen.queryByText('Waiting on client')).not.toBeInTheDocument()
    expect(tab('Draft')).toHaveAttribute('aria-selected', 'true')
  })

  it('applies a request again when its key changes', async () => {
    const props = {
      project: { id: 'p1', name: 'Tower A' },
      company: { id: 'c1' },
      areas: [],
      onShowToast: vi.fn(),
      onViewCOR: vi.fn(),
      onEditCOR: vi.fn(),
      onCreateCOR: vi.fn()
    }
    const { rerender } = render(<CORList {...props} filterRequest={{ key: 1, filter: 'draft' }} />)
    await screen.findByText('Draft one')

    // The user moves to another tab; the same request must not pull them back
    fireEvent.click(tab('Approved'))
    rerender(<CORList {...props} filterRequest={{ key: 1, filter: 'draft' }} />)
    expect(tab('Approved')).toHaveAttribute('aria-selected', 'true')

    rerender(<CORList {...props} filterRequest={{ key: 2, filter: 'pending_approval' }} />)
    expect(tab('Pending')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Waiting on client')).toBeInTheDocument()
    expect(screen.queryByText('Draft one')).not.toBeInTheDocument()

    // Same status requested again with a new key
    fireEvent.click(tab('All'))
    rerender(<CORList {...props} filterRequest={{ key: 3, filter: 'pending_approval' }} />)
    expect(tab('Pending')).toHaveAttribute('aria-selected', 'true')
  })

  it('ignores a status it does not know', async () => {
    renderList({ filterRequest: { key: 1, filter: 'nonsense' } })
    expect(await screen.findByText('Draft one')).toBeInTheDocument()
    expect(tab('All')).toHaveAttribute('aria-selected', 'true')
  })
})

describe('CORList draft card: Submit & send for signature', () => {
  beforeEach(() => {
    mockDb.getCORs.mockResolvedValue(cors)
    mockDb.getCORStats.mockResolvedValue(null)
    mockDb.subscribeToCORs.mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('is offered on draft cards only', async () => {
    renderList()
    await screen.findByText('Draft one')
    expect(screen.getAllByRole('button', { name: 'Submit & send for signature' })).toHaveLength(1)
  })

  it('submits, then opens the signature link generator', async () => {
    mockDb.submitCORForApproval.mockResolvedValue({ id: 'cor-1', status: 'pending_approval' })
    renderList()
    await screen.findByText('Draft one')

    fireEvent.click(screen.getByRole('button', { name: 'Submit & send for signature' }))

    const generator = await screen.findByTestId('signature-link-generator')
    expect(mockDb.submitCORForApproval).toHaveBeenCalledWith('cor-1')
    expect(generator).toHaveAttribute('data-document-id', 'cor-1')
    expect(within(generator).getByText('COR COR-001: Draft one')).toBeInTheDocument()
  })

  it('shows a toast and does not open the generator when the submit fails', async () => {
    mockDb.submitCORForApproval.mockRejectedValue(new Error('boom'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { onShowToast } = renderList()
    await screen.findByText('Draft one')

    fireEvent.click(screen.getByRole('button', { name: 'Submit & send for signature' }))

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Could not submit COR. Nothing was sent.', 'error'))
    expect(screen.queryByTestId('signature-link-generator')).not.toBeInTheDocument()
    error.mockRestore()
  })

  it('does not submit a draft that is missing its description', async () => {
    mockDb.getCORs.mockResolvedValue([cor({ scope_of_work: '' })])
    const { onShowToast } = renderList()
    await screen.findByText('Draft one')

    fireEvent.click(screen.getByRole('button', { name: 'Submit & send for signature' }))

    expect(onShowToast).toHaveBeenCalledWith('Description is required', 'error')
    expect(mockDb.submitCORForApproval).not.toHaveBeenCalled()
  })
})
