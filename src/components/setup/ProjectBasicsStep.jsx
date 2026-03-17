import { useTradeConfig } from '../../lib/TradeConfigContext'

export default function ProjectBasicsStep({ data, onChange }) {
  const update = (field, value) => onChange({ ...data, [field]: value })
  const { resolvedConfig, companyConfig, loading: tradeLoading } = useTradeConfig()

  // If company has a trade config, show the trade name; otherwise show the legacy toggle
  const hasTradeConfig = !!companyConfig
  const tradeName = resolvedConfig?.trade_name || companyConfig?.trade_template_id

  return (
    <div className="wizard-step-content">
      <div className="wizard-step-header">
        <h2>Project Basics</h2>
        <p>Enter the core details for your new project.</p>
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

        <div className="form-row-2">
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
            <label>Contract Value ($) <span className="required">*</span></label>
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
            />
          </div>
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
    </div>
  )
}
