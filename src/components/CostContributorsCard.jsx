import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, HardHat, Truck, Wrench, Package, Users, MoreHorizontal, Trash2 } from 'lucide-react'
import { CostDonut } from './charts'

// Helper to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0)
}

// Category display info
const categoryInfo = {
  labor: { label: 'Labor', Icon: HardHat, color: '#3b82f6' },
  disposal: { label: 'Disposal', Icon: Truck, color: '#10b981' },
  equipment: { label: 'Equipment', Icon: Wrench, color: '#f59e0b' },
  materials: { label: 'Materials', Icon: Package, color: '#8b5cf6' },
  subcontractor: { label: 'Subcontractor', Icon: Users, color: '#ec4899' },
  other: { label: 'Other', Icon: MoreHorizontal, color: '#6b7280' }
}

export default function CostContributorsCard({
  laborCost = 0,
  haulOffCost = 0,
  customCosts = [],
  onAddCost,
  onDeleteCost
}) {
  const [showChart, setShowChart] = useState(true)
  const [expandedCategory, setExpandedCategory] = useState(null)

  // Build cost breakdown combining auto-tracked and custom costs
  const costBreakdown = []

  // Labor (auto-tracked from crew check-ins)
  if (laborCost > 0) {
    costBreakdown.push({
      category: 'labor',
      label: 'Labor',
      amount: laborCost,
      source: 'auto',
      description: 'From crew check-ins'
    })
  }

  // Disposal (auto-tracked from haul-offs)
  if (haulOffCost > 0) {
    costBreakdown.push({
      category: 'disposal',
      label: 'Disposal',
      amount: haulOffCost,
      source: 'auto',
      description: 'From haul-off logs'
    })
  }

  // Group custom costs by category
  const customByCategory = {}
  customCosts.forEach(cost => {
    if (!customByCategory[cost.category]) {
      customByCategory[cost.category] = {
        category: cost.category,
        items: [],
        total: 0
      }
    }
    customByCategory[cost.category].items.push(cost)
    customByCategory[cost.category].total += parseFloat(cost.amount) || 0
  })

  // Add custom cost categories
  Object.values(customByCategory).forEach(group => {
    const info = categoryInfo[group.category] || categoryInfo.other
    costBreakdown.push({
      category: group.category,
      label: info.label,
      amount: group.total,
      source: 'manual',
      items: group.items
    })
  })

  // Calculate total
  const totalCost = costBreakdown.reduce((sum, cat) => sum + cat.amount, 0)

  // Calculate percentages and sort by amount
  costBreakdown.forEach(cat => {
    cat.percentage = totalCost > 0 ? (cat.amount / totalCost) * 100 : 0
  })
  costBreakdown.sort((a, b) => b.amount - a.amount)

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category)
  }

  // Handle donut segment click
  const handleSegmentClick = (segment) => {
    if (segment.items && segment.items.length > 0) {
      setShowChart(false)
      setExpandedCategory(segment.category)
    }
  }

  return (
    <div className="cost-contributors-card">
      <div className="cost-contributors-header">
        <div className="cost-contributors-title">
          <h3>Cost Contributors</h3>
          <span className="cost-total">{formatCurrency(totalCost)}</span>
        </div>
        {costBreakdown.length > 0 && (
          <div className="cost-view-toggle">
            <button
              className={showChart ? 'active' : ''}
              onClick={() => setShowChart(true)}
            >
              Chart
            </button>
            <button
              className={!showChart ? 'active' : ''}
              onClick={() => setShowChart(false)}
            >
              List
            </button>
          </div>
        )}
      </div>

      {costBreakdown.length === 0 ? (
        <div className="cost-empty">
          <p>No costs recorded yet</p>
          <small>Costs will appear as crew checks in and haul-offs are logged</small>
        </div>
      ) : showChart ? (
        <CostDonut
          laborCost={laborCost}
          haulOffCost={haulOffCost}
          customCosts={customCosts}
          onSegmentClick={handleSegmentClick}
        />
      ) : (
        <div className="cost-breakdown">
          {costBreakdown.map(category => {
            const info = categoryInfo[category.category] || categoryInfo.other
            const Icon = info.Icon
            const hasItems = category.items && category.items.length > 0
            const isExpanded = expandedCategory === category.category

            return (
              <div key={category.category} className="cost-category">
                <div
                  className={`cost-category-row ${hasItems ? 'expandable' : ''}`}
                  onClick={() => hasItems && toggleCategory(category.category)}
                >
                  <div className="cost-category-bar-container">
                    <div
                      className="cost-category-bar"
                      style={{
                        width: `${Math.max(category.percentage, 2)}%`,
                        backgroundColor: info.color
                      }}
                    ></div>
                  </div>
                  <div className="cost-category-info">
                    <div className="cost-category-label">
                      <Icon size={14} style={{ color: info.color }} />
                      <span>{category.label}</span>
                      {category.source === 'auto' && (
                        <span className="cost-auto-badge">Auto</span>
                      )}
                      {hasItems && (
                        isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>
                    <div className="cost-category-values">
                      <span className="cost-amount">{formatCurrency(category.amount)}</span>
                      <span className="cost-percent">{Math.round(category.percentage)}%</span>
                    </div>
                  </div>
                </div>

                {/* Expanded items for manual costs */}
                {isExpanded && hasItems && (
                  <div className="cost-category-items">
                    {category.items.map(item => (
                      <div key={item.id} className="cost-item">
                        <div className="cost-item-info">
                          <span className="cost-item-desc">{item.description}</span>
                          <span className="cost-item-date">
                            {new Date(item.cost_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className="cost-item-actions">
                          <span className="cost-item-amount">{formatCurrency(item.amount)}</span>
                          {onDeleteCost && (
                            <button
                              className="cost-item-delete"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm('Delete this cost entry?')) {
                                  onDeleteCost(item.id)
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {onAddCost && (
        <button className="cost-add-btn" onClick={onAddCost}>
          <Plus size={16} />
          <span>Add Cost</span>
        </button>
      )}
    </div>
  )
}
