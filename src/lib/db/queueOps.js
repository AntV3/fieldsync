/**
 * Office work-queue counts.
 * What is waiting on the office, per project, across the whole company:
 * tickets to approve, approved tickets to put on a COR, CORs to send, and
 * CORs out with the client.
 */

import { supabase, isSupabaseConfigured, observe } from './client'

// PostgREST returns at most 1000 rows per request by default, so each query
// is read in pages. MAX_PAGES caps one query at 5000 open rows; a company
// past that gets an undercount rather than a slow dashboard.
const PAGE_SIZE = 1000
const MAX_PAGES = 5

const AWAITING_SIGNATURE_STATUSES = ['pending', 'foreman_signed']

const emptyCounts = () => ({
  readyToApprove: 0,
  awaitingSignature: 0,
  readyForCOR: 0,
  draftCORs: 0,
  withClient: 0,
  oldestWithClientAt: null
})

async function fetchAllPages(buildQuery) {
  const rows = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await buildQuery().order('id').range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

export const queueOps = {
  /**
   * @param {string} companyId
   * @param {Object} [options]
   * @param {boolean} [options.throwOnError] - rethrow instead of returning {}
   *   (lets a caller keep its last good counts rather than show zeros)
   * @returns {Promise<Object>} projectId -> { readyToApprove, awaitingSignature,
   *   readyForCOR, draftCORs, withClient, oldestWithClientAt }
   */
  async getOfficeQueueCounts(companyId, { throwOnError = false } = {}) {
    if (!isSupabaseConfigured || !companyId) return {}

    const start = performance.now()
    try {
      const [openTickets, unassignedApproved, openCORs] = await Promise.all([
        // Tickets the office or the client still has to act on
        fetchAllPages(() => supabase
          .from('t_and_m_tickets')
          .select('id, project_id, status, projects!inner(company_id)')
          .eq('projects.company_id', companyId)
          .in('status', [...AWAITING_SIGNATURE_STATUSES, 'client_signed'])),

        // Approved tickets that are not on a COR yet
        fetchAllPages(() => supabase
          .from('t_and_m_tickets')
          .select('id, project_id, projects!inner(company_id)')
          .eq('projects.company_id', companyId)
          .eq('status', 'approved')
          .is('assigned_cor_id', null)),

        // CORs still to send (draft) or out with the client (pending_approval)
        fetchAllPages(() => supabase
          .from('change_orders')
          .select('id, project_id, status, submitted_at, updated_at, created_at, projects!inner(company_id)')
          .eq('projects.company_id', companyId)
          .in('status', ['draft', 'pending_approval']))
      ])

      const byProject = {}
      const entry = (projectId) => {
        if (!byProject[projectId]) byProject[projectId] = emptyCounts()
        return byProject[projectId]
      }

      for (const ticket of openTickets) {
        if (!ticket.project_id) continue
        if (ticket.status === 'client_signed') entry(ticket.project_id).readyToApprove += 1
        else entry(ticket.project_id).awaitingSignature += 1
      }

      for (const ticket of unassignedApproved) {
        if (ticket.project_id) entry(ticket.project_id).readyForCOR += 1
      }

      for (const cor of openCORs) {
        if (!cor.project_id) continue
        const counts = entry(cor.project_id)
        if (cor.status === 'draft') {
          counts.draftCORs += 1
          continue
        }
        counts.withClient += 1
        // submitted_at is stamped when the COR is sent for approval; older rows
        // may lack it, so fall back to the last change, then creation.
        const sentAt = cor.submitted_at || cor.updated_at || cor.created_at || null
        if (sentAt && (!counts.oldestWithClientAt || new Date(sentAt) < new Date(counts.oldestWithClientAt))) {
          counts.oldestWithClientAt = sentAt
        }
      }

      const duration = Math.round(performance.now() - start)
      observe.query('getOfficeQueueCounts', {
        duration,
        rows: openTickets.length + unassignedApproved.length + openCORs.length,
        company_id: companyId
      })

      return byProject
    } catch (error) {
      console.error('Error loading office queue counts:', error)
      observe.error('database', { message: error?.message, operation: 'getOfficeQueueCounts', company_id: companyId })
      if (throwOnError) throw error
      return {}
    }
  }
}
