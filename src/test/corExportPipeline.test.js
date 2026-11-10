import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockSupabase, mockDb, generatePDFFromSnapshot, jobRow } = vi.hoisted(() => {
  const jobRow = { current: null }

  // Chainable stand-in for supabase.from(...): every call resolves to `result`
  const chain = (result) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      update: () => builder,
      insert: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    }
    return builder
  }

  const mockSupabase = {
    from: vi.fn((table) => {
      if (table === 'change_orders') return chain({ data: { id: 'cor-1', version: 3, cor_number: 'COR-001' }, error: null })
      if (table === 'cor_export_snapshots') return chain({ data: { id: 'snap-saved' }, error: null })
      return chain({ data: null, error: null })
    }),
    rpc: vi.fn(async (name) => {
      if (name === 'request_cor_export') return { data: [jobRow.current], error: null }
      return { data: {}, error: null }
    }),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) }
  }

  return {
    mockSupabase,
    mockDb: {
      getAllLaborClassRates: vi.fn(async () => []),
      getLaborRates: vi.fn(async () => []),
      resolvePhotoUrls: vi.fn(async (photos) => photos)
    },
    generatePDFFromSnapshot: vi.fn(),
    jobRow
  }
})

vi.mock('../lib/supabase', () => ({
  supabase: mockSupabase,
  db: mockDb,
  isSupabaseConfigured: true
}))

vi.mock('../lib/observability', () => ({
  observe: { activity: vi.fn(), error: vi.fn(), query: vi.fn() }
}))

vi.mock('../lib/corPdfGenerator', () => ({
  generatePDFFromSnapshot
}))

import { executeExport, ExportStatus } from '../lib/corExportPipeline'

const cor = {
  id: 'cor-1',
  version: 3,
  cor_number: 'COR-001',
  title: 'Extra demo',
  change_order_labor: [],
  change_order_materials: [],
  change_order_equipment: [],
  change_order_subcontractors: []
}

const context = { cor, tickets: [], project: { id: 'p1' }, company: { id: 'c1' }, branding: {} }

const statusUpdates = () =>
  mockSupabase.rpc.mock.calls
    .filter(([name]) => name === 'update_export_job_status')
    .map(([, args]) => args.p_status)

describe('executeExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generatePDFFromSnapshot.mockResolvedValue({ success: true, fileName: 'COR-001_export.pdf', pageCount: 2, sizeBytes: 1234 })
  })

  it('generates the file and completes a new job', async () => {
    jobRow.current = { job_id: 'job-1', status: 'pending', is_new: true, snapshot_id: null, pdf_url: null }

    const result = await executeExport('cor-1', context)

    expect(generatePDFFromSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ success: true, jobId: 'job-1', fileName: 'COR-001_export.pdf' })
    expect(result.cached).toBeUndefined()
    expect(statusUpdates()).toEqual([ExportStatus.GENERATING, ExportStatus.COMPLETED])
  })

  it('generates the file again when the job is already completed', async () => {
    jobRow.current = { job_id: 'job-1', status: 'completed', is_new: false, snapshot_id: 'snap-1', pdf_url: 'COR-001_export.pdf' }

    const result = await executeExport('cor-1', context)

    expect(generatePDFFromSnapshot).toHaveBeenCalledTimes(1)
    expect(generatePDFFromSnapshot.mock.calls[0][0].corData.cor_number).toBe('COR-001')
    expect(result).toMatchObject({
      success: true,
      jobId: 'job-1',
      cached: true,
      snapshotId: 'snap-1',
      fileName: 'COR-001_export.pdf'
    })
    // The completed job and its snapshot are left as they are
    expect(statusUpdates()).toEqual([])
    expect(mockSupabase.from).not.toHaveBeenCalledWith('cor_export_snapshots')
  })

  it('generates the file when the job is reported as generating', async () => {
    jobRow.current = { job_id: 'job-1', status: 'generating', is_new: false, snapshot_id: null, pdf_url: null }

    const result = await executeExport('cor-1', context)

    expect(generatePDFFromSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ success: true, cached: true, fileName: 'COR-001_export.pdf' })
    expect(statusUpdates()).toEqual([])
  })

  it('does not mark a reused job as failed when regeneration fails', async () => {
    jobRow.current = { job_id: 'job-1', status: 'completed', is_new: false, snapshot_id: 'snap-1', pdf_url: 'COR-001_export.pdf' }
    generatePDFFromSnapshot.mockRejectedValue(new Error('render failed'))

    await expect(executeExport('cor-1', context)).rejects.toThrow('render failed')
    expect(statusUpdates()).toEqual([])
  })

  it('marks its own job as failed when generation fails', async () => {
    jobRow.current = { job_id: 'job-2', status: 'pending', is_new: true, snapshot_id: null, pdf_url: null }
    generatePDFFromSnapshot.mockRejectedValue(new Error('render failed'))

    await expect(executeExport('cor-1', context)).rejects.toThrow('render failed')
    expect(statusUpdates()).toEqual([ExportStatus.GENERATING, ExportStatus.FAILED])
  })
})
