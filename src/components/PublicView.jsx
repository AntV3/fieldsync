import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { db } from '../lib/supabase'
import { useBranding } from '../lib/BrandingContext'
import Logo from './Logo'

export default function PublicView({ shareToken }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const { branding } = useBranding()

  useEffect(() => {
    loadPublicData()
  }, [shareToken])

  const loadPublicData = async () => {
    setLoading(true)
    setError(null)

    try {
      const publicData = await db.getPublicProjectData(shareToken)

      if (!publicData) {
        setError('This share link is invalid or has expired.')
        return
      }

      setData(publicData)
    } catch (err) {
      console.error('Error loading public data:', err)
      setError('Failed to load project data.')
    } finally {
      setLoading(false)
    }
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="public-view">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading project...</p>
        </div>

        <style>{publicViewStyles}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div className="public-view">
        <div className="error-container">
          <div className="error-icon"><AlertTriangle size={48} /></div>
          <h2>{error}</h2>
          <p>Please contact the project owner for a valid link.</p>
        </div>

        <style>{publicViewStyles}</style>
      </div>
    )
  }

  const { share, project, progress, areas, photos, dailyReports, tmTickets } = data

  return (
    <div className="public-view">
      {/* Header */}
      <header className="public-header">
        <div className="container">
          <Logo size="large" />
          <div className="header-meta">
            <span className="last-updated">
              Last updated: {formatDate(project.updated_at || project.created_at)}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="public-main">
        <div className="container">
          {/* Project Title */}
          <div className="project-header">
            <h1>{project.name}</h1>
            {project.address && <p className="project-address">{project.address}</p>}
          </div>

          {/* Progress Section */}
          {share.permissions.progress && (
            <div className="public-card progress-card">
              <h2>Project Progress</h2>
              <div className="progress-visual">
                <div className="progress-circle">
                  <svg viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="var(--primary-color, #3b82f6)"
                      strokeWidth="8"
                      strokeDasharray={`${progress * 2.827} 282.7`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="progress-percentage">{progress}%</div>
                </div>
                <div className="progress-details">
                  <div className="progress-label">Complete</div>
                  {areas && areas.length > 0 && (
                    <div className="areas-summary">
                      {areas.filter(a => a.status === 'done').length} of {areas.length} areas completed
                    </div>
                  )}
                </div>
              </div>

              {/* Areas List */}
              {areas && areas.length > 0 && (
                <div className="areas-list">
                  <h3>Work Areas</h3>
                  {areas.map(area => (
                    <div key={area.id} className="area-item">
                      <div className="area-info">
                        <span className="area-name">{area.name}</span>
                        <span className="area-weight">{area.weight}%</span>
                      </div>
                      <div className={`area-status status-${area.status}`}>
                        {area.status === 'done' ? '✓ Complete' :
                         area.status === 'working' ? '⚙ In Progress' :
                         '○ Not Started'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Photos Section */}
          {share.permissions.photos && photos && photos.length > 0 && (
            <div className="public-card photos-card">
              <h2>Recent Photos</h2>
              <div className="photos-carousel">
                <div className="carousel-main">
                  {photos[selectedPhotoIndex] && (
                    <img
                      src={photos[selectedPhotoIndex].url}
                      alt={`Project photo from ${formatDate(photos[selectedPhotoIndex].date)}`}
                      className="carousel-image"
                    />
                  )}
                  <div className="carousel-date">
                    {formatDate(photos[selectedPhotoIndex]?.date)}
                  </div>
                </div>
                <div className="carousel-thumbnails">
                  {photos.slice(0, 10).map((photo, index) => (
                    <div
                      key={index}
                      className={`thumbnail ${index === selectedPhotoIndex ? 'active' : ''}`}
                      onClick={() => setSelectedPhotoIndex(index)}
                    >
                      <img src={photo.url} alt={`Thumbnail ${index + 1}`} />
                    </div>
                  ))}
                </div>
                {photos.length > 1 && (
                  <div className="carousel-controls">
                    <button
                      onClick={() => setSelectedPhotoIndex(prev =>
                        prev > 0 ? prev - 1 : photos.length - 1
                      )}
                      className="carousel-btn"
                    >
                      ←
                    </button>
                    <span className="carousel-counter">
                      {selectedPhotoIndex + 1} / {photos.length}
                    </span>
                    <button
                      onClick={() => setSelectedPhotoIndex(prev =>
                        prev < photos.length - 1 ? prev + 1 : 0
                      )}
                      className="carousel-btn"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Daily Reports Section */}
          {share.permissions.daily_reports && dailyReports && dailyReports.length > 0 && (
            <div className="public-card reports-card">
              <h2>Daily Reports</h2>
              <div className="reports-list">
                {dailyReports.map((report, index) => (
                  <div key={index} className="report-item">
                    <div className="report-date">
                      {formatDate(report.report_date)}
                    </div>
                    <div className="report-content">
                      {report.crew_count && (
                        <div className="report-field">
                          <strong>Crew:</strong> {report.crew_count} workers
                        </div>
                      )}
                      {report.tasks_completed && (
                        <div className="report-field">
                          <strong>Tasks Completed:</strong> {report.tasks_completed}
                        </div>
                      )}
                      {report.weather && (
                        <div className="report-field">
                          <strong>Weather:</strong> {report.weather}
                        </div>
                      )}
                      {report.notes && (
                        <div className="report-field">
                          <strong>Notes:</strong> {report.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* T&M Tickets Section */}
          {share.permissions.tm_tickets && tmTickets && tmTickets.length > 0 && (
            <div className="public-card tm-card">
              <h2>Time & Materials Tickets</h2>
              <div className="tm-list">
                {tmTickets.map((ticket, index) => (
                  <div key={index} className="tm-item">
                    <div className="tm-header">
                      <span className="tm-date">{formatDate(ticket.work_date)}</span>
                      <span className={`tm-status status-${ticket.status}`}>
                        {ticket.status}
                      </span>
                    </div>
                    {ticket.description && (
                      <div className="tm-description">{ticket.description}</div>
                    )}
                    {ticket.total_amount && (
                      <div className="tm-amount">
                        Total: {formatCurrency(ticket.total_amount)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="public-footer">
        <div className="container">
          {!branding?.hide_fieldsync_branding && (
            <p>Powered by FieldSync</p>
          )}
        </div>
      </footer>

      <style>{publicViewStyles}</style>
    </div>
  )
}

const publicViewStyles = `
  .public-view {
    min-height: 100vh;
    background-color: #f9fafb;
    display: flex;
    flex-direction: column;
  }

  .container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 0 1rem;
    width: 100%;
  }

  /* Header */
  .public-header {
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 1.5rem 0;
  }

  .public-header .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-meta {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Main Content */
  .public-main {
    flex: 1;
    padding: 2rem 0;
  }

  .project-header {
    margin-bottom: 2rem;
  }

  .project-header h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: #111827;
  }

  .project-address {
    font-size: 1rem;
    color: #6b7280;
    margin: 0;
  }

  /* Cards */
  .public-card {
    background-color: white;
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .public-card h2 {
    font-size: 1.5rem;
    margin: 0 0 1.5rem 0;
    color: #111827;
  }

  .public-card h3 {
    font-size: 1.125rem;
    margin: 1.5rem 0 1rem 0;
    color: #374151;
  }

  /* Progress Card */
  .progress-visual {
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .progress-circle {
    position: relative;
    width: 150px;
    height: 150px;
    flex-shrink: 0;
  }

  .progress-circle svg {
    width: 100%;
    height: 100%;
  }

  .progress-percentage {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 2rem;
    font-weight: bold;
    color: var(--primary-color, #3b82f6);
  }

  .progress-details {
    flex: 1;
  }

  .progress-label {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
  }

  .areas-summary {
    font-size: 1rem;
    color: #6b7280;
  }

  /* Areas List */
  .areas-list {
    border-top: 1px solid #e5e7eb;
    padding-top: 1rem;
  }

  .area-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .area-item:last-child {
    border-bottom: none;
  }

  .area-info {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-right: 1rem;
  }

  .area-name {
    font-weight: 500;
    color: #374151;
  }

  .area-weight {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .area-status {
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .area-status.status-done {
    background-color: #d1fae5;
    color: #065f46;
  }

  .area-status.status-working {
    background-color: #fef3c7;
    color: #92400e;
  }

  .area-status.status-not_started {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  /* Photos Carousel */
  .photos-carousel {
    position: relative;
  }

  .carousel-main {
    position: relative;
    width: 100%;
    height: 400px;
    background-color: #111827;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .carousel-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .carousel-date {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    color: white;
    padding: 1rem;
    text-align: center;
  }

  .carousel-thumbnails {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }

  .thumbnail {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s;
  }

  .thumbnail:hover {
    border-color: #d1d5db;
  }

  .thumbnail.active {
    border-color: var(--primary-color, #3b82f6);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .carousel-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
  }

  .carousel-btn {
    background-color: white;
    border: 1px solid #d1d5db;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1.25rem;
    transition: background-color 0.2s;
  }

  .carousel-btn:hover {
    background-color: #f3f4f6;
  }

  .carousel-counter {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Daily Reports */
  .reports-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .report-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }

  .report-date {
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.75rem;
    font-size: 1.125rem;
  }

  .report-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .report-field {
    color: #374151;
    line-height: 1.5;
  }

  .report-field strong {
    color: #111827;
  }

  /* T&M Tickets */
  .tm-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .tm-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }

  .tm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .tm-date {
    font-weight: 600;
    color: #111827;
  }

  .tm-status {
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  .tm-status.status-approved {
    background-color: #d1fae5;
    color: #065f46;
  }

  .tm-status.status-pending {
    background-color: #fef3c7;
    color: #92400e;
  }

  .tm-status.status-rejected {
    background-color: #fee2e2;
    color: #991b1b;
  }

  .tm-description {
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .tm-amount {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--primary-color, #3b82f6);
  }

  /* Footer */
  .public-footer {
    background-color: white;
    border-top: 1px solid #e5e7eb;
    padding: 2rem 0;
    margin-top: auto;
  }

  .public-footer p {
    text-align: center;
    color: #6b7280;
    margin: 0;
    font-size: 0.875rem;
  }

  /* Loading & Error States */
  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e5e7eb;
    border-top-color: var(--primary-color, #3b82f6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-container p {
    margin-top: 1rem;
    color: #6b7280;
  }

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .error-container h2 {
    color: #111827;
    margin: 0 0 0.5rem 0;
  }

  .error-container p {
    color: #6b7280;
    margin: 0;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .project-header h1 {
      font-size: 1.5rem;
    }

    .public-card {
      padding: 1.5rem;
    }

    .progress-visual {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .progress-circle {
      width: 120px;
      height: 120px;
    }

    .progress-percentage {
      font-size: 1.5rem;
    }

    .carousel-main {
      height: 300px;
    }

    .area-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .area-info {
      width: 100%;
      margin-right: 0;
    }
  }
`
