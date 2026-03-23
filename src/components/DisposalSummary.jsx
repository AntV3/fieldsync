import { useState, useEffect } from 'react'
import { Truck, ChevronDown, ChevronUp } from 'lucide-react'
import { db } from '../lib/supabase'

const LOAD_TYPES = [
  { value: 'concrete', label: 'Concrete', icon: '🧱' },
  { value: 'trash', label: 'Trash', icon: '🗑️' },
  { value: 'metals', label: 'Metals', icon: '🔩' },
  { value: 'hazardous_waste', label: 'Hazardous', icon: '☣️' },
  { value: 'copper', label: 'Copper', icon: '🔶' },
  { value: 'asphalt', label: 'Asphalt', icon: '🛣️' }
]

const getLoadTypeInfo = (type) => LOAD_TYPES.find(t => t.value === type) || { label: type, icon: '📦' }

export default function DisposalSummary({ project, period = 'week' }) {
  const [loads, setLoads] = useState([])
  const [truckCounts, setTruckCounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (project?.id) {
      loadData()
    }
  }, [project?.id, period])

  const loadData = async () => {
    try {
      setLoading(true)
      const days = period === 'week' ? 7 : period === 'month' ? 30 : 14
      const [loadsData, trucksData] = await Promise.all([
        db.getDisposalLoadsHistory(project.id, days),
        db.getTruckCountHistory?.(project.id, days) || []
      ])
      setLoads(loadsData || [])
      setTruckCounts(trucksData || [])
    } catch (err) {
      console.error('Error loading disposal summary:', err)
    } finally {
      setLoading(false)
    }
  }

  // Group loads by type for totals
  const loadsByType = loads.reduce((acc, load) => {
    const type = load.load_type
    if (!acc[type]) {
      acc[type] = 0
    }
    acc[type] += load.load_count
    return acc
  }, {})

  // Group by date for breakdown
  const loadsByDate = loads.reduce((acc, load) => {
    const date = load.load_date || load.work_date
    if (!acc[date]) {
      acc[date] = { date, loads: [], total: 0 }
    }
    acc[date].loads.push(load)
    acc[date].total += load.load_count
    return acc
  }, {})

  const sortedDates = Object.values(loadsByDate)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 7)

  const totalLoads = loads.reduce((sum, l) => sum + l.load_count, 0)
  const totalTrucks = truckCounts.reduce((sum, t) => sum + (t.truck_count || 0), 0)
  const daysWithTrucks = truckCounts.filter(t => t.truck_count > 0).length
  const hasLoads = totalLoads > 0 || totalTrucks > 0

  // Build truck count lookup by date for daily breakdown
  const truckCountByDate = truckCounts.reduce((acc, t) => {
    acc[t.work_date] = t.truck_count
    return acc
  }, {})

  if (loading) {
    return (
      <div className="disposal-summary-card">
        <div className="card-header">
          <div className="header-left">
            <Truck size={18} />
            <span>Disposal Loads</span>
          </div>
        </div>
        <div className="card-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="disposal-summary-card">
      <div className="card-header">
        <div className="header-left">
          <Truck size={18} />
          <span>Disposal Loads</span>
        </div>
        <span className="period-badge">
          {period === 'week' ? 'Last 7 days' : period === 'month' ? 'Last 30 days' : 'Last 14 days'}
        </span>
      </div>

      {!hasLoads ? (
        <div className="disposal-empty-state">
          <Truck size={32} />
          <p>No disposal loads recorded</p>
          <span className="text-muted">Loads will appear here when logged by field crews</span>
        </div>
      ) : (
        <>
          {/* Total */}
          <div className="disposal-totals-row">
            <div className="disposal-total">
              <span className="disposal-total-value">{totalLoads}</span>
              <span className="disposal-total-label">Total Loads</span>
            </div>
            {totalTrucks > 0 && (
              <div className="disposal-total trucks">
                <span className="disposal-total-value">{totalTrucks}</span>
                <span className="disposal-total-label">Trucks Used</span>
                {daysWithTrucks > 0 && (
                  <span className="disposal-trucks-detail">{daysWithTrucks} day{daysWithTrucks !== 1 ? 's' : ''}</span>
                )}
              </div>
            )}
          </div>

          {/* By Type Breakdown */}
          <div className="disposal-breakdown">
            {LOAD_TYPES.map(type => {
              const count = loadsByType[type.value] || 0
              if (count === 0) return null
              const percentage = Math.round((count / totalLoads) * 100)

              return (
                <div key={type.value} className="disposal-type-row">
                  <div className="disposal-type-info">
                    <span className="disposal-type-icon">{type.icon}</span>
                    <span className="disposal-type-label">{type.label}</span>
                  </div>
                  <div className="disposal-type-stats">
                    <span className="disposal-type-count">{count}</span>
                    <div className="disposal-type-bar">
                      <div
                        className="disposal-type-bar-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Daily Breakdown Toggle */}
          {sortedDates.length > 0 && (
            <button
              className="disposal-expand-btn"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              <span>{expanded ? 'Hide' : 'View'} Daily Breakdown</span>
            </button>
          )}

          {/* Daily Breakdown */}
          {expanded && sortedDates.length > 0 && (
            <div className="disposal-daily-breakdown">
              {sortedDates.map(day => {
                const formattedDate = new Date(day.date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })

                // Group by type for this day
                const dayLoadsByType = day.loads.reduce((acc, load) => {
                  if (!acc[load.load_type]) acc[load.load_type] = 0
                  acc[load.load_type] += load.load_count
                  return acc
                }, {})

                const dayTrucks = truckCountByDate[day.date] || 0

                return (
                  <div key={day.date} className="disposal-daily-row">
                    <div className="disposal-daily-header">
                      <span className="disposal-daily-date">{formattedDate}</span>
                      <div className="disposal-daily-stats">
                        <span className="disposal-daily-total">{day.total} loads</span>
                        {dayTrucks > 0 && (
                          <span className="disposal-daily-trucks">{dayTrucks} truck{dayTrucks !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="disposal-daily-types">
                      {Object.entries(dayLoadsByType).map(([type, count]) => {
                        const typeInfo = getLoadTypeInfo(type)
                        return (
                          <span key={type} className="disposal-daily-type">
                            {typeInfo.icon} {count}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
