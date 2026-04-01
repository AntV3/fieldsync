/**
 * CostCodeManager — Manage company cost codes for job costing.
 * Supports CSI template import, CRUD, and hierarchical display.
 */
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import {
  Hash, Plus, Trash2, Edit3, Download, Upload,
  ChevronRight, ChevronDown, Filter, Search
} from 'lucide-react'

const CATEGORIES = [
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'other', label: 'Other' }
]

const CATEGORY_COLORS = {
  labor: '#3b82f6',
  material: '#10b981',
  equipment: '#f59e0b',
  subcontractor: '#8b5cf6',
  other: '#6b7280'
}

export default function CostCodeManager({ companyId, onShowToast }) {
  const [costCodes, setCostCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCode, setEditingCode] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [expandedGroups, setExpandedGroups] = useState({})

  // Form state
  const [formData, setFormData] = useState({
    code: '', description: '', category: 'labor', parent_code: ''
  })

  const loadCostCodes = useCallback(async () => {
    try {
      setLoading(true)
      const data = await db.getAllCostCodes(companyId, true)
      setCostCodes(data || [])
    } catch (err) {
      console.error('Failed to load cost codes:', err)
      onShowToast?.('Failed to load cost codes', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, onShowToast])

  useEffect(() => { loadCostCodes() }, [loadCostCodes])

  const handleSave = async () => {
    if (!formData.code || !formData.description) {
      onShowToast?.('Code and description are required', 'error')
      return
    }
    try {
      if (editingCode) {
        await db.updateCostCode(editingCode.id, formData)
        onShowToast?.('Cost code updated', 'success')
      } else {
        await db.createCostCode(companyId, formData)
        onShowToast?.('Cost code created', 'success')
      }
      setShowForm(false)
      setEditingCode(null)
      setFormData({ code: '', description: '', category: 'labor', parent_code: '' })
      loadCostCodes()
    } catch (err) {
      onShowToast?.(err.message || 'Failed to save cost code', 'error')
    }
  }

  const handleDelete = async (costCode) => {
    if (!confirm(`Deactivate cost code ${costCode.code}?`)) return
    try {
      await db.deleteCostCode(costCode.id)
      onShowToast?.('Cost code deactivated', 'success')
      loadCostCodes()
    } catch (err) {
      onShowToast?.('Failed to delete cost code', 'error')
    }
  }

  const handleImportCSI = async () => {
    if (!confirm('Import standard CSI MasterFormat cost codes? This will not overwrite existing codes.')) return
    try {
      const imported = await db.importCSITemplates(companyId)
      onShowToast?.(`Imported ${imported.length} cost codes`, 'success')
      loadCostCodes()
    } catch (err) {
      onShowToast?.('Failed to import templates', 'error')
    }
  }

  const handleEdit = (cc) => {
    setEditingCode(cc)
    setFormData({
      code: cc.code,
      description: cc.description,
      category: cc.category,
      parent_code: cc.parent_code || ''
    })
    setShowForm(true)
  }

  // Filter and group codes
  const filtered = costCodes.filter(cc => {
    if (filterCategory && cc.category !== filterCategory) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return cc.code.toLowerCase().includes(term) || cc.description.toLowerCase().includes(term)
    }
    return true
  })

  // Group by parent code
  const parentCodes = [...new Set(filtered.map(cc => cc.parent_code).filter(Boolean))]
  const topLevel = filtered.filter(cc => !cc.parent_code)
  const children = {}
  for (const cc of filtered) {
    if (cc.parent_code) {
      if (!children[cc.parent_code]) children[cc.parent_code] = []
      children[cc.parent_code].push(cc)
    }
  }

  return (
    <div className="cost-code-manager">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Hash size={20} /> Cost Codes
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleImportCSI} title="Import CSI MasterFormat templates">
            <Download size={14} /> CSI Templates
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditingCode(null); setFormData({ code: '', description: '', category: 'labor', parent_code: '' }); setShowForm(true) }}>
            <Plus size={14} /> Add Code
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input
            type="text"
            placeholder="Search codes..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2rem', width: '100%' }}
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="form-input"
          style={{ width: 'auto' }}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--bg-secondary, #f8f9fa)' }}>
          <h4 style={{ margin: '0 0 0.75rem' }}>{editingCode ? 'Edit Cost Code' : 'New Cost Code'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="Code (e.g. 03-200)"
              value={formData.code}
              onChange={e => setFormData(f => ({ ...f, code: e.target.value }))}
              className="form-input"
            />
            <input
              type="text"
              placeholder="Description"
              value={formData.description}
              onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
              className="form-input"
            />
            <select
              value={formData.category}
              onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}
              className="form-input"
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input
              type="text"
              placeholder="Parent code"
              value={formData.parent_code}
              onChange={e => setFormData(f => ({ ...f, parent_code: e.target.value }))}
              className="form-input"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditingCode(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              {editingCode ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Cost Code List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Loading cost codes...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
          {costCodes.length === 0
            ? 'No cost codes yet. Import CSI templates or add codes manually.'
            : 'No matching cost codes.'
          }
        </div>
      ) : (
        <div className="cost-code-list" style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.5rem', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1.5fr 1fr', padding: '0.5rem 1rem', background: 'var(--bg-tertiary, #f1f5f9)', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Code</span>
            <span>Description</span>
            <span>Category</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {topLevel.map(cc => (
            <CostCodeRow
              key={cc.id}
              costCode={cc}
              children={children[cc.code] || []}
              expanded={expandedGroups[cc.code]}
              onToggle={() => setExpandedGroups(g => ({ ...g, [cc.code]: !g[cc.code] }))}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', opacity: 0.6 }}>
        {filtered.length} cost code{filtered.length !== 1 ? 's' : ''}
        {!filterCategory && ` • ${costCodes.filter(c => c.is_active).length} active`}
      </div>
    </div>
  )
}

function CostCodeRow({ costCode: cc, children, expanded, onToggle, onEdit, onDelete }) {
  const hasChildren = children.length > 0

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 3fr 1.5fr 1fr',
        padding: '0.5rem 1rem',
        borderTop: '1px solid var(--border-color, #e5e7eb)',
        alignItems: 'center',
        opacity: cc.is_active ? 1 : 0.5,
        background: hasChildren ? 'var(--bg-secondary, #fafafa)' : 'transparent'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'monospace', fontWeight: hasChildren ? 600 : 400 }}>
          {hasChildren && (
            <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          {cc.code}
        </span>
        <span>{cc.description}</span>
        <span>
          <span style={{
            display: 'inline-block',
            padding: '0.1rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            background: CATEGORY_COLORS[cc.category] + '20',
            color: CATEGORY_COLORS[cc.category]
          }}>
            {cc.category}
          </span>
        </span>
        <span style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
          <button onClick={() => onEdit(cc)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }} title="Edit">
            <Edit3 size={14} />
          </button>
          <button onClick={() => onDelete(cc)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#ef4444' }} title="Deactivate">
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {expanded && children.map(child => (
        <div key={child.id} style={{
          display: 'grid',
          gridTemplateColumns: '2fr 3fr 1.5fr 1fr',
          padding: '0.4rem 1rem 0.4rem 2.5rem',
          borderTop: '1px solid var(--border-color, #e5e7eb)',
          alignItems: 'center',
          fontSize: '0.9em',
          opacity: child.is_active ? 1 : 0.5
        }}>
          <span style={{ fontFamily: 'monospace' }}>{child.code}</span>
          <span>{child.description}</span>
          <span>
            <span style={{
              display: 'inline-block',
              padding: '0.1rem 0.5rem',
              borderRadius: '999px',
              fontSize: '0.75rem',
              background: CATEGORY_COLORS[child.category] + '20',
              color: CATEGORY_COLORS[child.category]
            }}>
              {child.category}
            </span>
          </span>
          <span style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
            <button onClick={() => onEdit(child)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}><Edit3 size={14} /></button>
            <button onClick={() => onDelete(child)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#ef4444' }}><Trash2 size={14} /></button>
          </span>
        </div>
      ))}
    </>
  )
}
