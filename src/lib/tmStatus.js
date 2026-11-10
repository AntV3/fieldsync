/**
 * T&M ticket status vocabulary.
 *
 * Lifecycle: pending → foreman_signed → client_signed → approved → billed
 *                                   ↘ rejected
 *
 * Every field-submitted ticket is foreman-signed before it reaches the office,
 * so "waiting for the office" must include the signed states, not just
 * `pending`. Use these helpers instead of comparing to 'pending' directly.
 */

export const TM_STATUS = Object.freeze({
  PENDING: 'pending',
  FOREMAN_SIGNED: 'foreman_signed',
  CLIENT_SIGNED: 'client_signed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  BILLED: 'billed'
})

/** Statuses the office still has to act on. */
export const TM_AWAITING_APPROVAL_STATUSES = Object.freeze([
  TM_STATUS.PENDING,
  TM_STATUS.FOREMAN_SIGNED,
  TM_STATUS.CLIENT_SIGNED
])

export function isAwaitingApproval(status) {
  return TM_AWAITING_APPROVAL_STATUSES.includes(status)
}

/** A ticket carries an authorization from the paying party. */
export function hasClientAuthorization(ticket) {
  return Boolean(ticket?.client_signature_data || ticket?.gc_signature_data)
}

/**
 * Does a ticket belong under a status filter tab? 'pending' is the office's
 * "To review" queue, so it covers every status still awaiting approval.
 */
export function matchesStatusFilter(ticket, filter) {
  if (filter === 'all') return true
  if (filter === TM_STATUS.PENDING) return isAwaitingApproval(ticket?.status)
  return ticket?.status === filter
}

/** The office may only approve a ticket the client has signed. */
export function canApproveTicket(ticket) {
  if (!isAwaitingApproval(ticket?.status)) return false
  return ticket.status === TM_STATUS.CLIENT_SIGNED || hasClientAuthorization(ticket)
}

const reviewTime = (ticket) => {
  const time = new Date(ticket?.work_date || ticket?.created_at || 0).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** "To review" order: tickets the office can approve now first, then oldest first. */
export function sortTicketsForReview(tickets) {
  return [...(tickets || [])].sort((a, b) => {
    const ready = Number(canApproveTicket(b)) - Number(canApproveTicket(a))
    if (ready !== 0) return ready
    const byDate = reviewTime(a) - reviewTime(b)
    if (byDate !== 0) return byDate
    return String(a?.created_at || '').localeCompare(String(b?.created_at || ''))
  })
}

/** Any of the three signature slots (foreman, client, GC) is filled. */
export function hasAnySignature(ticket) {
  return Boolean(
    ticket?.foreman_signature_data ||
    ticket?.client_signature_data ||
    ticket?.gc_signature_data
  )
}

/** COR statuses under which a linked T&M ticket may still be edited. */
export const TM_COR_STATUSES_ALLOWING_TICKET_EDIT = Object.freeze(['draft', 'pending_approval'])

export const TM_BILLED_EDIT_REASON = 'This ticket has been billed and can no longer be edited.'

const linkedCorLabel = (ticket, lockInfo) =>
  lockInfo?.lockedBy?.cor_number ||
  ticket?.cor_number ||
  ticket?.assigned_cor?.cor_number ||
  ticket?.change_orders?.cor_number ||
  'the linked COR'

/**
 * Can the office edit this ticket's contents, and what should it be told first?
 * The server (update_tm_ticket_contents) enforces the same rules; this only
 * drives the UI.
 *
 * @param {Object} ticket - t_and_m_tickets row
 * @param {Object} [lockInfo] - result of db.isTicketEditable(ticket):
 *   { editable, lockedBy: { id, status, cor_number } | null, reason }
 * @returns {{ editable: boolean, locked: boolean, reason: string|null,
 *   warnings: string[], flagsAfterSignature: boolean }}
 */
export function getTicketEditability(ticket, lockInfo) {
  const flagsAfterSignature = hasAnySignature(ticket)

  if (lockInfo?.editable === false) {
    return {
      editable: false,
      locked: true,
      reason: lockInfo.reason ?? null,
      warnings: [],
      flagsAfterSignature
    }
  }

  if (ticket?.status === TM_STATUS.BILLED) {
    return {
      editable: false,
      locked: false,
      reason: TM_BILLED_EDIT_REASON,
      warnings: [],
      flagsAfterSignature
    }
  }

  const warnings = []
  if (flagsAfterSignature) {
    warnings.push('Saving will mark this ticket "Edited after signature".')
  }
  if (ticket?.assigned_cor_id) {
    warnings.push(`Crew and material changes re-sync this ticket's lines on ${linkedCorLabel(ticket, lockInfo)} at current rates.`)
  }
  if (ticket?.status === TM_STATUS.APPROVED) {
    warnings.push('This ticket is approved. Changing crew or materials can change its billable value.')
  }

  return { editable: true, locked: false, reason: null, warnings, flagsAfterSignature }
}

export const TM_REJECTION_REASON_MAX = 500
export const TM_REJECTION_REASON_REQUIRED = 'Enter a reason so the foreman knows what to fix.'
export const TM_REJECTION_REASON_TOO_LONG = 'Keep the reason under 500 characters.'

/**
 * Check the reason the office typed when rejecting a ticket. The foreman sees
 * it on the field home screen, so an empty reason is not allowed.
 *
 * @param {string|null|undefined} input - window.prompt result (null = cancelled)
 * @returns {{ ok: true, reason: string }
 *   | { ok: false, error: string }
 *   | { ok: false, cancelled: true }}
 */
export function validateRejectionReason(input) {
  if (input === null || input === undefined) {
    return { ok: false, cancelled: true }
  }
  const reason = String(input).trim()
  if (!reason) {
    return { ok: false, error: TM_REJECTION_REASON_REQUIRED }
  }
  if (reason.length > TM_REJECTION_REASON_MAX) {
    return { ok: false, error: TM_REJECTION_REASON_TOO_LONG }
  }
  return { ok: true, reason }
}
