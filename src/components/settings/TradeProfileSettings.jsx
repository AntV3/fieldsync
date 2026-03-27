import { useState, useCallback } from 'react'
import { Save, Plus, X, GripVertical, Zap, Building2, Wind, Layers, HardHat, ChevronDown, ChevronUp } from 'lucide-react'
import { useTradeConfig } from '../../lib/TradeConfigContext'

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'photo', label: 'Photo' }
]

const FORM_TYPES = [
  { value: 'daily_report', label: 'Daily Report' },
  { value: 'tm_ticket', label: 'Time and Material Ticket' },
  { value: 'crew_checkin', label: 'Crew Check-in' },
  { value: 'injury_report', label: 'Injury Report' }
]

const TEMPLATE_ICONS = {
  general_contractor: Building2,
  electrical: Zap,
  hvac: Wind,
  concrete: Layers
}

/**
 * TradeProfileSettings - Admin UI for configuring company trade profile.
 *
 * Props:
 * - onShowToast: (message, type) => void
 */
export default function TradeProfileSettings({ onShowToast }) {
  const { resolvedConfig, companyConfig, templates, updateCompanyConfig, loading } = useTradeConfig()
  const [saving, setSaving] = useState(false)
  const [tradeName, setTradeName] = useState(companyConfig?.trade_name || '')
  const [selectedTemplate, setSelectedTemplate] = useState(companyConfig?.trade_template_id || '')
  const [workerRoles, setWorkerRoles] = useState(resolvedConfig?.worker_roles || [])
  const [newRole, setNewRole] = useState('')
  const [customFields, setCustomFields] = useState(resolvedConfig?.custom_fields || {})
  const [activeFormType, setActiveFormType] = useState('daily_report')
  const [enableTruckLoadTracking, setEnableTruckLoadTracking] = useState(companyConfig?.enable_truck_load_tracking ?? resolvedConfig?.enable_truck_load_tracking ?? false)
  const [expandedSections, setExpandedSections] = useState({ identity: true, roles: false, features: false, fields: false })

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleTemplateSelect = (templateId) => {
    const template = templates.find(t => t.id === templateId)
    setSelectedTemplate(templateId)
    if (template) {
      setTradeName(template.name)
      if (template.default_worker_roles?.length) setWorkerRoles(template.default_worker_roles)
      if (template.default_custom_fields) setCustomFields(template.default_custom_fields)
    }
  }

  const handleStartFromScratch = () => {
    setSelectedTemplate('')
    setTradeName('')
    setWorkerRoles([])
    setCustomFields({})
  }

  const handleAddRole = () => {
    const role = newRole.trim()
    if (role && !workerRoles.includes(role)) {
      setWorkerRoles(prev => [...prev, role])
      setNewRole('')
    }
  }

  const handleRemoveRole = (role) => {
    setWorkerRoles(prev => prev.filter(r => r !== role))
  }

  const handleAddField = (formType) => {
    const fields = customFields[formType] || []
    const newField = {
      key: `custom_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
      placeholder: '',
      options: null,
      sort_order: fields.length + 1
    }
    setCustomFields(prev => ({
      ...prev,
      [formType]: [...fields, newField]
    }))
  }

  const handleUpdateField = (formType, index, updates) => {
    setCustomFields(prev => {
      const fields = [...(prev[formType] || [])]
      fields[index] = { ...fields[index], ...updates }
      // If changing key, sanitize it
      if (updates.label && !updates.key) {
        fields[index].key = updates.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      }
      return { ...prev, [formType]: fields }
    })
  }

  const handleRemoveField = (formType, index) => {
    setCustomFields(prev => {
      const fields = [...(prev[formType] || [])]
      fields.splice(index, 1)
      return { ...prev, [formType]: fields }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const config = {
        trade_template_id: selectedTemplate || null,
        trade_name: tradeName.trim() || null,
        worker_roles: workerRoles.length > 0 ? workerRoles : null,
        custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
        enable_truck_load_tracking: enableTruckLoadTracking
      }
      const result = await updateCompanyConfig(config)
      if (result.success) {
        onShowToast?.('Trade profile saved!', 'success')
      } else {
        onShowToast?.('Error saving trade profile', 'error')
      }
    } catch (error) {
      console.error('Error saving trade profile:', error)
      onShowToast?.('Error saving trade profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="trade-settings-loading">Loading trade configuration...</div>
  }

  const currentFormFields = customFields[activeFormType] || []

  return (
    <div className="trade-settings">
      <div className="trade-settings-header">
        <h2><HardHat size={22} /> Trade Profile</h2>
        <p className="trade-settings-subtitle">
          Configure your trade identity, worker roles, and custom fields.
          These settings apply to all projects in your company.
        </p>
      </div>

      {/* Trade Identity Section */}
      <div className="trade-settings-section">
        <button className="trade-section-toggle" onClick={() => toggleSection('identity')}>
          <h3>Trade Identity</h3>
          {expandedSections.identity ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSections.identity && (
          <div className="trade-section-body">
            {/* Starter Templates */}
            <div className="trade-templates-grid">
              {templates.map(template => {
                const Icon = TEMPLATE_ICONS[template.id] || HardHat
                return (
                  <button
                    key={template.id}
                    className={`trade-template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <Icon size={24} />
                    <span className="trade-template-name">{template.name}</span>
                    <span className="trade-template-desc">{template.description}</span>
                  </button>
                )
              })}
              <button
                className={`trade-template-card ${selectedTemplate === '' && tradeName ? 'selected' : ''}`}
                onClick={handleStartFromScratch}
              >
                <Plus size={24} />
                <span className="trade-template-name">Custom Trade</span>
                <span className="trade-template-desc">Start from scratch for any trade</span>
              </button>
            </div>

            {/* Trade Name */}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Trade Name</label>
              <input
                type="text"
                value={tradeName}
                onChange={e => setTradeName(e.target.value)}
                placeholder="e.g. Sandblasting, Saw Cutting, Painting, Roofing..."
              />
              <p className="form-help">Enter your trade name. This appears on forms and reports.</p>
            </div>
          </div>
        )}
      </div>

      {/* Worker Roles Section */}
      <div className="trade-settings-section">
        <button className="trade-section-toggle" onClick={() => toggleSection('roles')}>
          <h3>Worker Roles ({workerRoles.length})</h3>
          {expandedSections.roles ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSections.roles && (
          <div className="trade-section-body">
            <p className="form-help">Define the worker roles used in your trade. These appear in crew check-ins and Time and Material tickets.</p>
            <div className="trade-roles-list">
              {workerRoles.map((role, i) => (
                <div key={i} className="trade-role-item">
                  <span>{role}</span>
                  <button className="btn-icon-sm" onClick={() => handleRemoveRole(role)} title="Remove role">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="trade-role-add">
              <input
                type="text"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                placeholder="e.g. Blaster, Nozzle Operator, Finisher..."
                onKeyDown={e => e.key === 'Enter' && handleAddRole()}
              />
              <button className="btn btn-sm btn-secondary" onClick={handleAddRole} disabled={!newRole.trim()}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Feature Toggles Section */}
      <div className="trade-settings-section">
        <button className="trade-section-toggle" onClick={() => toggleSection('features')}>
          <h3>Feature Toggles</h3>
          {expandedSections.features ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSections.features && (
          <div className="trade-section-body">
            <p className="form-help">
              Enable or disable trade-specific features. These settings apply to all projects unless overridden at the project level.
            </p>
            <label className="trade-feature-toggle">
              <input
                type="checkbox"
                checked={enableTruckLoadTracking}
                onChange={e => setEnableTruckLoadTracking(e.target.checked)}
              />
              <div className="trade-feature-info">
                <span className="trade-feature-label">Truck & Load Tracking</span>
                <span className="trade-feature-desc">
                  Allow foremen and office users to track the number of trucks and loads hauled off site.
                  Common for demolition, concrete, excavation, and similar trades.
                </span>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Custom Fields Section */}
      <div className="trade-settings-section">
        <button className="trade-section-toggle" onClick={() => toggleSection('fields')}>
          <h3>Custom Fields</h3>
          {expandedSections.fields ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {expandedSections.fields && (
          <div className="trade-section-body">
            <p className="form-help">
              Add trade-specific fields to your forms. These fields appear on both field and office views.
            </p>

            {/* Form type tabs */}
            <div className="trade-form-tabs">
              {FORM_TYPES.map(ft => (
                <button
                  key={ft.value}
                  className={`trade-form-tab ${activeFormType === ft.value ? 'active' : ''}`}
                  onClick={() => setActiveFormType(ft.value)}
                >
                  {ft.label}
                  {(customFields[ft.value]?.length || 0) > 0 && (
                    <span className="trade-form-tab-count">{customFields[ft.value].length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Field list for active form type */}
            <div className="trade-fields-list">
              {currentFormFields.map((field, index) => (
                <div key={field.key} className="trade-field-item">
                  <div className="trade-field-row">
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => handleUpdateField(activeFormType, index, { label: e.target.value })}
                      placeholder="Field label"
                      className="trade-field-label-input"
                    />
                    <select
                      value={field.type}
                      onChange={e => handleUpdateField(activeFormType, index, { type: e.target.value })}
                      className="trade-field-type-select"
                    >
                      {FIELD_TYPES.map(ft => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                    <label className="trade-field-required">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => handleUpdateField(activeFormType, index, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <button className="btn-icon-sm" onClick={() => handleRemoveField(activeFormType, index)}>
                      <X size={14} />
                    </button>
                  </div>
                  {(field.type === 'select' || field.type === 'multiselect') && (
                    <input
                      type="text"
                      value={(field.options || []).join(', ')}
                      onChange={e => handleUpdateField(activeFormType, index, {
                        options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      })}
                      placeholder="Options (comma-separated): Option 1, Option 2, Option 3"
                      className="trade-field-options-input"
                    />
                  )}
                  <input
                    type="text"
                    value={field.placeholder || ''}
                    onChange={e => handleUpdateField(activeFormType, index, { placeholder: e.target.value })}
                    placeholder="Placeholder text (optional)"
                    className="trade-field-placeholder-input"
                  />
                </div>
              ))}
              <button className="btn btn-sm btn-secondary trade-add-field-btn" onClick={() => handleAddField(activeFormType)}>
                <Plus size={14} /> Add Field to {FORM_TYPES.find(ft => ft.value === activeFormType)?.label}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="trade-settings-footer">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Trade Profile'}
        </button>
      </div>
    </div>
  )
}
