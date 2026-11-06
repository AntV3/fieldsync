import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { sumAreaWeights, areaTotalWithinTolerance } from '../../lib/projectSetupValidation'

function ProjectEditForm({ editData, saving, onCancel, onEditChange, onAreaEditChange, onAddArea, onRemoveArea, onSave, onDelete }) {
  // Same rounding as validateOptionalAreas so the row never reads "invalid"
  // for a total the save accepts (33.3 / 33.3 / 33.3).
  const totalWeight = useMemo(() => sumAreaWeights(editData.areas), [editData.areas])
  const hasAreas = editData.areas.length > 0
  const endBeforeStart = Boolean(
    editData.start_date && editData.end_date && new Date(editData.end_date) < new Date(editData.start_date)
  )

  return (
    <div>
      <button className="btn btn-secondary btn-small" onClick={onCancel} style={{ marginBottom: '1.5rem' }}>
        <ArrowLeft size={14} /> Cancel
      </button>

      <h1>Edit Project</h1>
      <p className="subtitle">Update project details</p>

      {/* Basic Info */}
      <div className="card">
        <h3>Basic Info</h3>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Project Name *</label>
            <input type="text" value={editData.name} onChange={(e) => onEditChange('name', e.target.value)} placeholder="e.g., Downtown Office Demolition" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Job Number</label>
            <input type="text" value={editData.job_number} onChange={(e) => onEditChange('job_number', e.target.value)} placeholder="e.g., 2024-001" />
          </div>
        </div>
        <div className="form-group">
          <label>Project Address</label>
          <input type="text" value={editData.address} onChange={(e) => onEditChange('address', e.target.value)} placeholder="123 Main St, City, State 12345" />
        </div>
      </div>

      {/* Client & Contractor Info */}
      <div className="card">
        <h3>Contractor</h3>
        <div className="form-group">
          <label>General Contractor</label>
          <input type="text" value={editData.general_contractor} onChange={(e) => onEditChange('general_contractor', e.target.value)} placeholder="e.g., ABC Construction" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Contact Name</label>
            <input type="text" value={editData.contractor_contact} onChange={(e) => onEditChange('contractor_contact', e.target.value)} placeholder="e.g., John Smith" />
          </div>
          <div className="form-group">
            <label>Position</label>
            <input type="text" value={editData.contractor_position} onChange={(e) => onEditChange('contractor_position', e.target.value)} placeholder="e.g., Project Manager" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Phone</label>
            <input type="tel" value={editData.contractor_phone} onChange={(e) => onEditChange('contractor_phone', e.target.value)} placeholder="(555) 123-4567" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={editData.contractor_email} onChange={(e) => onEditChange('contractor_email', e.target.value)} placeholder="john@contractor.com" />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Client</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Contact Name</label>
            <input type="text" value={editData.client_contact} onChange={(e) => onEditChange('client_contact', e.target.value)} placeholder="e.g., Jane Doe" />
          </div>
          <div className="form-group">
            <label>Position</label>
            <input type="text" value={editData.client_position} onChange={(e) => onEditChange('client_position', e.target.value)} placeholder="e.g., Owner Representative" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Phone</label>
            <input type="tel" value={editData.client_phone} onChange={(e) => onEditChange('client_phone', e.target.value)} placeholder="(555) 987-6543" />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={editData.client_email} onChange={(e) => onEditChange('client_email', e.target.value)} placeholder="jane@client.com" />
          </div>
        </div>
      </div>

      {/* Financial & Project Settings */}
      <div className="card">
        <h3>Financials & Settings</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Contract Value ($) <span className="optional">(optional)</span></label>
            <input
              type="text"
              inputMode="decimal"
              value={editData.contract_value}
              onChange={(e) => onEditChange('contract_value', e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="e.g., 250000"
            />
            <span className="form-hint">Leave blank for T&amp;M-only work</span>
          </div>
          <div className="form-group">
            <label>Foreman PIN</label>
            <input type="text" value={editData.pin} onChange={(e) => onEditChange('pin', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 digits" maxLength={4} />
            <span className="form-hint">Used for field crew access</span>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Work Type</label>
            <select value={editData.work_type} onChange={(e) => onEditChange('work_type', e.target.value)}>
              <option value="demolition">Demolition</option>
              <option value="environmental">Environmental</option>
            </select>
            <span className="form-hint">Affects labor rate calculations</span>
          </div>
          <div className="form-group">
            <label>Job Type</label>
            <select value={editData.job_type} onChange={(e) => onEditChange('job_type', e.target.value)}>
              <option value="standard">Standard</option>
              <option value="prevailing_wage">Prevailing Wage</option>
            </select>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="card">
        <h3>Schedule <span className="optional">(optional)</span></h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Enter both dates to track schedule variance, or leave both blank.
        </p>
        <div className="form-row">
          <div className="form-group">
            <label>Start Date</label>
            <input
              type="date"
              value={editData.start_date}
              onChange={(e) => onEditChange('start_date', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input
              type="date"
              value={editData.end_date}
              onChange={(e) => onEditChange('end_date', e.target.value)}
              min={editData.start_date || undefined}
            />
            {endBeforeStart && (
              <span className="error-text">End date must be after start date</span>
            )}
          </div>
        </div>
        <div className="form-group">
          <label>Planned Man-Days</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g., 120"
            value={editData.planned_man_days}
            onChange={(e) => onEditChange('planned_man_days', e.target.value.replace(/\D/g, ''))}
            min="1"
          />
          <span className="form-hint">Total estimated man-days to complete the project</span>
        </div>
      </div>

      <div className="card">
        <h3>Areas</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Optional — used for % complete and earned value. If you add areas, weights must total 100%.
        </p>
        {editData.areas.map((area, index) => (
          <div key={index} className="area-row">
            <input type="text" placeholder="Area name" value={area.name} onChange={(e) => onAreaEditChange(index, 'name', e.target.value)} />
            <input type="number" placeholder="%" value={area.weight} onChange={(e) => onAreaEditChange(index, 'weight', e.target.value)} />
            <button className="remove-btn" onClick={() => onRemoveArea(index)} aria-label="Remove area">×</button>
          </div>
        ))}
        {hasAreas && (
          <div className="weight-total">
            <span className="weight-total-label">Total Weight:</span>
            <span className={`weight-total-value ${areaTotalWithinTolerance(totalWeight) ? 'valid' : 'invalid'}`}>
              {totalWeight}%
            </span>
          </div>
        )}
        <button className="btn btn-secondary" onClick={onAddArea}>+ Add Area</button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={onSave} disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <button className="btn btn-danger btn-full" onClick={onDelete}>
        Delete Project
      </button>
    </div>
  )
}

export default ProjectEditForm
