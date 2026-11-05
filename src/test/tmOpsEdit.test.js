import { describe, it, expect, beforeEach, vi } from 'vitest'

// tmOps.updateTMTicketContents / getTMTicketById / isTicketEditable against a
// fake Supabase client.

const { client, observe, mode } = vi.hoisted(() => ({
  client: { rpc: vi.fn(), from: vi.fn() },
  observe: { query: vi.fn(), error: vi.fn(), storage: vi.fn(), activity: vi.fn() },
  mode: { field: false }
}))

vi.mock('../lib/db/client', () => ({
  supabase: client,
  isSupabaseConfigured: true,
  observe,
  getClient: () => client,
  getSupabaseClient: () => client,
  isFieldMode: () => mode.field,
  sanitizeFormData: (v) => v,
  // Mirrors the real sanitize.text contract closely enough for these tests
  sanitize: { text: (v) => (v == null ? '' : String(v).replace(/<[^>]*>/g, '').trim()) },
  cacheData: vi.fn(),
  getCachedData: vi.fn()
}))

import { tmOps, buildTMTicketEditPayload } from '../lib/db/tmOps'

const RESULT = {
  ticket: { id: 't-1', edit_count: 1 },
  contents_changed: true,
  cor_resync_required: false
}

const baseEdit = () => ({
  fields: { work_date: '2026-11-04', ce_pco_number: 'PCO-8', notes: 'Demo wall' },
  workers: [
    { id: 'w-1', name: 'Ana', role: 'Foreman', hours: 8, overtime_hours: 0, time_started: '07:00', time_ended: '15:30', labor_class_id: 'lc-1' }
  ],
  items: [{ id: 'i-1', material_equipment_id: 'me-1', custom_name: null, custom_category: null, quantity: 5 }],
  editNote: 'Foreman double-counted OT'
})

const lastRpcArgs = () => client.rpc.mock.calls.at(-1)[1]

describe('tmOps.updateTMTicketContents', () => {
  beforeEach(() => {
    client.rpc.mockReset().mockResolvedValue({ data: RESULT, error: null })
    observe.error.mockReset()
    observe.activity.mockReset()
  })

  it('calls update_tm_ticket_contents with exactly the five RPC arguments', async () => {
    const result = await tmOps.updateTMTicketContents('t-1', baseEdit())
    expect(result).toEqual(RESULT)
    expect(client.rpc).toHaveBeenCalledTimes(1)
    const [name, args] = client.rpc.mock.calls[0]
    expect(name).toBe('update_tm_ticket_contents')
    expect(Object.keys(args).sort()).toEqual(['p_edit_note', 'p_fields', 'p_items', 'p_ticket_id', 'p_workers'])
    expect(args).toEqual({
      p_ticket_id: 't-1',
      p_fields: { work_date: '2026-11-04', ce_pco_number: 'PCO-8', notes: 'Demo wall' },
      p_workers: [{
        name: 'Ana', role: 'Foreman', hours: 8, overtime_hours: 0,
        time_started: '07:00', time_ended: '15:30', labor_class_id: 'lc-1'
      }],
      p_items: [{ material_equipment_id: 'me-1', custom_name: null, custom_category: null, quantity: 5 }],
      p_edit_note: 'Foreman double-counted OT'
    })
    expect(observe.activity).toHaveBeenCalledWith('tm_ticket_edited', {
      ticket_id: 't-1', contents_changed: true, cor_resync_required: false
    })
  })

  it('never sends edited_by_name or any audit column, even if the caller passes them', async () => {
    const edit = baseEdit()
    edit.fields = {
      ...edit.fields,
      edited_by_name: 'Mallory',
      edited_by_user_id: 'u-x',
      edited_at: '2026-01-01',
      edit_count: 0,
      edited_after_signature: false,
      last_edit_note: 'forged',
      status: 'approved'
    }
    edit.workers[0].ticket_id = 'other-ticket'
    await tmOps.updateTMTicketContents('t-1', edit)
    const json = JSON.stringify(lastRpcArgs())
    for (const key of ['edited_by_name', 'edited_by_user_id', 'edited_at', 'edit_count', 'edited_after_signature', 'last_edit_note', 'status', 'ticket_id', 'id']) {
      expect(json).not.toContain(`"${key}"`)
    }
    expect(Object.keys(lastRpcArgs().p_fields).sort()).toEqual(['ce_pco_number', 'notes', 'work_date'])
  })

  it("sends '' and whitespace CE/PCO as null and strips HTML from text", async () => {
    const edit = baseEdit()
    edit.fields.ce_pco_number = ''
    edit.fields.notes = '<b>Demo</b> wall '
    edit.workers[0].name = '  <i>Ana</i> Ruiz '
    edit.workers[0].role = '<script>x</script>Operator'
    edit.items = [{ material_equipment_id: '', custom_name: ' <b>Lift</b> ', custom_category: 'Equipment', quantity: 1 }]
    edit.editNote = '<p>Fix</p>'
    await tmOps.updateTMTicketContents('t-1', edit)
    const args = lastRpcArgs()
    expect(args.p_fields.ce_pco_number).toBeNull()
    expect(args.p_fields.notes).toBe('Demo wall')
    expect(args.p_workers[0].name).toBe('Ana Ruiz')
    expect(args.p_workers[0].role).toBe('xOperator')
    expect(args.p_items[0]).toEqual({ material_equipment_id: null, custom_name: 'Lift', custom_category: 'Equipment', quantity: 1 })
    expect(args.p_edit_note).toBe('Fix')

    edit.fields.ce_pco_number = '   '
    await tmOps.updateTMTicketContents('t-1', edit)
    expect(lastRpcArgs().p_fields.ce_pco_number).toBeNull()
  })

  it('parses numeric strings, keeps the role as stored and blanks to null', async () => {
    const edit = baseEdit()
    edit.workers = [
      { name: 'Jane Doe', role: '', hours: '8', overtime_hours: '', time_started: '', time_ended: undefined, labor_class_id: '' },
      { name: 'Bo', hours: '4.5', overtime_hours: '2' },
      { name: 'Cy', role: '   ', hours: 'abc', overtime_hours: null }
    ]
    edit.items = [
      { material_equipment_id: 'me-1', quantity: '3' },
      { material_equipment_id: 'me-2', quantity: '2.5' }
    ]
    await tmOps.updateTMTicketContents('t-1', edit)
    const args = lastRpcArgs()
    expect(args.p_workers).toEqual([
      { name: 'Jane Doe', role: null, hours: 8, overtime_hours: 0, time_started: null, time_ended: null, labor_class_id: null },
      { name: 'Bo', role: null, hours: 4.5, overtime_hours: 2, time_started: null, time_ended: null, labor_class_id: null },
      { name: 'Cy', role: null, hours: 0, overtime_hours: 0, time_started: null, time_ended: null, labor_class_id: null }
    ])
    expect(args.p_items).toEqual([
      { material_equipment_id: 'me-1', custom_name: null, custom_category: null, quantity: 3 },
      { material_equipment_id: 'me-2', custom_name: null, custom_category: null, quantity: 2.5 }
    ])
  })

  it('includes change_order_value (as a number) only when the key is provided', async () => {
    await tmOps.updateTMTicketContents('t-1', baseEdit())
    expect(lastRpcArgs().p_fields).not.toHaveProperty('change_order_value')

    const edit = baseEdit()
    edit.fields.change_order_value = '1234.5'
    await tmOps.updateTMTicketContents('t-1', edit)
    expect(lastRpcArgs().p_fields.change_order_value).toBe(1234.5)

    edit.fields.change_order_value = 0
    await tmOps.updateTMTicketContents('t-1', edit)
    expect(lastRpcArgs().p_fields.change_order_value).toBe(0)

    edit.fields.change_order_value = null
    await tmOps.updateTMTicketContents('t-1', edit)
    expect(lastRpcArgs().p_fields.change_order_value).toBeNull()

    edit.fields.change_order_value = ''
    await tmOps.updateTMTicketContents('t-1', edit)
    expect(lastRpcArgs().p_fields.change_order_value).toBeNull()
  })

  it('sends an empty note as null and tolerates missing arrays', async () => {
    await tmOps.updateTMTicketContents('t-1', { fields: { work_date: '2026-11-04', notes: 'x' }, editNote: '  ' })
    const args = lastRpcArgs()
    expect(args.p_edit_note).toBeNull()
    expect(args.p_workers).toEqual([])
    expect(args.p_items).toEqual([])
    expect(args.p_fields.ce_pco_number).toBeNull()
  })

  it('reports the error via observe.error and rethrows the Supabase error unchanged', async () => {
    const error = { code: 'P0001', message: 'This ticket has been billed and can no longer be edited.', details: null, hint: null }
    client.rpc.mockResolvedValue({ data: null, error })
    const promise = tmOps.updateTMTicketContents('t-1', baseEdit())
    await expect(promise).rejects.toBe(error)
    expect(error.code).toBe('P0001')
    expect(error.message).toBe('This ticket has been billed and can no longer be edited.')
    expect(observe.error).toHaveBeenCalledWith('database', expect.objectContaining({
      message: error.message,
      code: 'P0001',
      operation: 'updateTMTicketContents'
    }))
    expect(observe.activity).not.toHaveBeenCalled()
  })

  it('rethrows a 42501 permission error verbatim', async () => {
    const error = { code: '42501', message: 'Not authorized for this project' }
    client.rpc.mockResolvedValue({ data: null, error })
    await expect(tmOps.updateTMTicketContents('t-1', baseEdit())).rejects.toBe(error)
    expect(observe.error).toHaveBeenCalledTimes(1)
  })
})

describe('buildTMTicketEditPayload', () => {
  it('matches what updateTMTicketContents sends', () => {
    const built = buildTMTicketEditPayload(baseEdit())
    expect(Object.keys(built).sort()).toEqual(['p_edit_note', 'p_fields', 'p_items', 'p_workers'])
    expect(built.p_workers[0].hours).toBe(8)
  })
})

describe('tmOps.getTMTicketById', () => {
  const singleChain = (result) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve(result))
    }
    client.from.mockReturnValue(chain)
    return chain
  }

  beforeEach(() => {
    client.from.mockReset()
    observe.error.mockReset()
    mode.field = false
  })

  it('selects the ticket with nested workers and items by id', async () => {
    const row = { id: 't-1', t_and_m_workers: [], t_and_m_items: [] }
    const chain = singleChain({ data: row, error: null })
    await expect(tmOps.getTMTicketById('t-1')).resolves.toBe(row)
    expect(client.from).toHaveBeenCalledWith('t_and_m_tickets')
    const select = chain.select.mock.calls[0][0]
    expect(select).toContain('t_and_m_workers (*)')
    expect(select).toContain('t_and_m_items (')
    expect(select).toContain('materials_equipment (name, unit, cost_per_unit, category)')
    expect(chain.eq).toHaveBeenCalledWith('id', 't-1')
    expect(chain.single).toHaveBeenCalledTimes(1)
  })

  it('uses the same select string as getTMTicketsPaginated', async () => {
    const chain = singleChain({ data: { id: 't-1' }, error: null })
    await tmOps.getTMTicketById('t-1')
    const byIdSelect = chain.select.mock.calls[0][0]

    const pageChain = {
      select: vi.fn(() => pageChain),
      eq: vi.fn(() => pageChain),
      order: vi.fn(() => pageChain),
      range: vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 }))
    }
    client.from.mockReturnValue(pageChain)
    await tmOps.getTMTicketsPaginated('proj-1')
    expect(pageChain.select.mock.calls[0][0]).toBe(byIdSelect)
  })

  it('omits cost_per_unit in field mode', async () => {
    mode.field = true
    const chain = singleChain({ data: { id: 't-1' }, error: null })
    await tmOps.getTMTicketById('t-1')
    expect(chain.select.mock.calls[0][0]).not.toContain('cost_per_unit')
  })

  it('throws the Supabase error', async () => {
    const error = { code: 'PGRST116', message: 'No rows' }
    singleChain({ data: null, error })
    await expect(tmOps.getTMTicketById('missing')).rejects.toBe(error)
    expect(observe.error).toHaveBeenCalledWith('database', expect.objectContaining({ operation: 'getTMTicketById' }))
  })
})

describe('tmOps.isTicketEditable (shared COR status list)', () => {
  const corChain = (cor) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({ data: cor, error: null }))
    }
    client.from.mockReturnValue(chain)
  }

  beforeEach(() => client.from.mockReset())

  it('allows draft and pending_approval CORs', async () => {
    corChain({ id: 'c', status: 'draft', cor_number: 'COR-1' })
    expect((await tmOps.isTicketEditable({ assigned_cor_id: 'c' })).editable).toBe(true)
    corChain({ id: 'c', status: 'pending_approval', cor_number: 'COR-1' })
    expect((await tmOps.isTicketEditable({ assigned_cor_id: 'c' })).editable).toBe(true)
  })

  it('locks on any other COR status', async () => {
    const cor = { id: 'c', status: 'approved', cor_number: 'COR-1' }
    corChain(cor)
    expect(await tmOps.isTicketEditable({ assigned_cor_id: 'c' })).toEqual({
      editable: false,
      lockedBy: cor,
      reason: 'This ticket is linked to COR-1 which has been approved'
    })
  })

  it('is editable without a COR', async () => {
    expect(await tmOps.isTicketEditable({})).toEqual({ editable: true })
    expect(client.from).not.toHaveBeenCalled()
  })
})
