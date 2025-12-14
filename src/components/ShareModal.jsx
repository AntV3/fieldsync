import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import Toast from './Toast'

function ShareModal({ project, user, onClose, onShareCreated }) {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [existingShares, setExistingShares] = useState([])
  const [showNewShare, setShowNewShare] = useState(false)

  // Permission checkboxes
  const [permissions, setPermissions] = useState({
    progress: true,
    photos: true,
    daily_reports: true,
    tm_tickets: false,
    crew_info: false
  })

  // Expiration settings
  const [expirationType, setExpirationType] = useState('never')
  const [customExpiration, setCustomExpiration] = useState('')

  // Load existing shares
  useEffect(() => {
    loadShares()
  }, [project.id])

  const loadShares = async () => {
    try {
      const shares = await db.getProjectShares(project.id)
      setExistingShares(shares)
    } catch (error) {
      console.error('Error loading shares:', error)
    }
  }

  const handlePermissionChange = (key) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const calculateExpiresAt = () => {
    if (expirationType === 'never') return null

    const now = new Date()
    if (expirationType === '30days') {
      now.setDate(now.getDate() + 30)
    } else if (expirationType === '90days') {
      now.setDate(now.getDate() + 90)
    } else if (expirationType === 'custom' && customExpiration) {
      return new Date(customExpiration).toISOString()
    }

    return now.toISOString()
  }

  const handleGenerateLink = async () => {
    setLoading(true)
    try {
      const expiresAt = calculateExpiresAt()

      const share = await db.createProjectShare(
        project.id,
        user.id,
        permissions,
        expiresAt
      )

      setToast({ type: 'success', message: 'Share link created!' })
      setShowNewShare(false)
      loadShares()

      if (onShareCreated) {
        onShareCreated(share)
      }
    } catch (error) {
      console.error('Error creating share:', error)
      setToast({ type: 'error', message: 'Failed to create share link' })
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = (token) => {
    const url = `${window.location.origin}/view/${token}`
    navigator.clipboard.writeText(url)
    setToast({ type: 'success', message: 'Link copied to clipboard!' })
  }

  const handleRevoke = async (shareId) => {
    if (!confirm('Are you sure you want to revoke this share link?')) return

    try {
      await db.revokeProjectShare(shareId)
      setToast({ type: 'success', message: 'Share link revoked' })
      loadShares()
    } catch (error) {
      console.error('Error revoking share:', error)
      setToast({ type: 'error', message: 'Failed to revoke share link' })
    }
  }

  const handleDelete = async (shareId) => {
    if (!confirm('Are you sure you want to permanently delete this share link?')) return

    try {
      await db.deleteProjectShare(shareId)
      setToast({ type: 'success', message: 'Share link deleted' })
      loadShares()
    } catch (error) {
      console.error('Error deleting share:', error)
      setToast({ type: 'error', message: 'Failed to delete share link' })
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleDateString()
  }

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  const getPermissionsList = (perms) => {
    const enabled = []
    if (perms.progress) enabled.push('Progress')
    if (perms.photos) enabled.push('Photos')
    if (perms.daily_reports) enabled.push('Reports')
    if (perms.tm_tickets) enabled.push('T&M')
    if (perms.crew_info) enabled.push('Crew')
    return enabled.join(', ')
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content share-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Share Project: {project.name}</h2>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>

          <div className="modal-body">
            {/* Existing Shares */}
            {existingShares.length > 0 && (
              <div className="existing-shares">
                <h3>Active Share Links</h3>
                <div className="shares-list">
                  {existingShares.map(share => (
                    <div
                      key={share.id}
                      className={`share-item ${!share.is_active || isExpired(share.expires_at) ? 'inactive' : ''}`}
                    >
                      <div className="share-info">
                        <div className="share-token">
                          <code>{window.location.origin}/view/{share.share_token}</code>
                          <button
                            className="btn-small"
                            onClick={() => handleCopyLink(share.share_token)}
                            disabled={!share.is_active || isExpired(share.expires_at)}
                          >
                            Copy
                          </button>
                        </div>
                        <div className="share-meta">
                          <span className="permissions">{getPermissionsList(share.permissions)}</span>
                          <span className="expiry">
                            Expires: {formatDate(share.expires_at)}
                          </span>
                          <span className="views">
                            Views: {share.view_count || 0}
                            {share.last_viewed_at && ` (Last: ${formatDate(share.last_viewed_at)})`}
                          </span>
                        </div>
                        {!share.is_active && (
                          <div className="status-badge revoked">Revoked</div>
                        )}
                        {isExpired(share.expires_at) && share.is_active && (
                          <div className="status-badge expired">Expired</div>
                        )}
                      </div>
                      <div className="share-actions">
                        {share.is_active && !isExpired(share.expires_at) && (
                          <button className="btn-secondary" onClick={() => handleRevoke(share.id)}>
                            Revoke
                          </button>
                        )}
                        <button className="btn-danger" onClick={() => handleDelete(share.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Share Form */}
            {!showNewShare && (
              <button className="btn-primary" onClick={() => setShowNewShare(true)}>
                + Create New Share Link
              </button>
            )}

            {showNewShare && (
              <div className="new-share-form">
                <h3>Create New Share Link</h3>

                <div className="form-section">
                  <label>Permissions</label>
                  <div className="checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions.progress}
                        onChange={() => handlePermissionChange('progress')}
                      />
                      Progress/completion status
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions.photos}
                        onChange={() => handlePermissionChange('photos')}
                      />
                      Photos feed
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions.daily_reports}
                        onChange={() => handlePermissionChange('daily_reports')}
                      />
                      Daily reports
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions.tm_tickets}
                        onChange={() => handlePermissionChange('tm_tickets')}
                      />
                      T&M tickets
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions.crew_info}
                        onChange={() => handlePermissionChange('crew_info')}
                      />
                      Crew information
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <label>Link Expiration</label>
                  <div className="radio-group">
                    <label>
                      <input
                        type="radio"
                        value="never"
                        checked={expirationType === 'never'}
                        onChange={(e) => setExpirationType(e.target.value)}
                      />
                      Never expires
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="30days"
                        checked={expirationType === '30days'}
                        onChange={(e) => setExpirationType(e.target.value)}
                      />
                      30 days
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="90days"
                        checked={expirationType === '90days'}
                        onChange={(e) => setExpirationType(e.target.value)}
                      />
                      90 days
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="custom"
                        checked={expirationType === 'custom'}
                        onChange={(e) => setExpirationType(e.target.value)}
                      />
                      Custom date
                    </label>
                  </div>

                  {expirationType === 'custom' && (
                    <input
                      type="date"
                      value={customExpiration}
                      onChange={(e) => setCustomExpiration(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="date-input"
                    />
                  )}
                </div>

                <div className="form-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => setShowNewShare(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleGenerateLink}
                    disabled={loading}
                  >
                    {loading ? 'Generating...' : 'Generate Share Link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        .share-modal {
          max-width: 700px;
          max-height: 80vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 2rem;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          color: #111827;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .existing-shares {
          margin-bottom: 2rem;
        }

        .existing-shares h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.1rem;
        }

        .shares-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .share-item {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .share-item.inactive {
          opacity: 0.6;
          background-color: #f9fafb;
        }

        .share-info {
          flex: 1;
        }

        .share-token {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .share-token code {
          background-color: #f3f4f6;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .share-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          margin-top: 0.5rem;
        }

        .status-badge.revoked {
          background-color: #fee2e2;
          color: #991b1b;
        }

        .status-badge.expired {
          background-color: #fef3c7;
          color: #92400e;
        }

        .share-actions {
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .new-share-form {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 1.5rem;
          background-color: #f9fafb;
        }

        .new-share-form h3 {
          margin-top: 0;
          margin-bottom: 1.5rem;
          font-size: 1.1rem;
        }

        .form-section {
          margin-bottom: 1.5rem;
        }

        .form-section label {
          display: block;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }

        .checkbox-group,
        .radio-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .checkbox-group label,
        .radio-group label {
          font-weight: normal;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .checkbox-group input[type="checkbox"],
        .radio-group input[type="radio"] {
          margin: 0;
        }

        .date-input {
          margin-top: 0.5rem;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          width: 100%;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 1.5rem;
        }

        .btn-small {
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #d1d5db;
          background-color: white;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-small:hover:not(:disabled) {
          background-color: #f3f4f6;
        }

        .btn-small:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary,
        .btn-secondary,
        .btn-danger {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }

        .btn-primary {
          background-color: var(--primary-color, #3b82f6);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background-color: #f3f4f6;
          color: #374151;
        }

        .btn-secondary:hover {
          background-color: #e5e7eb;
        }

        .btn-danger {
          background-color: #ef4444;
          color: white;
        }

        .btn-danger:hover {
          background-color: #dc2626;
        }
      `}</style>
    </>
  )
}

export default ShareModal
