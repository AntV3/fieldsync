import { ClipboardList, FileText, Package, AlertTriangle, ArrowRight } from 'lucide-react'
import { formatCurrency } from '../../../lib/utils'
import { OverviewProgressGauge, OverviewFinancialCard } from '../../overview'

/**
 * OverviewTab
 *
 * Streamlined executive summary — answers "What's the status right now?"
 * 1. Progress + Financials (above the fold)
 * 2. Work Areas status
 * 3. Needs Attention alerts (only when issues exist)
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
  companyId,
  onShowToast,
  onSetActiveTab,
  onExportFieldDocuments
}) {
  // Build attention items — only actionable issues
  const attentionItems = []
  if (projectData?.urgentMaterialRequests > 0) {
    attentionItems.push({
      id: 'urgent-materials',
      type: 'warning',
      icon: AlertTriangle,
      label: `${projectData.urgentMaterialRequests} urgent material request${projectData.urgentMaterialRequests !== 1 ? 's' : ''}`,
      tab: 'reports'
    })
  } else if (projectData?.pendingMaterialRequests > 0) {
    attentionItems.push({
      id: 'pending-materials',
      type: 'info',
      icon: Package,
      label: `${projectData.pendingMaterialRequests} material request${projectData.pendingMaterialRequests !== 1 ? 's' : ''} pending`,
      tab: 'reports'
    })
  }
  if (projectData?.pendingTickets > 0) {
    attentionItems.push({
      id: 'pending-tm',
      type: 'warning',
      icon: ClipboardList,
      label: `${projectData.pendingTickets} T&M ticket${projectData.pendingTickets !== 1 ? 's' : ''} need approval`,
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

  return (
    <div className="pv-tab-panel overview-tab animate-fade-in" role="region" aria-label="Project overview">
      {/* Row 1: Hero - Progress + Financials (Critical KPIs above the fold) */}
      <div className="overview-hero-split" role="region" aria-label="Progress and financial summary">
        <OverviewProgressGauge
          progress={progress}
          areasComplete={areasComplete}
          totalAreas={areas.length}
          areasWorking={areasWorking}
        />
        <OverviewFinancialCard
          earnedRevenue={billable}
          totalCosts={projectData?.allCostsTotal || 0}
          laborCost={projectData?.laborCost || 0}
          equipmentCost={projectData?.projectEquipmentCost || 0}
          materialsCost={projectData?.materialsEquipmentCost || 0}
          otherCost={projectData?.customCostTotal || 0}
          contractValue={revisedContractValue}
        />
      </div>

      {/* Row 2: Work Areas */}
      <div className="overview-section-card overview-work-areas-card" role="region" aria-label="Work areas">
        <div className="section-card-header">
          <h3>Work Areas</h3>
          <div className="section-card-badges">
            {areasComplete > 0 && <span className="section-badge done">{areasComplete} Done</span>}
            {areasWorking > 0 && <span className="section-badge working">{areasWorking} Active</span>}
            {areasNotStarted > 0 && <span className="section-badge pending">{areasNotStarted} Pending</span>}
          </div>
        </div>
        <div className="work-areas-list work-areas-scroll stagger-areas" role="list">
          {areas.map(area => (
            <div key={area.id} className={`work-area-item ${area.status}`} role="listitem" aria-label={`${area.name}: ${area.status === 'done' ? 'Complete' : area.status === 'working' ? 'In progress' : 'Not started'}`}>
              <div className="work-area-status" aria-hidden="true">
                {area.status === 'done' && <span className="status-icon done">&#10003;</span>}
                {area.status === 'working' && <span className="status-icon working">&#9679;</span>}
                {area.status === 'not_started' && <span className="status-icon pending">&#9675;</span>}
              </div>
              <div className="work-area-info">
                <span className="work-area-name">{area.name}</span>
                <span className="work-area-weight">
                  {area.scheduled_value ? formatCurrency(area.scheduled_value) : `${area.weight}%`}
                </span>
              </div>
              <div className="work-area-bar">
                <div
                  className={`work-area-fill ${area.status}`}
                  style={{ width: area.status === 'done' ? '100%' : area.status === 'working' ? '50%' : '0%' }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Needs Attention (only shown when there are items) */}
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
    </div>
  )
}
