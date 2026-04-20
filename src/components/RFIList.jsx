/**
 * RFIList — RFI tracking for field-to-office communication.
 * Lists, creates, and manages Requests for Information.
 */
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import {
  MessageSquareText, Plus, Search, Filter, Clock,
  CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
  Calendar, User, Flag
} from 'lucide-react'

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: '#6b7280', bg: '#6b728015' },
  open: { label: 'Open', color: '#3b82f6', bg: '#3b82f615' },
  answered: { label: 'Answered', color: '#10b981', bg: '#10b98115' },
  closed: { label: 'Closed', color: '#6b7280', bg: '#6b728015' }
}

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: '#6b7280' },
  normal: { label: 'Normal', color: '#3b82f6' },
  high: { label: 'High', color: '#f59e0b' },
  urgent: { label: 'Urgent', color: '#ef4444' }
}

export default function RFIList({ project, company, onShowToast }) {
  const [rfis, setRFIs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRFI, setEditingRFI] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [summary, setSummary] = useState({ total: 0, open: 0, answered: 0, closed: 0, overdue: 0 })

  // Form state
  const [formData, setFormData] = useState({
    subject: '', question: '', priority: 'normal',
    assigned_to: '', due_date: '',
    cost_impact: false, schedule_impact: false
  })

  const loadRFIs = useCallback(async () => {
    try {
      setLoading(true)
      const [data, stats] = await Promise.all([
        db.getRFIs(project.id),
        db.getRFISummary(project.id)
      ])
      setRFIs(data || [])
      setSummary(stats)
    } catch (err) {
      console.error('Failed to load RFIs:', err)
      onShowToast?.('Failed to load RFIs', 'error')
    } finally {
      setLoading(false)
    }
  }, [project.id, onShowToast])

  useEffect(() => { loadRFIs() }, [loadRFIs])

  const handleSave = async () => {
    if (!formData.subject || !formData.question) {
      onShowToast?.('Subject and question are required', 'error')
      return
    }
    try {
      if (editingRFI) {
        await db.updateRFI(editingRFI.id, formData)
        onShowToast?.('RFI updated', 'success')
      } else {
        await db.createRFI(project.id, company.id, formData)
        onShowToast?.('RFI created', 'success')
      }
      resetForm()
      loadRFIs()
    } catch (err) {
      onShowToast?.(err.message || 'Failed to save RFI', 'error')
    }
  }

  const handleAnswer = async (rfiId, answer) => {
    try {
      await db.updateRFI(rfiId, { answer, status: 'answered' })
      onShowToast?.('RFI answered', 'success')
      loadRFIs()
    } catch (_err) {
      onShowToast?.('Failed to answer RFI', 'error')
    }
  }

  const handleStatusChange = async (rfiId, newStatus) => {
    try {
      await db.updateRFI(rfiId, { status: newStatus })
      loadRFIs()
    } catch (_err) {
      onShowToast?.('Failed to update status', 'error')
    }
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingRFI(null)
    setFormData({ subject: '', question: '', priority: 'normal', assigned_to: '', due_date: '', cost_impact: false, schedule_impact: false })
  }

  const handleEdit = (rfi) => {
    setEditingRFI(rfi)
    setFormData({
      subject: rfi.subject,
      question: rfi.question,
      priority: rfi.priority,
      assigned_to: rfi.assigned_to || '',
      due_date: rfi.due_date || '',
      cost_impact: rfi.cost_impact || false,
      schedule_impact: rfi.schedule_impact || false
    })
    setShowForm(true)
  }

  // Filter
  const filtered = rfis.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return r.subject.toLowerCase().includes(term) || r.question.toLowerCase().includes(term) || String(r.rfi_number).includes(term)
    }
    return true
  })

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="rfi-list">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <MessageSquareText size={20} /> RFIs
        </h3>
        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus size={14} /> New RFI
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { label: 'Open', value: summary.open, color: '#3b82f6' },
          { label: 'Answered', value: summary.answered, color: '#10b981' },
          { label: 'Closed', value: summary.closed, color: '#6b7280' },
          { label: 'Overdue', value: summary.overdue, color: '#ef4444' }
        ].map(card => (
          <div key={card.label} style={{
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: `1px solid ${card.color}30`,
            background: `${card.color}08`,
            textAlign: 'center'
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
          <input type="text" placeholder="Search RFIs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="form-input" style={{ paddingLeft: '2rem', width: '100%' }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-input" style={{ width: 'auto' }}>
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* New/Edit Form */}
      {showForm && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--bg-secondary, #f8f9fa)' }}>
          <h4 style={{ margin: '0 0 0.75rem' }}>{editingRFI ? `Edit RFI #${editingRFI.rfi_number}` : 'New RFI'}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input type="text" placeholder="Subject *" value={formData.subject} onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))} className="form-input" />
            <textarea placeholder="Question / Description *" value={formData.question} onChange={e => setFormData(f => ({ ...f, question: e.target.value }))} className="form-input" rows={3} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <select value={formData.priority} onChange={e => setFormData(f => ({ ...f, priority: e.target.value }))} className="form-input">
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input type="text" placeholder="Assigned To" value={formData.assigned_to} onChange={e => setFormData(f => ({ ...f, assigned_to: e.target.value }))} className="form-input" />
              <input type="date" value={formData.due_date} onChange={e => setFormData(f => ({ ...f, due_date: e.target.value }))} className="form-input" title="Due Date" />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={formData.cost_impact} onChange={e => setFormData(f => ({ ...f, cost_impact: e.target.checked }))} /> Cost Impact
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={formData.schedule_impact} onChange={e => setFormData(f => ({ ...f, schedule_impact: e.target.checked }))} /> Schedule Impact
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>{editingRFI ? 'Update' : 'Submit RFI'}</button>
          </div>
        </div>
      )}

      {/* RFI List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Loading RFIs...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
          {rfis.length === 0 ? 'No RFIs yet. Create one to start tracking.' : 'No matching RFIs.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(rfi => {
            const isExpanded = expandedId === rfi.id
            const isOverdue = (rfi.status === 'open' || rfi.status === 'draft') && rfi.due_date && rfi.due_date < today
            const statusCfg = STATUS_CONFIG[rfi.status] || STATUS_CONFIG.open
            const priorityCfg = PRIORITY_CONFIG[rfi.priority] || PRIORITY_CONFIG.normal

            return (
              <div key={rfi.id} style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                {/* Row Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : rfi.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto auto auto',
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
                      <span style={{ fontFamily: 'monospace', marginRight: '0.5rem' }}>RFI-{String(rfi.rfi_number).padStart(3, '0')}</span>
                      {rfi.subject}
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '0.15rem' }}>
                      {rfi.assigned_to && <><User size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> {rfi.assigned_to}</>}
                      {rfi.due_date && <> &middot; <Calendar size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Due {rfi.due_date}</>}
                    </div>
                  </div>
                  <span style={{ display: 'flex', gap: '0.25rem' }}>
                    {rfi.cost_impact && <span title="Cost Impact" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#f59e0b20', color: '#f59e0b', borderRadius: '999px' }}>$</span>}
                    {rfi.schedule_impact && <span title="Schedule Impact" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#ef444420', color: '#ef4444', borderRadius: '999px' }}>S</span>}
                  </span>
                  <span style={{ padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', color: priorityCfg.color, border: `1px solid ${priorityCfg.color}40` }}>
                    {priorityCfg.label}
                  </span>
                  <span style={{ padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', background: statusCfg.bg, color: statusCfg.color, fontWeight: 500 }}>
                    {statusCfg.label}
                    {isOverdue && ' (Overdue)'}
                  </span>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                    <div style={{ padding: '0.75rem 0' }}>
                      <strong>Question:</strong>
                      <p style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{rfi.question}</p>
                    </div>
                    {rfi.answer && (
                      <div style={{ padding: '0.75rem', background: '#10b98110', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                        <strong>Answer:</strong>
                        <p style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap' }}>{rfi.answer}</p>
                        {rfi.answered_by && <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '0.25rem' }}>— {rfi.answered_by}</div>}
                      </div>
                    )}
                    {/* Answer input for open RFIs */}
                    {rfi.status === 'open' && (
                      <AnswerForm onSubmit={(answer) => handleAnswer(rfi.id, answer)} />
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(rfi)}>Edit</button>
                      {rfi.status === 'answered' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(rfi.id, 'closed')}>Close RFI</button>
                      )}
                      {rfi.status === 'draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(rfi.id, 'open')}>Submit</button>
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

function AnswerForm({ onSubmit }) {
  const [answer, setAnswer] = useState('')

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
      <textarea
        placeholder="Type answer..."
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        className="form-input"
        rows={2}
        style={{ flex: 1 }}
      />
      <button
        className="btn btn-primary btn-sm"
        disabled={!answer.trim()}
        onClick={() => { onSubmit(answer.trim()); setAnswer('') }}
      >
        Answer
      </button>
    </div>
  )
}
