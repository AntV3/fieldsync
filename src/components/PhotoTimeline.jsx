import { useState, useEffect, useMemo, useCallback } from 'react'
import { Camera, ChevronDown, Calendar, MapPin, Filter, X, ZoomIn, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { isSupabaseConfigured, getSupabaseClient, db } from '../lib/supabase'

/**
 * PhotoTimeline - Visual progress photo timeline organized by area and date.
 * Shows construction progress documentation for disputes, owner reports, and team review.
 * Uses a date dropdown to keep the overview page compact.
 */
export default function PhotoTimeline({ projectId, areas = [], onShowToast }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedArea, setSelectedArea] = useState('all')
  const [selectedDate, setSelectedDate] = useState(null)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [downloading, setDownloading] = useState(false)

  // Load photos for the project
  const loadPhotos = useCallback(async () => {
    if (!projectId || !isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      // Get photos from T&M tickets and daily reports
      // t_and_m_tickets.photos requires migration 20260227_fix_project_cascade_delete
      // daily_reports.photos requires migration 20260227_daily_reports_photos
      const client = getSupabaseClient()
      const [tmResult, reportResult] = await Promise.allSettled([
        client
          .from('t_and_m_tickets')
          .select('id, work_date, notes, photos')
          .eq('project_id', projectId)
          .order('work_date', { ascending: false }),
        client
          .from('daily_reports')
          .select('id, report_date, field_notes, photos')
          .eq('project_id', projectId)
          .order('report_date', { ascending: false })
      ])

      const allPhotos = []

      // Process T&M ticket photos
      const tmData = tmResult.status === 'fulfilled' ? tmResult.value.data : null
      if (tmData) {
        for (const ticket of tmData) {
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

      // Process daily report photos (requires migration 20260227_daily_reports_photos.sql)
      const reportData = reportResult.status === 'fulfilled' ? reportResult.value.data : null
      if (reportData) {
        for (const report of reportData) {
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

      // Resolve stored paths/public URLs to signed URLs (bucket is now private)
      const rawUrls = allPhotos.map(p => p.url)
      const signedUrls = await db.resolvePhotoUrls(rawUrls)
      signedUrls.forEach((signed, i) => { allPhotos[i].url = signed })

      const validPhotos = allPhotos.filter(p => p.url)
      setPhotos(validPhotos)

      // Auto-select the most recent date
      if (validPhotos.length > 0) {
        const dates = [...new Set(validPhotos.map(p => p.date))].sort((a, b) => b.localeCompare(a))
        setSelectedDate(dates[0])
      }
    } catch (err) {
      console.error('Error loading photos:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  // Filter photos by selected area
  const filteredPhotos = useMemo(() => {
    if (selectedArea === 'all') return photos
    return photos.filter(p => p.areaId === selectedArea)
  }, [photos, selectedArea])

  // Get unique dates sorted descending
  const availableDates = useMemo(() => {
    const dates = [...new Set(filteredPhotos.map(p => p.date))]
    return dates.sort((a, b) => b.localeCompare(a))
  }, [filteredPhotos])

  // Photos for the selected date
  const selectedDatePhotos = useMemo(() => {
    if (!selectedDate) return []
    return filteredPhotos.filter(p => p.date === selectedDate)
  }, [filteredPhotos, selectedDate])

  // All photos in flat list for lightbox navigation (scoped to selected date)
  const flatPhotos = useMemo(() => selectedDatePhotos, [selectedDatePhotos])

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

  // Download all photos for the selected date
  const downloadSelectedPhotos = async () => {
    if (selectedDatePhotos.length === 0 || downloading) return

    setDownloading(true)
    try {
      for (const photo of selectedDatePhotos) {
        const response = await fetch(photo.url)
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

  // When area filter changes, ensure selectedDate is still valid
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
        <div className="photo-timeline-loading">Loading photos...</div>
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
      </div>

      {filteredPhotos.length === 0 ? (
        <div className="photo-timeline-empty">
          <Camera size={32} style={{ opacity: 0.3 }} />
          <p>No photos yet</p>
          <span>Photos from T&M tickets and daily reports will appear here</span>
        </div>
      ) : (
        <div className="photo-timeline-body">
          {/* Date selector row */}
          <div className="photo-date-selector-row">
            <div className="photo-date-selector">
              <Calendar size={14} />
              <select
                value={selectedDate || ''}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="photo-date-select"
              >
                {availableDates.map(date => (
                  <option key={date} value={date}>
                    {formatDateShort(date)} ({filteredPhotos.filter(p => p.date === date).length} photo{filteredPhotos.filter(p => p.date === date).length !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="photo-date-chevron" />
            </div>

            <div className="photo-date-actions">
              <span className="photo-date-showing">
                {selectedDatePhotos.length} photo{selectedDatePhotos.length !== 1 ? 's' : ''}
              </span>
              <button
                className="photo-download-btn"
                onClick={downloadSelectedPhotos}
                disabled={downloading || selectedDatePhotos.length === 0}
                title={`Download ${selectedDatePhotos.length} photo${selectedDatePhotos.length !== 1 ? 's' : ''}`}
              >
                <Download size={14} />
                {downloading ? 'Downloading...' : 'Download'}
              </button>
            </div>
          </div>

          {/* Photo grid for selected date */}
          <div className="photo-grid">
            {selectedDatePhotos.map(photo => (
              <div
                key={photo.id}
                className="photo-grid-item"
                onClick={() => openLightbox(photo)}
              >
                <img
                  src={photo.url}
                  alt={photo.description || 'Project photo'}
                  loading="lazy"
                />
                <div className="photo-grid-overlay">
                  <ZoomIn size={16} />
                </div>
                <div className="photo-grid-meta">
                  <span className="photo-source-badge">{photo.source}</span>
                  {getAreaName(photo.areaId) && (
                    <span className="photo-area-badge">
                      <MapPin size={10} />
                      {getAreaName(photo.areaId)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Date count summary */}
          {availableDates.length > 1 && (
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
