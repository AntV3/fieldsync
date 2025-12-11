import { useState } from 'react'
import { db } from '../lib/supabase'

export default function MaterialRequest({ project, requestedBy, onShowToast, onClose }) {
  const [items, setItems] = useState([{ name: '', quantity: '', unit: 'each' }])
  const [neededBy, setNeededBy] = useState('')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const addItem = () => {
    setItems([...items, { name: '', quantity: '', unit: 'each' }])
  }

  const updateItem = (index, field, value) => {
    setItems(items.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ))
  }

  const removeItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index))
    }
  }

  const handleSubmit = async () => {
    // Validate
    const validItems = items.filter(i => i.name.trim() && i.quantity)
    if (validItems.length === 0) {
      onShowToast('Add at least one item', 'error')
      return
    }

    setSubmitting(true)
    try {
      await db.createMaterialRequest(
        project.id,
        validItems,
        requestedBy,
        neededBy || null,
        priority,
        notes || null
      )
      
      onShowToast('Request submitted!', 'success')
      onClose()
    } catch (err) {
      console.error('Error submitting request:', err)
      onShowToast('Error submitting request', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="material-request">
      <div className="material-request-header">
        <button className="back-btn-simple" onClick={onClose}>←</button>
        <h2>Request Materials</h2>
      </div>

      <div className="material-request-content">
        {/* Items */}
        <div className="material-request-section">
          <label>What do you need?</label>
          
          {items.map((item, index) => (
            <div key={index} className="material-request-item">
              <input
                type="text"
                placeholder="Item name"
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
                className="material-request-name"
              />
              <input
                type="number"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                className="material-request-qty"
              />
              <select
                value={item.unit}
                onChange={(e) => updateItem(index, 'unit', e.target.value)}
                className="material-request-unit"
              >
                <option value="each">each</option>
                <option value="rolls">rolls</option>
                <option value="boxes">boxes</option>
                <option value="bags">bags</option>
                <option value="sheets">sheets</option>
                <option value="gallons">gal</option>
                <option value="feet">ft</option>
                <option value="lbs">lbs</option>
              </select>
              <button 
                className="material-request-remove"
                onClick={() => removeItem(index)}
              >
                ×
              </button>
            </div>
          ))}
          
          <button className="material-request-add" onClick={addItem}>
            + Add Another Item
          </button>
        </div>

        {/* Priority */}
        <div className="material-request-section">
          <label>Priority</label>
          <div className="material-request-priority">
            {['low', 'normal', 'urgent'].map((p) => (
              <button
                key={p}
                className={`priority-btn ${priority === p ? 'active' : ''} ${p}`}
                onClick={() => setPriority(p)}
              >
                {p === 'urgent' && '🔴 '}
                {p === 'normal' && '🟡 '}
                {p === 'low' && '🟢 '}
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Needed By */}
        <div className="material-request-section">
          <label>Needed By (optional)</label>
          <input
            type="date"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>

        {/* Notes */}
        <div className="material-request-section">
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details..."
            rows={2}
          />
        </div>
      </div>

      <div className="material-request-footer">
        <button 
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : '📦 Submit Request'}
        </button>
      </div>
    </div>
  )
}
