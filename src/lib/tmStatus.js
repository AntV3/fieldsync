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
