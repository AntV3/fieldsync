import { useState, useEffect, useRef } from 'react'
import { HardHat, FileText, AlertTriangle, CheckCircle, Upload, Camera, X } from 'lucide-react'
import { db, isSupabaseConfigured, getFieldCompanyId } from '../lib/supabase'
import { compressImage } from '../lib/imageUtils'

export default function DailyReport({ project, onShowToast, onClose }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [report, setReport] = useState(null)
  const [fieldNotes, setFieldNotes] = useState('')
  const [issues, setIssues] = useState('')
  const [photos, setPhotos] = useState([])
  const [photoError, setPhotoError] = useState(false)
  const photoInputRef = useRef(null)

  useEffect(() => {
    if (project?.id) {
      loadReport()
    }
  }, [project?.id])

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach(p => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })
    }
  }, [])

  const loadReport = async () => {
    try {
      // Check for existing report
      const existing = await db.getDailyReport(project.id)

      if (existing) {
        setReport(existing)
        setFieldNotes(existing.field_notes || '')
        setIssues(existing.issues || '')
        // If already submitted, populate photos count display (actual URLs not needed for display)
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

  const handlePhotoAdd = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const MAX_FILE_SIZE = 10 * 1024 * 1024
    const MAX_PHOTOS = 10

    const remaining = MAX_PHOTOS - photos.length
    const filesToAdd = files.slice(0, remaining)

    if (files.length > remaining) {
      onShowToast(`Only ${remaining} more photo(s) can be added (10 max)`, 'error')
    }

    filesToAdd.forEach(file => {
      if (!file.type.startsWith('image/')) {
        onShowToast('Please select an image file', 'error')
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        onShowToast(`Photo too large: ${file.name} (max 10MB)`, 'error')
        return
      }

      const previewUrl = URL.createObjectURL(file)
      setPhotos(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl,
        name: file.name
      }])
    })

    setPhotoError(false)
    e.target.value = ''
  }

  const removePhoto = (photoId) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === photoId)
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
      return prev.filter(p => p.id !== photoId)
    })
  }

  const handleSubmit = async () => {
    // Require at least 1 photo
    if (photos.length === 0) {
      setPhotoError(true)
      onShowToast('At least 1 photo is required before submitting', 'error')
      return
    }

    // Demo mode warning
    if (!isSupabaseConfigured) {
      onShowToast('Demo Mode: Report saved locally only - won\'t reach office', 'info')
      onClose()
      return
    }

    setSubmitting(true)
    try {
      const reportDate = new Date().toISOString().split('T')[0]
      const companyId = getFieldCompanyId()

      // Upload photos
      let uploadedUrls = []
      for (const photo of photos) {
        try {
          let fileToUpload = photo.file
          try {
            fileToUpload = await compressImage(photo.file)
          } catch {
            // Use original if compression fails
          }
          const path = await db.uploadPhoto(companyId, project.id, `daily-${reportDate}`, fileToUpload)
          if (path) uploadedUrls.push(path)
        } catch (err) {
          console.error('Photo upload failed:', err)
          // Continue uploading remaining photos
        }
      }

      if (uploadedUrls.length === 0 && photos.length > 0) {
        onShowToast('Photos failed to upload. Check connection and try again.', 'error')
        setSubmitting(false)
        return
      }

      if (uploadedUrls.length < photos.length) {
        onShowToast(`${uploadedUrls.length}/${photos.length} photos uploaded`, 'warning')
      }

      // Save notes and photos
      await db.saveDailyReport(project.id, {
        field_notes: fieldNotes,
        issues: issues,
        photos: uploadedUrls
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
            <div className="daily-report-card-value">{isSubmitted ? (report.photos_count || 0) : photos.length}</div>
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

        {/* Photos - Required */}
        {!isSubmitted && (
          <div className="daily-report-section">
            <h3>
              <Camera size={18} className="inline-icon" /> Photos
              <span className="dr-photo-required-badge">Required</span>
            </h3>
            {photoError && (
              <p className="dr-photo-error">At least 1 site photo is required to submit the report.</p>
            )}
            <div className="dr-photo-grid">
              {photos.map(photo => (
                <div key={photo.id} className="dr-photo-item">
                  <img src={photo.previewUrl} alt={photo.name} />
                  <button
                    className="dr-photo-remove"
                    onClick={() => removePhoto(photo.id)}
                    aria-label="Remove photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {photos.length < 10 && (
                <button
                  className={`dr-photo-add${photoError ? ' dr-photo-add-error' : ''}`}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Camera size={22} />
                  <span>{photos.length === 0 ? 'Add Photo' : 'Add More'}</span>
                </button>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoAdd}
            />
            <p className="dr-photo-hint">
              {photos.length === 0
                ? 'Take or upload site photos before submitting'
                : `${photos.length} photo${photos.length !== 1 ? 's' : ''} ready to upload`}
            </p>
          </div>
        )}

        {/* Submitted photos count */}
        {isSubmitted && report.photos_count > 0 && (
          <div className="daily-report-section">
            <h3><Camera size={18} className="inline-icon" /> Photos</h3>
            <p className="dr-photo-hint">{report.photos_count} photo{report.photos_count !== 1 ? 's' : ''} submitted — visible in office overview</p>
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
            {submitting ? 'Uploading & Submitting...' : <><Upload size={16} className="inline-icon" /> Submit Report</>}
          </button>
          <p className="daily-report-hint">
            {photos.length === 0
              ? 'Add at least 1 photo before submitting'
              : 'This will be sent to the office'}
          </p>
        </div>
      )}
    </div>
  )
}
