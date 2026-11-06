import { describe, it, expect } from 'vitest'
import {
  hasAnySignature,
  getTicketEditability,
  TM_COR_STATUSES_ALLOWING_TICKET_EDIT
} from '../lib/tmStatus'

const SIGNED = 'Saving will mark this ticket "Edited after signature".'
const APPROVED = 'This ticket is approved. Changing crew or materials can change its billable value.'
const BILLED = 'This ticket has been billed and can no longer be edited.'

describe('hasAnySignature', () => {
  it('is true for any of the three signature slots', () => {
    expect(hasAnySignature({ foreman_signature_data: 'data:image/png;base64,x' })).toBe(true)
    expect(hasAnySignature({ client_signature_data: 'x' })).toBe(true)
    expect(hasAnySignature({ gc_signature_data: 'x' })).toBe(true)
  })

  it('is false for an unsigned, empty or missing ticket', () => {
    expect(hasAnySignature({ foreman_signature_data: null, client_signature_data: '', gc_signature_data: undefined })).toBe(false)
    expect(hasAnySignature({})).toBe(false)
    expect(hasAnySignature(null)).toBe(false)
    expect(hasAnySignature(undefined)).toBe(false)
  })
})

describe('TM_COR_STATUSES_ALLOWING_TICKET_EDIT', () => {
  it('allows draft and pending_approval only, and is frozen', () => {
    expect(TM_COR_STATUSES_ALLOWING_TICKET_EDIT).toEqual(['draft', 'pending_approval'])
    expect(Object.isFrozen(TM_COR_STATUSES_ALLOWING_TICKET_EDIT)).toBe(true)
  })
})

describe('getTicketEditability', () => {
  it('locked by its COR: not editable, locked, reason passed through', () => {
    const lockInfo = {
      editable: false,
      lockedBy: { id: 'cor-1', status: 'approved', cor_number: 'COR-12' },
      reason: 'This ticket is linked to COR-12 which has been approved'
    }
    const result = getTicketEditability(
      { status: 'approved', assigned_cor_id: 'cor-1', foreman_signature_data: 'x' },
      lockInfo
    )
    expect(result).toEqual({
      editable: false,
      locked: true,
      reason: 'This ticket is linked to COR-12 which has been approved',
      warnings: [],
      flagsAfterSignature: true
    })
  })

  it('lock wins over billed', () => {
    const result = getTicketEditability({ status: 'billed' }, { editable: false, lockedBy: { id: 'c', status: 'billed', cor_number: 'COR-1' }, reason: 'locked' })
    expect(result.locked).toBe(true)
    expect(result.reason).toBe('locked')
  })

  it('billed: not editable, not locked, billed reason', () => {
    const result = getTicketEditability({ status: 'billed', client_signature_data: 'x' }, { editable: true, lockedBy: null, reason: null })
    expect(result).toEqual({
      editable: false,
      locked: false,
      reason: BILLED,
      warnings: [],
      flagsAfterSignature: true
    })
  })

  it('approved: editable with the approved warning', () => {
    const result = getTicketEditability({ status: 'approved' }, { editable: true })
    expect(result.editable).toBe(true)
    expect(result.locked).toBe(false)
    expect(result.reason).toBeNull()
    expect(result.warnings).toEqual([APPROVED])
    expect(result.flagsAfterSignature).toBe(false)
  })

  it('signed: warns that saving flags the ticket', () => {
    const result = getTicketEditability({ status: 'foreman_signed', foreman_signature_data: 'x' }, { editable: true })
    expect(result.editable).toBe(true)
    expect(result.warnings).toEqual([SIGNED])
    expect(result.flagsAfterSignature).toBe(true)
  })

  it('COR-linked: names the COR from lockInfo when known', () => {
    const result = getTicketEditability(
      { status: 'pending', assigned_cor_id: 'cor-1' },
      { editable: true, lockedBy: { id: 'cor-1', status: 'draft', cor_number: 'COR-7' }, reason: null }
    )
    expect(result.editable).toBe(true)
    expect(result.warnings).toEqual([
      "Crew and material changes re-sync this ticket's lines on COR-7 at current rates."
    ])
  })

  it('COR-linked: falls back to "the linked COR"', () => {
    const result = getTicketEditability({ status: 'pending', assigned_cor_id: 'cor-1' }, { editable: true, lockedBy: null, reason: null })
    expect(result.warnings).toEqual([
      "Crew and material changes re-sync this ticket's lines on the linked COR at current rates."
    ])
  })

  it('signed + COR-linked + approved: all three warnings in order', () => {
    const result = getTicketEditability(
      { status: 'approved', assigned_cor_id: 'cor-1', gc_signature_data: 'x' },
      { editable: true, lockedBy: null, reason: null }
    )
    expect(result.warnings).toEqual([
      SIGNED,
      "Crew and material changes re-sync this ticket's lines on the linked COR at current rates.",
      APPROVED
    ])
    expect(result.flagsAfterSignature).toBe(true)
  })

  it('pending: editable with no warnings', () => {
    expect(getTicketEditability({ status: 'pending' }, { editable: true })).toEqual({
      editable: true,
      locked: false,
      reason: null,
      warnings: [],
      flagsAfterSignature: false
    })
  })

  it('rejected: editable with no warnings', () => {
    const result = getTicketEditability({ status: 'rejected' }, { editable: true, lockedBy: null, reason: null })
    expect(result.editable).toBe(true)
    expect(result.locked).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('treats a missing lockInfo as not locked', () => {
    expect(getTicketEditability({ status: 'pending' }).editable).toBe(true)
    expect(getTicketEditability({ status: 'pending' }, null).locked).toBe(false)
  })
})
