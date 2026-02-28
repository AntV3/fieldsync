// ============================================
// COR Export Pipeline
// ============================================
// Industrial-grade, idempotent, snapshot-based export system
//
// Core Principles (from specification):
// 1. Idempotency - Repeat requests return same result
// 2. Deterministic - Same COR state = same export output
// 3. Async by default - Heavy operations don't block UI
// 4. Fail loudly - All failures are detectable and recoverable
// 5. Separation of concerns - Creation, aggregation, export decoupled
//
// This module orchestrates the export pipeline:
// 1. Request export (idempotent, returns job)
// 2. Create snapshot (frozen state)
// 3. Generate PDF (from snapshot only)
// 4. Return result (stable, immutable)
// ============================================

import { supabase } from './supabase'
import { observe } from './observability'

// ============================================
// CONSTANTS
// ============================================

export const ExportStatus = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

export const ExportType = {
  PDF: 'pdf',
  EMAIL: 'email',
  DOWNLOAD: 'download'
}

// ============================================
// IDEMPOTENCY KEY GENERATION
// ============================================

/**
 * Generate a deterministic idempotency key for an export request
 * Key format: cor_{corId}_v{version}_{timestamp_minute}
 *
 * Same COR at same version within same minute = same key
 * This prevents duplicate exports while allowing re-exports after changes
 */
export function generateIdempotencyKey(corId, corVersion, customKey = null) {
  if (customKey) {
    return `custom_${customKey}`
  }

  // Round timestamp to minute for deduplication window
  const minuteTimestamp = Math.floor(Date.now() / 60000)
  return `cor_${corId}_v${corVersion || 1}_${minuteTimestamp}`
}

/**
 * Generate a forced-new idempotency key (for explicit re-exports)
 * Includes millisecond timestamp to guarantee uniqueness
 */
export function generateForcedExportKey(corId) {
  return `cor_${corId}_force_${Date.now()}`
}

// ============================================
// SNAPSHOT CREATION
// ============================================

/**
 * Create a frozen snapshot of COR data for export
 * Snapshots are immutable - once created, never change
 *
 * @param {Object} cor - Full COR data with line items
 * @param {Object[]} tickets - Associated T&M tickets with workers/items/photos
 * @param {Object} options - Snapshot options
 * @returns {Object} Frozen snapshot ready for PDF generation
 */
export function createSnapshot(cor, tickets, _options = {}) {
  const snapshotTime = new Date().toISOString()

  // Calculate photo manifest
  const photoManifest = []
  let totalPhotos = 0

  for (const ticket of (tickets || [])) {
    const ticketPhotos = ticket.photos || []
    totalPhotos += ticketPhotos.length

    for (const photoUrl of ticketPhotos) {
      photoManifest.push({
        ticketId: ticket.id,
        workDate: ticket.work_date,
        url: photoUrl,
        verified: false, // Will be verified during PDF generation
        includedInExport: true
      })
    }
  }

  // Calculate totals from line items
  const laborTotal = (cor.change_order_labor || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )
  const materialsTotal = (cor.change_order_materials || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )
  const equipmentTotal = (cor.change_order_equipment || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )
  const subcontractorsTotal = (cor.change_order_subcontractors || []).reduce(
    (sum, item) => sum + (parseInt(item.total) || 0), 0
  )

  // Calculate labor hours from tickets
  let totalLaborHours = 0
  let totalOTHours = 0
  for (const ticket of (tickets || [])) {
    for (const worker of (ticket.t_and_m_workers || [])) {
      totalLaborHours += parseFloat(worker.hours) || 0
      totalOTHours += parseFloat(worker.overtime_hours) || 0
    }
  }

  // Create deterministic checksum
  const dataString = JSON.stringify({
    corId: cor.id,
    version: cor.version,
    totals: { laborTotal, materialsTotal, equipmentTotal, subcontractorsTotal },
    ticketCount: tickets?.length || 0,
    photoCount: totalPhotos
  })

  let hash = 0
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const checksum = Math.abs(hash).toString(16).padStart(16, '0')

  return {
    // Metadata
    snapshotId: crypto.randomUUID(),
    corId: cor.id,
    corVersion: cor.version || 1,
    createdAt: snapshotTime,
    checksum,

    // Frozen COR data
    corData: {
      id: cor.id,
      cor_number: cor.cor_number,
      title: cor.title,
      description: cor.description,
      scope_of_work: cor.scope_of_work,
      status: cor.status,
      period_start: cor.period_start,
      period_end: cor.period_end,

      // Line items (frozen)
      change_order_labor: cor.change_order_labor || [],
      change_order_materials: cor.change_order_materials || [],
      change_order_equipment: cor.change_order_equipment || [],
      change_order_subcontractors: cor.change_order_subcontractors || [],

      // Percentages
      labor_markup_percent: cor.labor_markup_percent,
      materials_markup_percent: cor.materials_markup_percent,
      equipment_markup_percent: cor.equipment_markup_percent,
      subcontractors_markup_percent: cor.subcontractors_markup_percent,
      liability_insurance_percent: cor.liability_insurance_percent,
      bond_percent: cor.bond_percent,
      license_fee_percent: cor.license_fee_percent,

      // Calculated amounts (frozen)
      labor_subtotal: cor.labor_subtotal,
      materials_subtotal: cor.materials_subtotal,
      equipment_subtotal: cor.equipment_subtotal,
      subcontractors_subtotal: cor.subcontractors_subtotal,
      labor_markup_amount: cor.labor_markup_amount,
      materials_markup_amount: cor.materials_markup_amount,
      equipment_markup_amount: cor.equipment_markup_amount,
      subcontractors_markup_amount: cor.subcontractors_markup_amount,
      liability_insurance_amount: cor.liability_insurance_amount,
      bond_amount: cor.bond_amount,
      license_fee_amount: cor.license_fee_amount,
      cor_subtotal: cor.cor_subtotal,
      additional_fees_total: cor.additional_fees_total,
      cor_total: cor.cor_total,

      // Signature data
      gc_signature_data: cor.gc_signature_data,
      gc_signature_name: cor.gc_signature_name,
      gc_signature_date: cor.gc_signature_date,

      // Audit
      created_at: cor.created_at,
      submitted_at: cor.submitted_at,
      approved_at: cor.approved_at
    },

    // Frozen tickets data
    ticketsData: (tickets || []).map(ticket => ({
      id: ticket.id,
      work_date: ticket.work_date,
      ticket_date: ticket.ticket_date,
      ce_pco_number: ticket.ce_pco_number,
      notes: ticket.notes,
      status: ticket.status,
      created_at: ticket.created_at,

      // Workers (frozen)
      t_and_m_workers: (ticket.t_and_m_workers || []).map(w => ({
        id: w.id,
        name: w.name,
        role: w.role,
        labor_class: w.labor_class,
        hours: w.hours,
        overtime_hours: w.overtime_hours,
        time_started: w.time_started,
        time_ended: w.time_ended
      })),

      // Items (frozen)
      t_and_m_items: (ticket.t_and_m_items || []).map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        materials_equipment: item.materials_equipment
      })),

      // Photos (frozen URLs)
      photos: ticket.photos || [],

      // Client verification (frozen)
      client_signature_data: ticket.client_signature_data,
      client_signature_name: ticket.client_signature_name,
      client_signature_title: ticket.client_signature_title,
      client_signature_company: ticket.client_signature_company,
      client_signature_date: ticket.client_signature_date
    })),

    // Photo manifest for verification
    photoManifest,

    // Pre-calculated totals
    totals: {
      laborTotal,
      materialsTotal,
      equipmentTotal,
      subcontractorsTotal,
      totalLaborHours,
      totalOTHours,
      ticketCount: tickets?.length || 0,
      photoCount: totalPhotos,
      verifiedTicketCount: (tickets || []).filter(t => t.client_signature_data).length
    }
  }
}

// ============================================
// EXPORT JOB MANAGEMENT
// ============================================

/**
 * Request a COR export (idempotent)
 * Returns existing job if same idempotency key, otherwise creates new job
 *
 * @param {string} corId - COR ID to export
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Export job with status
 */
export async function requestExport(corId, options = {}) {
  const {
    forceNew = false,
    idempotencyKey = null,
    exportType = ExportType.PDF,
    includeBackup = true
  } = options

  try {
    // Get COR version for idempotency key
    const { data: cor, error: corError } = await supabase
      .from('change_orders')
      .select('id, version, cor_number')
      .eq('id', corId)
      .single()

    if (corError || !cor) {
      throw new Error(`COR not found: ${corId}`)
    }

    // Generate idempotency key
    const key = forceNew
      ? generateForcedExportKey(corId)
      : (idempotencyKey || generateIdempotencyKey(corId, cor.version))

    // Request export via RPC (handles idempotency in database)
    const { data, error } = await supabase.rpc('request_cor_export', {
      p_cor_id: corId,
      p_idempotency_key: key,
      p_options: { exportType, includeBackup },
      p_requested_by: (await supabase.auth.getUser())?.data?.user?.id
    })

    if (error) {
      throw error
    }

    const job = data?.[0]
    if (!job) {
      throw new Error('Failed to create export job')
    }

    observe.activity('cor_export_requested', {
      cor_id: corId,
      job_id: job.job_id,
      is_new: job.is_new,
      status: job.status
    })

    return {
      jobId: job.job_id,
      status: job.status,
      isNew: job.is_new,
      snapshotId: job.snapshot_id,
      pdfUrl: job.pdf_url,
      idempotencyKey: key
    }
  } catch (err) {
    observe.error('cor_export_request_failed', {
      cor_id: corId,
      error: err.message
    })
    throw err
  }
}

/**
 * Get export job status
 * @param {string} jobId - Export job ID
 * @returns {Promise<Object>} Job status with all details
 */
export async function getExportJobStatus(jobId) {
  const { data, error } = await supabase
    .from('cor_export_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error) {
    throw error
  }

  return data
}

/**
 * Get export history for a COR
 * @param {string} corId - COR ID
 * @param {number} limit - Max results
 * @returns {Promise<Object[]>} Export jobs ordered by date
 */
export async function getExportHistory(corId, limit = 10) {
  const { data, error } = await supabase
    .from('cor_export_jobs')
    .select('*')
    .eq('cor_id', corId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw error
  }

  return data || []
}

/**
 * Update export job status (internal use)
 * @param {string} jobId - Job ID
 * @param {string} status - New status
 * @param {Object} details - Additional details
 */
export async function updateJobStatus(jobId, status, details = {}) {
  const { data, error } = await supabase.rpc('update_export_job_status', {
    p_job_id: jobId,
    p_status: status,
    p_snapshot_id: details.snapshotId || null,
    p_pdf_url: details.pdfUrl || null,
    p_error: details.error || null,
    p_error_details: details.errorDetails || null,
    p_metrics: details.metrics || null
  })

  if (error) {
    observe.error('cor_export_job_update_failed', {
      job_id: jobId,
      status,
      error: error.message
    })
    throw error
  }

  return data
}

// ============================================
// SNAPSHOT STORAGE
// ============================================

/**
 * Save snapshot to database
 * @param {Object} snapshot - Frozen snapshot data
 * @param {string} jobId - Associated job ID
 * @returns {Promise<Object>} Saved snapshot record
 */
export async function saveSnapshot(snapshot, jobId) {
  // Mark previous snapshots as not current
  await supabase
    .from('cor_export_snapshots')
    .update({ is_current: false })
    .eq('cor_id', snapshot.corId)

  const { data, error } = await supabase
    .from('cor_export_snapshots')
    .insert({
      id: snapshot.snapshotId,
      cor_id: snapshot.corId,
      job_id: jobId,
      cor_version: snapshot.corVersion,
      cor_data: snapshot.corData,
      tickets_data: snapshot.ticketsData,
      photos_manifest: snapshot.photoManifest,
      totals_snapshot: snapshot.totals,
      checksum: snapshot.checksum,
      is_current: true,
      exported_by: (await supabase.auth.getUser())?.data?.user?.id
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  // Update COR's last snapshot version
  await supabase
    .from('change_orders')
    .update({ last_snapshot_version: snapshot.corVersion })
    .eq('id', snapshot.corId)

  return data
}

/**
 * Get current snapshot for a COR (if exists and still valid)
 * @param {string} corId - COR ID
 * @returns {Promise<Object|null>} Current snapshot or null
 */
export async function getCurrentSnapshot(corId) {
  // Get COR's current version
  const { data: cor } = await supabase
    .from('change_orders')
    .select('version, last_snapshot_version')
    .eq('id', corId)
    .single()

  // If version has changed since last snapshot, snapshot is stale
  if (cor?.version !== cor?.last_snapshot_version) {
    return null
  }

  // Get current snapshot
  const { data: snapshot } = await supabase
    .from('cor_export_snapshots')
    .select('*')
    .eq('cor_id', corId)
    .eq('is_current', true)
    .single()

  return snapshot || null
}

// ============================================
// FULL EXPORT ORCHESTRATION
// ============================================

/**
 * Execute full export pipeline
 * This is the main entry point for COR exports
 *
 * Pipeline:
 * 1. Request export (idempotent)
 * 2. If new job, create snapshot
 * 3. Generate PDF from snapshot
 * 4. Update job with result
 *
 * @param {string} corId - COR to export
 * @param {Object} cor - Full COR data (optional, will fetch if not provided)
 * @param {Object[]} tickets - Associated tickets (optional, will fetch if not provided)
 * @param {Object} project - Project data
 * @param {Object} company - Company data
 * @param {Object} branding - Company branding
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Export result
 */
export async function executeExport(corId, { cor, tickets, project, company, branding, options = {} } = {}) {
  let job = null

  try {
    // Step 1: Request export (idempotent)
    job = await requestExport(corId, options)

    // If job already completed, return existing result
    if (job.status === ExportStatus.COMPLETED && job.pdfUrl) {
      observe.activity('cor_export_cache_hit', {
        cor_id: corId,
        job_id: job.jobId
      })
      return {
        success: true,
        jobId: job.jobId,
        cached: true,
        pdfUrl: job.pdfUrl
      }
    }

    // If job is already generating, return job for polling
    if (job.status === ExportStatus.GENERATING) {
      return {
        success: true,
        jobId: job.jobId,
        status: ExportStatus.GENERATING,
        message: 'Export already in progress'
      }
    }

    // Step 2: Mark job as generating
    await updateJobStatus(job.jobId, ExportStatus.GENERATING)

    // Step 3: Fetch data if not provided
    if (!cor) {
      const { db } = await import('./supabase')
      cor = await db.getCORById(corId)
    }

    if (!tickets && options.includeBackup !== false) {
      const { db } = await import('./supabase')
      tickets = await db.getCORTickets(corId)
    }

    // Step 4: Create snapshot
    const snapshot = createSnapshot(cor, tickets, options)
    const savedSnapshot = await saveSnapshot(snapshot, job.jobId)

    // Step 5: Generate PDF from snapshot
    // Import the PDF generator dynamically to avoid circular deps
    const { generatePDFFromSnapshot } = await import('./corPdfGenerator')
    const pdfResult = await generatePDFFromSnapshot(
      snapshot,
      { project, company, branding }
    )

    // Step 6: Update job as completed
    await updateJobStatus(job.jobId, ExportStatus.COMPLETED, {
      snapshotId: savedSnapshot.id,
      pdfUrl: pdfResult.fileName,
      metrics: {
        photo_count: snapshot.totals.photoCount,
        ticket_count: snapshot.totals.ticketCount,
        page_count: pdfResult.pageCount || 1,
        pdf_size_bytes: pdfResult.sizeBytes || 0
      }
    })

    observe.activity('cor_export_completed', {
      cor_id: corId,
      job_id: job.jobId,
      photo_count: snapshot.totals.photoCount,
      ticket_count: snapshot.totals.ticketCount
    })

    return {
      success: true,
      jobId: job.jobId,
      snapshotId: savedSnapshot.id,
      fileName: pdfResult.fileName,
      snapshot: snapshot.totals
    }

  } catch (err) {
    // Update job as failed
    if (job?.jobId) {
      await updateJobStatus(job.jobId, ExportStatus.FAILED, {
        error: err.message,
        errorDetails: { stack: err.stack }
      }).catch(() => {}) // Don't throw on status update failure
    }

    observe.error('cor_export_failed', {
      cor_id: corId,
      job_id: job?.jobId,
      error: err.message
    })

    throw err
  }
}

// ============================================
// EXPORTS
// ============================================

export default {
  // Constants
  ExportStatus,
  ExportType,

  // Key generation
  generateIdempotencyKey,
  generateForcedExportKey,

  // Snapshot
  createSnapshot,
  saveSnapshot,
  getCurrentSnapshot,

  // Job management
  requestExport,
  getExportJobStatus,
  getExportHistory,
  updateJobStatus,

  // Full pipeline
  executeExport
}
