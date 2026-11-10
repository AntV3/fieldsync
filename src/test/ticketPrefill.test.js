import { describe, it, expect } from 'vitest'
import { crewFromTicket, itemsFromTicket, prefillFromTicket } from '../lib/ticketPrefill'

describe('ticket prefill', () => {
  it('groups a crew with labor classes by class', () => {
    const crew = crewFromTicket({
      work_date: '2026-11-03',
      t_and_m_workers: [
        { name: 'A', labor_class_id: 'lc1', hours: 8, overtime_hours: 2, time_started: '07:00', time_ended: '17:30' },
        { name: 'B', labor_class_id: 'lc1', hours: 8, overtime_hours: 0 },
        { name: 'C', labor_class_id: 'lc2', hours: 4 }
      ]
    })
    expect(crew.dynamicWorkers).toEqual({
      lc1: [
        { name: 'A', hours: '8', overtimeHours: '2', timeStarted: '07:00', timeEnded: '17:30' },
        { name: 'B', hours: '8', overtimeHours: '', timeStarted: '', timeEnded: '' }
      ],
      lc2: [{ name: 'C', hours: '4', overtimeHours: '', timeStarted: '', timeEnded: '' }]
    })
    expect(crew.totalWorkers).toBe(3)
  })

  it('sorts a crew without labor classes into supervision, operators and laborers', () => {
    const crew = crewFromTicket({
      t_and_m_workers: [
        { name: 'F', role: 'Foreman', hours: 8 },
        { name: 'O', role: 'Operator', hours: 8 },
        { name: 'L', role: 'Laborer', hours: 8 }
      ]
    })
    expect(crew.dynamicWorkers).toBeNull()
    expect(crew.supervision).toEqual([{ name: 'F', hours: '8', overtimeHours: '', timeStarted: '', timeEnded: '', role: 'Foreman' }])
    expect(crew.operators.map(w => w.name)).toEqual(['O'])
    expect(crew.laborers.map(w => w.name)).toEqual(['L'])
  })

  it('carries catalog and custom items in the form shape', () => {
    expect(itemsFromTicket({
      t_and_m_items: [
        { material_equipment_id: 'm1', quantity: '3', materials_equipment: { name: 'Gravel', unit: 'ton', category: 'materials' } },
        { material_equipment_id: null, custom_name: 'Rental pump', custom_category: 'equipment', quantity: 1 }
      ]
    })).toEqual([
      { material_equipment_id: 'm1', name: 'Gravel', category: 'materials', unit: 'ton', quantity: 3, isCustom: false },
      { material_equipment_id: null, custom_name: 'Rental pump', custom_category: 'equipment', name: 'Rental pump', category: 'equipment', unit: 'each', quantity: 1, isCustom: true }
    ])
  })

  it('builds a new ticket: no photos, signatures or COR link come along', () => {
    const prefill = prefillFromTicket({
      id: 't1', work_date: '2026-11-03T00:00:00', ce_pco_number: 'PCO-7', notes: 'Trench', rejection_reason: ' Hours ',
      assigned_cor_id: 'cor-1', photos: ['a.jpg'], client_signature_data: 'sig',
      t_and_m_workers: [], t_and_m_items: []
    })
    expect(prefill).toEqual({
      sourceTicketId: 't1', workDate: '2026-11-03', cePcoNumber: 'PCO-7', notes: 'Trench', items: [],
      crew: { workDate: '2026-11-03T00:00:00', supervision: null, operators: null, laborers: null, dynamicWorkers: null, totalWorkers: 0 },
      rejectionReason: 'Hours'
    })
  })
})
