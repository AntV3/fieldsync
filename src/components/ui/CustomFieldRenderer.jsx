import { Camera } from 'lucide-react'

/**
 * CustomFieldRenderer - Renders dynamic form fields based on field definitions.
 *
 * Props:
 * - fields: Array of field definition objects
 * - values: Object of current field values keyed by field key
 * - onChange: (key, value) => void
 * - disabled: boolean
 */
export default function CustomFieldRenderer({ fields, values = {}, onChange, disabled = false }) {
  if (!fields || fields.length === 0) return null

  const sorted = [...fields].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

  return (
    <div className="custom-fields-grid">
      {sorted.map(field => (
        <div key={field.key} className="custom-field-item">
          <label className="custom-field-label">
            {field.label}
            {field.required && <span className="required-mark">*</span>}
          </label>
          {renderField(field, values[field.key], (val) => onChange(field.key, val), disabled)}
        </div>
      ))}
    </div>
  )
}

function renderField(field, value, onChange, disabled) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          className="custom-field-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          required={field.required}
        />
      )

    case 'number':
      return (
        <input
          type="number"
          className="custom-field-input"
          value={value ?? ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          required={field.required}
        />
      )

    case 'textarea':
      return (
        <textarea
          className="custom-field-textarea"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          disabled={disabled}
          required={field.required}
          rows={3}
        />
      )

    case 'select':
      return (
        <select
          className="custom-field-select"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        >
          <option value="">{field.placeholder || 'Select...'}</option>
          {(field.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )

    case 'multiselect':
      return (
        <div className="custom-field-multiselect">
          {(field.options || []).map(opt => (
            <label key={opt} className="custom-field-checkbox-label">
              <input
                type="checkbox"
                checked={(value || []).includes(opt)}
                onChange={e => {
                  const current = value || []
                  onChange(
                    e.target.checked
                      ? [...current, opt]
                      : current.filter(v => v !== opt)
                  )
                }}
                disabled={disabled}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )

    case 'checkbox':
      return (
        <label className="custom-field-checkbox-label">
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span>{field.placeholder || 'Yes'}</span>
        </label>
      )

    case 'date':
      return (
        <input
          type="date"
          className="custom-field-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        />
      )

    case 'photo':
      return (
        <div className="custom-field-photo">
          <label className={`custom-field-photo-btn ${disabled ? 'disabled' : ''}`}>
            <Camera size={16} />
            <span>{value ? 'Photo attached' : 'Add Photo'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) onChange(file)
              }}
              disabled={disabled}
            />
          </label>
        </div>
      )

    default:
      return (
        <input
          type="text"
          className="custom-field-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          disabled={disabled}
        />
      )
  }
}
