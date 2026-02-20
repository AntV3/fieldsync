import { useState, useEffect, useCallback, useMemo } from 'react'
import { CheckCircle2, Circle, Clock, Plus, X, MapPin, User, Filter, Trash2, Edit3, Save } from 'lucide-react'
import { supabase, isSupabaseConfigured, getSupabaseClient } from '../lib/supabase'

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High', color: '#ef4444' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'low', label: 'Low', color: '#6b7280' }
]

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', icon: Circle, color: '#ef4444' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: '#f59e0b' },
  { value: 'complete', label: 'Complete', icon: CheckCircle2, color: '#10b981' }
]

/**
 * PunchList - Tracks deficiency items that need resolution before project closeout.
 * Items are linked to work areas and can include photos, assignees, and priorities.
 */
export default function PunchList({ projectId, areas = [], companyId, onShowToast }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterArea, setFilterArea] = useState('all')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    description: '',
    area_id: '',
    assigned_to: '',
    priority: 'medium',
    notes: '',
    photo_url: ''
  })

  const loadItems = useCallback(async () => {
    if (!projectId || !isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      const { data, error } = await getSupabaseClient()
        .from('punch_list_items')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setItems(data || [])
    } catch (err) {
      console.error('Error loading punch list:', err)
      // Table might not exist yet - that's OK
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // Subscribe to real-time updates
  useEffect(() => {
    if (!projectId || !isSupabaseConfigured) return

    const channel = supabase
      .channel(`punch_list:${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'punch_list_items', filter: `project_id=eq.${projectId}` },
        () => loadItems()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, loadItems])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filterStatus !== 'all' && item.status !== filterStatus) return false
      if (filterArea !== 'all' && item.area_id !== filterArea) return false
      return true
    })
  }, [items, filterStatus, filterArea])

  const stats = useMemo(() => {
    const open = items.filter(i => i.status === 'open').length
    const inProgress = items.filter(i => i.status === 'in_progress').length
    const complete = items.filter(i => i.status === 'complete').length
    return { open, inProgress, complete, total: items.length }
  }, [items])

  const resetForm = () => {
    setFormData({ description: '', area_id: '', assigned_to: '', priority: 'medium', notes: '', photo_url: '' })
    setEditingItem(null)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.description.trim()) {
      onShowToast?.('Please enter a description', 'error')
      return
    }

    setSaving(true)
    try {
      if (editingItem) {
        const { error } = await getSupabaseClient()
          .from('punch_list_items')
          .update({
            description: formData.description.trim(),
            area_id: formData.area_id || null,
            assigned_to: formData.assigned_to.trim() || null,
            priority: formData.priority,
            notes: formData.notes.trim() || null,
            photo_url: formData.photo_url || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingItem.id)

        if (error) throw error
        onShowToast?.('Punch item updated', 'success')
      } else {
        const { error } = await getSupabaseClient()
          .from('punch_list_items')
          .insert({
            project_id: projectId,
            company_id: companyId,
            description: formData.description.trim(),
            area_id: formData.area_id || null,
            assigned_to: formData.assigned_to.trim() || null,
            priority: formData.priority,
            notes: formData.notes.trim() || null,
            photo_url: formData.photo_url || null,
            status: 'open'
          })

        if (error) throw error
        onShowToast?.('Punch item added', 'success')
      }

      resetForm()
      loadItems()
    } catch (err) {
      console.error('Error saving punch item:', err)
      onShowToast?.(err.message || 'Error saving item', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (itemId, newStatus) => {
    try {
      const updates = {
        status: newStatus,
        updated_at: new Date().toISOString()
      }
      if (newStatus === 'complete') {
        updates.completed_at = new Date().toISOString()
      } else {
        updates.completed_at = null
      }

      const { error } = await getSupabaseClient()
        .from('punch_list_items')
        .update(updates)
        .eq('id', itemId)

      if (error) throw error
      loadItems()
    } catch (err) {
      console.error('Error updating status:', err)
      onShowToast?.('Error updating status', 'error')
    }
  }

  const handleDelete = async (itemId) => {
    if (!confirm('Delete this punch item?')) return

    try {
      const { error } = await getSupabaseClient()
        .from('punch_list_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error
      onShowToast?.('Item deleted', 'success')
      loadItems()
    } catch (err) {
      console.error('Error deleting item:', err)
      onShowToast?.('Error deleting item', 'error')
    }
  }

  const handleEdit = (item) => {
    setFormData({
      description: item.description,
      area_id: item.area_id || '',
      assigned_to: item.assigned_to || '',
      priority: item.priority || 'medium',
      notes: item.notes || '',
      photo_url: item.photo_url || ''
    })
    setEditingItem(item)
    setShowForm(true)
  }

  const getAreaName = (areaId) => {
    if (!areaId) return null
    const area = areas.find(a => a.id === areaId)
    return area?.name || null
  }

  const getPriorityConfig = (priority) =>
    PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[1]

  const getStatusConfig = (status) =>
    STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]

  return (
    <div className="punch-list-card">
      {/* Header */}
      <div className="punch-list-header">
        <div className="punch-list-title">
          <CheckCircle2 size={18} />
          <h3>Punch List</h3>
          {stats.total > 0 && (
            <span className="punch-stats-inline">
              <span className="punch-stat-open">{stats.open} open</span>
              {stats.inProgress > 0 && <span className="punch-stat-progress">{stats.inProgress} in progress</span>}
              <span className="punch-stat-complete">{stats.complete}/{stats.total} complete</span>
            </span>
          )}
        </div>
        <button className="punch-add-btn" onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus size={16} />
          Add Item
        </button>
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <div className="punch-progress-bar">
          <div
            className="punch-progress-fill"
            style={{ width: `${(stats.complete / stats.total) * 100}%` }}
          />
          <span className="punch-progress-label">
            {Math.round((stats.complete / stats.total) * 100)}% complete
          </span>
        </div>
      )}

      {/* Filters */}
      {stats.total > 0 && (
        <div className="punch-filters">
          <div className="punch-filter-group">
            <Filter size={14} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="punch-filter-select">
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {areas.length > 0 && (
            <div className="punch-filter-group">
              <MapPin size={14} />
              <select value={filterArea} onChange={e => setFilterArea(e.target.value)} className="punch-filter-select">
                <option value="all">All Areas</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form className="punch-form" onSubmit={handleSubmit}>
          <div className="punch-form-header">
            <h4>{editingItem ? 'Edit Item' : 'New Punch Item'}</h4>
            <button type="button" className="punch-form-close" onClick={resetForm}>
              <X size={16} />
            </button>
          </div>

          <div className="punch-form-field">
            <label>Description *</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What needs to be fixed or completed?"
              rows={2}
              required
            />
          </div>

          <div className="punch-form-row">
            <div className="punch-form-field">
              <label>Area</label>
              <select
                value={formData.area_id}
                onChange={e => setFormData(prev => ({ ...prev, area_id: e.target.value }))}
              >
                <option value="">No area</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="punch-form-field">
              <label>Assigned To</label>
              <input
                type="text"
                value={formData.assigned_to}
                onChange={e => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                placeholder="Name or company"
              />
            </div>

            <div className="punch-form-field">
              <label>Priority</label>
              <select
                value={formData.priority}
                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="punch-form-field">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional details..."
              rows={2}
            />
          </div>

          <div className="punch-form-actions">
            <button type="button" className="punch-btn-cancel" onClick={resetForm}>Cancel</button>
            <button type="submit" className="punch-btn-save" disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving...' : editingItem ? 'Update' : 'Add Item'}
            </button>
          </div>
        </form>
      )}

      {/* Items List */}
      {loading ? (
        <div className="punch-loading">Loading punch list...</div>
      ) : filteredItems.length === 0 ? (
        <div className="punch-empty">
          <CheckCircle2 size={32} style={{ opacity: 0.3 }} />
          <p>{items.length === 0 ? 'No punch items yet' : 'No items match filters'}</p>
          {items.length === 0 && <span>Add items that need attention before project closeout</span>}
        </div>
      ) : (
        <div className="punch-items-list">
          {filteredItems.map(item => {
            const statusConfig = getStatusConfig(item.status)
            const priorityConfig = getPriorityConfig(item.priority)
            const StatusIcon = statusConfig.icon

            return (
              <div key={item.id} className={`punch-item punch-item-${item.status}`}>
                <button
                  className="punch-item-status-btn"
                  onClick={() => {
                    const nextStatus = item.status === 'open' ? 'in_progress' :
                                       item.status === 'in_progress' ? 'complete' : 'open'
                    handleStatusChange(item.id, nextStatus)
                  }}
                  title={`Click to change status (current: ${statusConfig.label})`}
                >
                  <StatusIcon size={18} style={{ color: statusConfig.color }} />
                </button>

                <div className="punch-item-content">
                  <div className="punch-item-top">
                    <span className={`punch-item-desc ${item.status === 'complete' ? 'completed' : ''}`}>
                      {item.description}
                    </span>
                    <div className="punch-item-badges">
                      <span className="punch-priority-badge" style={{ color: priorityConfig.color, borderColor: `${priorityConfig.color}40` }}>
                        {priorityConfig.label}
                      </span>
                    </div>
                  </div>

                  <div className="punch-item-meta">
                    {getAreaName(item.area_id) && (
                      <span className="punch-meta-tag">
                        <MapPin size={11} />
                        {getAreaName(item.area_id)}
                      </span>
                    )}
                    {item.assigned_to && (
                      <span className="punch-meta-tag">
                        <User size={11} />
                        {item.assigned_to}
                      </span>
                    )}
                    {item.completed_at && (
                      <span className="punch-meta-tag completed">
                        <CheckCircle2 size={11} />
                        Done {new Date(item.completed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {item.notes && (
                    <div className="punch-item-notes">{item.notes}</div>
                  )}
                </div>

                <div className="punch-item-actions">
                  <button className="punch-action-btn" onClick={() => handleEdit(item)} title="Edit">
                    <Edit3 size={14} />
                  </button>
                  <button className="punch-action-btn delete" onClick={() => handleDelete(item.id)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
