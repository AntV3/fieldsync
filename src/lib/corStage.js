/**
 * Where a change order stands, in the words the office and the client use.
 *
 * The database status has six values; two more states are derived:
 *   - voided:   voided_at is set (the status is then 'closed')
 *   - returned: the client sent it back for changes (status 'rejected')
 * "With client" is 'pending_approval': a COR is approved only by the client.
 */

const DAY_MS = 24 * 60 * 60 * 1000
export const WITH_CLIENT_WARN_DAYS = 7

export const COR_STAGES = Object.freeze({
  draft: { label: 'Draft', tone: 'neutral' },
  with_client: { label: 'With client', tone: 'warning' },
  returned: { label: 'Returned by client', tone: 'danger' },
  approved: { label: 'Approved', tone: 'success' },
  billed: { label: 'Billed', tone: 'info' },
  closed: { label: 'Closed', tone: 'neutral' },
  voided: { label: 'Voided', tone: 'neutral' }
})

export function corStageId(cor) {
  if (!cor) return 'draft'
  if (cor.voided_at) return 'voided'
  switch (cor.status) {
    case 'pending_approval': return 'with_client'
    case 'rejected': return 'returned'
    case 'approved': return 'approved'
    case 'billed': return 'billed'
    case 'closed': return 'closed'
    default: return 'draft'
  }
}

/** Whole days the COR has been with the client, or null when unknown. */
export function daysWithClient(cor, now = Date.now()) {
  if (corStageId(cor) !== 'with_client') return null
  const sent = cor.sent_to_client_at || cor.submitted_at
  if (!sent) return null
  const time = new Date(sent).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now - time) / DAY_MS))
}

/**
 * @returns {{ id: string, label: string, tone: string, detail: string|null, overdue: boolean }}
 */
export function corStage(cor, now = Date.now()) {
  const id = corStageId(cor)
  const base = COR_STAGES[id]
  let detail = null
  let overdue = false

  if (id === 'with_client') {
    const days = daysWithClient(cor, now)
    if (days !== null) {
      detail = days === 0 ? 'Sent today' : `Sent ${days} day${days === 1 ? '' : 's'} ago`
      overdue = days > WITH_CLIENT_WARN_DAYS
    }
  } else if (id === 'returned') {
    detail = String(cor.rejection_reason ?? '').trim() || null
  } else if (id === 'voided') {
    detail = String(cor.void_reason ?? '').trim() || null
  }

  return { id, label: base.label, tone: base.tone, detail, overdue }
}

/** The stages a client sees in the portal, in display order. */
export const CLIENT_PORTAL_GROUPS = Object.freeze([
  { id: 'with_client', title: 'Waiting for your signature' },
  { id: 'returned', title: 'Returned for changes' },
  { id: 'approved', title: 'Approved' },
  { id: 'voided', title: 'Voided' },
  { id: 'closed', title: 'Closed' }
])
