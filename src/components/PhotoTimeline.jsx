import { useState, useEffect, useMemo, useCallback } from 'react'
import { Camera, ChevronDown, Calendar, MapPin, Filter, X, ZoomIn, ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react'
import { supabase, isSupabaseConfigured, db } from '../lib/supabase'
import { Skeleton } from './ui/Skeleton'
import { EmptyState, ErrorState } from './ui/ErrorState'

/**
 * PhotoTimeline - Visual progress photo timeline organized by area and date.
 * Shows construction progress documentation for disputes, owner reports, and team review.
 * Uses a date dropdown to keep the overview page compact.
 */
export default function PhotoTimeline({ projectId, projectName, project, company, branding, areas = [], onShowToast }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedArea, setSelectedArea] = useState('all')
  const [selectedDate, setSelectedDate] = useState(null)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [viewMode, setViewMode] = useState('date') // 'date' or 'all'
  const [failedImages, setFailedImages] = useState(new Set())

  // Load photos for the project
  const loadPhotos = useCallback(async () => {
    if (!projectId || !isSupabaseConfigured) {
      setLoading(false)
      return
    }

    setLoadError(null)
    try {
      const [tmResult, reportResult] = await Promise.all([
        supabase
          .from('t_and_m_tickets')
          .select('id, work_date, notes, photos')
          .eq('project_id', projectId)
          .order('work_date', { ascending: false }),
        supabase
          .from('daily_reports')
          .select('id, report_date, field_notes, photos')
          .eq('project_id', projectId)
          .order('report_date', { ascending: false })
      ])

      const allPhotos = []

      if (tmResult.data) {
        for (const ticket of tmResult.data) {
          const photoUrls = Array.isArray(ticket.photos) ? ticket.photos : []
          for (const url of photoUrls) {
            if (url) {
              allPhotos.push({
                id: `tm-${ticket.id}-${allPhotos.length}`,
                url,
                date: ticket.work_date,
                source: 'Time & Material',
                description: ticket.notes,
                areaId: null
              })
            }
          }
        }
      }

      if (reportResult.data) {
        for (const report of reportResult.data) {
          const photoUrls = Array.isArray(report.photos) ? report.photos : []
          for (const url of photoUrls) {
            if (url) {
              allPhotos.push({
                id: `dr-${report.id}-${allPhotos.length}`,
                url,
                date: report.report_date,
                source: 'Daily Report',
                description: report.field_notes,
                areaId: null
              })
            }
          }
        }
      }

      // Resolve stored paths/public URLs to signed URLs
      const rawUrls = allPhotos.map(p => p.url)
      const signedUrls = await db.resolvePhotoUrls(rawUrls)
      signedUrls.forEach((signed, i) => { allPhotos[i].url = signed })

      const validPhotos = allPhotos.filter(p => p.url)
      setPhotos(validPhotos)

      if (validPhotos.length > 0) {
        const dates = [...new Set(validPhotos.map(p => p.date))].sort((a, b) => b.localeCompare(a))
        setSelectedDate(dates[0])
      }
    } catch (err) {
      console.error('Error loading photos:', err)
      setLoadError(err)
      if (onShowToast) {
        onShowToast('Unable to load progress photos', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, onShowToast])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  const filteredPhotos = useMemo(() => {
    if (selectedArea === 'all') return photos
    return photos.filter(p => p.areaId === selectedArea)
  }, [photos, selectedArea])

  const availableDates = useMemo(() => {
    const dates = [...new Set(filteredPhotos.map(p => p.date))]
    return dates.sort((a, b) => b.localeCompare(a))
  }, [filteredPhotos])

  const selectedDatePhotos = useMemo(() => {
    if (!selectedDate) return []
    return filteredPhotos.filter(p => p.date === selectedDate)
  }, [filteredPhotos, selectedDate])

  // Photos grouped by date for 'all' view
  const photosByDate = useMemo(() => {
    const groups = {}
    for (const date of availableDates) {
      groups[date] = filteredPhotos.filter(p => p.date === date)
    }
    return groups
  }, [filteredPhotos, availableDates])

  const displayPhotos = viewMode === 'all' ? filteredPhotos : selectedDatePhotos
  const flatPhotos = displayPhotos

  const openLightbox = (photo) => {
    const idx = flatPhotos.findIndex(p => p.id === photo.id)
    setLightboxIndex(idx >= 0 ? idx : 0)
    setLightboxPhoto(photo)
  }

  const closeLightbox = () => setLightboxPhoto(null)

  const navigateLightbox = (direction) => {
    const newIndex = lightboxIndex + direction
    if (newIndex >= 0 && newIndex < flatPhotos.length) {
      setLightboxIndex(newIndex)
      setLightboxPhoto(flatPhotos[newIndex])
    }
  }

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (!lightboxPhoto) return
    const handleKey = (e) => {
      if (e.key === 'Escape') closeLightbox()
      else if (e.key === 'ArrowLeft') navigateLightbox(-1)
      else if (e.key === 'ArrowRight') navigateLightbox(1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxPhoto, lightboxIndex, flatPhotos.length])

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDateShort = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getAreaName = (areaId) => {
    if (!areaId) return null
    const area = areas.find(a => a.id === areaId)
    return area?.name || null
  }

  const handleImageError = (photoId) => {
    setFailedImages(prev => new Set(prev).add(photoId))
  }

  // Download all photos for the selected date
  const downloadSelectedPhotos = async () => {
    if (selectedDatePhotos.length === 0 || downloading) return

    setDownloading(true)
    try {
      for (const photo of selectedDatePhotos) {
        const response = await fetch(photo.url)
        if (!response.ok) throw new Error(`Failed to download photo: ${response.status}`)
        const blob = await response.blob()
        const ext = blob.type.includes('png') ? 'png' : 'jpg'
        const filename = `progress-photo_${selectedDate}_${photo.id}.${ext}`

        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(link.href)
      }
      if (onShowToast) {
        onShowToast(`Downloaded ${selectedDatePhotos.length} photo${selectedDatePhotos.length !== 1 ? 's' : ''}`, 'success')
      }
    } catch (err) {
      console.error('Error downloading photos:', err)
      if (onShowToast) {
        onShowToast('Failed to download photos', 'error')
      }
    } finally {
      setDownloading(false)
    }
  }

  // Export progress photos as a professional PDF document
  const exportPhotosPDF = async () => {
    if (filteredPhotos.length === 0 || exporting) return

    setExporting(true)
    try {
      const { exportProgressPhotosPDF } = await import('../lib/progressPhotoExport')
      await exportProgressPhotosPDF({
        photos: filteredPhotos,
        photosByDate,
        availableDates,
        projectName: projectName || 'Project',
        project,
        company,
        branding,
        areas,
        getAreaName,
      })
      if (onShowToast) {
        onShowToast('Progress photos report exported', 'success')
      }
    } catch (err) {
      console.error('Error exporting photos PDF:', err)
      if (onShowToast) {
        onShowToast('Failed to export photos report', 'error')
      }
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0])
    }
  }, [availableDates, selectedDate])

  if (loading) {
    return (
      <div className="photo-timeline-card">
        <div className="photo-timeline-header">
          <Camera size={18} />
          <h3>Progress Photos</h3>
        </div>
        <div className="photo-grid photo-grid-skeleton" aria-busy="true" aria-label="Loading progress photos">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="140px" borderRadius="8px" />
          ))}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="photo-timeline-card">
        <div className="photo-timeline-header">
          <Camera size={18} />
          <h3>Progress Photos</h3>
        </div>
        <ErrorState
          title="Couldn't load photos"
          message="We hit a snag pulling progress photos from the server."
          error={loadError}
          onRetry={loadPhotos}
        />
      </div>
    )
  }

  return (
    <div className="photo-timeline-card">
      <div className="photo-timeline-header">
        <div className="photo-timeline-title">
          <Camera size={18} />
          <h3>Progress Photos</h3>
          <span className="photo-count-badge">{filteredPhotos.length}</span>
        </div>

        <div className="photo-header-actions">
          {/* Area filter */}
          {areas.length > 0 && (
            <div className="photo-area-filter">
              <Filter size={14} />
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="photo-area-select"
              >
                <option value="all">All Areas</option>
                {areas.map(area => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Export PDF button */}
          {filteredPhotos.length > 0 && (
            <button
              className="photo-export-btn"
              onClick={exportPhotosPDF}
              disabled={exporting}
              title="Export progress photos as PDF report"
            >
              <FileText size={14} />
              {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
          )}
        </div>
      </div>

      {filteredPhotos.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No photos yet"
          message="Photos from Time & Material tickets and daily reports will appear here once your crew starts capturing them."
        />
      ) : (
        <div className="photo-timeline-body">
          {/* Controls row */}
          <div className="photo-date-selector-row">
            <div className="photo-controls-left">
              {/* View mode toggle */}
              <div className="photo-view-toggle">
                <button
                  className={`photo-view-btn ${viewMode === 'date' ? 'active' : ''}`}
                  onClick={() => setViewMode('date')}
                >
                  By Date
                </button>
                <button
                  className={`photo-view-btn ${viewMode === 'all' ? 'active' : ''}`}
                  onClick={() => setViewMode('all')}
                >
                  All Photos
                </button>
              </div>

              {/* Date selector (only in date view) */}
              {viewMode === 'date' && (
                <div className="photo-date-selector">
                  <Calendar size={14} />
                  <select
                    value={selectedDate || ''}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="photo-date-select"
                  >
                    {availableDates.map(date => (
                      <option key={date} value={date}>
                        {formatDateShort(date)} ({filteredPhotos.filter(p => p.date === date).length})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="photo-date-chevron" />
                </div>
              )}
            </div>

            <div className="photo-date-actions">
              <span className="photo-date-showing">
                {viewMode === 'date'
                  ? `${selectedDatePhotos.length} photo${selectedDatePhotos.length !== 1 ? 's' : ''}`
                  : `${filteredPhotos.length} total`
                }
              </span>
              {viewMode === 'date' && (
                <button
                  className="photo-download-btn"
                  onClick={downloadSelectedPhotos}
                  disabled={downloading || selectedDatePhotos.length === 0}
                  title={`Download ${selectedDatePhotos.length} photo${selectedDatePhotos.length !== 1 ? 's' : ''}`}
                >
                  <Download size={14} />
                  {downloading ? 'Downloading...' : 'Download'}
                </button>
              )}
            </div>
          </div>

          {/* Photo display */}
          {viewMode === 'date' ? (
            // Single date grid
            <div className="photo-grid">
              {selectedDatePhotos.map(photo => (
                <div
                  key={photo.id}
                  className="photo-grid-item"
                  role="button"
                  tabIndex={0}
                  aria-label={photo.description ? `Open photo: ${photo.description}` : `Open ${photo.source} photo from ${formatDateShort(photo.date)}`}
                  onClick={() => openLightbox(photo)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openLightbox(photo)
                    }
                  }}
                >
                  {failedImages.has(photo.id) ? (
                    <div className="photo-grid-placeholder">
                      <Camera size={20} aria-hidden="true" />
                      <span>Unable to load</span>
                    </div>
                  ) : (
                    <img
                      src={photo.url}
                      alt={photo.description || 'Project photo'}
                      loading="lazy"
                      onError={() => handleImageError(photo.id)}
                    />
                  )}
                  <div className="photo-grid-overlay" aria-hidden="true">
                    <ZoomIn size={18} />
                  </div>
                  <div className="photo-grid-meta">
                    <span className="photo-source-badge">{photo.source}</span>
                    {getAreaName(photo.areaId) && (
                      <span className="photo-area-badge">
                        <MapPin size={10} aria-hidden="true" />
                        {getAreaName(photo.areaId)}
                      </span>
                    )}
                  </div>
                  {photo.description && (
                    <div className="photo-grid-description">
                      <p>{photo.description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // All dates grouped view
            <div className="photo-all-dates">
              {availableDates.map(date => (
                <div key={date} className="photo-date-group">
                  <div className="photo-date-group-header">
                    <Calendar size={14} aria-hidden="true" />
                    <span className="photo-date-group-label">{formatDate(date)}</span>
                    <span className="photo-date-group-count">{photosByDate[date]?.length || 0}</span>
                  </div>
                  <div className="photo-grid">
                    {(photosByDate[date] || []).map(photo => (
                      <div
                        key={photo.id}
                        className="photo-grid-item"
                        role="button"
                        tabIndex={0}
                        aria-label={photo.description ? `Open photo: ${photo.description}` : `Open ${photo.source} photo from ${formatDateShort(photo.date)}`}
                        onClick={() => openLightbox(photo)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openLightbox(photo)
                          }
                        }}
                      >
                        {failedImages.has(photo.id) ? (
                          <div className="photo-grid-placeholder">
                            <Camera size={20} aria-hidden="true" />
                            <span>Unable to load</span>
                          </div>
                        ) : (
                          <img
                            src={photo.url}
                            alt={photo.description || 'Project photo'}
                            loading="lazy"
                            onError={() => handleImageError(photo.id)}
                          />
                        )}
                        <div className="photo-grid-overlay" aria-hidden="true">
                          <ZoomIn size={18} />
                        </div>
                        <div className="photo-grid-meta">
                          <span className="photo-source-badge">{photo.source}</span>
                          {getAreaName(photo.areaId) && (
                            <span className="photo-area-badge">
                              <MapPin size={10} aria-hidden="true" />
                              {getAreaName(photo.areaId)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Date count summary */}
          {viewMode === 'date' && availableDates.length > 1 && (
            <div className="photo-dates-summary">
              {availableDates.length} date{availableDates.length !== 1 ? 's' : ''} with photos
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div className="photo-lightbox" onClick={closeLightbox}>
          <div className="photo-lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="photo-lightbox-close" onClick={closeLightbox}>
              <X size={24} />
            </button>

            {lightboxIndex > 0 && (
              <button className="photo-lightbox-nav prev" onClick={() => navigateLightbox(-1)}>
                <ChevronLeft size={24} />
              </button>
            )}

            <img src={lightboxPhoto.url} alt={lightboxPhoto.description || 'Project photo'} />

            {lightboxIndex < flatPhotos.length - 1 && (
              <button className="photo-lightbox-nav next" onClick={() => navigateLightbox(1)}>
                <ChevronRight size={24} />
              </button>
            )}

            <div className="photo-lightbox-info">
              <div className="photo-lightbox-date">{formatDate(lightboxPhoto.date)}</div>
              <div className="photo-lightbox-source">{lightboxPhoto.source}</div>
              {getAreaName(lightboxPhoto.areaId) && (
                <div className="photo-lightbox-area">
                  <MapPin size={12} />
                  {getAreaName(lightboxPhoto.areaId)}
                </div>
              )}
              {lightboxPhoto.description && (
                <div className="photo-lightbox-desc">{lightboxPhoto.description}</div>
              )}
              <div className="photo-lightbox-counter">{lightboxIndex + 1} / {flatPhotos.length}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
