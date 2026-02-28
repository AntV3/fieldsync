import { memo, useState, useEffect, useMemo, useCallback } from 'react'
import { Users, HardHat, Wrench, Calendar, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { db } from '../../lib/supabase'
import { chartColors, tooltipStyle, formatChartDate } from '../charts/chartConfig'

/**
 * OverviewCrewMetrics - Crew on-site metrics for project overview
 * Shows total crew count, contract vs T&M worker breakdown by day
 * Includes a day-by-day stacked bar chart timeline
 */

const loadJsPDF = () => import('jspdf')

// Colors for contract vs T&M
const CREW_COLORS = {
  contract: chartColors.contract,  // Blue
  tm: chartColors.costs,           // Amber
  total: chartColors.labor         // Indigo
}

const TIME_RANGES = [
  { id: '7d', label: '7D', days: 7 },
  { id: '14d', label: '14D', days: 14 },
  { id: '30d', label: '30D', days: 30 },
]

export const OverviewCrewMetrics = memo(function OverviewCrewMetrics({
  project,
  onShowToast
}) {
  const [crewHistory, setCrewHistory] = useState([])
  const [tmTickets, setTmTickets] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [timeRange, setTimeRange] = useState('14d')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Load all crew check-in history and T&M tickets
  useEffect(() => {
    if (!project?.id) return
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [history, tickets] = await Promise.all([
        db.getCrewCheckinHistory(project.id, 365),
        db.getTMTickets(project.id)
      ])
      setCrewHistory(history || [])
      setTmTickets(tickets || [])
    } catch (error) {
      console.error('Error loading crew metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Build a lookup: date -> Set of T&M worker names
  const tmWorkersByDate = useMemo(() => {
    const map = {}
    tmTickets.forEach(ticket => {
      const date = ticket.work_date
      if (!date) return
      if (!map[date]) map[date] = new Set()
      ;(ticket.t_and_m_workers || []).forEach(w => {
        map[date].add(w.name.toLowerCase().trim())
      })
    })
    return map
  }, [tmTickets])

  // Build crew lookup: date -> workers array
  const crewByDate = useMemo(() => {
    const map = {}
    crewHistory.forEach(checkin => {
      map[checkin.check_in_date] = checkin.workers || []
    })
    return map
  }, [crewHistory])

  // Selected date metrics
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedDayWorkers = crewByDate[selectedDate] || []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedDayTmNames = tmWorkersByDate[selectedDate] || new Set()

  const todayMetrics = useMemo(() => {
    const contract = []
    const tm = []
    selectedDayWorkers.forEach(w => {
      if (selectedDayTmNames.has(w.name.toLowerCase().trim())) {
        tm.push(w)
      } else {
        contract.push(w)
      }
    })
    return { total: selectedDayWorkers.length, contract, tm }
  }, [selectedDayWorkers, selectedDayTmNames])

  // Build chart data for time range
  const chartData = useMemo(() => {
    const rangeDays = TIME_RANGES.find(r => r.id === timeRange)?.days || 14
    const data = []
    const today = new Date()

    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]

      const workers = crewByDate[dateStr] || []
      const tmNames = tmWorkersByDate[dateStr] || new Set()

      let contractCount = 0
      let tmCount = 0
      workers.forEach(w => {
        if (tmNames.has(w.name.toLowerCase().trim())) {
          tmCount++
        } else {
          contractCount++
        }
      })

      data.push({
        date: dateStr,
        displayDate: formatChartDate(dateStr),
        contract: contractCount,
        tm: tmCount,
        total: workers.length
      })
    }

    return data
  }, [crewByDate, tmWorkersByDate, timeRange])

  // Navigate dates
  const changeDate = useCallback((direction) => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + direction)
    setSelectedDate(d.toISOString().split('T')[0])
  }, [selectedDate])

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Click a bar in the chart to select that date
  const handleBarClick = useCallback((data) => {
    if (data?.date) {
      setSelectedDate(data.date)
    }
  }, [])

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const total = (payload[0]?.value || 0) + (payload[1]?.value || 0)
    return (
      <div style={{
        ...tooltipStyle.contentStyle,
        fontSize: '0.8rem'
      }}>
        <p style={{ ...tooltipStyle.labelStyle, fontSize: '0.85rem', marginBottom: 6 }}>{label}</p>
        <p style={{ margin: '3px 0', color: CREW_COLORS.contract }}>
          Contract: <strong>{payload[0]?.value || 0}</strong>
        </p>
        <p style={{ margin: '3px 0', color: CREW_COLORS.tm }}>
          T&M: <strong>{payload[1]?.value || 0}</strong>
        </p>
        <p style={{ margin: '3px 0', color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', paddingTop: 4 }}>
          Total: <strong>{total}</strong>
        </p>
      </div>
    )
  }

  // PDF Export
  const exportCrewPDF = useCallback(async () => {
    setExporting(true)
    onShowToast?.('Generating crew report PDF...', 'info')

    try {
      const jsPDFModule = await loadJsPDF()
      const jsPDF = jsPDFModule.default
      const doc = new jsPDF()

      const pageWidth = doc.internal.pageSize.width
      let y = 20

      // Header
      doc.setFontSize(18)
      doc.setFont(undefined, 'bold')
      doc.text('Crew On-Site Report', pageWidth / 2, y, { align: 'center' })
      y += 8

      doc.setFontSize(11)
      doc.setFont(undefined, 'normal')
      doc.text(`Project: ${project.name}`, pageWidth / 2, y, { align: 'center' })
      y += 6
      doc.text(`Date: ${formatDate(selectedDate)}`, pageWidth / 2, y, { align: 'center' })
      y += 12

      // Summary stats
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('Selected Day Summary', 14, y)
      y += 7

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`Total Crew On-Site: ${todayMetrics.total}`, 14, y); y += 5
      doc.text(`Contract Workers: ${todayMetrics.contract.length}`, 14, y); y += 5
      doc.text(`T&M Workers: ${todayMetrics.tm.length}`, 14, y); y += 10

      // Contract Workers
      if (todayMetrics.contract.length > 0) {
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('Contract Workers', 14, y); y += 7

        doc.setFontSize(9)
        doc.setFont(undefined, 'bold')
        doc.text('Name', 14, y)
        doc.text('Role', 100, y); y += 5

        doc.setFont(undefined, 'normal')
        todayMetrics.contract.forEach(w => {
          if (y > 270) { doc.addPage(); y = 20 }
          doc.text(w.name, 14, y)
          doc.text(w.role || '—', 100, y); y += 5
        })
        y += 8
      }

      // T&M Workers
      if (todayMetrics.tm.length > 0) {
        if (y > 240) { doc.addPage(); y = 20 }
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('T&M Workers (Extra Work)', 14, y); y += 7

        doc.setFontSize(9)
        doc.setFont(undefined, 'bold')
        doc.text('Name', 14, y)
        doc.text('Role', 100, y); y += 5

        doc.setFont(undefined, 'normal')
        todayMetrics.tm.forEach(w => {
          if (y > 270) { doc.addPage(); y = 20 }
          doc.text(w.name, 14, y)
          doc.text(w.role || '—', 100, y); y += 5
        })
        y += 8
      }

      // Timeline table
      if (y > 200) { doc.addPage(); y = 20 }
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('Daily Timeline', 14, y); y += 7

      doc.setFontSize(8)
      doc.setFont(undefined, 'bold')
      doc.text('Date', 14, y)
      doc.text('Total', 70, y)
      doc.text('Contract', 95, y)
      doc.text('T&M', 125, y); y += 5

      doc.setFont(undefined, 'normal')
      chartData.forEach(day => {
        if (y > 275) { doc.addPage(); y = 20 }
        doc.text(day.displayDate, 14, y)
        doc.text(String(day.total), 70, y)
        doc.text(String(day.contract), 95, y)
        doc.text(String(day.tm), 125, y)
        y += 4.5
      })

      // Footer
      const footerY = doc.internal.pageSize.height - 10
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(`Generated ${new Date().toLocaleString()} — FieldSync`, pageWidth / 2, footerY, { align: 'center' })

      const fileName = `${project.name}_Crew_Report_${selectedDate}.pdf`
      doc.save(fileName)
      onShowToast?.('PDF exported!', 'success')
    } catch (error) {
      console.error('Error exporting crew PDF:', error)
      onShowToast?.('Error generating PDF', 'error')
    } finally {
      setExporting(false)
    }
  }, [project, selectedDate, todayMetrics, chartData, onShowToast])

  if (loading) {
    return (
      <div className="crew-metrics-card animate-fade-in-up">
        <div className="crew-metrics-header">
          <h3><Users size={18} /> Crew On-Site</h3>
        </div>
        <div className="crew-metrics-loading">
          <div className="skeleton-stat"></div>
          <div className="skeleton-stat"></div>
          <div className="skeleton-stat"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="crew-metrics-card animate-fade-in-up">
      {/* Header with export */}
      <div className="crew-metrics-header">
        <h3><Users size={18} /> Crew On-Site</h3>
        <div className="crew-metrics-actions">
          <button
            className="btn btn-secondary btn-small"
            onClick={exportCrewPDF}
            disabled={exporting}
            title="Export crew report as PDF"
          >
            <Download size={14} /> {exporting ? 'Exporting...' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Date navigator */}
      <div className="crew-date-nav">
        <button className="crew-date-btn" onClick={() => changeDate(-1)}>
          <ChevronLeft size={16} />
        </button>
        <span className="crew-date-label">
          <Calendar size={14} />
          {isToday ? 'Today' : formatDate(selectedDate)}
        </span>
        <button className="crew-date-btn" onClick={() => changeDate(1)} disabled={isToday}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Stats row for selected day */}
      <div className="crew-stats-row">
        <div className="crew-stat total">
          <div className="crew-stat-icon"><Users size={20} /></div>
          <div className="crew-stat-content">
            <span className="crew-stat-value">{todayMetrics.total}</span>
            <span className="crew-stat-label">Total On-Site</span>
          </div>
        </div>

        <div className="crew-stat contract">
          <div className="crew-stat-icon"><HardHat size={20} /></div>
          <div className="crew-stat-content">
            <span className="crew-stat-value">{todayMetrics.contract.length}</span>
            <span className="crew-stat-label">Contract</span>
          </div>
        </div>

        <div className="crew-stat tm">
          <div className="crew-stat-icon"><Wrench size={20} /></div>
          <div className="crew-stat-content">
            <span className="crew-stat-value">{todayMetrics.tm.length}</span>
            <span className="crew-stat-label">T&M</span>
          </div>
        </div>
      </div>

      {/* Breakdown bar for selected day */}
      {todayMetrics.total > 0 && (
        <div className="crew-breakdown-bar">
          <div
            className="crew-bar-segment contract"
            style={{ width: `${(todayMetrics.contract.length / todayMetrics.total) * 100}%` }}
            title={`${todayMetrics.contract.length} Contract`}
          />
          <div
            className="crew-bar-segment tm"
            style={{ width: `${(todayMetrics.tm.length / todayMetrics.total) * 100}%` }}
            title={`${todayMetrics.tm.length} T&M`}
          />
        </div>
      )}

      {/* Worker name lists */}
      {todayMetrics.total > 0 && (
        <div className="crew-name-lists">
          {todayMetrics.contract.length > 0 && (
            <div className="crew-name-group">
              <div className="crew-name-group-header contract">
                <HardHat size={13} />
                <span>Contract ({todayMetrics.contract.length})</span>
              </div>
              <div className="crew-name-tags">
                {todayMetrics.contract.map((w, i) => (
                  <span key={i} className="crew-name-tag contract">
                    {w.name}
                    {w.role && w.role !== 'Laborer' && (
                      <span className="crew-name-role">{w.role}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {todayMetrics.tm.length > 0 && (
            <div className="crew-name-group">
              <div className="crew-name-group-header tm">
                <Wrench size={13} />
                <span>T&M ({todayMetrics.tm.length})</span>
              </div>
              <div className="crew-name-tags">
                {todayMetrics.tm.map((w, i) => (
                  <span key={i} className="crew-name-tag tm">
                    {w.name}
                    {w.role && w.role !== 'Laborer' && (
                      <span className="crew-name-role">{w.role}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Day-by-day timeline chart */}
      <div className="crew-timeline-section">
        <div className="crew-timeline-header">
          <span className="crew-timeline-title">Daily Breakdown</span>
          <div className="crew-time-range-pills">
            {TIME_RANGES.map(range => (
              <button
                key={range.id}
                className={`crew-range-pill ${timeRange === range.id ? 'active' : ''}`}
                onClick={() => setTimeRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        <div className="crew-chart-container">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart
              data={chartData}
              onClick={(e) => e?.activePayload?.[0] && handleBarClick(e.activePayload[0].payload)}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={{ stroke: 'var(--border-color)' }}
                tickLine={false}
                interval={timeRange === '30d' ? 4 : timeRange === '14d' ? 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '0.75rem', paddingTop: 4 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="contract"
                name="Contract"
                stackId="crew"
                fill={CREW_COLORS.contract}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="tm"
                name="T&M (Extra Work)"
                stackId="crew"
                fill={CREW_COLORS.tm}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Empty state */}
      {todayMetrics.total === 0 && (
        <div className="crew-empty">
          <p>No crew checked in for this date</p>
        </div>
      )}
    </div>
  )
})

export default OverviewCrewMetrics
