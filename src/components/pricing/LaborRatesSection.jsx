import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { ChevronDown, ChevronRight, Plus, Edit2, Trash2, DollarSign, X, Check, AlertCircle } from 'lucide-react'

// Simplified rate types - scalable for any company type
const RATE_TYPES = [
  { id: 'standard', label: 'Standard Rate' },
  { id: 'prevailing', label: 'Prevailing Wage' }
]

export default function LaborRatesSection({ company, onShowToast }) {
  const [categories, setCategories] = useState([])
  const [laborClasses, setLaborClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState({})

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [showRatesModal, setShowRatesModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingClass, setEditingClass] = useState(null)
  const [selectedClassForRates, setSelectedClassForRates] = useState(null)

  // Form states
  const [categoryName, setCategoryName] = useState('')
  const [className, setClassName] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [classRates, setClassRates] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (company?.id) {
      loadData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await db.getLaborClassesWithCategories(company.id)
      setCategories(data.categories || [])
      setLaborClasses(data.classes || [])

      // Expand all categories by default
      const expanded = {}
      ;(data.categories || []).forEach(cat => {
        expanded[cat.id] = true
      })
      setExpandedCategories(expanded)
    } catch (error) {
      console.error('Error loading labor classes:', error)
      onShowToast?.('Error loading labor classes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }))
  }

  // ==========================================
  // Category CRUD
  // ==========================================

  const openCategoryModal = (category = null) => {
    setEditingCategory(category)
    setCategoryName(category?.name || '')
    setShowCategoryModal(true)
  }

  const saveCategory = async () => {
    if (!categoryName.trim()) {
      onShowToast?.('Please enter a category name', 'error')
      return
    }

    setSaving(true)
    try {
      if (editingCategory) {
        await db.updateLaborCategory(editingCategory.id, { name: categoryName.trim() })
        onShowToast?.('Category updated', 'success')
      } else {
        const newCategory = await db.createLaborCategory(company.id, categoryName.trim(), categories.length)
        if (newCategory) {
          setExpandedCategories(prev => ({ ...prev, [newCategory.id]: true }))
        }
        onShowToast?.('Category created', 'success')
      }
      setShowCategoryModal(false)
      setCategoryName('')
      setEditingCategory(null)
      await loadData()
    } catch (error) {
      console.error('Error saving category:', error)
      if (error.message?.includes('duplicate')) {
        onShowToast?.('A category with this name already exists', 'error')
      } else {
        onShowToast?.('Error saving category', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteCategory = async (category) => {
    const classesInCategory = laborClasses.filter(c => c.category_id === category.id)
    if (classesInCategory.length > 0) {
      onShowToast?.('Remove all classes from this category first', 'error')
      return
    }

    if (!confirm(`Delete category "${category.name}"?`)) return

    try {
      await db.deleteLaborCategory(category.id)
      onShowToast?.('Category deleted', 'success')
      await loadData()
    } catch (error) {
      console.error('Error deleting category:', error)
      onShowToast?.('Error deleting category', 'error')
    }
  }

  // ==========================================
  // Class CRUD
  // ==========================================

  const openClassModal = (laborClass = null, categoryId = null) => {
    setEditingClass(laborClass)
    setClassName(laborClass?.name || '')
    setSelectedCategoryId(laborClass?.category_id || categoryId || categories[0]?.id || '')
    setShowClassModal(true)
  }

  const saveClass = async () => {
    if (!className.trim()) {
      onShowToast?.('Please enter a class name', 'error')
      return
    }

    setSaving(true)
    try {
      if (editingClass) {
        await db.updateLaborClass(editingClass.id, {
          name: className.trim(),
          category_id: selectedCategoryId || null
        })
        onShowToast?.('Labor class updated', 'success')
      } else {
        const classesInCategory = laborClasses.filter(c => c.category_id === selectedCategoryId)
        await db.createLaborClass(company.id, selectedCategoryId || null, className.trim(), classesInCategory.length)
        onShowToast?.('Labor class created', 'success')
      }
      setShowClassModal(false)
      setClassName('')
      setEditingClass(null)
      setSelectedCategoryId('')
      await loadData()
    } catch (error) {
      console.error('Error saving class:', error)
      if (error.message?.includes('duplicate')) {
        onShowToast?.('A class with this name already exists', 'error')
      } else {
        onShowToast?.('Error saving class', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteClass = async (laborClass) => {
    if (!confirm(`Delete labor class "${laborClass.name}"? This will also delete all associated rates.`)) return

    try {
      await db.deleteLaborClass(laborClass.id)
      onShowToast?.('Labor class deleted', 'success')
      await loadData()
    } catch (error) {
      console.error('Error deleting class:', error)
      onShowToast?.('Error deleting class', 'error')
    }
  }

  // ==========================================
  // Rates Modal
  // ==========================================

  const openRatesModal = async (laborClass) => {
    setSelectedClassForRates(laborClass)

    // Initialize simplified rates structure
    const rates = {}
    RATE_TYPES.forEach(rt => {
      rates[rt.id] = { regular_rate: '', overtime_rate: '' }
    })

    // Load existing rates
    try {
      const existingRates = await db.getLaborClassRates(laborClass.id)
      existingRates.forEach(r => {
        // Map old structure to new: use job_type as rate type
        const rateType = r.job_type === 'pla' ? 'prevailing' : r.job_type
        if (rates[rateType]) {
          rates[rateType] = {
            regular_rate: r.regular_rate || '',
            overtime_rate: r.overtime_rate || ''
          }
        }
      })
    } catch (error) {
      console.error('Error loading rates:', error)
    }

    setClassRates(rates)
    setShowRatesModal(true)
  }

  const updateClassRate = (rateType, field, value) => {
    setClassRates(prev => ({
      ...prev,
      [rateType]: {
        ...prev[rateType],
        [field]: value.replace(/[^0-9.]/g, '')
      }
    }))
  }

  const saveClassRates = async () => {
    if (!selectedClassForRates) return

    setSaving(true)
    try {
      const ratesToSave = RATE_TYPES.map(rt => ({
        work_type: 'labor',  // Generic work type for scalability
        job_type: rt.id,
        regular_rate: parseFloat(classRates[rt.id]?.regular_rate) || 0,
        overtime_rate: parseFloat(classRates[rt.id]?.overtime_rate) || 0
      }))

      await db.saveLaborClassRates(selectedClassForRates.id, ratesToSave)
      onShowToast?.('Rates saved', 'success')
      setShowRatesModal(false)
      setSelectedClassForRates(null)
    } catch (error) {
      console.error('Error saving rates:', error)
      onShowToast?.('Error saving rates', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ==========================================
  // Render
  // ==========================================

  if (loading) {
    return <div className="loading">Loading labor setup...</div>
  }

  const uncategorizedClasses = laborClasses.filter(c => !c.category_id)

  return (
    <div className="pricing-section labor-setup-section">
      <div className="pricing-section-header">
        <div>
          <h2>Labor Setup</h2>
          <p className="section-desc">
            Create custom labor categories and classes with rates per work type
          </p>
        </div>
        <div className="labor-setup-actions">
          <button className="btn btn-secondary" onClick={() => openCategoryModal()}>
            <Plus size={16} /> Add Category
          </button>
          <button
            className="btn btn-primary"
            onClick={() => openClassModal()}
            disabled={categories.length === 0}
          >
            <Plus size={16} /> Add Class
          </button>
        </div>
      </div>

      {categories.length === 0 && laborClasses.length === 0 ? (
        <div className="labor-setup-empty">
          <AlertCircle size={40} />
          <h3>No Labor Classes Configured</h3>
          <p>Create categories to organize your labor classes (e.g., "Supervision", "Operators", "Labor"), then add classes within each category.</p>
          <button className="btn btn-primary" onClick={() => openCategoryModal()}>
            <Plus size={16} /> Create First Category
          </button>
        </div>
      ) : (
        <div className="labor-categories-list">
          {categories.map(category => {
            const classesInCategory = laborClasses.filter(c => c.category_id === category.id)
            const isExpanded = expandedCategories[category.id]

            return (
              <div key={category.id} className="labor-category-card">
                <div className="labor-category-header" onClick={() => toggleCategory(category.id)}>
                  <div className="category-expand-icon">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                  <span className="category-name">{category.name}</span>
                  <span className="category-count">{classesInCategory.length} class{classesInCategory.length !== 1 ? 'es' : ''}</span>
                  <div className="category-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={() => openClassModal(null, category.id)}
                      title="Add class to this category"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={() => openCategoryModal(category)}
                      title="Edit category"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-small btn-danger"
                      onClick={() => deleteCategory(category)}
                      title="Delete category"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="labor-classes-list">
                    {classesInCategory.length === 0 ? (
                      <div className="no-classes-message">
                        No classes in this category.
                        <button className="link-btn" onClick={() => openClassModal(null, category.id)}>
                          Add one
                        </button>
                      </div>
                    ) : (
                      classesInCategory.map(laborClass => (
                        <div key={laborClass.id} className="labor-class-row">
                          <span className="class-name">{laborClass.name}</span>
                          <div className="class-actions">
                            <button
                              className="btn btn-secondary btn-small"
                              onClick={() => openRatesModal(laborClass)}
                            >
                              <DollarSign size={14} /> Set Rates
                            </button>
                            <button
                              className="btn btn-ghost btn-small"
                              onClick={() => openClassModal(laborClass)}
                              title="Edit class"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn btn-ghost btn-small btn-danger"
                              onClick={() => deleteClass(laborClass)}
                              title="Delete class"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Uncategorized classes */}
          {uncategorizedClasses.length > 0 && (
            <div className="labor-category-card uncategorized">
              <div className="labor-category-header">
                <span className="category-name">Uncategorized</span>
                <span className="category-count">{uncategorizedClasses.length} class{uncategorizedClasses.length !== 1 ? 'es' : ''}</span>
              </div>
              <div className="labor-classes-list">
                {uncategorizedClasses.map(laborClass => (
                  <div key={laborClass.id} className="labor-class-row">
                    <span className="class-name">{laborClass.name}</span>
                    <div className="class-actions">
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => openRatesModal(laborClass)}
                      >
                        <DollarSign size={14} /> Set Rates
                      </button>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => openClassModal(laborClass)}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-small btn-danger"
                        onClick={() => deleteClass(laborClass)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-content labor-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
              <button className="close-btn" onClick={() => setShowCategoryModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Category Name</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  placeholder="e.g., Supervision, Operators, Labor"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCategoryModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveCategory} disabled={saving}>
                {saving ? 'Saving...' : (editingCategory ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Modal */}
      {showClassModal && (
        <div className="modal-overlay" onClick={() => setShowClassModal(false)}>
          <div className="modal-content labor-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingClass ? 'Edit Labor Class' : 'Add Labor Class'}</h2>
              <button className="close-btn" onClick={() => setShowClassModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Class Name</label>
                <input
                  type="text"
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder="e.g., Foreman, Operator, Laborer"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={selectedCategoryId}
                  onChange={e => setSelectedCategoryId(e.target.value)}
                >
                  <option value="">-- No Category --</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowClassModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveClass} disabled={saving}>
                {saving ? 'Saving...' : (editingClass ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rates Modal - Simplified for scalability */}
      {showRatesModal && selectedClassForRates && (
        <div className="modal-overlay" onClick={() => setShowRatesModal(false)}>
          <div className="modal-content labor-modal rates-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Set Rates: {selectedClassForRates.name}</h2>
              <button className="close-btn" onClick={() => setShowRatesModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="rates-simple-grid">
                {RATE_TYPES.map(rateType => {
                  const rateData = classRates[rateType.id] || {}
                  return (
                    <div key={rateType.id} className="rate-row-simple">
                      <span className="rate-type-label">{rateType.label}</span>
                      <div className="rate-inputs">
                        <div className="rate-input-group">
                          <label>Regular</label>
                          <div className="rate-input-inline">
                            <span>$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={rateData.regular_rate || ''}
                              onChange={e => updateClassRate(rateType.id, 'regular_rate', e.target.value)}
                              placeholder="0.00"
                            />
                            <span>/hr</span>
                          </div>
                        </div>
                        <div className="rate-input-group">
                          <label>Overtime</label>
                          <div className="rate-input-inline">
                            <span>$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={rateData.overtime_rate || ''}
                              onChange={e => updateClassRate(rateType.id, 'overtime_rate', e.target.value)}
                              placeholder="0.00"
                            />
                            <span>/hr</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowRatesModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveClassRates} disabled={saving}>
                <Check size={16} /> {saving ? 'Saving...' : 'Save Rates'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
