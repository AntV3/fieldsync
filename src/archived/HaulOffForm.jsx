import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

const WASTE_TYPES = [
  { id: 'trash', label: 'Trash', description: 'General debris' },
  { id: 'metal', label: 'Metal', description: 'Scrap metal (recyclable)' },
  { id: 'copper', label: 'Copper', description: 'Copper scrap (recyclable)' },
  { id: 'concrete', label: 'Concrete', description: 'Concrete/masonry' },
  { id: 'hazardous', label: 'Hazardous', description: 'Hazardous materials' }
]

export default function HaulOffForm({ project, companyId, onClose, onSubmit, onShowToast }) {
  const [loading, setLoading] = useState(false)
  const [dumpSites, setDumpSites] = useState([])
  const [loadingSites, setLoadingSites] = useState(true)

  // Form state
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0])
  const [wasteType, setWasteType] = useState('trash')
  const [loads, setLoads] = useState(1)
  const [haulingCompany, setHaulingCompany] = useState('')
  const [dumpSiteId, setDumpSiteId] = useState(project.default_dump_site_id || '')
  const [notes, setNotes] = useState('')

  // Calculated estimate
  const [estimatedCost, setEstimatedCost] = useState(null)
  const [costPerLoad, setCostPerLoad] = useState(null)

  useEffect(() => {
    loadDumpSites()
  }, [companyId])

  useEffect(() => {
    calculateEstimate()
  }, [dumpSiteId, wasteType, loads, dumpSites])

  const loadDumpSites = async () => {
    try {
      const sites = await db.getDumpSites(companyId)
      setDumpSites(sites || [])

      // If project has default dump site, use it
      if (project.default_dump_site_id) {
        setDumpSiteId(project.default_dump_site_id)
      } else if (sites && sites.length > 0) {
        setDumpSiteId(sites[0].id)
      }
    } catch (error) {
      console.error('Error loading dump sites:', error)
    } finally {
      setLoadingSites(false)
    }
  }

  const calculateEstimate = () => {
    if (!dumpSiteId || !wasteType || !loads) {
      setEstimatedCost(null)
      setCostPerLoad(null)
      return
    }

    const site = dumpSites.find(s => s.id === dumpSiteId)
    if (!site || !site.dump_site_rates) {
      setEstimatedCost(null)
      setCostPerLoad(null)
      return
    }

    const rate = site.dump_site_rates.find(r => r.waste_type === wasteType)
    if (rate && rate.estimated_cost_per_load !== null) {
      const perLoad = parseFloat(rate.estimated_cost_per_load)
      setCostPerLoad(perLoad)
      setEstimatedCost(perLoad * parseInt(loads))
    } else {
      setEstimatedCost(null)
      setCostPerLoad(null)
    }
  }

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '--'
    if (amount < 0) return `-$${Math.abs(amount).toFixed(0)}`
    return `$${amount.toFixed(0)}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!dumpSiteId) {
      onShowToast('Please select a dump site', 'error')
      return
    }

    if (!loads || loads < 1) {
      onShowToast('Please enter number of loads', 'error')
      return
    }

    setLoading(true)
    try {
      await db.createHaulOff(project.id, {
        dump_site_id: dumpSiteId,
        waste_type: wasteType,
        loads: parseInt(loads),
        hauling_company: haulingCompany.trim() || null,
        work_date: workDate,
        notes: notes.trim() || null,
        estimated_cost: estimatedCost,
        created_by: 'Field'
      })

      onShowToast('Haul-off logged successfully', 'success')
      if (onSubmit) onSubmit()
      onClose()
    } catch (error) {
      console.error('Error logging haul-off:', error)
      onShowToast('Error logging haul-off', 'error')
    } finally {
      setLoading(false)
    }
  }

  const selectedSite = dumpSites.find(s => s.id === dumpSiteId)
  const selectedWasteType = WASTE_TYPES.find(w => w.id === wasteType)

  return (
    <div className="hauloff-form-container">
      <div className="hauloff-header">
        <button className="back-btn-simple" onClick={onClose}>
          ←
        </button>
        <h2>Log Haul-Off</h2>
      </div>

      <form onSubmit={handleSubmit} className="hauloff-form">
        {/* Date */}
        <div className="hauloff-field">
          <label>Date</label>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>

        {/* Waste Type */}
        <div className="hauloff-field">
          <label>Waste Type</label>
          <div className="waste-type-grid">
            {WASTE_TYPES.map(type => (
              <button
                key={type.id}
                type="button"
                className={`waste-type-btn ${wasteType === type.id ? 'active' : ''} ${type.id === 'metal' || type.id === 'copper' ? 'recyclable' : ''}`}
                onClick={() => setWasteType(type.id)}
              >
                <span className="waste-label">{type.label}</span>
                {(type.id === 'metal' || type.id === 'copper') && (
                  <span className="waste-badge">$</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Number of Loads */}
        <div className="hauloff-field">
          <label>Number of Loads</label>
          <div className="loads-input-row">
            <button
              type="button"
              className="loads-btn"
              onClick={() => setLoads(Math.max(1, loads - 1))}
            >
              −
            </button>
            <input
              type="number"
              value={loads}
              onChange={(e) => setLoads(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="loads-input"
            />
            <button
              type="button"
              className="loads-btn"
              onClick={() => setLoads(loads + 1)}
            >
              +
            </button>
          </div>
        </div>

        {/* Dump Site */}
        <div className="hauloff-field">
          <label>Dump Site</label>
          {loadingSites ? (
            <div className="loading-inline">Loading sites...</div>
          ) : dumpSites.length === 0 ? (
            <div className="no-sites-warning">
              No dump sites configured. Ask office to add dump sites.
            </div>
          ) : (
            <select
              value={dumpSiteId}
              onChange={(e) => setDumpSiteId(e.target.value)}
            >
              <option value="">-- Select Dump Site --</option>
              {dumpSites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          )}
          {selectedSite?.address && (
            <span className="field-hint">{selectedSite.address}</span>
          )}
        </div>

        {/* Hauling Company */}
        <div className="hauloff-field">
          <label>Hauling Company (Optional)</label>
          <input
            type="text"
            value={haulingCompany}
            onChange={(e) => setHaulingCompany(e.target.value)}
            placeholder="e.g., ABC Trucking"
          />
        </div>

        {/* Notes */}
        <div className="hauloff-field">
          <label>Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes..."
            rows={2}
          />
        </div>

        {/* Estimated Cost Display */}
        <div className="hauloff-estimate">
          <div className="estimate-header">Estimated Cost</div>
          {estimatedCost !== null ? (
            <div className={`estimate-value ${estimatedCost < 0 ? 'revenue' : ''}`}>
              <span className="estimate-amount">{formatCurrency(estimatedCost)}</span>
              <span className="estimate-breakdown">
                {formatCurrency(costPerLoad)}/load × {loads} load{loads > 1 ? 's' : ''}
              </span>
              {estimatedCost < 0 && (
                <span className="estimate-note revenue-note">Revenue from recyclables</span>
              )}
            </div>
          ) : (
            <div className="estimate-value">
              <span className="estimate-amount">--</span>
              <span className="estimate-breakdown">
                {!dumpSiteId ? 'Select a dump site' :
                 !selectedSite?.dump_site_rates?.find(r => r.waste_type === wasteType) ?
                 `No rate set for ${selectedWasteType?.label || wasteType}` :
                 'Unable to calculate'}
              </span>
            </div>
          )}
          <div className="estimate-disclaimer">
            This is an estimate for burn rate tracking, not an invoice amount.
          </div>
        </div>

        {/* Submit Button */}
        <div className="hauloff-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !dumpSiteId}
          >
            {loading ? 'Saving...' : 'Log Haul-Off'}
          </button>
        </div>
      </form>
    </div>
  )
}
