/**
 * Regression tests: offline CREATE_TM_TICKET must not duplicate the ticket
 * when a later step in the multi-step create (addTMWorkers / addTMItems)
 * fails and the sync retries.
 */
import { describe, it, expect, vi } from 'vitest'
import { processAction, ACTION_TYPES } from '../lib/offlineManager'

describe('offlineManager processAction: CREATE_TM_TICKET idempotency', () => {
  it('skips the ticket insert on retry when server_ticket_id was persisted', async () => {
    const createTMTicket = vi.fn().mockResolvedValue({ id: 'server-ticket-1' })
    const addTMWorkers = vi.fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ ok: true })
    const addTMItems = vi.fn().mockResolvedValue({ ok: true })
    const db = { createTMTicket, addTMWorkers, addTMItems }

    const action = {
      id: 42,
      type: ACTION_TYPES.CREATE_TM_TICKET,
      payload: {
        ticket: { project_id: 'proj-1', work_date: '2026-09-15' },
        workers: [{ name: 'Alice', regular_hours: 8 }],
        items: [{ description: 'Widget', quantity: 2 }]
      }
    }

    // First attempt: ticket insert succeeds, workers fails
    await expect(processAction(action, db)).rejects.toThrow('network blip')
    expect(createTMTicket).toHaveBeenCalledTimes(1)
    // processAction must have written the new server id back onto the payload
    // so a retry recognizes the ticket is already in the DB.
    expect(action.payload.server_ticket_id).toBe('server-ticket-1')

    // Second attempt (simulating the sync-loop retry): ticket create MUST
    // NOT run again — otherwise the sync just inserted a duplicate row.
    await processAction(action, db)
    expect(createTMTicket).toHaveBeenCalledTimes(1)
    expect(addTMWorkers).toHaveBeenCalledTimes(2)
    expect(addTMWorkers).toHaveBeenLastCalledWith('server-ticket-1', action.payload.workers)
    expect(addTMItems).toHaveBeenCalledTimes(1)
    expect(addTMItems).toHaveBeenCalledWith('server-ticket-1', action.payload.items)
  })

  it('does not touch workers/items when the initial ticket insert fails', async () => {
    const createTMTicket = vi.fn().mockRejectedValue(new Error('RLS refused'))
    const addTMWorkers = vi.fn()
    const addTMItems = vi.fn()
    const db = { createTMTicket, addTMWorkers, addTMItems }

    const action = {
      id: 43,
      type: ACTION_TYPES.CREATE_TM_TICKET,
      payload: {
        ticket: { project_id: 'proj-1', work_date: '2026-09-15' },
        workers: [{ name: 'Bob' }],
        items: []
      }
    }

    await expect(processAction(action, db)).rejects.toThrow('RLS refused')
    expect(action.payload.server_ticket_id).toBeUndefined()
    expect(addTMWorkers).not.toHaveBeenCalled()
    expect(addTMItems).not.toHaveBeenCalled()
  })
})
