import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, Save, Send, FileText, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { db } from '../../lib/supabase'
import {
  formatCurrency,
  basisPointsToPercent,
  percentToBasisPoints,
  calculateLaborItemTotal,
  calculateLineItemTotal,
  calculateCORTotals,
  validateCOR,
  DEFAULT_PERCENTAGES,
  LABOR_CLASSES,
  WAGE_TYPES,
  COMMON_UNITS
} from '../../lib/corCalculations'
import TicketSelector from './TicketSelector'

export default function CORForm({ project, company, areas, existingCOR, onClose, onSaved, onShowToast }) {
  const [loading, setLoading] = useState(false)
  const [laborRates, setLaborRates] = useState([])
  const [showTicketSelector, setShowTicketSelector] = useState(false)
  const [importedTicketIds, setImportedTicketIds] = useState([]) // Track tickets imported for backup docs

  // Expandable sections
  const [expandedSections, setExpandedSections] = useState({
    labor: existingCOR?.change_order_labor?.length > 0,
    materials: existingCOR?.change_order_materials?.length > 0,
    equipment: existingCOR?.change_order_equipment?.length > 0,
    subcontractors: existingCOR?.change_order_subcontractors?.length > 0,
    markups: false
  })

  // Quick select state for materials/equipment
  const [companyMaterials, setCompanyMaterials] = useState([])
  const [materialSearch, setMaterialSearch] = useState('')
  const [materialCategory, setMaterialCategory] = useState('all')
  const [equipmentSearch, setEquipmentSearch] = useState('')

  // Basic Info (required)
  const [title, setTitle] = useState(existingCOR?.title || '')
  const [scopeOfWork, setScopeOfWork] = useState(existingCOR?.scope_of_work || '')
  const [corNumber, setCORNumber] = useState(existingCOR?.cor_number || '')
  const [groupName, setGroupName] = useState(existingCOR?.group_name || '')
  const [areaId, setAreaId] = useState(existingCOR?.area_id || '')

  // Period (optional)
  const [periodStart, setPeriodStart] = useState(existingCOR?.period_start || '')
  const [periodEnd, setPeriodEnd] = useState(existingCOR?.period_end || '')

  // Labor Items
  const [laborItems, setLaborItems] = useState(existingCOR?.change_order_labor || [])

  // Materials Items
  const [materialsItems, setMaterialsItems] = useState(existingCOR?.change_order_materials || [])

  // Equipment Items
  const [equipmentItems, setEquipmentItems] = useState(existingCOR?.change_order_equipment || [])

  // Subcontractors Items
  const [subcontractorsItems, setSubcontractorsItems] = useState(existingCOR?.change_order_subcontractors || [])

  // Markups & Fees
  const [laborMarkupPercent, setLaborMarkupPercent] = useState(
    existingCOR?.labor_markup_percent ?? DEFAULT_PERCENTAGES.labor_markup
  )
  const [materialsMarkupPercent, setMaterialsMarkupPercent] = useState(
    existingCOR?.materials_markup_percent ?? DEFAULT_PERCENTAGES.materials_markup
  )
  const [equipmentMarkupPercent, setEquipmentMarkupPercent] = useState(
    existingCOR?.equipment_markup_percent ?? DEFAULT_PERCENTAGES.equipment_markup
  )
  const [subcontractorsMarkupPercent, setSubcontractorsMarkupPercent] = useState(
    existingCOR?.subcontractors_markup_percent ?? DEFAULT_PERCENTAGES.subcontractors_markup
  )
  const [liabilityInsurancePercent, setLiabilityInsurancePercent] = useState(
    existingCOR?.liability_insurance_percent ?? DEFAULT_PERCENTAGES.liability_insurance
  )
  const [bondPercent, setBondPercent] = useState(
    existingCOR?.bond_percent ?? DEFAULT_PERCENTAGES.bond
  )
  const [licenseFeePercent, setLicenseFeePercent] = useState(
    existingCOR?.license_fee_percent ?? DEFAULT_PERCENTAGES.license_fee
  )

  // Load labor rates and company materials on mount
  useEffect(() => {
    loadLaborRates()
    loadCompanyMaterials()
    if (!existingCOR) {
      generateCORNumber()
    }
  }, [])

  const loadCompanyMaterials = async () => {
    try {
      const data = await db.getAllMaterialsEquipment(company?.id)
      setCompanyMaterials(data || [])
    } catch (error) {
      console.error('Error loading company materials:', error)
    }
  }

  // Filter company materials for quick select
  const filteredMaterials = useMemo(() => {
    return companyMaterials.filter(item => {
      if (!['Containment', 'PPE', 'Disposal'].includes(item.category)) return false
      if (item.active === false) return false
      if (materialCategory !== 'all' && item.category !== materialCategory) return false
      if (materialSearch) {
        return item.name.toLowerCase().includes(materialSearch.toLowerCase())
      }
      return true
    })
  }, [companyMaterials, materialSearch, materialCategory])

  // Filter company equipment for quick select
  const filteredEquipment = useMemo(() => {
    return companyMaterials.filter(item => {
      if (item.category !== 'Equipment') return false
      if (item.active === false) return false
      if (equipmentSearch) {
        return item.name.toLowerCase().includes(equipmentSearch.toLowerCase())
      }
      return true
    })
  }, [companyMaterials, equipmentSearch])

  const addMaterialFromLibrary = (libraryItem) => {
    setMaterialsItems([...materialsItems, {
      description: libraryItem.name,
      source_type: 'field_ticket',
      source_reference: '',
      quantity: 1,
      unit: libraryItem.unit || 'each',
      unit_cost: libraryItem.cost_per_unit || 0,
      total: libraryItem.cost_per_unit || 0
    }])
  }

  const addEquipmentFromLibrary = (libraryItem) => {
    setEquipmentItems([...equipmentItems, {
      description: libraryItem.name,
      source_type: 'rental',
      source_reference: '',
      quantity: 1,
      unit: libraryItem.unit || 'day',
      unit_cost: libraryItem.cost_per_unit || 0,
      total: libraryItem.cost_per_unit || 0
    }])
  }

  const loadLaborRates = async () => {
    try {
      const rates = await db.getLaborRates?.(company?.id, project?.work_type, project?.job_type)
      setLaborRates(rates || [])
    } catch (error) {
      console.error('Error loading labor rates:', error)
    }
  }

  const getRateForClass = (laborClass) => {
    const classLower = laborClass?.toLowerCase() || ''
    return laborRates.find(r => r.role?.toLowerCase() === classLower) || null
  }

  const generateCORNumber = async () => {
    try {
      const nextNumber = await db.getNextCORNumber?.(project.id)
      setCORNumber(nextNumber || `COR-${Date.now()}`)
    } catch (error) {
      console.error('Error generating COR number:', error)
      setCORNumber(`COR-${Date.now()}`)
    }
  }

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  // Build COR object for calculations
  const corData = useMemo(() => ({
    title,
    scope_of_work: scopeOfWork,
    area_id: areaId || null,
    cor_number: corNumber,
    group_name: groupName || null,
    period_start: periodStart || null,
    period_end: periodEnd || null,
    change_order_labor: laborItems,
    change_order_materials: materialsItems,
    change_order_equipment: equipmentItems,
    change_order_subcontractors: subcontractorsItems,
    labor_markup_percent: laborMarkupPercent,
    materials_markup_percent: materialsMarkupPercent,
    equipment_markup_percent: equipmentMarkupPercent,
    subcontractors_markup_percent: subcontractorsMarkupPercent,
    liability_insurance_percent: liabilityInsurancePercent,
    bond_percent: bondPercent,
    license_fee_percent: licenseFeePercent
  }), [
    title, scopeOfWork, areaId, corNumber, groupName, periodStart, periodEnd,
    laborItems, materialsItems, equipmentItems, subcontractorsItems,
    laborMarkupPercent, materialsMarkupPercent, equipmentMarkupPercent, subcontractorsMarkupPercent,
    liabilityInsurancePercent, bondPercent, licenseFeePercent
  ])

  // Calculate totals
  const totals = useMemo(() => calculateCORTotals(corData), [corData])

  // Labor item management
  const addLaborItem = () => {
    const defaultClass = LABOR_CLASSES[0]
    const rate = getRateForClass(defaultClass)
    setLaborItems([...laborItems, {
      id: `temp-${Date.now()}`,
      labor_class: defaultClass,
      wage_type: 'standard',
      regular_hours: 0,
      overtime_hours: 0,
      regular_rate: rate ? Math.round((parseFloat(rate.regular_rate) || 0) * 100) : 0,
      overtime_rate: rate ? Math.round((parseFloat(rate.overtime_rate) || 0) * 100) : 0,
      total: 0
    }])
    if (!expandedSections.labor) toggleSection('labor')
  }

  const updateLaborItem = (index, field, value) => {
    const newItems = [...laborItems]
    newItems[index] = { ...newItems[index], [field]: value }

    if (field === 'labor_class') {
      const rate = getRateForClass(value)
      if (rate) {
        newItems[index].regular_rate = Math.round((parseFloat(rate.regular_rate) || 0) * 100)
        newItems[index].overtime_rate = Math.round((parseFloat(rate.overtime_rate) || 0) * 100)
      }
    }

    const { total } = calculateLaborItemTotal(
      newItems[index].regular_hours,
      newItems[index].overtime_hours,
      newItems[index].regular_rate,
      newItems[index].overtime_rate
    )
    newItems[index].total = total

    setLaborItems(newItems)
  }

  const removeLaborItem = (index) => {
    setLaborItems(laborItems.filter((_, i) => i !== index))
  }

  // Materials item management
  const addMaterialsItem = () => {
    setMaterialsItems([...materialsItems, {
      id: `temp-${Date.now()}`,
      description: '',
      source_type: 'backup_sheet',
      source_reference: '',
      quantity: 1,
      unit: 'each',
      unit_cost: 0,
      total: 0
    }])
    if (!expandedSections.materials) toggleSection('materials')
  }

  const updateMaterialsItem = (index, field, value) => {
    const newItems = [...materialsItems]
    newItems[index] = { ...newItems[index], [field]: value }
    newItems[index].total = calculateLineItemTotal(
      newItems[index].quantity,
      newItems[index].unit_cost
    )
    setMaterialsItems(newItems)
  }

  const removeMaterialsItem = (index) => {
    setMaterialsItems(materialsItems.filter((_, i) => i !== index))
  }

  // Equipment item management
  const addEquipmentItem = () => {
    setEquipmentItems([...equipmentItems, {
      id: `temp-${Date.now()}`,
      description: '',
      source_type: 'backup_sheet',
      source_reference: '',
      quantity: 1,
      unit: 'day',
      unit_cost: 0,
      total: 0
    }])
    if (!expandedSections.equipment) toggleSection('equipment')
  }

  const updateEquipmentItem = (index, field, value) => {
    const newItems = [...equipmentItems]
    newItems[index] = { ...newItems[index], [field]: value }
    newItems[index].total = calculateLineItemTotal(
      newItems[index].quantity,
      newItems[index].unit_cost
    )
    setEquipmentItems(newItems)
  }

  const removeEquipmentItem = (index) => {
    setEquipmentItems(equipmentItems.filter((_, i) => i !== index))
  }

  // Subcontractors item management
  const addSubcontractorsItem = () => {
    setSubcontractorsItems([...subcontractorsItems, {
      id: `temp-${Date.now()}`,
      company_name: '',
      description: '',
      source_type: 'invoice',
      source_reference: '',
      amount: 0,
      total: 0
    }])
    if (!expandedSections.subcontractors) toggleSection('subcontractors')
  }

  const updateSubcontractorsItem = (index, field, value) => {
    const newItems = [...subcontractorsItems]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === 'amount') {
      newItems[index].total = parseInt(value) || 0
    }
    setSubcontractorsItems(newItems)
  }

  const removeSubcontractorsItem = (index) => {
    setSubcontractorsItems(subcontractorsItems.filter((_, i) => i !== index))
  }

  // Import from T&M tickets
  const handleTicketImport = (importData) => {
    // Store imported ticket IDs for linking after save
    if (importData.ticketIds?.length > 0) {
      setImportedTicketIds(prev => [...new Set([...prev, ...importData.ticketIds])])
    }

    if (importData.laborItems?.length > 0) {
      setLaborItems([...laborItems, ...importData.laborItems])
      setExpandedSections(prev => ({ ...prev, labor: true }))
    }
    if (importData.materialsItems?.length > 0) {
      setMaterialsItems([...materialsItems, ...importData.materialsItems])
      setExpandedSections(prev => ({ ...prev, materials: true }))
    }
    if (importData.equipmentItems?.length > 0) {
      setEquipmentItems([...equipmentItems, ...importData.equipmentItems])
      setExpandedSections(prev => ({ ...prev, equipment: true }))
    }

    const itemCount = (importData.laborItems?.length || 0) +
                      (importData.materialsItems?.length || 0) +
                      (importData.equipmentItems?.length || 0)

    onShowToast?.(`Imported ${itemCount} item(s) from ${importData.ticketIds.length} ticket(s)`, 'success')
  }

  // Check if title is provided (minimum requirement)
  const canSave = title.trim().length > 0

  // Build database payload (excludes relation fields that aren't columns)
  const buildPayload = () => ({
    company_id: company.id,
    project_id: project.id,
    title,
    scope_of_work: scopeOfWork || '',
    area_id: areaId || null,
    cor_number: corNumber,
    group_name: groupName || null,
    period_start: periodStart || new Date().toISOString().split('T')[0],
    period_end: periodEnd || new Date().toISOString().split('T')[0],
    labor_markup_percent: laborMarkupPercent,
    materials_markup_percent: materialsMarkupPercent,
    equipment_markup_percent: equipmentMarkupPercent,
    subcontractors_markup_percent: subcontractorsMarkupPercent,
    liability_insurance_percent: liabilityInsurancePercent,
    bond_percent: bondPercent,
    license_fee_percent: licenseFeePercent,
    ...totals
  })

  // Save as draft
  const handleSave = async () => {
    if (!canSave) {
      onShowToast?.('Title is required', 'error')
      return
    }

    setLoading(true)
    try {
      const corPayload = {
        ...buildPayload(),
        status: 'draft'
      }

      let savedCOR
      if (existingCOR?.id) {
        savedCOR = await db.updateCOR(existingCOR.id, corPayload)
      } else {
        savedCOR = await db.createCOR(corPayload)
      }

      if (savedCOR?.id) {
        await db.saveCORLineItems(savedCOR.id, {
          laborItems,
          materialItems: materialsItems,
          equipmentItems,
          subcontractorItems: subcontractorsItems
        })

        // Link imported tickets to this COR as backup documentation
        if (importedTicketIds.length > 0) {
          const failedLinks = []
          for (const ticketId of importedTicketIds) {
            try {
              await db.assignTicketToCOR(ticketId, savedCOR.id)
            } catch (linkError) {
              console.warn(`Could not link ticket ${ticketId} to COR:`, linkError)
              failedLinks.push(ticketId)
            }
          }
          if (failedLinks.length > 0) {
            onShowToast?.(
              `COR saved, but ${failedLinks.length} ticket(s) could not be linked. Re-open to retry.`,
              'warning'
            )
            onSaved?.(savedCOR)
            onClose?.()
            return
          }
        }
      }

      onShowToast?.('COR saved as draft', 'success')
      onSaved?.(savedCOR)
      onClose?.()
    } catch (error) {
      console.error('Error saving COR:', error)
      onShowToast?.('Error saving COR', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Submit for approval
  const handleSubmit = async () => {
    const validation = validateCOR(corData)
    if (!validation.valid) {
      onShowToast?.(validation.errors[0], 'error')
      return
    }

    setLoading(true)
    try {
      const corPayload = {
        ...buildPayload(),
        status: 'draft'
      }

      let savedCOR
      let corIdToUse
      if (existingCOR?.id) {
        savedCOR = await db.updateCOR(existingCOR.id, corPayload)
        corIdToUse = existingCOR.id
        await db.saveCORLineItems(existingCOR.id, {
          laborItems,
          materialItems: materialsItems,
          equipmentItems,
          subcontractorItems: subcontractorsItems
        })
        await db.submitCORForApproval(existingCOR.id)
      } else {
        savedCOR = await db.createCOR(corPayload)
        if (savedCOR?.id) {
          corIdToUse = savedCOR.id
          await db.saveCORLineItems(savedCOR.id, {
            laborItems,
            materialItems: materialsItems,
            equipmentItems,
            subcontractorItems: subcontractorsItems
          })
          await db.submitCORForApproval(savedCOR.id)
        }
      }

      // Link imported tickets to this COR as backup documentation
      if (corIdToUse && importedTicketIds.length > 0) {
        for (const ticketId of importedTicketIds) {
          try {
            await db.assignTicketToCOR(ticketId, corIdToUse)
          } catch (linkError) {
            console.warn(`Could not link ticket ${ticketId} to COR:`, linkError)
          }
        }
      }

      onShowToast?.('COR submitted for approval', 'success')
      onSaved?.(savedCOR)
      onClose?.()
    } catch (error) {
      console.error('Error submitting COR:', error)
      onShowToast?.('Error submitting COR', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Section header component
  const SectionHeader = ({ section, label, count, subtotal }) => (
    <div
      className={`cor-section-header ${expandedSections[section] ? 'expanded' : ''}`}
      onClick={() => toggleSection(section)}
    >
      <div className="cor-section-title">
        {expandedSections[section] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span>{label}</span>
        {count > 0 && <span className="cor-section-count">{count}</span>}
      </div>
      {subtotal > 0 && (
        <span className="cor-section-subtotal">{formatCurrency(subtotal)}</span>
      )}
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content cor-form-modal cor-form-simplified" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{existingCOR ? 'Edit Change Order Request' : 'New Change Order Request'}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body cor-form-body">
          {/* Required: Title and Description */}
          <div className="cor-form-required">
            <div className="form-row">
              <div className="form-group cor-number-field">
                <label>COR #</label>
                <input
                  type="text"
                  value={corNumber}
                  onChange={(e) => setCORNumber(e.target.value)}
                  className="input-small"
                />
              </div>
              <div className="form-group flex-grow required">
                <label>Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Additional Demolition Work - Building A"
                  className="input-required"
                />
              </div>
            </div>

            <div className="form-group required">
              <label>Description</label>
              <textarea
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                rows={2}
                placeholder="Describe the scope of work"
                className="input-required"
              />
            </div>

            <div className="form-row form-row-compact">
              {areas && areas.length > 0 && (
                <div className="form-group">
                  <label>Area</label>
                  <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                    <option value="">None</option>
                    {areas.map(area => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Group</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Phase 1"
                />
              </div>
              <div className="form-group">
                <label>Start</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>End</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  min={periodStart}
                />
              </div>
            </div>
          </div>

          {/* Import from Tickets button */}
          <div className="cor-import-bar">
            <button className="btn btn-ghost" onClick={() => setShowTicketSelector(true)}>
              <FileText size={16} /> Import from Time & Material Tickets
            </button>
          </div>

          {/* Expandable Sections */}
          <div className="cor-sections">
            {/* Labor Section */}
            <div className="cor-section">
              <SectionHeader
                section="labor"
                label="Labor"
                count={laborItems.length}
                subtotal={totals.labor_subtotal}
              />
              {expandedSections.labor && (
                <div className="cor-section-content">
                  {laborItems.map((item, index) => (
                    <div key={item.id || index} className="line-item compact">
                      <div className="line-item-row">
                        <select
                          value={item.labor_class}
                          onChange={(e) => updateLaborItem(index, 'labor_class', e.target.value)}
                        >
                          {LABOR_CLASSES.map(lc => (
                            <option key={lc} value={lc}>{lc}</option>
                          ))}
                        </select>
                        <select
                          value={item.wage_type}
                          onChange={(e) => updateLaborItem(index, 'wage_type', e.target.value)}
                        >
                          {WAGE_TYPES.map(wt => (
                            <option key={wt.value} value={wt.value}>{wt.label}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Reg hrs"
                          value={item.regular_hours || ''}
                          onChange={(e) => updateLaborItem(index, 'regular_hours', e.target.value)}
                          className="input-small"
                        />
                        <span className="input-label">@</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="$/hr"
                          value={item.regular_rate ? (item.regular_rate / 100).toFixed(2) : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            updateLaborItem(index, 'regular_rate', Math.round(parseFloat(val || 0) * 100))
                          }}
                          className="input-small"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="OT hrs"
                          value={item.overtime_hours || ''}
                          onChange={(e) => updateLaborItem(index, 'overtime_hours', e.target.value)}
                          className="input-small"
                        />
                        <span className="input-label">@</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="$/hr"
                          value={item.overtime_rate ? (item.overtime_rate / 100).toFixed(2) : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            updateLaborItem(index, 'overtime_rate', Math.round(parseFloat(val || 0) * 100))
                          }}
                          className="input-small"
                        />
                        <span className="line-item-total">{formatCurrency(item.total)}</span>
                        <button className="btn-icon" onClick={() => removeLaborItem(index)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-add" onClick={addLaborItem}>
                    <Plus size={14} /> Add Labor
                  </button>
                </div>
              )}
            </div>

            {/* Materials Section */}
            <div className="cor-section">
              <SectionHeader
                section="materials"
                label="Materials"
                count={materialsItems.length}
                subtotal={totals.materials_subtotal}
              />
              {expandedSections.materials && (
                <div className="cor-section-content">
                  {/* Quick select */}
                  {companyMaterials.filter(m => ['Containment', 'PPE', 'Disposal'].includes(m.category) && m.active !== false).length > 0 && (
                    <div className="quick-select-compact">
                      <div className="quick-select-search">
                        <Search size={14} />
                        <input
                          type="text"
                          placeholder="Search materials..."
                          value={materialSearch}
                          onChange={(e) => setMaterialSearch(e.target.value)}
                        />
                      </div>
                      <div className="quick-select-items">
                        {filteredMaterials.slice(0, 8).map(item => (
                          <button
                            key={item.id}
                            className="quick-item"
                            onClick={() => addMaterialFromLibrary(item)}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {materialsItems.map((item, index) => (
                    <div key={item.id || index} className="line-item compact">
                      <div className="line-item-row">
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateMaterialsItem(index, 'description', e.target.value)}
                          className="input-wide"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Qty"
                          value={item.quantity || ''}
                          onChange={(e) => updateMaterialsItem(index, 'quantity', e.target.value)}
                          className="input-small"
                        />
                        <select
                          value={item.unit}
                          onChange={(e) => updateMaterialsItem(index, 'unit', e.target.value)}
                        >
                          {COMMON_UNITS.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <span className="input-label">@</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="$/unit"
                          value={item.unit_cost ? (item.unit_cost / 100).toFixed(2) : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            updateMaterialsItem(index, 'unit_cost', Math.round(parseFloat(val || 0) * 100))
                          }}
                          className="input-small"
                        />
                        <span className="line-item-total">{formatCurrency(item.total)}</span>
                        <button className="btn-icon" onClick={() => removeMaterialsItem(index)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-add" onClick={addMaterialsItem}>
                    <Plus size={14} /> Add Material
                  </button>
                </div>
              )}
            </div>

            {/* Equipment Section */}
            <div className="cor-section">
              <SectionHeader
                section="equipment"
                label="Equipment"
                count={equipmentItems.length}
                subtotal={totals.equipment_subtotal}
              />
              {expandedSections.equipment && (
                <div className="cor-section-content">
                  {/* Quick select */}
                  {companyMaterials.filter(m => m.category === 'Equipment' && m.active !== false).length > 0 && (
                    <div className="quick-select-compact">
                      <div className="quick-select-search">
                        <Search size={14} />
                        <input
                          type="text"
                          placeholder="Search equipment..."
                          value={equipmentSearch}
                          onChange={(e) => setEquipmentSearch(e.target.value)}
                        />
                      </div>
                      <div className="quick-select-items">
                        {filteredEquipment.slice(0, 8).map(item => (
                          <button
                            key={item.id}
                            className="quick-item"
                            onClick={() => addEquipmentFromLibrary(item)}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {equipmentItems.map((item, index) => (
                    <div key={item.id || index} className="line-item compact">
                      <div className="line-item-row">
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateEquipmentItem(index, 'description', e.target.value)}
                          className="input-wide"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Qty"
                          value={item.quantity || ''}
                          onChange={(e) => updateEquipmentItem(index, 'quantity', e.target.value)}
                          className="input-small"
                        />
                        <select
                          value={item.unit}
                          onChange={(e) => updateEquipmentItem(index, 'unit', e.target.value)}
                        >
                          {COMMON_UNITS.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <span className="input-label">@</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="$/unit"
                          value={item.unit_cost ? (item.unit_cost / 100).toFixed(2) : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            updateEquipmentItem(index, 'unit_cost', Math.round(parseFloat(val || 0) * 100))
                          }}
                          className="input-small"
                        />
                        <span className="line-item-total">{formatCurrency(item.total)}</span>
                        <button className="btn-icon" onClick={() => removeEquipmentItem(index)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-add" onClick={addEquipmentItem}>
                    <Plus size={14} /> Add Equipment
                  </button>
                </div>
              )}
            </div>

            {/* Subcontractors Section */}
            <div className="cor-section">
              <SectionHeader
                section="subcontractors"
                label="Subcontractors"
                count={subcontractorsItems.length}
                subtotal={totals.subcontractors_subtotal}
              />
              {expandedSections.subcontractors && (
                <div className="cor-section-content">
                  {subcontractorsItems.map((item, index) => (
                    <div key={item.id || index} className="line-item compact">
                      <div className="line-item-row">
                        <input
                          type="text"
                          placeholder="Company"
                          value={item.company_name}
                          onChange={(e) => updateSubcontractorsItem(index, 'company_name', e.target.value)}
                          className="input-wide"
                        />
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateSubcontractorsItem(index, 'description', e.target.value)}
                          className="input-wide"
                        />
                        <input
                          type="text"
                          placeholder="Invoice #"
                          value={item.source_reference || ''}
                          onChange={(e) => updateSubcontractorsItem(index, 'source_reference', e.target.value)}
                          className="input-small"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Amount"
                          value={item.amount ? (item.amount / 100).toFixed(2) : ''}
                          onChange={(e) => {
                            const val = e.target.value
                            updateSubcontractorsItem(index, 'amount', Math.round(parseFloat(val || 0) * 100))
                          }}
                          className="input-small"
                        />
                        <span className="line-item-total">{formatCurrency(item.total)}</span>
                        <button className="btn-icon" onClick={() => removeSubcontractorsItem(index)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-add" onClick={addSubcontractorsItem}>
                    <Plus size={14} /> Add Subcontractor
                  </button>
                </div>
              )}
            </div>

            {/* Markups & Fees Section */}
            <div className="cor-section">
              <SectionHeader
                section="markups"
                label="Markups & Fees"
                count={0}
                subtotal={totals.total_markup_amount + totals.total_fees}
              />
              {expandedSections.markups && (
                <div className="cor-section-content markups-content">
                  <div className="markups-grid-compact">
                    <div className="markup-row">
                      <span>Labor Markup</span>
                      <div className="markup-input-compact">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={basisPointsToPercent(laborMarkupPercent)}
                          onChange={(e) => setLaborMarkupPercent(percentToBasisPoints(e.target.value.replace(/[^0-9.]/g, '')))}
                        />
                        <span>%</span>
                      </div>
                      <span className="markup-result">+{formatCurrency(totals.labor_markup_amount)}</span>
                    </div>
                    <div className="markup-row">
                      <span>Materials Markup</span>
                      <div className="markup-input-compact">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={basisPointsToPercent(materialsMarkupPercent)}
                          onChange={(e) => setMaterialsMarkupPercent(percentToBasisPoints(e.target.value.replace(/[^0-9.]/g, '')))}
                        />
                        <span>%</span>
                      </div>
                      <span className="markup-result">+{formatCurrency(totals.materials_markup_amount)}</span>
                    </div>
                    <div className="markup-row">
                      <span>Equipment Markup</span>
                      <div className="markup-input-compact">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={basisPointsToPercent(equipmentMarkupPercent)}
                          onChange={(e) => setEquipmentMarkupPercent(percentToBasisPoints(e.target.value.replace(/[^0-9.]/g, '')))}
                        />
                        <span>%</span>
                      </div>
                      <span className="markup-result">+{formatCurrency(totals.equipment_markup_amount)}</span>
                    </div>
                    <div className="markup-row">
                      <span>Subcontractors Markup</span>
                      <div className="markup-input-compact">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={basisPointsToPercent(subcontractorsMarkupPercent)}
                          onChange={(e) => setSubcontractorsMarkupPercent(percentToBasisPoints(e.target.value.replace(/[^0-9.]/g, '')))}
                        />
                        <span>%</span>
                      </div>
                      <span className="markup-result">+{formatCurrency(totals.subcontractors_markup_amount)}</span>
                    </div>
                  </div>
                  <div className="fees-grid-compact">
                    <div className="markup-row">
                      <span>Liability Insurance</span>
                      <div className="markup-input-compact">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={basisPointsToPercent(liabilityInsurancePercent)}
                          onChange={(e) => setLiabilityInsurancePercent(percentToBasisPoints(e.target.value.replace(/[^0-9.]/g, '')))}
                        />
                        <span>%</span>
                      </div>
                      <span className="markup-result">+{formatCurrency(totals.liability_insurance_amount)}</span>
                    </div>
                    <div className="markup-row">
                      <span>Bond</span>
                      <div className="markup-input-compact">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={basisPointsToPercent(bondPercent)}
                          onChange={(e) => setBondPercent(percentToBasisPoints(e.target.value.replace(/[^0-9.]/g, '')))}
                        />
                        <span>%</span>
                      </div>
                      <span className="markup-result">+{formatCurrency(totals.bond_amount)}</span>
                    </div>
                    <div className="markup-row">
                      <span>City License Fee</span>
                      <div className="markup-input-compact">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={basisPointsToPercent(licenseFeePercent)}
                          onChange={(e) => setLicenseFeePercent(percentToBasisPoints(e.target.value.replace(/[^0-9.]/g, '')))}
                        />
                        <span>%</span>
                      </div>
                      <span className="markup-result">+{formatCurrency(totals.license_fee_amount)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Summary Footer */}
          <div className="cor-summary-bar">
            <div className="cor-summary-item">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.cor_subtotal)}</span>
            </div>
            <div className="cor-summary-item total">
              <span>Total</span>
              <span>{formatCurrency(totals.cor_total)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-footer cor-form-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <div className="footer-actions">
            <button
              className="btn btn-secondary"
              onClick={handleSave}
              disabled={loading || !canSave}
            >
              <Save size={16} /> Save Draft
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading || !validateCOR(corData).valid}
            >
              <Send size={16} /> Submit
            </button>
          </div>
        </div>
      </div>

      {/* Ticket Selector Modal */}
      {showTicketSelector && (
        <TicketSelector
          projectId={project.id}
          corId={existingCOR?.id}
          onImport={handleTicketImport}
          onClose={() => setShowTicketSelector(false)}
          onShowToast={onShowToast}
        />
      )}
    </div>
  )
}
