import { Suspense, lazy, useMemo } from 'react'
import { HardHat, Menu, Download } from 'lucide-react'
import { formatCurrency } from '../../../lib/utils'
import { db } from '../../../lib/supabase'
import { exportProjectFinancials, exportToQuickBooksIIF, exportCORLogCSV, exportInvoicesCSV } from '../../../lib/financialExport'
import SageExport from '../../billing/SageExport'
import HeroMetrics from '../../HeroMetrics'
import FinancialsNav from '../../FinancialsNav'
import { FinancialTrendChart } from '../../charts'
import BurnRateCard from '../../BurnRateCard'
import ProfitabilityCard from '../../ProfitabilityCard'
import CostContributorsCard from '../../CostContributorsCard'
import ProjectEquipmentCard from '../../equipment/ProjectEquipmentCard'
import ProgressBillingCard from '../../billing/ProgressBillingCard'
import ManDayCosts from '../../ManDayCosts'
import { TicketSkeleton } from '../../ui'

const TMList = lazy(() => import('../../TMList'))
const CORLogPreview = lazy(() => import('../../cor/CORLogPreview'))
const CORList = lazy(() => import('../../cor/CORList'))
const BillingCenter = lazy(() => import('../../billing/BillingCenter'))
const SageExportPanel = lazy(() => import('../../SageExportPanel'))

export default function FinancialsTab({
  selectedProject,
  company,
  user,
  projectData,
  progress,
  billable,
  changeOrderValue,
  revisedContractValue,
  areas,
  financialsSection,
  setFinancialsSection,
  financialsSidebarCollapsed,
  financialsSidebarMobileOpen,
  onToggleFinancialsSidebar,
  onToggleMobileSidebar,
  onCloseMobileSidebar,
  financialsNavStats,
  // COR state
  corListExpanded,
  corRefreshKey,
  corDisplayMode,
  setCORDisplayMode,
  onToggleCORList,
  onCreateCOR,
  onViewCOR,
  onEditCOR,
  // T&M state
  tmViewMode,
  onViewAllTickets,
  onBackToTMPreview,
  // Equipment
  equipmentRefreshKey,
  onAddEquipment,
  onEditEquipment,
  // Billing
  drawRequestRefreshKey,
  onCreateDraw,
  onViewDraw,
  // Costs
  onAddCost,
  onDeleteCost,
  // Exports sub-tab
  costCodes = [],
  allProjects = [],
  onShowToast
}) {
  // Billing workflow stage counts for the Billing sub-tab pipeline
  const billingWorkflowStats = useMemo(() => ({
    pendingReview: (projectData?.corPendingCount || 0) + (projectData?.pendingTickets || 0),
    approved: (projectData?.corStats?.approved_count || 0) + (projectData?.approvedTickets || 0)
  }), [projectData?.corPendingCount, projectData?.pendingTickets, projectData?.corStats?.approved_count, projectData?.approvedTickets])

  // Contextual CSV export - exports data relevant to the active sub-tab
  const handleExportCSV = async () => {
    if (financialsSection === 'cors') {
      exportCORLogCSV(projectData?.changeOrders || [], selectedProject)
      return
    }
    if (financialsSection === 'billing') {
      try {
        const invoices = await db.getProjectInvoices(selectedProject.id)
        exportInvoicesCSV(invoices || [], selectedProject)
      } catch (error) {
        console.error('Error exporting invoices:', error)
        onShowToast?.('Error exporting invoices', 'error')
      }
      return
    }
    exportProjectFinancials(selectedProject, {
      earnedRevenue: billable,
      approvedCORs: null,
      laborByDate: projectData?.laborByDate,
      customCosts: projectData?.customCosts
    })
  }

  const exportCSVLabel = financialsSection === 'cors'
    ? 'Export CORs CSV'
    : financialsSection === 'billing'
      ? 'Export Invoices CSV'
      : 'Export CSV'

  return (
    <div className="pv-tab-panel financials-tab">
      {/* Export Actions - hidden on the Tickets sub-tab (own CSV/Excel/PDF exports)
          and on the Exports sub-tab (full export center) */}
      {financialsSection !== 'tickets' && financialsSection !== 'exports' && (
        <div className="export-actions">
          <button
            className="btn btn-ghost btn-small"
            onClick={handleExportCSV}
            title={
              financialsSection === 'cors'
                ? 'Export change order log as CSV'
                : financialsSection === 'billing'
                  ? 'Export invoices as CSV'
                  : 'Export project financial summary as CSV'
            }
          >
            <Download size={14} /> {exportCSVLabel}
          </button>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => exportToQuickBooksIIF(selectedProject, {
              totalLaborCost: projectData?.laborCost || 0
            })}
          >
            <Download size={14} /> QuickBooks
          </button>
          <SageExport
            project={selectedProject}
            company={company}
            onShowToast={onShowToast}
          />
        </div>
      )}
      {/* Key Metrics - full cards on Overview, compact one-line strip on sub-tabs */}
      <HeroMetrics
        contractValue={selectedProject?.contract_value || 0}
        earnedRevenue={billable}
        totalCosts={projectData?.allCostsTotal || 0}
        profit={projectData?.currentProfit || 0}
        progress={progress}
        corApprovedValue={changeOrderValue}
        loading={!projectData}
        compact={financialsSection !== 'overview'}
      />

      {/* Split Layout with Collapsible Navigation */}
      <div className={`financials-layout ${financialsSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Mobile Menu Toggle Button */}
        <button
          className="financials-mobile-menu-toggle"
          onClick={onToggleMobileSidebar}
          aria-label="Open navigation menu"
          title="Open navigation menu"
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>

        {/* Mobile Overlay/Backdrop */}
        {financialsSidebarMobileOpen && (
          <div
            className="financials-sidebar-overlay"
            onClick={onCloseMobileSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Navigation - Always visible, collapsible */}
        <div className={`financials-sidebar ${financialsSidebarCollapsed ? 'collapsed' : ''} ${financialsSidebarMobileOpen ? 'mobile-open' : ''}`}>
          <FinancialsNav
            activeSection={financialsSection}
            onSectionChange={(section) => {
              setFinancialsSection(section)
              onCloseMobileSidebar()
            }}
            collapsed={financialsSidebarCollapsed}
            onToggleCollapse={onToggleFinancialsSidebar}
            onMobileClose={onCloseMobileSidebar}
            stats={financialsNavStats}
          />
        </div>

        {/* Main Content Area */}
        <div className="financials-main">
          {/* OVERVIEW SECTION */}
          {financialsSection === 'overview' && (
            <div className="financials-overview animate-fade-in">
              <FinancialTrendChart
                projectData={projectData}
                project={selectedProject}
                tmTickets={projectData?.tmTickets || []}
                corStats={projectData?.corStats}
                areas={areas}
                changeOrderValue={changeOrderValue}
              />

              <div className="financials-analysis-row stagger-children">
                <BurnRateCard
                  dailyBurn={projectData?.dailyBurn || 0}
                  totalBurn={projectData?.totalBurn || 0}
                  daysWorked={projectData?.totalBurnDays || 0}
                  laborCost={projectData?.laborCost || 0}
                  materialsEquipmentCost={projectData?.materialsEquipmentCost || 0}
                  projectEquipmentCost={projectData?.projectEquipmentCost || 0}
                  customCostTotal={projectData?.customCostTotal || 0}
                  progress={progress}
                  contractValue={revisedContractValue}
                  laborByDate={projectData?.laborByDate || []}
                  materialsEquipmentByDate={projectData?.materialsEquipmentByDate || []}
                />
                <ProfitabilityCard
                  revenue={billable}
                  totalCosts={projectData?.allCostsTotal || 0}
                  contractValue={revisedContractValue}
                  progress={progress}
                />
              </div>

              <CostContributorsCard
                laborCost={projectData?.laborCost || 0}
                materialsEquipmentCost={projectData?.materialsEquipmentCost || 0}
                projectEquipmentCost={projectData?.projectEquipmentCost || 0}
                customCosts={projectData?.customCosts || []}
                onAddCost={onAddCost}
                onDeleteCost={onDeleteCost}
              />

              <ProjectEquipmentCard
                key={equipmentRefreshKey}
                project={selectedProject}
                onAddEquipment={onAddEquipment}
                onEditEquipment={onEditEquipment}
                onShowToast={onShowToast}
              />

              <ProgressBillingCard
                key={drawRequestRefreshKey}
                project={selectedProject}
                areas={areas}
                corStats={projectData?.corStats}
                onCreateDraw={onCreateDraw}
                onViewDraw={onViewDraw}
                onShowToast={onShowToast}
              />

              <details className="financials-details">
                <summary className="financials-details-summary">
                  <HardHat size={16} />
                  <span>Labor Details</span>
                  <span className="financials-details-value">{formatCurrency(projectData?.laborCost || 0)}</span>
                </summary>
                <div className="financials-details-content">
                  <ManDayCosts project={selectedProject} company={company} onShowToast={onShowToast} />
                </div>
              </details>
            </div>
          )}

          {/* CHANGE ORDERS SECTION */}
          {financialsSection === 'cors' && (
            <div className="financials-cors animate-fade-in">
              <div className="financials-section cor-section-primary">
                <Suspense fallback={<TicketSkeleton />}>
                  <CORLogPreview
                    project={selectedProject}
                    company={company}
                    onShowToast={onShowToast}
                    onToggleList={onToggleCORList}
                    showingList={corListExpanded}
                    onViewFullLog={() => setCORDisplayMode('log')}
                    onCreateCOR={onCreateCOR}
                    onViewCOR={onViewCOR}
                  />
                </Suspense>
              </div>

              {corListExpanded && (
                <div className="financials-section cor-section-list animate-fade-in" style={{ marginTop: '1rem' }}>
                  <Suspense fallback={<TicketSkeleton />}>
                    <CORList
                      project={selectedProject}
                      company={company}
                      areas={areas}
                      refreshKey={corRefreshKey}
                      onShowToast={onShowToast}
                      previewMode={false}
                      onViewAll={onToggleCORList}
                      onDisplayModeChange={setCORDisplayMode}
                      onCreateCOR={onCreateCOR}
                      onViewCOR={onViewCOR}
                      onEditCOR={onEditCOR}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          )}

          {/* T&M TICKETS SECTION */}
          {financialsSection === 'tickets' && (
            <div className="financials-tickets animate-fade-in">
              <div className="financials-section tm-section">
                {tmViewMode === 'full' && (
                  <button className="section-back-btn" onClick={onBackToTMPreview}>
                    &larr; Back to summary
                  </button>
                )}
                <Suspense fallback={<TicketSkeleton />}>
                  <TMList
                    project={selectedProject}
                    company={company}
                    onShowToast={onShowToast}
                    compact={tmViewMode === 'preview'}
                    previewMode={tmViewMode === 'preview'}
                    onViewAll={onViewAllTickets}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* BILLING SECTION */}
          {financialsSection === 'billing' && (
            <div className="financials-billing animate-fade-in">
              <Suspense fallback={<TicketSkeleton />}>
                <BillingCenter
                  project={selectedProject}
                  company={company}
                  user={user}
                  onShowToast={onShowToast}
                  workflowStats={billingWorkflowStats}
                />
              </Suspense>
            </div>
          )}

          {/* EXPORTS SECTION (CSV, QuickBooks, Sage 300, AIA) */}
          {financialsSection === 'exports' && (
            <div className="financials-exports animate-fade-in">
              <Suspense fallback={<TicketSkeleton />}>
                <SageExportPanel
                  project={selectedProject}
                  company={company}
                  areas={areas}
                  changeOrders={projectData?.changeOrders || []}
                  costCodes={costCodes}
                  financialData={projectData || {}}
                  allProjects={allProjects}
                  projectDataMap={{}}
                  onShowToast={onShowToast}
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
