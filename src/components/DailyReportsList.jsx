import { useState, useEffect, useMemo, useCallback } from 'react'
import { ClipboardList, ChevronDown, ChevronRight, Calendar, Truck, Camera } from 'lucide-react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'
import { hexToRgb, loadImageAsBase64 } from '../lib/imageUtils'
import { ErrorState, EmptyState } from './ui'
// Dynamic import for jsPDF (loaded on-demand to reduce initial bundle)
const loadJsPDF = () => import('jspdf')

const LOAD_TYPE_LABELS = {
  concrete: 'Concrete',
  trash: 'Trash',
  metals: 'Metals',
  hazardous_waste: 'Hazardous Waste'
}
const getLoadLabel = (type) => LOAD_TYPE_LABELS[type] || type

export default function DailyReportsList({ project, company, onShowToast }) {
  const { branding } = useBranding()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedReport, setExpandedReport] = useState(null)

  // Multi-select state
  const [selectedReports, setSelectedReports] = useState(new Set())
  const [selectMode, setSelectMode] = useState(false)

  // View mode state
  const [viewMode, setViewMode] = useState('recent') // 'recent' | 'all'
  const [expandedMonths, setExpandedMonths] = useState(new Set())

  // Date filter state
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  useEffect(() => {
    loadReports()

    // Subscribe to realtime updates
    const subscription = db.subscribeToDailyReports?.(project.id, () => {
      loadReports()
    })

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project.id])

  const loadReports = useCallback(async () => {
    try {
      setError(null)
      // Load more reports to support month grouping
      const data = await db.getDailyReports(project.id, 365)
      setReports(data || [])
    } catch (err) {
      console.error('Error loading daily reports:', err)
      setError(err)
      onShowToast?.('Error loading daily reports', 'error')
    } finally {
      setLoading(false)
    }
  }, [project.id]) // onShowToast is stable (memoized in App.jsx)

  // Filter reports based on view mode and date filter
  const filteredReports = useMemo(() => {
    let filtered = [...reports]

    // Apply date filter if set
    if (dateFilter.start) {
      const startDate = new Date(dateFilter.start)
      startDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.report_date || r.created_at)
        return reportDate >= startDate
      })
    }
    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.report_date || r.created_at)
        return reportDate <= endDate
      })
    }

    // In recent mode, show only last 7 days
    if (viewMode === 'recent') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.report_date || r.created_at)
        return reportDate >= sevenDaysAgo
      })
    }

    return filtered
  }, [reports, viewMode, dateFilter])

  // Group reports by month for 'all' view
  const reportsByMonth = useMemo(() => {
    if (viewMode !== 'all') return null

    const groups = {}
    filteredReports.forEach(report => {
      const date = new Date(report.report_date || report.created_at)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      if (!groups[monthKey]) {
        groups[monthKey] = { label: monthLabel, reports: [] }
      }
      groups[monthKey].reports.push(report)
    })

    // Sort by month (newest first)
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredReports, viewMode])

  // Auto-expand current month
  useEffect(() => {
    if (reportsByMonth && reportsByMonth.length > 0) {
      const currentMonthKey = reportsByMonth[0][0]
      setExpandedMonths(new Set([currentMonthKey]))
    }
  }, [reportsByMonth])

  // Selection handlers
  const toggleSelectMode = () => {
    setSelectMode(!selectMode)
    if (selectMode) {
      setSelectedReports(new Set())
    }
  }

  const toggleReportSelection = (reportId) => {
    const newSelection = new Set(selectedReports)
    if (newSelection.has(reportId)) {
      newSelection.delete(reportId)
    } else {
      newSelection.add(reportId)
    }
    setSelectedReports(newSelection)
  }

  const toggleSelectAll = () => {
    if (selectedReports.size === filteredReports.length) {
      setSelectedReports(new Set())
    } else {
      setSelectedReports(new Set(filteredReports.map(r => r.id)))
    }
  }

  const toggleMonthExpand = (monthKey) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  // Get reports for export (selected or all filtered)
  const getExportReports = () => {
    if (selectedReports.size > 0) {
      return filteredReports.filter(r => selectedReports.has(r.id))
    }
    return filteredReports
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'submitted': return '✓'
      case 'reviewed': return '✓✓'
      case 'draft': return '○'
      default: return '○'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'submitted': return 'Submitted'
      case 'reviewed': return 'Reviewed'
      case 'draft': return 'Draft'
      default: return status
    }
  }

  // Export to PDF with company branding
  const exportToPDF = async () => {
    const exportReports = getExportReports()
    if (exportReports.length === 0) {
      onShowToast?.('No reports to export', 'error')
      return
    }

    onShowToast?.('Generating PDF...', 'info')

    // Dynamic import - only loads jsPDF when user actually exports
    const jsPDFModule = await loadJsPDF()
    const jsPDF = jsPDFModule.default

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    let yPos = margin

    const primaryColor = hexToRgb(branding?.primary_color || '#3B82F6')
    const secondaryColor = hexToRgb(branding?.secondary_color || '#1E40AF')

    // Header with branding
    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pageWidth, 45, 'F')
    doc.setFillColor(...secondaryColor)
    doc.rect(0, 42, pageWidth, 3, 'F')

    // Add logo if available
    let logoOffset = margin
    if (branding?.logo_url) {
      try {
        const logoBase64 = await loadImageAsBase64(branding.logo_url)
        if (logoBase64) {
          doc.addImage(logoBase64, 'PNG', margin, 7, 30, 30)
          logoOffset = margin + 40
        }
      } catch (e) {
        console.error('Error adding logo:', e)
      }
    }

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text(company?.name || 'Company Name', logoOffset, 20)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('DAILY REPORTS SUMMARY', logoOffset, 30)

    doc.setFontSize(9)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, 20, { align: 'right' })
    if (project.job_number) {
      doc.text(`Job #: ${project.job_number}`, pageWidth - margin, 28, { align: 'right' })
    }

    yPos = 55

    // Project info
    doc.setFillColor(248, 250, 252)
    doc.rect(margin, yPos - 5, pageWidth - margin * 2, 20, 'F')
    doc.setTextColor(...primaryColor)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`Project: ${project.name}`, margin + 5, yPos + 7)
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`${exportReports.length} Report${exportReports.length !== 1 ? 's' : ''}`, pageWidth - margin - 5, yPos + 7, { align: 'right' })

    yPos += 25

    // Reports
    exportReports.forEach((report, index) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage()
        yPos = margin
      }

      // Report header
      doc.setFillColor(...primaryColor)
      doc.setTextColor(255, 255, 255)
      doc.rect(margin, yPos, pageWidth - margin * 2, 10, 'F')
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(formatDate(report.report_date || report.created_at), margin + 5, yPos + 7)
      doc.text(getStatusLabel(report.status), pageWidth - margin - 5, yPos + 7, { align: 'right' })
      yPos += 15

      // Stats row
      doc.setTextColor(50, 50, 50)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const disposalSummaryPdf = Array.isArray(report.disposal_loads_summary) ? report.disposal_loads_summary : []
      const totalLoadsPdf = disposalSummaryPdf.reduce((s, d) => s + d.count, 0)
      const photoUrlsPdf = Array.isArray(report.photo_urls) ? report.photo_urls : []
      const photoCount = photoUrlsPdf.length || report.photos_count || 0
      const stats = `Manpower: ${report.crew_count || 0}  |  Tasks: ${report.tasks_completed || 0}  |  Loads: ${totalLoadsPdf}  |  Photos: ${photoCount}`
      doc.text(stats, margin + 5, yPos)
      yPos += 8

      // Crew list
      if (report.crew_list?.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.text('Crew:', margin + 5, yPos)
        doc.setFont('helvetica', 'normal')
        const crewNames = report.crew_list.map(w => `${w.name} (${w.role})`).join(', ')
        const crewLines = doc.splitTextToSize(crewNames, pageWidth - margin * 2 - 30)
        doc.text(crewLines, margin + 25, yPos)
        yPos += crewLines.length * 5 + 3
      }

      // Loads hauled
      if (disposalSummaryPdf.length > 0) {
        doc.setTextColor(50, 50, 50)
        doc.setFont('helvetica', 'bold')
        doc.text('Loads Hauled:', margin + 5, yPos)
        doc.setFont('helvetica', 'normal')
        const loadsText = disposalSummaryPdf.map(d => `${d.count} ${getLoadLabel(d.type)}`).join(', ')
        const loadsLines = doc.splitTextToSize(loadsText, pageWidth - margin * 2 - 45)
        doc.text(loadsLines, margin + 45, yPos)
        yPos += loadsLines.length * 5 + 3
      }

      // Work description
      if (report.work_description) {
        doc.setTextColor(50, 50, 50)
        doc.setFont('helvetica', 'bold')
        doc.text('Work Done:', margin + 5, yPos)
        doc.setFont('helvetica', 'normal')
        const workLines = doc.splitTextToSize(report.work_description, pageWidth - margin * 2 - 40)
        doc.text(workLines, margin + 40, yPos)
        yPos += workLines.length * 5 + 3
      }

      // Field notes
      if (report.field_notes) {
        doc.setFont('helvetica', 'bold')
        doc.text('Notes:', margin + 5, yPos)
        doc.setFont('helvetica', 'normal')
        const noteLines = doc.splitTextToSize(report.field_notes, pageWidth - margin * 2 - 30)
        doc.text(noteLines, margin + 25, yPos)
        yPos += noteLines.length * 5 + 3
      }

      // Issues
      if (report.issues) {
        doc.setTextColor(180, 50, 50)
        doc.setFont('helvetica', 'bold')
        doc.text('Issues:', margin + 5, yPos)
        doc.setFont('helvetica', 'normal')
        const issueLines = doc.splitTextToSize(report.issues, pageWidth - margin * 2 - 30)
        doc.text(issueLines, margin + 25, yPos)
        doc.setTextColor(50, 50, 50)
        yPos += issueLines.length * 5 + 3
      }

      // Photo documentation note
      if (photoCount > 0) {
        doc.setTextColor(50, 100, 180)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.text(`${photoCount} photo${photoCount !== 1 ? 's' : ''} attached to this report (view in FieldSync)`, margin + 5, yPos)
        doc.setTextColor(50, 50, 50)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        yPos += 6
      }

      yPos += 10
    })

    // Footer
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })
    }

    const fileName = `${project.name}_Daily_Reports_${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)
    onShowToast?.('PDF exported!', 'success')
  }

  // Render a single report card
  const renderReportCard = (report) => (
    <div
      key={report.id}
      className={`daily-report-card ${report.status} ${selectedReports.has(report.id) ? 'selected' : ''}`}
    >
      <div
        className="daily-report-header-row"
        onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
      >
        {selectMode && (
          <input
            type="checkbox"
            className="report-checkbox"
            checked={selectedReports.has(report.id)}
            onChange={(e) => {
              e.stopPropagation()
              toggleReportSelection(report.id)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <div className="daily-report-info">
          <span className="report-date">{formatDate(report.report_date || report.created_at)}</span>
          <span className={`report-status ${report.status}`}>
            {getStatusIcon(report.status)} {getStatusLabel(report.status)}
          </span>
        </div>
        <div className="daily-report-summary">
          <span className="report-crew">{report.crew_count || 0} crew</span>
          <span className="report-tasks">{report.tasks_completed || 0} tasks</span>
          <span className="report-expand">{expandedReport === report.id ? '▼' : '▶'}</span>
        </div>
      </div>

      {expandedReport === report.id && (() => {
        const disposalSummary = Array.isArray(report.disposal_loads_summary) ? report.disposal_loads_summary : []
        const totalLoads = disposalSummary.reduce((s, d) => s + d.count, 0)
        const photoUrls = Array.isArray(report.photo_urls) ? report.photo_urls : []
        const photoCount = photoUrls.length || report.photos_count || 0
        return (
          <div className="daily-report-details">
            {/* Summary Stats */}
            <div className="report-stats-grid">
              <div className="report-stat">
                <span className="stat-value">{report.crew_count || 0}</span>
                <span className="stat-label">Total Manpower</span>
              </div>
              <div className="report-stat">
                <span className="stat-value">{report.tasks_completed || 0}</span>
                <span className="stat-label">Tasks Done</span>
              </div>
              <div className="report-stat">
                <span className="stat-value">{totalLoads}</span>
                <span className="stat-label">Loads Hauled</span>
              </div>
              <div className="report-stat">
                <span className="stat-value">{photoCount}</span>
                <span className="stat-label">Photos</span>
              </div>
            </div>

            {/* Crew List */}
            {report.crew_list?.length > 0 && (
              <div className="report-section">
                <h4>Crew on Site ({report.crew_count})</h4>
                <div className="report-crew-list">
                  {report.crew_list.map((worker, i) => (
                    <div key={i} className="crew-member">
                      <span className="crew-name">{worker.name}</span>
                      <span className="crew-role">{worker.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disposal Loads */}
            {disposalSummary.length > 0 && (
              <div className="report-section">
                <h4><Truck size={14} className="inline-icon" /> Loads Hauled</h4>
                <div className="report-loads-list">
                  {disposalSummary.map((d, i) => (
                    <div key={i} className="report-load-row">
                      <span className="load-type-label">{getLoadLabel(d.type)}</span>
                      <span className="load-count-badge">{d.count} load{d.count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                  <div className="report-load-total">Total: {totalLoads} load{totalLoads !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}

            {/* Completed Tasks */}
            {report.completed_tasks?.length > 0 && (
              <div className="report-section">
                <h4>Completed Today</h4>
                <ul className="report-tasks-list">
                  {report.completed_tasks.map((task, i) => (
                    <li key={i}>
                      {task.name}
                      {task.group && <span className="task-group">{task.group}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Work Description */}
            {report.work_description && (
              <div className="report-section">
                <h4>Work Completed</h4>
                <p className="report-notes">{report.work_description}</p>
              </div>
            )}

            {/* Field Notes */}
            {report.field_notes && (
              <div className="report-section">
                <h4>Additional Notes</h4>
                <p className="report-notes">{report.field_notes}</p>
              </div>
            )}

            {/* Issues */}
            {report.issues && (
              <div className="report-section issues">
                <h4>Issues / Concerns</h4>
                <p className="report-issues">{report.issues}</p>
              </div>
            )}

            {/* Photo Documentation */}
            {photoUrls.length > 0 && (
              <div className="report-section">
                <h4><Camera size={14} className="inline-icon" /> Photo Documentation ({photoUrls.length})</h4>
                <div className="report-photos-grid">
                  {photoUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="report-photo-thumb">
                      <img src={url} alt={`Site photo ${i + 1}`} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Submitted Info */}
            {report.submitted_at && (
              <div className="report-meta">
                <span>Submitted by {report.submitted_by || 'Field'} at {formatTime(report.submitted_at)}</span>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )

  if (loading) {
    return <div className="loading">Loading daily reports...</div>
  }

  if (error) {
    return (
      <div className="daily-reports-list card">
        <ErrorState
          title="Unable to load reports"
          message="There was a problem loading daily reports. Please try again."
          error={error}
          onRetry={loadReports}
        />
      </div>
    )
  }

  const totalReports = reports.length
  const recentCount = filteredReports.length

  return (
    <div className="daily-reports-list card">
      {/* Header */}
      <div className="daily-reports-header">
        <h3>Daily Reports</h3>
        <div className="daily-reports-actions">
          {reports.length > 0 && (
            <>
              <button
                className={`btn btn-small ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={toggleSelectMode}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
              <button className="btn btn-secondary btn-small" onClick={exportToPDF}>
                PDF{selectedReports.size > 0 ? ` (${selectedReports.size})` : ''}
              </button>
            </>
          )}
        </div>
      </div>

      {/* View Mode Toggle */}
      {reports.length > 0 && (
        <div className="view-mode-bar">
          <div className="view-mode-tabs">
            <button
              className={`view-mode-tab ${viewMode === 'recent' ? 'active' : ''}`}
              onClick={() => setViewMode('recent')}
            >
              Recent (7 days)
            </button>
            <button
              className={`view-mode-tab ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
            >
              All ({totalReports})
            </button>
          </div>

          {/* Date Filter (only in 'all' mode) */}
          {viewMode === 'all' && (
            <div className="date-filter">
              <Calendar size={14} className="date-filter-icon" />
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                className="date-input"
              />
              <span className="date-separator">to</span>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                className="date-input"
              />
              {(dateFilter.start || dateFilter.end) && (
                <button
                  className="date-clear"
                  onClick={() => setDateFilter({ start: '', end: '' })}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Select All (when in select mode) */}
      {selectMode && filteredReports.length > 0 && (
        <div className="select-all-bar">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selectedReports.size === filteredReports.length && filteredReports.length > 0}
              onChange={toggleSelectAll}
            />
            Select All ({filteredReports.length})
          </label>
          {selectedReports.size > 0 && (
            <span className="selected-count">{selectedReports.size} selected</span>
          )}
        </div>
      )}

      {/* Reports List */}
      {reports.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No daily reports yet"
          message="Reports from the field will appear here"
        />
      ) : filteredReports.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No reports in this time period"
          message={viewMode === 'recent' ? 'No reports in the last 7 days' : 'Try adjusting your date filter'}
        />
      ) : viewMode === 'recent' ? (
        // Recent view - flat list
        <div className="daily-reports">
          {filteredReports.map(report => renderReportCard(report))}
          {totalReports > recentCount && (
            <div className="view-all-prompt">
              <button
                className="btn btn-secondary"
                onClick={() => setViewMode('all')}
              >
                View All {totalReports} Reports
              </button>
            </div>
          )}
        </div>
      ) : (
        // All view - grouped by month
        <div className="daily-reports grouped">
          {reportsByMonth?.map(([monthKey, { label, reports: monthReports }]) => (
            <div key={monthKey} className="month-group">
              <div
                className="month-header"
                onClick={() => toggleMonthExpand(monthKey)}
              >
                {expandedMonths.has(monthKey) ? (
                  <ChevronDown size={18} className="month-chevron" />
                ) : (
                  <ChevronRight size={18} className="month-chevron" />
                )}
                <span className="month-label">{label}</span>
                <span className="month-count">{monthReports.length} report{monthReports.length !== 1 ? 's' : ''}</span>
              </div>
              {expandedMonths.has(monthKey) && (
                <div className="month-reports">
                  {monthReports.map(report => renderReportCard(report))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
