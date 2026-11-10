import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { ArrowLeft, PenLine, Link, CheckCircle, AlertTriangle, Clock, Plus, RefreshCw } from 'lucide-react'
import { db } from '../lib/supabase'
import { canApproveTicket, isAwaitingApproval } from '../lib/tmStatus'

const SignatureLinkGenerator = lazy(() => import('./SignatureLinkGenerator'))
const TMClientSignature = lazy(() => import('./TMClientSignature'))
const TMForemanSignature = lazy(() => import('./TMForemanSignature'))

const RECENT_DAYS = 45

const parseLocalDate = (value) => {
  const [y, m, d] = String(value || '').slice(0, 10).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : new Date(value)
}

const formatDate = (value) => {
  const date = parseLocalDate(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const totalHours = (ticket) => (ticket.t_and_m_workers || []).reduce(
  (sum, w) => sum + (parseFloat(w.hours) || 0) + (parseFloat(w.overtime_hours) || 0), 0
)

/**
 * What the foreman needs to know about a ticket, in one word and one line.
 * @returns {{ state: 'rejected'|'needs_foreman_signature'|'needs_signature'|'signed'|'approved', label: string, detail: string|null }}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function fieldTicketState(ticket) {
  if (ticket.status === 'rejected') {
    const reason = String(ticket.rejection_reason ?? '').trim()
    return { state: 'rejected', label: 'Rejected by the office', detail: reason || 'No reason given' }
  }
  if (ticket.status === 'approved' || ticket.status === 'billed') {
    return { state: 'approved', label: 'Approved by the office', detail: null }
  }
  if (isAwaitingApproval(ticket.status) && !ticket.foreman_signature_data && !canApproveTicket(ticket)) {
    return { state: 'needs_foreman_signature', label: 'Needs your signature', detail: 'Sign it, then get the client signature.' }
  }
  if (isAwaitingApproval(ticket.status) && !canApproveTicket(ticket)) {
    return { state: 'needs_signature', label: 'Needs client signature', detail: 'The office cannot approve it until the client signs.' }
  }
  return { state: 'signed', label: 'Client signed', detail: 'Waiting for the office to review.' }
}

const STATE_ICONS = {
  rejected: AlertTriangle,
  needs_foreman_signature: PenLine,
  needs_signature: PenLine,
  signed: Clock,
  approved: CheckCircle
}

/**
 * FieldTicketList - The foreman's recent T&M tickets for this project, with
 * the one thing each still needs. A ticket whose client was not on site at
 * submit time can be signed here later, on this device or through a link.
 */
export default function FieldTicketList({ project, companyId, onBack, onNewTicket, onResubmit, onShowToast }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [signingTicket, setSigningTicket] = useState(null)
  const [linkTicket, setLinkTicket] = useState(null)
  const [foremanSigningTicket, setForemanSigningTicket] = useState(null)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const all = await db.getTMTickets(project.id)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - RECENT_DAYS)
      const recent = (all || []).filter(t => {
        const date = parseLocalDate(t.work_date || t.created_at)
        // Anything still open stays on the list however old it is
        return ['needs_foreman_signature', 'needs_signature', 'rejected'].includes(fieldTicketState(t).state) || !(date < cutoff)
      })
      recent.sort((a, b) => parseLocalDate(b.work_date || b.created_at) - parseLocalDate(a.work_date || a.created_at))
      setTickets(recent)
    } catch (error) {
      console.error('Error loading tickets:', error)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => { loadTickets() }, [loadTickets])

  const needsSignatureCount = tickets.filter(t => fieldTicketState(t).state === 'needs_signature').length

  const detailsFor = (ticket) => ({
    projectName: project?.name,
    cePcoNumber: ticket.ce_pco_number,
    notes: ticket.notes,
    workers: (ticket.t_and_m_workers || []).map(w => ({
      name: w.name,
      role: w.role,
      hours: w.hours || 0,
      overtime_hours: w.overtime_hours || 0,
      time_started: w.time_started,
      time_ended: w.time_ended
    })),
    items: (ticket.t_and_m_items || []).map(item => ({
      name: item.materials_equipment?.name || item.custom_name || item.name || 'Item',
      quantity: item.quantity,
      unit: item.materials_equipment?.unit || item.unit || ''
    })),
    photos: []
  })

  return (
    <div className="fm-view">
      <div className="fm-subheader">
        <button className="fm-back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h2>My tickets</h2>
      </div>

      <div className="fld-tickets">
        {needsSignatureCount > 0 && (
          <p className="fld-tickets-summary" role="status">
            {needsSignatureCount === 1
              ? '1 ticket still needs the client signature.'
              : `${needsSignatureCount} tickets still need the client signature.`}
          </p>
        )}

        {loading ? (
          <p className="fld-tickets-empty">Loading tickets...</p>
        ) : loadError ? (
          <div className="fld-tickets-empty">
            <p>Could not load tickets. Check your connection and try again.</p>
            <button className="btn btn-secondary" onClick={loadTickets}>
              <RefreshCw size={15} aria-hidden="true" /> Try again
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="fld-tickets-empty">
            <p>No tickets on this project in the last {RECENT_DAYS} days.</p>
            {onNewTicket && (
              <button className="btn btn-primary" onClick={onNewTicket}>
                <Plus size={15} aria-hidden="true" /> New T&amp;M ticket
              </button>
            )}
          </div>
        ) : (
          <ul className="fld-ticket-list">
            {tickets.map(ticket => {
              const { state, label, detail } = fieldTicketState(ticket)
              const Icon = STATE_ICONS[state]
              const hours = totalHours(ticket)
              const crew = (ticket.t_and_m_workers || []).length
              const title = [formatDate(ticket.work_date), ticket.ce_pco_number ? `PCO ${ticket.ce_pco_number}` : null]
                .filter(Boolean).join(' · ')
              return (
                <li key={ticket.id} className={`fld-ticket fld-ticket--${state}`}>
                  <div className="fld-ticket-head">
                    <span className="fld-ticket-title">{title}</span>
                    <span className="fld-ticket-meta">
                      {crew} crew · {hours} hrs
                    </span>
                  </div>
                  {ticket.notes && <p className="fld-ticket-notes">{ticket.notes}</p>}
                  <div className="fld-ticket-state">
                    <Icon size={15} aria-hidden="true" />
                    <span>
                      <strong>{label}</strong>
                      {detail && <span className="fld-ticket-detail"> {detail}</span>}
                    </span>
                  </div>
                  {state === 'rejected' && onResubmit && (
                    <div className="fld-ticket-actions">
                      <button className="btn btn-primary" onClick={() => onResubmit(ticket)}>
                        <RefreshCw size={15} aria-hidden="true" /> Fix and resubmit
                      </button>
                    </div>
                  )}
                  {state === 'needs_foreman_signature' && (
                    <div className="fld-ticket-actions">
                      <button className="btn btn-primary" onClick={() => setForemanSigningTicket(ticket)}>
                        <PenLine size={15} aria-hidden="true" /> Sign as foreman
                      </button>
                    </div>
                  )}
                  {state === 'needs_signature' && (
                    <div className="fld-ticket-actions">
                      <button className="btn btn-primary" onClick={() => setSigningTicket(ticket)}>
                        <PenLine size={15} aria-hidden="true" /> Client signs now
                      </button>
                      <button className="btn btn-secondary" onClick={() => setLinkTicket(ticket)}>
                        <Link size={15} aria-hidden="true" /> Send link
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {signingTicket && (
        <Suspense fallback={<div className="loading">Loading...</div>}>
          <TMClientSignature
            ticketId={signingTicket.id}
            ticketSummary={{
              workDate: signingTicket.work_date,
              workerCount: (signingTicket.t_and_m_workers || []).length,
              totalHours: totalHours(signingTicket)
            }}
            ticketDetails={detailsFor(signingTicket)}
            onSave={() => {
              setSigningTicket(null)
              onShowToast?.('Client signature saved', 'success')
              loadTickets()
            }}
            onClose={() => setSigningTicket(null)}
            onShowToast={onShowToast}
          />
        </Suspense>
      )}

      {foremanSigningTicket && (
        <Suspense fallback={<div className="loading">Loading...</div>}>
          <TMForemanSignature
            ticketId={foremanSigningTicket.id}
            ticketSummary={{
              workDate: foremanSigningTicket.work_date,
              workerCount: (foremanSigningTicket.t_and_m_workers || []).length,
              totalHours: totalHours(foremanSigningTicket)
            }}
            ticketDetails={detailsFor(foremanSigningTicket)}
            onSave={() => {
              setForemanSigningTicket(null)
              onShowToast?.('Foreman signature saved', 'success')
              loadTickets()
            }}
            onClose={() => setForemanSigningTicket(null)}
            onShowToast={onShowToast}
          />
        </Suspense>
      )}

      {linkTicket && (
        <Suspense fallback={<div className="loading">Loading...</div>}>
          <SignatureLinkGenerator
            documentType="tm_ticket"
            documentId={linkTicket.id}
            companyId={companyId}
            projectId={project.id}
            project={project}
            documentTitle={`Time & Material Ticket - ${formatDate(linkTicket.work_date)}`}
            onClose={() => { setLinkTicket(null); loadTickets() }}
            onShowToast={onShowToast}
          />
        </Suspense>
      )}
    </div>
  )
}
