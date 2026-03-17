import { useState, useEffect, useRef } from 'react'
import { HardHat, FileText, AlertTriangle, CheckCircle, Upload, Camera, X, ImagePlus } from 'lucide-react'
import { db, isSupabaseConfigured } from '../lib/supabase'
import { compressImage } from '../lib/imageUtils'
import { CardSkeleton } from './ui/Skeleton'
import CustomFieldSection from './ui/CustomFieldSection'

export default function DailyReport({ project, onShowToast, onClose }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [report, setReport] = useState(null)
  const [fieldNotes, setFieldNotes] = useState('')
  const [issues, setIssues] = useState('')
  const [photos, setPhotos] = useState([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [submitProgress, setSubmitProgress] = useState('')
  const [customFieldValues, setCustomFieldValues] = useState({})
  const customFieldRef = useRef(null)

  // Keep a ref to the latest photos so the cleanup runs against current values
  const photosRef = useRef(photos)
  photosRef.current = photos

  useEffect(() => {
    if (project?.id) {
      loadReport()
    }
  }, [project?.id])

  // Revoke blob URLs on unmount to prevent ERR_FILE_NOT_FOUND and memory leaks
  useEffect(() => {
    return () => {
      photosRef.current.forEach(p => {
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

  // Photo handlers
  const handlePhotoAdd = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    setUploadingPhotos(true)
    try {
      // Compress all images in parallel for faster processing
      const imageFiles = files.filter(f => f.type.startsWith('image/'))
      const compressedFiles = await Promise.all(
        imageFiles.map(file => compressImage(file))
      )
      const newPhotos = compressedFiles.map((compressed, i) => ({
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: compressed,
        previewUrl: URL.createObjectURL(compressed),
        name: imageFiles[i].name
      }))
      setPhotos(prev => [...prev, ...newPhotos])
    } catch (err) {
      console.error('Error adding photos:', err)
      onShowToast('Error adding photos', 'error')
    } finally {
      setUploadingPhotos(false)
      e.target.value = ''
    }
  }

  const removePhoto = (photoId) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === photoId)
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
      return prev.filter(p => p.id !== photoId)
    })
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
      // Upload new photos to storage in parallel (up to 3 concurrent)
      const uploadedPaths = []
      if (photos.length > 0 && project.company_id) {
        setSubmitProgress('Uploading photos...')
        const photosWithFiles = photos.filter(p => p.file)
        const BATCH_SIZE = 3
        for (let i = 0; i < photosWithFiles.length; i += BATCH_SIZE) {
          const batch = photosWithFiles.slice(i, i + BATCH_SIZE)
          const results = await Promise.allSettled(
            batch.map(photo =>
              db.uploadPhoto(project.company_id, project.id, `dr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, photo.file)
            )
          )
          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value) uploadedPaths.push(r.value)
            else if (r.status === 'rejected') console.error('Photo upload failed:', r.reason)
          })
          setSubmitProgress(`Uploading photos... ${Math.min(i + BATCH_SIZE, photosWithFiles.length)}/${photosWithFiles.length}`)
        }
      }

      // Save notes and photos
      const reportData = {
        field_notes: fieldNotes,
        issues: issues
      }
      if (uploadedPaths.length > 0) {
        reportData.photos = uploadedPaths
      }
      await db.saveDailyReport(project.id, reportData)

      // Save custom trade-specific fields
      if (Object.keys(customFieldValues).length > 0) {
        await db.saveCustomFieldData(project.id, 'daily_report', project.id, customFieldValues)
      }

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
      setSubmitProgress('')
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
        <div style={{ padding: '1rem' }}>
          <CardSkeleton />
          <CardSkeleton />
        </div>
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
          <CheckCircle size={16} />
          <span>Report Submitted {new Date(report.submitted_at).toLocaleTimeString()}</span>
        </div>
      )}

      <div className="daily-report-content">
        {/* Summary Cards */}
        <div className="daily-report-summary">
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.crew_list?.length || report.crew_count || 0}</div>
            <div className="daily-report-card-label">Crew on Site</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.completed_tasks?.length || report.tasks_completed || 0}</div>
            <div className="daily-report-card-label">Tasks Done</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{report.tm_tickets_count || 0}</div>
            <div className="daily-report-card-label">Time & Material</div>
          </div>
          <div className="daily-report-card">
            <div className="daily-report-card-value">{(report.photos_count || 0) + photos.length}</div>
            <div className="daily-report-card-label">Photos</div>
          </div>
        </div>

        {/* Crew List - grouped by class/role */}
        {report.crew_list?.length > 0 && (
          <div className="daily-report-section">
            <h3><HardHat size={18} className="inline-icon" /> Crew</h3>
            <div className="daily-report-crew">
              {(() => {
                // Group workers by role/class type
                const groups = {}
                report.crew_list.forEach(worker => {
                  const role = worker.role || 'Other'
                  if (!groups[role]) groups[role] = []
                  groups[role].push(worker)
                })
                return Object.entries(groups).map(([role, workers]) => (
                  <div key={role} className="daily-report-crew-group">
                    <div className="daily-report-crew-group-header">
                      <span className="daily-report-crew-group-name">{role}</span>
                      <span className="daily-report-crew-group-count">{workers.length}</span>
                    </div>
                    {workers.map((worker, i) => (
                      <div key={i} className="daily-report-crew-item">
                        <span>{worker.name}</span>
                      </div>
                    ))}
                  </div>
                ))
              })()}
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

        {/* Photos Section */}
        <div className="daily-report-section">
          <h3><Camera size={18} className="inline-icon" /> Site Photos</h3>

          {photos.length > 0 && (
            <div className="dr-photo-grid">
              {photos.map(photo => (
                <div key={photo.id} className="dr-photo-thumb">
                  <img src={photo.previewUrl} alt={photo.name} />
                  {!isSubmitted && (
                    <button
                      className="dr-photo-remove"
                      onClick={() => removePhoto(photo.id)}
                      aria-label="Remove photo"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isSubmitted && (
            <label className="dr-photo-add-btn">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoAdd}
                style={{ display: 'none' }}
                disabled={uploadingPhotos}
              />
              {uploadingPhotos ? (
                <span className="dr-photo-add-label">Processing...</span>
              ) : (
                <>
                  <ImagePlus size={20} />
                  <span className="dr-photo-add-label">
                    {photos.length > 0 ? 'Add More Photos' : 'Tap to Add Photos'}
                  </span>
                  <span className="dr-photo-add-hint">Progress, work completed, issues</span>
                </>
              )}
            </label>
          )}

          {isSubmitted && photos.length === 0 && (report.photos_count || 0) === 0 && (
            <p className="dr-photo-empty">No photos attached</p>
          )}
        </div>

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

        {/* Trade-Specific Custom Fields */}
        <CustomFieldSection
          ref={customFieldRef}
          formType="daily_report"
          projectId={project.id}
          entityId={report?.id}
          values={customFieldValues}
          onChange={setCustomFieldValues}
          disabled={isSubmitted}
        />
      </div>

      {/* Submit Button */}
      {!isSubmitted && (
        <div className="daily-report-footer">
          <button 
            className="btn btn-primary daily-report-submit"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (submitProgress || 'Submitting...') : <><Upload size={16} className="inline-icon" /> Submit Report</>}
          </button>
          <p className="daily-report-hint">This will be sent to the office</p>
        </div>
      )}
    </div>
  )
}
