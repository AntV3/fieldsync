import { useState, useEffect } from 'react'
import { HardHat, FileText, AlertTriangle, CheckCircle, Upload, GitPullRequestArrow } from 'lucide-react'
import { db, isSupabaseConfigured } from '../lib/supabase'
import { getFieldSession } from '../lib/fieldSession'

export default function DailyReport({ project, onShowToast, onClose }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [report, setReport] = useState(null)
  const [fieldNotes, setFieldNotes] = useState('')
  const [issues, setIssues] = useState('')

  // COR request from field
  const [showCORForm, setShowCORForm] = useState(false)
  const [corDescription, setCorDescription] = useState('')
  const [submittingCOR, setSubmittingCOR] = useState(false)
  const [corSubmitted, setCorSubmitted] = useState(false)

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
        setFieldNotes(existing.field_notes || '')
        setIssues(existing.issues || '')
      } else {
        // Compile fresh data
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
      // Save notes first
      await db.saveDailyReport(project.id, {
        field_notes: fieldNotes,
        issues: issues
      })

      // Then submit
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

  const handleSubmitCOR = async () => {
    if (!corDescription.trim()) {
      onShowToast('Describe the scope change', 'error')
      return
    }
    setSubmittingCOR(true)
    try {
      const session = getFieldSession()
      const foremanName = session?.foremanName || 'Field'
      await db.createFieldCORRequest?.(project.id, corDescription.trim(), foremanName)
      setCorSubmitted(true)
      setShowCORForm(false)
      setCorDescription('')
      onShowToast('Change order flagged — office will review', 'success')
    } catch (err) {
      console.error('Error submitting COR request:', err)
      onShowToast('Error flagging change order', 'error')
    } finally {
      setSubmittingCOR(false)
    }
  }

  const today = new Date().toLocaleDateString('en-US', {
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

  return (
    <div className="daily-report">
      <div className="daily-report-header">
        <button className="back-btn-simple" onClick={onClose}>←</button>
        <div>
          <h2>Daily Report</h2>
          <p className="daily-report-date">{today}</p>
        </div>
      </div>

      {isSubmitted && (
        <div className="daily-report-submitted-banner">
          ✓ Submitted {new Date(report.submitted_at).toLocaleTimeString()}
        </div>
      )}

      <div className="daily-report-content">
        {/* Summary Cards */}
        <div className="daily-report-summary">
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.crew_count || 0}</div>
            <div className="daily-report-card-label">Crew on Site</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.tasks_completed || 0}</div>
            <div className="daily-report-card-label">Tasks Done</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.tm_tickets_count || 0}</div>
            <div className="daily-report-card-label">T&M Tickets</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.photos_count || 0}</div>
            <div className="daily-report-card-label">Photos</div>
          </div>
        </div>

        {/* Crew List */}
        {report.crew_list?.length > 0 && (
          <div className="daily-report-section">
            <h3><HardHat size={18} className="inline-icon" /> Crew</h3>
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

        {/* Field Notes */}
        <div className="daily-report-section">
          <h3><FileText size={18} className="inline-icon" /> Notes</h3>
          <textarea
            value={fieldNotes}
            onChange={(e) => setFieldNotes(e.target.value)}
            placeholder="Any notes about today's work..."
            rows={3}
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
            rows={3}
            disabled={isSubmitted}
          />
        </div>

        {/* Flag a Change Order */}
        <div className="daily-report-section">
          <h3><GitPullRequestArrow size={18} className="inline-icon" /> Change Order</h3>
          {corSubmitted ? (
            <div className="daily-report-cor-submitted">
              <CheckCircle size={16} />
              <span>Change order flagged — office will price &amp; formalize</span>
            </div>
          ) : showCORForm ? (
            <div className="daily-report-cor-form">
              <textarea
                value={corDescription}
                onChange={(e) => setCorDescription(e.target.value)}
                placeholder="Describe the scope change (e.g. found buried utilities, extra demo area added by GC...)"
                rows={3}
                autoFocus
              />
              <div className="daily-report-cor-actions">
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => { setShowCORForm(false); setCorDescription('') }}
                  disabled={submittingCOR}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-small"
                  onClick={handleSubmitCOR}
                  disabled={submittingCOR || !corDescription.trim()}
                >
                  {submittingCOR ? 'Sending...' : 'Flag for COR'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="daily-report-cor-btn"
              onClick={() => setShowCORForm(true)}
            >
              <GitPullRequestArrow size={16} />
              Flag a scope change for office
            </button>
          )}
        </div>
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
