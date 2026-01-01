import { useState } from 'react'
import { X, DollarSign, HardHat, Package, Wrench, Users, MoreHorizontal, Truck } from 'lucide-react'

// Category options with icons
const categories = [
  { value: 'labor', label: 'Labor', Icon: HardHat, description: 'Additional labor costs' },
  { value: 'materials', label: 'Materials', Icon: Package, description: 'Materials and supplies' },
  { value: 'equipment', label: 'Equipment', Icon: Wrench, description: 'Equipment rental or purchase' },
  { value: 'subcontractor', label: 'Subcontractor', Icon: Users, description: 'Subcontractor work' },
  { value: 'disposal', label: 'Disposal', Icon: Truck, description: 'Additional disposal costs' },
  { value: 'other', label: 'Other', Icon: MoreHorizontal, description: 'Miscellaneous costs' }
]

export default function AddCostModal({ onClose, onSave, saving = false }) {
  const [formData, setFormData] = useState({
    category: 'materials',
    description: '',
    amount: '',
    cost_date: new Date().toISOString().split('T')[0],
    notes: ''
  })
  const [errors, setErrors] = useState({})

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      newErrors.amount = 'Enter a valid amount'
    }

    if (!formData.cost_date) {
      newErrors.cost_date = 'Date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (validate()) {
      onSave(formData)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content add-cost-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <DollarSign size={20} />
            Add Cost
          </h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Category Selection */}
            <div className="form-group">
              <label>Category *</label>
              <div className="category-grid">
                {categories.map(cat => {
                  const Icon = cat.Icon
                  const isSelected = formData.category === cat.value
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      className={`category-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleChange('category', cat.value)}
                    >
                      <Icon size={18} />
                      <span className="category-label">{cat.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Description */}
            <div className="form-group">
              <label htmlFor="cost-description">Description *</label>
              <input
                id="cost-description"
                type="text"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="e.g., Excavator rental - Week 1"
                className={errors.description ? 'error' : ''}
              />
              {errors.description && (
                <span className="form-error">{errors.description}</span>
              )}
            </div>

            {/* Amount and Date Row */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cost-amount">Amount *</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    id="cost-amount"
                    type="text"
                    inputMode="decimal"
                    value={formData.amount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '')
                      handleChange('amount', val)
                    }}
                    placeholder="0.00"
                    className={errors.amount ? 'error' : ''}
                  />
                </div>
                {errors.amount && (
                  <span className="form-error">{errors.amount}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="cost-date">Date *</label>
                <input
                  id="cost-date"
                  type="date"
                  value={formData.cost_date}
                  onChange={(e) => handleChange('cost_date', e.target.value)}
                  className={errors.cost_date ? 'error' : ''}
                />
                {errors.cost_date && (
                  <span className="form-error">{errors.cost_date}</span>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label htmlFor="cost-notes">Notes (optional)</label>
              <textarea
                id="cost-notes"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Additional details..."
                rows={2}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Add Cost'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
