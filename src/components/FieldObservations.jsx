import { useState, useEffect, useRef } from 'react'
import {
  Camera, X, Save, MapPin, Clock, FileText, Plus, Image as ImageIcon,
  Trash2, ChevronDown, ChevronUp
} from 'lucide-react'
import { db } from '../lib/supabase'
import { compressImage } from '../lib/imageUtils'

export default function FieldObservations({ project, companyId, foremanName, onShowToast }) {
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [photos, setPhotos] = useState([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [photoUrls, setPhotoUrls] = useState({})
  const [showRecent, setShowRecent] = useState(true)

  const photosRef = useRef(photos)
  photosRef.current = photos

  useEffect(() => {
    if (project?.id) loadEntries()
  }, [project?.id])

  useEffect(() => {
    return () => {
      photosRef.current.forEach(p => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })
    }
  }, [])

  // Realtime: pick up office edits and other foremen's entries
  useEffect(() => {
    if (!project?.id) return
    const sub = db.subscribeToFieldObservations?.(project.id, () => loadEntries())
    return () => {
      if (sub) db.unsubscribe?.(sub)
    }
  }, [project?.id])

  const loadEntries = async () => {
    try {
      const data = await db.getFieldObservations(project.id, { limit: 50 })
      setEntries(data || [])
    } catch (err) {
      console.error('Error loading observations:', err)
      onShowToast?.('Error loading observations', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Lazy-load signed URLs when an entry is expanded
  useEffect(() => {
    if (!expanded) return
    const entry = entries.find(e => e.id === expanded)
    if (!entry?.photos?.length || photoUrls[expanded]) return
    db.resolvePhotoUrls(entry.photos).then(urls => {
      setPhotoUrls(prev => ({ ...prev, [expanded]: urls.filter(Boolean) }))
    }).catch(err => console.error('Error resolving photo URLs:', err))
  }, [expanded, entries, photoUrls])

  const handlePhotoAdd = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setUploadingPhotos(true)
    try {
      const imageFiles = files.filter(f => f.type.startsWith('image/'))
      const compressed = await Promise.all(imageFiles.map(f => compressImage(f)))
      const newPhotos = compressed.map((file, i) => ({
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        name: imageFiles[i].name
      }))
      setPhotos(prev => [...prev, ...newPhotos])
    } catch (err) {
      console.error('Error adding photos:', err)
      onShowToast?.('Error adding photos', 'error')
    } finally {
      setUploadingPhotos(false)
      e.target.value = ''
    }
  }

  const removePhoto = (id) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id)
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl)
      return prev.filter(p => p.id !== id)
    })
  }

  const resetForm = () => {
    photos.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl) })
    setDescription('')
    setLocation('')
    setPhotos([])
  }

  const handleSave = async () => {
    if (!description.trim()) {
      onShowToast?.('Please enter a description', 'error')
      return
    }
    if (!companyId) {
      onShowToast?.('Missing company context', 'error')
      return
    }

    setSaving(true)
    try {
      // Upload photos first (batches of 3)
      const uploadedPaths = []
      const photosWithFiles = photos.filter(p => p.file)
      const BATCH_SIZE = 3
      for (let i = 0; i < photosWithFiles.length; i += BATCH_SIZE) {
        const batch = photosWithFiles.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(photo =>
            db.uploadPhoto(companyId, project.id, `obs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, photo.file)
          )
        )
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value) uploadedPaths.push(r.value)
          else if (r.status === 'rejected') console.error('Photo upload failed:', r.reason)
        })
      }

      await db.addFieldObservation(project.id, companyId, {
        description: description.trim(),
        location: location.trim() || null,
        photos: uploadedPaths,
        foremanName: foremanName || null
      })

      resetForm()
      await loadEntries()
      onShowToast?.('Observation saved', 'success')
    } catch (err) {
      console.error('Error saving observation:', err)
      const msg = err?.code === '42501' ? 'Session expired — please re-enter your PIN'
        : 'Error saving observation'
      onShowToast?.(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (iso) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const formatDateLabel = (iso) => {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Group entries by observation date
  const grouped = entries.reduce((acc, e) => {
    const key = e.observation_date
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})
  const groupKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="fo-container">
      <div className="fo-intro">
        <FileText size={16} />
        <span>Log what you observe on site — photos and a description are enough. Timestamp is automatic.</span>
      </div>

      {/* Entry form */}
      <div className="fo-form-card">
        <label className="fo-label">
          <span>Description</span>
          <textarea
            className="fo-textarea"
            placeholder="Describe what you're seeing or the work being performed..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={saving}
          />
        </label>

        <label className="fo-label">
          <span className="fo-label-with-icon"><MapPin size={14} /> Location <span className="fo-optional">(optional)</span></span>
          <input
            type="text"
            className="fo-input"
            placeholder="e.g. North wall, Bay 3, Column line B"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={saving}
          />
        </label>

        {/* Photos */}
        <div className="fo-photos-section">
          <div className="fo-label">
            <span className="fo-label-with-icon">
              <Camera size={14} /> Photos
              {photos.length > 0 && <span className="fo-count">({photos.length})</span>}
            </span>
          </div>

          {photos.length > 0 && (
            <div className="fo-photo-grid">
              {photos.map(photo => (
                <div key={photo.id} className="fo-photo-thumb">
                  <img src={photo.previewUrl} alt={photo.name} />
                  <button
                    type="button"
                    className="fo-photo-remove"
                    onClick={() => removePhoto(photo.id)}
                    disabled={saving}
                    aria-label="Remove photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="fo-photo-add">
            <Camera size={18} />
            <span>{uploadingPhotos ? 'Processing...' : 'Add photos'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handlePhotoAdd}
              disabled={uploadingPhotos || saving}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <button
          className="fo-save-btn"
          onClick={handleSave}
          disabled={saving || !description.trim()}
        >
          <Save size={18} />
          <span>{saving ? 'Saving...' : 'Save observation'}</span>
        </button>
      </div>

      {/* Recent entries */}
      <div className="fo-recent">
        <button
          className="fo-recent-header"
          onClick={() => setShowRecent(!showRecent)}
          aria-expanded={showRecent}
        >
          <span>Recent observations {entries.length > 0 && <span className="fo-count">({entries.length})</span>}</span>
          {showRecent ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showRecent && (
          <div className="fo-recent-content">
            {loading ? (
              <div className="fo-loading">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="fo-empty">
                <ImageIcon size={32} />
                <p>No observations yet</p>
                <span>Save your first observation above</span>
              </div>
            ) : (
              groupKeys.map(date => (
                <div key={date} className="fo-day-group">
                  <div className="fo-day-header">
                    {formatDateLabel(date + 'T12:00:00')}
                  </div>
                  {grouped[date].map(entry => {
                    const isExpanded = expanded === entry.id
                    const signedUrls = photoUrls[entry.id]
                    return (
                      <div key={entry.id} className="fo-entry">
                        <button
                          className="fo-entry-header"
                          onClick={() => setExpanded(isExpanded ? null : entry.id)}
                        >
                          <div className="fo-entry-meta">
                            <Clock size={12} />
                            <span className="fo-entry-time">{formatTime(entry.observed_at)}</span>
                            {entry.foreman_name && <span className="fo-entry-by">· {entry.foreman_name}</span>}
                            {entry.photos?.length > 0 && (
                              <span className="fo-entry-photos">
                                <Camera size={12} /> {entry.photos.length}
                              </span>
                            )}
                          </div>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <div className="fo-entry-preview">{entry.description}</div>
                        {isExpanded && (
                          <div className="fo-entry-expanded">
                            {entry.location && (
                              <div className="fo-entry-location">
                                <MapPin size={12} /> {entry.location}
                              </div>
                            )}
                            {entry.photos?.length > 0 && (
                              <div className="fo-entry-photo-grid">
                                {signedUrls ? (
                                  signedUrls.map((url, i) => (
                                    url ? (
                                      <a key={i} href={url} target="_blank" rel="noreferrer" className="fo-entry-photo">
                                        <img src={url} alt={`Observation ${i + 1}`} />
                                      </a>
                                    ) : (
                                      <div key={i} className="fo-entry-photo fo-entry-photo-missing">
                                        <span>Photo unavailable</span>
                                      </div>
                                    )
                                  ))
                                ) : (
                                  <div className="fo-loading">Loading photos...</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <style>{`
        .fo-container {
          padding: 0 1rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .fo-intro {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          color: var(--text-secondary);
          font-size: 0.82rem;
          line-height: 1.4;
        }
        .fo-intro svg { flex-shrink: 0; margin-top: 2px; color: var(--primary-color, #3b82f6); }

        .fo-form-card {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          padding: 1rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          box-shadow: var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1));
        }

        .fo-label {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .fo-label-with-icon { display: inline-flex; align-items: center; gap: 0.4rem; }
        .fo-optional { font-weight: 400; color: var(--text-secondary); font-size: 0.8rem; }
        .fo-count { font-weight: 500; color: var(--text-secondary); font-size: 0.8rem; }

        .fo-textarea, .fo-input {
          width: 100%;
          padding: 0.75rem;
          background: var(--bg-primary, var(--bg-card));
          border: 1px solid var(--border-color);
          border-radius: 10px;
          font-size: 0.95rem;
          color: var(--text-primary);
          font-family: inherit;
          transition: border-color 0.15s ease;
        }
        .fo-textarea { resize: vertical; min-height: 90px; }
        .fo-textarea:focus, .fo-input:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }

        .fo-photos-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .fo-photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
          gap: 0.5rem;
        }
        .fo-photo-thumb {
          position: relative;
          aspect-ratio: 1;
          border-radius: 8px;
          overflow: hidden;
          background: var(--bg-elevated);
        }
        .fo-photo-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .fo-photo-remove {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: none;
          background: rgba(0,0,0,0.65);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .fo-photo-add {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: var(--bg-primary, transparent);
          border: 1.5px dashed var(--border-color);
          border-radius: 10px;
          cursor: pointer;
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.9rem;
          transition: all 0.15s ease;
        }
        .fo-photo-add:hover { border-color: var(--primary-color, #3b82f6); color: var(--primary-color, #3b82f6); }

        .fo-save-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.9rem 1rem;
          border: none;
          border-radius: 12px;
          background: var(--gradient-blue, linear-gradient(135deg, #3b82f6, #2563eb));
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
          transition: transform 0.15s ease;
        }
        .fo-save-btn:active:not(:disabled) { transform: scale(0.98); }
        .fo-save-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .fo-recent {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          overflow: hidden;
        }
        .fo-recent-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.9rem 1rem;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .fo-recent-content { border-top: 1px solid var(--border-color); }

        .fo-day-group { padding: 0.5rem 0; }
        .fo-day-header {
          padding: 0.5rem 1rem 0.25rem;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .fo-entry {
          padding: 0.6rem 1rem 0.75rem;
          border-bottom: 1px solid var(--border-color);
        }
        .fo-entry:last-child { border-bottom: none; }

        .fo-entry-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 0.78rem;
        }
        .fo-entry-meta { display: inline-flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
        .fo-entry-time { font-weight: 600; color: var(--text-primary); }
        .fo-entry-by { color: var(--text-secondary); }
        .fo-entry-photos { display: inline-flex; align-items: center; gap: 0.2rem; color: var(--primary-color, #3b82f6); }

        .fo-entry-preview {
          margin-top: 0.35rem;
          font-size: 0.92rem;
          color: var(--text-primary);
          line-height: 1.4;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .fo-entry-expanded {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px dashed var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .fo-entry-location {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .fo-entry-photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          gap: 0.4rem;
        }
        .fo-entry-photo {
          display: block;
          aspect-ratio: 1;
          border-radius: 6px;
          overflow: hidden;
          background: var(--bg-elevated);
        }
        .fo-entry-photo img { width: 100%; height: 100%; object-fit: cover; }
        .fo-entry-photo-missing {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          color: var(--text-secondary);
        }

        .fo-empty, .fo-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          color: var(--text-secondary);
          text-align: center;
          gap: 0.25rem;
        }
        .fo-empty svg { opacity: 0.4; margin-bottom: 0.5rem; }
        .fo-empty p { font-weight: 600; color: var(--text-primary); margin: 0; }
        .fo-empty span { font-size: 0.85rem; }
      `}</style>
    </div>
  )
}
