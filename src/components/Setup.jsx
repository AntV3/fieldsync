import { useState, useRef } from 'react'
import { Check } from 'lucide-react'
import { db } from '../lib/supabase'
import { isProjectTourComplete, setPendingProjectTour } from './onboarding/onboardingState'
import {
  validatePin,
  validateContractValue,
  validateScheduleDates,
  validateOptionalAreas,
  validatePhaseNames,
  isProgressTrackingEmpty
} from '../lib/projectSetupValidation'
import ProjectBasicsStep from './setup/ProjectBasicsStep'
import ContactsStep from './setup/ContactsStep'
import ProgressTrackingStep from './setup/ProgressTrackingStep'
import ReviewStep from './setup/ReviewStep'

const STEPS = [
  { num: 1, label: 'Basics', shortLabel: 'Basics' },
  { num: 2, label: 'Contacts', shortLabel: 'People' },
  { num: 3, label: 'Progress tracking', shortLabel: 'Progress' },
  { num: 4, label: 'Review', shortLabel: 'Review' }
]

const INITIAL_DATA = {
  projectName: '',
  jobNumber: '',
  address: '',
  generalContractor: '',
  contractorContact: '',
  contractorPosition: '',
  contractorPhone: '',
  contractorEmail: '',
  clientContact: '',
  clientPosition: '',
  clientPhone: '',
  clientEmail: '',
  contractValue: '',
  pin: '',
  workType: 'demolition',
  jobType: 'standard',
  startDate: '',
  endDate: '',
  plannedManDays: '',
  // Phases are sibling to areas; areas link via tempPhaseId during the wizard
  // and via areas.group_name (== phase.name) once persisted.
  phases: [],
  // Areas are optional: one blank row so the step is not empty, and an
  // untouched row is ignored by validateOptionalAreas.
  areas: [
    { name: '', weight: '', group: '', scheduledValue: null, tempPhaseId: null }
  ]
}

export default function Setup({ company, user, onProjectCreated, onShowToast }) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState(INITIAL_DATA)
  const [creating, setCreating] = useState(false)
  // `creating` is render state, so two clicks dispatched in the same tick
  // would both read it as false. The ref is set synchronously and is what
  // actually rejects a second tap; `disabled={creating}` handles the rest.
  // It stays set after a successful create: the wizard is unmounted by the
  // navigation that follows, and until then the form must not reset and
  // re-enable Create (a late second tap would otherwise land on a blank
  // step 1 and toast "Please enter a project name").
  const submittingRef = useRef(false)

  const validateStep = (stepNum) => {
    switch (stepNum) {
      case 1: {
        if (!data.projectName.trim()) {
          onShowToast('Please enter a project name', 'error')
          return false
        }
        const pinCheck = validatePin(data.pin)
        if (!pinCheck.ok) {
          onShowToast(pinCheck.error, 'error')
          return false
        }
        return true
      }
      case 2:
        // Contacts are optional
        return true
      case 3: {
        // Everything on this step is optional, but what is entered must be valid.
        const contract = validateContractValue(data.contractValue)
        if (contract.error) {
          onShowToast(contract.error, 'error')
          return false
        }
        const dates = validateScheduleDates({ start_date: data.startDate, end_date: data.endDate })
        if (!dates.ok) {
          onShowToast(dates.error, 'error')
          return false
        }
        const areas = validateOptionalAreas(data.areas)
        if (!areas.ok) {
          onShowToast(areas.error, 'error')
          return false
        }
        const phases = validatePhaseNames(data.phases)
        if (!phases.ok) {
          onShowToast(phases.error, 'error')
          return false
        }
        return true
      }
      default:
        return true
    }
  }

  const goNext = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, STEPS.length))
    }
  }

  const goBack = () => {
    setStep(prev => Math.max(prev - 1, 1))
  }

  const goToStep = (targetStep) => {
    // Allow going back freely, but validate forward navigation
    if (targetStep < step) {
      setStep(targetStep)
      return
    }
    // Validate all steps up to the target
    for (let s = step; s < targetStep; s++) {
      if (!validateStep(s)) return
    }
    setStep(targetStep)
  }

  const handleSubmit = async () => {
    if (submittingRef.current) return

    if (!company?.id) {
      onShowToast('No company selected. Please log in again.', 'error')
      return
    }

    // Run all validations
    for (let s = 1; s <= 3; s++) {
      if (!validateStep(s)) {
        setStep(s)
        return
      }
    }

    // Lock Create for the whole async path so a double-tap cannot create
    // two projects while the PIN check is in flight.
    submittingRef.current = true
    setCreating(true)

    try {
      const pinAvailable = await db.isPinAvailable(data.pin, company.id)
      if (!pinAvailable) {
        onShowToast('This PIN is already in use. Try another.', 'error')
        submittingRef.current = false
        setCreating(false)
        setStep(1)
        return
      }

      const project = await db.createProject({
        name: data.projectName.trim(),
        job_number: data.jobNumber.trim() || null,
        address: data.address.trim() || null,
        general_contractor: data.generalContractor.trim() || null,
        contractor_contact: data.contractorContact.trim() || null,
        contractor_position: data.contractorPosition.trim() || null,
        contractor_phone: data.contractorPhone.trim() || null,
        contractor_email: data.contractorEmail.trim() || null,
        client_contact: data.clientContact.trim() || null,
        client_position: data.clientPosition.trim() || null,
        client_phone: data.clientPhone.trim() || null,
        client_email: data.clientEmail.trim() || null,
        contract_value: validateContractValue(data.contractValue).value,
        pin: data.pin,
        work_type: data.workType,
        job_type: data.jobType,
        company_id: company?.id,
        created_by: user?.id,
        start_date: data.startDate || null,
        end_date: data.endDate || null,
        planned_man_days: data.plannedManDays ? parseInt(data.plannedManDays) : null
      })

      // Create phases first so areas can resolve their group_name from the
      // persisted phase record. Partial-success is preferred to rollback:
      // Supabase JS has no client-side transactions, and leaving the project
      // recoverable is more useful than losing it.
      const validPhases = (data.phases || []).filter(p => p.name && p.name.trim())
      const createdPhases = []
      for (let i = 0; i < validPhases.length; i++) {
        const p = validPhases[i]
        try {
          const saved = await db.createPhase({
            project_id: project.id,
            name: p.name.trim(),
            description: p.description?.trim() || null,
            planned_start_date: p.planned_start_date || null,
            planned_end_date: p.planned_end_date || null,
            status: 'not_started',
            sort_order: i
          })
          createdPhases.push({ ...saved, tempId: p.tempId })
        } catch (phaseErr) {
          console.error('Error creating phase:', phaseErr)
          onShowToast(`Phase "${p.name.trim()}" could not be saved`, 'error')
        }
      }

      const validAreas = validateOptionalAreas(data.areas).areas
      for (let i = 0; i < validAreas.length; i++) {
        const area = validAreas[i]
        const matchedPhase = area.tempPhaseId
          ? createdPhases.find(cp => cp.tempId === area.tempPhaseId)
          : null
        const groupName = matchedPhase?.name
          || (area.group && area.group.trim())
          || null
        await db.createArea({
          project_id: project.id,
          name: area.name.trim(),
          weight: parseFloat(area.weight),
          scheduled_value: area.scheduledValue || null,
          group_name: groupName,
          status: 'not_started',
          sort_order: i
        })
      }

      onShowToast('Project created!', 'success')
      // Queue the guided setup tour (PIN → field → real-time approvals);
      // Dashboard consumes this on mount and only shows it once per device.
      if (!isProjectTourComplete()) {
        setPendingProjectTour({ projectId: project.id, pin: data.pin })
      }
      // No reset here: the parent navigates away and unmounts the wizard.
      // Create stays disabled ("Creating...") until then.
      onProjectCreated(project)
    } catch (error) {
      console.error('Error creating project:', error)
      onShowToast('Error creating project', 'error')
      submittingRef.current = false
      setCreating(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return <ProjectBasicsStep data={data} onChange={setData} />
      case 2:
        return <ContactsStep data={data} onChange={setData} />
      case 3:
        return <ProgressTrackingStep data={data} onChange={setData} onShowToast={onShowToast} />
      case 4:
        return <ReviewStep data={data} onEdit={goToStep} />
      default:
        return null
    }
  }

  const nextLabel = step === STEPS.length - 1
    ? (isProgressTrackingEmpty(data) ? 'Skip for now' : 'Review')
    : 'Continue'

  return (
    <div className="setup-wizard">
      <div className="setup-wizard-header">
        <h1>New Project</h1>
        <p className="subtitle">Step {step} of {STEPS.length}</p>
      </div>

      {/* Stepper Bar */}
      <div className="setup-stepper-bar">
        {STEPS.map((s) => (
          <button
            key={s.num}
            className={`setup-stepper-step ${step > s.num ? 'completed' : step === s.num ? 'active' : ''}`}
            onClick={() => goToStep(s.num)}
            type="button"
          >
            <div className="setup-stepper-circle">
              {step > s.num ? <Check size={14} /> : s.num}
            </div>
            <span className="setup-stepper-label">{s.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div className="setup-wizard-body">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="setup-wizard-nav">
        {step > 1 && (
          <button className="btn btn-secondary" onClick={goBack}>
            Back
          </button>
        )}
        <div className="setup-wizard-nav-spacer" />
        {step < STEPS.length ? (
          <button className="btn btn-primary" onClick={goNext}>
            {nextLabel}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        )}
      </div>
    </div>
  )
}
