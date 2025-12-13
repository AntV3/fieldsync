import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function BudgetDashboard({ projectId, onShowToast }) {
  const [budgetSummary, setBudgetSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadBudgetData()
  }, [projectId])

  const loadBudgetData = async () => {
    try {
      setLoading(true)
      const summary = await db.getProjectBudgetSummary(projectId)
      setBudgetSummary(summary)
    } catch (error) {
      console.error('Error loading budget data:', error)
      onShowToast?.('Error loading budget data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '$0'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const getStatusClass = (percentage) => {
    if (percentage >= 100) return 'over'
    if (percentage >= 90) return 'warning'
    return 'good'
  }

  const exportBudgetReport = async () => {
    if (!budgetSummary) return

    try {
      setExporting(true)

      // Create workbook
      const wb = XLSX.utils.book_new()

      // Summary sheet
      const summaryData = [
        ['Project Budget Report'],
        ['Project:', budgetSummary.project_name],
        ['Report Date:', new Date().toLocaleDateString()],
        [],
        ['Category', 'Budget', 'Actual', 'Variance', 'Percentage'],
        [
          'Labor',
          budgetSummary.labor_budget,
          budgetSummary.labor_actual,
          budgetSummary.labor_variance,
          `${budgetSummary.labor_percentage}%`
        ],
        [
          'Materials',
          budgetSummary.materials_budget,
          budgetSummary.materials_actual,
          budgetSummary.materials_variance,
          `${budgetSummary.materials_percentage}%`
        ],
        [
          'Equipment',
          budgetSummary.equipment_budget,
          budgetSummary.equipment_actual,
          budgetSummary.equipment_variance,
          `${budgetSummary.equipment_percentage}%`
        ],
        [
          'Other',
          budgetSummary.other_budget,
          budgetSummary.other_actual,
          budgetSummary.other_variance,
          `${budgetSummary.other_percentage}%`
        ],
        [],
        [
          'TOTAL',
          budgetSummary.total_budget,
          budgetSummary.total_actual,
          budgetSummary.total_variance,
          `${budgetSummary.total_percentage}%`
        ]
      ]

      const ws = XLSX.utils.aoa_to_sheet(summaryData)

      // Set column widths
      ws['!cols'] = [
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 }
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Budget Summary')

      // Generate file
      const fileName = `Budget_Report_${budgetSummary.project_name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, fileName)

      onShowToast?.('Budget report exported successfully', 'success')
    } catch (error) {
      console.error('Error exporting budget report:', error)
      onShowToast?.('Error exporting budget report', 'error')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="budget-dashboard">
        <div className="budget-dashboard-header">
          <h2>💰 Budget vs Actual</h2>
        </div>
        <div className="budget-no-data">
          <div className="budget-no-data-icon">⏳</div>
          <p>Loading budget data...</p>
        </div>
      </div>
    )
  }

  if (!budgetSummary || budgetSummary.total_budget === 0) {
    return (
      <div className="budget-dashboard">
        <div className="budget-dashboard-header">
          <h2>💰 Budget vs Actual</h2>
        </div>
        <div className="budget-no-data">
          <div className="budget-no-data-icon">📊</div>
          <p>No budget has been set for this project.</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            Budget tracking helps you compare estimated vs actual costs.
          </p>
        </div>
      </div>
    )
  }

  const categories = [
    {
      name: 'Labor',
      budget: budgetSummary.labor_budget,
      actual: budgetSummary.labor_actual,
      percentage: budgetSummary.labor_percentage,
      variance: budgetSummary.labor_variance
    },
    {
      name: 'Materials',
      budget: budgetSummary.materials_budget,
      actual: budgetSummary.materials_actual,
      percentage: budgetSummary.materials_percentage,
      variance: budgetSummary.materials_variance
    },
    {
      name: 'Equipment',
      budget: budgetSummary.equipment_budget,
      actual: budgetSummary.equipment_actual,
      percentage: budgetSummary.equipment_percentage,
      variance: budgetSummary.equipment_variance
    },
    {
      name: 'Other',
      budget: budgetSummary.other_budget,
      actual: budgetSummary.other_actual,
      percentage: budgetSummary.other_percentage,
      variance: budgetSummary.other_variance
    }
  ]

  // Filter out categories with no budget
  const activeCategories = categories.filter(cat => cat.budget > 0)

  // Check for alerts
  const hasOverBudget = budgetSummary.total_percentage >= 100
  const hasWarning = budgetSummary.total_percentage >= 90 && budgetSummary.total_percentage < 100
  const overBudgetCategories = activeCategories.filter(cat => cat.percentage >= 100)

  return (
    <div className="budget-dashboard">
      <div className="budget-dashboard-header">
        <h2>💰 Budget vs Actual</h2>
        <button
          className="budget-export-btn"
          onClick={exportBudgetReport}
          disabled={exporting}
        >
          <span>📄</span>
          <span>{exporting ? 'Exporting...' : 'Export Report'}</span>
        </button>
      </div>

      {/* Alerts */}
      {hasOverBudget && (
        <div className="budget-alert over">
          <div className="budget-alert-icon">🔴</div>
          <div className="budget-alert-text">
            <strong>Over Budget!</strong>
            <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Project is {formatCurrency(Math.abs(budgetSummary.total_variance))} over budget
              {overBudgetCategories.length > 0 && (
                <span> ({overBudgetCategories.map(c => c.name).join(', ')})</span>
              )}
            </div>
          </div>
        </div>
      )}

      {hasWarning && !hasOverBudget && (
        <div className="budget-alert warning">
          <div className="budget-alert-icon">⚠️</div>
          <div className="budget-alert-text">
            <strong>Approaching Budget Limit</strong>
            <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Project is at {budgetSummary.total_percentage}% of total budget
            </div>
          </div>
        </div>
      )}

      {/* Budget Categories */}
      <div className="budget-categories">
        {activeCategories.map(category => {
          const statusClass = getStatusClass(category.percentage)
          const displayPercentage = Math.min(category.percentage, 150) // Cap display at 150%

          return (
            <div key={category.name} className="budget-category">
              <div className="budget-category-header">
                <div className="budget-category-name">
                  {category.name}
                  {category.percentage >= 100 && ' 🔴'}
                  {category.percentage >= 90 && category.percentage < 100 && ' ⚠️'}
                </div>
                <div className="budget-category-amount">
                  <span className="actual">{formatCurrency(category.actual)}</span>
                  {' / '}
                  {formatCurrency(category.budget)}
                </div>
              </div>

              <div className="budget-progress-bar">
                <div
                  className={`budget-progress-fill ${statusClass}`}
                  style={{ width: `${displayPercentage}%` }}
                >
                  {category.percentage > 10 && (
                    <span className="budget-progress-percentage">
                      {category.percentage}%
                    </span>
                  )}
                </div>
              </div>

              <div className="budget-category-details">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {category.budget - category.actual > 0
                    ? `${formatCurrency(category.budget - category.actual)} remaining`
                    : 'Budget exceeded'}
                </span>
                {category.variance !== 0 && (
                  <span className={`budget-variance ${category.variance > 0 ? 'negative' : 'positive'}`}>
                    {category.variance > 0 ? '+' : ''}{formatCurrency(category.variance)}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* Total Summary */}
        <div className="budget-category" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid var(--border-color)' }}>
          <div className="budget-category-header">
            <div className="budget-category-name" style={{ fontSize: '1.1rem' }}>
              TOTAL
            </div>
            <div className="budget-category-amount" style={{ fontSize: '1.05rem' }}>
              <span className="actual">{formatCurrency(budgetSummary.total_actual)}</span>
              {' / '}
              {formatCurrency(budgetSummary.total_budget)}
            </div>
          </div>

          <div className="budget-progress-bar" style={{ height: '28px' }}>
            <div
              className={`budget-progress-fill ${getStatusClass(budgetSummary.total_percentage)}`}
              style={{ width: `${Math.min(budgetSummary.total_percentage, 150)}%` }}
            >
              <span className="budget-progress-percentage" style={{ fontSize: '0.85rem' }}>
                {budgetSummary.total_percentage}%
              </span>
            </div>
          </div>

          <div className="budget-category-details">
            <span style={{ color: 'var(--text-secondary)' }}>
              {budgetSummary.total_budget - budgetSummary.total_actual > 0
                ? `${formatCurrency(budgetSummary.total_budget - budgetSummary.total_actual)} remaining`
                : 'Budget exceeded'}
            </span>
            {budgetSummary.total_variance !== 0 && (
              <span className={`budget-variance ${budgetSummary.total_variance > 0 ? 'negative' : 'positive'}`}>
                {budgetSummary.total_variance > 0 ? '+' : ''}{formatCurrency(budgetSummary.total_variance)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="budget-summary-card">
        <div className="budget-summary-grid">
          <div className="budget-summary-item">
            <div className="budget-summary-label">Total Budget</div>
            <div className="budget-summary-value total-budget">
              {formatCurrency(budgetSummary.total_budget)}
            </div>
          </div>
          <div className="budget-summary-item">
            <div className="budget-summary-label">Total Spent</div>
            <div className="budget-summary-value total-actual">
              {formatCurrency(budgetSummary.total_actual)}
            </div>
          </div>
          <div className="budget-summary-item">
            <div className="budget-summary-label">
              {budgetSummary.total_variance > 0 ? 'Over Budget' : 'Remaining'}
            </div>
            <div className={`budget-summary-value ${budgetSummary.total_variance > 0 ? 'over' : 'remaining'}`}>
              {formatCurrency(Math.abs(budgetSummary.total_variance))}
            </div>
          </div>
          <div className="budget-summary-item">
            <div className="budget-summary-label">Progress</div>
            <div className="budget-summary-value total-actual">
              {budgetSummary.total_percentage}%
            </div>
          </div>
        </div>
      </div>

      <p style={{
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
        marginTop: '1rem',
        textAlign: 'center'
      }}>
        Budget actuals are calculated from approved T&M tickets
      </p>
    </div>
  )
}
