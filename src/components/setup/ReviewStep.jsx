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

export default function ReviewStep({ data, onEdit }) {
  const validAreas = data.areas.filter(a => a.name.trim() && parseFloat(a.weight) > 0)
  const totalWeight = validAreas.reduce((sum, a) => sum + (parseFloat(a.weight) || 0), 0)
  const totalSOV = validAreas.reduce((sum, a) => sum + (parseFloat(a.scheduledValue) || 0), 0)

  const groups = [...new Set(validAreas.map(a => a.group || 'General'))]

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
            <span className="wizard-review-label">Contract Value</span>
            <span className="wizard-review-value">{formatCurrency(data.contractValue)}</span>
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

      {/* Schedule & Access */}
      <div className="card wizard-review-card">
        <div className="wizard-review-header">
          <h3>Schedule & Access</h3>
          <button className="btn btn-secondary btn-small" onClick={() => onEdit(3)}>Edit</button>
        </div>
        <div className="wizard-review-grid">
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
          <div className="wizard-review-item">
            <span className="wizard-review-label">Foreman PIN</span>
            <span className="wizard-review-value" style={{ fontFamily: 'monospace', letterSpacing: '0.15em' }}>
              {data.pin || '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Areas / Tasks */}
      <div className="card wizard-review-card">
        <div className="wizard-review-header">
          <h3>Areas & Tasks ({validAreas.length})</h3>
          <button className="btn btn-secondary btn-small" onClick={() => onEdit(4)}>Edit</button>
        </div>

        {groups.length > 1 ? (
          groups.map(group => {
            const groupAreas = validAreas.filter(a => (a.group || 'General') === group)
            return (
              <div key={group} className="wizard-review-task-group">
                <div className="wizard-review-task-group-name">{group}</div>
                {groupAreas.map((area, i) => (
                  <div key={i} className="wizard-review-task-row">
                    <span className="wizard-review-task-name">{area.name}</span>
                    <span className="wizard-review-task-meta">
                      {area.scheduledValue > 0 && <span>{formatCurrency(area.scheduledValue)}</span>}
                      <span className="wizard-review-task-weight">{area.weight}%</span>
                    </span>
                  </div>
                ))}
              </div>
            )
          })
        ) : (
          validAreas.map((area, i) => (
            <div key={i} className="wizard-review-task-row">
              <span className="wizard-review-task-name">{area.name}</span>
              <span className="wizard-review-task-meta">
                {area.scheduledValue > 0 && <span>{formatCurrency(area.scheduledValue)}</span>}
                <span className="wizard-review-task-weight">{area.weight}%</span>
              </span>
            </div>
          ))
        )}

        <div className="wizard-review-task-totals">
          <span>Total: {totalWeight.toFixed(1)}%</span>
          {totalSOV > 0 && <span>SOV: {formatCurrency(totalSOV)}</span>}
        </div>
      </div>
    </div>
  )
}
