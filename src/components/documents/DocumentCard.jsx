import { FileText, Download, MoreVertical, Eye, Archive, CheckCircle, Clock, XCircle, File, Image, FileSpreadsheet } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { DOCUMENT_CATEGORIES } from '../../lib/constants'

// Get file type icon based on MIME type
const getFileIcon = (mimeType) => {
  if (mimeType?.startsWith('image/')) return Image
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return FileSpreadsheet
  if (mimeType?.includes('pdf')) return FileText
  return File
}

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DocumentCard({ document, onAction, isOfficeOrAdmin }) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  const FileIcon = getFileIcon(document.mime_type)
  const category = DOCUMENT_CATEGORIES.find(c => c.id === document.category)
  const isPending = document.approval_status === 'pending'
  const isRejected = document.approval_status === 'rejected'

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAction = (action) => {
    setShowMenu(false)
    onAction(action, document)
  }

  return (
    <div className={`document-card ${isPending ? 'pending' : ''} ${isRejected ? 'rejected' : ''}`}>
      {/* File type icon */}
      <div className="document-icon">
        <FileIcon size={24} />
      </div>

      {/* Document info */}
      <div className="document-info">
        <div className="document-name">
          {document.name}
          {document.version > 1 && (
            <span className="document-version">v{document.version}</span>
          )}
        </div>
        <div className="document-meta">
          <span className="document-category">{category?.label || document.category}</span>
          <span className="document-size">{formatFileSize(document.file_size_bytes)}</span>
          <span className="document-date">{formatDate(document.uploaded_at)}</span>
        </div>
      </div>

      {/* Status badges */}
      <div className="document-status">
        {isPending && (
          <span className="status-badge pending">
            <Clock size={14} />
            Pending Approval
          </span>
        )}
        {isRejected && (
          <span className="status-badge rejected">
            <XCircle size={14} />
            Rejected
          </span>
        )}
        {document.is_current && document.version > 1 && (
          <span className="status-badge current">
            <CheckCircle size={14} />
            Current
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="document-actions">
        <button
          className="document-action-btn"
          onClick={() => handleAction('view')}
          title="View details"
        >
          <Eye size={18} />
        </button>
        <button
          className="document-action-btn"
          onClick={() => handleAction('download')}
          title="Download"
        >
          <Download size={18} />
        </button>
        {isOfficeOrAdmin && (
          <div className="document-menu-wrapper" ref={menuRef}>
            <button
              className="document-action-btn"
              onClick={() => setShowMenu(!showMenu)}
              title="More actions"
            >
              <MoreVertical size={18} />
            </button>
            {showMenu && (
              <div className="document-menu">
                <button onClick={() => handleAction('view')}>
                  <Eye size={16} />
                  View Details
                </button>
                <button onClick={() => handleAction('download')}>
                  <Download size={16} />
                  Download
                </button>
                {isPending && (
                  <button onClick={() => handleAction('approve')} className="menu-approve">
                    <CheckCircle size={16} />
                    Approve
                  </button>
                )}
                <button onClick={() => handleAction('archive')} className="menu-danger">
                  <Archive size={16} />
                  Archive
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
