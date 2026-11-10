/**
 * Turn a realtime T&M ticket event into an office notice.
 *
 * The office wants to hear about two moments: a ticket arriving from the
 * field, and the client signing one (it is then ready to approve). Realtime
 * UPDATE payloads do not reliably carry the previous status, so `seen`
 * remembers what was already announced and each moment is announced once.
 *
 * @param {Object} payload - Supabase postgres_changes payload
 * @param {Set<string>} seen - mutated: keys of notices already produced
 * @returns {{ key: string, kind: 'new'|'signed', ticketId: string, projectId: string } | null}
 */
export function ticketNoticeFromEvent(payload, seen) {
  const row = payload?.new
  if (!row?.id || !row.project_id) return null

  let kind = null
  if (row.status === 'client_signed') {
    kind = 'signed'
  } else if (payload.eventType === 'INSERT' && ['pending', 'foreman_signed'].includes(row.status)) {
    kind = 'new'
  }
  if (!kind) return null

  const key = `${row.id}:${kind}`
  if (seen.has(key)) return null
  seen.add(key)
  // A ticket that arrives already signed should not be announced again as new
  if (kind === 'signed') seen.add(`${row.id}:new`)

  return { key, kind, ticketId: row.id, projectId: row.project_id }
}

export function ticketNoticeText(notice, projectName) {
  const where = projectName ? ` on ${projectName}` : ''
  return notice.kind === 'signed'
    ? `Client signed a ticket${where}. It is ready to approve.`
    : `New ticket from the field${where}.`
}
