import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { CATEGORIES } from './translations'
import { db } from '../../lib/supabase'

/**
 * MaterialsStep - Step 3: Material/equipment category browsing and item selection.
 *
 * Props:
 *  - companyId
 *  - items, setItems
 *  - t, lang
 *  - onShowToast
 */
export default function MaterialsStep({ companyId, items, setItems, t, lang: _lang, onShowToast }) {
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categoryItems, setCategoryItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [materialSearch, setMaterialSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [allMaterials, setAllMaterials] = useState([])
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customItem, setCustomItem] = useState({ name: '', category: '', quantity: '' })
  const materialsSearchRef = useRef(null)
  const focusTimeoutRef = useRef(null)

  // Load items when category selected
  useEffect(() => {
    if (selectedCategory && companyId) {
      loadCategoryItems(selectedCategory)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, companyId])

  // Auto-focus search on mount when no category selected
  useEffect(() => {
    if (!selectedCategory && materialsSearchRef.current) {
      focusTimeoutRef.current = setTimeout(() => {
        materialsSearchRef.current?.focus()
      }, 100)
    }
    return () => {
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current)
    }
  }, [selectedCategory])

  const loadCategoryItems = async (category) => {
    setLoadingItems(true)
    try {
      const data = await db.getMaterialsEquipmentByCategory(companyId, category)
      setCategoryItems(data)
    } catch (error) {
      console.error('Error loading items:', error)
      onShowToast('Error loading items', 'error')
    } finally {
      setLoadingItems(false)
    }
  }

  const loadAllMaterials = async () => {
    if (allMaterials.length > 0) return
    try {
      const allItems = []
      for (const category of CATEGORIES) {
        const data = await db.getMaterialsEquipmentByCategory(companyId, category)
        allItems.push(...data.map(item => ({ ...item, category })))
      }
      setAllMaterials(allItems)
    } catch (error) {
      console.error('Error loading all materials:', error)
    }
  }

  const handleMaterialSearch = (query) => {
    setMaterialSearch(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const lowerQuery = query.toLowerCase()
    const results = allMaterials.filter(item =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.category.toLowerCase().includes(lowerQuery)
    )
    setSearchResults(results.slice(0, 10))
  }

  const selectItem = (item) => {
    const existingIndex = items.findIndex(i => i.material_equipment_id === item.id)
    if (existingIndex >= 0) {
      setItems(items.map((it, i) =>
        i === existingIndex ? { ...it, quantity: it.quantity + 1 } : it
      ))
    } else {
      setItems([...items, {
        material_equipment_id: item.id,
        name: item.name,
        unit: item.unit,
        category: item.category,
        quantity: 1,
        isCustom: false
      }])
    }
    onShowToast(`Added ${item.name}`, 'success')
  }

  const addCustomItemHandler = () => {
    if (!customItem.name || !customItem.category || !customItem.quantity) {
      onShowToast('Fill in all fields', 'error')
      return
    }
    setItems([...items, {
      material_equipment_id: null,
      custom_name: customItem.name,
      custom_category: customItem.category,
      name: customItem.name,
      category: customItem.category,
      quantity: parseFloat(customItem.quantity),
      unit: 'each',
      isCustom: true
    }])
    setCustomItem({ name: '', category: '', quantity: '' })
    setShowCustomForm(false)
    setSelectedCategory(null)
    onShowToast('Custom item added', 'success')
  }

  const updateItemQuantity = (index, quantity) => {
    const qty = parseFloat(quantity) || 0
    if (qty <= 0) {
      setItems(items.filter((_, i) => i !== index))
    } else {
      setItems(items.map((item, i) =>
        i === index ? { ...item, quantity: qty } : item
      ))
    }
  }

  const goBack = () => {
    if (showCustomForm) {
      setShowCustomForm(false)
    } else if (selectedCategory) {
      setSelectedCategory(null)
      setShowCustomForm(false)
    }
  }

  // Category detail / custom form view
  if (selectedCategory || showCustomForm) {
    return (
      <div className="tm-step-content">
        <div className="tm-wizard-header" style={{ margin: '-1rem -1rem 1rem -1rem', padding: '0.75rem 1rem' }}>
          <button className="tm-back-btn" onClick={goBack}>{'\u2190'}</button>
          <h2>{showCustomForm ? 'Add Custom Item' : selectedCategory}</h2>
          <div className="tm-item-count">{items.length} items</div>
        </div>

        {showCustomForm ? (
          <div className="tm-custom-form">
            <div className="tm-field">
              <label>Item Name</label>
              <input
                type="text"
                placeholder="What did you use?"
                value={customItem.name}
                onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="tm-field">
              <label>Category</label>
              <div className="tm-category-select">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    className={`tm-cat-chip ${customItem.category === cat ? 'active' : ''}`}
                    onClick={() => setCustomItem({ ...customItem, category: cat })}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="tm-field">
              <label>Quantity</label>
              <input
                type="number"
                placeholder="How many?"
                value={customItem.quantity}
                onChange={(e) => setCustomItem({ ...customItem, quantity: e.target.value })}
              />
            </div>
            <button className="tm-big-btn primary" onClick={addCustomItemHandler}>
              Add Custom Item
            </button>
          </div>
        ) : (
          <div className="tm-item-grid">
            {loadingItems ? (
              <div className="tm-loading">Loading...</div>
            ) : (
              <>
                {categoryItems.map(item => {
                  const added = items.find(i => i.material_equipment_id === item.id)
                  return (
                    <button
                      key={item.id}
                      className={`tm-item-card ${added ? 'added' : ''}`}
                      onClick={() => selectItem(item)}
                    >
                      <span className="tm-item-name">{item.name}</span>
                      <span className="tm-item-unit">{item.unit}</span>
                      {added && <span className="tm-item-badge">{added.quantity}</span>}
                    </button>
                  )
                })}
                <button
                  className="tm-item-card custom"
                  onClick={() => setShowCustomForm(true)}
                >
                  <span className="tm-item-name">+ Add Other</span>
                  <span className="tm-item-unit">Not on list</span>
                </button>
              </>
            )}
          </div>
        )}

        {!showCustomForm && items.length > 0 && (
          <div className="tm-wizard-footer">
            <button className="tm-big-btn primary" onClick={() => setSelectedCategory(null)}>
              Done Adding ({items.length} items)
            </button>
          </div>
        )}
      </div>
    )
  }

  // Main materials browse view
  return (
    <div className="tm-step-content">
      {/* Quick Search */}
      <div className="tm-field tm-search-field">
        <div className="tm-search-input-wrapper">
          <Search size={18} className="tm-search-icon" />
          <input
            ref={materialsSearchRef}
            type="text"
            placeholder={t('searchMaterials')}
            value={materialSearch}
            onChange={(e) => handleMaterialSearch(e.target.value)}
            onFocus={() => loadAllMaterials()}
            className="tm-search-input"
          />
          {materialSearch && (
            <button className="tm-search-clear" onClick={() => { setMaterialSearch(''); setSearchResults([]); }}>{'\u00d7'}</button>
          )}
        </div>

        {/* Search Results */}
        {materialSearch && searchResults.length > 0 && (
          <div className="tm-search-results">
            {searchResults.map((item, idx) => {
              const existingItem = items.find(i => i.id === item.id)
              return (
                <button
                  key={idx}
                  className={`tm-search-result-item ${existingItem ? 'added' : ''}`}
                  onClick={() => {
                    if (existingItem) {
                      updateItemQuantity(items.indexOf(existingItem), existingItem.quantity + 1)
                    } else {
                      setItems([...items, { ...item, quantity: 1, isCustom: false }])
                    }
                    setMaterialSearch('')
                    setSearchResults([])
                  }}
                >
                  <span className="tm-search-result-name">{item.name}</span>
                  <span className="tm-search-result-category">{item.category}</span>
                  {existingItem && <span className="tm-search-result-qty">{'\u00d7'}{existingItem.quantity}</span>}
                </button>
              )
            })}
          </div>
        )}
        {materialSearch && searchResults.length === 0 && (
          <div className="tm-search-no-results">{t('noSearchResults')}</div>
        )}
      </div>

      <div className="tm-field">
        <label>{t('orBrowse')}</label>
        <div className="tm-category-grid">
          {CATEGORIES.map(cat => {
            const catItems = items.filter(i => i.category === cat)
            return (
              <button
                key={cat}
                className="tm-category-card"
                onClick={() => setSelectedCategory(cat)}
              >
                <span className="tm-cat-name">{cat}</span>
                {catItems.length > 0 && (
                  <span className="tm-cat-count">{catItems.length}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {items.length > 0 && (
        <div className="tm-field">
          <label>Added Items ({items.length})</label>
          <div className="tm-added-list">
            {items.map((item, index) => (
              <div key={index} className="tm-added-item">
                <div className="tm-added-info">
                  {item.isCustom && <span className="tm-custom-badge">Custom</span>}
                  <span className="tm-added-name">{item.name}</span>
                </div>
                <div className="tm-added-qty">
                  <button onClick={() => updateItemQuantity(index, item.quantity - 1)}>{'\u2212'}</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => updateItemQuantity(index, item.quantity + 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
