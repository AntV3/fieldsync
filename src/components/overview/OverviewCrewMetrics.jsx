import { memo, useState, useEffect, useMemo, useCallback } from 'react'
import { Users, HardHat, Wrench, Calendar, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '../../lib/supabase'

/**
 * OverviewCrewMetrics - Crew on-site metrics for project overview
 * Shows total crew count, contract vs T&M worker breakdown by day
 * Includes PDF export capability
 */

const loadJsPDF = () => import('jspdf')

export const OverviewCrewMetrics = memo(function OverviewCrewMetrics({
  project,
  onShowToast
}) {
  const [crewData, setCrewData] = useState(null)
  const [tmTickets, setTmTickets] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Load crew check-in and T&M data for selected date
  useEffect(() => {
    if (!project?.id) return
    loadData()
  }, [project?.id, selectedDate])

  const loadData = async () => {
    setLoading(true)
    try {
      const [crew, tickets] = await Promise.all([
        db.getCrewCheckin(project.id, selectedDate),
        db.getTMTickets(project.id)
      ])
      setCrewData(crew)
      setTmTickets(tickets || [])
    } catch (error) {
      console.error('Error loading crew metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get T&M tickets for selected date
  const dayTickets = useMemo(() => {
    return tmTickets.filter(t => t.work_date === selectedDate)
  }, [tmTickets, selectedDate])

  // Extract T&M worker names for the selected date
  const tmWorkerNames = useMemo(() => {
    const names = new Set()
    dayTickets.forEach(ticket => {
      (ticket.t_and_m_workers || []).forEach(w => {
        names.add(w.name.toLowerCase().trim())
      })
    })
    return names
  }, [dayTickets])

  // All crew members for the day
  const allWorkers = useMemo(() => {
    return crewData?.workers || []
  }, [crewData])

  // Classify workers as T&M or Contract
  const { tmWorkers, contractWorkers } = useMemo(() => {
    const tm = []
    const contract = []

    allWorkers.forEach(worker => {
      if (tmWorkerNames.has(worker.name.toLowerCase().trim())) {
        tm.push(worker)
      } else {
        contract.push(worker)
      }
    })

    return { tmWorkers: tm, contractWorkers: contract }
  }, [allWorkers, tmWorkerNames])

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
      doc.text('Summary', 14, y)
      y += 7

      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`Total Crew On-Site: ${allWorkers.length}`, 14, y); y += 5
      doc.text(`Contract Workers: ${contractWorkers.length}`, 14, y); y += 5
      doc.text(`T&M Workers: ${tmWorkers.length}`, 14, y); y += 5
      doc.text(`T&M Tickets: ${dayTickets.length}`, 14, y); y += 10

      // Contract Workers Table
      if (contractWorkers.length > 0) {
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('Contract Workers', 14, y)
        y += 7

        doc.setFontSize(9)
        doc.setFont(undefined, 'bold')
        doc.text('Name', 14, y)
        doc.text('Role', 100, y)
        y += 5

        doc.setFont(undefined, 'normal')
        contractWorkers.forEach(w => {
          if (y > 270) { doc.addPage(); y = 20 }
          doc.text(w.name, 14, y)
          doc.text(w.role || '—', 100, y)
          y += 5
        })
        y += 8
      }

      // T&M Workers Table
      if (tmWorkers.length > 0) {
        if (y > 240) { doc.addPage(); y = 20 }
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('T&M Workers', 14, y)
        y += 7

        doc.setFontSize(9)
        doc.setFont(undefined, 'bold')
        doc.text('Name', 14, y)
        doc.text('Role', 80, y)
        doc.text('Hours', 130, y)
        doc.text('OT', 155, y)
        y += 5

        doc.setFont(undefined, 'normal')
        tmWorkers.forEach(worker => {
          if (y > 270) { doc.addPage(); y = 20 }
          // Find hours from T&M ticket
          let hours = 0, ot = 0
          dayTickets.forEach(t => {
            (t.t_and_m_workers || []).forEach(tw => {
              if (tw.name.toLowerCase().trim() === worker.name.toLowerCase().trim()) {
                hours += tw.hours || 0
                ot += tw.overtime_hours || 0
              }
            })
          })
          doc.text(worker.name, 14, y)
          doc.text(worker.role || '—', 80, y)
          doc.text(String(hours), 130, y)
          doc.text(String(ot), 155, y)
          y += 5
        })
      }

      // Footer
      y = doc.internal.pageSize.height - 10
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(`Generated ${new Date().toLocaleString()} — FieldSync`, pageWidth / 2, y, { align: 'center' })

      const fileName = `${project.name}_Crew_Report_${selectedDate}.pdf`
      doc.save(fileName)
      onShowToast?.('PDF exported!', 'success')
    } catch (error) {
      console.error('Error exporting crew PDF:', error)
      onShowToast?.('Error generating PDF', 'error')
    } finally {
      setExporting(false)
    }
  }, [project, selectedDate, allWorkers, contractWorkers, tmWorkers, dayTickets, onShowToast])

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
      {/* Header with date nav and export */}
      <div className="crew-metrics-header">
        <h3><Users size={18} /> Crew On-Site</h3>
        <div className="crew-metrics-actions">
          <button
            className="btn btn-secondary btn-small"
            onClick={exportCrewPDF}
            disabled={exporting || allWorkers.length === 0}
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

      {/* Stats row */}
      <div className="crew-stats-row">
        <div className="crew-stat total">
          <div className="crew-stat-icon"><Users size={20} /></div>
          <div className="crew-stat-content">
            <span className="crew-stat-value">{allWorkers.length}</span>
            <span className="crew-stat-label">Total On-Site</span>
          </div>
        </div>

        <div className="crew-stat contract">
          <div className="crew-stat-icon"><HardHat size={20} /></div>
          <div className="crew-stat-content">
            <span className="crew-stat-value">{contractWorkers.length}</span>
            <span className="crew-stat-label">Contract</span>
          </div>
        </div>

        <div className="crew-stat tm">
          <div className="crew-stat-icon"><Wrench size={20} /></div>
          <div className="crew-stat-content">
            <span className="crew-stat-value">{tmWorkers.length}</span>
            <span className="crew-stat-label">T&M</span>
          </div>
        </div>
      </div>

      {/* Breakdown bar */}
      {allWorkers.length > 0 && (
        <div className="crew-breakdown-bar">
          <div
            className="crew-bar-segment contract"
            style={{ width: `${(contractWorkers.length / allWorkers.length) * 100}%` }}
            title={`${contractWorkers.length} Contract`}
          />
          <div
            className="crew-bar-segment tm"
            style={{ width: `${(tmWorkers.length / allWorkers.length) * 100}%` }}
            title={`${tmWorkers.length} T&M`}
          />
        </div>
      )}

      {/* Worker lists (collapsed by default, expandable) */}
      {allWorkers.length === 0 && (
        <div className="crew-empty">
          <p>No crew checked in for this date</p>
        </div>
      )}
    </div>
  )
})

export default OverviewCrewMetrics
