import { memo, useMemo } from 'react'
import { DollarSign, TrendingUp, Receipt, PiggyBank } from 'lucide-react'
import { HeroMetricsSkeleton, MiniProgress, TrendIndicator, InfoTooltip } from './ui'

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

// Compact currency for the single-line summary strip ($2.5M, $980K)
const formatCurrencyCompact = (amount) => {
  const value = amount || 0
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000).toFixed(0)}K`
  return formatCurrency(value)
}

/** Decorative spark line SVG watermark for bottom-right corner of cards */
const SparkLineWatermark = ({ color }) => (
  <svg
    className="hero-metric-sparkline"
    viewBox="0 0 60 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M0 18 L8 14 L16 16 L24 8 L32 12 L40 4 L48 10 L56 2 L60 6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.18"
    />
  </svg>
)

/** Subtle green pulse dot for positive profit */
const PulseIndicator = () => (
  <span className="hero-metric-pulse" aria-label="Positive profit indicator" />
)

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
  previousValue,
  showPulse = false,
  tooltip,
  subLabelMuted = false,
  helperText
}) {
  const variantColors = {
    default: 'var(--accent-blue)',
    success: 'var(--accent-green)',
    warning: 'var(--accent-amber)',
    danger: 'var(--accent-red)'
  }

  const variantBgs = {
    default: 'var(--blue-subtle)',
    success: 'var(--green-subtle)',
    warning: 'var(--amber-subtle)',
    danger: 'var(--red-subtle)'
  }

  const color = variantColors[variant]
  const bg = variantBgs[variant]

  return (
    <div
      className="hero-metric-card hover-lift animate-fade-in-up"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <div className="hero-metric-header">
        <div
          className="hero-metric-icon"
          style={{
            color,
            background: bg,
            boxShadow: `0 0 12px ${color}33, 0 0 4px ${color}22`
          }}
        >
          <Icon size={20} />
        </div>
        <span className="hero-metric-label">{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
        {showPulse && <PulseIndicator />}
      </div>

      <div className="hero-metric-value-row">
        <span
          className={`hero-metric-value hero-metric-value--prominent hero-metric-${variant}`}
          style={{ background: `${color}0D`, padding: '0.1em 0.35em', borderRadius: '6px' }}
        >
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
        subLabelMuted ? (
          <span className="hero-metric-sublabel hero-metric-pill hero-metric-pill--muted">
            {subLabel}
          </span>
        ) : (
          <span className="hero-metric-sublabel hero-metric-pill" style={{ background: bg, color }}>
            {subLabel}
          </span>
        )
      )}

      {helperText && (
        <span className="hero-metric-helper">{helperText}</span>
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

      {/* Decorative sparkline watermark */}
      <SparkLineWatermark color={color} />
    </div>
  )
})

export default memo(function HeroMetrics({
  contractValue = 0,
  earnedRevenue = 0,
  totalCosts = 0,
  profit = 0,
  progress = 0,
  corApprovedValue = 0,
  loading = false,
  compact = false, // Single-line summary strip for sub-tabs (CORs/Tickets/Billing)
  previousData // Optional: for trend indicators
}) {
  // Calculate derived values
  const revisedContract = contractValue + corApprovedValue
  const profitMargin = earnedRevenue > 0 ? ((profit / earnedRevenue) * 100) : 0
  const costRatio = earnedRevenue > 0 ? ((totalCosts / earnedRevenue) * 100) : 0
  const revenueProgress = revisedContract > 0 ? ((earnedRevenue / revisedContract) * 100) : 0
  const costProgress = revisedContract > 0 ? ((totalCosts / revisedContract) * 100) : 0

  // With $0 costs a "100% margin" is technically right but reads as a success
  // state — treat margins as unknown until cost data exists
  const awaitingCosts = totalCosts === 0

  // Determine profit status
  const profitVariant = useMemo(() => {
    if (awaitingCosts) return 'default'
    if (profitMargin >= 20) return 'success'
    if (profitMargin >= 10) return 'warning'
    if (profitMargin < 0) return 'danger'
    return 'default'
  }, [profitMargin, awaitingCosts])

  // Determine cost status
  const costVariant = useMemo(() => {
    if (awaitingCosts) return 'default'
    if (costRatio <= 60) return 'success'
    if (costRatio <= 80) return 'warning'
    return 'danger'
  }, [costRatio, awaitingCosts])

  if (loading) {
    return compact ? null : <HeroMetricsSkeleton />
  }

  // Compact single-line strip for sub-tabs where the full cards would repeat
  if (compact) {
    return (
      <div className="hero-metrics-compact" role="region" aria-label="Financial summary">
        <span className="hero-metrics-compact-item">
          <strong>{formatCurrencyCompact(revisedContract)}</strong> contract
        </span>
        <span className="hero-metrics-compact-sep" aria-hidden="true">·</span>
        <span className="hero-metrics-compact-item">
          <strong>{formatCurrencyCompact(earnedRevenue)}</strong> earned
        </span>
        <span className="hero-metrics-compact-sep" aria-hidden="true">·</span>
        <span className="hero-metrics-compact-item">
          <strong>{formatCurrencyCompact(totalCosts)}</strong> costs
        </span>
        <span className="hero-metrics-compact-sep" aria-hidden="true">·</span>
        <span className={`hero-metrics-compact-item ${profit > 0 && !awaitingCosts ? 'positive' : profit < 0 ? 'negative' : ''}`}>
          <strong>{formatCurrencyCompact(profit)}</strong> profit
        </span>
      </div>
    )
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
        tooltip="Original Contract + Approved CORs"
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
        tooltip="Sum of completed area values based on weighted progress of each bid item"
      />

      {/* Total Costs */}
      <MetricCard
        icon={Receipt}
        label="Total Costs"
        value={totalCosts}
        formattedValue={formatCurrency(totalCosts)}
        progress={awaitingCosts ? undefined : costProgress}
        progressLabel={awaitingCosts ? undefined : `${Math.round(costRatio)}% of revenue`}
        helperText={awaitingCosts ? 'Enter costs to track margins' : undefined}
        variant={costVariant}
        previousValue={previousData?.totalCosts}
        trend={previousData ? totalCosts : undefined}
        tooltip="Labor + Disposal + Materials + Equipment + Other Costs"
      />

      {/* Profit */}
      <MetricCard
        icon={PiggyBank}
        label="Profit"
        value={profit}
        formattedValue={formatCurrency(profit)}
        subLabel={awaitingCosts ? '— margin' : `${profitMargin >= 0 ? '+' : ''}${profitMargin.toFixed(1)}% margin`}
        subLabelMuted={awaitingCosts}
        variant={profitVariant}
        previousValue={previousData?.profit}
        trend={previousData ? profit : undefined}
        showPulse={profit > 0 && !awaitingCosts}
        tooltip="Earned Revenue − Total Costs. Margin = Profit ÷ Earned Revenue × 100"
      />
    </div>
  )
})
