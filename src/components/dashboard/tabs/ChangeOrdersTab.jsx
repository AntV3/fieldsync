/**
 * ChangeOrdersTab - COR list and management
 *
 * Currently rendered as a sub-section within FinancialsTab (financialsSection === 'cors').
 * This component can be used standalone if change orders get their own top-level tab.
 */
import { Suspense, lazy } from 'react'
import { TicketSkeleton } from '../../ui'

const CORLogPreview = lazy(() => import('../../cor/CORLogPreview'))
const CORList = lazy(() => import('../../cor/CORList'))

export default function ChangeOrdersTab({
  selectedProject,
  company,
  areas,
  corListExpanded,
  corRefreshKey,
  setCORDisplayMode,
  onToggleCORList,
  onCreateCOR,
  onViewCOR,
  onEditCOR,
  onShowToast
}) {
  return (
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
  )
}
