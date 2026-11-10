import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  queueTicketPhotos, getQueuedPhotoCount, discardTicketPhotos, markTicketSynced,
  drainPhotoQueue, MAX_PHOTO_ATTEMPTS, _resetPhotoQueueForTests
} from '../lib/photoQueue'

// jsdom's File has no arrayBuffer(); give the fixture one
const photo = (name, extra = {}) => {
  const bytes = new TextEncoder().encode(`bytes-of-${name}`)
  return {
    name,
    file: { type: 'image/jpeg', name, arrayBuffer: async () => bytes.buffer },
    ...extra
  }
}
const meta = { companyId: 'c1', projectId: 'p1' }

const io = (overrides = {}) => ({
  upload: vi.fn(async (_c, _p, ticketId, file) => `${ticketId}/${file.name}`),
  attach: vi.fn(async () => ({})),
  ...overrides
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _resetPhotoQueueForTests()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('photo queue', () => {
  it('keeps photos for a saved ticket and counts them per project', async () => {
    expect(await queueTicketPhotos('sub-1', meta, [photo('a.jpg'), photo('b.jpg')])).toBe(2)
    await queueTicketPhotos('sub-2', { companyId: 'c1', projectId: 'p2' }, [photo('c.jpg')])
    expect(await getQueuedPhotoCount()).toBe(3)
    expect(await getQueuedPhotoCount('p1')).toBe(2)
  })

  it('uploads nothing until the ticket has synced', async () => {
    await queueTicketPhotos('sub-1', meta, [photo('a.jpg')])
    const calls = io()
    expect(await drainPhotoQueue(calls)).toEqual({ uploaded: 0, failed: 0, waiting: 1 })
    expect(calls.upload).not.toHaveBeenCalled()
  })

  it('uploads and attaches once the ticket has a server id, then empties the queue', async () => {
    await queueTicketPhotos('sub-1', meta, [
      photo('a.jpg', { latitude: 1.5, longitude: 2.5, gpsAccuracy: 9 }),
      photo('b.jpg')
    ])
    await markTicketSynced('sub-1', 'ticket-9')
    const calls = io()

    expect(await drainPhotoQueue(calls)).toEqual({ uploaded: 2, failed: 0, waiting: 0 })
    expect(calls.upload).toHaveBeenCalledTimes(2)
    expect(calls.upload.mock.calls[0].slice(0, 3)).toEqual(['c1', 'p1', 'ticket-9'])
    const [ticketId, urls, locations] = calls.attach.mock.calls[0]
    expect(ticketId).toBe('ticket-9')
    expect(urls.sort()).toEqual(['ticket-9/a.jpg', 'ticket-9/b.jpg'])
    expect(locations).toEqual({ 'ticket-9/a.jpg': { lat: 1.5, lng: 2.5, accuracy: 9 } })
    expect(await getQueuedPhotoCount()).toBe(0)
  })

  it('finds the server ticket itself when the sync event was missed', async () => {
    await queueTicketPhotos('sub-1', meta, [photo('a.jpg')])
    const calls = io({ resolveTicketIds: vi.fn(async () => ({ 'sub-1': 'ticket-3' })) })
    expect(await drainPhotoQueue(calls)).toEqual({ uploaded: 1, failed: 0, waiting: 0 })
    expect(calls.resolveTicketIds).toHaveBeenCalledWith(['sub-1'])
    expect(calls.attach.mock.calls[0][0]).toBe('ticket-3')
  })

  it('keeps a photo that failed to upload and sends it on the next drain', async () => {
    await queueTicketPhotos('sub-1', meta, [photo('a.jpg'), photo('b.jpg')])
    await markTicketSynced('sub-1', 'ticket-9')
    const flaky = io({
      upload: vi.fn(async (_c, _p, ticketId, file) => {
        if (file.name === 'b.jpg') throw new Error('network')
        return `${ticketId}/${file.name}`
      })
    })
    expect(await drainPhotoQueue(flaky)).toEqual({ uploaded: 1, failed: 1, waiting: 0 })
    expect(await getQueuedPhotoCount()).toBe(1)

    const calls = io()
    expect(await drainPhotoQueue(calls)).toEqual({ uploaded: 1, failed: 0, waiting: 0 })
    expect(calls.attach.mock.calls[0][1]).toEqual(['ticket-9/b.jpg'])
    expect(await getQueuedPhotoCount()).toBe(0)
  })

  it('keeps uploaded photos queued when they could not be attached to the ticket', async () => {
    await queueTicketPhotos('sub-1', meta, [photo('a.jpg')])
    await markTicketSynced('sub-1', 'ticket-9')
    const calls = io({ attach: vi.fn(async () => { throw new Error('rls') }) })
    expect(await drainPhotoQueue(calls)).toEqual({ uploaded: 0, failed: 1, waiting: 0 })
    expect(await getQueuedPhotoCount()).toBe(1)
  })

  it('stops retrying a photo after the attempt limit', async () => {
    await queueTicketPhotos('sub-1', meta, [photo('a.jpg')])
    await markTicketSynced('sub-1', 'ticket-9')
    const failing = io({ upload: vi.fn(async () => { throw new Error('network') }) })
    for (let i = 0; i < MAX_PHOTO_ATTEMPTS; i++) await drainPhotoQueue(failing)
    failing.upload.mockClear()
    expect(await drainPhotoQueue(failing)).toEqual({ uploaded: 0, failed: 0, waiting: 0 })
    expect(failing.upload).not.toHaveBeenCalled()
  })

  it('drops the photos of a discarded ticket only', async () => {
    await queueTicketPhotos('sub-1', meta, [photo('a.jpg')])
    await queueTicketPhotos('sub-2', meta, [photo('b.jpg')])
    expect(await discardTicketPhotos('sub-1')).toBe(1)
    expect(await getQueuedPhotoCount()).toBe(1)
  })

  it('shares one run between overlapping drains', async () => {
    await queueTicketPhotos('sub-1', meta, [photo('a.jpg')])
    await markTicketSynced('sub-1', 'ticket-9')
    const calls = io()
    const [first, second] = await Promise.all([drainPhotoQueue(calls), drainPhotoQueue(calls)])
    expect(first).toEqual(second)
    expect(calls.upload).toHaveBeenCalledTimes(1)
  })
})
