import { useState, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function Onboarding({ onComplete, onShowToast }) {
  const { company, refreshUser } = useAuth()
  const [step, setStep] = useState(1) // 1: Choose method, 2: Template/Import, 3: Review/Prices
  const [method, setMethod] = useState(null) // 'template', 'import', 'scratch'
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)

  // Load templates
  useState(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    const { data } = await supabase
      .from('templates')
      .select('*, template_items(*)')
      .eq('is_active', true)
      .order('sort_order')

    setTemplates(data || [])
  }

  // Handle template selection
  const selectTemplate = (template) => {
    setSelectedTemplate(template)
    setItems(template.template_items.map(item => ({
      ...item,
      price: 0,
      selected: true
    })))
    setStep(3)
  }

  // Handle Excel import
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setLoading(true)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (rows.length < 2) {
        onShowToast('File appears to be empty', 'error')
        return
      }

      // Try to detect columns
      const headers = rows[0].map(h => String(h).toLowerCase())
      
      const nameCol = headers.findIndex(h => 
        h.includes('name') || h.includes('item') || h.includes('description')
      )
      const categoryCol = headers.findIndex(h => 
        h.includes('category') || h.includes('type') || h.includes('group')
      )
      const unitCol = headers.findIndex(h => 
        h.includes('unit') || h.includes('uom')
      )
      const priceCol = headers.findIndex(h => 
        h.includes('price') || h.includes('cost') || h.includes('rate') || h.includes('$')
      )

      // Parse items
      const parsedItems = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || !row[nameCol >= 0 ? nameCol : 0]) continue

        const name = String(row[nameCol >= 0 ? nameCol : 0]).trim()
        if (!name) continue

        const category = categoryCol >= 0 ? String(row[categoryCol] || 'Other').trim() : detectCategory(name)
        const unit = unitCol >= 0 ? String(row[unitCol] || 'each').trim() : detectUnit(name)
        const price = priceCol >= 0 ? parseFloat(String(row[priceCol]).replace(/[$,]/g, '')) || 0 : 0

        parsedItems.push({
          id: Date.now() + i,
          name,
          category,
          unit,
          price,
          selected: true
        })
      }

      if (parsedItems.length === 0) {
        onShowToast('No items found in file', 'error')
        return
      }

      setItems(parsedItems)
      setStep(3)
      onShowToast(`Found ${parsedItems.length} items`, 'success')
    } catch (error) {
      console.error('Import error:', error)
      onShowToast('Error reading file', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Auto-detect category from name
  const detectCategory = (name) => {
    const lower = name.toLowerCase()
    if (/poly|tape|barrier|plastic|encapsulant|sheeting/.test(lower)) return 'Containment'
    if (/suit|mask|respirator|glove|goggle|boot|ppe|safety|tyvek/.test(lower)) return 'PPE'
    if (/drum|bag|disposal|waste|haul/.test(lower)) return 'Disposal'
    if (/excavator|bobcat|machine|saw|drill|lift|equipment|generator|compressor/.test(lower)) return 'Equipment'
    return 'Materials'
  }

  // Auto-detect unit from name
  const detectUnit = (name) => {
    const lower = name.toLowerCase()
    if (/roll|rl/.test(lower)) return 'roll'
    if (/box|bx|case/.test(lower)) return 'box'
    if (/gallon|gal/.test(lower)) return 'gallon'
    if (/foot|feet|ft|linear/.test(lower)) return 'foot'
    if (/day|daily/.test(lower)) return 'day'
    if (/hour|hr|hourly/.test(lower)) return 'hour'
    return 'each'
  }

  // Update item
  const updateItem = (index, field, value) => {
    setItems(items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ))
  }

  // Toggle item selection
  const toggleItem = (index) => {
    setItems(items.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    ))
  }

  // Get unique categories
  const categories = [...new Set(items.map(i => i.category))].sort()

  // Save materials to database
  const saveAndComplete = async () => {
    const selectedItems = items.filter(i => i.selected)
    if (selectedItems.length === 0) {
      onShowToast('Select at least one item', 'error')
      return
    }

    setLoading(true)
    try {
      // Create company categories
      const uniqueCategories = [...new Set(selectedItems.map(i => i.category))]
      for (let i = 0; i < uniqueCategories.length; i++) {
        await supabase
          .from('company_categories')
          .upsert({
            company_id: company.id,
            name: uniqueCategories[i],
            sort_order: i
          }, { onConflict: 'company_id,name' })
      }

      // Insert materials
      const materialsToInsert = selectedItems.map(item => ({
        company_id: company.id,
        category: item.category,
        name: item.name,
        unit: item.unit,
        cost_per_unit: item.price,
        active: true
      }))

      const { error } = await supabase
        .from('materials_equipment')
        .insert(materialsToInsert)

      if (error) throw error

      // Mark onboarding complete
      await supabase
        .from('companies')
        .update({ onboarding_completed: true })
        .eq('id', company.id)

      await refreshUser()
      onShowToast(`${selectedItems.length} items added!`, 'success')
      onComplete()
    } catch (error) {
      console.error('Save error:', error)
      onShowToast('Error saving materials', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Skip onboarding
  const skipOnboarding = async () => {
    setLoading(true)
    try {
      await supabase
        .from('companies')
        .update({ onboarding_completed: true })
        .eq('id', company.id)

      await refreshUser()
      onComplete()
    } catch (error) {
      console.error('Skip error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-container">
        {/* Header */}
        <div className="onboarding-header">
          <h1>Welcome to FieldSync!</h1>
          <p>Let's set up your materials & equipment list</p>
          <div className="onboarding-steps">
            <span className={`step ${step >= 1 ? 'active' : ''}`}>1</span>
            <span className="step-line"></span>
            <span className={`step ${step >= 2 ? 'active' : ''}`}>2</span>
            <span className="step-line"></span>
            <span className={`step ${step >= 3 ? 'active' : ''}`}>3</span>
          </div>
        </div>

        {/* Step 1: Choose method */}
        {step === 1 && (
          <div className="onboarding-content">
            <h2>How would you like to set up your materials?</h2>
            
            <div className="onboarding-options">
              <button
                className="onboarding-option"
                onClick={() => { setMethod('template'); setStep(2) }}
              >
                <span className="option-icon">📋</span>
                <span className="option-title">Industry Template</span>
                <span className="option-desc">Start with common items for your trade</span>
              </button>

              <button
                className="onboarding-option"
                onClick={() => { setMethod('import'); setStep(2) }}
              >
                <span className="option-icon">📤</span>
                <span className="option-title">Import Excel</span>
                <span className="option-desc">Upload your existing materials list</span>
              </button>

              <button
                className="onboarding-option"
                onClick={() => { setMethod('scratch'); skipOnboarding() }}
              >
                <span className="option-icon">✏️</span>
                <span className="option-title">Start from Scratch</span>
                <span className="option-desc">Add items manually as you go</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Template selection or Import */}
        {step === 2 && method === 'template' && (
          <div className="onboarding-content">
            <h2>Choose your industry</h2>
            
            <div className="template-grid">
              {templates.map(template => (
                <button
                  key={template.id}
                  className="template-card"
                  onClick={() => selectTemplate(template)}
                >
                  <span className="template-name">{template.name}</span>
                  <span className="template-count">{template.template_items?.length || 0} items</span>
                  <span className="template-desc">{template.description}</span>
                </button>
              ))}
            </div>

            <button className="onboarding-back" onClick={() => setStep(1)}>
              ← Back
            </button>
          </div>
        )}

        {step === 2 && method === 'import' && (
          <div className="onboarding-content">
            <h2>Upload your Excel file</h2>
            
            <div className="import-zone">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
              />
              
              <button
                className="import-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                {loading ? 'Reading file...' : '📁 Select File'}
              </button>

              <div className="import-hints">
                <p>Supported formats: .xlsx, .xls, .csv</p>
                <p>We'll try to detect columns for: Name, Category, Unit, Price</p>
              </div>
            </div>

            <button className="onboarding-back" onClick={() => setStep(1)}>
              ← Back
            </button>
          </div>
        )}

        {/* Step 3: Review and set prices */}
        {step === 3 && (
          <div className="onboarding-content">
            <h2>Review & set your prices</h2>
            <p className="onboarding-subtitle">
              {items.filter(i => i.selected).length} of {items.length} items selected
            </p>

            <div className="items-review">
              {categories.map(category => (
                <div key={category} className="category-group">
                  <h3>{category}</h3>
                  <div className="items-list">
                    {items.filter(i => i.category === category).map((item, index) => {
                      const actualIndex = items.findIndex(i => i.id === item.id)
                      return (
                        <div key={item.id} className={`item-row ${item.selected ? '' : 'deselected'}`}>
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleItem(actualIndex)}
                          />
                          <span className="item-name">{item.name}</span>
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(actualIndex, 'unit', e.target.value)}
                            disabled={!item.selected}
                          >
                            <option value="each">each</option>
                            <option value="box">box</option>
                            <option value="roll">roll</option>
                            <option value="gallon">gallon</option>
                            <option value="foot">foot</option>
                            <option value="day">day</option>
                            <option value="hour">hour</option>
                            <option value="pair">pair</option>
                            <option value="load">load</option>
                            <option value="yard">yard</option>
                            <option value="sheet">sheet</option>
                          </select>
                          <div className="item-price">
                            <span>$</span>
                            <input
                              type="number"
                              value={item.price || ''}
                              onChange={(e) => updateItem(actualIndex, 'price', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              step="0.01"
                              disabled={!item.selected}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="onboarding-actions">
              <button className="onboarding-back" onClick={() => setStep(method === 'template' ? 2 : 1)}>
                ← Back
              </button>
              <button
                className="onboarding-complete"
                onClick={saveAndComplete}
                disabled={loading || items.filter(i => i.selected).length === 0}
              >
                {loading ? 'Saving...' : `Save ${items.filter(i => i.selected).length} Items`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

