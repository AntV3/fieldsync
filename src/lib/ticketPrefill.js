/**
 * Build the T&M form's starting values from an existing ticket, so a ticket
 * the office rejected can be corrected and resubmitted without retyping.
 *
 * The result is a new ticket: photos and signatures are not carried over
 * (they belong to the rejected ticket), and it is not linked to a COR.
 */

const SUPERVISION_ROLES = ['Foreman', 'General Foreman', 'Superintendent']

const formWorker = (w) => ({
  name: w.name || '',
  hours: w.hours != null ? String(w.hours) : '',
  overtimeHours: w.overtime_hours != null && Number(w.overtime_hours) !== 0 ? String(w.overtime_hours) : '',
  timeStarted: w.time_started || '',
  timeEnded: w.time_ended || ''
})

/** Crew in the shape TMForm applies (same as db.getPreviousTicketCrew). */
export function crewFromTicket(ticket) {
  const workers = ticket?.t_and_m_workers || []

  const dynamicWorkers = {}
  workers.filter(w => w.labor_class_id).forEach(w => {
    if (!dynamicWorkers[w.labor_class_id]) dynamicWorkers[w.labor_class_id] = []
    dynamicWorkers[w.labor_class_id].push(formWorker(w))
  })

  const supervision = workers.filter(w => SUPERVISION_ROLES.includes(w.role)).map(w => ({ ...formWorker(w), role: w.role }))
  const operators = workers.filter(w => w.role === 'Operator').map(formWorker)
  const laborers = workers.filter(w => w.role === 'Laborer').map(formWorker)

  return {
    workDate: ticket?.work_date,
    supervision: supervision.length ? supervision : null,
    operators: operators.length ? operators : null,
    laborers: laborers.length ? laborers : null,
    dynamicWorkers: Object.keys(dynamicWorkers).length ? dynamicWorkers : null,
    totalWorkers: workers.length
  }
}

/** Materials and equipment in the shape of TMForm's `items` state. */
export function itemsFromTicket(ticket) {
  return (ticket?.t_and_m_items || []).map(item => {
    const isCustom = !item.material_equipment_id
    const name = isCustom ? (item.custom_name || 'Item') : (item.materials_equipment?.name || 'Item')
    const category = isCustom ? (item.custom_category || '') : (item.materials_equipment?.category || '')
    return {
      material_equipment_id: item.material_equipment_id || null,
      ...(isCustom ? { custom_name: name, custom_category: category } : {}),
      name,
      category,
      unit: item.materials_equipment?.unit || 'each',
      quantity: Number(item.quantity) || 1,
      isCustom
    }
  })
}

/**
 * @param {Object} ticket - a t_and_m_tickets row with its workers and items
 * @returns {{ workDate, cePcoNumber, notes, items, crew, rejectionReason, sourceTicketId }}
 */
export function prefillFromTicket(ticket) {
  return {
    sourceTicketId: ticket.id,
    workDate: String(ticket.work_date || '').slice(0, 10),
    cePcoNumber: ticket.ce_pco_number || '',
    notes: ticket.notes || '',
    items: itemsFromTicket(ticket),
    crew: crewFromTicket(ticket),
    rejectionReason: String(ticket.rejection_reason ?? '').trim()
  }
}
