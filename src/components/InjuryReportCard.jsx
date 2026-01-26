import { memo } from 'react'

/**
 * Memoized Injury Report Card component
 * Prevents unnecessary re-renders when parent list updates
 */
const InjuryReportCard = memo(function InjuryReportCard({
  report,
  formatDate,
  formatTime,
  getInjuryTypeColor,
  getInjuryTypeLabel,
  getStatusColor,
  onViewDetails
}) {
  const handleClick = () => onViewDetails(report)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onViewDetails(report)
    }
  }

  return (
    <div
      className="report-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Injury report for ${report.employee_name} on ${formatDate(report.incident_date)}`}
    >
      <div className="report-header">
        <div>
          <div className="report-date">
            {formatDate(report.incident_date)} at {formatTime(report.incident_time)}
          </div>
          <div className="employee-name">{report.employee_name}</div>
        </div>
        <div className="report-badges">
          <span
            className="badge"
            style={{ backgroundColor: getInjuryTypeColor(report.injury_type) }}
          >
            {getInjuryTypeLabel(report.injury_type)}
          </span>
          <span
            className="badge"
            style={{ backgroundColor: getStatusColor(report.status) }}
          >
            {report.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="report-summary">
        <div className="summary-item">
          <strong>Location:</strong> {report.incident_location}
        </div>
        <div className="summary-item">
          <strong>Reported by:</strong> {report.reported_by_name} ({report.reported_by_title})
        </div>
        {report.body_part_affected && (
          <div className="summary-item">
            <strong>Body Part:</strong> {report.body_part_affected}
          </div>
        )}
        {report.osha_recordable && (
          <div className="summary-item">
            <span className="osha-badge">OSHA Recordable</span>
          </div>
        )}
      </div>

      <div className="report-description">
        {report.incident_description.substring(0, 150)}
        {report.incident_description.length > 150 && '...'}
      </div>

      <div className="report-footer">
        <span>Click to view full details</span>
      </div>
    </div>
  )
})

export default InjuryReportCard
