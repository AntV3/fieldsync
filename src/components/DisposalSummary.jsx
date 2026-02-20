import { useState, useEffect } from 'react'
import { Truck, ChevronDown, ChevronUp } from 'lucide-react'
import { db } from '../lib/supabase'
import { getTradeProfile } from '../lib/constants'

const DEFAULT_LOAD_TYPES = [
  { value: 'concrete', label: 'Concrete', icon: '🧱' },
  { value: 'trash', label: 'Trash', icon: '🗑️' },
  { value: 'metals', label: 'Metals', icon: '🔩' },
  { value: 'hazardous_waste', label: 'Hazardous', icon: '☣️' }
]

export default function DisposalSummary({ project, period = 'week', company = null }) {
  const tradeProfile = getTradeProfile(company?.trade || project?.trade || 'demolition')
  const LOAD_TYPES = company?.branding?.material_categories || tradeProfile.materialCategories || DEFAULT_LOAD_TYPES
  const getLoadTypeInfo = (type) => LOAD_TYPES.find(t => t.value === type) || { label: type, icon: '📦' }
  const [loads, setLoads] = useState([])
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
      const data = await db.getDisposalLoadsHistory(project.id, days)
      setLoads(data || [])
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
  const hasLoads = totalLoads > 0

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
          <div className="disposal-total">
            <span className="disposal-total-value">{totalLoads}</span>
            <span className="disposal-total-label">Total Loads</span>
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

                return (
                  <div key={day.date} className="disposal-daily-row">
                    <div className="disposal-daily-header">
                      <span className="disposal-daily-date">{formattedDate}</span>
                      <span className="disposal-daily-total">{day.total} loads</span>
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
