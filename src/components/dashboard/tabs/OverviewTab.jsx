import { Suspense, lazy, useMemo, useState } from 'react'
import { ClipboardList, DollarSign, FileText, AlertTriangle, Download, ArrowRight, ShieldCheck } from 'lucide-react'
import { formatCurrencyCompact } from '../../../lib/utils'
import { OverviewCrewMetrics } from '../../overview'
import DisposalSummary from '../../DisposalSummary'
import { useTradeConfig } from '../../../lib/TradeConfigContext'
const PunchList = lazy(() => import('../../PunchList'))

const STATUS_META = {
  done: { label: 'Done', className: 'done' },
  working: { label: 'Working', className: 'working' },
  not_started: { label: 'Not started', className: 'not-started' }
}

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

// Materials cost of a T&M ticket (same math as Dashboard.loadProjectDetails)
function ticketMaterialsTotal(ticket) {
  const items = ticket.t_and_m_items || ticket.items || []
  return items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 1
    const cost = parseFloat(item.unit_cost) || parseFloat(item.materials_equipment?.cost_per_unit) || 0
    return sum + qty * cost
  }, 0)
}

export default function OverviewTab({
  selectedProject,
  projectData,
  progress,
  billable,
  revisedContractValue,
  changeOrderValue,
  areas,
  areasComplete,
  areasWorking,
  areasNotStarted,
  companyId,
  company,
  onShowToast,
  onSetActiveTab,
  onExportFieldDocuments,
  onAreaStatusCycle,
  onViewCOR
}) {
  const { resolvedConfig } = useTradeConfig()
  const truckLoadTrackingEnabled = resolvedConfig?.enable_truck_load_tracking ?? false
  const [activityTab, setActivityTab] = useState('feed')

  const originalContract = selectedProject?.contract_value || 0
  const remainingValue = revisedContractValue - billable
  const isValueBased = (areas || []).some(a => a.scheduled_value > 0)

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

  const pendingApprovalCount = (projectData?.pendingTickets || 0) + (projectData?.corPendingCount || 0)
  const pendingApprovalValue = projectData?.corPendingValue || 0

  // Daily burn composition for the stacked bar
  const burnTotal = projectData?.allCostsTotal || 0
  const burnShares = burnTotal > 0
    ? {
        labor: Math.round(((projectData?.laborCost || 0) / burnTotal) * 100),
        materials: Math.round(((projectData?.materialsEquipmentCost || 0) / burnTotal) * 100),
        equipment: Math.round((((projectData?.projectEquipmentCost || 0) + (projectData?.customCostTotal || 0)) / burnTotal) * 100)
      }
    : { labor: 0, materials: 0, equipment: 0 }

  // Contract-to-date stacked bar
  const billedPct = revisedContractValue > 0 ? Math.min(100, Math.round((billable / revisedContractValue) * 100)) : 0
  const inReviewPct = revisedContractValue > 0 ? Math.min(100 - billedPct, Math.round((pendingApprovalValue / revisedContractValue) * 100)) : 0

  const attentionItems = []
  if (projectData?.pendingTickets > 0) {
    attentionItems.push({
      id: 'pending-tm',
      type: 'warning',
      icon: ClipboardList,
      label: `${projectData.pendingTickets} Time and Material ticket${projectData.pendingTickets !== 1 ? 's' : ''} need approval`,
      tab: 'financials'
    })
  }
  if (projectData?.changeOrderPending > 0) {
    attentionItems.push({
      id: 'pending-co',
      type: 'info',
      icon: FileText,
      label: `${projectData.changeOrderPending} change order${projectData.changeOrderPending !== 1 ? 's' : ''} pending`,
      tab: 'financials'
    })
  }

  const renderAreaValue = (area) => (
    area.scheduled_value ? formatCurrencyCompact(area.scheduled_value) : `${area.weight || 0}%`
  )

  return (
    <div className="pv-tab-panel overview-tab sdx-overview animate-fade-in" role="region" aria-label="Project overview">
      {/* Row 1: KPI cards */}
      <div className="sdx-kpi-grid" role="region" aria-label="Key performance indicators">
        <div className="sdx-card sdx-kpi">
          <div className="sdx-kpi-head">
            <span className="sdx-label">Contract value</span>
            {changeOrderValue > 0 && originalContract > 0 && (
              <span className="sdx-delta up">+{((changeOrderValue / originalContract) * 100).toFixed(1)}% CO</span>
            )}
          </div>
          <div className="sdx-kpi-figure">{formatCurrencyCompact(revisedContractValue)}</div>
          <div className="sdx-kpi-sub">
            Orig {formatCurrencyCompact(originalContract)}
            {changeOrderValue > 0 && ` · +${formatCurrencyCompact(changeOrderValue)} approved COs`}
          </div>
        </div>

        <button className="sdx-card sdx-kpi sdx-kpi-clickable" onClick={() => onSetActiveTab('financials')}>
          <div className="sdx-kpi-head">
            <span className="sdx-label">Open approvals</span>
            {pendingApprovalCount > 0 && <span className="sdx-alert-dot" aria-hidden="true" />}
          </div>
          <div className="sdx-kpi-figure-row">
            <span className="sdx-kpi-figure">{pendingApprovalCount}</span>
            <span className="sdx-kpi-unit">items{pendingApprovalValue > 0 && ` · ${formatCurrencyCompact(pendingApprovalValue)}`}</span>
          </div>
          <div className="sdx-kpi-chips">
            <span className="sdx-chip warn">{projectData?.pendingTickets || 0} T&M tickets</span>
            <span className="sdx-chip info">{projectData?.corPendingCount || 0} CORs</span>
          </div>
        </button>

        <div className="sdx-card sdx-kpi">
          <div className="sdx-kpi-head">
            <span className="sdx-label">Daily burn</span>
          </div>
          <div className="sdx-kpi-figure-row">
            <span className="sdx-kpi-figure">{formatCurrencyCompact(projectData?.dailyBurn || 0)}</span>
            <span className="sdx-kpi-unit">/day</span>
          </div>
          <div className="sdx-stack-bar" aria-hidden="true">
            <span className="seg-navy" style={{ width: `${burnShares.labor}%` }} />
            <span className="seg-accent" style={{ width: `${burnShares.materials}%` }} />
            <span className="seg-amber" style={{ width: `${burnShares.equipment}%` }} />
          </div>
          <div className="sdx-kpi-sub">
            Labor {burnShares.labor}% · Matl {burnShares.materials}% · Equip {burnShares.equipment}%
          </div>
        </div>

        <div className="sdx-card sdx-kpi">
          <div className="sdx-kpi-head">
            <span className="sdx-label">Safety</span>
            <ShieldCheck size={15} className={projectData?.recentInjuryCount > 0 ? 'sdx-icon-warn' : 'sdx-icon-ok'} aria-hidden="true" />
          </div>
          <div className="sdx-kpi-figure-row">
            <span className={`sdx-kpi-figure ${projectData?.recentInjuryCount > 0 ? '' : 'ok'}`}>
              {projectData?.daysSinceLastInjury ?? '—'}
            </span>
            <span className="sdx-kpi-unit">
              {projectData?.daysSinceLastInjury != null ? 'days incident-free' : 'no incidents recorded'}
            </span>
          </div>
          <div className="sdx-kpi-sub">
            {projectData?.injuryReportsCount || 0} report{(projectData?.injuryReportsCount || 0) !== 1 ? 's' : ''} total
            {projectData?.recentInjuryCount > 0 && ` · ${projectData.recentInjuryCount} in last 30 days`}
          </div>
        </div>
      </div>

      {/* Row 2: main two-column grid */}
      <div className="sdx-main-grid">
        {/* LEFT COLUMN */}
        <div className="sdx-col">
          {/* Schedule of Values */}
          <div className="sdx-card sdx-panel sdx-sov" role="region" aria-label="Schedule of values">
            <div className="sdx-panel-header">
              <div>
                <h3 className="sdx-panel-title">{isValueBased ? 'Schedule of Values' : 'Work Areas'}</h3>
                <div className="sdx-panel-sub">
                  Field status drives earned value —{' '}
                  <span className="sdx-count-done">{areasComplete} done</span> ·{' '}
                  <span className="sdx-count-working">{areasWorking} working</span> ·{' '}
                  {areasNotStarted} not started
                </div>
              </div>
              <div className="sdx-panel-figure">
                <div className="sdx-panel-figure-value">
                  {formatCurrencyCompact(billable)} / {formatCurrencyCompact(revisedContractValue)}
                </div>
                <div className="sdx-panel-figure-label">earned / scheduled</div>
              </div>
            </div>

            <div className="sdx-sov-cols" aria-hidden="true">
              <div>Area / scope</div>
              <div className="right">Value</div>
              <div className="center">Field status</div>
              <div className="right">Earned</div>
            </div>

            <div className="sdx-sov-rows" role="list">
              {(areas || []).length === 0 && (
                <div className="sdx-empty-row">No work areas yet — add areas in Edit to build the SOV.</div>
              )}
              {(areas || []).map(area => {
                const meta = STATUS_META[area.status] || STATUS_META.not_started
                const done = area.status === 'done'
                return (
                  <div key={area.id} className="sdx-sov-row" role="listitem">
                    <div className="sdx-sov-area">
                      <span className={`sdx-dot ${meta.className}`} aria-hidden="true" />
                      <div className="sdx-sov-name-wrap">
                        <div className="sdx-sov-name">{area.name}</div>
                        {area.group_name && <div className="sdx-sov-sub">{area.group_name}</div>}
                      </div>
                    </div>
                    <div className="sdx-sov-value">{renderAreaValue(area)}</div>
                    <div className="sdx-sov-status">
                      <button
                        className={`sdx-pill ${meta.className}`}
                        onClick={() => onAreaStatusCycle?.(area)}
                        title="Click to cycle status"
                        aria-label={`${area.name}: ${meta.label}. Click to cycle status.`}
                      >
                        {meta.label}
                      </button>
                    </div>
                    <div className={`sdx-sov-earned ${done ? 'earned' : ''}`}>
                      {done ? renderAreaValue(area) : '—'}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="sdx-sov-footer">
              <div className="sdx-progress-track" aria-hidden="true">
                <div className="sdx-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="sdx-progress-figure">{progress}% earned</span>
            </div>
          </div>

          {/* Live field feed / Pending approvals */}
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
        </div>

        {/* RIGHT COLUMN */}
        <div className="sdx-col">
          {/* Contract to date waterfall */}
          <div className="sdx-card sdx-panel" role="region" aria-label="Contract to date">
            <div className="sdx-panel-header">
              <h3 className="sdx-panel-title">Contract to date</h3>
            </div>
            <div className="sdx-waterfall">
              <div className="sdx-wf-row">
                <span>Original contract</span>
                <span className="sdx-wf-val">{formatCurrencyCompact(originalContract)}</span>
              </div>
              <div className="sdx-wf-row">
                <span>+ Approved change orders</span>
                <span className="sdx-wf-val ok">+{formatCurrencyCompact(changeOrderValue)}</span>
              </div>
              <div className="sdx-wf-row sdx-wf-total">
                <span>Revised contract</span>
                <span className="sdx-wf-val strong">{formatCurrencyCompact(revisedContractValue)}</span>
              </div>
              <div className="sdx-wf-row">
                <span>Billed / earned</span>
                <span className="sdx-wf-val">{formatCurrencyCompact(billable)}</span>
              </div>
              <div className="sdx-wf-row">
                <span>Pending in review</span>
                <span className="sdx-wf-val warn">{formatCurrencyCompact(pendingApprovalValue)}</span>
              </div>
              <div className="sdx-wf-row">
                <span>Remaining to bill</span>
                <span className="sdx-wf-val accent">{formatCurrencyCompact(remainingValue)}</span>
              </div>
              <div className="sdx-stack-bar tall" aria-hidden="true">
                <span className="seg-navy" style={{ width: `${billedPct}%` }} />
                <span className="seg-amber" style={{ width: `${inReviewPct}%` }} />
              </div>
              <div className="sdx-legend">
                <span><i className="seg-navy" /> Billed</span>
                <span><i className="seg-amber" /> In review</span>
                <span><i className="seg-track" /> Remaining</span>
              </div>
            </div>
          </div>

          {/* Schedule + Labor mini cards */}
          <div className="sdx-mini-grid">
            <div className="sdx-card sdx-mini">
              <span className="sdx-label">Schedule</span>
              <div className={`sdx-mini-figure ${projectData?.scheduleStatus === 'behind' ? 'bad' : projectData?.scheduleStatus === 'ahead' ? 'ok' : ''}`}>
                {projectData?.hasScheduleData
                  ? `${projectData.scheduleVariance > 0 ? '+' : ''}${projectData.scheduleVariance}%`
                  : '—'}
              </div>
              <div className="sdx-mini-sub">
                {projectData?.hasScheduleData
                  ? `vs. baseline${selectedProject?.end_date ? ` · finish ${new Date(selectedProject.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
                  : 'No schedule dates set'}
              </div>
            </div>
            <div className="sdx-card sdx-mini">
              <span className="sdx-label">Labor vs plan</span>
              <div className={`sdx-mini-figure ${projectData?.laborStatus === 'over' ? 'bad' : projectData?.hasLaborData ? 'ok' : ''}`}>
                {projectData?.hasLaborData
                  ? `${projectData.laborVariance > 0 ? '+' : ''}${projectData.laborVariance}%`
                  : '—'}
              </div>
              <div className="sdx-mini-sub">
                {projectData?.hasLaborData
                  ? `${projectData.actualManDays || 0} of ${selectedProject?.planned_man_days || '—'} man-days`
                  : `${projectData?.actualManDays || 0} man-days logged`}
              </div>
            </div>
          </div>

          {/* Crews on site (full crew metrics: timeline + export) */}
          <OverviewCrewMetrics
            project={selectedProject}
            company={company}
            onShowToast={onShowToast}
          />
        </div>
      </div>

      {/* Needs Attention (only shown when there are items) */}
      {attentionItems.length > 0 && (
        <div className="overview-needs-attention" role="alert" aria-label={`${attentionItems.length} items need attention`}>
          <div className="overview-needs-attention__header">
            <AlertTriangle size={15} className="overview-needs-attention__icon" aria-hidden="true" />
            <span className="overview-needs-attention__title">Needs Attention</span>
            <span className="overview-needs-attention__count" aria-label={`${attentionItems.length} items`}>{attentionItems.length}</span>
          </div>
          <div className="overview-needs-attention__items">
            {attentionItems.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={`overview-needs-attention__item overview-needs-attention__item--${item.type}`}
                  onClick={() => onSetActiveTab(item.tab)}
                >
                  <Icon size={14} className="overview-needs-attention__item-icon" />
                  <span className="overview-needs-attention__item-label">{item.label}</span>
                  <ArrowRight size={13} className="overview-needs-attention__item-arrow" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Disposal Loads (read-only summary; entry is field-only) */}
      {truckLoadTrackingEnabled && (
        <DisposalSummary
          project={selectedProject}
          company={company}
          period="week"
          onShowToast={onShowToast}
        />
      )}

      {/* Punch List */}
      <Suspense fallback={<div className="loading-placeholder">Loading punch list...</div>}>
        <PunchList
          projectId={selectedProject?.id}
          areas={areas}
          companyId={companyId}
          onShowToast={onShowToast}
        />
      </Suspense>

      {/* Quick Nav + Exports */}
      <div className="overview-bottom-strip">
        <div className="overview-quick-actions">
          <button className="overview-action-btn" onClick={() => onSetActiveTab('reports')}>
            <ClipboardList size={15} />
            <span>{projectData?.dailyReportsCount || 0} Reports</span>
          </button>
          <button className="overview-action-btn" onClick={() => onSetActiveTab('financials')}>
            <DollarSign size={15} />
            <span>{projectData?.totalTickets || 0} Time and Material Tickets</span>
          </button>
          <span className="overview-action-divider" />
          <button className="overview-action-btn export" onClick={() => onExportFieldDocuments('all')}>
            <Download size={15} />
            <span>Export All</span>
          </button>
          <button className="overview-action-btn export" onClick={() => onExportFieldDocuments('daily')}>
            <Download size={14} />
            <span>Daily</span>
          </button>
          <button className="overview-action-btn export" onClick={() => onExportFieldDocuments('incidents')}>
            <Download size={14} />
            <span>Incidents</span>
          </button>
          <button className="overview-action-btn export" onClick={() => onExportFieldDocuments('crew')}>
            <Download size={14} />
            <span>Crew</span>
          </button>
        </div>
      </div>
    </div>
  )
}
