/**
 * Offline photo queue for T&M tickets.
 *
 * A ticket saved on the phone (no signal) used to lose its photos: they
 * lived only in memory. Here they are written to IndexedDB at save time,
 * keyed by the ticket's client_submission_id, and uploaded once the ticket
 * itself has synced and has a server id. They survive the app being closed.
 *
 * Photos are stored as ArrayBuffers (not Blobs), which every IndexedDB
 * implementation round-trips reliably.
 *
 * Kept in its own database so the main offline store's schema and version
 * are untouched.
 */

const DB_NAME = 'fieldsync-photo-queue'
const DB_VERSION = 1
const STORE = 'photos'
export const MAX_PHOTO_ATTEMPTS = 8

let dbPromise = null

const openDB = () => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('submission', 'client_submission_id', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((err) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

const run = async (mode, work) => {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode)
    let result
    try {
      result = work(tx.objectStore(STORE))
    } catch (err) {
      reject(err)
      return
    }
    tx.oncomplete = () => resolve(result?.result !== undefined ? result.result : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
  })
}

const getAll = () => run('readonly', store => store.getAll())

const newId = () => {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `ph_${Date.now().toString(36)}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Store a saved-on-phone ticket's photos. All or nothing: if any photo cannot
 * be written (for example the phone is out of storage) nothing is kept and
 * the error is thrown, so the caller can tell the foreman.
 *
 * @param {string} clientSubmissionId - the pending ticket's id
 * @param {{ companyId: string, projectId: string }} meta
 * @param {Array<{ file: Blob, name?: string, latitude?: number, longitude?: number, gpsAccuracy?: number }>} photos
 * @returns {Promise<number>} how many were stored
 */
export async function queueTicketPhotos(clientSubmissionId, { companyId, projectId }, photos) {
  if (!clientSubmissionId) throw new Error('queueTicketPhotos: clientSubmissionId is required')
  if (!photos?.length) return 0

  const entries = await Promise.all(photos.map(async (photo) => ({
    id: newId(),
    client_submission_id: clientSubmissionId,
    ticket_id: null,
    company_id: companyId,
    project_id: projectId,
    buffer: await photo.file.arrayBuffer(),
    type: photo.file.type || 'image/jpeg',
    name: photo.name || photo.file.name || 'photo.jpg',
    latitude: photo.latitude ?? null,
    longitude: photo.longitude ?? null,
    gps_accuracy: photo.gpsAccuracy ?? null,
    attempts: 0,
    created_at: new Date().toISOString()
  })))

  await run('readwrite', store => { entries.forEach(entry => store.put(entry)) })
  return entries.length
}

/** Photos still waiting on this phone, optionally for one project. */
export async function getQueuedPhotoCount(projectId = null) {
  try {
    const all = await getAll()
    return all.filter(e => !projectId || e.project_id === projectId).length
  } catch (_err) {
    return 0
  }
}

/** Drop a ticket's queued photos (the foreman discarded the saved ticket). */
export async function discardTicketPhotos(clientSubmissionId) {
  const all = await getAll()
  const ids = all.filter(e => e.client_submission_id === clientSubmissionId).map(e => e.id)
  if (ids.length) await run('readwrite', store => { ids.forEach(id => store.delete(id)) })
  return ids.length
}

/** The ticket synced: remember its server id on its queued photos. */
export async function markTicketSynced(clientSubmissionId, ticketId) {
  if (!clientSubmissionId || !ticketId) return 0
  const all = await getAll()
  const mine = all.filter(e => e.client_submission_id === clientSubmissionId && e.ticket_id !== ticketId)
  if (mine.length) {
    await run('readwrite', store => { mine.forEach(entry => store.put({ ...entry, ticket_id: ticketId })) })
  }
  return mine.length
}

let draining = null

/**
 * Upload every queued photo whose ticket has synced, attach it to the
 * ticket, and remove it from the queue. A photo that fails stays queued for
 * the next drain, up to MAX_PHOTO_ATTEMPTS. Concurrent calls share one run.
 *
 * @param {Object} io
 * @param {(companyId, projectId, ticketId, file: File) => Promise<string>} io.upload
 * @param {(ticketId, urls: string[], locations: Object|null) => Promise<any>} io.attach
 *   must ADD to the ticket's photos, not replace them
 * @param {(submissionIds: string[]) => Promise<Object>} [io.resolveTicketIds]
 *   looks up server ticket ids for photos whose sync event was missed
 *   (the ticket synced while this code was not listening)
 * @returns {Promise<{ uploaded: number, failed: number, waiting: number }>}
 *   waiting = photos whose ticket has not synced yet
 */
export function drainPhotoQueue(io) {
  if (draining) return draining
  draining = drain(io).finally(() => { draining = null })
  return draining
}

async function drain({ upload, attach, resolveTicketIds }) {
  let all
  try {
    all = await getAll()
    const unresolved = [...new Set(all.filter(e => !e.ticket_id).map(e => e.client_submission_id))]
    if (unresolved.length && resolveTicketIds) {
      const found = await resolveTicketIds(unresolved).catch(() => ({}))
      for (const [submissionId, ticketId] of Object.entries(found || {})) {
        await markTicketSynced(submissionId, ticketId)
      }
      if (Object.keys(found || {}).length) all = await getAll()
    }
  } catch (_err) {
    return { uploaded: 0, failed: 0, waiting: 0 }
  }

  const ready = all.filter(e => e.ticket_id && e.attempts < MAX_PHOTO_ATTEMPTS)
  const waiting = all.filter(e => !e.ticket_id).length
  let uploaded = 0
  let failed = 0

  const byTicket = new Map()
  ready.forEach(entry => {
    if (!byTicket.has(entry.ticket_id)) byTicket.set(entry.ticket_id, [])
    byTicket.get(entry.ticket_id).push(entry)
  })

  for (const [ticketId, entries] of byTicket) {
    const done = []
    const urls = []
    const locations = {}

    for (const entry of entries) {
      try {
        const file = new File([entry.buffer], entry.name, { type: entry.type })
        const url = await upload(entry.company_id, entry.project_id, ticketId, file)
        if (!url) throw new Error('Upload returned no path')
        urls.push(url)
        done.push(entry)
        if (entry.latitude != null && entry.longitude != null) {
          locations[url] = { lat: entry.latitude, lng: entry.longitude, accuracy: entry.gps_accuracy }
        }
      } catch (err) {
        console.error('[photoQueue] upload failed, will retry', err)
        failed++
        await run('readwrite', store => { store.put({ ...entry, attempts: entry.attempts + 1 }) }).catch(() => {})
      }
    }

    if (urls.length === 0) continue
    try {
      await attach(ticketId, urls, Object.keys(locations).length ? locations : null)
      await run('readwrite', store => { done.forEach(entry => store.delete(entry.id)) })
      uploaded += done.length
    } catch (err) {
      // Uploaded but not attached: keep them queued so the next drain retries.
      console.error('[photoQueue] attach failed, will retry', err)
      failed += done.length
      await run('readwrite', store => {
        done.forEach(entry => store.put({ ...entry, attempts: entry.attempts + 1 }))
      }).catch(() => {})
    }
  }

  return { uploaded, failed, waiting }
}

/** Test helper: forget the open connection. */
export function _resetPhotoQueueForTests() {
  dbPromise = null
  draining = null
}
