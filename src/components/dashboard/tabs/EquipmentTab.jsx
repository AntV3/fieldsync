/**
 * EquipmentTab - Equipment management
 *
 * Currently rendered inline within FinancialsTab's overview section.
 * This component can be used standalone if equipment gets its own top-level tab.
 */
import { useToast } from '../../../lib/ToastContext'
import ProjectEquipmentCard from '../../equipment/ProjectEquipmentCard'

export default function EquipmentTab({
  selectedProject,
  equipmentRefreshKey,
  onAddEquipment,
  onEditEquipment
}) {
  const { showToast } = useToast()
  return (
    <div className="pv-tab-panel equipment-tab animate-fade-in">
      <ProjectEquipmentCard
        key={equipmentRefreshKey}
        project={selectedProject}
        onAddEquipment={onAddEquipment}
        onEditEquipment={onEditEquipment}
      />
    </div>
  )
}
