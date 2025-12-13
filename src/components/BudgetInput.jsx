import { useState, useEffect } from 'react'

export default function BudgetInput({ budget, onBudgetChange, showLaborRate = true }) {
  const [laborBudget, setLaborBudget] = useState(budget?.labor_budget || '')
  const [materialsBudget, setMaterialsBudget] = useState(budget?.materials_budget || '')
  const [equipmentBudget, setEquipmentBudget] = useState(budget?.equipment_budget || '')
  const [otherBudget, setOtherBudget] = useState(budget?.other_budget || '')
  const [laborRate, setLaborRate] = useState(budget?.company_labor_rate || '')

  // Calculate total budget
  const totalBudget =
    (parseFloat(laborBudget) || 0) +
    (parseFloat(materialsBudget) || 0) +
    (parseFloat(equipmentBudget) || 0) +
    (parseFloat(otherBudget) || 0)

  // Update parent when values change
  useEffect(() => {
    onBudgetChange({
      labor_budget: parseFloat(laborBudget) || 0,
      materials_budget: parseFloat(materialsBudget) || 0,
      equipment_budget: parseFloat(equipmentBudget) || 0,
      other_budget: parseFloat(otherBudget) || 0,
      total_budget: totalBudget,
      company_labor_rate: parseFloat(laborRate) || 0
    })
  }, [laborBudget, materialsBudget, equipmentBudget, otherBudget, laborRate, totalBudget, onBudgetChange])

  const formatCurrency = (value) => {
    if (!value) return '$0'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  return (
    <div className="budget-input-container">
      <div className="budget-input-header">
        <h3>Project Budget (Optional)</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          Set budget amounts for tracking actual costs vs estimated costs
        </p>
      </div>

      {showLaborRate && (
        <div className="form-group">
          <label>Company Labor Rate ($/hour)</label>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Used to calculate labor costs from T&M tickets
          </p>
          <input
            type="number"
            placeholder="e.g., 75"
            value={laborRate}
            onChange={(e) => setLaborRate(e.target.value)}
            step="0.01"
          />
        </div>
      )}

      <div className="budget-grid">
        <div className="form-group">
          <label>Labor Budget ($)</label>
          <input
            type="number"
            placeholder="e.g., 30000"
            value={laborBudget}
            onChange={(e) => setLaborBudget(e.target.value)}
            step="0.01"
          />
        </div>

        <div className="form-group">
          <label>Materials Budget ($)</label>
          <input
            type="number"
            placeholder="e.g., 15000"
            value={materialsBudget}
            onChange={(e) => setMaterialsBudget(e.target.value)}
            step="0.01"
          />
        </div>

        <div className="form-group">
          <label>Equipment Budget ($)</label>
          <input
            type="number"
            placeholder="e.g., 5000"
            value={equipmentBudget}
            onChange={(e) => setEquipmentBudget(e.target.value)}
            step="0.01"
          />
        </div>

        <div className="form-group">
          <label>Other Budget ($)</label>
          <input
            type="number"
            placeholder="e.g., 2000"
            value={otherBudget}
            onChange={(e) => setOtherBudget(e.target.value)}
            step="0.01"
          />
        </div>
      </div>

      {totalBudget > 0 && (
        <div className="budget-total">
          <strong>Total Budget:</strong> {formatCurrency(totalBudget)}
        </div>
      )}
    </div>
  )
}
