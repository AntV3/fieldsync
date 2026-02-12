import { Suspense, lazy } from 'react'
import { ClipboardList, DollarSign, FileText, Package, AlertTriangle, Download } from 'lucide-react'
import { formatCurrency } from '../../../lib/utils'
import { OverviewProgressGauge, OverviewFinancialCard, OverviewCrewMetrics } from '../../overview'
import EarnedValueCard from '../../charts/EarnedValueCard'

const PhotoTimeline = lazy(() => import('../../PhotoTimeline'))
const PunchList = lazy(() => import('../../PunchList'))

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
  return (
    <div className="pv-tab-panel overview-tab animate-fade-in">
      {/* Row 1: Hero - Progress + Financials */}
      <div className="overview-hero-split">
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
          disposalCost={projectData?.haulOffCost || 0}
          equipmentCost={projectData?.materialsEquipmentCost || 0}
          materialsCost={0}
          otherCost={projectData?.customCostTotal || 0}
          contractValue={revisedContractValue}
        />
      </div>

      {/* Row 2: Two-column grid - Crew Metrics | Work Areas */}
      <div className="overview-two-col">
        {/* Left: Crew On-Site */}
        <OverviewCrewMetrics
          project={selectedProject}
          onShowToast={onShowToast}
        />

        {/* Right: Work Areas */}
        <div className="overview-section-card overview-work-areas-card">
          <div className="section-card-header">
            <h3>Work Areas</h3>
            <div className="section-card-badges">
              {areasComplete > 0 && <span className="section-badge done">{areasComplete} Done</span>}
              {areasWorking > 0 && <span className="section-badge working">{areasWorking} Active</span>}
              {areasNotStarted > 0 && <span className="section-badge pending">{areasNotStarted} Pending</span>}
            </div>
          </div>
          <div className="work-areas-list work-areas-scroll stagger-areas">
            {areas.map(area => (
              <div key={area.id} className={`work-area-item ${area.status}`}>
                <div className="work-area-status">
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
      </div>

      {/* Row 3: Earned Value Analysis */}
      {selectedProject?.contract_value > 0 && (
        <EarnedValueCard
          contractValue={selectedProject.contract_value}
          changeOrderValue={changeOrderValue || 0}
          progressPercent={progress}
          actualCosts={projectData?.allCostsTotal || 0}
          startDate={selectedProject.start_date}
          endDate={selectedProject.end_date}
          areas={areas}
        />
      )}

      {/* Row 4: Photo Timeline + Punch List side by side */}
      <div className="overview-two-col">
        <Suspense fallback={<div className="loading-placeholder">Loading photos...</div>}>
          <PhotoTimeline
            projectId={selectedProject?.id}
            areas={areas}
            onShowToast={onShowToast}
          />
        </Suspense>
        <Suspense fallback={<div className="loading-placeholder">Loading punch list...</div>}>
          <PunchList
            projectId={selectedProject?.id}
            areas={areas}
            companyId={companyId}
            onShowToast={onShowToast}
          />
        </Suspense>
      </div>

      {/* Row 5: Bottom strip - Attention + Quick Nav + Exports */}
      <div className="overview-bottom-strip">
        {/* Attention items inline */}
        {(projectData?.pendingTickets > 0 || projectData?.changeOrderPending > 0 || projectData?.pendingMaterialRequests > 0 || projectData?.urgentMaterialRequests > 0) && (
          <div className="overview-attention-inline">
            {projectData?.urgentMaterialRequests > 0 && (
              <div className="attention-chip warning" onClick={() => onSetActiveTab('reports')}>
                <AlertTriangle size={14} />
                <span>{projectData.urgentMaterialRequests} urgent material request{projectData.urgentMaterialRequests !== 1 ? 's' : ''}</span>
              </div>
            )}
            {projectData?.pendingMaterialRequests > 0 && !projectData?.urgentMaterialRequests && (
              <div className="attention-chip info" onClick={() => onSetActiveTab('reports')}>
                <Package size={14} />
                <span>{projectData.pendingMaterialRequests} material request{projectData.pendingMaterialRequests !== 1 ? 's' : ''} pending</span>
              </div>
            )}
            {projectData?.pendingTickets > 0 && (
              <div className="attention-chip warning" onClick={() => onSetActiveTab('financials')}>
                <ClipboardList size={14} />
                <span>{projectData.pendingTickets} T&M pending</span>
              </div>
            )}
            {projectData?.changeOrderPending > 0 && (
              <div className="attention-chip info" onClick={() => onSetActiveTab('financials')}>
                <FileText size={14} />
                <span>{projectData.changeOrderPending} CO pending</span>
              </div>
            )}
          </div>
        )}

        {/* Quick nav + export buttons */}
        <div className="overview-quick-actions">
          <button className="overview-action-btn" onClick={() => onSetActiveTab('reports')}>
            <ClipboardList size={15} />
            <span>{projectData?.dailyReportsCount || 0} Reports</span>
          </button>
          <button className="overview-action-btn" onClick={() => onSetActiveTab('financials')}>
            <DollarSign size={15} />
            <span>{projectData?.totalTickets || 0} T&M Tickets</span>
          </button>
          <span className="overview-action-divider" />
          <button className="overview-action-btn export" onClick={() => onExportFieldDocuments('all')}>
            <Download size={15} />
            <span>Export All Docs</span>
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
