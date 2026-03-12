import { Suspense, lazy } from 'react'
import { Menu, Download } from 'lucide-react'
import { exportProjectFinancials, exportToQuickBooksIIF } from '../../../lib/financialExport'
import HeroMetrics from '../../HeroMetrics'
import FinancialsNav from '../../FinancialsNav'
import { FinancialTrendChart } from '../../charts'
import BurnRateCard from '../../BurnRateCard'
import ProfitabilityCard from '../../ProfitabilityCard'
import { TicketSkeleton } from '../../ui'

const TMList = lazy(() => import('../../TMList'))
const CORLogPreview = lazy(() => import('../../cor/CORLogPreview'))
const CORList = lazy(() => import('../../cor/CORList'))
const BillingCenter = lazy(() => import('../../billing/BillingCenter'))

/**
 * FinancialsTab
 *
 * Streamlined financial management:
 * - Hero metrics (contract, revenue, costs, profit)
 * - Overview: Trend chart + Burn Rate + Profitability
 * - Change Orders, T&M Tickets, Billing (via sidebar nav)
 */
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
  onShowToast
}) {
  return (
    <div className="pv-tab-panel financials-tab">
      {/* Export Actions */}
      <div className="export-actions">
        <button
          className="btn btn-ghost btn-small"
          onClick={() => exportProjectFinancials(selectedProject, {
            earnedRevenue: billable,
            approvedCORs: null,
            laborByDate: projectData?.laborByDate,
            customCosts: projectData?.customCosts
          })}
        >
          <Download size={14} /> Export CSV
        </button>
        <button
          className="btn btn-ghost btn-small"
          onClick={() => exportToQuickBooksIIF(selectedProject, {
            totalLaborCost: projectData?.laborCost || 0
          })}
        >
          <Download size={14} /> QuickBooks
        </button>
      </div>

      {/* Key Metrics - Hero Section */}
      <HeroMetrics
        contractValue={selectedProject?.contract_value || 0}
        earnedRevenue={billable}
        totalCosts={projectData?.allCostsTotal || 0}
        profit={projectData?.currentProfit || 0}
        progress={progress}
        corApprovedValue={changeOrderValue}
        loading={!projectData}
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

        {/* Sidebar Navigation */}
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
          {/* OVERVIEW SECTION — Trend + Burn Rate + Profitability */}
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
            </div>
          )}

          {/* CHANGE ORDERS SECTION */}
          {financialsSection === 'cors' && (
            <div className="financials-cors animate-fade-in">
              <div className="financials-section cor-section-primary">
                <Suspense fallback={<TicketSkeleton />}>
                  <CORLogPreview
                    project={selectedProject}
                    onShowToast={onShowToast}
                    onToggleList={onToggleCORList}
                    showingList={corListExpanded}
                    onViewFullLog={() => setCORDisplayMode('log')}
                    onCreateCOR={onCreateCOR}
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
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
