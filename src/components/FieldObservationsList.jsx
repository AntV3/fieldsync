import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  NotebookPen, Calendar, Camera, MapPin, Clock, Download,
  ChevronDown, ChevronRight, Filter, User
} from 'lucide-react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'

export default function FieldObservationsList({ project, company, onShowToast }) {
  const { branding } = useBranding()
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [photoUrls, setPhotoUrls] = useState({})
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (project?.id) loadObservations()
  }, [project?.id])

  useEffect(() => {
    if (!project?.id) return
    const sub = db.subscribeToFieldObservations?.(project.id, () => loadObservations())
    return () => { if (sub) db.unsubscribe?.(sub) }
  }, [project?.id])

  const loadObservations = useCallback(async () => {
    try {
      const data = await db.getFieldObservations(project.id, { limit: 1000 })
      setObservations(data || [])
    } catch (err) {
      console.error('Error loading field observations:', err)
      onShowToast?.('Error loading observations', 'error')
    } finally {
      setLoading(false)
    }
  }, [project?.id, onShowToast])

  // Resolve signed URLs when a row is expanded
  useEffect(() => {
    if (!expanded) return
    const obs = observations.find(o => o.id === expanded)
    if (!obs?.photos?.length || photoUrls[expanded]) return
    db.resolvePhotoUrls(obs.photos).then(urls => {
      setPhotoUrls(prev => ({ ...prev, [expanded]: urls }))
    }).catch(err => console.error('Error resolving photos:', err))
  }, [expanded, observations, photoUrls])

  const filtered = useMemo(() => {
    let list = [...observations]
    if (dateFilter.start) list = list.filter(o => o.observation_date >= dateFilter.start)
    if (dateFilter.end) list = list.filter(o => o.observation_date <= dateFilter.end)
    return list
  }, [observations, dateFilter])

  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach(o => {
      const key = o.observation_date
      if (!groups[key]) groups[key] = []
      groups[key].push(o)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  const totalPhotos = useMemo(
    () => filtered.reduce((s, o) => s + (o.photos?.length || 0), 0),
    [filtered]
  )

  const formatDate = (iso) => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }
  const formatTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const handleExport = async () => {
    if (filtered.length === 0) {
      onShowToast?.('No observations to export', 'error')
      return
    }

    setExporting(true)
    onShowToast?.('Generating PDF...', 'info')
    try {
      const { generateFieldObservationsPDF } = await import('../lib/fieldObservationsPdfGenerator')
      const result = await generateFieldObservationsPDF(filtered, {
        project,
        company,
        branding: {
          primaryColor: branding?.primary_color,
          logoUrl: branding?.logo_url
        },
        dateRange: dateFilter
      })
      if (result?.success) {
        onShowToast?.(`Exported ${result.observationCount} observations`, 'success')
      }
    } catch (err) {
      console.error('Export failed:', err)
      onShowToast?.('Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fol-container">
      <div className="fol-toolbar">
        <div className="fol-stats">
          <span className="fol-stat">
            <NotebookPen size={14} />
            <strong>{filtered.length}</strong> observation{filtered.length !== 1 ? 's' : ''}
          </span>
          {totalPhotos > 0 && (
            <span className="fol-stat">
              <Camera size={14} />
              <strong>{totalPhotos}</strong> photo{totalPhotos !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="fol-actions">
          <button
            className={`fol-btn fol-btn-secondary ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14} />
            <span>Filter</span>
          </button>
          <button
            className="fol-btn fol-btn-primary"
            onClick={handleExport}
            disabled={exporting || filtered.length === 0}
          >
            <Download size={14} />
            <span>{exporting ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="fol-filters">
          <label className="fol-filter">
            <span>From</span>
            <input
              type="date"
              value={dateFilter.start}
              onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
            />
          </label>
          <label className="fol-filter">
            <span>To</span>
            <input
              type="date"
              value={dateFilter.end}
              onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
            />
          </label>
          {(dateFilter.start || dateFilter.end) && (
            <button
              className="fol-btn fol-btn-ghost"
              onClick={() => setDateFilter({ start: '', end: '' })}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="fol-loading">Loading observations...</div>
      ) : filtered.length === 0 ? (
        <div className="fol-empty">
          <NotebookPen size={32} />
          <p>{observations.length === 0 ? 'No field observations yet' : 'No observations match your filters'}</p>
          {observations.length === 0 && (
            <span>Foremen can log observations from the field view</span>
          )}
        </div>
      ) : (
        <div className="fol-groups">
          {grouped.map(([date, list]) => (
            <div key={date} className="fol-group">
              <div className="fol-group-header">
                <Calendar size={14} />
                <span>{formatDate(date)}</span>
                <span className="fol-group-count">{list.length}</span>
              </div>
              <div className="fol-group-items">
                {list.map(obs => {
                  const isExpanded = expanded === obs.id
                  const urls = photoUrls[obs.id]
                  return (
                    <div key={obs.id} className="fol-item">
                      <button
                        className="fol-item-header"
                        onClick={() => setExpanded(isExpanded ? null : obs.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Clock size={12} />
                        <span className="fol-item-time">{formatTime(obs.observed_at)}</span>
                        {obs.foreman_name && (
                          <span className="fol-item-by">
                            <User size={12} /> {obs.foreman_name}
                          </span>
                        )}
                        {obs.location && (
                          <span className="fol-item-loc">
                            <MapPin size={12} /> {obs.location}
                          </span>
                        )}
                        {obs.photos?.length > 0 && (
                          <span className="fol-item-photos">
                            <Camera size={12} /> {obs.photos.length}
                          </span>
                        )}
                      </button>
                      <div className="fol-item-desc">{obs.description}</div>
                      {isExpanded && obs.photos?.length > 0 && (
                        <div className="fol-photo-grid">
                          {urls ? (
                            urls.map((url, i) => (
                              url ? (
                                <a key={i} href={url} target="_blank" rel="noreferrer" className="fol-photo">
                                  <img src={url} alt={`Photo ${i + 1}`} />
                                </a>
                              ) : (
                                <div key={i} className="fol-photo fol-photo-missing">
                                  <span>Unavailable</span>
                                </div>
                              )
                            ))
                          ) : (
                            <div className="fol-photo-loading">Loading photos...</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .fol-container { display: flex; flex-direction: column; gap: 0.75rem; }

        .fol-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
          padding: 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
        }
        .fol-stats { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; color: var(--text-secondary); font-size: 0.85rem; }
        .fol-stat { display: inline-flex; align-items: center; gap: 0.35rem; }
        .fol-stat strong { color: var(--text-primary); font-weight: 700; }

        .fol-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .fol-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-primary);
          transition: all 0.15s ease;
        }
        .fol-btn:hover:not(:disabled) { border-color: var(--primary-color, #3b82f6); }
        .fol-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .fol-btn-primary { background: var(--primary-color, #3b82f6); color: white; border-color: transparent; }
        .fol-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
        .fol-btn-secondary.active { background: var(--bg-elevated); border-color: var(--primary-color, #3b82f6); color: var(--primary-color, #3b82f6); }
        .fol-btn-ghost { background: transparent; border-color: transparent; color: var(--text-secondary); }

        .fol-filters {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          flex-wrap: wrap;
        }
        .fol-filter { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: var(--text-secondary); }
        .fol-filter input {
          padding: 0.4rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: var(--bg-primary, var(--bg-card));
          color: var(--text-primary);
          font-size: 0.85rem;
        }

        .fol-groups { display: flex; flex-direction: column; gap: 0.5rem; }
        .fol-group {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          overflow: hidden;
        }
        .fol-group-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 0.9rem;
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-primary);
          background: var(--bg-elevated, rgba(0,0,0,0.02));
          border-bottom: 1px solid var(--border-color);
        }
        .fol-group-count {
          margin-left: auto;
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-secondary);
          background: var(--bg-card);
          padding: 0.15rem 0.5rem;
          border-radius: 10px;
        }

        .fol-group-items { display: flex; flex-direction: column; }
        .fol-item { padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--border-color); }
        .fol-item:last-child { border-bottom: none; }

        .fol-item-header {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          width: 100%;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 0.78rem;
          flex-wrap: wrap;
        }
        .fol-item-time { color: var(--text-primary); font-weight: 700; }
        .fol-item-by, .fol-item-loc, .fol-item-photos {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        .fol-item-photos { color: var(--primary-color, #3b82f6); }

        .fol-item-desc {
          margin: 0.35rem 0 0;
          padding-left: 18px;
          font-size: 0.9rem;
          color: var(--text-primary);
          white-space: pre-wrap;
          word-wrap: break-word;
          line-height: 1.45;
        }

        .fol-photo-grid {
          margin: 0.5rem 0 0.25rem 18px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
          gap: 0.4rem;
        }
        .fol-photo {
          display: block;
          aspect-ratio: 1;
          border-radius: 6px;
          overflow: hidden;
          background: var(--bg-elevated);
        }
        .fol-photo img { width: 100%; height: 100%; object-fit: cover; }
        .fol-photo-missing {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          color: var(--text-secondary);
        }
        .fol-photo-loading { font-size: 0.8rem; color: var(--text-secondary); padding: 0.5rem; }

        .fol-loading, .fol-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          color: var(--text-secondary);
          text-align: center;
          gap: 0.25rem;
        }
        .fol-empty svg { opacity: 0.4; margin-bottom: 0.5rem; }
        .fol-empty p { font-weight: 600; color: var(--text-primary); margin: 0; }
        .fol-empty span { font-size: 0.85rem; }
      `}</style>
    </div>
  )
}
