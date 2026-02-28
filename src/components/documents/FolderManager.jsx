import { useState } from 'react'
import { X, Plus, Folder, FileText, Map, Shield, FileSignature, Camera, ClipboardList, AlertTriangle, HelpCircle, Send, Trash2, Edit2, GripVertical, Loader2 } from 'lucide-react'
import { db } from '../../lib/supabase'

// Available icons for folders
const FOLDER_ICON_OPTIONS = [
  { id: 'folder', label: 'Folder', icon: Folder },
  { id: 'plans', label: 'Plans', icon: Map },
  { id: 'specs', label: 'Specs', icon: FileText },
  { id: 'permits', label: 'Permits', icon: Shield },
  { id: 'contracts', label: 'Contracts', icon: FileSignature },
  { id: 'submittals', label: 'Submittals', icon: Send },
  { id: 'rfis', label: 'RFIs', icon: HelpCircle },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'reports', label: 'Reports', icon: ClipboardList },
  { id: 'safety', label: 'Safety', icon: AlertTriangle }
]

// Available colors for folders
const FOLDER_COLOR_OPTIONS = [
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'green', label: 'Green', hex: '#10b981' },
  { id: 'yellow', label: 'Yellow', hex: '#f59e0b' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'purple', label: 'Purple', hex: '#8b5cf6' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'gray', label: 'Gray', hex: '#6b7280' }
]

export default function FolderManager({
  projectId,
  companyId,
  folders,
  onFoldersChange,
  onClose: _onClose,
  onShowToast
}) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingFolder, setEditingFolder] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [folderName, setFolderName] = useState('')
  const [folderIcon, setFolderIcon] = useState('folder')
  const [folderColor, setFolderColor] = useState('blue')
  const [folderDescription, setFolderDescription] = useState('')

  const resetForm = () => {
    setFolderName('')
    setFolderIcon('folder')
    setFolderColor('blue')
    setFolderDescription('')
    setEditingFolder(null)
  }

  const openCreateModal = () => {
    resetForm()
    setShowCreateModal(true)
  }

  const openEditModal = (folder) => {
    setFolderName(folder.name)
    setFolderIcon(folder.icon || 'folder')
    setFolderColor(folder.color || 'blue')
    setFolderDescription(folder.description || '')
    setEditingFolder(folder)
    setShowCreateModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!folderName.trim()) {
      onShowToast?.('Please enter a folder name', 'error')
      return
    }

    setSaving(true)
    try {
      if (editingFolder) {
        // Update existing folder
        await db.updateFolder(editingFolder.id, {
          name: folderName.trim(),
          icon: folderIcon,
          color: folderColor,
          description: folderDescription.trim() || null
        })
        onShowToast?.('Folder updated', 'success')
      } else {
        // Create new folder
        const maxOrder = Math.max(0, ...folders.map(f => f.sort_order || 0))
        await db.createFolder(companyId, projectId, {
          name: folderName.trim(),
          icon: folderIcon,
          color: folderColor,
          description: folderDescription.trim() || null,
          sort_order: maxOrder + 1
        })
        onShowToast?.('Folder created', 'success')
      }
      setShowCreateModal(false)
      resetForm()
      onFoldersChange?.()
    } catch (error) {
      console.error('Error saving folder:', error)
      if (error.message?.includes('duplicate key') || error.code === '23505') {
        onShowToast?.('A folder with this name already exists', 'error')
      } else {
        onShowToast?.('Failed to save folder', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (folder) => {
    if (!confirm(`Delete "${folder.name}"? Documents in this folder will be moved to Unfiled.`)) {
      return
    }

    setDeleting(folder.id)
    try {
      await db.deleteFolder(folder.id)
      onShowToast?.('Folder deleted', 'success')
      onFoldersChange?.()
    } catch (error) {
      console.error('Error deleting folder:', error)
      onShowToast?.('Failed to delete folder', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const selectedIconData = FOLDER_ICON_OPTIONS.find(i => i.id === folderIcon)
  const selectedColorData = FOLDER_COLOR_OPTIONS.find(c => c.id === folderColor)

  return (
    <div className="folder-manager">
      {/* Header */}
      <div className="folder-manager-header">
        <h3>Manage Folders</h3>
        <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
          <Plus size={16} />
          New Folder
        </button>
      </div>

      {/* Folder list */}
      <div className="folder-manager-list">
        {folders.length === 0 ? (
          <div className="folder-manager-empty">
            <Folder size={40} />
            <p>No folders created yet</p>
            <button className="btn btn-secondary" onClick={openCreateModal}>
              Create First Folder
            </button>
          </div>
        ) : (
          folders.map(folder => {
            const IconComp = FOLDER_ICON_OPTIONS.find(i => i.id === folder.icon)?.icon || Folder
            const colorHex = FOLDER_COLOR_OPTIONS.find(c => c.id === folder.color)?.hex || '#3b82f6'
            return (
              <div key={folder.id} className="folder-manager-item">
                <div className="folder-manager-item-drag">
                  <GripVertical size={16} />
                </div>
                <div
                  className="folder-manager-item-icon"
                  style={{ backgroundColor: `${colorHex}15` }}
                >
                  <IconComp size={20} style={{ color: colorHex }} />
                </div>
                <div className="folder-manager-item-info">
                  <span className="folder-manager-item-name">{folder.name}</span>
                  <span className="folder-manager-item-count">
                    {folder.document_count || 0} documents
                  </span>
                </div>
                <div className="folder-manager-item-actions">
                  <button
                    className="folder-action-btn"
                    onClick={() => openEditModal(folder)}
                    title="Edit folder"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    className="folder-action-btn danger"
                    onClick={() => handleDelete(folder)}
                    disabled={deleting === folder.id}
                    title="Delete folder"
                  >
                    {deleting === folder.id ? (
                      <Loader2 size={16} className="spinner" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="folder-modal" onClick={e => e.stopPropagation()}>
            <div className="folder-modal-header">
              <h3>{editingFolder ? 'Edit Folder' : 'Create Folder'}</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="folder-modal-content">
                {/* Preview */}
                <div className="folder-preview">
                  <div
                    className="folder-preview-icon"
                    style={{ backgroundColor: `${selectedColorData?.hex}15` }}
                  >
                    {selectedIconData && (
                      <selectedIconData.icon
                        size={40}
                        style={{ color: selectedColorData?.hex }}
                      />
                    )}
                  </div>
                  <span className="folder-preview-name">
                    {folderName || 'Folder Name'}
                  </span>
                </div>

                {/* Name input */}
                <div className="form-group">
                  <label htmlFor="folder-name">Folder Name *</label>
                  <input
                    id="folder-name"
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="e.g., Site Plans, Safety Documents"
                    autoFocus
                  />
                </div>

                {/* Icon selection */}
                <div className="form-group">
                  <label>Icon</label>
                  <div className="folder-icon-grid">
                    {FOLDER_ICON_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`folder-icon-option ${folderIcon === opt.id ? 'selected' : ''}`}
                        onClick={() => setFolderIcon(opt.id)}
                        title={opt.label}
                      >
                        <opt.icon size={20} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color selection */}
                <div className="form-group">
                  <label>Color</label>
                  <div className="folder-color-grid">
                    {FOLDER_COLOR_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`folder-color-option ${folderColor === opt.id ? 'selected' : ''}`}
                        onClick={() => setFolderColor(opt.id)}
                        style={{ backgroundColor: opt.hex }}
                        title={opt.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="form-group">
                  <label htmlFor="folder-desc">Description (optional)</label>
                  <input
                    id="folder-desc"
                    type="text"
                    value={folderDescription}
                    onChange={(e) => setFolderDescription(e.target.value)}
                    placeholder="Brief description of folder contents"
                  />
                </div>
              </div>

              <div className="folder-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!folderName.trim() || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      Saving...
                    </>
                  ) : editingFolder ? (
                    'Save Changes'
                  ) : (
                    'Create Folder'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
