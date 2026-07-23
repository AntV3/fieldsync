import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { ClipboardList, MessageSquareText, FileCheck, NotebookPen, ListChecks, HardHat, Menu, Plus } from 'lucide-react'
import { db } from '../../../lib/supabase'
import { safeAsync } from '../../../lib/errorHandler'
import { TicketSkeleton } from '../../ui'
import TabSubNav from './TabSubNav'
import ReportsTab from './ReportsTab'

const RFIList = lazy(() => import('../../RFIList'))
const SubmittalList = lazy(() => import('../../SubmittalList'))
const FieldObservationsList = lazy(() => import('../../FieldObservationsList'))
const PunchList = lazy(() => import('../../PunchList'))

/**
 * FieldActivityTab
 *
 * Combined tab for everything the crew generates in the field:
 * daily reports, RFIs, submittals, observations, and the punch list.
 * Uses the same collapsible sidebar pattern as the Financials tab.
 */
export default function FieldActivityTab({
  selectedProject,
  projectData,
  areas,
  company,
  user,
  onShowToast,
  fieldSection,
  setFieldSection
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)

  // Counts for sections not covered by projectData (RFIs, submittals, observations)
  const [sectionCounts, setSectionCounts] = useState({ rfis: null, submittals: null, observations: null })

  useEffect(() => {
    if (!selectedProject?.id) return
    let cancelled = false
    const loadCounts = async () => {
      const [rfiSummary, submittalSummary, observations] = await Promise.all([
        safeAsync(() => db.getRFISummary(selectedProject.id), { fallback: null, context: { operation: 'getRFISummary', projectId: selectedProject.id } }),
        safeAsync(() => db.getSubmittalSummary(selectedProject.id), { fallback: null, context: { operation: 'getSubmittalSummary', projectId: selectedProject.id } }),
        safeAsync(() => db.getFieldObservations(selectedProject.id), { fallback: [], context: { operation: 'getFieldObservations', projectId: selectedProject.id } })
      ])
      if (cancelled) return
      setSectionCounts({
        rfis: rfiSummary?.total ?? 0,
        submittals: submittalSummary?.total ?? 0,
        observations: (observations || []).length
      })
    }
    loadCounts()
    return () => { cancelled = true }
    // Re-fetch when switching sections so counts stay fresh after creating items
  }, [selectedProject?.id, fieldSection])

  // Prevent body scroll when the mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarMobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarMobileOpen])

  const reportsCount = projectData?.dailyReportsCount || 0
  const punchListCount = (projectData?.punchListItems || []).length

  const navItems = useMemo(() => ([
    {
      id: 'reports',
      label: 'Reports',
      shortLabel: 'Reports',
      icon: ClipboardList,
      description: 'Daily logs, incidents & crew',
      count: reportsCount
    },
    {
      id: 'rfis',
      label: 'RFIs',
      shortLabel: 'RFIs',
      icon: MessageSquareText,
      description: 'Requests for information',
      count: sectionCounts.rfis ?? 0
    },
    {
      id: 'submittals',
      label: 'Submittals',
      shortLabel: 'Submittals',
      icon: FileCheck,
      description: 'Shop drawings & samples',
      count: sectionCounts.submittals ?? 0
    },
    {
      id: 'observations',
      label: 'Observations',
      shortLabel: 'Observ.',
      icon: NotebookPen,
      description: 'Field photos & notes',
      count: sectionCounts.observations ?? 0
    },
    {
      id: 'punchlist',
      label: 'Punch List',
      shortLabel: 'Punch',
      icon: ListChecks,
      description: 'Items to close out',
      count: punchListCount
    }
  ]), [reportsCount, sectionCounts, punchListCount])

  // Onboarding state: counts loaded and every section is empty
  const countsLoaded = sectionCounts.rfis !== null
  const allEmpty = countsLoaded && navItems.every(item => item.count === 0)

  const handleSectionChange = (section) => {
    setFieldSection(section)
    setSidebarMobileOpen(false)
  }

  return (
    <div className="pv-tab-panel field-activity-tab">
      {/* Onboarding message when there's no field data at all yet */}
      {allEmpty && (
        <div className="field-onboarding" role="status">
          <div className="field-onboarding-icon" aria-hidden="true">
            <HardHat size={28} />
          </div>
          <div className="field-onboarding-body">
            <h3>No field data yet</h3>
            <p>
              Field data like reports, RFIs, and submittals will appear here once your crew
              starts working. Create your first daily report to get started.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => handleSectionChange('reports')}>
            <Plus size={15} />
            New Report
          </button>
        </div>
      )}

      {/* Split Layout with Collapsible Navigation (same pattern as Financials) */}
      <div className={`financials-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Mobile Menu Toggle Button */}
        <button
          className="financials-mobile-menu-toggle"
          onClick={() => setSidebarMobileOpen(true)}
          aria-label="Open navigation menu"
          title="Open navigation menu"
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>

        {/* Mobile Overlay/Backdrop */}
        {sidebarMobileOpen && (
          <div
            className="financials-sidebar-overlay"
            onClick={() => setSidebarMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Navigation */}
        <div className={`financials-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarMobileOpen ? 'mobile-open' : ''}`}>
          <TabSubNav
            title="Field Activity"
            ariaLabel="Field activity sections"
            items={navItems}
            activeSection={fieldSection}
            onSectionChange={handleSectionChange}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
            onMobileClose={() => setSidebarMobileOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="financials-main">
          {fieldSection === 'reports' && (
            <ReportsTab
              selectedProject={selectedProject}
              projectData={projectData}
              areas={areas}
              company={company}
              user={user}
              onShowToast={onShowToast}
            />
          )}

          {fieldSection === 'rfis' && (
            <div className="animate-fade-in">
              <Suspense fallback={<TicketSkeleton />}>
                <RFIList
                  project={selectedProject}
                  company={company}
                  onShowToast={onShowToast}
                />
              </Suspense>
            </div>
          )}

          {fieldSection === 'submittals' && (
            <div className="animate-fade-in">
              <Suspense fallback={<TicketSkeleton />}>
                <SubmittalList
                  project={selectedProject}
                  company={company}
                  onShowToast={onShowToast}
                />
              </Suspense>
            </div>
          )}

          {fieldSection === 'observations' && (
            <div className="animate-fade-in">
              <Suspense fallback={<TicketSkeleton />}>
                <FieldObservationsList
                  project={selectedProject}
                  company={company}
                  onShowToast={onShowToast}
                />
              </Suspense>
            </div>
          )}

          {fieldSection === 'punchlist' && (
            <div className="animate-fade-in">
              <Suspense fallback={<TicketSkeleton />}>
                <PunchList
                  projectId={selectedProject?.id}
                  areas={areas}
                  companyId={company?.id || selectedProject?.company_id}
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
