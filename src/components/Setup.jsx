import { useState } from 'react'
import { Check } from 'lucide-react'
import { db } from '../lib/supabase'
import ProjectBasicsStep from './setup/ProjectBasicsStep'
import ContactsStep from './setup/ContactsStep'
import ScheduleAccessStep from './setup/ScheduleAccessStep'
import AreasTasksStep from './setup/AreasTasksStep'
import ReviewStep from './setup/ReviewStep'

const STEPS = [
  { num: 1, label: 'Basics', shortLabel: 'Basics' },
  { num: 2, label: 'Contacts', shortLabel: 'People' },
  { num: 3, label: 'Schedule', shortLabel: 'Sched.' },
  { num: 4, label: 'Phases', shortLabel: 'Phases' },
  { num: 5, label: 'Review', shortLabel: 'Review' }
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
  areas: [
    { name: '', weight: '', group: '', scheduledValue: null, tempPhaseId: null },
    { name: '', weight: '', group: '', scheduledValue: null, tempPhaseId: null },
    { name: '', weight: '', group: '', scheduledValue: null, tempPhaseId: null }
  ]
}

export default function Setup({ company, user, onProjectCreated, onShowToast }) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState(INITIAL_DATA)
  const [creating, setCreating] = useState(false)

  const totalWeight = data.areas.reduce((sum, area) => sum + (parseFloat(area.weight) || 0), 0)

  const validateStep = (stepNum) => {
    switch (stepNum) {
      case 1: {
        if (!data.projectName.trim()) {
          onShowToast('Please enter a project name', 'error')
          return false
        }
        const contractVal = parseFloat(data.contractValue)
        if (!contractVal || contractVal <= 0) {
          onShowToast('Please enter a valid contract value', 'error')
          return false
        }
        return true
      }
      case 2:
        // Contacts are optional
        return true
      case 3:
        if (!data.startDate || !data.endDate) {
          onShowToast('Start date and end date are required', 'error')
          return false
        }
        if (new Date(data.endDate) < new Date(data.startDate)) {
          onShowToast('End date must be after start date', 'error')
          return false
        }
        if (data.pin.length !== 4) {
          onShowToast('Please enter a 4-digit PIN', 'error')
          return false
        }
        return true
      case 4: {
        const validAreas = data.areas.filter(a => a.name.trim() && parseFloat(a.weight) > 0)
        if (validAreas.length === 0) {
          onShowToast('Please add at least one area with a name and weight', 'error')
          return false
        }
        if (Math.abs(totalWeight - 100) > 0.1) {
          onShowToast('Area weights must total 100%', 'error')
          return false
        }
        const namedPhases = (data.phases || []).filter(p => p.name && p.name.trim())
        const seen = new Set()
        for (const p of namedPhases) {
          const key = p.name.trim().toLowerCase()
          if (seen.has(key)) {
            onShowToast(`Duplicate phase name: "${p.name.trim()}"`, 'error')
            return false
          }
          seen.add(key)
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
    if (!company?.id) {
      onShowToast('No company selected. Please log in again.', 'error')
      return
    }

    // Run all validations
    for (let s = 1; s <= 4; s++) {
      if (!validateStep(s)) {
        setStep(s)
        return
      }
    }

    const pinAvailable = await db.isPinAvailable(data.pin, company.id)
    if (!pinAvailable) {
      onShowToast('This PIN is already in use. Try another.', 'error')
      setStep(3)
      return
    }

    setCreating(true)

    try {
      const contractVal = parseFloat(data.contractValue)
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
        contract_value: contractVal,
        pin: data.pin,
        work_type: data.workType,
        job_type: data.jobType,
        company_id: company?.id,
        created_by: user?.id,
        start_date: data.startDate,
        end_date: data.endDate,
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

      const validAreas = data.areas.filter(a => a.name.trim() && parseFloat(a.weight) > 0)
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
      setData(INITIAL_DATA)
      setStep(1)
      onProjectCreated()
    } catch (error) {
      console.error('Error creating project:', error)
      onShowToast('Error creating project', 'error')
    } finally {
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
        return <ScheduleAccessStep data={data} onChange={setData} />
      case 4:
        return <AreasTasksStep data={data} onChange={setData} onShowToast={onShowToast} />
      case 5:
        return <ReviewStep data={data} onEdit={goToStep} />
      default:
        return null
    }
  }

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
            {step === STEPS.length - 1 ? 'Review' : 'Continue'}
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
