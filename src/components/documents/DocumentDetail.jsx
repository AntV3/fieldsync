import { useState, useEffect } from 'react'
import { ArrowLeft, Download, Archive, CheckCircle, XCircle, Clock, FileText, User, Calendar, Folder, Eye, Link2, Loader2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { DOCUMENT_CATEGORIES, DOCUMENT_VISIBILITY_LABELS } from '../../lib/constants'

// Format file size
const formatFileSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`
}

// Format date
const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default function DocumentDetail({ document: initialDocument, onBack, onUpdate, onShowToast, isOfficeOrAdmin }) {
  const [document, setDocument] = useState(initialDocument)
  const [versions, setVersions] = useState([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  const category = DOCUMENT_CATEGORIES.find(c => c.id === document.category)
  const visibilityInfo = DOCUMENT_VISIBILITY_LABELS[document.visibility]
  const isPending = document.approval_status === 'pending'
  const isRejected = document.approval_status === 'rejected'
  const isAdmin = isOfficeOrAdmin // Simplified - in real app, check for admin specifically

  // Load versions
  useEffect(() => {
    loadVersions()
  }, [document.id])

  const loadVersions = async () => {
    setLoadingVersions(true)
    try {
      const versionList = await db.getDocumentVersions(document.id)
      setVersions(versionList)
    } catch (error) {
      console.error('Error loading versions:', error)
    } finally {
      setLoadingVersions(false)
    }
  }

  // Handle download
  const handleDownload = async () => {
    await db.logDocumentAccess(document.id, 'downloaded')
    const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/project-documents/${document.storage_path}`
    window.open(url, '_blank')
  }

  // Handle approve
  const handleApprove = async () => {
    setProcessing(true)
    try {
      await db.approveDocument(document.id)
      setDocument(prev => ({ ...prev, approval_status: 'approved' }))
      onShowToast?.('Document approved', 'success')
      onUpdate?.()
    } catch (error) {
      console.error('Error approving document:', error)
      onShowToast?.('Failed to approve document', 'error')
    } finally {
      setProcessing(false)
    }
  }

  // Handle reject
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      onShowToast?.('Please provide a reason for rejection', 'error')
      return
    }

    setProcessing(true)
    try {
      await db.rejectDocument(document.id, rejectReason.trim())
      setDocument(prev => ({ ...prev, approval_status: 'rejected', rejection_reason: rejectReason.trim() }))
      setShowRejectModal(false)
      setRejectReason('')
      onShowToast?.('Document rejected', 'success')
      onUpdate?.()
    } catch (error) {
      console.error('Error rejecting document:', error)
      onShowToast?.('Failed to reject document', 'error')
    } finally {
      setProcessing(false)
    }
  }

  // Handle archive
  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this document?')) return

    setProcessing(true)
    try {
      await db.archiveDocument(document.id)
      onShowToast?.('Document archived', 'success')
      onBack()
      onUpdate?.()
    } catch (error) {
      console.error('Error archiving document:', error)
      onShowToast?.('Failed to archive document', 'error')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="document-detail">
      {/* Header */}
      <div className="document-detail-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          Back
        </button>

        <div className="document-detail-actions">
          <button className="btn btn-secondary" onClick={handleDownload}>
            <Download size={18} />
            Download
          </button>
          {isOfficeOrAdmin && (
            <button className="btn btn-secondary btn-danger" onClick={handleArchive} disabled={processing}>
              <Archive size={18} />
              Archive
            </button>
          )}
        </div>
      </div>

      {/* Document info */}
      <div className="document-detail-content">
        <div className="document-detail-main">
          {/* Title and status */}
          <div className="document-detail-title">
            <h2>{document.name}</h2>
            {document.version > 1 && (
              <span className="version-badge">v{document.version}</span>
            )}
          </div>

          {/* Status badges */}
          {(isPending || isRejected) && (
            <div className="document-detail-status">
              {isPending && (
                <div className="status-banner pending">
                  <Clock size={18} />
                  <span>Pending Approval</span>
                  {isAdmin && (
                    <div className="status-actions">
                      <button
                        className="btn btn-sm btn-success"
                        onClick={handleApprove}
                        disabled={processing}
                      >
                        <CheckCircle size={16} />
                        Approve
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setShowRejectModal(true)}
                        disabled={processing}
                      >
                        <XCircle size={16} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isRejected && (
                <div className="status-banner rejected">
                  <XCircle size={18} />
                  <div className="rejected-info">
                    <span>Rejected</span>
                    {document.rejection_reason && (
                      <p className="rejection-reason">{document.rejection_reason}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="document-detail-meta">
            <div className="meta-item">
              <FileText size={16} />
              <span>{document.file_name}</span>
            </div>
            <div className="meta-item">
              <Folder size={16} />
              <span>{category?.label || document.category}</span>
            </div>
            <div className="meta-item">
              <span className="meta-size">{formatFileSize(document.file_size_bytes)}</span>
            </div>
            <div className="meta-item">
              <Calendar size={16} />
              <span>{formatDate(document.uploaded_at)}</span>
            </div>
            <div className="meta-item">
              <User size={16} />
              <span>{document.uploaded_by_user?.email || 'Unknown'}</span>
            </div>
            <div className="meta-item">
              <Eye size={16} />
              <span>{visibilityInfo?.label || document.visibility}</span>
            </div>
          </div>

          {/* Description */}
          {document.description && (
            <div className="document-detail-description">
              <h3>Description</h3>
              <p>{document.description}</p>
            </div>
          )}

          {/* Linked resource */}
          {document.resource_type && document.resource_id && (
            <div className="document-detail-linked">
              <h3>
                <Link2 size={16} />
                Linked To
              </h3>
              <p>
                {document.resource_type === 'cor' && 'Change Order Request'}
                {document.resource_type === 'tm_ticket' && 'Time & Material Ticket'}
                {document.resource_type === 'daily_report' && 'Daily Report'}
              </p>
            </div>
          )}
        </div>

        {/* Version history */}
        <div className="document-detail-sidebar">
          <h3>Version History</h3>
          {loadingVersions ? (
            <div className="versions-loading">
              <Loader2 size={20} className="spinner" />
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <p className="versions-empty">No version history</p>
          ) : (
            <div className="versions-list">
              {versions.map(version => (
                <div
                  key={version.id}
                  className={`version-item ${version.id === document.id ? 'current' : ''}`}
                >
                  <div className="version-info">
                    <span className="version-number">
                      v{version.version}
                      {version.is_current && <span className="current-badge">Current</span>}
                    </span>
                    <span className="version-date">{formatDate(version.uploaded_at)}</span>
                    <span className="version-user">{version.uploaded_by_user?.email}</span>
                  </div>
                  <button
                    className="version-download"
                    onClick={async () => {
                      await db.logDocumentAccess(version.id, 'downloaded')
                      window.open(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/project-documents/${version.storage_path}`, '_blank')
                    }}
                    title="Download this version"
                  >
                    <Download size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload new version */}
          {isOfficeOrAdmin && (
            <div className="upload-version">
              <p className="upload-version-hint">
                To upload a new version, use the main upload button and select "Replace existing document"
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="reject-modal" onClick={e => e.stopPropagation()}>
            <h3>Reject Document</h3>
            <p>Please provide a reason for rejection:</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason..."
              rows={4}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleReject}
                disabled={!rejectReason.trim() || processing}
              >
                {processing ? <Loader2 size={16} className="spinner" /> : <XCircle size={16} />}
                Reject Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
