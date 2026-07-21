import { ClipboardList, DollarSign, FileText, AlertTriangle, Download, ArrowRight, Users } from 'lucide-react'
import { formatCurrencyCompact } from '../../../lib/utils'
import { OverviewCrewMetrics } from '../../overview'
import { CollapsibleSection } from '../../ui'
import DisposalSummary from '../../DisposalSummary'
import ProjectHealthOverview from '../ProjectHealthOverview'
import ScheduleOfValues from '../ScheduleOfValues'
import LiveFieldFeed from '../LiveFieldFeed'
import ContractToDate from '../ContractToDate'
import ScheduleCard from '../ScheduleCard'
import LaborCard from '../LaborCard'
import SafetyCard from '../SafetyCard'
import useProjectAnalytics from '../../../hooks/useProjectAnalytics'
import { useTradeConfig } from '../../../lib/TradeConfigContext'

/**
 * OverviewTab - Composes the project overview from extracted sections:
 * KPI cards (+ SafetyCard), ProjectHealthOverview, ScheduleOfValues,
 * LiveFieldFeed, ContractToDate, Schedule/Labor mini cards,
 * OverviewCrewMetrics (crews on site), and DisposalSummary.
 */
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
  company,
  allProjects = [],
  onShowToast,
  onSetActiveTab,
  onExportFieldDocuments,
  onAreaStatusCycle,
  onViewCOR
}) {
  const { resolvedConfig } = useTradeConfig()
  const truckLoadTrackingEnabled = resolvedConfig?.enable_truck_load_tracking ?? false

  // Key analytics pulled into Overview: health gauge + action items
  const { forecast, cashFlow, resourceData } = useProjectAnalytics({
    selectedProject,
    projectData,
    progress,
    billable,
    revisedContractValue,
    changeOrderValue,
    allProjects,
    crewCheckins: projectData?.crewCheckins || [],
    invoices: projectData?.invoices || [],
  })

  const originalContract = selectedProject?.contract_value || 0
  const isValueBased = (areas || []).some(a => a.scheduled_value > 0)

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

  // Section 4 starts collapsed when there's nothing in it yet
  const hasCrewData = (projectData?.crewDaysTracked || 0) > 0 || (projectData?.crewCheckins?.length || 0) > 0
  const hasDisposalData = (projectData?.disposalTotalLoads || 0) > 0

  return (
    <div className="pv-tab-panel overview-tab sdx-overview animate-fade-in" role="region" aria-label="Project overview">
      {/* ============ Section 1: Summary cards + SOV + Project Health ============ */}
      <section className="overview-section" aria-label="Project summary">
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

        <SafetyCard projectData={projectData} />
      </div>

      {/* SOV + Project Health side by side */}
      <div className="sdx-main-grid">
        <div className="sdx-col">
          <ScheduleOfValues
            areas={areas}
            areasComplete={areasComplete}
            areasWorking={areasWorking}
            areasNotStarted={areasNotStarted}
            billable={billable}
            revisedContractValue={revisedContractValue}
            progress={progress}
            isValueBased={isValueBased}
            onAreaStatusCycle={onAreaStatusCycle}
          />
        </div>
        <div className="sdx-col">
          <ProjectHealthOverview
            forecast={forecast}
            cashFlow={cashFlow}
            resourceData={resourceData}
            progress={progress}
            revisedContractValue={revisedContractValue}
            projectData={projectData}
            changeOrderValue={changeOrderValue}
            selectedProject={selectedProject}
          />
        </div>
      </div>
      </section>

      {/* ============ Section 2: Live Field Feed (prominent) ============ */}
      <section className="overview-section overview-section--feed" aria-label="Live field feed">
        <div className="overview-section-head">
          <h2 className="overview-section-title">
            <span className="sdx-live-dot" aria-hidden="true" />
            Live Field Feed
          </h2>
          <span className="overview-section-hint">Real-time activity from the field</span>
        </div>
        <LiveFieldFeed
          projectData={projectData}
          pendingApprovalCount={pendingApprovalCount}
          onSetActiveTab={onSetActiveTab}
          onViewCOR={onViewCOR}
        />
      </section>

      {/* ============ Section 3: Contract, Schedule & Labor (sidebar layout) ============ */}
      <section className="overview-section" aria-label="Contract and schedule">
        <div className="overview-section-head">
          <h2 className="overview-section-title">Contract &amp; Schedule</h2>
        </div>
        <div className="sdx-main-grid">
          <div className="sdx-col">
            <ContractToDate
              originalContract={originalContract}
              changeOrderValue={changeOrderValue}
              revisedContractValue={revisedContractValue}
              billable={billable}
              pendingApprovalValue={pendingApprovalValue}
            />
          </div>
          <div className="sdx-col">
            {/* Schedule + Labor mini cards */}
            <div className="sdx-mini-grid">
              <ScheduleCard projectData={projectData} selectedProject={selectedProject} />
              <LaborCard projectData={projectData} selectedProject={selectedProject} />
            </div>
          </div>
        </div>
      </section>

      {/* ============ Section 4: Crew On-Site + Disposal (collapsible) ============ */}
      <section className="overview-section" aria-label="Crew and disposal">
        <CollapsibleSection
          title="Crew On-Site & Disposal"
          icon={<Users size={16} />}
          variant="card"
          defaultOpen={hasCrewData || hasDisposalData}
          summary={!hasCrewData && !hasDisposalData ? 'No crew or disposal activity yet' : undefined}
        >
          {/* Crews on site (full crew metrics: timeline + export) */}
          <OverviewCrewMetrics
            project={selectedProject}
            company={company}
            onShowToast={onShowToast}
          />

          {/* Disposal Loads (read-only summary; entry is field-only) */}
          {truckLoadTrackingEnabled && (
            <DisposalSummary
              project={selectedProject}
              company={company}
              period="week"
              onShowToast={onShowToast}
            />
          )}
        </CollapsibleSection>
      </section>

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
