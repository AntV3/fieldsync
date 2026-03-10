export default function ScheduleAccessStep({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value })

  const handlePinChange = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4)
    update('pin', cleaned)
  }

  const generateRandomPin = () => {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    const randomPin = (1000 + (array[0] % 9000)).toString()
    update('pin', randomPin)
  }

  return (
    <div className="wizard-step-content">
      <div className="wizard-step-header">
        <h2>Schedule & Access</h2>
        <p>Set the project timeline and foreman access PIN.</p>
      </div>

      <div className="card">
        <h3 className="wizard-section-title">Project Schedule</h3>

        <div className="form-row-2">
          <div className="form-group">
            <label>Start Date <span className="required">*</span></label>
            <input
              type="date"
              value={data.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label>End Date <span className="required">*</span></label>
            <input
              type="date"
              value={data.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              min={data.startDate || undefined}
              required
            />
            {data.startDate && data.endDate && new Date(data.endDate) < new Date(data.startDate) && (
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
          />
        </div>
      </div>

      <div className="card">
        <h3 className="wizard-section-title">Foreman Access</h3>

        <div className="form-group">
          <label>Foreman PIN (4 digits) <span className="required">*</span></label>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Foremen will enter this PIN to access this project in the field
          </p>
          <div className="pin-input-row">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g., 2847"
              value={data.pin}
              onChange={(e) => handlePinChange(e.target.value)}
              maxLength={4}
              className="pin-input"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={generateRandomPin}
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
