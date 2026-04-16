import { MapPin, HardHat, FileText, Building2, Phone } from 'lucide-react'
import ProjectTeam from '../../ProjectTeam'
import MFASetup from '../../MFASetup'
import CostCodeManager from '../../CostCodeManager'
import PhaseAssignmentEditor from '../PhaseAssignmentEditor'

export default function InfoTab({
  selectedProject,
  company,
  user,
  isAdmin,
  areas,
  onAreasChanged,
  onShowToast,
  onEditClick
}) {
  if (!selectedProject) {
    return <div className="pv-tab-panel info-tab"><p>No project selected.</p></div>
  }

  return (
    <div className="pv-tab-panel info-tab">
      {/* Hero Header */}
      <div className="info-hero">
        <div className="info-hero-content">
          <div className="info-hero-main">
            <h2 className="info-hero-title">{selectedProject.name || 'Untitled Project'}</h2>
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
        {/* Work Type */}
        <div className="info-quick-card">
          <div className="info-quick-icon">
            <HardHat size={20} />
          </div>
          <div className="info-quick-content">
            <span className="info-quick-value">
              {selectedProject.work_type === 'environmental' ? 'Environmental' : 'Demolition'}
            </span>
            <span className="info-quick-label">Work Type</span>
          </div>
        </div>

        {/* Job Type */}
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

        {/* Foreman PIN */}
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

      {/* Project Team */}
      <ProjectTeam
        project={selectedProject}
        company={company}
        user={user}
        isAdmin={isAdmin}
        onShowToast={onShowToast}
      />

      {/* Tasks by Phase - admin-only reassignment of tasks to phases */}
      {isAdmin && (
        <PhaseAssignmentEditor
          projectId={selectedProject.id}
          areas={areas}
          onShowToast={onShowToast}
          onAreasChanged={onAreasChanged}
        />
      )}

      {/* Cost Codes (Job Costing) */}
      {(company?.id || selectedProject?.company_id) && (
        <div className="info-section-card">
          <CostCodeManager
            companyId={company?.id || selectedProject?.company_id}
            onShowToast={onShowToast}
          />
        </div>
      )}

      {/* Account Security */}
      <div className="info-section-card">
        <MFASetup onShowToast={onShowToast} />
      </div>
    </div>
  )
}
