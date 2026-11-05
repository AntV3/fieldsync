import { useTradeConfig } from '../../lib/TradeConfigContext'

export default function ProjectBasicsStep({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value })
  const { resolvedConfig, companyConfig } = useTradeConfig()

  // If company has a trade config, show the trade name; otherwise show the legacy toggle
  const hasTradeConfig = !!companyConfig
  const tradeName = resolvedConfig?.trade_name || companyConfig?.trade_template_id

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
        <h2>Project Basics</h2>
        <p>Name the project and set the foreman PIN. Everything else is optional.</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label>Project Name <span className="required">*</span></label>
          <input
            type="text"
            placeholder="e.g., Sunrise Apartments"
            value={data.projectName}
            onChange={(e) => update('projectName', e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Job Number</label>
          <input
            type="text"
            placeholder="e.g., 4032"
            value={data.jobNumber}
            onChange={(e) => update('jobNumber', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Project Address</label>
          <input
            type="text"
            placeholder="e.g., 123 Main St, Los Angeles, CA 90001"
            value={data.address}
            onChange={(e) => update('address', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>General Contractor</label>
          <input
            type="text"
            placeholder="e.g., ABC Construction Inc."
            value={data.generalContractor}
            onChange={(e) => update('generalContractor', e.target.value)}
          />
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label>Work Type</label>
            {hasTradeConfig ? (
              <div className="trade-type-display">
                <span className="trade-type-badge">{tradeName || 'Custom'}</span>
                <span className="trade-type-hint">Configured in Trade Profile settings</span>
              </div>
            ) : (
              <div className="project-type-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${data.workType === 'demolition' ? 'active' : ''}`}
                  onClick={() => update('workType', 'demolition')}
                >
                  Demolition
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${data.workType === 'abatement' ? 'active' : ''}`}
                  onClick={() => update('workType', 'abatement')}
                >
                  Abatement
                </button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Job Type</label>
            <div className="project-type-toggle">
              <button
                type="button"
                className={`toggle-btn ${data.jobType === 'standard' ? 'active' : ''}`}
                onClick={() => update('jobType', 'standard')}
              >
                Standard
              </button>
              <button
                type="button"
                className={`toggle-btn ${data.jobType === 'pla' ? 'active' : ''}`}
                onClick={() => update('jobType', 'pla')}
              >
                PLA
              </button>
            </div>
          </div>
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
              aria-label="Foreman PIN"
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
