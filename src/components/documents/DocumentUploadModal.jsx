import { useState, useRef, useCallback } from 'react'
import { X, Upload, CloudUpload, File, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import LoadingDots from '../ui/LoadingDots'
import { db } from '../../lib/supabase'
import { DOCUMENT_CATEGORIES, ALLOWED_FILE_TYPES, DOCUMENT_VISIBILITY_LABELS, APPROVAL_REQUIRED_CATEGORIES } from '../../lib/constants'
import { compressImage } from '../../lib/imageUtils'

// Max concurrent uploads to avoid overwhelming the connection
const MAX_CONCURRENT_UPLOADS = 3

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
  const [files, setFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [error, setError] = useState(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [visibility, setVisibility] = useState('all')

  // Per-file upload status: { fileIndex: 'pending' | 'compressing' | 'uploading' | 'done' | 'error' }
  const [fileStatuses, setFileStatuses] = useState({})

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

  // Handle file selection (supports multiple files)
  const handleFileSelect = useCallback((selectedFiles) => {
    const validFiles = []
    const errors = []

    for (const f of selectedFiles) {
      const validationError = validateFile(f)
      if (validationError) {
        errors.push(`${f.name}: ${validationError}`)
      } else {
        validFiles.push(f)
      }
    }

    if (errors.length > 0 && validFiles.length === 0) {
      setError(errors.join('\n'))
      return
    }

    setError(errors.length > 0 ? errors.join('\n') : null)
    setFiles(prev => [...prev, ...validFiles])

    // Auto-fill name from first file if empty
    if (!name && validFiles.length === 1) {
      const nameWithoutExt = validFiles[0].name.replace(/\.[^/.]+$/, '')
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

  // Handle drop (supports multiple files)
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(Array.from(e.dataTransfer.files))
    }
  }

  // Handle input change (supports multiple files)
  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(Array.from(e.target.files))
      e.target.value = ''
    }
  }

  // Remove a file from the list
  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setFileStatuses(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  // Upload a single file with optional compression
  const uploadSingleFile = async (file, index, docName) => {
    // Compress images before upload
    let fileToUpload = file
    if (file.type.startsWith('image/') && file.size > 500 * 1024) {
      setFileStatuses(prev => ({ ...prev, [index]: 'compressing' }))
      try {
        fileToUpload = await compressImage(file, 1920, 0.8)
      } catch {
        // Use original if compression fails
      }
    }

    setFileStatuses(prev => ({ ...prev, [index]: 'uploading' }))

    const document = await db.uploadDocument(companyId, projectId, fileToUpload, {
      name: docName,
      description: description.trim() || null,
      category,
      visibility,
      folderId: folderId || null
    })

    setFileStatuses(prev => ({ ...prev, [index]: 'done' }))
    return document
  }

  // Handle upload with concurrency control
  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select a file')
      return
    }

    // For single file, require a name
    if (files.length === 1 && !name.trim()) {
      setError('Please enter a document name')
      return
    }

    setUploading(true)
    setError(null)

    const totalFiles = files.length
    let completed = 0
    let failed = 0
    const results = []

    // Process files in batches of MAX_CONCURRENT_UPLOADS
    for (let i = 0; i < totalFiles; i += MAX_CONCURRENT_UPLOADS) {
      const batch = files.slice(i, i + MAX_CONCURRENT_UPLOADS)
      const batchPromises = batch.map((file, batchIdx) => {
        const fileIndex = i + batchIdx
        const docName = totalFiles === 1
          ? name.trim()
          : file.name.replace(/\.[^/.]+$/, '')
        return uploadSingleFile(file, fileIndex, docName)
          .then(doc => {
            completed++
            setUploadProgress(`Uploaded ${completed}/${totalFiles}`)
            results.push(doc)
          })
          .catch(err => {
            failed++
            setFileStatuses(prev => ({ ...prev, [fileIndex]: 'error' }))
            console.error(`Upload error for ${file.name}:`, err)
          })
      })

      await Promise.all(batchPromises)
    }

    if (failed === totalFiles) {
      setError('All uploads failed. Please try again.')
      setUploading(false)
      return
    }

    setUploadProgress(`${completed} of ${totalFiles} uploaded!`)
    onUploadComplete(results.length === 1 ? results[0] : results)
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
            className={`document-dropzone ${dragActive ? 'drag-active' : ''} ${files.length > 0 ? 'has-file' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => files.length === 0 && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={Object.keys(ALLOWED_FILE_TYPES).join(',')}
              onChange={handleInputChange}
              style={{ display: 'none' }}
            />

            {files.length > 0 ? (
              <div className="dropzone-file-list">
                {files.map((file, idx) => {
                  const status = fileStatuses[idx]
                  return (
                    <div key={idx} className="dropzone-file">
                      <File size={24} />
                      <div className="dropzone-file-info">
                        <span className="dropzone-file-name">{file.name}</span>
                        <span className="dropzone-file-size">
                          {formatFileSize(file.size)}
                          {status === 'compressing' && ' · Compressing...'}
                          {status === 'uploading' && ' · Uploading...'}
                          {status === 'done' && ' · Done'}
                          {status === 'error' && ' · Failed'}
                        </span>
                      </div>
                      {status === 'done' && <CheckCircle size={16} style={{ color: '#10b981' }} />}
                      {status === 'error' && <XCircle size={16} style={{ color: '#ef4444' }} />}
                      {(status === 'compressing' || status === 'uploading') && <LoadingDots size="small" />}
                      {!uploading && (
                        <button
                          className="dropzone-file-remove"
                          onClick={(e) => { e.stopPropagation(); removeFile(idx) }}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  )
                })}
                {!uploading && (
                  <button className="dropzone-add-more" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
                    + Add more files
                  </button>
                )}
              </div>
            ) : (
              <>
                <CloudUpload size={48} />
                <p className="dropzone-text">
                  Drag & drop files here<br />
                  or click to browse
                </p>
                <p className="dropzone-hint">
                  PDF, Word, Excel, Images &bull; Max 25MB &bull; Multiple files supported
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
              <LoadingDots size="small" />
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
                disabled={files.length === 0 || (files.length === 1 && !name.trim())}
              >
                <Upload size={18} />
                {files.length > 1 ? `Upload ${files.length} Documents` : 'Upload Document'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
