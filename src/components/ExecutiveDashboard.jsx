import { useState, useEffect } from 'react'
import { db, supabase, isSupabaseConfigured } from '../lib/supabase'
import { formatCurrency, calculateProgress } from '../lib/utils'

export default function ExecutiveDashboard({ onShowToast, onNavigateToProject }) {
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState('week') // 'today', 'week', 'month', 'custom'
  const [metrics, setMetrics] = useState({
    activeProjects: 0,
    crewToday: 0,
    pendingInvoices: { count: 0, value: 0 },
    urgentItems: 0
  })
  const [projects, setProjects] = useState([])
  const [alerts, setAlerts] = useState([])
  const [financials, setFinancials] = useState({
    laborHours: 0,
    laborCost: 0,
    materialsCost: 0,
    tmSubmitted: 0,
    invoicesSent: 0
  })
  const [sortBy, setSortBy] = useState('name') // 'name', 'progress', 'budget'

  useEffect(() => {
    loadDashboardData()
  }, [timeFilter])

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadMetrics(),
        loadProjects(),
        loadAlerts(),
        loadFinancials()
      ])
    } catch (error) {
      console.error('Error loading dashboard:', error)
      onShowToast('Error loading dashboard data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadMetrics = async () => {
    if (!isSupabaseConfigured) {
      setMetrics({
        activeProjects: 0,
        crewToday: 0,
        pendingInvoices: { count: 0, value: 0 },
        urgentItems: 0
      })
      return
    }

    try {
      // Active projects count
      const projects = await db.getProjects()
      const activeCount = projects.length

      // Get today's crew check-ins across all projects
      const today = new Date().toISOString().split('T')[0]
      let totalCrew = 0
      for (const project of projects) {
        const checkin = await db.getCrewCheckin(project.id, today)
        if (checkin && checkin.workers) {
          totalCrew += checkin.workers.length
        }
      }

      // Pending T&M tickets (as proxy for pending invoices)
      const { data: pendingTickets } = await supabase
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (hours, overtime_hours),
          t_and_m_items (
            quantity,
            materials_equipment (cost_per_unit)
          )
        `)
        .eq('status', 'pending')

      let pendingValue = 0
      if (pendingTickets) {
        pendingTickets.forEach(ticket => {
          // Labor costs (assuming $50/hr regular, $75/hr overtime)
          const laborCost = (ticket.t_and_m_workers || []).reduce((sum, w) => {
            return sum + (w.hours * 50) + ((w.overtime_hours || 0) * 75)
          }, 0)

          // Materials costs
          const materialsCost = (ticket.t_and_m_items || []).reduce((sum, item) => {
            const unitCost = item.materials_equipment?.cost_per_unit || 0
            return sum + (item.quantity * unitCost)
          }, 0)

          pendingValue += laborCost + materialsCost
        })
      }

      // Urgent items count (pending material requests + pending T&M + over budget projects)
      const { data: urgentRequests } = await supabase
        .from('material_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('priority', 'urgent')

      const urgentCount = (urgentRequests?.length || 0) +
                         (pendingTickets?.length || 0)

      setMetrics({
        activeProjects: activeCount,
        crewToday: totalCrew,
        pendingInvoices: {
          count: pendingTickets?.length || 0,
          value: pendingValue
        },
        urgentItems: urgentCount
      })
    } catch (error) {
      console.error('Error loading metrics:', error)
    }
  }

  const loadProjects = async () => {
    try {
      const projectsData = await db.getProjects()

      // Load areas for each project to calculate progress
      const projectsWithProgress = await Promise.all(
        projectsData.map(async (project) => {
          const areas = await db.getAreas(project.id)
          const progress = calculateProgress(areas)

          // Calculate budget status
          const billable = (progress / 100) * project.contract_value
          const spent = project.total_spent || 0 // Would need to track this
          const overBudget = spent > billable

          return {
            ...project,
            areas,
            progress,
            billable,
            spent,
            overBudget
          }
        })
      )

      setProjects(projectsWithProgress)
    } catch (error) {
      console.error('Error loading projects:', error)
    }
  }

  const loadAlerts = async () => {
    const alertsList = []

    try {
      // Over budget projects
      const overBudget = projects.filter(p => p.overBudget)
      if (overBudget.length > 0) {
        alertsList.push({
          type: 'budget',
          icon: '💰',
          message: `${overBudget.length} project${overBudget.length > 1 ? 's' : ''} over budget`,
          severity: 'high'
        })
      }

      // Pending T&M tickets
      if (metrics.pendingInvoices.count > 0) {
        alertsList.push({
          type: 'tm',
          icon: '📋',
          message: `${metrics.pendingInvoices.count} T&M ticket${metrics.pendingInvoices.count > 1 ? 's' : ''} pending approval`,
          severity: 'medium'
        })
      }

      // Pending material requests
      if (isSupabaseConfigured) {
        const { count } = await supabase
          .from('material_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')

        if (count > 0) {
          alertsList.push({
            type: 'materials',
            icon: '📦',
            message: `${count} material request${count > 1 ? 's' : ''} waiting`,
            severity: 'medium'
          })
        }
      }

      setAlerts(alertsList)
    } catch (error) {
      console.error('Error loading alerts:', error)
    }
  }

  const loadFinancials = async () => {
    if (!isSupabaseConfigured) {
      setFinancials({
        laborHours: 0,
        laborCost: 0,
        materialsCost: 0,
        tmSubmitted: 0,
        invoicesSent: 0
      })
      return
    }

    try {
      const dateRange = getDateRange()

      // Get T&M tickets for the period
      const { data: tickets } = await supabase
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (hours, overtime_hours),
          t_and_m_items (
            quantity,
            materials_equipment (cost_per_unit)
          )
        `)
        .gte('work_date', dateRange.start)
        .lte('work_date', dateRange.end)

      let laborHours = 0
      let laborCost = 0
      let materialsCost = 0
      let tmSubmitted = 0

      if (tickets) {
        tickets.forEach(ticket => {
          const workers = ticket.t_and_m_workers || []
          const items = ticket.t_and_m_items || []

          workers.forEach(w => {
            laborHours += w.hours + (w.overtime_hours || 0)
            laborCost += (w.hours * 50) + ((w.overtime_hours || 0) * 75)
          })

          items.forEach(item => {
            const unitCost = item.materials_equipment?.cost_per_unit || 0
            materialsCost += item.quantity * unitCost
          })

          tmSubmitted += laborCost + materialsCost
        })
      }

      setFinancials({
        laborHours,
        laborCost,
        materialsCost,
        tmSubmitted,
        invoicesSent: 0 // Would need invoices table
      })
    } catch (error) {
      console.error('Error loading financials:', error)
    }
  }

  const getDateRange = () => {
    const today = new Date()
    let start, end

    switch (timeFilter) {
      case 'today':
        start = end = today.toISOString().split('T')[0]
        break
      case 'week':
        // Get start of week (Monday)
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - today.getDay() + 1)
        start = weekStart.toISOString().split('T')[0]
        end = today.toISOString().split('T')[0]
        break
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
        end = today.toISOString().split('T')[0]
        break
      default:
        start = end = today.toISOString().split('T')[0]
    }

    return { start, end }
  }

  const getSortedProjects = () => {
    const sorted = [...projects]
    switch (sortBy) {
      case 'progress':
        return sorted.sort((a, b) => b.progress - a.progress)
      case 'budget':
        return sorted.sort((a, b) => {
          if (a.overBudget && !b.overBudget) return -1
          if (!a.overBudget && b.overBudget) return 1
          return 0
        })
      case 'name':
      default:
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  const getProjectStatusIcon = (project) => {
    if (project.overBudget) return '⚠️'
    if (project.progress === 100) return '✓'
    if (project.progress < 20) return '⚠️'
    return ''
  }

  const getTimeFilterLabel = () => {
    switch (timeFilter) {
      case 'today': return 'Today'
      case 'week': return 'This Week'
      case 'month': return 'This Month'
      default: return 'This Week'
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        Loading dashboard...
      </div>
    )
  }

  const sortedProjects = getSortedProjects()

  return (
    <div className="executive-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1>📊 Executive Dashboard</h1>
        <div className="time-filter">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="filter-select"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{metrics.activeProjects}</div>
          <div className="metric-label">Active Projects</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics.crewToday}</div>
          <div className="metric-label">Crew Today</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{formatCurrency(metrics.pendingInvoices.value)}</div>
          <div className="metric-label">Pending Invoices</div>
          <div className="metric-sublabel">{metrics.pendingInvoices.count} tickets</div>
        </div>
        <div className="metric-card urgent">
          <div className="metric-value">{metrics.urgentItems}</div>
          <div className="metric-label">Urgent Items</div>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="card alerts-section">
          <h3>⚠️ Needs Attention</h3>
          <div className="alerts-list">
            {alerts.map((alert, idx) => (
              <div key={idx} className={`alert-item severity-${alert.severity}`}>
                <span className="alert-icon">{alert.icon}</span>
                <span className="alert-message">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Status */}
      <div className="card">
        <div className="section-header">
          <h3>📈 Projects Status</h3>
          <div className="sort-controls">
            <label>Sort by:</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Name</option>
              <option value="progress">Progress</option>
              <option value="budget">Budget Status</option>
            </select>
          </div>
        </div>

        <div className="projects-status-list">
          {sortedProjects.length === 0 ? (
            <div className="empty-state">
              <p>No active projects</p>
            </div>
          ) : (
            sortedProjects.map(project => (
              <div
                key={project.id}
                className="project-status-item"
                onClick={() => onNavigateToProject && onNavigateToProject(project)}
              >
                <div className="project-status-info">
                  <div className="project-status-name">
                    {project.name}
                    {getProjectStatusIcon(project) && (
                      <span className="project-status-icon">
                        {getProjectStatusIcon(project)}
                      </span>
                    )}
                  </div>
                  <div className="project-status-details">
                    {formatCurrency(project.contract_value)} contract
                    {project.overBudget && (
                      <span className="over-budget-badge">Over Budget</span>
                    )}
                  </div>
                </div>
                <div className="project-status-progress">
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${project.progress}%` }}
                    ></div>
                  </div>
                  <span className="progress-percentage">{project.progress}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Financials This Week/Period */}
      <div className="card">
        <h3>💰 {getTimeFilterLabel()}</h3>
        <div className="financials-grid">
          <div className="financial-item">
            <div className="financial-label">Labor hours:</div>
            <div className="financial-value">
              {financials.laborHours.toFixed(1)} hrs ({formatCurrency(financials.laborCost)})
            </div>
          </div>
          <div className="financial-item">
            <div className="financial-label">Materials used:</div>
            <div className="financial-value">{formatCurrency(financials.materialsCost)}</div>
          </div>
          <div className="financial-item">
            <div className="financial-label">T&M submitted:</div>
            <div className="financial-value">{formatCurrency(financials.tmSubmitted)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
