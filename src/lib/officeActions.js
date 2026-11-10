/**
 * Office quick actions.
 *
 * Pure description of what the office has to do next, in workflow order:
 * review signed tickets -> build a COR from approved tickets -> send the COR
 * -> wait on the client. OfficeQuickActions renders it; nothing here fetches.
 *
 * `counts` is one project's entry (project scope) or the company totals
 * (portfolio scope) from useOfficeQueue. Pass null while the counts are not
 * known yet: rows then carry no count and nothing claims to be caught up.
 */

export const EMPTY_QUEUE_COUNTS = Object.freeze({
  readyToApprove: 0,
  awaitingSignature: 0,
  readyForCOR: 0,
  draftCORs: 0,
  returnedCORs: 0,
  withClient: 0,
  oldestWithClientAt: null
})

/** The rows that carry a count, and the count each one shows. */
export const COUNTED_ROWS = Object.freeze({
  review: 'readyToApprove',
  buildCor: 'readyForCOR',
  sendCor: 'draftCORs',
  returned: 'returnedCORs',
  waiting: 'withClient'
})

/** Rows that act on one project, so portfolio scope has to name it first. */
export const ROWS_NEEDING_PROJECT = Object.freeze(['review', 'buildCor', 'sendCor', 'returned', 'waiting', 'newCor'])

const DAY_MS = 24 * 60 * 60 * 1000
const WAITING_WARN_DAYS = 7
const NOTHING_WAITING = 'Nothing waiting'

const num = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** Count shown on a row for the given counts (0 for rows without a count). */
export function getRowCount(rowId, counts) {
  const key = COUNTED_ROWS[rowId]
  return key ? num(counts?.[key]) : 0
}

/**
 * Portfolio scope: the project a row should open without asking, or null when
 * the user has to pick. `projects` are { id, name, counts } entries.
 */
export function pickProjectForRow(rowId, projects = []) {
  if (projects.length === 1) return projects[0]
  if (!COUNTED_ROWS[rowId]) return null
  const withItems = projects.filter(project => getRowAttention(rowId, project.counts) > 0)
  return withItems.length === 1 ? withItems[0] : null
}

/** What a row has for the office to look at: its count, plus unsigned tickets for review. */
export function getRowAttention(rowId, counts) {
  const extra = rowId === 'review' ? num(counts?.awaitingSignature) : 0
  return getRowCount(rowId, counts) + extra
}

/** True when nothing is waiting, including tickets still missing the client signature. */
export function isCaughtUp(counts) {
  if (!counts) return false
  return Object.keys(COUNTED_ROWS).every(rowId => getRowAttention(rowId, counts) === 0)
}

/** Whole days since the oldest COR went to the client, or null when unknown. */
export function daysWaitingOnClient(counts, now = Date.now()) {
  if (!counts?.oldestWithClientAt) return null
  const sent = new Date(counts.oldestWithClientAt).getTime()
  if (!Number.isFinite(sent)) return null
  return Math.max(0, Math.floor((now - sent) / DAY_MS))
}

function reviewSubtitle(ready, awaiting) {
  const waitingOnSignature = `${awaiting} waiting on client signature`
  if (ready > 0) {
    return awaiting > 0
      ? `Signed by client, ready for approval · ${waitingOnSignature}`
      : 'Signed by client, ready for approval'
  }
  return awaiting > 0 ? waitingOnSignature : NOTHING_WAITING
}

function waitingSubtitle(withClient, days) {
  if (withClient === 0) return NOTHING_WAITING
  if (days === null) return 'Sent for signature'
  if (days === 0) return 'Oldest sent today'
  return `Oldest sent ${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * @param {Object} options
 * @param {'portfolio'|'project'} options.scope
 * @param {Object|null} options.counts - see EMPTY_QUEUE_COUNTS; null = not loaded
 * @param {boolean} [options.isAdmin] - accepted but not read yet: every office
 *   user gets the same rows until per-user approval permissions exist
 * @param {number} [options.now] - ms timestamp, injectable for tests
 * @returns {{ badge: number|'dot'|null, rows: Array, footer: Array }}
 */
export function getOfficeQuickActions({ scope = 'project', counts = null, now = Date.now() } = {}) {
  const known = Boolean(counts)
  const ready = num(counts?.readyToApprove)
  const awaiting = num(counts?.awaitingSignature)
  const readyForCOR = num(counts?.readyForCOR)
  const drafts = num(counts?.draftCORs)
  const returned = num(counts?.returnedCORs)
  const withClient = num(counts?.withClient)
  const days = withClient > 0 ? daysWaitingOnClient(counts, now) : null

  const counted = (id, label, count, subtitle, fallback, tone = 'default') => ({
    id,
    label,
    count: known ? count : null,
    subtitle: known ? subtitle : fallback,
    tone,
    dimmed: known && count === 0 && !(id === 'review' && awaiting > 0)
  })

  const rows = [
    counted('review', 'Review tickets', ready,
      reviewSubtitle(ready, awaiting), 'Signed by client, ready for approval'),
    counted('buildCor', 'Build COR from tickets', readyForCOR,
      readyForCOR > 0 ? 'Approved tickets not on a COR yet' : NOTHING_WAITING, 'Approved tickets not on a COR yet'),
    counted('sendCor', 'Send COR', drafts,
      drafts > 0 ? 'Drafts to finish and send for signature' : NOTHING_WAITING, 'Drafts to finish and send for signature'),
    counted('returned', 'Returned by client', returned,
      returned > 0 ? 'Sent back with comments. Revise and resend.' : NOTHING_WAITING, 'Sent back with comments'),
    counted('waiting', 'Waiting on client', withClient,
      waitingSubtitle(withClient, days), 'CORs sent for signature',
      days !== null && days > WAITING_WARN_DAYS ? 'warn' : 'default'),
    { id: 'newCor', label: 'New COR', count: null, subtitle: 'Start a change order request', tone: 'default', dimmed: false },
    { id: 'search', label: 'Find a ticket or COR', count: null, subtitle: 'Search every project', tone: 'default', dimmed: false }
  ]

  const footer = scope === 'portfolio'
    ? [{ id: 'newProject', label: 'New project' }]
    : [
        {
          id: 'fieldEntry',
          label: 'Field entry',
          children: [
            { id: 'tmTicket', label: 'T&M ticket' },
            { id: 'dailyReport', label: 'Daily report' }
          ]
        },
        { id: 'corLog', label: 'COR log' }
      ]

  let badge = null
  if (ready > 0) badge = ready
  else if (awaiting > 0 || readyForCOR > 0 || drafts > 0 || returned > 0 || withClient > 0) badge = 'dot'

  return { badge, rows, footer }
}
