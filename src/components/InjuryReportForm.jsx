import { useState } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import Toast from './Toast'

export default function InjuryReportForm({ project, companyId, onClose, onReportCreated }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [step, setStep] = useState(1) // Multi-step form: 1=Incident, 2=Employee, 3=Supervisor, 4=Witnesses, 5=Medical

  // Incident Details
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split('T')[0])
  const [incidentTime, setIncidentTime] = useState(new Date().toTimeString().split(' ')[0].substring(0, 5))
  const [incidentLocation, setIncidentLocation] = useState('')
  const [incidentDescription, setIncidentDescription] = useState('')
  const [injuryType, setInjuryType] = useState('minor')
  const [bodyPartAffected, setBodyPartAffected] = useState('')

  // Employee Information
  const [employeeName, setEmployeeName] = useState('')
  const [employeePhone, setEmployeePhone] = useState('')
  const [employeeEmail, setEmployeeEmail] = useState('')
  const [employeeAddress, setEmployeeAddress] = useState('')
  const [employeeJobTitle, setEmployeeJobTitle] = useState('')
  const [employeeHireDate, setEmployeeHireDate] = useState('')

  // Supervisor Information
  const [reportedByName, setReportedByName] = useState(user?.name || '')
  const [reportedByTitle, setReportedByTitle] = useState('')
  const [reportedByPhone, setReportedByPhone] = useState('')
  const [reportedByEmail, setReportedByEmail] = useState(user?.email || '')

  // Witnesses
  const [witnesses, setWitnesses] = useState([])
  const [witnessName, setWitnessName] = useState('')
  const [witnessPhone, setWitnessPhone] = useState('')
  const [witnessEmail, setWitnessEmail] = useState('')
  const [witnessTestimony, setWitnessTestimony] = useState('')

  // Medical Information
  const [medicalTreatmentRequired, setMedicalTreatmentRequired] = useState(false)
  const [medicalFacilityName, setMedicalFacilityName] = useState('')
  const [medicalFacilityAddress, setMedicalFacilityAddress] = useState('')
  const [hospitalized, setHospitalized] = useState(false)

  // Actions and Safety
  const [immediateActionsTaken, setImmediateActionsTaken] = useState('')
  const [correctiveActionsPlanned, setCorrectiveActionsPlanned] = useState('')
  const [safetyEquipmentUsed, setSafetyEquipmentUsed] = useState('')
  const [safetyEquipmentFailed, setSafetyEquipmentFailed] = useState('')

  // Regulatory
  const [oshaRecordable, setOshaRecordable] = useState(false)
  const [workersCompClaim, setWorkersCompClaim] = useState(false)
  const [daysAwayFromWork, setDaysAwayFromWork] = useState(0)
  const [restrictedWorkDays, setRestrictedWorkDays] = useState(0)

  const handleAddWitness = () => {
    if (!witnessName.trim()) {
      setToast({ type: 'error', message: 'Please enter witness name' })
      return
    }

    const witness = {
      name: witnessName,
      phone: witnessPhone,
      email: witnessEmail,
      testimony: witnessTestimony
    }

    setWitnesses([...witnesses, witness])
    setWitnessName('')
    setWitnessPhone('')
    setWitnessEmail('')
    setWitnessTestimony('')
    setToast({ type: 'success', message: 'Witness added' })
  }

  const handleRemoveWitness = (index) => {
    setWitnesses(witnesses.filter((_, i) => i !== index))
  }

  const validateStep = (stepNumber) => {
    switch (stepNumber) {
      case 1:
        if (!incidentLocation.trim() || !incidentDescription.trim()) {
          setToast({ type: 'error', message: 'Please fill in all incident details' })
          return false
        }
        break
      case 2:
        if (!employeeName.trim() || !employeeJobTitle.trim()) {
          setToast({ type: 'error', message: 'Please fill in employee name and job title' })
          return false
        }
        break
      case 3:
        if (!reportedByName.trim() || !reportedByTitle.trim()) {
          setToast({ type: 'error', message: 'Please fill in supervisor name and title' })
          return false
        }
        break
    }
    return true
  }

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleSubmit = async () => {
    if (!validateStep(step)) return

    setLoading(true)
    try {
      const reportData = {
        project_id: project.id,
        company_id: companyId,

        // Incident details
        incident_date: incidentDate,
        incident_time: incidentTime,
        incident_location: incidentLocation,
        incident_description: incidentDescription,
        injury_type: injuryType,
        body_part_affected: bodyPartAffected || null,

        // Employee information
        employee_name: employeeName,
        employee_phone: employeePhone || null,
        employee_email: employeeEmail || null,
        employee_address: employeeAddress || null,
        employee_job_title: employeeJobTitle,
        employee_hire_date: employeeHireDate || null,

        // Medical information
        medical_treatment_required: medicalTreatmentRequired,
        medical_facility_name: medicalFacilityName || null,
        medical_facility_address: medicalFacilityAddress || null,
        hospitalized: hospitalized,

        // Supervisor information
        reported_by_name: reportedByName,
        reported_by_title: reportedByTitle,
        reported_by_phone: reportedByPhone || null,
        reported_by_email: reportedByEmail || null,

        // Witnesses
        witnesses: witnesses,

        // Actions and safety
        immediate_actions_taken: immediateActionsTaken || null,
        corrective_actions_planned: correctiveActionsPlanned || null,
        safety_equipment_used: safetyEquipmentUsed || null,
        safety_equipment_failed: safetyEquipmentFailed || null,

        // Regulatory
        osha_recordable: oshaRecordable,
        workers_comp_claim: workersCompClaim,
        days_away_from_work: parseInt(daysAwayFromWork) || 0,
        restricted_work_days: parseInt(restrictedWorkDays) || 0,

        // Status
        status: 'reported',
        created_by: user?.id
      }

      const report = await db.createInjuryReport(reportData)

      setToast({ type: 'success', message: 'Injury report submitted successfully' })

      if (onReportCreated) {
        onReportCreated(report)
      }

      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (error) {
      console.error('Error submitting injury report:', error)
      setToast({ type: 'error', message: 'Failed to submit injury report' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content injury-report-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Workplace Injury/Incident Report</h2>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>

          {/* Progress Indicator */}
          <div className="progress-steps">
            <div className={`step ${step >= 1 ? 'active' : ''}`}>1. Incident</div>
            <div className={`step ${step >= 2 ? 'active' : ''}`}>2. Employee</div>
            <div className={`step ${step >= 3 ? 'active' : ''}`}>3. Supervisor</div>
            <div className={`step ${step >= 4 ? 'active' : ''}`}>4. Witnesses</div>
            <div className={`step ${step >= 5 ? 'active' : ''}`}>5. Medical & Safety</div>
          </div>

          <div className="modal-body">
            {/* Step 1: Incident Details */}
            {step === 1 && (
              <div className="form-step">
                <h3>Incident Details</h3>

                <div className="form-row">
                  <div className="form-group">
                    <label>Date of Incident *</label>
                    <input
                      type="date"
                      value={incidentDate}
                      onChange={(e) => setIncidentDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="form-group">
                    <label>Time of Incident *</label>
                    <input
                      type="time"
                      value={incidentTime}
                      onChange={(e) => setIncidentTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Location on Site *</label>
                  <input
                    type="text"
                    value={incidentLocation}
                    onChange={(e) => setIncidentLocation(e.target.value)}
                    placeholder="e.g., Floor 2, near elevator shaft"
                  />
                </div>

                <div className="form-group">
                  <label>Incident Description *</label>
                  <textarea
                    value={incidentDescription}
                    onChange={(e) => setIncidentDescription(e.target.value)}
                    rows={4}
                    placeholder="Describe what happened in detail..."
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Injury Type *</label>
                    <select value={injuryType} onChange={(e) => setInjuryType(e.target.value)}>
                      <option value="minor">Minor Injury</option>
                      <option value="serious">Serious Injury</option>
                      <option value="critical">Critical Injury</option>
                      <option value="near_miss">Near Miss (No Injury)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Body Part Affected</label>
                    <input
                      type="text"
                      value={bodyPartAffected}
                      onChange={(e) => setBodyPartAffected(e.target.value)}
                      placeholder="e.g., Left hand, lower back"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Employee Information */}
            {step === 2 && (
              <div className="form-step">
                <h3>Injured Employee Information</h3>

                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="First and last name"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      value={employeePhone}
                      onChange={(e) => setEmployeePhone(e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={employeeEmail}
                      onChange={(e) => setEmployeeEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Home Address</label>
                  <input
                    type="text"
                    value={employeeAddress}
                    onChange={(e) => setEmployeeAddress(e.target.value)}
                    placeholder="Street address, city, state, zip"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Job Title *</label>
                    <input
                      type="text"
                      value={employeeJobTitle}
                      onChange={(e) => setEmployeeJobTitle(e.target.value)}
                      placeholder="e.g., Carpenter, Electrician"
                    />
                  </div>
                  <div className="form-group">
                    <label>Hire Date</label>
                    <input
                      type="date"
                      value={employeeHireDate}
                      onChange={(e) => setEmployeeHireDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Supervisor Information */}
            {step === 3 && (
              <div className="form-step">
                <h3>Foreman/Supervisor Making Report</h3>

                <div className="form-group">
                  <label>Your Name *</label>
                  <input
                    type="text"
                    value={reportedByName}
                    onChange={(e) => setReportedByName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Your Title *</label>
                    <input
                      type="text"
                      value={reportedByTitle}
                      onChange={(e) => setReportedByTitle(e.target.value)}
                      placeholder="e.g., Site Foreman, Project Manager"
                    />
                  </div>
                  <div className="form-group">
                    <label>Your Phone Number</label>
                    <input
                      type="tel"
                      value={reportedByPhone}
                      onChange={(e) => setReportedByPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Your Email Address</label>
                  <input
                    type="email"
                    value={reportedByEmail}
                    onChange={(e) => setReportedByEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
              </div>
            )}

            {/* Step 4: Witnesses */}
            {step === 4 && (
              <div className="form-step">
                <h3>Witness Testimonies (Optional)</h3>

                {witnesses.length > 0 && (
                  <div className="witnesses-list">
                    {witnesses.map((witness, index) => (
                      <div key={index} className="witness-item">
                        <div className="witness-info">
                          <strong>{witness.name}</strong>
                          {witness.phone && <span> • {witness.phone}</span>}
                          {witness.testimony && (
                            <p className="witness-testimony">"{witness.testimony}"</p>
                          )}
                        </div>
                        <button
                          className="btn-danger btn-small"
                          onClick={() => handleRemoveWitness(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="add-witness-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Witness Name</label>
                      <input
                        type="text"
                        value={witnessName}
                        onChange={(e) => setWitnessName(e.target.value)}
                        placeholder="Full name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone Number</label>
                      <input
                        type="tel"
                        value={witnessPhone}
                        onChange={(e) => setWitnessPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={witnessEmail}
                      onChange={(e) => setWitnessEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>Witness Testimony</label>
                    <textarea
                      value={witnessTestimony}
                      onChange={(e) => setWitnessTestimony(e.target.value)}
                      rows={3}
                      placeholder="What did the witness see or hear?"
                    />
                  </div>

                  <button className="btn-secondary" onClick={handleAddWitness}>
                    + Add Witness
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Medical & Safety */}
            {step === 5 && (
              <div className="form-step">
                <h3>Medical Treatment & Safety</h3>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={medicalTreatmentRequired}
                      onChange={(e) => setMedicalTreatmentRequired(e.target.checked)}
                    />
                    Medical treatment required
                  </label>
                </div>

                {medicalTreatmentRequired && (
                  <>
                    <div className="form-group">
                      <label>Medical Facility Name</label>
                      <input
                        type="text"
                        value={medicalFacilityName}
                        onChange={(e) => setMedicalFacilityName(e.target.value)}
                        placeholder="Hospital or clinic name"
                      />
                    </div>

                    <div className="form-group">
                      <label>Medical Facility Address</label>
                      <input
                        type="text"
                        value={medicalFacilityAddress}
                        onChange={(e) => setMedicalFacilityAddress(e.target.value)}
                        placeholder="Street address"
                      />
                    </div>

                    <div className="form-group checkbox-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={hospitalized}
                          onChange={(e) => setHospitalized(e.target.checked)}
                        />
                        Employee was hospitalized
                      </label>
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>Immediate Actions Taken</label>
                  <textarea
                    value={immediateActionsTaken}
                    onChange={(e) => setImmediateActionsTaken(e.target.value)}
                    rows={2}
                    placeholder="What was done immediately after the incident?"
                  />
                </div>

                <div className="form-group">
                  <label>Corrective Actions Planned</label>
                  <textarea
                    value={correctiveActionsPlanned}
                    onChange={(e) => setCorrectiveActionsPlanned(e.target.value)}
                    rows={2}
                    placeholder="What will be done to prevent this in the future?"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Safety Equipment Used</label>
                    <input
                      type="text"
                      value={safetyEquipmentUsed}
                      onChange={(e) => setSafetyEquipmentUsed(e.target.value)}
                      placeholder="e.g., Hard hat, gloves, harness"
                    />
                  </div>
                  <div className="form-group">
                    <label>Safety Equipment Failed</label>
                    <input
                      type="text"
                      value={safetyEquipmentFailed}
                      onChange={(e) => setSafetyEquipmentFailed(e.target.value)}
                      placeholder="Equipment that failed, if any"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Days Away From Work</label>
                    <input
                      type="number"
                      min="0"
                      value={daysAwayFromWork}
                      onChange={(e) => setDaysAwayFromWork(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Restricted Work Days</label>
                    <input
                      type="number"
                      min="0"
                      value={restrictedWorkDays}
                      onChange={(e) => setRestrictedWorkDays(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={oshaRecordable}
                      onChange={(e) => setOshaRecordable(e.target.checked)}
                    />
                    OSHA Recordable Incident
                  </label>
                </div>

                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={workersCompClaim}
                      onChange={(e) => setWorkersCompClaim(e.target.checked)}
                    />
                    Workers' Compensation Claim Filed
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Form Navigation */}
          <div className="modal-footer">
            <div className="form-actions">
              {step > 1 && (
                <button className="btn-secondary" onClick={handleBack}>
                  ← Back
                </button>
              )}
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              {step < 5 ? (
                <button className="btn-primary" onClick={handleNext}>
                  Next →
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? 'Submitting...' : 'Submit Report'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        .injury-report-modal {
          max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .progress-steps {
          display: flex;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          background-color: #f9fafb;
          overflow-x: auto;
        }

        .progress-steps .step {
          font-size: 0.875rem;
          color: #9ca3af;
          font-weight: 500;
          white-space: nowrap;
          padding: 0.5rem;
        }

        .progress-steps .step.active {
          color: var(--primary-color, #3b82f6);
          font-weight: 600;
        }

        .form-step h3 {
          margin-top: 0;
          margin-bottom: 1.5rem;
          color: #111827;
          font-size: 1.25rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #374151;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-group textarea {
          resize: vertical;
        }

        .checkbox-group label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: normal;
          cursor: pointer;
        }

        .checkbox-group input[type="checkbox"] {
          width: auto;
          margin: 0;
        }

        .witnesses-list {
          margin-bottom: 1.5rem;
        }

        .witness-item {
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 0.5rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .witness-info {
          flex: 1;
        }

        .witness-testimony {
          margin-top: 0.5rem;
          color: #6b7280;
          font-style: italic;
          font-size: 0.875rem;
        }

        .add-witness-form {
          border: 2px dashed #d1d5db;
          border-radius: 6px;
          padding: 1rem;
          background-color: #f9fafb;
        }

        .modal-footer {
          border-top: 1px solid #e5e7eb;
          padding: 1rem 1.5rem;
        }

        .form-actions {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .btn-primary,
        .btn-secondary,
        .btn-danger {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }

        .btn-primary {
          background-color: var(--primary-color, #3b82f6);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background-color: #f3f4f6;
          color: #374151;
        }

        .btn-secondary:hover {
          background-color: #e5e7eb;
        }

        .btn-danger {
          background-color: #ef4444;
          color: white;
        }

        .btn-danger:hover {
          background-color: #dc2626;
        }

        .btn-small {
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
        }

        @media (max-width: 768px) {
          .injury-report-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .progress-steps .step {
            font-size: 0.75rem;
            padding: 0.25rem;
          }
        }
      `}</style>
    </>
  )
}
