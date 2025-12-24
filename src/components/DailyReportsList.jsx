import { useState, useEffect } from 'react'
import { ClipboardList } from 'lucide-react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'
import jsPDF from 'jspdf'

// Helper to convert hex color to RGB array for jsPDF
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [30, 41, 59]
}

// Helper to load image as base64 for PDF
const loadImageAsBase64 = (url) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export default function DailyReportsList({ project, company, onShowToast }) {
  const { branding } = useBranding()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedReport, setExpandedReport] = useState(null)

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

  const loadReports = async () => {
    try {
      const data = await db.getDailyReports(project.id, 30)
      setReports(data || [])
    } catch (error) {
      console.error('Error loading daily reports:', error)
      onShowToast?.('Error loading daily reports', 'error')
    } finally {
      setLoading(false)
    }
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
    if (reports.length === 0) {
      onShowToast?.('No reports to export', 'error')
      return
    }

    onShowToast?.('Generating PDF...', 'info')

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
    doc.text(`${reports.length} Report${reports.length !== 1 ? 's' : ''}`, pageWidth - margin - 5, yPos + 7, { align: 'right' })

    yPos += 25

    // Reports
    reports.forEach((report, index) => {
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
      const stats = `Crew: ${report.crew_count || 0}  |  Tasks: ${report.tasks_completed || 0}  |  T&M: ${report.tm_tickets_count || 0}  |  Photos: ${report.photos_count || 0}`
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

  if (loading) {
    return <div className="loading">Loading daily reports...</div>
  }

  return (
    <div className="daily-reports-list card">
      <div className="daily-reports-header">
        <h3>Daily Reports</h3>
        <div className="daily-reports-actions">
          {reports.length > 0 && (
            <button className="btn btn-secondary btn-small" onClick={exportToPDF}>
              PDF
            </button>
          )}
          <span className="reports-count">{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="reports-empty-state">
          <span className="empty-icon"><ClipboardList size={32} /></span>
          <p>No daily reports yet</p>
          <small>Reports from the field will appear here</small>
        </div>
      ) : (
        <div className="daily-reports">
          {reports.map(report => (
            <div
              key={report.id}
              className={`daily-report-card ${report.status}`}
            >
              <div
                className="daily-report-header-row"
                onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
              >
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

              {expandedReport === report.id && (
                <div className="daily-report-details">
                  {/* Summary Stats */}
                  <div className="report-stats-grid">
                    <div className="report-stat">
                      <span className="stat-value">{report.crew_count || 0}</span>
                      <span className="stat-label">Crew on Site</span>
                    </div>
                    <div className="report-stat">
                      <span className="stat-value">{report.tasks_completed || 0}</span>
                      <span className="stat-label">Tasks Done</span>
                    </div>
                    <div className="report-stat">
                      <span className="stat-value">{report.tm_tickets_count || 0}</span>
                      <span className="stat-label">T&M Tickets</span>
                    </div>
                    <div className="report-stat">
                      <span className="stat-value">{report.photos_count || 0}</span>
                      <span className="stat-label">Photos</span>
                    </div>
                  </div>

                  {/* Crew List */}
                  {report.crew_list?.length > 0 && (
                    <div className="report-section">
                      <h4>Crew</h4>
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

                  {/* Field Notes */}
                  {report.field_notes && (
                    <div className="report-section">
                      <h4>Field Notes</h4>
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

                  {/* Submitted Info */}
                  {report.submitted_at && (
                    <div className="report-meta">
                      <span>Submitted by {report.submitted_by || 'Field'} at {formatTime(report.submitted_at)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
