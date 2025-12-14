import { useState } from 'react'

export default function ProjectDailyReports({ project, reports, onRefresh }) {
  const [selectedReport, setSelectedReport] = useState(null)
  const [dateRange, setDateRange] = useState('30') // days

  // Sort reports by date (most recent first)
  const sortedReports = [...reports].sort((a, b) =>
    new Date(b.report_date) - new Date(a.report_date)
  )

  // Filter by date range
  const filteredReports = sortedReports.filter(report => {
    const reportDate = new Date(report.report_date)
    const daysAgo = (new Date() - reportDate) / (1000 * 60 * 60 * 24)
    return daysAgo <= parseInt(dateRange)
  })

  function handleExport() {
    // Create CSV export
    let csv = 'Date,Crew Count,Tasks Completed,T&M Tickets,Photos,Field Notes,Issues,Status\n'

    filteredReports.forEach(report => {
      csv += `${report.report_date},${report.crew_count || 0},${report.tasks_completed || 0},${report.tm_tickets_count || 0},${report.photos_count || 0},"${(report.field_notes || '').replace(/"/g, '""')}","${(report.issues || '').replace(/"/g, '""')}","${report.status}"\n`
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}-daily-reports-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // If a report is selected, show detail view
  if (selectedReport) {
    return (
      <div className="daily-report-detail">
        <div className="report-detail-header">
          <button className="btn-back" onClick={() => setSelectedReport(null)}>
            ← Back to Reports
          </button>
        </div>

        <div className="report-detail-content">
          <h2>
            Daily Report - {new Date(selectedReport.report_date).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </h2>

          <div className="report-status-badge">
            {selectedReport.status === 'submitted' ? '✓ Submitted' : '⏳ Draft'}
          </div>

          {/* Summary */}
          <div className="report-summary-grid">
            <div className="summary-item">
              <span className="summary-label">Crew Count</span>
              <span className="summary-value">{selectedReport.crew_count || 0}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Tasks Completed</span>
              <span className="summary-value">{selectedReport.tasks_completed || 0}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">T&M Tickets</span>
              <span className="summary-value">{selectedReport.tm_tickets_count || 0}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Photos</span>
              <span className="summary-value">{selectedReport.photos_count || 0}</span>
            </div>
          </div>

          {/* Crew List */}
          {selectedReport.crew_list && selectedReport.crew_list.length > 0 && (
            <div className="report-section">
              <h3>👷 Crew Members</h3>
              <div className="crew-list">
                {selectedReport.crew_list.map((member, index) => (
                  <div key={index} className="crew-member-badge">
                    {member}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Tasks */}
          {selectedReport.completed_tasks && selectedReport.completed_tasks.length > 0 && (
            <div className="report-section">
              <h3>✓ Tasks Completed</h3>
              <ul className="completed-tasks-list">
                {selectedReport.completed_tasks.map((task, index) => (
                  <li key={index}>{task}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Field Notes */}
          {selectedReport.field_notes && (
            <div className="report-section">
              <h3>📝 Field Notes</h3>
              <div className="notes-content">
                {selectedReport.field_notes}
              </div>
            </div>
          )}

          {/* Issues */}
          {selectedReport.issues && (
            <div className="report-section">
              <h3>⚠️ Issues</h3>
              <div className="issues-content">
                {selectedReport.issues}
              </div>
            </div>
          )}

          {/* Submission Info */}
          {selectedReport.status === 'submitted' && selectedReport.submitted_by && (
            <div className="report-footer">
              <p>
                Submitted by {selectedReport.submitted_by} on{' '}
                {new Date(selectedReport.submitted_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="project-daily-reports">
      {/* Header */}
      <div className="reports-header">
        <h3>Daily Reports</h3>
        <div className="reports-controls">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="filter-select"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">All Reports</option>
          </select>
          <button className="btn-secondary btn-small" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>

      {/* Reports List */}
      <div className="reports-list">
        {filteredReports.length === 0 ? (
          <div className="empty-state">
            <p>No daily reports found</p>
          </div>
        ) : (
          filteredReports.map(report => {
            const isToday = report.report_date === new Date().toISOString().split('T')[0]

            return (
              <div
                key={report.id}
                className="daily-report-card"
                onClick={() => setSelectedReport(report)}
              >
                <div className="report-card-header">
                  <div className="report-date">
                    <span className="date-icon">📋</span>
                    <strong>
                      {new Date(report.report_date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </strong>
                    {isToday && <span className="today-badge">Today</span>}
                  </div>
                  <div className={`report-status ${report.status}`}>
                    {report.status === 'submitted' ? '✓ Submitted' : '⏳ Draft'}
                  </div>
                </div>

                <div className="report-card-stats">
                  <span className="stat-item">Crew: {report.crew_count || 0}</span>
                  <span className="stat-separator">|</span>
                  <span className="stat-item">Tasks: {report.tasks_completed || 0} completed</span>
                  <span className="stat-separator">|</span>
                  <span className="stat-item">T&M: {report.tm_tickets_count || 0}</span>
                  <span className="stat-separator">|</span>
                  <span className="stat-item">📸 {report.photos_count || 0}</span>
                </div>

                {report.field_notes && (
                  <div className="report-card-notes">
                    <strong>Notes:</strong> {report.field_notes.substring(0, 100)}
                    {report.field_notes.length > 100 && '...'}
                  </div>
                )}

                {report.issues && (
                  <div className="report-card-issues">
                    <strong>Issues:</strong> {report.issues.substring(0, 100)}
                    {report.issues.length > 100 && '...'}
                  </div>
                )}

                <div className="report-card-footer">
                  <button className="btn-link">View Full Report →</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
