import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatCurrencyCompact } from '../../lib/utils'

function timeAgo(ts) {
  if (!ts) return ''
  const then = new Date(ts)
  if (isNaN(then)) return ''
  const mins = Math.max(0, Math.floor((Date.now() - then.getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString()
}

function initialsOf(name) {
  return String(name || 'FC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || 'FC'
}

// Materials cost of a T&M ticket (same math as useDashboardData.loadProjectDetails)
function ticketMaterialsTotal(ticket) {
  const items = ticket.t_and_m_items || ticket.items || []
  return items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 1
    const cost = parseFloat(item.unit_cost) || parseFloat(item.materials_equipment?.cost_per_unit) || 0
    return sum + qty * cost
  }, 0)
}

/**
 * LiveFieldFeed - Segmented activity panel: a merged feed of recent daily
 * reports, T&M tickets, and safety incidents, plus a "Pending approvals"
 * table of open CORs and pending tickets.
 */
export default function LiveFieldFeed({ projectData, pendingApprovalCount, onSetActiveTab, onViewCOR }) {
  const [activityTab, setActivityTab] = useState('feed')

  // Live field feed: recent daily reports, T&M tickets, and safety incidents merged
  const feedItems = useMemo(() => {
    const items = []
    for (const r of (projectData?.dailyReports || []).slice(0, 6)) {
      items.push({
        id: `dr-${r.id}`,
        ts: r.created_at || r.report_date,
        who: r.foreman_name || r.created_by_name || 'Field crew',
        tag: 'DAILY LOG',
        kind: 'report',
        text: r.work_performed || r.field_notes || 'Daily report submitted.',
        issues: r.issues
      })
    }
    for (const t of (projectData?.tmTickets || []).slice(0, 6)) {
      items.push({
        id: `tm-${t.id}`,
        ts: t.created_at || t.work_date,
        who: t.foreman_name || t.created_by_name || 'Field crew',
        tag: 'T&M',
        kind: 'tm',
        text: t.description_of_work || t.description ||
          (t.ce_pco_number ? `CE/PCO ${t.ce_pco_number}` : 'Time & material ticket submitted.'),
        status: t.status
      })
    }
    for (const ir of (projectData?.injuryReports || []).slice(0, 3)) {
      items.push({
        id: `inj-${ir.id}`,
        ts: ir.created_at || ir.incident_date,
        who: ir.reported_by || ir.injured_person_name || 'Field crew',
        tag: 'SAFETY',
        kind: 'safety',
        text: ir.description || ir.injury_description || 'Incident reported from the field.'
      })
    }
    return items
      .filter(i => i.ts)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, 6)
  }, [projectData])

  // Pending approvals: CORs awaiting approval + pending T&M tickets
  const approvalRows = useMemo(() => {
    const rows = []
    for (const c of (projectData?.changeOrders || [])) {
      if (!['draft', 'pending', 'pending_approval'].includes(c.status)) continue
      rows.push({
        key: `cor-${c.id}`,
        id: c.cor_number || 'COR',
        item: c.title || 'Untitled change order',
        value: parseFloat(c.cor_total) || parseFloat(c.total_amount) || 0,
        status: c.status === 'draft' ? 'Draft' : 'Review',
        statusClass: c.status === 'draft' ? 'muted' : 'warn',
        onClick: onViewCOR ? () => onViewCOR(c) : undefined
      })
    }
    for (const t of (projectData?.tmTickets || [])) {
      if (t.status !== 'pending') continue
      rows.push({
        key: `tm-${t.id}`,
        id: t.ce_pco_number || 'T&M',
        item: t.description_of_work || t.description || `Ticket · ${t.work_date || ''}`,
        value: ticketMaterialsTotal(t),
        status: 'Pending',
        statusClass: 'warn',
        onClick: () => onSetActiveTab('financials')
      })
    }
    return rows.slice(0, 8)
  }, [projectData, onViewCOR, onSetActiveTab])

  return (
    <div className="sdx-card sdx-panel" role="region" aria-label="Field activity">
      <div className="sdx-panel-header sdx-panel-header-tight">
        <div className="sdx-seg" role="tablist" aria-label="Activity view">
          <button
            role="tab"
            aria-selected={activityTab === 'feed'}
            className={`sdx-seg-btn ${activityTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActivityTab('feed')}
          >
            Live field feed
          </button>
          <button
            role="tab"
            aria-selected={activityTab === 'approvals'}
            className={`sdx-seg-btn ${activityTab === 'approvals' ? 'active' : ''}`}
            onClick={() => setActivityTab('approvals')}
          >
            Pending approvals{pendingApprovalCount > 0 && ` · ${pendingApprovalCount}`}
          </button>
        </div>
        <button className="sdx-link" onClick={() => onSetActiveTab(activityTab === 'feed' ? 'reports' : 'financials')}>
          View all →
        </button>
      </div>

      {activityTab === 'feed' ? (
        <div className="sdx-feed">
          {feedItems.length === 0 && (
            <div className="sdx-empty-row">No field activity yet — daily logs and tickets will appear here.</div>
          )}
          {feedItems.map(item => (
            <div key={item.id} className={`sdx-feed-item ${item.kind === 'safety' ? 'safety' : ''}`}>
              {item.kind === 'safety' ? (
                <div className="sdx-feed-avatar icon warn" aria-hidden="true">
                  <AlertTriangle size={15} />
                </div>
              ) : (
                <div className={`sdx-feed-avatar ${item.kind}`} aria-hidden="true">{initialsOf(item.who)}</div>
              )}
              <div className="sdx-feed-body">
                <div className="sdx-feed-meta">
                  <span className="sdx-feed-who">{item.who}</span>
                  <span className="sdx-feed-tag">{item.tag}</span>
                  <span className="sdx-feed-time">{timeAgo(item.ts)}</span>
                </div>
                <p className="sdx-feed-text">
                  {item.text}
                  {item.issues && <span className="sdx-feed-issue"> · Issue: {item.issues}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sdx-approvals">
          <div className="sdx-approvals-cols" aria-hidden="true">
            <div>ID</div>
            <div>Item</div>
            <div className="right">Value</div>
            <div className="center">Status</div>
          </div>
          {approvalRows.length === 0 && (
            <div className="sdx-empty-row">Nothing waiting on approval. All clear.</div>
          )}
          {approvalRows.map(row => (
            <button key={row.key} className="sdx-approval-row" onClick={row.onClick}>
              <span className="sdx-approval-id">{row.id}</span>
              <span className="sdx-approval-item">{row.item}</span>
              <span className="sdx-approval-value">{row.value > 0 ? formatCurrencyCompact(row.value) : '—'}</span>
              <span className={`sdx-approval-status ${row.statusClass}`}>● {row.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
