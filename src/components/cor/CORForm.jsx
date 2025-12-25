import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, ChevronLeft, ChevronRight, Save, Send, AlertCircle, FileText } from 'lucide-react'
import { db } from '../../lib/supabase'
import {
  formatCurrency,
  formatPercent,
  dollarsToCents,
  centsToDollars,
  basisPointsToPercent,
  percentToBasisPoints,
  calculateLaborItemTotal,
  calculateLineItemTotal,
  calculateCORTotals,
  validateCOR,
  DEFAULT_PERCENTAGES,
  LABOR_CLASSES,
  WAGE_TYPES,
  SOURCE_TYPES,
  COMMON_UNITS
} from '../../lib/corCalculations'
import TicketSelector from './TicketSelector'

const STEPS = [
  { id: 1, label: 'Title & Info', shortLabel: 'Info' },
  { id: 2, label: 'Period', shortLabel: 'Period' },
  { id: 3, label: 'Labor', shortLabel: 'Labor' },
  { id: 4, label: 'Materials', shortLabel: 'Materials' },
  { id: 5, label: 'Equipment', shortLabel: 'Equipment' },
  { id: 6, label: 'Subcontractors', shortLabel: 'Subs' },
  { id: 7, label: 'Markups & Fees', shortLabel: 'Markups' },
  { id: 8, label: 'Summary', shortLabel: 'Summary' },
  { id: 9, label: 'Submit', shortLabel: 'Submit' }
]

export default function CORForm({ project, company, areas, existingCOR, onClose, onSaved, onShowToast }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [laborRates, setLaborRates] = useState([])
  const [showTicketSelector, setShowTicketSelector] = useState(false)

  // Basic Info (Step 1)
  const [title, setTitle] = useState(existingCOR?.title || '')
  const [scopeOfWork, setScopeOfWork] = useState(existingCOR?.scope_of_work || '')
  const [areaId, setAreaId] = useState(existingCOR?.area_id || '')
  const [corNumber, setCORNumber] = useState(existingCOR?.cor_number || '')

  // Period (Step 2)
  const [periodStart, setPeriodStart] = useState(existingCOR?.period_start || '')
  const [periodEnd, setPeriodEnd] = useState(existingCOR?.period_end || '')

  // Labor Items (Step 3)
  const [laborItems, setLaborItems] = useState(existingCOR?.change_order_labor || [])

  // Materials Items (Step 4)
  const [materialsItems, setMaterialsItems] = useState(existingCOR?.change_order_materials || [])

  // Equipment Items (Step 5)
  const [equipmentItems, setEquipmentItems] = useState(existingCOR?.change_order_equipment || [])

  // Subcontractors Items (Step 6)
  const [subcontractorsItems, setSubcontractorsItems] = useState(existingCOR?.change_order_subcontractors || [])

  // Markups & Fees (Step 7)
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

  // Load labor rates on mount
  useEffect(() => {
    loadLaborRates()
    if (!existingCOR) {
      generateCORNumber()
    }
  }, [])

  const loadLaborRates = async () => {
    try {
      // Load rates for the project's work type and job type
      const rates = await db.getLaborRates?.(company?.id, project?.work_type, project?.job_type)
      setLaborRates(rates || [])
    } catch (error) {
      console.error('Error loading labor rates:', error)
    }
  }

  // Find rate for a specific labor class
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

  // Build COR object for calculations and validation
  const corData = useMemo(() => ({
    title,
    scope_of_work: scopeOfWork,
    area_id: areaId || null,
    cor_number: corNumber,
    period_start: periodStart,
    period_end: periodEnd,
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
    title, scopeOfWork, areaId, corNumber, periodStart, periodEnd,
    laborItems, materialsItems, equipmentItems, subcontractorsItems,
    laborMarkupPercent, materialsMarkupPercent, equipmentMarkupPercent, subcontractorsMarkupPercent,
    liabilityInsurancePercent, bondPercent, licenseFeePercent
  ])

  // Calculate totals
  const totals = useMemo(() => calculateCORTotals(corData), [corData])

  // Validate current step
  const validateStep = (stepNum) => {
    switch (stepNum) {
      case 1:
        if (!title.trim()) {
          onShowToast?.('Title is required', 'error')
          return false
        }
        if (!scopeOfWork.trim()) {
          onShowToast?.('Scope of work is required', 'error')
          return false
        }
        return true
      case 2:
        if (!periodStart) {
          onShowToast?.('Start date is required', 'error')
          return false
        }
        if (!periodEnd) {
          onShowToast?.('End date is required', 'error')
          return false
        }
        if (new Date(periodEnd) < new Date(periodStart)) {
          onShowToast?.('End date must be after start date', 'error')
          return false
        }
        return true
      default:
        return true
    }
  }

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(Math.min(step + 1, STEPS.length))
    }
  }

  const handleBack = () => {
    setStep(Math.max(step - 1, 1))
  }

  const handleStepClick = (stepNum) => {
    // Only allow going to previous steps or validate current before forward
    if (stepNum < step) {
      setStep(stepNum)
    } else if (stepNum > step) {
      // Validate all steps up to current before jumping forward
      for (let i = step; i < stepNum; i++) {
        if (!validateStep(i)) return
      }
      setStep(stepNum)
    }
  }

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
  }

  const updateLaborItem = (index, field, value) => {
    const newItems = [...laborItems]
    newItems[index] = { ...newItems[index], [field]: value }

    // Auto-populate rates when labor class changes
    if (field === 'labor_class') {
      const rate = getRateForClass(value)
      if (rate) {
        newItems[index].regular_rate = Math.round((parseFloat(rate.regular_rate) || 0) * 100)
        newItems[index].overtime_rate = Math.round((parseFloat(rate.overtime_rate) || 0) * 100)
      }
    }

    // Recalculate total
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
  }

  const updateMaterialsItem = (index, field, value) => {
    const newItems = [...materialsItems]
    newItems[index] = { ...newItems[index], [field]: value }

    // Recalculate total
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
  }

  const updateEquipmentItem = (index, field, value) => {
    const newItems = [...equipmentItems]
    newItems[index] = { ...newItems[index], [field]: value }

    // Recalculate total
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
  }

  const updateSubcontractorsItem = (index, field, value) => {
    const newItems = [...subcontractorsItems]
    newItems[index] = { ...newItems[index], [field]: value }

    // For subcontractors, amount = total
    if (field === 'amount') {
      newItems[index].total = parseInt(value) || 0
    }

    setSubcontractorsItems(newItems)
  }

  const removeSubcontractorsItem = (index) => {
    setSubcontractorsItems(subcontractorsItems.filter((_, i) => i !== index))
  }

  // Import data from T&M tickets
  const handleTicketImport = (importData) => {
    if (importData.laborItems?.length > 0) {
      setLaborItems([...laborItems, ...importData.laborItems])
    }
    if (importData.materialsItems?.length > 0) {
      setMaterialsItems([...materialsItems, ...importData.materialsItems])
    }
    if (importData.equipmentItems?.length > 0) {
      setEquipmentItems([...equipmentItems, ...importData.equipmentItems])
    }
    onShowToast?.(`Imported data from ${importData.ticketIds.length} ticket(s)`, 'success')
  }

  // Save as draft
  const handleSave = async () => {
    setLoading(true)
    try {
      const corPayload = {
        company_id: company.id,
        project_id: project.id,
        ...corData,
        ...totals,
        status: 'draft'
      }

      let savedCOR
      if (existingCOR?.id) {
        savedCOR = await db.updateCOR(existingCOR.id, corPayload)
      } else {
        savedCOR = await db.createCOR(corPayload)
      }

      // Save line items
      if (savedCOR?.id) {
        await db.saveCORLineItems(savedCOR.id, {
          laborItems,
          materialItems: materialsItems,
          equipmentItems,
          subcontractorItems: subcontractorsItems
        })
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
        company_id: company.id,
        project_id: project.id,
        ...corData,
        ...totals,
        status: 'pending_approval'
      }

      let savedCOR
      if (existingCOR?.id) {
        savedCOR = await db.updateCOR(existingCOR.id, { ...corPayload, status: 'draft' })
        // Save line items
        await db.saveCORLineItems(existingCOR.id, {
          laborItems,
          materialItems: materialsItems,
          equipmentItems,
          subcontractorItems: subcontractorsItems
        })
        await db.submitCORForApproval(existingCOR.id)
      } else {
        // Create new COR and submit for approval
        savedCOR = await db.createCOR({ ...corPayload, status: 'draft' })
        if (savedCOR?.id) {
          // Save line items
          await db.saveCORLineItems(savedCOR.id, {
            laborItems,
            materialItems: materialsItems,
            equipmentItems,
            subcontractorItems: subcontractorsItems
          })
          await db.submitCORForApproval(savedCOR.id)
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content cor-form-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{existingCOR ? 'Edit Change Order Request' : 'New Change Order Request'}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Progress Steps */}
        <div className="cor-progress-steps">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`cor-step ${step >= s.id ? 'active' : ''} ${step === s.id ? 'current' : ''}`}
              onClick={() => handleStepClick(s.id)}
            >
              <span className="cor-step-number">{s.id}</span>
              <span className="cor-step-label">{s.shortLabel}</span>
            </div>
          ))}
        </div>

        <div className="modal-body cor-form-body">
          {/* Step 1: Title & Info */}
          {step === 1 && (
            <div className="cor-form-step">
              <h3>Basic Information</h3>

              <div className="form-group">
                <label>COR Number</label>
                <input
                  type="text"
                  value={corNumber}
                  onChange={(e) => setCORNumber(e.target.value)}
                  placeholder="Auto-generated"
                  className="input-readonly"
                  readOnly
                />
              </div>

              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Additional Demolition Work - Building A"
                />
              </div>

              <div className="form-group">
                <label>Scope of Work *</label>
                <textarea
                  value={scopeOfWork}
                  onChange={(e) => setScopeOfWork(e.target.value)}
                  rows={4}
                  placeholder="Describe the scope of work covered by this change order..."
                />
              </div>

              {areas && areas.length > 0 && (
                <div className="form-group">
                  <label>Work Area (Optional)</label>
                  <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                    <option value="">No specific area</option>
                    {areas.map(area => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Period */}
          {step === 2 && (
            <div className="cor-form-step">
              <h3>Work Period</h3>
              <p className="step-description">Specify the date range for this change order work.</p>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>End Date *</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    min={periodStart}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Labor */}
          {step === 3 && (
            <div className="cor-form-step">
              <div className="step-header">
                <div>
                  <h3>Labor</h3>
                  <p className="step-description">Add labor costs for this change order.</p>
                </div>
                <div className="step-header-actions">
                  <button className="btn btn-ghost" onClick={() => setShowTicketSelector(true)}>
                    <FileText size={16} /> Import from Tickets
                  </button>
                  <button className="btn btn-secondary" onClick={addLaborItem}>
                    <Plus size={16} /> Add Labor
                  </button>
                </div>
              </div>

              {laborItems.length === 0 ? (
                <div className="empty-items">
                  <p>No labor items added yet.</p>
                  <button className="btn btn-primary" onClick={addLaborItem}>
                    <Plus size={16} /> Add First Labor Item
                  </button>
                </div>
              ) : (
                <div className="line-items-list">
                  {laborItems.map((item, index) => (
                    <div key={item.id || index} className="line-item labor-item">
                      <div className="line-item-header">
                        <span className="line-item-number">#{index + 1}</span>
                        <button
                          className="btn btn-ghost btn-small"
                          onClick={() => removeLaborItem(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Labor Class</label>
                          <select
                            value={item.labor_class}
                            onChange={(e) => updateLaborItem(index, 'labor_class', e.target.value)}
                          >
                            {LABOR_CLASSES.map(lc => (
                              <option key={lc} value={lc}>{lc}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Wage Type</label>
                          <select
                            value={item.wage_type}
                            onChange={(e) => updateLaborItem(index, 'wage_type', e.target.value)}
                          >
                            {WAGE_TYPES.map(wt => (
                              <option key={wt.value} value={wt.value}>{wt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="form-row four-col">
                        <div className="form-group">
                          <label>Reg Hours</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={item.regular_hours}
                            onChange={(e) => updateLaborItem(index, 'regular_hours', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Reg Rate ($/hr)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={centsToDollars(item.regular_rate)}
                            onChange={(e) => updateLaborItem(index, 'regular_rate', dollarsToCents(e.target.value))}
                          />
                        </div>
                        <div className="form-group">
                          <label>OT Hours</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={item.overtime_hours}
                            onChange={(e) => updateLaborItem(index, 'overtime_hours', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>OT Rate ($/hr)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={centsToDollars(item.overtime_rate)}
                            onChange={(e) => updateLaborItem(index, 'overtime_rate', dollarsToCents(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="line-item-total">
                        Total: <strong>{formatCurrency(item.total)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="section-subtotal">
                Labor Subtotal: <strong>{formatCurrency(totals.labor_subtotal)}</strong>
              </div>
            </div>
          )}

          {/* Step 4: Materials */}
          {step === 4 && (
            <div className="cor-form-step">
              <div className="step-header">
                <div>
                  <h3>Materials</h3>
                  <p className="step-description">Add material costs for this change order.</p>
                </div>
                <button className="btn btn-secondary" onClick={addMaterialsItem}>
                  <Plus size={16} /> Add Material
                </button>
              </div>

              {materialsItems.length === 0 ? (
                <div className="empty-items">
                  <p>No materials added yet.</p>
                  <button className="btn btn-primary" onClick={addMaterialsItem}>
                    <Plus size={16} /> Add First Material
                  </button>
                </div>
              ) : (
                <div className="line-items-list">
                  {materialsItems.map((item, index) => (
                    <div key={item.id || index} className="line-item">
                      <div className="line-item-header">
                        <span className="line-item-number">#{index + 1}</span>
                        <button
                          className="btn btn-ghost btn-small"
                          onClick={() => removeMaterialsItem(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateMaterialsItem(index, 'description', e.target.value)}
                          placeholder="Material description"
                        />
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Source</label>
                          <select
                            value={item.source_type}
                            onChange={(e) => updateMaterialsItem(index, 'source_type', e.target.value)}
                          >
                            {SOURCE_TYPES.materials.map(st => (
                              <option key={st.value} value={st.value}>{st.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Reference</label>
                          <input
                            type="text"
                            value={item.source_reference}
                            onChange={(e) => updateMaterialsItem(index, 'source_reference', e.target.value)}
                            placeholder="Ticket #, Invoice #"
                          />
                        </div>
                      </div>

                      <div className="form-row three-col">
                        <div className="form-group">
                          <label>Quantity</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateMaterialsItem(index, 'quantity', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Unit</label>
                          <select
                            value={item.unit}
                            onChange={(e) => updateMaterialsItem(index, 'unit', e.target.value)}
                          >
                            {COMMON_UNITS.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Unit Cost ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={centsToDollars(item.unit_cost)}
                            onChange={(e) => updateMaterialsItem(index, 'unit_cost', dollarsToCents(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="line-item-total">
                        Total: <strong>{formatCurrency(item.total)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="section-subtotal">
                Materials Subtotal: <strong>{formatCurrency(totals.materials_subtotal)}</strong>
              </div>
            </div>
          )}

          {/* Step 5: Equipment */}
          {step === 5 && (
            <div className="cor-form-step">
              <div className="step-header">
                <div>
                  <h3>Equipment</h3>
                  <p className="step-description">Add equipment rental costs for this change order.</p>
                </div>
                <button className="btn btn-secondary" onClick={addEquipmentItem}>
                  <Plus size={16} /> Add Equipment
                </button>
              </div>

              {equipmentItems.length === 0 ? (
                <div className="empty-items">
                  <p>No equipment added yet.</p>
                  <button className="btn btn-primary" onClick={addEquipmentItem}>
                    <Plus size={16} /> Add First Equipment
                  </button>
                </div>
              ) : (
                <div className="line-items-list">
                  {equipmentItems.map((item, index) => (
                    <div key={item.id || index} className="line-item">
                      <div className="line-item-header">
                        <span className="line-item-number">#{index + 1}</span>
                        <button
                          className="btn btn-ghost btn-small"
                          onClick={() => removeEquipmentItem(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateEquipmentItem(index, 'description', e.target.value)}
                          placeholder="Equipment description"
                        />
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Source</label>
                          <select
                            value={item.source_type}
                            onChange={(e) => updateEquipmentItem(index, 'source_type', e.target.value)}
                          >
                            {SOURCE_TYPES.equipment.map(st => (
                              <option key={st.value} value={st.value}>{st.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Reference</label>
                          <input
                            type="text"
                            value={item.source_reference}
                            onChange={(e) => updateEquipmentItem(index, 'source_reference', e.target.value)}
                            placeholder="Ticket #, Invoice #"
                          />
                        </div>
                      </div>

                      <div className="form-row three-col">
                        <div className="form-group">
                          <label>Quantity</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateEquipmentItem(index, 'quantity', e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Unit</label>
                          <select
                            value={item.unit}
                            onChange={(e) => updateEquipmentItem(index, 'unit', e.target.value)}
                          >
                            {COMMON_UNITS.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Unit Cost ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={centsToDollars(item.unit_cost)}
                            onChange={(e) => updateEquipmentItem(index, 'unit_cost', dollarsToCents(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="line-item-total">
                        Total: <strong>{formatCurrency(item.total)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="section-subtotal">
                Equipment Subtotal: <strong>{formatCurrency(totals.equipment_subtotal)}</strong>
              </div>
            </div>
          )}

          {/* Step 6: Subcontractors */}
          {step === 6 && (
            <div className="cor-form-step">
              <div className="step-header">
                <div>
                  <h3>Subcontractors</h3>
                  <p className="step-description">Add subcontractor costs for this change order.</p>
                </div>
                <button className="btn btn-secondary" onClick={addSubcontractorsItem}>
                  <Plus size={16} /> Add Subcontractor
                </button>
              </div>

              {subcontractorsItems.length === 0 ? (
                <div className="empty-items">
                  <p>No subcontractors added yet.</p>
                  <button className="btn btn-primary" onClick={addSubcontractorsItem}>
                    <Plus size={16} /> Add First Subcontractor
                  </button>
                </div>
              ) : (
                <div className="line-items-list">
                  {subcontractorsItems.map((item, index) => (
                    <div key={item.id || index} className="line-item">
                      <div className="line-item-header">
                        <span className="line-item-number">#{index + 1}</span>
                        <button
                          className="btn btn-ghost btn-small"
                          onClick={() => removeSubcontractorsItem(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="form-group">
                        <label>Company Name</label>
                        <input
                          type="text"
                          value={item.company_name}
                          onChange={(e) => updateSubcontractorsItem(index, 'company_name', e.target.value)}
                          placeholder="Subcontractor company name"
                        />
                      </div>

                      <div className="form-group">
                        <label>Description of Work</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateSubcontractorsItem(index, 'description', e.target.value)}
                          placeholder="Work performed"
                        />
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Source</label>
                          <select
                            value={item.source_type}
                            onChange={(e) => updateSubcontractorsItem(index, 'source_type', e.target.value)}
                          >
                            {SOURCE_TYPES.subcontractors.map(st => (
                              <option key={st.value} value={st.value}>{st.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Reference</label>
                          <input
                            type="text"
                            value={item.source_reference}
                            onChange={(e) => updateSubcontractorsItem(index, 'source_reference', e.target.value)}
                            placeholder="Invoice #, Quote #"
                          />
                        </div>
                        <div className="form-group">
                          <label>Amount ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={centsToDollars(item.amount)}
                            onChange={(e) => updateSubcontractorsItem(index, 'amount', dollarsToCents(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="line-item-total">
                        Total: <strong>{formatCurrency(item.total)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="section-subtotal">
                Subcontractors Subtotal: <strong>{formatCurrency(totals.subcontractors_subtotal)}</strong>
              </div>
            </div>
          )}

          {/* Step 7: Markups & Fees */}
          {step === 7 && (
            <div className="cor-form-step">
              <h3>Markups & Fees</h3>
              <p className="step-description">Configure markup percentages and additional fees.</p>

              <div className="markups-section">
                <h4>Markups</h4>
                <div className="markups-grid">
                  <div className="markup-item">
                    <label>Labor Markup</label>
                    <div className="markup-input">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={basisPointsToPercent(laborMarkupPercent)}
                        onChange={(e) => setLaborMarkupPercent(percentToBasisPoints(e.target.value))}
                      />
                      <span>%</span>
                    </div>
                    <span className="markup-amount">
                      +{formatCurrency(totals.labor_markup_amount)}
                    </span>
                  </div>

                  <div className="markup-item">
                    <label>Materials Markup</label>
                    <div className="markup-input">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={basisPointsToPercent(materialsMarkupPercent)}
                        onChange={(e) => setMaterialsMarkupPercent(percentToBasisPoints(e.target.value))}
                      />
                      <span>%</span>
                    </div>
                    <span className="markup-amount">
                      +{formatCurrency(totals.materials_markup_amount)}
                    </span>
                  </div>

                  <div className="markup-item">
                    <label>Equipment Markup</label>
                    <div className="markup-input">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={basisPointsToPercent(equipmentMarkupPercent)}
                        onChange={(e) => setEquipmentMarkupPercent(percentToBasisPoints(e.target.value))}
                      />
                      <span>%</span>
                    </div>
                    <span className="markup-amount">
                      +{formatCurrency(totals.equipment_markup_amount)}
                    </span>
                  </div>

                  <div className="markup-item">
                    <label>Subcontractors Markup</label>
                    <div className="markup-input">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={basisPointsToPercent(subcontractorsMarkupPercent)}
                        onChange={(e) => setSubcontractorsMarkupPercent(percentToBasisPoints(e.target.value))}
                      />
                      <span>%</span>
                    </div>
                    <span className="markup-amount">
                      +{formatCurrency(totals.subcontractors_markup_amount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="fees-section">
                <h4>Additional Fees</h4>
                <div className="fees-grid">
                  <div className="fee-item">
                    <label>Liability Insurance</label>
                    <div className="fee-input">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={basisPointsToPercent(liabilityInsurancePercent)}
                        onChange={(e) => setLiabilityInsurancePercent(percentToBasisPoints(e.target.value))}
                      />
                      <span>%</span>
                    </div>
                    <span className="fee-amount">
                      +{formatCurrency(totals.liability_insurance_amount)}
                    </span>
                  </div>

                  <div className="fee-item">
                    <label>Bond</label>
                    <div className="fee-input">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={basisPointsToPercent(bondPercent)}
                        onChange={(e) => setBondPercent(percentToBasisPoints(e.target.value))}
                      />
                      <span>%</span>
                    </div>
                    <span className="fee-amount">
                      +{formatCurrency(totals.bond_amount)}
                    </span>
                  </div>

                  <div className="fee-item">
                    <label>City License Fee</label>
                    <div className="fee-input">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="100"
                        value={basisPointsToPercent(licenseFeePercent)}
                        onChange={(e) => setLicenseFeePercent(percentToBasisPoints(e.target.value))}
                      />
                      <span>%</span>
                    </div>
                    <span className="fee-amount">
                      +{formatCurrency(totals.license_fee_amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 8: Summary */}
          {step === 8 && (
            <div className="cor-form-step">
              <h3>Summary</h3>

              <div className="cor-summary">
                <div className="summary-header">
                  <div className="summary-title">{title || 'Untitled COR'}</div>
                  <div className="summary-number">{corNumber}</div>
                </div>

                <div className="summary-section">
                  <h4>Costs Breakdown</h4>
                  <div className="summary-line">
                    <span>Labor ({laborItems.length} items)</span>
                    <span>{formatCurrency(totals.labor_subtotal)}</span>
                  </div>
                  <div className="summary-line indent">
                    <span>+ Markup ({formatPercent(laborMarkupPercent)})</span>
                    <span>{formatCurrency(totals.labor_markup_amount)}</span>
                  </div>

                  <div className="summary-line">
                    <span>Materials ({materialsItems.length} items)</span>
                    <span>{formatCurrency(totals.materials_subtotal)}</span>
                  </div>
                  <div className="summary-line indent">
                    <span>+ Markup ({formatPercent(materialsMarkupPercent)})</span>
                    <span>{formatCurrency(totals.materials_markup_amount)}</span>
                  </div>

                  <div className="summary-line">
                    <span>Equipment ({equipmentItems.length} items)</span>
                    <span>{formatCurrency(totals.equipment_subtotal)}</span>
                  </div>
                  <div className="summary-line indent">
                    <span>+ Markup ({formatPercent(equipmentMarkupPercent)})</span>
                    <span>{formatCurrency(totals.equipment_markup_amount)}</span>
                  </div>

                  <div className="summary-line">
                    <span>Subcontractors ({subcontractorsItems.length} items)</span>
                    <span>{formatCurrency(totals.subcontractors_subtotal)}</span>
                  </div>
                  <div className="summary-line indent">
                    <span>+ Markup ({formatPercent(subcontractorsMarkupPercent)})</span>
                    <span>{formatCurrency(totals.subcontractors_markup_amount)}</span>
                  </div>
                </div>

                <div className="summary-subtotal">
                  <span>COR Subtotal</span>
                  <span>{formatCurrency(totals.cor_subtotal)}</span>
                </div>

                <div className="summary-section">
                  <h4>Additional Fees</h4>
                  <div className="summary-line">
                    <span>Liability Insurance ({formatPercent(liabilityInsurancePercent)})</span>
                    <span>{formatCurrency(totals.liability_insurance_amount)}</span>
                  </div>
                  <div className="summary-line">
                    <span>Bond ({formatPercent(bondPercent)})</span>
                    <span>{formatCurrency(totals.bond_amount)}</span>
                  </div>
                  <div className="summary-line">
                    <span>City License Fee ({formatPercent(licenseFeePercent)})</span>
                    <span>{formatCurrency(totals.license_fee_amount)}</span>
                  </div>
                </div>

                <div className="summary-total">
                  <span>COR Total</span>
                  <span>{formatCurrency(totals.cor_total)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 9: Submit */}
          {step === 9 && (
            <div className="cor-form-step">
              <h3>Submit Change Order Request</h3>

              <div className="submit-preview">
                <div className="preview-card">
                  <div className="preview-header">
                    <span className="preview-number">{corNumber}</span>
                    <span className="preview-total">{formatCurrency(totals.cor_total)}</span>
                  </div>
                  <div className="preview-title">{title}</div>
                  <div className="preview-scope">{scopeOfWork}</div>
                </div>

                {(() => {
                  const validation = validateCOR(corData)
                  if (!validation.valid) {
                    return (
                      <div className="validation-errors">
                        <AlertCircle size={20} />
                        <div>
                          <strong>Please fix the following issues:</strong>
                          <ul>
                            {validation.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div className="validation-success">
                      Ready to submit for approval!
                    </div>
                  )
                })()}

                <div className="submit-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={handleSave}
                    disabled={loading}
                  >
                    <Save size={16} /> Save as Draft
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={loading || !validateCOR(corData).valid}
                  >
                    <Send size={16} /> Submit for Approval
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="modal-footer cor-form-footer">
          <div className="footer-left">
            {step > 1 && (
              <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
          </div>

          <div className="footer-center">
            <span className="step-indicator">Step {step} of {STEPS.length}</span>
          </div>

          <div className="footer-right">
            {step < STEPS.length && (
              <button className="btn btn-primary" onClick={handleNext} disabled={loading}>
                Next <ChevronRight size={16} />
              </button>
            )}
            {step > 1 && step < 9 && (
              <button
                className="btn btn-ghost"
                onClick={handleSave}
                disabled={loading}
              >
                <Save size={14} /> Save Draft
              </button>
            )}
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
