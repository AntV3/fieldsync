import { DollarSign, HardHat, FileText, LayoutGrid, Building2, Phone, MapPin, Info } from 'lucide-react'
import { formatCurrency } from '../../../lib/utils'
import ProjectTeam from '../../ProjectTeam'
import MFASetup from '../../MFASetup'
import ProjectTradeOverrides from '../../settings/ProjectTradeOverrides'
import CostCodeImport from '../../settings/CostCodeImport'
import { useTradeConfig } from '../../../lib/TradeConfigContext'

export default function SettingsTab({
  selectedProject,
  company,
  user,
  isAdmin,
  _projectData,
  areas,
  areasComplete,
  areasWorking,
  areasNotStarted,
  changeOrderValue,
  revisedContractValue,
  onEditClick,
  onShowToast
}) {
  return (
    <div className="pv-tab-panel info-tab">
      {/* Hero Header */}
      <div className="info-hero">
        <div className="info-hero-content">
          <div className="info-hero-main">
            <h2 className="info-hero-title">{selectedProject.name}</h2>
            {selectedProject.job_number && (
              <span className="info-hero-job">Job #{selectedProject.job_number}</span>
            )}
          </div>
          <button className="btn btn-primary btn-with-icon" onClick={onEditClick}>
            <span>Edit Project</span>
          </button>
        </div>
        {selectedProject.address && (
          <div className="info-hero-address">
            <MapPin size={14} />
            <span>{selectedProject.address}</span>
          </div>
        )}
      </div>

      {/* Quick Info Cards */}
      <div className="info-quick-grid">
        <div className="info-quick-card">
          <div className="info-quick-icon">
            <HardHat size={20} />
          </div>
          <div className="info-quick-content">
            <TradeNameDisplay workType={selectedProject.work_type} />
          </div>
        </div>
        <div className="info-quick-card">
          <div className="info-quick-icon">
            <FileText size={20} />
          </div>
          <div className="info-quick-content">
            <span className="info-quick-value">
              {selectedProject.job_type === 'prevailing_wage' ? 'Prevailing Wage' : 'Standard'}
            </span>
            <span className="info-quick-label">Job Type</span>
          </div>
        </div>
        <div className="info-quick-card highlight">
          <div className="info-quick-icon">
            <DollarSign size={20} />
          </div>
          <div className="info-quick-content">
            <span className="info-quick-value">{formatCurrency(revisedContractValue)}</span>
            <span className="info-quick-label">
              {changeOrderValue > 0 ? `Incl. +${formatCurrency(changeOrderValue)} COs` : 'Contract Value'}
            </span>
          </div>
        </div>
        {selectedProject.pin && (
          <div className="info-quick-card">
            <div className="info-quick-icon">
              <span className="info-pin-icon">#</span>
            </div>
            <div className="info-quick-content">
              <span className="info-quick-value mono">{selectedProject.pin}</span>
              <span className="info-quick-label">Foreman PIN</span>
            </div>
          </div>
        )}
      </div>

      {/* Client & Contractor Card */}
      <div className="info-section-card">
        <div className="info-section-header">
          <Building2 size={18} />
          <h3>Client & Contractor</h3>
        </div>
        <div className="info-section-content">
          {selectedProject.general_contractor ? (
            <div className="info-detail-row">
              <span className="info-detail-label">General Contractor</span>
              <span className="info-detail-value">{selectedProject.general_contractor}</span>
            </div>
          ) : (
            <div className="info-detail-row empty">
              <span className="info-detail-value">No general contractor specified</span>
            </div>
          )}
          {selectedProject.contractor_contact && (
            <div className="info-detail-row">
              <span className="info-detail-label">Contractor Contact</span>
              <span className="info-detail-value">
                {selectedProject.contractor_contact}
                {selectedProject.contractor_position && `, ${selectedProject.contractor_position}`}
              </span>
            </div>
          )}
          {selectedProject.contractor_phone && (
            <div className="info-detail-row clickable">
              <span className="info-detail-label">
                <Phone size={14} />
                Contractor Phone
              </span>
              <a href={`tel:${selectedProject.contractor_phone}`} className="info-detail-value link">
                {selectedProject.contractor_phone}
              </a>
            </div>
          )}
          {selectedProject.contractor_email && (
            <div className="info-detail-row clickable">
              <span className="info-detail-label">Contractor Email</span>
              <a href={`mailto:${selectedProject.contractor_email}`} className="info-detail-value link">
                {selectedProject.contractor_email}
              </a>
            </div>
          )}
          {selectedProject.client_contact && (
            <div className="info-detail-row">
              <span className="info-detail-label">Client Contact</span>
              <span className="info-detail-value">
                {selectedProject.client_contact}
                {selectedProject.client_position && `, ${selectedProject.client_position}`}
              </span>
            </div>
          )}
          {selectedProject.client_phone && (
            <div className="info-detail-row clickable">
              <span className="info-detail-label">
                <Phone size={14} />
                Client Phone
              </span>
              <a href={`tel:${selectedProject.client_phone}`} className="info-detail-value link">
                {selectedProject.client_phone}
              </a>
            </div>
          )}
          {selectedProject.client_email && (
            <div className="info-detail-row clickable">
              <span className="info-detail-label">Client Email</span>
              <a href={`mailto:${selectedProject.client_email}`} className="info-detail-value link">
                {selectedProject.client_email}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Work Areas Card */}
      <div className="info-section-card">
        <div className="info-section-header">
          <LayoutGrid size={18} />
          <h3>Work Areas</h3>
          <div className="info-section-badges">
            {areasComplete > 0 && <span className="info-badge done">{areasComplete} Done</span>}
            {areasWorking > 0 && <span className="info-badge working">{areasWorking} Active</span>}
            {areasNotStarted > 0 && <span className="info-badge pending">{areasNotStarted} Pending</span>}
          </div>
        </div>
        <div className="info-areas-list">
          {areas.map(area => (
            <div key={area.id} className={`info-area-item ${area.status}`}>
              <div className="info-area-status">
                {area.status === 'done' && <span className="status-dot done">&#10003;</span>}
                {area.status === 'working' && <span className="status-dot working">&#9679;</span>}
                {area.status === 'not_started' && <span className="status-dot pending">&#9675;</span>}
              </div>
              <div className="info-area-details">
                <span className="info-area-name">{area.name}</span>
                <span className={`info-area-status-label ${area.status}`}>
                  {area.status === 'done' ? 'Complete' : area.status === 'working' ? 'In Progress' : 'Not Started'}
                </span>
              </div>
              <span className="info-area-weight">{area.weight}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Project Team */}
      <ProjectTeam
        project={selectedProject}
        company={company}
        user={user}
        isAdmin={isAdmin}
        onShowToast={onShowToast}
      />

      {/* Project Settings - Collapsible */}
      <details className="info-details-section">
        <summary className="info-details-summary">
          <Info size={16} />
          <span>Additional Settings</span>
        </summary>
        <div className="info-details-content">
          <div className="info-detail-row">
            <span className="info-detail-label">Original Contract</span>
            <span className="info-detail-value">{formatCurrency(selectedProject.contract_value)}</span>
          </div>
          {changeOrderValue > 0 && (
            <div className="info-detail-row">
              <span className="info-detail-label">Approved Change Orders</span>
              <span className="info-detail-value positive">+{formatCurrency(changeOrderValue)}</span>
            </div>
          )}
        </div>
      </details>

      {/* Cost Code Import */}
      <CostCodeImport
        companyId={company?.id}
        onShowToast={onShowToast}
      />

      {/* Trade Configuration */}
      <ProjectTradeOverrides
        projectId={selectedProject.id}
        onShowToast={onShowToast}
      />

      {/* Account Security */}
      <div className="info-section-card">
        <MFASetup onShowToast={onShowToast} />
      </div>
    </div>
  )
}

function TradeNameDisplay({ workType }) {
  const { resolvedConfig } = useTradeConfig()
  const tradeName = resolvedConfig?.trade_name

  const displayName = tradeName || (workType === 'environmental' ? 'Environmental' : workType === 'abatement' ? 'Abatement' : 'Demolition')

  return (
    <>
      <span className="info-quick-value">{displayName}</span>
      <span className="info-quick-label">Trade / Work Type</span>
    </>
  )
}
