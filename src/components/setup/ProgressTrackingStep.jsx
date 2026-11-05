import AreasTasksStep from './AreasTasksStep'

/**
 * Step 3 of the New Project wizard. Everything here is optional: T&M
 * ticketing never needs a contract value, schedule or weighted work areas.
 * Fields left blank are stored as NULL and can be added any time from
 * Project Info → Edit Project.
 */
export default function ProgressTrackingStep({ data, onChange, onShowToast }) {
  const update = (field, value) => onChange({ ...data, [field]: value })

  const endBeforeStart = data.startDate && data.endDate
    && new Date(data.endDate) < new Date(data.startDate)

  return (
    <div className="wizard-step-content">
      <div className="wizard-step-header">
        <h2>Progress tracking <span className="optional">(optional)</span></h2>
        <p>
          Add a contract value, schedule and work areas if you want % complete,
          earned value and schedule tracking. T&amp;M tickets work without any of
          this — you can skip it now and add it later from Project Info.
        </p>
      </div>

      <div className="card">
        <h3 className="wizard-section-title">Contract &amp; schedule</h3>

        <div className="form-group">
          <label>Contract Value ($) <span className="optional">(optional)</span></label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g., 365000"
            value={data.contractValue}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^0-9.]/g, '')
              update('contractValue', cleaned)
            }}
            className="currency-input"
            aria-label="Contract Value"
          />
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={data.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              aria-label="Start Date"
            />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input
              type="date"
              value={data.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              min={data.startDate || undefined}
              aria-label="End Date"
            />
            {endBeforeStart && (
              <span className="error-text">End date must be after start date</span>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>Planned Man-Days <span className="optional">(optional)</span></label>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Total estimated man-days to complete the project
          </p>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g., 120"
            value={data.plannedManDays}
            onChange={(e) => update('plannedManDays', e.target.value.replace(/\D/g, ''))}
            min="1"
            aria-label="Planned Man-Days"
          />
        </div>
      </div>

      <AreasTasksStep data={data} onChange={onChange} onShowToast={onShowToast} embedded />
    </div>
  )
}
