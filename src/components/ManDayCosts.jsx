import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function ManDayCosts({ project, company, onShowToast }) {
  const [costData, setCostData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (project?.id && company?.id) {
      loadCostData()

      // Subscribe to crew check-in updates for real-time cost updates
      const subscription = db.subscribeToCrewCheckins?.(project.id, () => {
        loadCostData()
      })

      return () => {
        if (subscription) db.unsubscribe?.(subscription)
      }
    }
  }, [project?.id, company?.id])

  const loadCostData = async () => {
    try {
      const data = await db.calculateManDayCosts(
        project.id,
        company.id,
        project.work_type || 'demolition',
        project.job_type || 'standard'
      )
      setCostData(data)
    } catch (error) {
      console.error('Error loading man day costs:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const getRoleLabel = (role) => {
    const labels = {
      foreman: 'Foreman',
      supervisor: 'Supervisor',
      operator: 'Operator',
      laborer: 'Laborer'
    }
    return labels[role] || role.charAt(0).toUpperCase() + role.slice(1)
  }

  if (loading) {
    return (
      <div className="man-day-costs card">
        <div className="man-day-header">
          <h3>Man Day Costs</h3>
        </div>
        <div className="loading">Loading...</div>
      </div>
    )
  }

  if (!costData || costData.totalManDays === 0) {
    return (
      <div className="man-day-costs card">
        <div className="man-day-header">
          <h3>Man Day Costs</h3>
        </div>
        <div className="man-day-empty">
          <span className="empty-icon">👷</span>
          <p>No crew check-ins yet</p>
          <small>Costs will appear as crew checks in from the field</small>
        </div>
      </div>
    )
  }

  const roleEntries = Object.entries(costData.byRole || {})

  return (
    <div className="man-day-costs card">
      <div className="man-day-header" onClick={() => setExpanded(!expanded)}>
        <div className="man-day-title-row">
          <h3>Man Day Costs</h3>
          <span className="man-day-total">{formatCurrency(costData.totalCost)}</span>
        </div>
        <button className="man-day-toggle">
          {expanded ? '▼ Collapse' : '▶ Details'}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="man-day-summary">
        <div className="man-day-stat">
          <span className="stat-value">{costData.daysWorked}</span>
          <span className="stat-label">Days Worked</span>
        </div>
        <div className="man-day-stat">
          <span className="stat-value">{costData.totalManDays}</span>
          <span className="stat-label">Total Man Days</span>
        </div>
        <div className="man-day-stat">
          <span className="stat-value">{formatCurrency(costData.totalCost)}</span>
          <span className="stat-label">Total Labor Cost</span>
        </div>
        <div className="man-day-stat">
          <span className="stat-value">
            {costData.daysWorked > 0
              ? formatCurrency(costData.totalCost / costData.daysWorked)
              : '$0'
            }
          </span>
          <span className="stat-label">Avg Cost/Day</span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="man-day-details">
          {/* By Role Breakdown */}
          {roleEntries.length > 0 && (
            <div className="man-day-section">
              <h4>By Role</h4>
              <div className="man-day-role-list">
                {roleEntries.map(([role, data]) => (
                  <div key={role} className="man-day-role-row">
                    <div className="role-info">
                      <span className="role-name">{getRoleLabel(role)}</span>
                      <span className="role-rate">{formatCurrency(data.rate)}/day</span>
                    </div>
                    <div className="role-stats">
                      <span className="role-count">{data.count} days</span>
                      <span className="role-cost">{formatCurrency(data.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Days */}
          {costData.byDate?.length > 0 && (
            <div className="man-day-section">
              <h4>Recent Activity</h4>
              <div className="man-day-date-list">
                {costData.byDate.slice(0, 7).map((day, idx) => (
                  <div key={idx} className="man-day-date-row">
                    <span className="date-label">{formatDate(day.date)}</span>
                    <span className="date-workers">{day.workers} crew</span>
                    <span className="date-cost">{formatCurrency(day.cost)}</span>
                  </div>
                ))}
              </div>
              {costData.byDate.length > 7 && (
                <p className="man-day-more">
                  + {costData.byDate.length - 7} more days
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
