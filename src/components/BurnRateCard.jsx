import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Flame } from 'lucide-react'

// Helper to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0)
}

// Helper to format date
const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

export default function BurnRateCard({
  dailyBurn,
  totalBurn,
  daysWorked,
  laborCost,
  haulOffCost,
  progress,
  contractValue,
  laborByDate = [],
  haulOffByDate = []
}) {
  const [expanded, setExpanded] = useState(false)

  // Calculate burn status relative to progress
  const expectedBurnAtProgress = contractValue * (progress / 100) * 0.6 // Assume 60% cost ratio as healthy
  const burnStatus = totalBurn <= expectedBurnAtProgress ? 'on-budget' : totalBurn <= expectedBurnAtProgress * 1.2 ? 'warning' : 'over-budget'

  const statusLabel = {
    'on-budget': 'On Budget',
    'warning': 'Watch Closely',
    'over-budget': 'Over Budget'
  }[burnStatus]

  const StatusIcon = burnStatus === 'on-budget' ? TrendingDown : burnStatus === 'warning' ? Minus : TrendingUp

  // Calculate projected total cost at completion
  const burnPerProgress = progress > 0 ? totalBurn / (progress / 100) : 0
  const projectedTotalCost = burnPerProgress

  // Merge labor and haul-off by date for combined view
  const combinedByDate = []
  const dateMap = {}

  laborByDate.forEach(day => {
    if (!dateMap[day.date]) {
      dateMap[day.date] = { date: day.date, labor: 0, haulOff: 0, total: 0 }
    }
    dateMap[day.date].labor = day.cost || 0
    dateMap[day.date].total += day.cost || 0
  })

  haulOffByDate.forEach(day => {
    if (!dateMap[day.date]) {
      dateMap[day.date] = { date: day.date, labor: 0, haulOff: 0, total: 0 }
    }
    dateMap[day.date].haulOff = day.cost || 0
    dateMap[day.date].total += day.cost || 0
  })

  Object.values(dateMap)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .forEach(d => combinedByDate.push(d))

  // Max daily cost for bar sizing
  const maxDailyCost = Math.max(...combinedByDate.map(d => d.total), 1)

  return (
    <div className="burn-rate-card">
      <div className="burn-rate-header">
        <div className="burn-rate-title">
          <Flame size={18} className="burn-icon" />
          <h3>Burn Rate</h3>
        </div>
        <div className={`burn-status ${burnStatus}`}>
          <StatusIcon size={14} />
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="burn-rate-hero">
        <div className="burn-rate-main">
          <span className="burn-rate-value">{formatCurrency(dailyBurn)}</span>
          <span className="burn-rate-unit">/day</span>
        </div>
        {daysWorked > 0 && (
          <div className="burn-rate-context">
            Based on {daysWorked} work day{daysWorked !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="burn-rate-summary">
        <div className="burn-summary-item">
          <span className="burn-summary-label">Total Spent</span>
          <span className="burn-summary-value">{formatCurrency(totalBurn)}</span>
        </div>
        <div className="burn-summary-divider"></div>
        <div className="burn-summary-item">
          <span className="burn-summary-label">Labor</span>
          <span className="burn-summary-value">{formatCurrency(laborCost)}</span>
        </div>
        <div className="burn-summary-divider"></div>
        <div className="burn-summary-item">
          <span className="burn-summary-label">Disposal</span>
          <span className="burn-summary-value">{formatCurrency(haulOffCost)}</span>
        </div>
      </div>

      {progress > 0 && (
        <div className="burn-projection">
          <span className="projection-label">Projected at completion:</span>
          <span className={`projection-value ${projectedTotalCost > contractValue * 0.7 ? 'warning' : ''}`}>
            {formatCurrency(projectedTotalCost)}
          </span>
        </div>
      )}

      {combinedByDate.length > 0 && (
        <button
          className="burn-rate-expand"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>{expanded ? 'Hide' : 'View'} Daily Breakdown</span>
        </button>
      )}

      {expanded && combinedByDate.length > 0 && (
        <div className="burn-rate-details">
          <div className="burn-details-header">
            <span>Date</span>
            <span>Labor</span>
            <span>Disposal</span>
            <span>Total</span>
          </div>
          {combinedByDate.map(day => (
            <div key={day.date} className="burn-details-row">
              <span className="burn-date">{formatDate(day.date)}</span>
              <span className="burn-labor">{day.labor > 0 ? formatCurrency(day.labor) : '-'}</span>
              <span className="burn-hauloff">{day.haulOff > 0 ? formatCurrency(day.haulOff) : '-'}</span>
              <span className="burn-total">
                <span className="burn-bar" style={{ width: `${(day.total / maxDailyCost) * 100}%` }}></span>
                <span className="burn-amount">{formatCurrency(day.total)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
