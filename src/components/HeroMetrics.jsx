import { memo, useMemo } from 'react'
import { DollarSign, TrendingUp, Receipt, PiggyBank } from 'lucide-react'
import { HeroMetricsSkeleton, MiniProgress, TrendIndicator } from './ui'

/**
 * HeroMetrics - Top-level financial summary for project dashboard
 * Designed for instant comprehension of project financial health
 */

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0)
}

const MetricCard = memo(function MetricCard({
  icon: Icon,
  label,
  value,
  formattedValue,
  subLabel,
  progress,
  progressLabel,
  variant = 'default', // 'default' | 'success' | 'warning' | 'danger'
  trend,
  previousValue
}) {
  const variantColors = {
    default: 'var(--accent-blue)',
    success: 'var(--accent-green)',
    warning: 'var(--accent-amber)',
    danger: 'var(--accent-red)'
  }

  return (
    <div className={`hero-metric-card hover-lift animate-fade-in-up`}>
      <div className="hero-metric-header">
        <div className="hero-metric-icon" style={{ color: variantColors[variant] }}>
          <Icon size={18} />
        </div>
        <span className="hero-metric-label">{label}</span>
      </div>

      <div className="hero-metric-value-row">
        <span className={`hero-metric-value hero-metric-${variant}`}>
          {formattedValue}
        </span>
        {trend !== undefined && previousValue !== undefined && (
          <TrendIndicator
            value={value}
            previousValue={previousValue}
            format="currency"
            inverted={label.toLowerCase().includes('cost')}
          />
        )}
      </div>

      {subLabel && (
        <span className="hero-metric-sublabel">{subLabel}</span>
      )}

      {progress !== undefined && (
        <div className="hero-metric-progress">
          <MiniProgress
            value={progress}
            max={100}
            size="small"
            variant={variant}
            showLabel
          />
          {progressLabel && (
            <span className="hero-metric-progress-label">{progressLabel}</span>
          )}
        </div>
      )}
    </div>
  )
})

export default memo(function HeroMetrics({
  contractValue = 0,
  earnedRevenue = 0,
  totalCosts = 0,
  profit = 0,
  progress: _progress = 0,
  corApprovedValue = 0,
  loading = false,
  previousData // Optional: for trend indicators
}) {
  // Calculate derived values
  const revisedContract = contractValue + corApprovedValue
  const profitMargin = earnedRevenue > 0 ? ((profit / earnedRevenue) * 100) : 0
  const costRatio = earnedRevenue > 0 ? ((totalCosts / earnedRevenue) * 100) : 0
  const revenueProgress = revisedContract > 0 ? ((earnedRevenue / revisedContract) * 100) : 0
  const costProgress = revisedContract > 0 ? ((totalCosts / revisedContract) * 100) : 0

  // Determine profit status
  const profitVariant = useMemo(() => {
    if (profitMargin >= 20) return 'success'
    if (profitMargin >= 10) return 'warning'
    if (profitMargin < 0) return 'danger'
    return 'default'
  }, [profitMargin])

  // Determine cost status
  const costVariant = useMemo(() => {
    if (costRatio <= 60) return 'success'
    if (costRatio <= 80) return 'warning'
    return 'danger'
  }, [costRatio])

  if (loading) {
    return <HeroMetricsSkeleton />
  }

  return (
    <div className="hero-metrics stagger-children">
      {/* Contract Value */}
      <MetricCard
        icon={DollarSign}
        label="Contract Value"
        value={revisedContract}
        formattedValue={formatCurrency(revisedContract)}
        subLabel={corApprovedValue > 0 ? `+${formatCurrency(corApprovedValue)} CORs` : null}
        variant="default"
      />

      {/* Earned Revenue */}
      <MetricCard
        icon={TrendingUp}
        label="Earned Revenue"
        value={earnedRevenue}
        formattedValue={formatCurrency(earnedRevenue)}
        progress={revenueProgress}
        progressLabel={`${Math.round(revenueProgress)}% of contract`}
        variant="success"
        previousValue={previousData?.earnedRevenue}
        trend={previousData ? earnedRevenue : undefined}
      />

      {/* Total Costs */}
      <MetricCard
        icon={Receipt}
        label="Total Costs"
        value={totalCosts}
        formattedValue={formatCurrency(totalCosts)}
        progress={costProgress}
        progressLabel={`${Math.round(costRatio)}% of revenue`}
        variant={costVariant}
        previousValue={previousData?.totalCosts}
        trend={previousData ? totalCosts : undefined}
      />

      {/* Profit */}
      <MetricCard
        icon={PiggyBank}
        label="Profit"
        value={profit}
        formattedValue={formatCurrency(profit)}
        subLabel={`${profitMargin >= 0 ? '+' : ''}${profitMargin.toFixed(1)}% margin`}
        variant={profitVariant}
        previousValue={previousData?.profit}
        trend={previousData ? profit : undefined}
      />
    </div>
  )
})
