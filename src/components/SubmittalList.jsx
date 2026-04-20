/**
 * SubmittalList — Submittal tracking for shop drawings, product data, samples.
 * Manages the full submittal lifecycle from draft to approval.
 */
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import {
  FileCheck, Plus, Search, ChevronDown, ChevronRight,
  Calendar, RotateCcw
} from 'lucide-react'

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: '#6b7280', bg: '#6b728015' },
  submitted: { label: 'Submitted', color: '#3b82f6', bg: '#3b82f615' },
  under_review: { label: 'Under Review', color: '#f59e0b', bg: '#f59e0b15' },
  approved: { label: 'Approved', color: '#10b981', bg: '#10b98115' },
  approved_as_noted: { label: 'Approved as Noted', color: '#10b981', bg: '#10b98115' },
  revise_resubmit: { label: 'Revise & Resubmit', color: '#ef4444', bg: '#ef444415' },
  rejected: { label: 'Rejected', color: '#ef4444', bg: '#ef444415' },
  closed: { label: 'Closed', color: '#6b7280', bg: '#6b728015' }
}

const TYPE_LABELS = {
  shop_drawing: 'Shop Drawing',
  product_data: 'Product Data',
  sample: 'Sample',
  mock_up: 'Mock-Up',
  test_report: 'Test Report',
  certificate: 'Certificate',
  design_data: 'Design Data',
  other: 'Other'
}

export default function SubmittalList({ project, company, costCodes = [], onShowToast }) {
  const [submittals, setSubmittals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSubmittal, setEditingSubmittal] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, overdue: 0 })

  const [formData, setFormData] = useState({
    title: '', description: '', spec_section: '',
    submittal_type: 'shop_drawing', submitted_to: '',
    responsible_contractor: '', lead_time_days: 0,
    required_date: '', cost_code_id: '', notes: ''
  })

  const loadSubmittals = useCallback(async () => {
    try {
      setLoading(true)
      const [data, stats] = await Promise.all([
        db.getSubmittals(project.id),
        db.getSubmittalSummary(project.id)
      ])
      setSubmittals(data || [])
      setSummary(stats)
    } catch (err) {
      console.error('Failed to load submittals:', err)
      onShowToast?.('Failed to load submittals', 'error')
    } finally {
      setLoading(false)
    }
  }, [project.id, onShowToast])

  useEffect(() => { loadSubmittals() }, [loadSubmittals])

  const handleSave = async () => {
    if (!formData.title) {
      onShowToast?.('Title is required', 'error')
      return
    }
    try {
      if (editingSubmittal) {
        await db.updateSubmittal(editingSubmittal.id, formData)
        onShowToast?.('Submittal updated', 'success')
      } else {
        await db.createSubmittal(project.id, company.id, formData)
        onShowToast?.('Submittal created', 'success')
      }
      resetForm()
      loadSubmittals()
    } catch (err) {
      onShowToast?.(err.message || 'Failed to save submittal', 'error')
    }
  }

  const handleStatusChange = async (submittalId, newStatus) => {
    try {
      await db.updateSubmittal(submittalId, { status: newStatus })
      onShowToast?.(`Status updated to ${STATUS_CONFIG[newStatus]?.label || newStatus}`, 'success')
      loadSubmittals()
    } catch (_err) {
      onShowToast?.('Failed to update status', 'error')
    }
  }

  const handleRevision = async (submittal) => {
    try {
      await db.createRevision(submittal.id, project.id, company.id)
      onShowToast?.('New revision created', 'success')
      loadSubmittals()
    } catch (_err) {
      onShowToast?.('Failed to create revision', 'error')
    }
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingSubmittal(null)
    setFormData({ title: '', description: '', spec_section: '', submittal_type: 'shop_drawing', submitted_to: '', responsible_contractor: '', lead_time_days: 0, required_date: '', cost_code_id: '', notes: '' })
  }

  const handleEdit = (sub) => {
    setEditingSubmittal(sub)
    setFormData({
      title: sub.title,
      description: sub.description || '',
      spec_section: sub.spec_section || '',
      submittal_type: sub.submittal_type,
      submitted_to: sub.submitted_to || '',
      responsible_contractor: sub.responsible_contractor || '',
      lead_time_days: sub.lead_time_days || 0,
      required_date: sub.required_date || '',
      cost_code_id: sub.cost_code_id || '',
      notes: sub.notes || ''
    })
    setShowForm(true)
  }

  const filtered = submittals.filter(s => {
    if (filterStatus && s.status !== filterStatus) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return s.title.toLowerCase().includes(term) ||
        (s.spec_section || '').toLowerCase().includes(term) ||
        String(s.submittal_number).includes(term)
    }
    return true
  })

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="submittal-list">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <FileCheck size={20} /> Submittals
        </h3>
        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus size={14} /> New Submittal
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { label: 'Pending', value: summary.pending, color: '#f59e0b' },
          { label: 'Approved', value: summary.approved, color: '#10b981' },
          { label: 'Rejected', value: summary.rejected, color: '#ef4444' },
          { label: 'Overdue', value: summary.overdue, color: '#dc2626' }
        ].map(card => (
          <div key={card.label} style={{
            padding: '0.75rem', borderRadius: '0.5rem',
            border: `1px solid ${card.color}30`, background: `${card.color}08`, textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input type="text" placeholder="Search submittals..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="form-input" style={{ paddingLeft: '2rem', width: '100%' }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-input" style={{ width: 'auto' }}>
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* New/Edit Form */}
      {showForm && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--bg-secondary, #f8f9fa)' }}>
          <h4 style={{ margin: '0 0 0.75rem' }}>
            {editingSubmittal ? `Edit Submittal #${editingSubmittal.submittal_number}` : 'New Submittal'}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input type="text" placeholder="Title *" value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} className="form-input" />
            <textarea placeholder="Description" value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} className="form-input" rows={2} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <input type="text" placeholder="Spec Section (e.g. 03 30 00)" value={formData.spec_section} onChange={e => setFormData(f => ({ ...f, spec_section: e.target.value }))} className="form-input" />
              <select value={formData.submittal_type} onChange={e => setFormData(f => ({ ...f, submittal_type: e.target.value }))} className="form-input">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {costCodes.length > 0 && (
                <select value={formData.cost_code_id} onChange={e => setFormData(f => ({ ...f, cost_code_id: e.target.value }))} className="form-input">
                  <option value="">Cost Code (optional)</option>
                  {costCodes.map(cc => <option key={cc.id} value={cc.id}>{cc.code} - {cc.description}</option>)}
                </select>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem' }}>
              <input type="text" placeholder="Submitted To" value={formData.submitted_to} onChange={e => setFormData(f => ({ ...f, submitted_to: e.target.value }))} className="form-input" />
              <input type="text" placeholder="Responsible Contractor" value={formData.responsible_contractor} onChange={e => setFormData(f => ({ ...f, responsible_contractor: e.target.value }))} className="form-input" />
              <input type="number" placeholder="Lead Time (days)" value={formData.lead_time_days || ''} onChange={e => setFormData(f => ({ ...f, lead_time_days: parseInt(e.target.value) || 0 }))} className="form-input" />
              <input type="date" value={formData.required_date} onChange={e => setFormData(f => ({ ...f, required_date: e.target.value }))} className="form-input" title="Required Date" />
            </div>
            <textarea placeholder="Notes" value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} className="form-input" rows={2} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>{editingSubmittal ? 'Update' : 'Create'}</button>
          </div>
        </div>
      )}

      {/* Submittal List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Loading submittals...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
          {submittals.length === 0 ? 'No submittals yet.' : 'No matching submittals.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(sub => {
            const isExpanded = expandedId === sub.id
            const statusCfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.draft
            const isOverdue = ['draft', 'submitted', 'under_review'].includes(sub.status) && sub.required_date && sub.required_date < today

            return (
              <div key={sub.id} style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto auto',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    alignItems: 'center',
                    background: isOverdue ? '#fef2f210' : 'transparent'
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      <span style={{ fontFamily: 'monospace', marginRight: '0.5rem' }}>
                        SUB-{String(sub.submittal_number).padStart(3, '0')}
                        {sub.revision > 0 && `.${sub.revision}`}
                      </span>
                      {sub.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '0.15rem' }}>
                      {sub.spec_section && <span>{sub.spec_section} &middot; </span>}
                      {TYPE_LABELS[sub.submittal_type] || sub.submittal_type}
                      {sub.responsible_contractor && <> &middot; {sub.responsible_contractor}</>}
                      {sub.required_date && <> &middot; <Calendar size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {sub.required_date}</>}
                    </div>
                  </div>
                  {sub.cost_codes && (
                    <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', padding: '0.1rem 0.4rem', background: 'var(--bg-tertiary, #f1f5f9)', borderRadius: '0.25rem' }}>
                      {sub.cost_codes.code}
                    </span>
                  )}
                  <span style={{ padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', background: statusCfg.bg, color: statusCfg.color, fontWeight: 500 }}>
                    {statusCfg.label}
                    {isOverdue && ' (Overdue)'}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                    {sub.description && (
                      <p style={{ margin: '0.75rem 0 0.5rem', whiteSpace: 'pre-wrap' }}>{sub.description}</p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', margin: '0.5rem 0' }}>
                      {sub.submitted_to && <div><strong>Submitted To:</strong> {sub.submitted_to}</div>}
                      {sub.lead_time_days > 0 && <div><strong>Lead Time:</strong> {sub.lead_time_days} days</div>}
                      {sub.submitted_at && <div><strong>Submitted:</strong> {new Date(sub.submitted_at).toLocaleDateString()}</div>}
                      {sub.approved_at && <div><strong>Approved:</strong> {new Date(sub.approved_at).toLocaleDateString()}</div>}
                      {sub.returned_at && <div><strong>Returned:</strong> {new Date(sub.returned_at).toLocaleDateString()}</div>}
                    </div>
                    {sub.notes && <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0.5rem 0' }}>{sub.notes}</p>}

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(sub)}>Edit</button>
                      {sub.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(sub.id, 'submitted')}>Submit</button>
                      )}
                      {sub.status === 'submitted' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange(sub.id, 'under_review')}>Mark Under Review</button>
                      )}
                      {sub.status === 'under_review' && (
                        <>
                          <button className="btn btn-primary btn-sm" style={{ background: '#10b981' }} onClick={() => handleStatusChange(sub.id, 'approved')}>Approve</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange(sub.id, 'approved_as_noted')}>Approve as Noted</button>
                          <button className="btn btn-secondary btn-sm" style={{ color: '#ef4444' }} onClick={() => handleStatusChange(sub.id, 'revise_resubmit')}>Revise & Resubmit</button>
                        </>
                      )}
                      {(sub.status === 'revise_resubmit' || sub.status === 'rejected') && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleRevision(sub)}>
                          <RotateCcw size={14} /> Create Revision
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
