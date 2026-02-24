import { useState, useEffect, useRef, useCallback } from 'react'
import { Folder, FileText, Map, Shield, FileSignature, Camera, ClipboardList, AlertTriangle, HelpCircle, Send, Download, ArrowLeft, Loader2, File, Image, FileSpreadsheet, ChevronRight, Upload, Plus } from 'lucide-react'
import { db } from '../../lib/supabase'
import DocumentUploadModal from './DocumentUploadModal'

// Icon mapping
const FOLDER_ICONS = {
  folder: Folder,
  plans: Map,
  specs: FileText,
  permits: Shield,
  contracts: FileSignature,
  submittals: Send,
  rfis: HelpCircle,
  photos: Camera,
  reports: ClipboardList,
  safety: AlertTriangle
}

// Color mapping
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

// Get file icon
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

export default function FolderGrid({ projectId, companyId, onShowToast, allowUpload = false }) {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Use ref to track selected folder for real-time updates
  const selectedFolderRef = useRef(null)

  const loadFolders = useCallback(async () => {
    setLoading(true)
    try {
      const folderList = await db.getProjectFolders(projectId)
      setFolders(folderList)
    } catch (error) {
      console.error('Error loading folders:', error)
      onShowToast?.('Failed to load folders', 'error')
    } finally {
      setLoading(false)
    }
  }, [projectId, onShowToast])

  const loadDocuments = useCallback(async (folderId) => {
    if (!folderId) return
    setLoadingDocs(true)
    try {
      const result = await db.getFolderDocuments(folderId)
      setDocuments(result.documents)
    } catch (error) {
      console.error('Error loading documents:', error)
      onShowToast?.('Failed to load documents', 'error')
    } finally {
      setLoadingDocs(false)
    }
  }, [onShowToast])

  useEffect(() => {
    loadFolders()

    // Subscribe to real-time document and folder changes
    const folderSub = db.subscribeToDocumentFolders?.(projectId, () => {
      loadFolders()
    })
    const docSub = db.subscribeToDocuments?.(projectId, () => {
      // Refresh folder counts when documents change
      loadFolders()
      // If a folder is open, refresh its documents
      if (selectedFolderRef.current) {
        loadDocuments(selectedFolderRef.current.id)
      }
    })

    return () => {
      folderSub?.unsubscribe?.()
      docSub?.unsubscribe?.()
    }
  }, [projectId, loadFolders, loadDocuments])

  const openFolder = async (folder) => {
    setSelectedFolder(folder)
    selectedFolderRef.current = folder
    await loadDocuments(folder.id)
  }

  const handleDownload = async (doc) => {
    try {
      await db.logDocumentAccess(doc.id, 'downloaded')
      const url = doc.url || `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/project-documents/${doc.storage_path}`
      window.open(url, '_blank')
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  const goBack = () => {
    setSelectedFolder(null)
    selectedFolderRef.current = null
    setDocuments([])
  }

  const handleUploadComplete = () => {
    setShowUploadModal(false)
    loadFolders()
    if (selectedFolder) {
      loadDocuments(selectedFolder.id)
    }
    onShowToast?.('Document uploaded successfully', 'success')
  }

  // Loading
  if (loading) {
    return (
      <div className="field-docs">
        <div className="field-docs-loading">
          <Loader2 size={24} className="spinner" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Document list view
  if (selectedFolder) {
    const FolderIcon = FOLDER_ICONS[selectedFolder.icon] || Folder
    const folderColor = FOLDER_COLORS[selectedFolder.color] || FOLDER_COLORS.blue

    return (
      <div className="field-docs">
        {/* Header */}
        <div className="field-docs-header">
          <button className="field-docs-back" onClick={goBack}>
            <ArrowLeft size={20} />
          </button>
          <div className="field-docs-title">
            <div className="field-docs-title-icon" style={{ backgroundColor: `${folderColor}15` }}>
              <FolderIcon size={20} style={{ color: folderColor }} />
            </div>
            <div className="field-docs-title-text">
              <h2>{selectedFolder.name}</h2>
              <span>{documents.length} files</span>
            </div>
          </div>
          {allowUpload && (
            <button
              className="field-docs-upload-btn"
              onClick={() => setShowUploadModal(true)}
              title="Upload document"
            >
              <Upload size={18} />
              <span>Upload</span>
            </button>
          )}
        </div>

        {/* Documents */}
        <div className="field-docs-list">
          {loadingDocs ? (
            <div className="field-docs-loading">
              <Loader2 size={24} className="spinner" />
              <span>Loading...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="field-docs-empty">
              <Folder size={48} style={{ color: folderColor, opacity: 0.3 }} />
              <p>No documents yet</p>
              {allowUpload && (
                <button className="field-docs-upload-cta" onClick={() => setShowUploadModal(true)}>
                  <Upload size={16} />
                  Upload First Document
                </button>
              )}
            </div>
          ) : (
            documents.map(doc => {
              const FileIcon = getFileIcon(doc.mime_type)
              return (
                <button key={doc.id} className="field-doc-item" onClick={() => handleDownload(doc)}>
                  <div className="field-doc-icon">
                    <FileIcon size={22} />
                  </div>
                  <div className="field-doc-info">
                    <span className="field-doc-name">{doc.name}</span>
                    <span className="field-doc-size">{formatFileSize(doc.file_size_bytes)}</span>
                  </div>
                  <Download size={20} className="field-doc-download" />
                </button>
              )
            })
          )}
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <DocumentUploadModal
            projectId={projectId}
            companyId={companyId}
            folderId={selectedFolder?.id}
            folderName={selectedFolder?.name}
            onClose={() => setShowUploadModal(false)}
            onUploadComplete={handleUploadComplete}
            onShowToast={onShowToast}
          />
        )}
      </div>
    )
  }

  // Folder grid
  return (
    <div className="field-docs">
      <div className="field-docs-grid">
        {folders.length === 0 ? (
          <div className="field-docs-empty">
            <Folder size={56} />
            <h3>No documents</h3>
            <p>Documents will appear here when added</p>
          </div>
        ) : (
          folders.map(folder => {
            const Icon = FOLDER_ICONS[folder.icon] || Folder
            const color = FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue
            const count = folder.document_count || 0
            return (
              <button key={folder.id} className="field-folder-card" onClick={() => openFolder(folder)}>
                <div className="field-folder-icon" style={{ backgroundColor: `${color}12` }}>
                  <Icon size={28} style={{ color }} />
                </div>
                <div className="field-folder-info">
                  <span className="field-folder-name">{folder.name}</span>
                  <span className="field-folder-count">{count} {count === 1 ? 'file' : 'files'}</span>
                </div>
                <ChevronRight size={20} className="field-folder-arrow" />
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
