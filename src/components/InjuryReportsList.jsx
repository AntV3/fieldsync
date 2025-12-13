import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import InjuryReportForm from './InjuryReportForm'
import Toast from './Toast'

export default function InjuryReportsList({ project, companyId, onShowToast }) {
  const [reports, setReports] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadReports()
  }, [project?.id])

  const loadReports = async () => {
    setLoading(true)
    try {
      const data = project
        ? await db.getInjuryReports(project.id)
        : await db.getCompanyInjuryReports(companyId)
      setReports(data)
    } catch (error) {
      console.error('Error loading injury reports:', error)
      setToast({ type: 'error', message: 'Failed to load injury reports' })
    } finally {
      setLoading(false)
    }
  }

  const handleReportCreated = () => {
    loadReports()
    setShowForm(false)
    setToast({ type: 'success', message: 'Injury report created successfully' })
  }

  const handleViewDetails = (report) => {
    setSelectedReport(report)
  }

  const handleCloseDetails = () => {
    setSelectedReport(null)
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatTime = (timeString) => {
    if (!timeString) return ''
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const getInjuryTypeLabel = (type) => {
    const labels = {
      minor: 'Minor Injury',
      serious: 'Serious Injury',
      critical: 'Critical Injury',
      near_miss: 'Near Miss'
    }
    return labels[type] || type
  }

  const getStatusColor = (status) => {
    const colors = {
      reported: '#fbbf24',
      under_investigation: '#3b82f6',
      closed: '#10b981'
    }
    return colors[status] || '#9ca3af'
  }

  const getInjuryTypeColor = (type) => {
    const colors = {
      minor: '#10b981',
      serious: '#f59e0b',
      critical: '#ef4444',
      near_miss: '#6b7280'
    }
    return colors[type] || '#9ca3af'
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading injury reports...</p>
      </div>
    )
  }

  return (
    <>
      <div className="injury-reports-section">
        <div className="section-header">
          <h3>Injury & Incident Reports</h3>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + File Injury Report
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏥</div>
            <h4>No Injury Reports</h4>
            <p>Click "File Injury Report" to document a workplace incident</p>
          </div>
        ) : (
          <div className="reports-list">
            {reports.map(report => (
              <div
                key={report.id}
                className="report-card"
                onClick={() => handleViewDetails(report)}
              >
                <div className="report-header">
                  <div>
                    <div className="report-date">
                      {formatDate(report.incident_date)} at {formatTime(report.incident_time)}
                    </div>
                    <div className="employee-name">{report.employee_name}</div>
                  </div>
                  <div className="report-badges">
                    <span
                      className="badge"
                      style={{ backgroundColor: getInjuryTypeColor(report.injury_type) }}
                    >
                      {getInjuryTypeLabel(report.injury_type)}
                    </span>
                    <span
                      className="badge"
                      style={{ backgroundColor: getStatusColor(report.status) }}
                    >
                      {report.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="report-summary">
                  <div className="summary-item">
                    <strong>Location:</strong> {report.incident_location}
                  </div>
                  <div className="summary-item">
                    <strong>Reported by:</strong> {report.reported_by_name} ({report.reported_by_title})
                  </div>
                  {report.body_part_affected && (
                    <div className="summary-item">
                      <strong>Body Part:</strong> {report.body_part_affected}
                    </div>
                  )}
                  {report.osha_recordable && (
                    <div className="summary-item">
                      <span className="osha-badge">OSHA Recordable</span>
                    </div>
                  )}
                </div>

                <div className="report-description">
                  {report.incident_description.substring(0, 150)}
                  {report.incident_description.length > 150 && '...'}
                </div>

                <div className="report-footer">
                  <span>Click to view full details</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Report Details Modal */}
        {selectedReport && (
          <div className="modal-overlay" onClick={handleCloseDetails}>
            <div className="modal-content report-details-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Injury Report Details</h2>
                <button className="close-btn" onClick={handleCloseDetails}>&times;</button>
              </div>

              <div className="modal-body">
                {/* Incident Information */}
                <section className="details-section">
                  <h3>Incident Information</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Date & Time</label>
                      <div>{formatDate(selectedReport.incident_date)} at {formatTime(selectedReport.incident_time)}</div>
                    </div>
                    <div className="detail-item">
                      <label>Location</label>
                      <div>{selectedReport.incident_location}</div>
                    </div>
                    <div className="detail-item">
                      <label>Injury Type</label>
                      <div>
                        <span
                          className="badge"
                          style={{ backgroundColor: getInjuryTypeColor(selectedReport.injury_type) }}
                        >
                          {getInjuryTypeLabel(selectedReport.injury_type)}
                        </span>
                      </div>
                    </div>
                    {selectedReport.body_part_affected && (
                      <div className="detail-item">
                        <label>Body Part Affected</label>
                        <div>{selectedReport.body_part_affected}</div>
                      </div>
                    )}
                  </div>
                  <div className="detail-item full-width">
                    <label>Description</label>
                    <div className="description-box">{selectedReport.incident_description}</div>
                  </div>
                </section>

                {/* Employee Information */}
                <section className="details-section">
                  <h3>Injured Employee</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Name</label>
                      <div>{selectedReport.employee_name}</div>
                    </div>
                    <div className="detail-item">
                      <label>Job Title</label>
                      <div>{selectedReport.employee_job_title}</div>
                    </div>
                    {selectedReport.employee_phone && (
                      <div className="detail-item">
                        <label>Phone</label>
                        <div>{selectedReport.employee_phone}</div>
                      </div>
                    )}
                    {selectedReport.employee_email && (
                      <div className="detail-item">
                        <label>Email</label>
                        <div>{selectedReport.employee_email}</div>
                      </div>
                    )}
                    {selectedReport.employee_address && (
                      <div className="detail-item full-width">
                        <label>Address</label>
                        <div>{selectedReport.employee_address}</div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Supervisor Information */}
                <section className="details-section">
                  <h3>Reported By</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Name</label>
                      <div>{selectedReport.reported_by_name}</div>
                    </div>
                    <div className="detail-item">
                      <label>Title</label>
                      <div>{selectedReport.reported_by_title}</div>
                    </div>
                    {selectedReport.reported_by_phone && (
                      <div className="detail-item">
                        <label>Phone</label>
                        <div>{selectedReport.reported_by_phone}</div>
                      </div>
                    )}
                    {selectedReport.reported_by_email && (
                      <div className="detail-item">
                        <label>Email</label>
                        <div>{selectedReport.reported_by_email}</div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Witnesses */}
                {selectedReport.witnesses && selectedReport.witnesses.length > 0 && (
                  <section className="details-section">
                    <h3>Witnesses</h3>
                    {selectedReport.witnesses.map((witness, index) => (
                      <div key={index} className="witness-card">
                        <div className="witness-header">
                          <strong>{witness.name}</strong>
                          {witness.phone && <span> • {witness.phone}</span>}
                          {witness.email && <span> • {witness.email}</span>}
                        </div>
                        {witness.testimony && (
                          <div className="witness-testimony">
                            <em>"{witness.testimony}"</em>
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {/* Medical Information */}
                {selectedReport.medical_treatment_required && (
                  <section className="details-section">
                    <h3>Medical Treatment</h3>
                    <div className="detail-grid">
                      {selectedReport.medical_facility_name && (
                        <div className="detail-item">
                          <label>Facility</label>
                          <div>{selectedReport.medical_facility_name}</div>
                        </div>
                      )}
                      {selectedReport.medical_facility_address && (
                        <div className="detail-item">
                          <label>Address</label>
                          <div>{selectedReport.medical_facility_address}</div>
                        </div>
                      )}
                      <div className="detail-item">
                        <label>Hospitalized</label>
                        <div>{selectedReport.hospitalized ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Actions & Safety */}
                <section className="details-section">
                  <h3>Actions & Safety</h3>
                  {selectedReport.immediate_actions_taken && (
                    <div className="detail-item full-width">
                      <label>Immediate Actions Taken</label>
                      <div className="description-box">{selectedReport.immediate_actions_taken}</div>
                    </div>
                  )}
                  {selectedReport.corrective_actions_planned && (
                    <div className="detail-item full-width">
                      <label>Corrective Actions Planned</label>
                      <div className="description-box">{selectedReport.corrective_actions_planned}</div>
                    </div>
                  )}
                  <div className="detail-grid">
                    {selectedReport.safety_equipment_used && (
                      <div className="detail-item">
                        <label>Safety Equipment Used</label>
                        <div>{selectedReport.safety_equipment_used}</div>
                      </div>
                    )}
                    {selectedReport.safety_equipment_failed && (
                      <div className="detail-item">
                        <label>Safety Equipment Failed</label>
                        <div>{selectedReport.safety_equipment_failed}</div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Regulatory Information */}
                <section className="details-section">
                  <h3>Regulatory & Work Impact</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>OSHA Recordable</label>
                      <div>{selectedReport.osha_recordable ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="detail-item">
                      <label>Workers' Comp Claim</label>
                      <div>{selectedReport.workers_comp_claim ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="detail-item">
                      <label>Days Away From Work</label>
                      <div>{selectedReport.days_away_from_work || 0}</div>
                    </div>
                    <div className="detail-item">
                      <label>Restricted Work Days</label>
                      <div>{selectedReport.restricted_work_days || 0}</div>
                    </div>
                  </div>
                </section>

                <div className="report-meta">
                  Filed on {formatDate(selectedReport.created_at)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Report Form */}
        {showForm && (
          <InjuryReportForm
            project={project}
            companyId={companyId}
            onClose={() => setShowForm(false)}
            onReportCreated={handleReportCreated}
          />
        )}

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>

      <style>{`
        .injury-reports-section {
          margin-top: 2rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .section-header h3 {
          margin: 0;
          font-size: 1.25rem;
          color: #111827;
        }

        .reports-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .report-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .report-card:hover {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          border-color: var(--primary-color, #3b82f6);
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .report-date {
          font-size: 0.875rem;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .employee-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
        }

        .report-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          color: white;
          text-transform: capitalize;
        }

        .osha-badge {
          background-color: #dc2626;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .report-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 1rem;
          background-color: #f9fafb;
          border-radius: 6px;
        }

        .summary-item {
          font-size: 0.875rem;
          color: #374151;
        }

        .summary-item strong {
          color: #111827;
        }

        .report-description {
          color: #6b7280;
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .report-footer {
          text-align: right;
          font-size: 0.875rem;
          color: var(--primary-color, #3b82f6);
        }

        .report-details-modal {
          max-width: 900px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .details-section {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .details-section:last-child {
          border-bottom: none;
        }

        .details-section h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.125rem;
          color: #111827;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .detail-item label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .detail-item div {
          color: #111827;
        }

        .detail-item.full-width {
          grid-column: 1 / -1;
        }

        .description-box {
          background-color: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 1rem;
          white-space: pre-wrap;
          line-height: 1.6;
        }

        .witness-card {
          background-color: #f9fafb;
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 0.5rem;
        }

        .witness-header {
          margin-bottom: 0.5rem;
          color: #111827;
        }

        .witness-testimony {
          color: #6b7280;
          font-size: 0.875rem;
          padding-left: 1rem;
          border-left: 3px solid #d1d5db;
        }

        .report-meta {
          text-align: center;
          font-size: 0.875rem;
          color: #6b7280;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
        }

        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
        }

        .empty-state-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .empty-state h4 {
          margin: 0 0 0.5rem 0;
          color: #111827;
        }

        .empty-state p {
          margin: 0;
          color: #6b7280;
        }

        .btn-primary {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          background-color: var(--primary-color, #3b82f6);
          color: white;
        }

        .btn-primary:hover {
          opacity: 0.9;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 3rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e5e7eb;
          border-top-color: var(--primary-color, #3b82f6);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .report-header {
            flex-direction: column;
            gap: 0.5rem;
          }

          .report-summary {
            grid-template-columns: 1fr;
          }

          .detail-grid {
            grid-template-columns: 1fr;
          }

          .report-details-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }
        }
      `}</style>
    </>
  )
}
