import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

export default function PermissionEditor({ member, project, user, onClose, onUpdate, onShowToast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [allPermissions, setAllPermissions] = useState([])
  const [selectedPermissions, setSelectedPermissions] = useState(new Set())
  const [roleTemplates, setRoleTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')

  useEffect(() => {
    loadPermissions()
  }, [member.id])

  const loadPermissions = async () => {
    setLoading(true)
    try {
      // Load all available permissions
      const permissions = await db.getAllPermissions()
      setAllPermissions(permissions)

      // Load user's current permissions
      const userPerms = await db.getUserProjectPermissions(member.user_id, project.id)
      setSelectedPermissions(new Set(userPerms))

      // Load templates
      const templates = await db.getRoleTemplates()
      setRoleTemplates(templates)
    } catch (error) {
      console.error('Error loading permissions:', error)
      onShowToast?.('Error loading permissions', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePermission = (permissionKey) => {
    const newPerms = new Set(selectedPermissions)
    if (newPerms.has(permissionKey)) {
      newPerms.delete(permissionKey)
    } else {
      newPerms.add(permissionKey)
    }
    setSelectedPermissions(newPerms)
  }

  const handleApplyTemplate = (templateKey) => {
    if (!templateKey) return

    const template = roleTemplates.find(t => t.role_key === templateKey)
    if (template) {
      setSelectedPermissions(new Set(template.default_permissions))
      setSelectedTemplate(templateKey)
      onShowToast?.(`Applied ${template.role_name} template`, 'success')
    }
  }

  const handleToggleCategory = (category, allSelected) => {
    const categoryPerms = allPermissions
      .filter(p => p.category === category)
      .map(p => p.permission_key)

    const newPerms = new Set(selectedPermissions)

    if (allSelected) {
      // Deselect all in category
      categoryPerms.forEach(key => newPerms.delete(key))
    } else {
      // Select all in category
      categoryPerms.forEach(key => newPerms.add(key))
    }

    setSelectedPermissions(newPerms)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await db.setProjectPermissions(
        member.id,
        Array.from(selectedPermissions),
        user.id
      )

      if (result.success) {
        onShowToast?.('Permissions updated successfully', 'success')
        onUpdate?.()
      } else {
        onShowToast?.(result.error || 'Failed to update permissions', 'error')
      }
    } catch (error) {
      console.error('Error saving permissions:', error)
      onShowToast?.('Failed to save permissions', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Group permissions by category
  const permissionsByCategory = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = []
    }
    acc[perm.category].push(perm)
    return acc
  }, {})

  const categoryLabels = {
    financial: 'Financial & Budgets',
    materials: 'Materials Management',
    operations: 'Daily Operations & T&M',
    equipment: 'Equipment Tracking',
    team: 'Team Management',
    safety: 'Safety & Compliance'
  }

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading permissions...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal permission-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Edit Permissions</h3>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {member.users.name || member.users.email} - {member.project_role}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Template Selector */}
          <div className="template-selector" style={{
            padding: '1rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '8px',
            marginBottom: '1.5rem'
          }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              Quick Apply Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => handleApplyTemplate(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Choose a template...</option>
              {roleTemplates.map(template => (
                <option key={template.role_key} value={template.role_key}>
                  {template.role_name} - {template.description}
                </option>
              ))}
            </select>
            <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
              Apply a role template, then customize individual permissions below
            </small>
          </div>

          {/* Permissions by Category */}
          <div className="permissions-list">
            {Object.entries(permissionsByCategory).map(([category, permissions]) => {
              const categoryPerms = permissions.map(p => p.permission_key)
              const selectedCount = categoryPerms.filter(k => selectedPermissions.has(k)).length
              const allSelected = selectedCount === categoryPerms.length

              return (
                <div key={category} className="permission-category">
                  <div className="category-header">
                    <h4>{categoryLabels[category] || category}</h4>
                    <button
                      className="btn-text-small"
                      onClick={() => handleToggleCategory(category, allSelected)}
                    >
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="permission-checkboxes">
                    {permissions.map(perm => (
                      <label key={perm.permission_key} className="permission-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.has(perm.permission_key)}
                          onChange={() => handleTogglePermission(perm.permission_key)}
                        />
                        <div className="permission-info">
                          <span className="permission-name">{perm.permission_name}</span>
                          <span className="permission-description">{perm.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="permission-summary" style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '8px'
          }}>
            <strong>{selectedPermissions.size}</strong> permission{selectedPermissions.size !== 1 ? 's' : ''} selected
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  )
}
