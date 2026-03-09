import { Suspense, lazy } from 'react'
import { db } from '../../lib/supabase'

const CORForm = lazy(() => import('../cor/CORForm'))
const CORDetail = lazy(() => import('../cor/CORDetail'))
const CORLog = lazy(() => import('../cor/CORLog'))
const DrawRequestModal = lazy(() => import('../billing/DrawRequestModal'))
const EquipmentModal = lazy(() => import('../equipment/EquipmentModal'))
const AddCostModal = lazy(() => import('../AddCostModal'))

/**
 * FinancialsModals - All financial-related modals extracted from Dashboard.jsx
 *
 * Renders COR form/detail/log, equipment, draw request, and cost modals.
 * Controlled by state from useFinancialsState hook.
 */
export default function FinancialsModals({
  selectedProject,
  company,
  user,
  areas,
  projectsData,
  onShowToast,
  debouncedRefresh,
  projectDetailsCacheRef,
  loadProjects,
  // From useFinancialsState
  showCORForm,
  editingCOR,
  showCORDetail,
  viewingCOR,
  corDisplayMode,
  showAddCostModal,
  savingCost,
  setSavingCost,
  showEquipmentModal,
  editingEquipment,
  showDrawRequestModal,
  editingDrawRequest,
  handleCloseCORForm,
  handleCORFormSaved,
  handleCloseCORDetail,
  handleCORDetailEdit,
  handleCloseCORLog,
  handleCloseAddCostModal,
  handleCloseEquipmentModal,
  handleEquipmentSaved,
  handleCloseDrawRequestModal,
  handleDrawRequestSaved,
  refreshCORs,
}) {
  return (
    <>
      {/* COR Form Modal */}
      {showCORForm && (
        <Suspense fallback={null}>
          <CORForm
            project={selectedProject}
            company={company}
            areas={areas}
            existingCOR={editingCOR}
            onClose={handleCloseCORForm}
            onSaved={handleCORFormSaved}
            onShowToast={onShowToast}
          />
        </Suspense>
      )}

      {/* COR Detail Modal */}
      {showCORDetail && viewingCOR && (
        <Suspense fallback={null}>
          <CORDetail
            cor={viewingCOR}
            project={selectedProject}
            company={company}
            areas={areas}
            onClose={handleCloseCORDetail}
            onEdit={handleCORDetailEdit}
            onShowToast={onShowToast}
            onStatusChange={() => {
              refreshCORs()
              debouncedRefresh({ refreshCOR: true })
            }}
          />
        </Suspense>
      )}

      {/* COR Log Modal */}
      {corDisplayMode === 'log' && selectedProject && (
        <div className="cor-log-modal-overlay" onClick={handleCloseCORLog}>
          <div className="cor-log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cor-log-modal-header">
              <h2>Change Order Log</h2>
              <button
                className="cor-log-modal-close"
                onClick={handleCloseCORLog}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="cor-log-modal-content">
              <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                <CORLog project={selectedProject} company={company} onShowToast={onShowToast} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Add Cost Modal */}
      {showAddCostModal && (
        <Suspense fallback={null}>
          <AddCostModal
            onClose={handleCloseAddCostModal}
            saving={savingCost}
            onSave={async (costData) => {
              try {
                setSavingCost(true)
                await db.addProjectCost(selectedProject.id, company.id, costData)
                handleCloseAddCostModal()
                projectDetailsCacheRef.current.delete(selectedProject.id)
                loadProjects()
                onShowToast('Cost added successfully', 'success')
              } catch (err) {
                console.error('Error adding cost:', err)
                onShowToast('Error adding cost', 'error')
              } finally {
                setSavingCost(false)
              }
            }}
          />
        </Suspense>
      )}

      {/* Equipment Modal */}
      {showEquipmentModal && (
        <Suspense fallback={null}>
          <EquipmentModal
            project={selectedProject}
            company={company}
            user={user}
            editItem={editingEquipment}
            onSave={() => {
              const msg = handleEquipmentSaved()
              onShowToast(msg, 'success')
            }}
            onClose={handleCloseEquipmentModal}
          />
        </Suspense>
      )}

      {/* Draw Request Modal */}
      {showDrawRequestModal && (
        <Suspense fallback={null}>
          <DrawRequestModal
            project={selectedProject}
            company={company}
            areas={areas}
            corStats={projectsData.find(p => p.id === selectedProject?.id)?.corStats}
            editDrawRequest={editingDrawRequest}
            onSave={() => {
              const msg = handleDrawRequestSaved()
              onShowToast(msg, 'success')
            }}
            onClose={handleCloseDrawRequestModal}
          />
        </Suspense>
      )}
    </>
  )
}
