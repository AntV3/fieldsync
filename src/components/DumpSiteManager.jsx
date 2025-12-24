import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'

const WASTE_TYPES = [
  { id: 'trash', label: 'Trash', description: 'General debris' },
  { id: 'metal', label: 'Metal', description: 'Scrap metal (recyclable)' },
  { id: 'copper', label: 'Copper', description: 'Copper scrap (recyclable)' },
  { id: 'concrete', label: 'Concrete', description: 'Concrete/masonry' },
  { id: 'hazardous', label: 'Hazardous', description: 'Hazardous materials' }
]

export default function DumpSiteManager({ company, onShowToast }) {
  const [dumpSites, setDumpSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSite, setEditingSite] = useState(null)
  const [newSite, setNewSite] = useState({ name: '', address: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (company?.id) {
      loadDumpSites()
    }
  }, [company?.id])

  const loadDumpSites = async () => {
    setLoading(true)
    try {
      const data = await db.getDumpSites(company.id)
      setDumpSites(data || [])
    } catch (error) {
      console.error('Error loading dump sites:', error)
      onShowToast('Error loading dump sites', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAddSite = async () => {
    if (!newSite.name.trim()) {
      onShowToast('Please enter a site name', 'error')
      return
    }

    setSaving(true)
    try {
      await db.createDumpSite(company.id, newSite.name, newSite.address, newSite.notes)
      onShowToast('Dump site added', 'success')
      setNewSite({ name: '', address: '', notes: '' })
      setShowAddForm(false)
      loadDumpSites()
    } catch (error) {
      console.error('Error adding dump site:', error)
      onShowToast('Error adding dump site', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateSite = async () => {
    if (!editingSite?.name.trim()) {
      onShowToast('Please enter a site name', 'error')
      return
    }

    setSaving(true)
    try {
      await db.updateDumpSite(editingSite.id, {
        name: editingSite.name,
        address: editingSite.address,
        notes: editingSite.notes
      })
      onShowToast('Dump site updated', 'success')
      setEditingSite(null)
      loadDumpSites()
    } catch (error) {
      console.error('Error updating dump site:', error)
      onShowToast('Error updating dump site', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSite = async (siteId) => {
    if (!confirm('Are you sure you want to delete this dump site?')) return

    try {
      await db.deleteDumpSite(siteId)
      onShowToast('Dump site deleted', 'success')
      loadDumpSites()
    } catch (error) {
      console.error('Error deleting dump site:', error)
      onShowToast('Error deleting dump site', 'error')
    }
  }

  const handleRateChange = async (siteId, wasteType, value) => {
    const cost = parseFloat(value) || 0
    try {
      await db.setDumpSiteRate(siteId, wasteType, cost)
      // Update local state
      setDumpSites(prev => prev.map(site => {
        if (site.id === siteId) {
          const rates = site.dump_site_rates || []
          const existingIndex = rates.findIndex(r => r.waste_type === wasteType)
          if (existingIndex >= 0) {
            rates[existingIndex].estimated_cost_per_load = cost
          } else {
            rates.push({ waste_type: wasteType, estimated_cost_per_load: cost })
          }
          return { ...site, dump_site_rates: rates }
        }
        return site
      }))
    } catch (error) {
      console.error('Error saving rate:', error)
      onShowToast('Error saving rate', 'error')
    }
  }

  const getRate = (site, wasteType) => {
    const rate = site.dump_site_rates?.find(r => r.waste_type === wasteType)
    return rate?.estimated_cost_per_load ?? ''
  }

  const formatCurrency = (amount) => {
    if (amount === '' || amount === null || amount === undefined) return ''
    const num = parseFloat(amount)
    if (num < 0) return `-$${Math.abs(num).toFixed(0)}`
    return `$${num.toFixed(0)}`
  }

  if (loading) {
    return (
      <div className="dump-site-manager">
        <h3>Dump Sites</h3>
        <div className="loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="dump-site-manager">
      <div className="dump-site-header">
        <h3>Dump Sites</h3>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddForm(true)}
        >
          + Add Dump Site
        </button>
      </div>

      <p className="dump-site-desc">
        Configure dump sites and estimated costs per load for each waste type.
        Negative values for recyclables (metal, copper) indicate revenue.
      </p>

      {/* Add New Site Form */}
      {showAddForm && (
        <div className="dump-site-form card">
          <h4>Add Dump Site</h4>
          <div className="form-group">
            <label>Site Name *</label>
            <input
              type="text"
              value={newSite.name}
              onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
              placeholder="e.g., Metro Landfill"
            />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input
              type="text"
              value={newSite.address}
              onChange={(e) => setNewSite({ ...newSite, address: e.target.value })}
              placeholder="123 Main St, City"
            />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input
              type="text"
              value={newSite.notes}
              onChange={(e) => setNewSite({ ...newSite, notes: e.target.value })}
              placeholder="Operating hours, contact, etc."
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAddSite} disabled={saving}>
              {saving ? 'Adding...' : 'Add Site'}
            </button>
          </div>
        </div>
      )}

      {/* Dump Sites List */}
      {dumpSites.length === 0 ? (
        <div className="dump-site-empty">
          <p>No dump sites configured yet.</p>
          <p>Add a dump site to start tracking haul-off costs.</p>
        </div>
      ) : (
        <div className="dump-sites-list">
          {dumpSites.map(site => (
            <div key={site.id} className="dump-site-card card">
              {editingSite?.id === site.id ? (
                /* Edit Mode */
                <div className="dump-site-edit">
                  <div className="form-group">
                    <label>Site Name *</label>
                    <input
                      type="text"
                      value={editingSite.name}
                      onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <input
                      type="text"
                      value={editingSite.address || ''}
                      onChange={(e) => setEditingSite({ ...editingSite, address: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={editingSite.notes || ''}
                      onChange={(e) => setEditingSite({ ...editingSite, notes: e.target.value })}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingSite(null)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleUpdateSite} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  <div className="dump-site-info">
                    <div className="dump-site-name">{site.name}</div>
                    {site.address && <div className="dump-site-address">{site.address}</div>}
                    {site.notes && <div className="dump-site-notes">{site.notes}</div>}
                  </div>
                  <div className="dump-site-actions">
                    <button
                      className="btn-icon"
                      onClick={() => setEditingSite({ ...site })}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleDeleteSite(site.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}

              {/* Rates Table */}
              <div className="dump-site-rates">
                <div className="rates-header">Estimated Cost per Load</div>
                <div className="rates-grid">
                  {WASTE_TYPES.map(type => (
                    <div key={type.id} className="rate-item">
                      <label>
                        <span className="rate-label">{type.label}</span>
                        <span className="rate-desc">{type.description}</span>
                      </label>
                      <div className="rate-input-wrapper">
                        <span className="rate-prefix">$</span>
                        <input
                          type="number"
                          className="rate-input"
                          value={getRate(site, type.id)}
                          onChange={(e) => handleRateChange(site.id, type.id, e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      {getRate(site, type.id) !== '' && (
                        <span className={`rate-preview ${parseFloat(getRate(site, type.id)) < 0 ? 'revenue' : 'cost'}`}>
                          {formatCurrency(getRate(site, type.id))}/load
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="rates-note">
                  Tip: Use negative values for recyclables that generate revenue (e.g., -50 for metal)
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
