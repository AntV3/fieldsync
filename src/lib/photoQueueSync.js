/**
 * Keeps the offline photo queue moving: uploads queued photos as soon as
 * their ticket has synced, and again whenever the phone comes back online or
 * the app returns to the foreground.
 */
import { onSyncStateChange } from './offlineManager'
import { drainPhotoQueue, markTicketSynced } from './photoQueue'

let started = false
let listeners = []

/**
 * @param {Object} db - the db facade (uploadPhoto, appendTMTicketPhotos,
 *   getTicketIdsBySubmissionIds)
 * @param {(result: { uploaded, failed, waiting }) => void} [onDrained]
 */
export function startPhotoQueueSync(db, onDrained) {
  if (started) return stopPhotoQueueSync
  started = true

  const drain = () => drainPhotoQueue({
    upload: (companyId, projectId, ticketId, file) => db.uploadPhoto(companyId, projectId, ticketId, file),
    attach: (ticketId, urls, locations) => db.appendTMTicketPhotos(ticketId, urls, locations),
    resolveTicketIds: (ids) => db.getTicketIdsBySubmissionIds(ids)
  }).then(result => {
    if (result.uploaded > 0 || result.failed > 0) onDrained?.(result)
    return result
  }).catch(err => {
    console.error('[photoQueue] drain failed', err)
  })

  const unsubscribe = onSyncStateChange((event) => {
    if (event?.type !== 'ticket_synced' || !event.ticket?.id) return
    markTicketSynced(event.client_submission_id, event.ticket.id).then(drain).catch(() => {})
  })
  const onOnline = () => { drain() }
  const onVisible = () => { if (document.visibilityState === 'visible' && navigator.onLine !== false) drain() }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  listeners = [
    unsubscribe,
    () => window.removeEventListener('online', onOnline),
    () => document.removeEventListener('visibilitychange', onVisible)
  ]

  if (navigator.onLine !== false) drain()
  return stopPhotoQueueSync
}

export function stopPhotoQueueSync() {
  listeners.forEach(off => { try { off() } catch (_e) { /* ignore */ } })
  listeners = []
  started = false
}
