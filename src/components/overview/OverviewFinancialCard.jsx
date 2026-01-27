import { memo, useEffect, useState, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { chartColors } from '../charts/chartConfig'

/**
 * OverviewFinancialCard - Compact financial snapshot for project overview
 * Shows earned, costs, profit with mini cost breakdown bar
 */
export const OverviewFinancialCard = memo(function OverviewFinancialCard({
  earnedRevenue = 0,
  totalCosts = 0,
  laborCost = 0,
  disposalCost = 0,
  equipmentCost = 0,
  materialsCost = 0,
  otherCost = 0,
  contractValue = 0
}) {
  const profit = earnedRevenue - totalCosts
  const margin = earnedRevenue > 0 ? (profit / earnedRevenue) * 100 : 0
  const isPositive = profit >= 0

  // Format currency
  const formatCurrency = (value) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`
    }
    return `$${value.toFixed(0)}`
  }

  // Calculate cost breakdown percentages for the stacked bar
  const costBreakdown = [
    { key: 'labor', value: laborCost, color: chartColors.labor, label: 'Labor' },
    { key: 'disposal', value: disposalCost, color: chartColors.disposal, label: 'Disposal' },
    { key: 'equipment', value: equipmentCost, color: chartColors.equipment, label: 'Equipment' },
    { key: 'materials', value: materialsCost, color: chartColors.materials, label: 'Materials' },
    { key: 'other', value: otherCost, color: chartColors.other, label: 'Other' }
  ].filter(item => item.value > 0)

  const hasBreakdown = costBreakdown.length > 0 && totalCosts > 0

  return (
    <div className="overview-financial-card animate-fade-in-up">
      {/* Main metrics row */}
      <div className="financial-metrics-row">
        {/* Earned */}
        <div className="financial-metric">
          <span className="financial-metric-value green">{formatCurrency(earnedRevenue)}</span>
          <span className="financial-metric-label">Earned</span>
        </div>

        {/* Costs */}
        <div className="financial-metric">
          <span className="financial-metric-value amber">{formatCurrency(totalCosts)}</span>
          <span className="financial-metric-label">Costs</span>
        </div>

        {/* Profit */}
        <div className="financial-metric">
          <span className={`financial-metric-value ${isPositive ? 'green' : 'red'}`}>
            {isPositive ? '' : '-'}{formatCurrency(Math.abs(profit))}
          </span>
          <span className="financial-metric-label">
            Profit
            <span className={`margin-badge ${isPositive ? 'positive' : 'negative'}`}>
              {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
            </span>
          </span>
        </div>
      </div>

      {/* Cost breakdown bar */}
      {hasBreakdown && (
        <div className="cost-breakdown-section">
          <div className="cost-breakdown-bar">
            {costBreakdown.map((item, index) => {
              const widthPercent = (item.value / totalCosts) * 100
              return (
                <div
                  key={item.key}
                  className="cost-segment"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: item.color,
                    animationDelay: `${index * 100}ms`
                  }}
                  title={`${item.label}: ${formatCurrency(item.value)} (${widthPercent.toFixed(0)}%)`}
                />
              )
            })}
          </div>
          <div className="cost-breakdown-legend">
            {costBreakdown.slice(0, 4).map(item => (
              <span key={item.key} className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: item.color }} />
                <span className="legend-label">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

export default OverviewFinancialCard
