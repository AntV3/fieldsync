import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, Search, FolderOpen, Loader2, X, ArrowLeft, Folder, FileText, Download, File, Image, FileSpreadsheet, Plus, Eye, Archive, CheckCircle, Settings2 } from 'lucide-react'
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

  // Track selected folder for real-time updates
  const selectedFolderRef = useRef(null)

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

  // Initial load and real-time subscriptions
  useEffect(() => {
    loadFolders()

    // Subscribe to real-time document and folder changes
    const folderSub = db.subscribeToDocumentFolders?.(project.id, () => {
      loadFolders()
    })
    const docSub = db.subscribeToDocuments?.(project.id, () => {
      // Refresh folder counts when documents change
      loadFolders()
      // If a folder is open, refresh its documents
      if (selectedFolderRef.current) {
        loadFolderDocuments(selectedFolderRef.current, true)
      }
    })

    return () => {
      folderSub?.unsubscribe?.()
      docSub?.unsubscribe?.()
    }
  }, [loadFolders, project.id])

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
    selectedFolderRef.current = folder
    setSearchQuery('')
    setSearchResults(null)
    loadFolderDocuments(folder, true)
  }

  // Go back to folder list
  const goBack = () => {
    setSelectedFolder(null)
    selectedFolderRef.current = null
    setDocuments([])
    setSearchResults(null)
    setSearchQuery('')
  }

  // Search documents
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

  // Debounced search
  const searchTimeoutRef = useRef(null)
  const handleSearch = useCallback((query) => {
    setSearchQuery(query)
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query)
    }, 300)
  }, [performSearch])

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
    loadFolders()
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

  // Field user view - clean folder grid
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
      <div className="docs-container">
        <div className="docs-loading">
          <Loader2 size={24} className="spinner" />
          <span>Loading documents...</span>
        </div>
      </div>
    )
  }

  // Inside folder view
  if (selectedFolder) {
    const folderColor = FOLDER_COLORS[selectedFolder.color] || FOLDER_COLORS.blue
    const displayDocs = searchResults !== null ? searchResults : documents

    return (
      <div className="docs-container">
        {/* Folder Header */}
        <div className="docs-folder-header">
          <button className="docs-back-btn" onClick={goBack}>
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          <div className="docs-folder-info">
            <div className="docs-folder-icon" style={{ backgroundColor: `${folderColor}15` }}>
              <Folder size={20} style={{ color: folderColor }} />
            </div>
            <div>
              <h2 className="docs-folder-name">{selectedFolder.name}</h2>
              <span className="docs-folder-count">{totalCount} files</span>
            </div>
          </div>

          <button className="docs-upload-btn" onClick={() => startUploadToFolder(selectedFolder)}>
            <Upload size={18} />
            <span>Upload</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="docs-search-wrapper">
          <div className="docs-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search in folder..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults(null) }}>
                <X size={16} />
              </button>
            )}
            {searching && <Loader2 size={16} className="spinner" />}
          </div>
        </div>

        {/* Search Results Info */}
        {searchResults !== null && (
          <div className="docs-search-info">
            <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"</span>
            <button onClick={() => { setSearchQuery(''); setSearchResults(null) }}>Clear</button>
          </div>
        )}

        {/* Document List */}
        <div className="docs-list">
          {loadingDocs ? (
            <div className="docs-loading">
              <Loader2 size={24} className="spinner" />
              <span>Loading...</span>
            </div>
          ) : displayDocs.length === 0 ? (
            <div className="docs-empty">
              <Folder size={48} style={{ color: folderColor, opacity: 0.3 }} />
              <h3>{searchResults !== null ? 'No results' : 'Empty folder'}</h3>
              <p>{searchResults !== null ? 'Try a different search term.' : 'Upload your first document.'}</p>
              {searchResults === null && (
                <button className="docs-empty-btn" onClick={() => startUploadToFolder(selectedFolder)}>
                  <Upload size={16} />
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
                  <div key={doc.id} className={`docs-item ${isPending ? 'pending' : ''}`}>
                    <div className="docs-item-icon">
                      <FileIcon size={20} />
                    </div>
                    <div className="docs-item-info">
                      <span className="docs-item-name">
                        {doc.name}
                        {doc.version > 1 && <span className="docs-item-version">v{doc.version}</span>}
                      </span>
                      <span className="docs-item-meta">
                        {formatFileSize(doc.file_size_bytes)} · {formatDate(doc.uploaded_at)}
                      </span>
                    </div>
                    {isPending && <span className="docs-badge pending">Pending</span>}
                    <div className="docs-item-actions">
                      <button onClick={() => handleDocumentAction('view', doc)} title="View">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => handleDocumentAction('download', doc)} title="Download">
                        <Download size={16} />
                      </button>
                      {isPending && (
                        <button className="approve" onClick={() => handleDocumentAction('approve', doc)} title="Approve">
                          <CheckCircle size={16} />
                        </button>
                      )}
                      <button className="danger" onClick={() => handleDocumentAction('archive', doc)} title="Archive">
                        <Archive size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Load More */}
              {hasMore && searchResults === null && (
                <button
                  className="docs-load-more"
                  onClick={() => {
                    setPage(prev => prev + 1)
                    loadFolderDocuments(selectedFolder, false)
                  }}
                  disabled={loadingDocs}
                >
                  Load More ({documents.length} of {totalCount})
                </button>
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
            onClose={() => { setShowUploadModal(false); setUploadToFolder(null) }}
            onUploadComplete={handleUploadComplete}
            onShowToast={onShowToast}
          />
        )}
      </div>
    )
  }

  // Main folder list view
  return (
    <div className="docs-container">
      {/* Header */}
      <div className="docs-header">
        <div className="docs-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults(null) }}>
              <X size={16} />
            </button>
          )}
          {searching && <Loader2 size={16} className="spinner" />}
        </div>

        <button className="docs-manage-btn" onClick={() => setShowFolderManager(true)}>
          <Settings2 size={18} />
          <span>Manage</span>
        </button>
      </div>

      {/* Search Results */}
      {searchResults !== null ? (
        <>
          <div className="docs-search-info">
            <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
            <button onClick={() => { setSearchQuery(''); setSearchResults(null) }}>Clear</button>
          </div>
          <div className="docs-list">
            {searchResults.map(doc => {
              const FileIcon = getFileIcon(doc.mime_type)
              return (
                <div key={doc.id} className="docs-item">
                  <div className="docs-item-icon">
                    <FileIcon size={20} />
                  </div>
                  <div className="docs-item-info">
                    <span className="docs-item-name">{doc.name}</span>
                    <span className="docs-item-meta">
                      {formatFileSize(doc.file_size_bytes)} · {formatDate(doc.uploaded_at)}
                    </span>
                  </div>
                  <div className="docs-item-actions">
                    <button onClick={() => handleDocumentAction('view', doc)}>
                      <Eye size={16} />
                    </button>
                    <button onClick={() => handleDocumentAction('download', doc)}>
                      <Download size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        /* Folder Grid */
        <div className="docs-grid">
          {folders.length === 0 ? (
            <div className="docs-empty-state">
              <FolderOpen size={56} />
              <h3>No folders yet</h3>
              <p>Create folders to organize your documents</p>
              <button onClick={() => setShowFolderManager(true)}>
                <Plus size={18} />
                Create Folder
              </button>
            </div>
          ) : (
            folders.map(folder => {
              const color = FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue
              return (
                <div key={folder.id} className="docs-folder-card" onClick={() => openFolder(folder)}>
                  <div className="docs-folder-card-icon" style={{ backgroundColor: `${color}12` }}>
                    <Folder size={28} style={{ color }} />
                  </div>
                  <div className="docs-folder-card-content">
                    <span className="docs-folder-card-name">{folder.name}</span>
                    <span className="docs-folder-card-count">
                      {folder.document_count || 0} {folder.document_count === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                  <button
                    className="docs-folder-card-upload"
                    onClick={(e) => { e.stopPropagation(); startUploadToFolder(folder) }}
                    title="Upload"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Folder Manager Modal */}
      {showFolderManager && (
        <div className="modal-overlay" onClick={() => setShowFolderManager(false)}>
          <div className="docs-manager-modal" onClick={e => e.stopPropagation()}>
            <div className="docs-manager-header">
              <h2>Manage Folders</h2>
              <button onClick={() => setShowFolderManager(false)}>
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
          onClose={() => { setShowUploadModal(false); setUploadToFolder(null) }}
          onUploadComplete={handleUploadComplete}
          onShowToast={onShowToast}
        />
      )}
    </div>
  )
}
