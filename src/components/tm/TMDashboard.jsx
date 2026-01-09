import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area
} from 'recharts'
import {
  ClipboardList, Clock, DollarSign, Users, TrendingUp,
  CheckCircle, AlertCircle, XCircle, FileText
} from 'lucide-react'

/**
 * TMDashboard - Visual summary and charts for T&M Tickets section
 * Shows key metrics, status distribution, and trends
 */
export default function TMDashboard({ tickets = [], laborRates = {} }) {
  // Calculate comprehensive metrics
  const metrics = useMemo(() => {
    if (!tickets.length) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        billed: 0,
        rejected: 0,
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        materialsCost: 0,
        uniqueWorkers: 0,
        avgHoursPerTicket: 0,
        approvalRate: 0,
        pendingValue: 0,
        approvedValue: 0,
        billedValue: 0,
        workersByRole: {},
        topWorkers: [],
        byMonth: [],
        byStatus: []
      }
    }

    // Status counts
    const pending = tickets.filter(t => t.status === 'pending').length
    const approved = tickets.filter(t => t.status === 'approved').length
    const billed = tickets.filter(t => t.status === 'billed').length
    const rejected = tickets.filter(t => t.status === 'rejected').length

    // Hours calculations
    let totalHours = 0
    let regularHours = 0
    let overtimeHours = 0
    const workerHoursMap = {}
    const workersByRole = { Foreman: 0, Superintendent: 0, Operator: 0, Laborer: 0 }

    tickets.forEach(ticket => {
      if (ticket.t_and_m_workers) {
        ticket.t_and_m_workers.forEach(worker => {
          const regHrs = parseFloat(worker.hours) || 0
          const otHrs = parseFloat(worker.overtime_hours) || 0
          regularHours += regHrs
          overtimeHours += otHrs
          totalHours += regHrs + otHrs

          // Track worker hours
          const name = worker.name || 'Unknown'
          if (!workerHoursMap[name]) {
            workerHoursMap[name] = { name, hours: 0, role: worker.role || 'Laborer' }
          }
          workerHoursMap[name].hours += regHrs + otHrs

          // Count by role
          const role = worker.role || 'Laborer'
          if (workersByRole[role] !== undefined) {
            workersByRole[role] += regHrs + otHrs
          } else {
            workersByRole[role] = regHrs + otHrs
          }
        })
      }
    })

    // Materials cost calculation
    let materialsCost = 0
    tickets.forEach(ticket => {
      if (ticket.t_and_m_items) {
        ticket.t_and_m_items.forEach(item => {
          const costPer = item.materials_equipment?.cost_per_unit || 0
          materialsCost += item.quantity * costPer
        })
      }
    })

    // Unique workers
    const uniqueWorkers = Object.keys(workerHoursMap).length

    // Top 5 workers by hours
    const topWorkers = Object.values(workerHoursMap)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5)

    // Approval rate
    const completedTickets = approved + billed + rejected
    const approvalRate = completedTickets > 0
      ? Math.round(((approved + billed) / completedTickets) * 100)
      : 0

    // Value calculations (estimate labor cost using default rates if no rates provided)
    const defaultRates = {
      Foreman: 85,
      Superintendent: 95,
      Operator: 75,
      Laborer: 55
    }
    const rates = { ...defaultRates, ...laborRates }

    const calculateTicketValue = (ticket) => {
      let laborCost = 0
      let materialsCost = 0

      if (ticket.t_and_m_workers) {
        ticket.t_and_m_workers.forEach(worker => {
          const role = worker.role || 'Laborer'
          const rate = rates[role] || rates.Laborer
          const regHrs = parseFloat(worker.hours) || 0
          const otHrs = parseFloat(worker.overtime_hours) || 0
          laborCost += regHrs * rate + otHrs * rate * 1.5
        })
      }

      if (ticket.t_and_m_items) {
        ticket.t_and_m_items.forEach(item => {
          const costPer = item.materials_equipment?.cost_per_unit || 0
          materialsCost += item.quantity * costPer
        })
      }

      return laborCost + materialsCost
    }

    const pendingValue = tickets
      .filter(t => t.status === 'pending')
      .reduce((sum, t) => sum + calculateTicketValue(t), 0)
    const approvedValue = tickets
      .filter(t => t.status === 'approved')
      .reduce((sum, t) => sum + calculateTicketValue(t), 0)
    const billedValue = tickets
      .filter(t => t.status === 'billed')
      .reduce((sum, t) => sum + calculateTicketValue(t), 0)

    // Monthly data for trend chart
    const monthlyData = {}
    tickets.forEach(ticket => {
      const date = new Date(ticket.work_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthLabel,
          monthKey,
          tickets: 0,
          hours: 0,
          cost: 0,
          value: 0
        }
      }

      monthlyData[monthKey].tickets += 1
      monthlyData[monthKey].cost += calculateTicketValue(ticket) - materialsCost

      if (ticket.t_and_m_workers) {
        ticket.t_and_m_workers.forEach(worker => {
          const regHrs = parseFloat(worker.hours) || 0
          const otHrs = parseFloat(worker.overtime_hours) || 0
          monthlyData[monthKey].hours += regHrs + otHrs
        })
      }

      if (ticket.t_and_m_items) {
        ticket.t_and_m_items.forEach(item => {
          const costPer = item.materials_equipment?.cost_per_unit || 0
          monthlyData[monthKey].value += item.quantity * costPer
        })
      }
    })

    const byMonth = Object.values(monthlyData)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .slice(-6) // Last 6 months

    // Status distribution for pie chart
    const byStatus = [
      { name: 'Pending', value: pending, color: '#f59e0b' },
      { name: 'Approved', value: approved, color: '#10b981' },
      { name: 'Billed', value: billed, color: '#3b82f6' },
      { name: 'Rejected', value: rejected, color: '#ef4444' }
    ].filter(s => s.value > 0)

    return {
      total: tickets.length,
      pending,
      approved,
      billed,
      rejected,
      totalHours,
      regularHours,
      overtimeHours,
      materialsCost,
      uniqueWorkers,
      avgHoursPerTicket: tickets.length > 0 ? totalHours / tickets.length : 0,
      approvalRate,
      pendingValue,
      approvedValue,
      billedValue,
      workersByRole,
      topWorkers,
      byMonth,
      byStatus
    }
  }, [tickets, laborRates])

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="tm-chart-tooltip">
          <p className="tm-tooltip-label">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.name.includes('Cost') || entry.name.includes('Value')
                ? formatCurrency(entry.value)
                : entry.value.toFixed(1)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (tickets.length === 0) {
    return (
      <div className="tm-dashboard tm-dashboard-empty">
        <div className="tm-empty-icon">
          <ClipboardList size={48} />
        </div>
        <p>No T&M tickets yet</p>
        <p className="tm-empty-hint">Create tickets to see analytics and trends</p>
      </div>
    )
  }

  return (
    <div className="tm-dashboard">
      {/* Summary Cards Row */}
      <div className="tm-summary-cards">
        <div className="tm-summary-card">
          <div className="tm-card-icon tickets">
            <ClipboardList size={20} />
          </div>
          <div className="tm-card-content">
            <span className="tm-card-value">{metrics.total}</span>
            <span className="tm-card-label">Total Tickets</span>
          </div>
        </div>

        <div className="tm-summary-card">
          <div className="tm-card-icon hours">
            <Clock size={20} />
          </div>
          <div className="tm-card-content">
            <span className="tm-card-value">{metrics.totalHours.toFixed(1)}</span>
            <span className="tm-card-label">Total Hours</span>
            {metrics.overtimeHours > 0 && (
              <span className="tm-card-detail">{metrics.overtimeHours.toFixed(1)} OT</span>
            )}
          </div>
        </div>

        <div className="tm-summary-card">
          <div className="tm-card-icon workers">
            <Users size={20} />
          </div>
          <div className="tm-card-content">
            <span className="tm-card-value">{metrics.uniqueWorkers}</span>
            <span className="tm-card-label">Workers</span>
          </div>
        </div>

        <div className="tm-summary-card">
          <div className="tm-card-icon materials">
            <DollarSign size={20} />
          </div>
          <div className="tm-card-content">
            <span className="tm-card-value">{formatCurrency(metrics.materialsCost)}</span>
            <span className="tm-card-label">Materials</span>
          </div>
        </div>
      </div>

      {/* Status Overview Cards */}
      <div className="tm-status-cards">
        <div className="tm-status-card pending">
          <div className="tm-status-header">
            <AlertCircle size={16} />
            <span>Pending</span>
          </div>
          <div className="tm-status-count">{metrics.pending}</div>
          <div className="tm-status-value">{formatCurrency(metrics.pendingValue)}</div>
        </div>

        <div className="tm-status-card approved">
          <div className="tm-status-header">
            <CheckCircle size={16} />
            <span>Approved</span>
          </div>
          <div className="tm-status-count">{metrics.approved}</div>
          <div className="tm-status-value">{formatCurrency(metrics.approvedValue)}</div>
        </div>

        <div className="tm-status-card billed">
          <div className="tm-status-header">
            <FileText size={16} />
            <span>Billed</span>
          </div>
          <div className="tm-status-count">{metrics.billed}</div>
          <div className="tm-status-value">{formatCurrency(metrics.billedValue)}</div>
        </div>

        <div className="tm-status-card rate">
          <div className="tm-status-header">
            <TrendingUp size={16} />
            <span>Approval Rate</span>
          </div>
          <div className="tm-status-count">{metrics.approvalRate}%</div>
          <div className="tm-status-value">{metrics.approved + metrics.billed} / {metrics.total - metrics.pending}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="tm-charts-row">
        {/* Status Distribution Pie Chart */}
        {metrics.byStatus.length > 0 && (
          <div className="tm-chart-card">
            <h4 className="tm-chart-title">Status Distribution</h4>
            <div className="tm-chart-container">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={metrics.byStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {metrics.byStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="tm-chart-legend">
              {metrics.byStatus.map((entry, index) => (
                <div key={index} className="tm-legend-item">
                  <span className="tm-legend-color" style={{ background: entry.color }} />
                  <span className="tm-legend-label">{entry.name}</span>
                  <span className="tm-legend-value">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hours Trend Bar Chart */}
        {metrics.byMonth.length > 0 && (
          <div className="tm-chart-card wide">
            <h4 className="tm-chart-title">Hours by Month</h4>
            <div className="tm-chart-container">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={metrics.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border-color)' }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border-color)' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="hours"
                    name="Hours"
                    fill="var(--primary-color)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Second Charts Row */}
      <div className="tm-charts-row">
        {/* Labor by Role */}
        <div className="tm-chart-card">
          <h4 className="tm-chart-title">Hours by Role</h4>
          <div className="tm-role-breakdown">
            {Object.entries(metrics.workersByRole)
              .filter(([, hours]) => hours > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([role, hours]) => {
                const percentage = (hours / metrics.totalHours) * 100
                return (
                  <div key={role} className="tm-role-bar">
                    <div className="tm-role-info">
                      <span className="tm-role-name">{role}</span>
                      <span className="tm-role-hours">{hours.toFixed(1)} hrs</span>
                    </div>
                    <div className="tm-role-track">
                      <div
                        className="tm-role-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Top Workers */}
        {metrics.topWorkers.length > 0 && (
          <div className="tm-chart-card">
            <h4 className="tm-chart-title">Top Workers</h4>
            <div className="tm-top-workers">
              {metrics.topWorkers.map((worker, index) => (
                <div key={worker.name} className="tm-worker-row">
                  <span className="tm-worker-rank">#{index + 1}</span>
                  <div className="tm-worker-info">
                    <span className="tm-worker-name">{worker.name}</span>
                    <span className="tm-worker-role">{worker.role}</span>
                  </div>
                  <span className="tm-worker-hours">{worker.hours.toFixed(1)} hrs</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tickets Trend */}
        {metrics.byMonth.length > 1 && (
          <div className="tm-chart-card">
            <h4 className="tm-chart-title">Ticket Volume</h4>
            <div className="tm-chart-container">
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={metrics.byMonth}>
                  <defs>
                    <linearGradient id="ticketGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary-color)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary-color)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tickets"
                    name="Tickets"
                    stroke="var(--primary-color)"
                    fill="url(#ticketGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="tm-quick-stats">
        <div className="tm-quick-stat">
          <span className="tm-quick-label">Avg Hours/Ticket</span>
          <span className="tm-quick-value">{metrics.avgHoursPerTicket.toFixed(1)}</span>
        </div>
        <div className="tm-quick-stat">
          <span className="tm-quick-label">Regular Hours</span>
          <span className="tm-quick-value">{metrics.regularHours.toFixed(1)}</span>
        </div>
        <div className="tm-quick-stat">
          <span className="tm-quick-label">Overtime Hours</span>
          <span className="tm-quick-value">{metrics.overtimeHours.toFixed(1)}</span>
        </div>
        <div className="tm-quick-stat">
          <span className="tm-quick-label">Total Est. Value</span>
          <span className="tm-quick-value">{formatCurrency(metrics.pendingValue + metrics.approvedValue + metrics.billedValue)}</span>
        </div>
      </div>
    </div>
  )
}
