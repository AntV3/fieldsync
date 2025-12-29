import { useState, useEffect } from 'react'
import { Truck, TrendingUp, Calendar } from 'lucide-react'
import { db } from '../lib/supabase'

const LOAD_TYPE_INFO = {
  concrete: { label: 'Concrete', icon: '🧱', color: '#6b7280' },
  trash: { label: 'Trash', icon: '🗑️', color: '#10b981' },
  metals: { label: 'Metals', icon: '🔩', color: '#3b82f6' },
  hazardous_waste: { label: 'Hazardous Waste', icon: '☣️', color: '#f59e0b' }
}

export default function DisposalSummary({ project, period = 'week' }) {
  const [summary, setSummary] = useState([])
  const [weeklyData, setWeeklyData] = useState([])
  const [loading, setLoading] = useState(true)

  // Calculate date range based on period
  const getDateRange = () => {
    const end = new Date()
    const start = new Date()

    switch (period) {
      case 'week':
        start.setDate(start.getDate() - 7)
        break
      case 'month':
        start.setMonth(start.getMonth() - 1)
        break
      case 'all':
        start.setFullYear(2020) // Far back enough
        break
      default:
        start.setDate(start.getDate() - 7)
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    }
  }

  useEffect(() => {
    loadData()
  }, [project.id, period])

  const loadData = async () => {
    try {
      setLoading(true)
      const { startDate, endDate } = getDateRange()

      const [summaryData, weekly] = await Promise.all([
        db.getDisposalSummary(project.id, startDate, endDate),
        db.getWeeklyDisposalSummary(project.id, 4)
      ])

      setSummary(summaryData || [])
      setWeeklyData(weekly || [])
    } catch (err) {
      console.error('Error loading disposal summary:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalLoads = summary.reduce((sum, s) => sum + (s.total_loads || 0), 0)

  const periodLabel = {
    week: 'This Week',
    month: 'This Month',
    all: 'All Time'
  }[period] || 'This Week'

  if (loading) {
    return (
      <div className="disposal-summary-card">
        <div className="card-header">
          <Truck size={20} />
          <span>Disposal Activity</span>
        </div>
        <div className="card-loading">Loading...</div>
      </div>
    )
  }

  if (totalLoads === 0) {
    return (
      <div className="disposal-summary-card">
        <div className="card-header">
          <Truck size={20} />
          <span>Disposal Activity</span>
        </div>
        <div className="disposal-empty-state">
          <p>No disposal loads recorded</p>
          <p className="text-muted">{periodLabel}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="disposal-summary-card">
      <div className="card-header">
        <div className="header-left">
          <Truck size={20} />
          <span>Disposal Activity</span>
        </div>
        <span className="period-badge">{periodLabel}</span>
      </div>

      {/* Total Count */}
      <div className="disposal-total">
        <span className="total-number">{totalLoads}</span>
        <span className="total-label">Total Loads</span>
      </div>

      {/* Breakdown by Type */}
      <div className="disposal-breakdown">
        {summary.map(item => {
          const typeInfo = LOAD_TYPE_INFO[item.load_type] || { label: item.load_type, icon: '📦', color: '#6b7280' }
          const percentage = Math.round((item.total_loads / totalLoads) * 100)

          return (
            <div key={item.load_type} className="disposal-type-row">
              <div className="type-info">
                <span className="type-icon">{typeInfo.icon}</span>
                <span className="type-label">{typeInfo.label}</span>
              </div>
              <div className="type-stats">
                <div className="type-bar-container">
                  <div
                    className="type-bar"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: typeInfo.color
                    }}
                  />
                </div>
                <span className="type-count">{item.total_loads}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Weekly Trend (if data available) */}
      {weeklyData.length > 1 && (
        <div className="disposal-trend">
          <div className="trend-header">
            <TrendingUp size={16} />
            <span>Weekly Trend</span>
          </div>
          <div className="trend-chart">
            {weeklyData.map((week, idx) => {
              const weekTotal = week.concrete + week.trash + week.metals + week.hazardous_waste
              const maxTotal = Math.max(...weeklyData.map(w =>
                w.concrete + w.trash + w.metals + w.hazardous_waste
              ))
              const height = maxTotal > 0 ? (weekTotal / maxTotal) * 100 : 0

              return (
                <div key={week.week} className="trend-bar-wrapper">
                  <div
                    className="trend-bar"
                    style={{ height: `${height}%` }}
                    title={`Week of ${week.week}: ${weekTotal} loads`}
                  />
                  <span className="trend-label">W{idx + 1}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Days with Activity */}
      {summary.length > 0 && summary[0].days_with_activity && (
        <div className="disposal-activity-days">
          <Calendar size={14} />
          <span>
            {summary.reduce((max, s) => Math.max(max, s.days_with_activity || 0), 0)} days with disposal activity
          </span>
        </div>
      )}
    </div>
  )
}
