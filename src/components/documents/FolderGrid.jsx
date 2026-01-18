import { useState, useEffect } from 'react'
import { Folder, FileText, Map, Shield, FileSignature, Camera, ClipboardList, AlertTriangle, HelpCircle, Send, ChevronRight, Download, ArrowLeft, Loader2, File, Image, FileSpreadsheet } from 'lucide-react'
import { db } from '../../lib/supabase'

// Icon mapping for folder icons
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

// Color mapping for folder colors
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

export default function FolderGrid({ projectId, onShowToast }) {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(false)

  // Load folders
  useEffect(() => {
    loadFolders()
  }, [projectId])

  const loadFolders = async () => {
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
  }

  // Load documents in folder
  const openFolder = async (folder) => {
    setSelectedFolder(folder)
    setLoadingDocs(true)
    try {
      const result = await db.getFolderDocuments(folder.id)
      setDocuments(result.documents)
    } catch (error) {
      console.error('Error loading documents:', error)
      onShowToast?.('Failed to load documents', 'error')
    } finally {
      setLoadingDocs(false)
    }
  }

  // Download document
  const handleDownload = async (doc) => {
    try {
      await db.logDocumentAccess(doc.id, 'downloaded')
      const url = doc.url || `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/project-documents/${doc.storage_path}`
      window.open(url, '_blank')
    } catch (error) {
      console.error('Download error:', error)
    }
  }

  // Back to folders
  const goBack = () => {
    setSelectedFolder(null)
    setDocuments([])
  }

  if (loading) {
    return (
      <div className="folder-grid-loading">
        <Loader2 size={24} className="spinner" />
        <span>Loading folders...</span>
      </div>
    )
  }

  // Document list view (inside folder)
  if (selectedFolder) {
    const FolderIcon = FOLDER_ICONS[selectedFolder.icon] || Folder
    const folderColor = FOLDER_COLORS[selectedFolder.color] || FOLDER_COLORS.blue

    return (
      <div className="folder-documents-view">
        {/* Header */}
        <div className="folder-documents-header">
          <button className="folder-back-btn" onClick={goBack}>
            <ArrowLeft size={20} />
            Back
          </button>
          <div className="folder-title" style={{ '--folder-color': folderColor }}>
            <FolderIcon size={24} style={{ color: folderColor }} />
            <h2>{selectedFolder.name}</h2>
            <span className="folder-count">{documents.length} files</span>
          </div>
        </div>

        {/* Documents */}
        {loadingDocs ? (
          <div className="folder-grid-loading">
            <Loader2 size={24} className="spinner" />
            <span>Loading documents...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="folder-empty">
            <Folder size={48} style={{ color: folderColor, opacity: 0.3 }} />
            <p>No documents in this folder</p>
          </div>
        ) : (
          <div className="folder-document-list">
            {documents.map(doc => {
              const FileIcon = getFileIcon(doc.mime_type)
              return (
                <div key={doc.id} className="folder-document-item" onClick={() => handleDownload(doc)}>
                  <div className="folder-doc-icon">
                    <FileIcon size={24} />
                  </div>
                  <div className="folder-doc-info">
                    <span className="folder-doc-name">{doc.name}</span>
                    <span className="folder-doc-meta">
                      {formatFileSize(doc.file_size_bytes)} • {formatDate(doc.uploaded_at)}
                    </span>
                  </div>
                  <Download size={20} className="folder-doc-download" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Folder grid view
  return (
    <div className="folder-grid">
      {folders.length === 0 ? (
        <div className="folder-grid-empty">
          <Folder size={64} />
          <h3>No folders yet</h3>
          <p>The office team will create folders for your project documents.</p>
        </div>
      ) : (
        <div className="folder-grid-items">
          {folders.map(folder => {
            const Icon = FOLDER_ICONS[folder.icon] || Folder
            const color = FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue
            return (
              <button
                key={folder.id}
                className="folder-card"
                onClick={() => openFolder(folder)}
                style={{ '--folder-color': color }}
              >
                <div className="folder-card-icon" style={{ backgroundColor: `${color}15` }}>
                  <Icon size={32} style={{ color }} />
                </div>
                <div className="folder-card-info">
                  <span className="folder-card-name">{folder.name}</span>
                  <span className="folder-card-count">
                    {folder.document_count || 0} {folder.document_count === 1 ? 'file' : 'files'}
                  </span>
                </div>
                <ChevronRight size={20} className="folder-card-arrow" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
