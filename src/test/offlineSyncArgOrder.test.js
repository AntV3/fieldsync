/**
 * Offline-sync argument-order regression suite (daily health check 2026-10-25)
 *
 * processAction in offlineManager.js replays queued offline actions through
 * `db.*` methods. Two cases passed the queued payload fields into the WRONG
 * positional slots of the target function, so what looked like a working
 * offline queue silently mangled data on reconnect:
 *
 *   1. SAVE_CREW_CHECKIN: the 3rd arg to fieldOps.saveCrewCheckin is
 *      `createdBy`, not `date`. processAction passed `payload.checkInDate`
 *      into `createdBy`, so the auth-user column got a date string and the
 *      actual check_in_date silently defaulted to the sync day — an offline
 *      check-in made Monday that synced Thursday was recorded as Thursday.
 *
 *   2. SEND_MESSAGE: sendMessage's signature is
 *      (projectId, message, senderType, senderName, …). processAction called
 *      it with (projectId, payload.senderType, payload.senderName, payload.content),
 *      so for every offline-sent message the DB received the user's message
 *      body as `sender_type`, the real sender_type as `sender_name`, the real
 *      sender_name as `message` (truncated by sanitize.text), and the
 *      message column never saw the user's text at all.
 *
 * Along the way we also noticed SUBMIT_DAILY_REPORT dropped the report date
 * on the floor: both legs of its processAction call defaulted `date` to the
 * sync day. The queued payload now carries `reportDate` and processAction
 * threads it through.
 *
 * These tests pin the exact source wiring so a future refactor can't quietly
 * reintroduce the shift.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoFile = (p) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8')

// ============================================================
// processAction maps every payload field to the correct positional arg
// ============================================================

describe('offlineManager.processAction — SAVE_CREW_CHECKIN replay', () => {
  const src = repoFile('src/lib/offlineManager.js')

  it('passes createdBy in slot 3 and checkInDate in slot 4 of saveCrewCheckin', () => {
    // The regression was `payload.checkInDate` sitting in slot 3. The fix must
    // put a `createdBy` reference between projectId/workers and checkInDate.
    const call = src.match(/case ACTION_TYPES\.SAVE_CREW_CHECKIN:[\s\S]*?return db\.saveCrewCheckin\(([\s\S]*?)\)/)
    expect(call).not.toBeNull()
    const args = call[1]
      .split(',')
      .map(s => s.replace(/\/\/.*$/gm, '').trim())
      .filter(Boolean)
    expect(args).toHaveLength(4)
    expect(args[0]).toBe('payload.projectId')
    expect(args[1]).toBe('payload.workers')
    expect(args[2]).toMatch(/payload\.createdBy/)
    expect(args[3]).toBe('payload.checkInDate')
  })

  it('fieldOps.saveCrewCheckin signature still expects (projectId, workers, createdBy, date)', () => {
    const fieldOps = repoFile('src/lib/db/fieldOps.js')
    // The processAction fix is coupled to this signature; a reorder of the
    // function params has to carry a matching change in offlineManager.
    expect(fieldOps).toMatch(
      /async saveCrewCheckin\(\s*projectId\s*,\s*workers\s*,\s*createdBy[^,]*,\s*date[^)]*\)/
    )
  })

  it('fieldOps queues createdBy and checkInDate on every SAVE_CREW_CHECKIN pending action', () => {
    const fieldOps = repoFile('src/lib/db/fieldOps.js')
    // Three queue sites: pre-write offline branch, no-client fallback,
    // and the network-error retry inside the online branch. All three must
    // persist createdBy or the server loses it on replay.
    const queueBlocks = [...fieldOps.matchAll(
      /addPendingAction\(ACTION_TYPES\.SAVE_CREW_CHECKIN,\s*\{([\s\S]*?)\}\)/g
    )]
    expect(queueBlocks.length).toBeGreaterThanOrEqual(3)
    for (const [, body] of queueBlocks) {
      expect(body).toMatch(/\bcreatedBy\b/)
      expect(body).toMatch(/checkInDate/)
    }
  })
})

describe('offlineManager.processAction — SEND_MESSAGE replay', () => {
  const src = repoFile('src/lib/offlineManager.js')

  it('passes the queued content into the message slot, not the sender slots', () => {
    const call = src.match(/case ACTION_TYPES\.SEND_MESSAGE:[\s\S]*?return db\.sendMessage\(([\s\S]*?)\)/)
    expect(call).not.toBeNull()
    const args = call[1]
      .split(',')
      .map(s => s.replace(/\/\/.*$/gm, '').trim())
      .filter(Boolean)
    // sendMessage signature: (projectId, message, senderType, senderName, senderUserId, photoUrl, messageType, parentId)
    expect(args.length).toBeGreaterThanOrEqual(4)
    expect(args[0]).toBe('payload.projectId')
    // slot 2 must be the message body — the queued field is `content`
    expect(args[1]).toMatch(/payload\.content/)
    expect(args[2]).toMatch(/payload\.senderType/)
    expect(args[3]).toMatch(/payload\.senderName/)
    // The buggy slot-3 and slot-4 (sender fields) must never again carry the body.
    expect(args[2]).not.toMatch(/payload\.content/)
    expect(args[3]).not.toMatch(/payload\.content/)
  })

  it('fieldOps.sendMessage signature still expects (projectId, message, senderType, senderName, …)', () => {
    const fieldOps = repoFile('src/lib/db/fieldOps.js')
    expect(fieldOps).toMatch(
      /async sendMessage\(\s*projectId\s*,\s*message\s*,\s*senderType\s*,\s*senderName[^)]*\)/
    )
  })

  it('fieldOps queues the full sendMessage context (content + senderUserId + photoUrl + messageType + parentId)', () => {
    const fieldOps = repoFile('src/lib/db/fieldOps.js')
    const queueBlocks = [...fieldOps.matchAll(
      /addPendingAction\(ACTION_TYPES\.SEND_MESSAGE,\s*\{([\s\S]*?)\}\)/g
    )]
    expect(queueBlocks.length).toBeGreaterThanOrEqual(2)
    for (const [, body] of queueBlocks) {
      expect(body).toMatch(/content:\s*message/)
      expect(body).toMatch(/\bsenderUserId\b/)
      expect(body).toMatch(/\bphotoUrl\b/)
      expect(body).toMatch(/\bmessageType\b/)
      expect(body).toMatch(/\bparentId\b/)
    }
  })
})

describe('offlineManager.processAction — SUBMIT_DAILY_REPORT replay', () => {
  const src = repoFile('src/lib/offlineManager.js')

  it('threads payload.reportDate (or reportData.report_date) into both saveDailyReport and submitDailyReport', () => {
    const block = src.match(/case ACTION_TYPES\.SUBMIT_DAILY_REPORT:[\s\S]*?(?=case ACTION_TYPES\.|default:|$)/)
    expect(block).not.toBeNull()
    // Both legs of the submit flow must receive a date — not fall back to
    // the sync day inside saveDailyReport / submitDailyReport.
    const saveCall = block[0].match(/db\.saveDailyReport\(([\s\S]*?)\)/)
    const submitCall = block[0].match(/db\.submitDailyReport\(([\s\S]*?)\)/)
    expect(saveCall).not.toBeNull()
    expect(submitCall).not.toBeNull()
    expect(saveCall[1]).toMatch(/reportDate|report_date/)
    expect(submitCall[1]).toMatch(/reportDate|report_date/)
  })

  it('fieldOps queues reportDate on every SUBMIT_DAILY_REPORT pending action', () => {
    const fieldOps = repoFile('src/lib/db/fieldOps.js')
    const queueBlocks = [...fieldOps.matchAll(
      /addPendingAction\(ACTION_TYPES\.SUBMIT_DAILY_REPORT,\s*\{([\s\S]*?)\}\)/g
    )]
    expect(queueBlocks.length).toBeGreaterThanOrEqual(2)
    for (const [, body] of queueBlocks) {
      expect(body).toMatch(/\breportDate\b/)
    }
  })
})
