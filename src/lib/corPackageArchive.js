/**
 * Keep a copy of a change order package in the project's Documents.
 *
 * The package (COR summary plus every backup ticket with crew, hours,
 * materials, photos and signatures) used to exist only as a file on the
 * device of whoever pressed Export. This generates the same PDF and stores
 * it through the Documents module, linked to the COR, so the version that
 * went to the client is on record.
 */
import { createSnapshot } from './corExportPipeline'

export const PACKAGE_MAX_BYTES = 25 * 1024 * 1024 // the documents bucket's per-file limit

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Document name shown in the Documents tab. */
export function packageDocumentName(cor, label = 'sent') {
  const revision = Number(cor?.revision_number) > 1 ? ` rev ${cor.revision_number}` : ''
  return `${cor?.cor_number || 'COR'}${revision} package (${label} ${today()})`
}

/**
 * @param {Object} options
 * @param {Object} options.cor - the full COR (with its line items)
 * @param {Array} options.tickets - backup tickets with resolved photos
 * @param {Object} options.project
 * @param {Object} options.company
 * @param {Object} options.db - the db facade (uploadDocument)
 * @param {string} [options.label] - 'sent' | 'signed'
 * @returns {Promise<{ document: Object, sizeBytes: number }>}
 * @throws when the PDF cannot be generated, is too large, or cannot be stored
 */
export async function archiveCORPackage({ cor, tickets = [], project, company, db, label = 'sent' }) {
  if (!cor?.id || !project?.id || !company?.id) {
    throw new Error('Missing change order, project or company')
  }

  const { generatePDFFromSnapshot } = await import('./corPdfGenerator')
  const snapshot = createSnapshot(cor, tickets)
  const result = await generatePDFFromSnapshot(snapshot, {
    project,
    company,
    branding: { logoUrl: company.logo_url, primaryColor: company.branding_color },
    output: 'blob'
  })
  if (!result?.blob) throw new Error('The package PDF could not be generated')
  if (result.blob.size > PACKAGE_MAX_BYTES) {
    const err = new Error('The package is larger than 25 MB and could not be saved to Documents. Export it and keep the file.')
    err.code = 'PACKAGE_TOO_LARGE'
    throw err
  }

  const file = new File([result.blob], result.fileName, { type: 'application/pdf' })
  const document = await db.uploadDocument(company.id, project.id, file, {
    name: packageDocumentName(cor, label),
    description: `Change order package as ${label} to the client. Generated automatically.`,
    category: 'general',
    tags: ['change-order', 'package'],
    visibility: 'office_only',
    resourceType: 'cor',
    resourceId: cor.id
  })
  return { document, sizeBytes: result.blob.size }
}
