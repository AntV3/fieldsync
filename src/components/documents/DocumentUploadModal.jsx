import { useState, useRef, useCallback } from 'react'
import { X, Upload, CloudUpload, File, AlertCircle, Loader2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { DOCUMENT_CATEGORIES, ALLOWED_FILE_TYPES, DOCUMENT_VISIBILITY_LABELS, APPROVAL_REQUIRED_CATEGORIES } from '../../lib/constants'

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

export default function DocumentUploadModal({ projectId, companyId, folderId, folderName, onClose, onUploadComplete, onShowToast }) {
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [visibility, setVisibility] = useState('all')

  const fileInputRef = useRef(null)

  // Validate file
  const validateFile = (file) => {
    if (!file) return 'Please select a file'

    const fileType = ALLOWED_FILE_TYPES[file.type]
    if (!fileType) {
      return `File type not supported. Allowed: PDF, Word, Excel, Images`
    }

    if (file.size > fileType.maxSize) {
      return `File too large. Maximum size for ${fileType.label}: ${formatFileSize(fileType.maxSize)}`
    }

    return null
  }

  // Handle file selection
  const handleFileSelect = useCallback((selectedFile) => {
    const validationError = validateFile(selectedFile)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setFile(selectedFile)
    // Auto-fill name from filename (without extension)
    if (!name) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '')
      setName(nameWithoutExt)
    }
  }, [name])

  // Handle drag events
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  // Handle drop
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // Handle input change
  const handleInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  // Handle upload
  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file')
      return
    }

    if (!name.trim()) {
      setError('Please enter a document name')
      return
    }

    setUploading(true)
    setError(null)
    setUploadProgress('Uploading document...')

    try {
      const document = await db.uploadDocument(companyId, projectId, file, {
        name: name.trim(),
        description: description.trim() || null,
        category,
        visibility,
        folderId: folderId || null
      })

      setUploadProgress('Upload complete!')
      onUploadComplete(document)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message || 'Failed to upload document')
      setUploading(false)
    }
  }

  // Check if category requires approval
  const requiresApproval = APPROVAL_REQUIRED_CATEGORIES.includes(category)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="document-upload-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>Upload Document</h2>
            {folderName && (
              <span className="modal-subtitle">to {folderName}</span>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {/* Dropzone */}
          <div
            className={`document-dropzone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={Object.keys(ALLOWED_FILE_TYPES).join(',')}
              onChange={handleInputChange}
              style={{ display: 'none' }}
            />

            {file ? (
              <div className="dropzone-file">
                <File size={32} />
                <div className="dropzone-file-info">
                  <span className="dropzone-file-name">{file.name}</span>
                  <span className="dropzone-file-size">{formatFileSize(file.size)}</span>
                </div>
                <button
                  className="dropzone-file-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                    setError(null)
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <CloudUpload size={48} />
                <p className="dropzone-text">
                  Drag & drop files here<br />
                  or click to browse
                </p>
                <p className="dropzone-hint">
                  PDF, Word, Excel, Images &bull; Max 25MB
                </p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="document-upload-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Form fields */}
          <div className="document-upload-form">
            <div className="form-group">
              <label htmlFor="doc-name">Document Name *</label>
              <input
                id="doc-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter document name"
                disabled={uploading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="doc-category">Category</label>
              <select
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={uploading}
              >
                {DOCUMENT_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
              {requiresApproval && (
                <p className="form-hint warning">
                  <AlertCircle size={14} />
                  Documents in this category require admin approval before becoming visible.
                </p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="doc-description">Description</label>
              <textarea
                id="doc-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
                disabled={uploading}
              />
            </div>

            <div className="form-group">
              <label>Visibility</label>
              <div className="visibility-options">
                {Object.entries(DOCUMENT_VISIBILITY_LABELS).map(([key, { label, description }]) => (
                  <label key={key} className={`visibility-option ${visibility === key ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="visibility"
                      value={key}
                      checked={visibility === key}
                      onChange={(e) => setVisibility(e.target.value)}
                      disabled={uploading}
                    />
                    <div className="visibility-content">
                      <span className="visibility-label">{label}</span>
                      <span className="visibility-desc">{description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {uploading ? (
            <div className="upload-progress">
              <Loader2 size={20} className="spinner" />
              <span>{uploadProgress}</span>
            </div>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={!file || !name.trim()}
              >
                <Upload size={18} />
                Upload Document
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
