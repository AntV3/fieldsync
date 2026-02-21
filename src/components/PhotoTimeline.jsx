import { useState, useEffect, useMemo, useCallback } from 'react'
import { Camera, ChevronDown, ChevronUp, Calendar, MapPin, Filter, X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase, isSupabaseConfigured, db } from '../lib/supabase'

/**
 * PhotoTimeline - Visual progress photo timeline organized by area and date.
 * Shows construction progress documentation for disputes, owner reports, and team review.
 */
export default function PhotoTimeline({ projectId, areas = [], onShowToast }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedArea, setSelectedArea] = useState('all')
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [expandedDates, setExpandedDates] = useState(new Set())

  // Load photos for the project
  const loadPhotos = useCallback(async () => {
    if (!projectId || !isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      // Get photos from T&M tickets (daily_reports does not have a photos column)
      const tmResult = await supabase
        .from('t_and_m_tickets')
        .select('id, work_date, description, photos, area_id')
        .eq('project_id', projectId)
        .not('photos', 'is', null)
        .order('work_date', { ascending: false })

      const allPhotos = []

      // Process T&M ticket photos
      if (tmResult.data) {
        for (const ticket of tmResult.data) {
          const photoUrls = Array.isArray(ticket.photos) ? ticket.photos : []
          for (const url of photoUrls) {
            if (url) {
              allPhotos.push({
                id: `tm-${ticket.id}-${allPhotos.length}`,
                url,
                date: ticket.work_date,
                source: 'T&M Ticket',
                description: ticket.description,
                areaId: ticket.area_id
              })
            }
          }
        }
      }

      // Resolve stored paths/public URLs to signed URLs (bucket is now private)
      const rawUrls = allPhotos.map(p => p.url)
      const signedUrls = await db.resolvePhotoUrls(rawUrls)
      signedUrls.forEach((signed, i) => { allPhotos[i].url = signed })

      setPhotos(allPhotos)

      // Auto-expand the most recent date
      if (allPhotos.length > 0) {
        setExpandedDates(new Set([allPhotos[0].date]))
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

  // Group photos by date
  const photosByDate = useMemo(() => {
    const groups = {}
    for (const photo of filteredPhotos) {
      if (!groups[photo.date]) {
        groups[photo.date] = []
      }
      groups[photo.date].push(photo)
    }
    // Return sorted by date descending
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
  }, [filteredPhotos])

  // All photos in flat list for lightbox navigation
  const flatPhotos = useMemo(() => filteredPhotos, [filteredPhotos])

  const toggleDate = (date) => {
    setExpandedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

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

  const getAreaName = (areaId) => {
    if (!areaId) return null
    const area = areas.find(a => a.id === areaId)
    return area?.name || null
  }

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
        <div className="photo-timeline-dates">
          {photosByDate.map(([date, datePhotos]) => (
            <div key={date} className="photo-date-group">
              <button
                className="photo-date-header"
                onClick={() => toggleDate(date)}
              >
                <div className="photo-date-info">
                  <Calendar size={14} />
                  <span className="photo-date-label">{formatDate(date)}</span>
                  <span className="photo-date-count">{datePhotos.length} photo{datePhotos.length !== 1 ? 's' : ''}</span>
                </div>
                {expandedDates.has(date) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expandedDates.has(date) && (
                <div className="photo-grid">
                  {datePhotos.map(photo => (
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
              )}
            </div>
          ))}
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
