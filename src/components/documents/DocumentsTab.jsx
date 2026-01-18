import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Upload, Search, FolderOpen, Settings, Loader2, X, ArrowLeft, Folder, FileText, Download, File, Image, FileSpreadsheet, Plus, MoreVertical, Eye, Archive, CheckCircle } from 'lucide-react'
import { db } from '../../lib/supabase'
import { DOCUMENTS_PER_PAGE } from '../../lib/constants'
import DocumentUploadModal from './DocumentUploadModal'
import DocumentDetail from './DocumentDetail'
import FolderGrid from './FolderGrid'
import FolderManager from './FolderManager'

// Get file type icon
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Folder color mapping
const FOLDER_COLORS = {
  blue: '#3b82f6',
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
  gray: '#6b7280',
  orange: '#f97316'
}

export default function DocumentsTab({ project, companyId, onShowToast, userRole }) {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showFolderManager, setShowFolderManager] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [uploadToFolder, setUploadToFolder] = useState(null)

  const isOfficeOrAdmin = userRole === 'office' || userRole === 'administrator'
  const isFieldUser = userRole === 'foreman'

  // Load folders
  const loadFolders = useCallback(async () => {
    setLoading(true)
    try {
      const folderList = await db.getProjectFolders(project.id)
      setFolders(folderList)
    } catch (error) {
      console.error('Error loading folders:', error)
      onShowToast?.('Failed to load folders', 'error')
    } finally {
      setLoading(false)
    }
  }, [project.id, onShowToast])

  // Initial load
  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  // Load documents in folder
  const loadFolderDocuments = async (folder, reset = false) => {
    if (reset) {
      setPage(0)
      setLoadingDocs(true)
    }

    try {
      const currentPage = reset ? 0 : page
      const result = await db.getFolderDocuments(folder.id, {
        page: currentPage,
        limit: DOCUMENTS_PER_PAGE
      })

      if (reset) {
        setDocuments(result.documents)
      } else {
        setDocuments(prev => [...prev, ...result.documents])
      }
      setTotalCount(result.totalCount)
      setHasMore(result.hasMore)
    } catch (error) {
      console.error('Error loading documents:', error)
      onShowToast?.('Failed to load documents', 'error')
    } finally {
      setLoadingDocs(false)
    }
  }

  // Open folder
  const openFolder = (folder) => {
    setSelectedFolder(folder)
    setSearchQuery('')
    setSearchResults(null)
    loadFolderDocuments(folder, true)
  }

  // Go back to folder list
  const goBack = () => {
    setSelectedFolder(null)
    setDocuments([])
    setSearchResults(null)
    setSearchQuery('')
  }

  // Search documents (internal function)
  const performSearch = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults(null)
      return
    }

    setSearching(true)
    try {
      const results = await db.searchDocuments(project.id, query.trim())
      setSearchResults(results)
    } catch (error) {
      console.error('Error searching documents:', error)
    } finally {
      setSearching(false)
    }
  }, [project.id])

  // Debounced search to prevent excessive API calls
  const searchTimeoutRef = useRef(null)
  const handleSearch = useCallback((query) => {
    setSearchQuery(query)

    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query)
    }, 300)
  }, [performSearch])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // Handle upload complete
  const handleUploadComplete = () => {
    setShowUploadModal(false)
    setUploadToFolder(null)
    loadFolders() // Refresh folder counts
    if (selectedFolder) {
      loadFolderDocuments(selectedFolder, true)
    }
    onShowToast?.('Document uploaded successfully', 'success')
  }

  // Handle document action
  const handleDocumentAction = async (action, document) => {
    try {
      switch (action) {
        case 'view':
          setSelectedDocument(document)
          break
        case 'download':
          await db.logDocumentAccess(document.id, 'downloaded')
          window.open(document.url || `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/project-documents/${document.storage_path}`, '_blank')
          break
        case 'archive':
          await db.archiveDocument(document.id)
          if (selectedFolder) {
            loadFolderDocuments(selectedFolder, true)
          }
          loadFolders()
          onShowToast?.('Document archived', 'success')
          break
        case 'approve':
          await db.approveDocument(document.id)
          if (selectedFolder) {
            loadFolderDocuments(selectedFolder, true)
          }
          onShowToast?.('Document approved', 'success')
          break
        default:
          break
      }
    } catch (error) {
      console.error('Error performing action:', error)
      onShowToast?.('Action failed', 'error')
    }
  }

  // Start upload to specific folder
  const startUploadToFolder = (folder) => {
    setUploadToFolder(folder)
    setShowUploadModal(true)
  }

  // Field user (foreman) view - clean folder grid only
  if (isFieldUser) {
    return (
      <FolderGrid
        projectId={project.id}
        onShowToast={onShowToast}
      />
    )
  }

  // Document detail view
  if (selectedDocument) {
    return (
      <DocumentDetail
        document={selectedDocument}
        onBack={() => setSelectedDocument(null)}
        onUpdate={() => {
          if (selectedFolder) {
            loadFolderDocuments(selectedFolder, true)
          }
          loadFolders()
        }}
        onShowToast={onShowToast}
        isOfficeOrAdmin={isOfficeOrAdmin}
      />
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="documents-tab">
        <div className="documents-loading">
          <Loader2 size={24} className="spinner" />
          <span>Loading folders...</span>
        </div>
      </div>
    )
  }

  // Inside folder view
  if (selectedFolder) {
    const folderColor = FOLDER_COLORS[selectedFolder.color] || FOLDER_COLORS.blue
    const displayDocs = searchResults !== null ? searchResults : documents

    return (
      <div className="documents-tab">
        {/* Folder header */}
        <div className="documents-folder-header">
          <button className="back-btn" onClick={goBack}>
            <ArrowLeft size={20} />
            Back
          </button>
          <div className="documents-folder-title">
            <Folder size={24} style={{ color: folderColor }} />
            <h3>{selectedFolder.name}</h3>
            <span className="documents-folder-count">{totalCount} files</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => startUploadToFolder(selectedFolder)}
          >
            <Upload size={18} />
            Upload
          </button>
        </div>

        {/* Search */}
        <div className="documents-search-bar">
          <div className="documents-search">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search in folder..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="documents-search-input"
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults(null)
                }}
              >
                <X size={16} />
              </button>
            )}
            {searching && <Loader2 size={16} className="search-spinner" />}
          </div>
        </div>

        {/* Search results indicator */}
        {searchResults !== null && (
          <div className="documents-search-results">
            <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"</span>
            <button onClick={() => { setSearchQuery(''); setSearchResults(null) }}>
              Clear search
            </button>
          </div>
        )}

        {/* Documents list */}
        <div className="documents-list">
          {loadingDocs ? (
            <div className="documents-loading">
              <Loader2 size={24} className="spinner" />
              <span>Loading documents...</span>
            </div>
          ) : displayDocs.length === 0 ? (
            <div className="documents-empty">
              <Folder size={48} style={{ color: folderColor, opacity: 0.3 }} />
              <h3>No documents</h3>
              <p>
                {searchResults !== null
                  ? 'No documents match your search.'
                  : 'Upload your first document to this folder.'
                }
              </p>
              {searchResults === null && (
                <button
                  className="btn btn-primary"
                  onClick={() => startUploadToFolder(selectedFolder)}
                >
                  <Upload size={18} />
                  Upload Document
                </button>
              )}
            </div>
          ) : (
            <>
              {displayDocs.map(doc => {
                const FileIcon = getFileIcon(doc.mime_type)
                const isPending = doc.approval_status === 'pending'
                return (
                  <div
                    key={doc.id}
                    className={`document-card ${isPending ? 'pending' : ''}`}
                  >
                    <div className="document-icon">
                      <FileIcon size={24} />
                    </div>
                    <div className="document-info">
                      <div className="document-name">
                        {doc.name}
                        {doc.version > 1 && (
                          <span className="document-version">v{doc.version}</span>
                        )}
                      </div>
                      <div className="document-meta">
                        <span>{formatFileSize(doc.file_size_bytes)}</span>
                        <span>{formatDate(doc.uploaded_at)}</span>
                      </div>
                    </div>
                    {isPending && (
                      <span className="status-badge pending">Pending</span>
                    )}
                    <div className="document-actions">
                      <button
                        className="document-action-btn"
                        onClick={() => handleDocumentAction('view', doc)}
                        title="View details"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className="document-action-btn"
                        onClick={() => handleDocumentAction('download', doc)}
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                      {isPending && (
                        <button
                          className="document-action-btn approve"
                          onClick={() => handleDocumentAction('approve', doc)}
                          title="Approve"
                        >
                          <CheckCircle size={18} />
                        </button>
                      )}
                      <button
                        className="document-action-btn danger"
                        onClick={() => handleDocumentAction('archive', doc)}
                        title="Archive"
                      >
                        <Archive size={18} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Load more */}
              {hasMore && searchResults === null && (
                <div className="documents-load-more">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setPage(prev => prev + 1)
                      loadFolderDocuments(selectedFolder, false)
                    }}
                    disabled={loadingDocs}
                  >
                    Load More ({documents.length} of {totalCount})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <DocumentUploadModal
            projectId={project.id}
            companyId={companyId}
            folderId={uploadToFolder?.id}
            folderName={uploadToFolder?.name}
            onClose={() => {
              setShowUploadModal(false)
              setUploadToFolder(null)
            }}
            onUploadComplete={handleUploadComplete}
            onShowToast={onShowToast}
          />
        )}
      </div>
    )
  }

  // Main folder list view (Office/Admin)
  return (
    <div className="documents-tab">
      {/* Header */}
      <div className="documents-header">
        <button
          className="btn btn-secondary"
          onClick={() => setShowFolderManager(true)}
        >
          <Settings size={18} />
          Manage Folders
        </button>

        <div className="documents-search">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search all documents..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="documents-search-input"
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => {
                setSearchQuery('')
                setSearchResults(null)
              }}
            >
              <X size={16} />
            </button>
          )}
          {searching && <Loader2 size={16} className="search-spinner" />}
        </div>
      </div>

      {/* Search results */}
      {searchResults !== null ? (
        <>
          <div className="documents-search-results">
            <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"</span>
            <button onClick={() => { setSearchQuery(''); setSearchResults(null) }}>
              Clear search
            </button>
          </div>
          <div className="documents-list">
            {searchResults.map(doc => {
              const FileIcon = getFileIcon(doc.mime_type)
              return (
                <div key={doc.id} className="document-card">
                  <div className="document-icon">
                    <FileIcon size={24} />
                  </div>
                  <div className="document-info">
                    <div className="document-name">{doc.name}</div>
                    <div className="document-meta">
                      <span>{formatFileSize(doc.file_size_bytes)}</span>
                      <span>{formatDate(doc.uploaded_at)}</span>
                    </div>
                  </div>
                  <div className="document-actions">
                    <button
                      className="document-action-btn"
                      onClick={() => handleDocumentAction('view', doc)}
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      className="document-action-btn"
                      onClick={() => handleDocumentAction('download', doc)}
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        /* Folder grid */
        <div className="documents-folder-grid">
          {folders.length === 0 ? (
            <div className="documents-empty">
              <FolderOpen size={64} />
              <h3>No folders yet</h3>
              <p>Create folders to organize your project documents.</p>
              <button
                className="btn btn-primary"
                onClick={() => setShowFolderManager(true)}
              >
                <Plus size={18} />
                Create Folder
              </button>
            </div>
          ) : (
            folders.map(folder => {
              const color = FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue
              return (
                <button
                  key={folder.id}
                  className="documents-folder-card"
                  onClick={() => openFolder(folder)}
                >
                  <div
                    className="documents-folder-icon"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Folder size={32} style={{ color }} />
                  </div>
                  <div className="documents-folder-info">
                    <span className="documents-folder-name">{folder.name}</span>
                    <span className="documents-folder-meta">
                      {folder.document_count || 0} {folder.document_count === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                  <button
                    className="documents-folder-upload"
                    onClick={(e) => {
                      e.stopPropagation()
                      startUploadToFolder(folder)
                    }}
                    title="Upload to folder"
                  >
                    <Plus size={20} />
                  </button>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* Folder Manager Modal */}
      {showFolderManager && (
        <div className="modal-overlay" onClick={() => setShowFolderManager(false)}>
          <div className="folder-manager-modal" onClick={e => e.stopPropagation()}>
            <div className="folder-manager-modal-header">
              <h2>Folder Management</h2>
              <button className="modal-close" onClick={() => setShowFolderManager(false)}>
                <X size={20} />
              </button>
            </div>
            <FolderManager
              projectId={project.id}
              companyId={companyId}
              folders={folders}
              onFoldersChange={loadFolders}
              onClose={() => setShowFolderManager(false)}
              onShowToast={onShowToast}
            />
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentUploadModal
          projectId={project.id}
          companyId={companyId}
          folderId={uploadToFolder?.id}
          folderName={uploadToFolder?.name}
          onClose={() => {
            setShowUploadModal(false)
            setUploadToFolder(null)
          }}
          onUploadComplete={handleUploadComplete}
          onShowToast={onShowToast}
        />
      )}
    </div>
  )
}
