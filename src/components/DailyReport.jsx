import { useState, useEffect } from 'react'
import { HardHat, FileText, AlertTriangle, CheckCircle, Upload, Truck, Camera, ClipboardList } from 'lucide-react'
import { db, isSupabaseConfigured } from '../lib/supabase'

const LOAD_TYPE_LABELS = {
  concrete: 'Concrete',
  trash: 'Trash',
  metals: 'Metals',
  hazardous_waste: 'Hazardous Waste'
}

const getLoadLabel = (type) => LOAD_TYPE_LABELS[type] || type

export default function DailyReport({ project, onShowToast, onClose }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [report, setReport] = useState(null)
  const [workDescription, setWorkDescription] = useState('')
  const [fieldNotes, setFieldNotes] = useState('')
  const [issues, setIssues] = useState('')

  useEffect(() => {
    if (project?.id) {
      loadReport()
    }
  }, [project?.id])

  const loadReport = async () => {
    try {
      // Check for existing report
      const existing = await db.getDailyReport(project.id)

      if (existing) {
        setReport(existing)
        setWorkDescription(existing.work_description || '')
        setFieldNotes(existing.field_notes || '')
        setIssues(existing.issues || '')
      } else {
        // Compile fresh data (disposal loads + photos included)
        const compiled = await db.compileDailyReport(project.id)
        setReport({
          ...compiled,
          status: 'draft'
        })
      }
    } catch (err) {
      console.error('Error loading report:', err)
      onShowToast('Error loading report', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    // Demo mode warning
    if (!isSupabaseConfigured) {
      onShowToast('Demo Mode: Report saved locally only - won\'t reach office', 'info')
      onClose()
      return
    }

    setSubmitting(true)
    try {
      // Save foreman-entered fields first
      await db.saveDailyReport(project.id, {
        work_description: workDescription,
        field_notes: fieldNotes,
        issues: issues
      })

      // Then compile latest data and submit
      const result = await db.submitDailyReport(project.id, 'Field')

      if (result) {
        onShowToast('Daily report submitted!', 'success')
        onClose()
      } else {
        onShowToast('Report not sent - check connection', 'error')
      }
    } catch (err) {
      console.error('Error submitting report:', err)
      onShowToast('Error submitting report', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const shiftDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })

  if (loading) {
    return (
      <div className="daily-report">
        <div className="daily-report-header">
          <button className="back-btn-simple" onClick={onClose}>←</button>
          <h2>Daily Report</h2>
        </div>
        <div className="daily-report-loading">Compiling report...</div>
      </div>
    )
  }

  // Handle case where report failed to load
  if (!report) {
    return (
      <div className="daily-report">
        <div className="daily-report-header">
          <button className="back-btn-simple" onClick={onClose}>←</button>
          <h2>Daily Report</h2>
        </div>
        <div className="daily-report-error">
          <p>Unable to load report data.</p>
          <button className="btn btn-secondary" onClick={loadReport}>Retry</button>
        </div>
      </div>
    )
  }

  const isSubmitted = report.status === 'submitted'
  const disposalSummary = report.disposal_loads_summary || []
  const totalLoads = disposalSummary.reduce((sum, d) => sum + d.count, 0)
  const photoUrls = report.photo_urls || []

  return (
    <div className="daily-report">
      <div className="daily-report-header">
        <button className="back-btn-simple" onClick={onClose}>←</button>
        <div>
          <h2>Daily Report</h2>
          <p className="daily-report-date">{shiftDate}</p>
        </div>
      </div>

      {isSubmitted && (
        <div className="daily-report-submitted-banner">
          ✓ Submitted {new Date(report.submitted_at).toLocaleTimeString()}
        </div>
      )}

      <div className="daily-report-content">
        {/* Shift Date */}
        <div className="daily-report-section daily-report-shift-date">
          <h3><ClipboardList size={18} className="inline-icon" /> Shift Date</h3>
          <p className="shift-date-value">{shiftDate}</p>
        </div>

        {/* Manpower Summary Cards */}
        <div className="daily-report-summary">
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.crew_count || 0}</div>
            <div className="daily-report-card-label">Total Manpower</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.tasks_completed || 0}</div>
            <div className="daily-report-card-label">Tasks Done</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{totalLoads}</div>
            <div className="daily-report-card-label">Loads Hauled</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{photoUrls.length || report.photos_count || 0}</div>
            <div className="daily-report-card-label">Photos</div>
          </div>
        </div>

        {/* Crew List */}
        {report.crew_list?.length > 0 && (
          <div className="daily-report-section">
            <h3><HardHat size={18} className="inline-icon" /> Crew on Site ({report.crew_count})</h3>
            <div className="daily-report-crew">
              {report.crew_list.map((worker, i) => (
                <div key={i} className="daily-report-crew-item">
                  <span>{worker.name}</span>
                  <span className="daily-report-crew-role">{worker.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disposal Loads */}
        <div className="daily-report-section">
          <h3><Truck size={18} className="inline-icon" /> Loads Hauled</h3>
          {disposalSummary.length > 0 ? (
            <div className="daily-report-loads">
              {disposalSummary.map((d, i) => (
                <div key={i} className="daily-report-load-row">
                  <span className="load-type">{getLoadLabel(d.type)}</span>
                  <span className="load-count">{d.count} load{d.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
              <div className="daily-report-load-total">
                <strong>Total: {totalLoads} load{totalLoads !== 1 ? 's' : ''}</strong>
              </div>
            </div>
          ) : (
            <p className="daily-report-empty-note">
              No disposal loads recorded today. Add loads from the Disposal section before submitting.
            </p>
          )}
        </div>

        {/* Completed Tasks */}
        {report.completed_tasks?.length > 0 && (
          <div className="daily-report-section">
            <h3><CheckCircle size={18} className="inline-icon" /> Completed Today</h3>
            <ul className="daily-report-tasks">
              {report.completed_tasks.map((task, i) => (
                <li key={i}>
                  {task.name}
                  {task.group && <span className="daily-report-task-group">{task.group}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Work Description */}
        <div className="daily-report-section">
          <h3><FileText size={18} className="inline-icon" /> Work Completed</h3>
          <textarea
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
            placeholder="Brief description of work completed today..."
            rows={3}
            disabled={isSubmitted}
          />
        </div>

        {/* Additional Field Notes */}
        <div className="daily-report-section">
          <h3><FileText size={18} className="inline-icon" /> Additional Notes</h3>
          <textarea
            value={fieldNotes}
            onChange={(e) => setFieldNotes(e.target.value)}
            placeholder="Any other notes about today's work..."
            rows={2}
            disabled={isSubmitted}
          />
        </div>

        {/* Issues */}
        <div className="daily-report-section">
          <h3><AlertTriangle size={18} className="inline-icon" /> Issues / Concerns</h3>
          <textarea
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
            placeholder="Any problems, delays, or concerns..."
            rows={2}
            disabled={isSubmitted}
          />
        </div>

        {/* Photo Documentation */}
        {photoUrls.length > 0 && (
          <div className="daily-report-section">
            <h3><Camera size={18} className="inline-icon" /> Photo Documentation ({photoUrls.length})</h3>
            <div className="daily-report-photos">
              {photoUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="daily-report-photo-thumb">
                  <img src={url} alt={`Site photo ${i + 1}`} />
                </a>
              ))}
            </div>
            <p className="daily-report-photos-hint">
              Photos from today&apos;s T&amp;M tickets. Add more photos from the T&amp;M section.
            </p>
          </div>
        )}
      </div>

      {/* Submit Button */}
      {!isSubmitted && (
        <div className="daily-report-footer">
          <button
            className="btn btn-primary daily-report-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : <><Upload size={16} className="inline-icon" /> Submit Report</>}
          </button>
          <p className="daily-report-hint">This will be sent to the office</p>
        </div>
      )}
    </div>
  )
}
