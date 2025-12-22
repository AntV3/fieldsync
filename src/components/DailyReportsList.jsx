import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function DailyReportsList({ project, company, onShowToast }) {
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

  if (loading) {
    return <div className="loading">Loading daily reports...</div>
  }

  return (
    <div className="daily-reports-list card">
      <div className="daily-reports-header">
        <h3>Daily Reports</h3>
        <span className="reports-count">{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
      </div>

      {reports.length === 0 ? (
        <div className="reports-empty-state">
          <span className="empty-icon">📋</span>
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
