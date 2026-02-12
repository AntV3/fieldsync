import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'
import { hexToRgb, loadImageAsBase64 } from '../lib/imageUtils'
import { ErrorState } from './ui'
import InjuryReportForm from './InjuryReportForm'
import InjuryReportCard from './InjuryReportCard'
import Toast from './Toast'
// Dynamic import for jsPDF (loaded on-demand to reduce initial bundle)
const loadJsPDF = () => import('jspdf')

export default function InjuryReportsList({ project, companyId, company, user, onShowToast }) {
  const { branding } = useBranding()
  const [reports, setReports] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // View mode state
  const [viewMode, setViewMode] = useState('recent') // 'recent' | 'all'
  const [expandedMonths, setExpandedMonths] = useState(new Set())
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })

  useEffect(() => {
    loadReports()

    // Subscribe to real-time updates for injury reports
    const effectiveCompanyId = companyId || project?.company_id
    const subscription = effectiveCompanyId
      ? db.subscribeToInjuryReports?.(effectiveCompanyId, () => {
          loadReports()
        })
      : null

    return () => {
      if (subscription) db.unsubscribe?.(subscription)
    }
  }, [project?.id, companyId])

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = project
        ? await db.getInjuryReports(project.id)
        : await db.getCompanyInjuryReports(companyId)
      setReports(data)
    } catch (err) {
      console.error('Error loading injury reports:', err)
      setError(err)
      setToast({ type: 'error', message: 'Failed to load injury reports' })
    } finally {
      setLoading(false)
    }
  }, [project?.id, companyId])

  const handleReportCreated = () => {
    loadReports()
    setShowForm(false)
    setToast({ type: 'success', message: 'Injury report created successfully' })
  }

  const handleViewDetails = (report) => {
    setSelectedReport(report)
  }

  const handleCloseDetails = () => {
    setSelectedReport(null)
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatTime = (timeString) => {
    if (!timeString) return ''
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const getInjuryTypeLabel = (type) => {
    const labels = {
      minor: 'Minor Injury',
      serious: 'Serious Injury',
      critical: 'Critical Injury',
      near_miss: 'Near Miss'
    }
    return labels[type] || type
  }

  const getStatusColor = (status) => {
    const colors = {
      reported: '#fbbf24',
      under_investigation: '#3b82f6',
      closed: '#10b981'
    }
    return colors[status] || '#9ca3af'
  }

  const getInjuryTypeColor = (type) => {
    const colors = {
      minor: '#10b981',
      serious: '#f59e0b',
      critical: '#ef4444',
      near_miss: '#6b7280'
    }
    return colors[type] || '#9ca3af'
  }

  // Filter reports by view mode and date range
  const filteredReports = useMemo(() => {
    let filtered = [...reports]

    // Apply date filter if set
    if (dateFilter.start) {
      const startDate = new Date(dateFilter.start)
      startDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.incident_date)
        return reportDate >= startDate
      })
    }
    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end)
      endDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.incident_date)
        return reportDate <= endDate
      })
    }

    // In recent mode, show only last 7 days
    if (viewMode === 'recent') {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      filtered = filtered.filter(r => {
        const reportDate = new Date(r.incident_date)
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
      const date = new Date(report.incident_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      if (!groups[monthKey]) {
        groups[monthKey] = { label: monthLabel, reports: [] }
      }
      groups[monthKey].reports.push(report)
    })

    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredReports, viewMode])

  // Auto-expand current month
  useEffect(() => {
    if (reportsByMonth && reportsByMonth.length > 0) {
      const currentMonthKey = reportsByMonth[0][0]
      setExpandedMonths(new Set([currentMonthKey]))
    }
  }, [reportsByMonth])

  const toggleMonthExpand = (monthKey) => {
    const newExpanded = new Set(expandedMonths)
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey)
    } else {
      newExpanded.add(monthKey)
    }
    setExpandedMonths(newExpanded)
  }

  // Export to PDF with company branding
  const exportToPDF = async () => {
    if (reports.length === 0) {
      setToast({ type: 'error', message: 'No reports to export' })
      return
    }

    setToast({ type: 'info', message: 'Generating PDF...' })

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
    doc.text(company?.name || 'Company', logoOffset, 20)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('INJURY & INCIDENT REPORTS', logoOffset, 30)

    doc.setFontSize(9)
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, 20, { align: 'right' })
    doc.text(`Total Reports: ${reports.length}`, pageWidth - margin, 28, { align: 'right' })

    yPos = 55

    // Project info if available
    if (project) {
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, yPos - 5, pageWidth - margin * 2, 15, 'F')
      doc.setTextColor(...primaryColor)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Project: ${project.name}`, margin + 5, yPos + 5)
      yPos += 20
    }

    // Reports
    reports.forEach((report) => {
      // Check if we need a new page (injury reports need more space)
      if (yPos > 200) {
        doc.addPage()
        yPos = margin
      }

      // Report header with injury type color
      const typeColor = hexToRgb(getInjuryTypeColor(report.injury_type))
      doc.setFillColor(...typeColor)
      doc.rect(margin, yPos, pageWidth - margin * 2, 12, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(`${report.employee_name} - ${getInjuryTypeLabel(report.injury_type)}`, margin + 5, yPos + 8)
      doc.text(formatDate(report.incident_date), pageWidth - margin - 5, yPos + 8, { align: 'right' })
      yPos += 17

      doc.setTextColor(50, 50, 50)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')

      // Location and time
      doc.text(`Location: ${report.incident_location}`, margin + 5, yPos)
      if (report.incident_time) {
        doc.text(`Time: ${formatTime(report.incident_time)}`, margin + 100, yPos)
      }
      yPos += 6

      // Description
      doc.setFont('helvetica', 'bold')
      doc.text('Description:', margin + 5, yPos)
      doc.setFont('helvetica', 'normal')
      yPos += 5
      const descLines = doc.splitTextToSize(report.incident_description, pageWidth - margin * 2 - 10)
      doc.text(descLines, margin + 5, yPos)
      yPos += descLines.length * 4 + 3

      // Key details
      const details = []
      if (report.body_part_affected) details.push(`Body Part: ${report.body_part_affected}`)
      if (report.osha_recordable) details.push('OSHA Recordable')
      if (report.workers_comp_claim) details.push('Workers\' Comp Filed')
      if (report.medical_treatment_required) details.push('Medical Treatment Required')

      if (details.length > 0) {
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        doc.text(details.join('  |  '), margin + 5, yPos)
        yPos += 5
      }

      // Reported by
      doc.setFontSize(8)
      doc.text(`Reported by: ${report.reported_by_name} (${report.reported_by_title})`, margin + 5, yPos)
      yPos += 12
    })

    // Footer
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })
      doc.text('CONFIDENTIAL - Injury Report', margin, doc.internal.pageSize.getHeight() - 10)
    }

    const fileName = `Injury_Reports_${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)
    setToast({ type: 'success', message: 'PDF exported!' })
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading injury reports...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="injury-reports-section card">
        <ErrorState
          title="Unable to load reports"
          message="There was a problem loading injury reports. Please try again."
          error={error}
          onRetry={loadReports}
        />
      </div>
    )
  }

  return (
    <>
      <div className="injury-reports-section">
        <div className="section-header">
          <h3>Injury & Incident Reports</h3>
          <div className="section-header-actions">
            {reports.length > 0 && (
              <button className="btn-secondary" onClick={exportToPDF}>
                PDF
              </button>
            )}
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + File Injury Report
            </button>
          </div>
        </div>

        {/* View Mode Bar */}
        <div className="view-mode-bar">
          <div className="view-mode-tabs">
            <button
              className={`view-mode-tab ${viewMode === 'recent' ? 'active' : ''}`}
              onClick={() => { setViewMode('recent'); setDateFilter({ start: '', end: '' }); }}
            >
              Recent (7 days)
            </button>
            <button
              className={`view-mode-tab ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
            >
              All ({reports.length})
            </button>
          </div>

          {viewMode === 'all' && (
            <div className="date-filter">
              <Calendar size={16} />
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                placeholder="Start date"
              />
              <span>to</span>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                placeholder="End date"
              />
              {(dateFilter.start || dateFilter.end) && (
                <button
                  className="btn-ghost"
                  onClick={() => setDateFilter({ start: '', end: '' })}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {filteredReports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏥</div>
            <h4>No Injury Reports{viewMode === 'recent' ? ' in the last 7 days' : ''}</h4>
            <p>Click "File Injury Report" to document a workplace incident</p>
            {viewMode === 'recent' && reports.length > 0 && (
              <button className="btn-secondary" onClick={() => setViewMode('all')}>
                View All Reports
              </button>
            )}
          </div>
        ) : (
          <div className="reports-list">
            {/* Render reports - with month grouping in 'all' mode */}
            {viewMode === 'all' && reportsByMonth ? (
              reportsByMonth.map(([monthKey, monthData]) => (
                <div key={monthKey} className="month-group">
                  <div
                    className="month-header"
                    onClick={() => toggleMonthExpand(monthKey)}
                  >
                    <div className="month-header-left">
                      {expandedMonths.has(monthKey) ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                      <span className="month-label">{monthData.label}</span>
                      <span className="month-count">{monthData.reports.length} reports</span>
                    </div>
                  </div>
                  {expandedMonths.has(monthKey) && (
                    <div className="month-reports">
                      {monthData.reports.map(report => (
                        <InjuryReportCard
                          key={report.id}
                          report={report}
                          formatDate={formatDate}
                          formatTime={formatTime}
                          getInjuryTypeColor={getInjuryTypeColor}
                          getInjuryTypeLabel={getInjuryTypeLabel}
                          getStatusColor={getStatusColor}
                          onViewDetails={handleViewDetails}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              // Recent view - simple list
              filteredReports.map(report => (
                <InjuryReportCard
                  key={report.id}
                  report={report}
                  formatDate={formatDate}
                  formatTime={formatTime}
                  getInjuryTypeColor={getInjuryTypeColor}
                  getInjuryTypeLabel={getInjuryTypeLabel}
                  getStatusColor={getStatusColor}
                  onViewDetails={handleViewDetails}
                />
              ))
            )}
          </div>
        )}

        {/* Report Details Modal */}
        {selectedReport && (
          <div className="modal-overlay" onClick={handleCloseDetails}>
            <div className="modal-content report-details-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Injury Report Details</h2>
                <button className="close-btn" onClick={handleCloseDetails}>&times;</button>
              </div>

              <div className="modal-body">
                {/* Incident Information */}
                <section className="details-section">
                  <h3>Incident Information</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Date & Time</label>
                      <div>{formatDate(selectedReport.incident_date)} at {formatTime(selectedReport.incident_time)}</div>
                    </div>
                    <div className="detail-item">
                      <label>Location</label>
                      <div>{selectedReport.incident_location}</div>
                    </div>
                    <div className="detail-item">
                      <label>Injury Type</label>
                      <div>
                        <span
                          className="badge"
                          style={{ backgroundColor: getInjuryTypeColor(selectedReport.injury_type) }}
                        >
                          {getInjuryTypeLabel(selectedReport.injury_type)}
                        </span>
                      </div>
                    </div>
                    {selectedReport.body_part_affected && (
                      <div className="detail-item">
                        <label>Body Part Affected</label>
                        <div>{selectedReport.body_part_affected}</div>
                      </div>
                    )}
                  </div>
                  <div className="detail-item full-width">
                    <label>Description</label>
                    <div className="description-box">{selectedReport.incident_description}</div>
                  </div>
                </section>

                {/* Employee Information */}
                <section className="details-section">
                  <h3>Injured Employee</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Name</label>
                      <div>{selectedReport.employee_name}</div>
                    </div>
                    <div className="detail-item">
                      <label>Job Title</label>
                      <div>{selectedReport.employee_job_title}</div>
                    </div>
                    {selectedReport.employee_phone && (
                      <div className="detail-item">
                        <label>Phone</label>
                        <div>{selectedReport.employee_phone}</div>
                      </div>
                    )}
                    {selectedReport.employee_email && (
                      <div className="detail-item">
                        <label>Email</label>
                        <div>{selectedReport.employee_email}</div>
                      </div>
                    )}
                    {selectedReport.employee_address && (
                      <div className="detail-item full-width">
                        <label>Address</label>
                        <div>{selectedReport.employee_address}</div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Supervisor Information */}
                <section className="details-section">
                  <h3>Reported By</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>Name</label>
                      <div>{selectedReport.reported_by_name}</div>
                    </div>
                    <div className="detail-item">
                      <label>Title</label>
                      <div>{selectedReport.reported_by_title}</div>
                    </div>
                    {selectedReport.reported_by_phone && (
                      <div className="detail-item">
                        <label>Phone</label>
                        <div>{selectedReport.reported_by_phone}</div>
                      </div>
                    )}
                    {selectedReport.reported_by_email && (
                      <div className="detail-item">
                        <label>Email</label>
                        <div>{selectedReport.reported_by_email}</div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Witnesses */}
                {selectedReport.witnesses && selectedReport.witnesses.length > 0 && (
                  <section className="details-section">
                    <h3>Witnesses</h3>
                    {selectedReport.witnesses.map((witness, index) => (
                      <div key={index} className="witness-card">
                        <div className="witness-header">
                          <strong>{witness.name}</strong>
                          {witness.phone && <span> • {witness.phone}</span>}
                          {witness.email && <span> • {witness.email}</span>}
                        </div>
                        {witness.testimony && (
                          <div className="witness-testimony">
                            <em>"{witness.testimony}"</em>
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {/* Medical Information */}
                {selectedReport.medical_treatment_required && (
                  <section className="details-section">
                    <h3>Medical Treatment</h3>
                    <div className="detail-grid">
                      {selectedReport.medical_facility_name && (
                        <div className="detail-item">
                          <label>Facility</label>
                          <div>{selectedReport.medical_facility_name}</div>
                        </div>
                      )}
                      {selectedReport.medical_facility_address && (
                        <div className="detail-item">
                          <label>Address</label>
                          <div>{selectedReport.medical_facility_address}</div>
                        </div>
                      )}
                      <div className="detail-item">
                        <label>Hospitalized</label>
                        <div>{selectedReport.hospitalized ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Actions & Safety */}
                <section className="details-section">
                  <h3>Actions & Safety</h3>
                  {selectedReport.immediate_actions_taken && (
                    <div className="detail-item full-width">
                      <label>Immediate Actions Taken</label>
                      <div className="description-box">{selectedReport.immediate_actions_taken}</div>
                    </div>
                  )}
                  {selectedReport.corrective_actions_planned && (
                    <div className="detail-item full-width">
                      <label>Corrective Actions Planned</label>
                      <div className="description-box">{selectedReport.corrective_actions_planned}</div>
                    </div>
                  )}
                  <div className="detail-grid">
                    {selectedReport.safety_equipment_used && (
                      <div className="detail-item">
                        <label>Safety Equipment Used</label>
                        <div>{selectedReport.safety_equipment_used}</div>
                      </div>
                    )}
                    {selectedReport.safety_equipment_failed && (
                      <div className="detail-item">
                        <label>Safety Equipment Failed</label>
                        <div>{selectedReport.safety_equipment_failed}</div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Regulatory Information */}
                <section className="details-section">
                  <h3>Regulatory & Work Impact</h3>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>OSHA Recordable</label>
                      <div>{selectedReport.osha_recordable ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="detail-item">
                      <label>Workers' Comp Claim</label>
                      <div>{selectedReport.workers_comp_claim ? 'Yes' : 'No'}</div>
                    </div>
                    <div className="detail-item">
                      <label>Days Away From Work</label>
                      <div>{selectedReport.days_away_from_work || 0}</div>
                    </div>
                    <div className="detail-item">
                      <label>Restricted Work Days</label>
                      <div>{selectedReport.restricted_work_days || 0}</div>
                    </div>
                  </div>
                </section>

                <div className="report-meta">
                  Filed on {formatDate(selectedReport.created_at)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Report Form */}
        {showForm && (
          <InjuryReportForm
            project={project}
            companyId={companyId}
            user={user}
            onClose={() => setShowForm(false)}
            onReportCreated={handleReportCreated}
          />
        )}

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>

      <style>{`
        .injury-reports-section {
          margin-top: 2rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .section-header h3 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--text-primary);
        }

        .view-mode-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: var(--bg-elevated);
          border-radius: 8px;
          flex-wrap: wrap;
        }

        .view-mode-tabs {
          display: flex;
          gap: 0.5rem;
        }

        .view-mode-tab {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          cursor: pointer;
          background: transparent;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .view-mode-tab:hover {
          background: var(--bg-tertiary);
        }

        .view-mode-tab.active {
          background: var(--primary-color, #3b82f6);
          color: white;
        }

        .date-filter {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
        }

        .date-filter input[type="date"] {
          padding: 0.4rem 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.875rem;
          background: var(--bg-card);
          color: var(--text-primary);
        }

        .btn-ghost {
          background: transparent;
          border: none;
          padding: 0.4rem 0.75rem;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .btn-ghost:hover {
          background: var(--bg-tertiary);
        }

        .month-group {
          margin-bottom: 0.5rem;
        }

        .month-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--bg-elevated);
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .month-header:hover {
          background: var(--bg-tertiary);
        }

        .month-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .month-label {
          font-weight: 600;
          color: var(--text-primary);
        }

        .month-count {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .month-reports {
          margin-top: 0.5rem;
          padding-left: 0.5rem;
        }

        .reports-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .report-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .report-card:hover {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
          border-color: var(--accent-primary);
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .report-date {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 0.25rem;
        }

        .employee-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .report-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          color: white;
          text-transform: capitalize;
        }

        .osha-badge {
          background-color: #dc2626;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .report-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 1rem;
          background-color: var(--bg-elevated);
          border-radius: 6px;
        }

        .summary-item {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .summary-item strong {
          color: var(--text-primary);
        }

        .report-description {
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .report-footer {
          text-align: right;
          font-size: 0.875rem;
          color: var(--primary-color, #3b82f6);
        }

        .report-details-modal {
          max-width: 900px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .details-section {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid var(--border-color);
        }

        .details-section:last-child {
          border-bottom: none;
        }

        .details-section h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.125rem;
          color: var(--text-primary);
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .detail-item label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.25rem;
        }

        .detail-item div {
          color: var(--text-primary);
        }

        .detail-item.full-width {
          grid-column: 1 / -1;
        }

        .description-box {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 1rem;
          white-space: pre-wrap;
          line-height: 1.6;
          color: var(--text-primary);
        }

        .witness-card {
          background-color: var(--bg-elevated);
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 0.5rem;
        }

        .witness-header {
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .witness-testimony {
          color: var(--text-secondary);
          font-size: 0.875rem;
          padding-left: 1rem;
          border-left: 3px solid var(--border-color);
        }

        .report-meta {
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-secondary);
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }

        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
        }

        .empty-state-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .empty-state h4 {
          margin: 0 0 0.5rem 0;
          color: var(--text-primary);
        }

        .empty-state p {
          margin: 0;
          color: var(--text-secondary);
        }

        .section-header-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .btn-primary, .btn-secondary {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }

        .btn-primary {
          background-color: var(--primary-color, #3b82f6);
          color: white;
        }

        .btn-secondary {
          background-color: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-primary:hover, .btn-secondary:hover {
          opacity: 0.9;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 3rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid var(--border-color);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .report-header {
            flex-direction: column;
            gap: 0.5rem;
          }

          .report-summary {
            grid-template-columns: 1fr;
          }

          .detail-grid {
            grid-template-columns: 1fr;
          }

          .report-details-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }
        }
      `}</style>
    </>
  )
}
