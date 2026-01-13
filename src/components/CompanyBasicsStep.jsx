import { useState } from 'react'

const INDUSTRIES = [
  { value: '', label: 'Select industry...' },
  { value: 'demolition', label: 'Demolition' },
  { value: 'environmental', label: 'Environmental Remediation' },
  { value: 'general_construction', label: 'General Construction' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'painting', label: 'Painting' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'excavation', label: 'Excavation' },
  { value: 'other', label: 'Other' }
]

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' }
]

export default function CompanyBasicsStep({ onSubmit, loading }) {
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    timezone: 'America/Los_Angeles'
  })
  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Company name is required'
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Company name must be at least 2 characters'
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Company name must be less than 100 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (validate()) {
      onSubmit({
        name: formData.name.trim(),
        industry: formData.industry || null,
        timezone: formData.timezone
      })
    }
  }

  return (
    <div className="onboarding-step company-basics-step">
      <h2>Create Your Company</h2>
      <p className="step-description">
        Let's get your company set up in FieldSync.
      </p>

      <form onSubmit={handleSubmit} className="onboarding-form">
        <div className="form-group">
          <label htmlFor="name">Company Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., ABC Demolition"
            className={errors.name ? 'error' : ''}
            disabled={loading}
            autoFocus
          />
          {errors.name && <span className="error-message">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="industry">Industry</label>
          <select
            id="industry"
            name="industry"
            value={formData.industry}
            onChange={handleChange}
            disabled={loading}
          >
            {INDUSTRIES.map(ind => (
              <option key={ind.value} value={ind.value}>
                {ind.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="timezone">Timezone</label>
          <select
            id="timezone"
            name="timezone"
            value={formData.timezone}
            onChange={handleChange}
            disabled={loading}
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}
