import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import {
  TrendingUp, Users, FileText, Truck, Calendar,
  CheckCircle2, Clock, DollarSign, ArrowLeft
} from 'lucide-react'

export default function ForemanMetrics({ project, companyId, onBack, refreshSignal }) {
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('week') // week, month
  const [metrics, setMetrics] = useState({
    areas: [],
    tickets: [],
    crewHistory: [],
    disposalLoads: [],
    dailyReports: []
  })

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const startDate = new Date()
      if (timeRange === 'week') {
        startDate.setDate(now.getDate() - 7)
      } else {
        startDate.setDate(now.getDate() - 30)
      }
      const startStr = startDate.toISOString().split('T')[0]

      // Load all data in parallel (single batch query for crew instead of N+1)
      const days = timeRange === 'week' ? 7 : 30
      const [areas, tickets, crewHistoryRaw, disposalLoads, dailyReports] = await Promise.all([
        db.getAreas(project.id),
        db.getTMTickets?.(project.id) || [],
        db.getCrewCheckinHistory?.(project.id, days) || [],
        db.getDisposalLoadsHistory?.(project.id, days) || [],
        db.getDailyReports?.(project.id) || []
      ])

      // Transform crew history into {date, count, dayName} format
      const crewHistory = crewHistoryRaw.map(checkin => {
        const d = new Date(checkin.check_in_date + 'T12:00:00')
        return {
          date: checkin.check_in_date,
          count: checkin.workers?.length || 0,
          dayName: d.toLocaleDateString('en-US', { weekday: 'short' })
        }
      })

      setMetrics({
        areas,
        tickets: tickets.filter(t => t.work_date >= startStr),
        crewHistory,
        disposalLoads: disposalLoads,
        dailyReports: dailyReports.filter(r => r.report_date >= startStr)
      })
    } catch (error) {
      console.error('Error loading metrics:', error)
    } finally {
      setLoading(false)
    }
  }, [project?.id, timeRange])

  useEffect(() => {
    if (project?.id) {
      loadMetrics()
    }
  }, [project?.id, loadMetrics])

  // Reload when parent signals real-time data changed (avoids duplicate subscriptions)
  useEffect(() => {
    if (refreshSignal > 0 && project?.id) {
      loadMetrics()
    }
  }, [refreshSignal, project?.id, loadMetrics])

  // Calculate derived metrics
  const derivedMetrics = useMemo(() => {
    const { areas, tickets, crewHistory, disposalLoads, dailyReports } = metrics

    // Progress stats
    const totalAreas = areas.length
    const completedAreas = areas.filter(a => a.status === 'done').length
    const inProgressAreas = areas.filter(a => a.status === 'working').length
    const notStartedAreas = areas.filter(a => a.status === 'not_started').length
    const progressPercent = totalAreas > 0 ? Math.round((completedAreas / totalAreas) * 100) : 0

    // Crew stats
    const totalManDays = crewHistory.reduce((sum, day) => sum + day.count, 0)
    const avgCrewSize = crewHistory.length > 0
      ? Math.round((totalManDays / crewHistory.filter(d => d.count > 0).length) * 10) / 10 || 0
      : 0
    const daysWithCrew = crewHistory.filter(d => d.count > 0).length

    // T&M stats
    const pendingTickets = tickets.filter(t => t.status === 'pending' || t.status === 'draft').length
    const signedTickets = tickets.filter(t => t.status === 'signed' || t.status === 'approved').length
    const totalTicketValue = tickets.reduce((sum, t) => sum + (t.total_amount || 0), 0)

    // Disposal stats
    const totalLoads = disposalLoads.reduce((sum, d) => sum + (d.load_count || 0), 0)

    // Daily reports
    const reportsSubmitted = dailyReports.filter(r => r.submitted).length
    const reportsDue = timeRange === 'week' ? 7 : 30
    const reportStreak = calculateReportStreak(dailyReports)

    return {
      progress: { totalAreas, completedAreas, inProgressAreas, notStartedAreas, progressPercent },
      crew: { totalManDays, avgCrewSize, daysWithCrew, history: crewHistory },
      tickets: { total: tickets.length, pending: pendingTickets, signed: signedTickets, totalValue: totalTicketValue },
      disposal: { totalLoads },
      reports: { submitted: reportsSubmitted, due: reportsDue, streak: reportStreak }
    }
  }, [metrics, timeRange])

  // Calculate consecutive days with reports
  function calculateReportStreak(reports) {
    if (!reports.length) return 0
    const sortedDates = [...new Set(reports.filter(r => r.submitted).map(r => r.report_date))].sort().reverse()
    let streak = 0
    const today = new Date().toISOString().split('T')[0]
    let checkDate = new Date(today)

    for (let i = 0; i < 30; i++) {
      const dateStr = checkDate.toISOString().split('T')[0]
      if (sortedDates.includes(dateStr)) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        break
      }
    }
    return streak
  }

  // Chart colors
  const COLORS = {
    primary: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    muted: '#6b7280',
    purple: '#8b5cf6'
  }

  const PIE_COLORS = [COLORS.success, COLORS.primary, COLORS.muted]

  // Prepare chart data
  const progressPieData = [
    { name: 'Completed', value: derivedMetrics.progress.completedAreas },
    { name: 'In Progress', value: derivedMetrics.progress.inProgressAreas },
    { name: 'Not Started', value: derivedMetrics.progress.notStartedAreas }
  ].filter(d => d.value > 0)

  const ticketsByDay = useMemo(() => {
    const byDay = {}
    metrics.tickets.forEach(t => {
      const day = t.work_date
      byDay[day] = (byDay[day] || 0) + 1
    })
    return derivedMetrics.crew.history.map(d => ({
      ...d,
      tickets: byDay[d.date] || 0
    }))
  }, [metrics.tickets, derivedMetrics.crew.history])

  if (loading) {
    return (
      <div className="foreman-metrics loading">
        <div className="metrics-header">
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={20} />
            Back
          </button>
          <h2>Project Metrics</h2>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading metrics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="foreman-metrics">
      <div className="metrics-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          Back
        </button>
        <h2>Project Metrics</h2>
        <div className="time-toggle">
          <button
            className={timeRange === 'week' ? 'active' : ''}
            onClick={() => setTimeRange('week')}
          >
            7 Days
          </button>
          <button
            className={timeRange === 'month' ? 'active' : ''}
            onClick={() => setTimeRange('month')}
          >
            30 Days
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card progress-card">
          <div className="card-icon">
            <TrendingUp size={24} />
          </div>
          <div className="card-content">
            <span className="card-value">{derivedMetrics.progress.progressPercent}%</span>
            <span className="card-label">Complete</span>
          </div>
          <div className="card-detail">
            {derivedMetrics.progress.completedAreas}/{derivedMetrics.progress.totalAreas} areas
          </div>
        </div>

        <div className="summary-card crew-card">
          <div className="card-icon">
            <Users size={24} />
          </div>
          <div className="card-content">
            <span className="card-value">{derivedMetrics.crew.totalManDays}</span>
            <span className="card-label">Man-Days</span>
          </div>
          <div className="card-detail">
            Avg {derivedMetrics.crew.avgCrewSize} workers/day
          </div>
        </div>

        <div className="summary-card tickets-card">
          <div className="card-icon">
            <FileText size={24} />
          </div>
          <div className="card-content">
            <span className="card-value">{derivedMetrics.tickets.total}</span>
            <span className="card-label">Time & Material</span>
          </div>
          <div className="card-detail">
            {derivedMetrics.tickets.signed} signed, {derivedMetrics.tickets.pending} pending
          </div>
        </div>

        <div className="summary-card disposal-card">
          <div className="card-icon">
            <Truck size={24} />
          </div>
          <div className="card-content">
            <span className="card-value">{derivedMetrics.disposal.totalLoads}</span>
            <span className="card-label">Disposal Loads</span>
          </div>
          <div className="card-detail">
            {timeRange === 'week' ? 'Last 7 days' : 'Last 30 days'}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid">
        {/* Progress Pie Chart */}
        <div className="chart-card">
          <h3>Area Progress</h3>
          {progressPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={progressPieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                  label={false}
                  labelLine={false}
                >
                  {progressPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="no-data">No area data</div>
          )}
        </div>

        {/* Crew Trend Chart */}
        <div className="chart-card">
          <h3>Daily Crew Size</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={derivedMetrics.crew.history}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="dayName" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [value, 'Workers']}
                labelFormatter={(label) => `Day: ${label}`}
              />
              <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* T&M Tickets Over Time */}
        <div className="chart-card">
          <h3>Time & Material Tickets by Day</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={ticketsByDay}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="dayName" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [value, 'Tickets']}
              />
              <Line
                type="monotone"
                dataKey="tickets"
                stroke={COLORS.success}
                strokeWidth={2}
                dot={{ fill: COLORS.success, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Activity Summary */}
        <div className="chart-card activity-card">
          <h3>Activity Summary</h3>
          <div className="activity-list">
            <div className="activity-item">
              <div className="activity-icon" style={{ backgroundColor: `${COLORS.success}20`, color: COLORS.success }}>
                <CheckCircle2 size={20} />
              </div>
              <div className="activity-info">
                <span className="activity-label">Days with Crew</span>
                <span className="activity-value">{derivedMetrics.crew.daysWithCrew} of {timeRange === 'week' ? 7 : 30}</span>
              </div>
            </div>
            <div className="activity-item">
              <div className="activity-icon" style={{ backgroundColor: `${COLORS.primary}20`, color: COLORS.primary }}>
                <Calendar size={20} />
              </div>
              <div className="activity-info">
                <span className="activity-label">Reports Submitted</span>
                <span className="activity-value">{derivedMetrics.reports.submitted}</span>
              </div>
            </div>
            <div className="activity-item">
              <div className="activity-icon" style={{ backgroundColor: `${COLORS.warning}20`, color: COLORS.warning }}>
                <Clock size={20} />
              </div>
              <div className="activity-info">
                <span className="activity-label">Report Streak</span>
                <span className="activity-value">{derivedMetrics.reports.streak} days</span>
              </div>
            </div>
            {derivedMetrics.tickets.totalValue > 0 && (
              <div className="activity-item">
                <div className="activity-icon" style={{ backgroundColor: `${COLORS.purple}20`, color: COLORS.purple }}>
                  <DollarSign size={20} />
                </div>
                <div className="activity-info">
                  <span className="activity-label">Time & Material Value</span>
                  <span className="activity-value">${derivedMetrics.tickets.totalValue.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
