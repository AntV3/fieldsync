import { useState } from 'react'

export default function ProjectMaterials({ project, tmTickets, onRefresh }) {
  const [filterCategory, setFilterCategory] = useState('all')

  // Extract all materials from T&M tickets
  const allMaterials = []
  tmTickets.forEach(ticket => {
    if (ticket.items && ticket.items.length > 0) {
      ticket.items.forEach(item => {
        allMaterials.push({
          name: item.custom_name || item.name || 'Unknown',
          category: item.custom_category || item.category || 'Uncategorized',
          quantity: item.quantity || 0,
          date: ticket.work_date,
          ticketId: ticket.id,
          // Simplified cost calculation
          unitCost: 50,
          totalCost: (item.quantity || 0) * 50
        })
      })
    }
  })

  // Aggregate materials by name
  const materialSummary = {}
  allMaterials.forEach(material => {
    const key = `${material.name}-${material.category}`
    if (!materialSummary[key]) {
      materialSummary[key] = {
        name: material.name,
        category: material.category,
        totalQuantity: 0,
        totalCost: 0,
        usageCount: 0
      }
    }
    materialSummary[key].totalQuantity += material.quantity
    materialSummary[key].totalCost += material.totalCost
    materialSummary[key].usageCount += 1
  })

  const materialsList = Object.values(materialSummary)

  // Filter by category
  const filteredMaterials = filterCategory === 'all'
    ? materialsList
    : materialsList.filter(m => m.category === filterCategory)

  // Sort by total cost (descending)
  filteredMaterials.sort((a, b) => b.totalCost - a.totalCost)

  // Get unique categories
  const categories = [...new Set(materialsList.map(m => m.category))]

  // Calculate total materials cost
  const totalMaterialsCost = materialsList.reduce((sum, m) => sum + m.totalCost, 0)

  function handleExport() {
    // Create CSV export
    let csv = 'Item,Category,Total Qty,Total Cost,Usage Count\n'

    filteredMaterials.forEach(material => {
      csv += `"${material.name}","${material.category}",${material.totalQuantity},$${Math.round(material.totalCost)},${material.usageCount}\n`
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}-materials-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="project-materials">
      {/* Header */}
      <div className="materials-header">
        <h3>Materials & Equipment</h3>
        <div className="materials-controls">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button className="btn-secondary btn-small" onClick={handleExport}>
            Export
          </button>
        </div>
      </div>

      {/* Note about Material Requests */}
      <div className="info-banner">
        <p>
          ℹ️ Material requests are currently managed through the field app.
          This tab shows materials and equipment used from T&M tickets.
        </p>
      </div>

      {/* Materials Summary */}
      {materialsList.length > 0 && (
        <div className="materials-section">
          <div className="section-summary">
            <h4>📊 Materials Used (from T&M tickets)</h4>
            <div className="summary-stat">
              <span>Total Materials Cost:</span>
              <strong>${Math.round(totalMaterialsCost).toLocaleString()}</strong>
            </div>
          </div>

          <div className="materials-table">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Total Qty</th>
                  <th>Total Cost</th>
                  <th>Used On</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-row">
                      No materials found in this category
                    </td>
                  </tr>
                ) : (
                  filteredMaterials.map((material, index) => (
                    <tr key={index}>
                      <td><strong>{material.name}</strong></td>
                      <td>
                        <span className="category-badge">{material.category}</span>
                      </td>
                      <td>{material.totalQuantity}</td>
                      <td>${Math.round(material.totalCost).toLocaleString()}</td>
                      <td>{material.usageCount} {material.usageCount === 1 ? 'ticket' : 'tickets'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {materialsList.length === 0 && (
        <div className="empty-state">
          <p>No materials or equipment recorded yet</p>
          <p className="empty-state-hint">
            Materials will appear here when added to T&M tickets
          </p>
        </div>
      )}

      {/* Materials by Category */}
      {materialsList.length > 0 && (
        <div className="materials-section">
          <h4>📦 Materials by Category</h4>
          <div className="category-breakdown">
            {categories.map(category => {
              const categoryMaterials = materialsList.filter(m => m.category === category)
              const categoryCost = categoryMaterials.reduce((sum, m) => sum + m.totalCost, 0)
              const categoryPercent = (categoryCost / totalMaterialsCost) * 100

              return (
                <div key={category} className="category-item">
                  <div className="category-header">
                    <span className="category-name">{category}</span>
                    <span className="category-cost">
                      ${Math.round(categoryCost).toLocaleString()} ({Math.round(categoryPercent)}%)
                    </span>
                  </div>
                  <div className="category-bar">
                    <div
                      className="category-fill"
                      style={{ width: `${categoryPercent}%` }}
                    />
                  </div>
                  <div className="category-details">
                    {categoryMaterials.length} {categoryMaterials.length === 1 ? 'item' : 'items'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
