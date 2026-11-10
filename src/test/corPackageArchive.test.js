import { describe, it, expect, vi, beforeEach } from 'vitest'

const { generatePDFFromSnapshot } = vi.hoisted(() => ({ generatePDFFromSnapshot: vi.fn() }))
vi.mock('../lib/corPdfGenerator', () => ({ generatePDFFromSnapshot }))
vi.mock('../lib/corExportPipeline', () => ({
  createSnapshot: (cor, tickets) => ({ corData: cor, tickets })
}))

import { archiveCORPackage, packageDocumentName, PACKAGE_MAX_BYTES } from '../lib/corPackageArchive'

const cor = { id: 'cor-1', cor_number: 'COR-007', revision_number: 2 }
const project = { id: 'p1', job_number: '2201' }
const company = { id: 'c1', logo_url: 'logo.png', branding_color: '#123456' }

describe('archiveCORPackage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('generates the package as a blob and stores it in Documents, linked to the COR', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    generatePDFFromSnapshot.mockResolvedValue({ success: true, fileName: 'COR-007_2201_with_backup.pdf', blob })
    const db = { uploadDocument: vi.fn().mockResolvedValue({ id: 'doc-1' }) }

    const result = await archiveCORPackage({ cor, tickets: [{ id: 't1' }], project, company, db })

    expect(generatePDFFromSnapshot).toHaveBeenCalledWith(
      { corData: cor, tickets: [{ id: 't1' }] },
      expect.objectContaining({ output: 'blob', project, company, branding: { logoUrl: 'logo.png', primaryColor: '#123456' } })
    )
    const [companyId, projectId, file, metadata] = db.uploadDocument.mock.calls[0]
    expect([companyId, projectId]).toEqual(['c1', 'p1'])
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('COR-007_2201_with_backup.pdf')
    expect(file.type).toBe('application/pdf')
    expect(metadata).toMatchObject({ resourceType: 'cor', resourceId: 'cor-1', visibility: 'office_only' })
    expect(metadata.name).toMatch(/^COR-007 rev 2 package \(sent .+\)$/)
    expect(result.document).toEqual({ id: 'doc-1' })
  })

  it('refuses a package over the 25 MB file limit without uploading', async () => {
    generatePDFFromSnapshot.mockResolvedValue({ fileName: 'big.pdf', blob: { size: PACKAGE_MAX_BYTES + 1 } })
    const db = { uploadDocument: vi.fn() }
    await expect(archiveCORPackage({ cor, project, company, db })).rejects.toMatchObject({ code: 'PACKAGE_TOO_LARGE' })
    expect(db.uploadDocument).not.toHaveBeenCalled()
  })

  it('fails clearly when the PDF could not be generated or details are missing', async () => {
    generatePDFFromSnapshot.mockResolvedValue({ fileName: 'x.pdf' })
    await expect(archiveCORPackage({ cor, project, company, db: { uploadDocument: vi.fn() } })).rejects.toThrow('could not be generated')
    await expect(archiveCORPackage({ cor: {}, project, company, db: {} })).rejects.toThrow('Missing')
  })

  it('names a first revision without a revision suffix', () => {
    expect(packageDocumentName({ cor_number: 'COR-001', revision_number: 1 }, 'signed')).toMatch(/^COR-001 package \(signed .+\)$/)
  })
})
