import { validateOptionalAreas, isProgressTrackingEmpty } from '../../lib/projectSetupValidation'

const formatCurrency = (value) => {
  if (!value) return '-'
  const num = parseFloat(value)
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num)
}

const formatDateRange = (start, end) => {
  if (!start && !end) return null
  if (start && end) return `${start} – ${end}`
  return start || end
}

export default function ReviewStep({ data, onEdit }) {
  // Same rows that handleSubmit will save (untouched rows ignored). When the
  // step has a validation error this is empty, but the wizard never lets the
  // user reach Review in that state.
  const validAreas = validateOptionalAreas(data.areas).areas
  const totalWeight = validAreas.reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)
  const totalSOV = validAreas.reduce((sum, a) => sum + (parseFloat(a.scheduledValue) || 0), 0)
  const progressEmpty = isProgressTrackingEmpty(data)

  // Order: defined phases (by sort_order) first, then an "Unphased" bucket
  // for areas with no tempPhaseId. Phases that are still empty are shown
  // so the PM can see what they entered.
  const orderedPhases = [...(data.phases || [])]
    .filter(p => p.name && p.name.trim())
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const tasksByPhase = new Map(orderedPhases.map(p => [p.tempId, []]))
  const unphasedAreas = []
  validAreas.forEach(a => {
    if (a.tempPhaseId && tasksByPhase.has(a.tempPhaseId)) {
      tasksByPhase.get(a.tempPhaseId).push(a)
    } else {
      unphasedAreas.push(a)
    }
  })

  const hasAreasOrPhases = validAreas.length > 0 || orderedPhases.length > 0

  return (
    <div className="wizard-step-content">
      <div className="wizard-step-header">
        <h2>Review & Create</h2>
        <p>Review your project details before creating.</p>
      </div>

      {/* Project Basics */}
      <div className="card wizard-review-card">
        <div className="wizard-review-header">
          <h3>Project Basics</h3>
          <button className="btn btn-secondary btn-small" onClick={() => onEdit(1)}>Edit</button>
        </div>
        <div className="wizard-review-grid">
          <div className="wizard-review-item">
            <span className="wizard-review-label">Project Name</span>
            <span className="wizard-review-value">{data.projectName || '-'}</span>
          </div>
          <div className="wizard-review-item">
            <span className="wizard-review-label">Job Number</span>
            <span className="wizard-review-value">{data.jobNumber || '-'}</span>
          </div>
          <div className="wizard-review-item">
            <span className="wizard-review-label">Foreman PIN</span>
            <span className="wizard-review-value" style={{ fontFamily: 'monospace', letterSpacing: '0.15em' }}>
              {data.pin || '-'}
            </span>
          </div>
          <div className="wizard-review-item">
            <span className="wizard-review-label">Address</span>
            <span className="wizard-review-value">{data.address || '-'}</span>
          </div>
          <div className="wizard-review-item">
            <span className="wizard-review-label">General Contractor</span>
            <span className="wizard-review-value">{data.generalContractor || '-'}</span>
          </div>
          <div className="wizard-review-item">
            <span className="wizard-review-label">Work Type</span>
            <span className="wizard-review-value" style={{ textTransform: 'capitalize' }}>{data.workType}</span>
          </div>
          <div className="wizard-review-item">
            <span className="wizard-review-label">Job Type</span>
            <span className="wizard-review-value" style={{ textTransform: 'uppercase' }}>{data.jobType}</span>
          </div>
        </div>
      </div>

      {/* Contacts */}
      <div className="card wizard-review-card">
        <div className="wizard-review-header">
          <h3>Contacts</h3>
          <button className="btn btn-secondary btn-small" onClick={() => onEdit(2)}>Edit</button>
        </div>
        <div className="wizard-review-grid">
          {data.contractorContact && (
            <div className="wizard-review-item wizard-review-item-wide">
              <span className="wizard-review-label">Contractor</span>
              <span className="wizard-review-value">
                {data.contractorContact}
                {data.contractorPosition && ` · ${data.contractorPosition}`}
                {data.contractorPhone && ` · ${data.contractorPhone}`}
                {data.contractorEmail && ` · ${data.contractorEmail}`}
              </span>
            </div>
          )}
          {data.clientContact && (
            <div className="wizard-review-item wizard-review-item-wide">
              <span className="wizard-review-label">Client</span>
              <span className="wizard-review-value">
                {data.clientContact}
                {data.clientPosition && ` · ${data.clientPosition}`}
                {data.clientPhone && ` · ${data.clientPhone}`}
                {data.clientEmail && ` · ${data.clientEmail}`}
              </span>
            </div>
          )}
          {!data.contractorContact && !data.clientContact && (
            <div className="wizard-review-item wizard-review-item-wide">
              <span className="wizard-review-value" style={{ color: 'var(--text-muted)' }}>No contacts added</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress tracking */}
      <div className="card wizard-review-card">
        <div className="wizard-review-header">
          <h3>Progress tracking</h3>
          <button className="btn btn-secondary btn-small" onClick={() => onEdit(3)}>Edit</button>
        </div>

        {progressEmpty ? (
          <div className="wizard-review-grid">
            <div className="wizard-review-item wizard-review-item-wide">
              <span className="wizard-review-value" style={{ color: 'var(--text-muted)' }}>
                Not set up — contract value, schedule and work areas can be added any time from Project Info → Edit Project.
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="wizard-review-grid">
              <div className="wizard-review-item">
                <span className="wizard-review-label">Contract Value</span>
                <span className="wizard-review-value">{formatCurrency(data.contractValue)}</span>
              </div>
              <div className="wizard-review-item">
                <span className="wizard-review-label">Start Date</span>
                <span className="wizard-review-value">{data.startDate || '-'}</span>
              </div>
              <div className="wizard-review-item">
                <span className="wizard-review-label">End Date</span>
                <span className="wizard-review-value">{data.endDate || '-'}</span>
              </div>
              <div className="wizard-review-item">
                <span className="wizard-review-label">Planned Man-Days</span>
                <span className="wizard-review-value">{data.plannedManDays || '-'}</span>
              </div>
            </div>

            {hasAreasOrPhases && (
              <div className="wizard-review-task-group-name" style={{ marginTop: '1rem' }}>
                Phases &amp; Tasks ({validAreas.length} task{validAreas.length === 1 ? '' : 's'})
              </div>
            )}

            {orderedPhases.map(phase => {
              const phaseAreas = tasksByPhase.get(phase.tempId) || []
              const dateRange = formatDateRange(phase.planned_start_date, phase.planned_end_date)
              return (
                <div key={phase.tempId} className="wizard-review-task-group">
                  <div className="wizard-review-task-group-name">{phase.name}</div>
                  {(dateRange || phase.description) && (
                    <div className="fm-phase-meta">
                      {dateRange && <span>{dateRange}</span>}
                      {phase.description && <span>{phase.description}</span>}
                    </div>
                  )}
                  {phaseAreas.length === 0 ? (
                    <div className="wizard-review-task-row" style={{ color: 'var(--text-muted)' }}>
                      <span>No tasks yet</span>
                    </div>
                  ) : (
                    phaseAreas.map((area, i) => (
                      <div key={i} className="wizard-review-task-row">
                        <span className="wizard-review-task-name">{area.name}</span>
                        <span className="wizard-review-task-meta">
                          {area.scheduledValue > 0 && <span>{formatCurrency(area.scheduledValue)}</span>}
                          <span className="wizard-review-task-weight">{area.weight}%</span>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )
            })}

            {unphasedAreas.length > 0 && (
              <div className="wizard-review-task-group">
                <div className="wizard-review-task-group-name">
                  {orderedPhases.length === 0 ? 'Tasks' : 'Unphased'}
                </div>
                {unphasedAreas.map((area, i) => (
                  <div key={i} className="wizard-review-task-row">
                    <span className="wizard-review-task-name">{area.name}</span>
                    <span className="wizard-review-task-meta">
                      {area.scheduledValue > 0 && <span>{formatCurrency(area.scheduledValue)}</span>}
                      <span className="wizard-review-task-weight">{area.weight}%</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {validAreas.length > 0 && (
              <div className="wizard-review-task-totals">
                <span>Total: {totalWeight.toFixed(1)}%</span>
                {totalSOV > 0 && <span>SOV: {formatCurrency(totalSOV)}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
