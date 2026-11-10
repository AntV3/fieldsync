import { describe, it, expect, beforeEach } from 'vitest'
import { buildOfficeLink, parseOfficeLink, rememberOfficeLink, takeRememberedOfficeLink } from '../lib/officeLinks'
import { ticketNoticeFromEvent, ticketNoticeText } from '../lib/ticketNotices'

describe('office links', () => {
  beforeEach(() => sessionStorage.clear())

  it('round-trips a review link', () => {
    const link = buildOfficeLink({ projectId: 'p-1', view: 'review' })
    expect(link).toBe('/dashboard?project=p-1&view=review')
    expect(parseOfficeLink(link.split('?')[1])).toEqual({ projectId: 'p-1', view: 'review', corId: null, filter: null })
  })

  it('round-trips a COR link and a filtered COR list', () => {
    expect(parseOfficeLink('?project=p-1&cor=c-9')).toEqual({ projectId: 'p-1', view: null, corId: 'c-9', filter: null })
    expect(parseOfficeLink(buildOfficeLink({ projectId: 'p-1', view: 'cors', filter: 'draft' }).split('?')[1]))
      .toEqual({ projectId: 'p-1', view: 'cors', corId: null, filter: 'draft' })
  })

  it('ignores anything it does not recognise', () => {
    expect(parseOfficeLink('')).toBeNull()
    expect(parseOfficeLink('?view=review')).toBeNull()
    expect(parseOfficeLink('?project=<script>')).toBeNull()
    expect(parseOfficeLink('?project=p-1&view=settings&filter=approved&cor=a b'))
      .toEqual({ projectId: 'p-1', view: null, corId: null, filter: null })
    expect(buildOfficeLink({})).toBe('/dashboard')
  })

  it('remembers a link once across a redirect', () => {
    rememberOfficeLink('?view=review')
    expect(takeRememberedOfficeLink()).toBeNull()
    rememberOfficeLink('?project=p-1&view=review')
    expect(takeRememberedOfficeLink()).toEqual({ projectId: 'p-1', view: 'review', corId: null, filter: null })
    expect(takeRememberedOfficeLink()).toBeNull()
  })
})

describe('ticket notices', () => {
  const event = (eventType, row) => ({ eventType, new: { id: 't1', project_id: 'p1', ...row } })

  it('announces a new field ticket once', () => {
    const seen = new Set()
    expect(ticketNoticeFromEvent(event('INSERT', { status: 'foreman_signed' }), seen))
      .toEqual({ key: 't1:new', kind: 'new', ticketId: 't1', projectId: 'p1' })
    expect(ticketNoticeFromEvent(event('INSERT', { status: 'foreman_signed' }), seen)).toBeNull()
  })

  it('announces the client signature once, however many updates follow', () => {
    const seen = new Set()
    expect(ticketNoticeFromEvent(event('UPDATE', { status: 'client_signed' }), seen)?.kind).toBe('signed')
    expect(ticketNoticeFromEvent(event('UPDATE', { status: 'client_signed' }), seen)).toBeNull()
  })

  it('says nothing for other updates, deletes or office decisions', () => {
    const seen = new Set()
    expect(ticketNoticeFromEvent(event('UPDATE', { status: 'foreman_signed' }), seen)).toBeNull()
    expect(ticketNoticeFromEvent(event('UPDATE', { status: 'approved' }), seen)).toBeNull()
    expect(ticketNoticeFromEvent({ eventType: 'DELETE', old: { id: 't1' } }, seen)).toBeNull()
    expect(ticketNoticeFromEvent(null, seen)).toBeNull()
  })

  it('does not announce a ticket as new after it was announced as signed', () => {
    const seen = new Set()
    ticketNoticeFromEvent(event('INSERT', { status: 'client_signed' }), seen)
    expect(ticketNoticeFromEvent(event('INSERT', { status: 'pending' }), seen)).toBeNull()
  })

  it('writes plain text for each kind', () => {
    expect(ticketNoticeText({ kind: 'signed' }, 'Tower A')).toBe('Client signed a ticket on Tower A. It is ready to approve.')
    expect(ticketNoticeText({ kind: 'new' })).toBe('New ticket from the field.')
  })
})
