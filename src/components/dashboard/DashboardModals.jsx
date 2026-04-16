import { lazy, Suspense } from 'react'
import { X } from 'lucide-react'

const ShareModal = lazy(() => import('../ShareModal'))
const NotificationSettings = lazy(() => import('../NotificationSettings'))
const CORForm = lazy(() => import('../cor/CORForm'))
const CORDetail = lazy(() => import('../cor/CORDetail'))
const CORLog = lazy(() => import('../cor/CORLog'))
const DrawRequestModal = lazy(() => import('../billing/DrawRequestModal'))
const EquipmentModal = lazy(() => import('../equipment/EquipmentModal'))
const AddCostModal = lazy(() => import('../AddCostModal'))

export default function DashboardModals(props) {
  const {
    selectedProject, company, user, areas,
    showShareModal, onCloseShareModal, onShareCreated, onShowToast,
    showNotificationSettings, onCloseNotificationSettings,
    showCORForm, editingCOR, onCloseCORForm, onCORSaved,
    showCORDetail, viewingCOR, onCloseCORDetail, onEditCORFromDetail, onCORStatusChange,
    corDisplayMode, onCloseCORLog,
    showAddCostModal, savingCost, onCloseAddCostModal, onSaveCost,
    showEquipmentModal, editingEquipment, onEquipmentSaved, onCloseEquipmentModal,
    showDrawRequestModal, editingDrawRequest, projectsData, onDrawRequestSaved, onCloseDrawRequestModal,
  } = props

  return (
    <>
      {/* Share Modal */}
      {showShareModal && (
        <Suspense fallback={null}>
          <ShareModal
            project={selectedProject}
            user={user}
            onClose={onCloseShareModal}
            onShareCreated={onShareCreated}
          />
        </Suspense>
      )}

      {/* Notification Settings */}
      {showNotificationSettings && (
        <div className="notification-settings-modal">
          <Suspense fallback={null}>
            <NotificationSettings
              project={selectedProject}
              company={company}
              onShowToast={onShowToast}
              onClose={onCloseNotificationSettings}
            />
          </Suspense>
        </div>
      )}

      {/* COR Form */}
      {showCORForm && (
        <Suspense fallback={null}>
          <CORForm
            project={selectedProject}
            company={company}
            areas={areas}
            existingCOR={editingCOR}
            onClose={onCloseCORForm}
            onSaved={onCORSaved}
            onShowToast={onShowToast}
          />
        </Suspense>
      )}

      {/* COR Detail */}
      {showCORDetail && viewingCOR && (
        <Suspense fallback={null}>
          <CORDetail
            cor={viewingCOR}
            project={selectedProject}
            company={company}
            areas={areas}
            onClose={onCloseCORDetail}
            onEdit={onEditCORFromDetail}
            onShowToast={onShowToast}
            onStatusChange={onCORStatusChange}
          />
        </Suspense>
      )}

      {/* COR Log */}
      {corDisplayMode === 'log' && selectedProject && (
        <div className="cor-log-modal-overlay" onClick={onCloseCORLog}>
          <div className="cor-log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cor-log-modal-header">
              <h2>Change Order Log</h2>
              <button className="cor-log-modal-close" onClick={onCloseCORLog} title="Close"><X size={16} /></button>
            </div>
            <div className="cor-log-modal-content">
              <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
                <CORLog project={selectedProject} company={company} onShowToast={onShowToast} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Add Cost */}
      {showAddCostModal && (
        <Suspense fallback={null}>
          <AddCostModal
            onClose={onCloseAddCostModal}
            saving={savingCost}
            onSave={onSaveCost}
          />
        </Suspense>
      )}

      {/* Equipment */}
      {showEquipmentModal && (
        <Suspense fallback={null}>
          <EquipmentModal
            project={selectedProject}
            company={company}
            user={user}
            editItem={editingEquipment}
            onSave={onEquipmentSaved}
            onClose={onCloseEquipmentModal}
          />
        </Suspense>
      )}

      {/* Draw Request */}
      {showDrawRequestModal && (
        <Suspense fallback={null}>
          <DrawRequestModal
            project={selectedProject}
            company={company}
            areas={areas}
            corStats={projectsData.find(p => p.id === selectedProject?.id)?.corStats}
            editDrawRequest={editingDrawRequest}
            onSave={onDrawRequestSaved}
            onClose={onCloseDrawRequestModal}
          />
        </Suspense>
      )}
    </>
  )
}
