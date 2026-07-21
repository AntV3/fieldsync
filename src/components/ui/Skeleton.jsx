import { memo } from 'react'

/**
 * Skeleton - Loading placeholder component
 * Follows progressive disclosure principle - shows structure before content
 */

// Base skeleton with shimmer animation
export const Skeleton = memo(function Skeleton({
  width,
  height,
  borderRadius = '8px',
  className = '',
  variant = 'default' // 'default' | 'text' | 'circular' | 'rectangular'
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'text':
        return { height: '1em', borderRadius: '4px' }
      case 'circular':
        return { borderRadius: '50%' }
      case 'rectangular':
        return { borderRadius: '0' }
      default:
        return { borderRadius }
    }
  }

  const variantStyles = getVariantStyles()

  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width || '100%',
        height: height || variantStyles.height || '1rem',
        borderRadius: variantStyles.borderRadius,
      }}
      aria-hidden="true"
    />
  )
})

// Skeleton for metric cards (value + label)
export const MetricSkeleton = memo(function MetricSkeleton({ showProgress = false }) {
  return (
    <div className="metric-skeleton">
      <Skeleton width="60%" height="0.75rem" className="skeleton-label" />
      <Skeleton width="80%" height="1.75rem" className="skeleton-value" />
      {showProgress && (
        <Skeleton width="100%" height="6px" className="skeleton-progress" />
      )}
    </div>
  )
})

// Skeleton for cards (header + content)
export const CardSkeleton = memo(function CardSkeleton({
  lines = 3,
  showHeader = true,
  showAction = false
}) {
  return (
    <div className="card-skeleton" aria-busy="true" aria-label="Loading content">
      {showHeader && (
        <div className="card-skeleton-header">
          <Skeleton width="40%" height="1.25rem" />
          {showAction && <Skeleton width="80px" height="32px" />}
        </div>
      )}
      <div className="card-skeleton-body">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            width={`${100 - (i * 15)}%`}
            height="1rem"
            className="skeleton-line"
          />
        ))}
      </div>
    </div>
  )
})

// Skeleton for list items
export const ListItemSkeleton = memo(function ListItemSkeleton({
  count = 3,
  showAvatar = false,
  showAction = false
}) {
  return (
    <div className="list-skeleton" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="list-item-skeleton">
          {showAvatar && <Skeleton width="40px" height="40px" variant="circular" />}
          <div className="list-item-skeleton-content">
            <Skeleton width="60%" height="1rem" />
            <Skeleton width="40%" height="0.75rem" />
          </div>
          {showAction && <Skeleton width="60px" height="28px" />}
        </div>
      ))}
    </div>
  )
})

// Skeleton for financial analysis row (3 cards)
export const FinancialRowSkeleton = memo(function FinancialRowSkeleton() {
  return (
    <div className="financial-row-skeleton" aria-busy="true" aria-label="Loading financial data">
      {[1, 2, 3].map(i => (
        <div key={i} className="financial-card-skeleton">
          <div className="financial-card-skeleton-header">
            <Skeleton width="24px" height="24px" variant="circular" />
            <Skeleton width="60%" height="1rem" />
          </div>
          <Skeleton width="50%" height="2rem" className="skeleton-hero-value" />
          <div className="financial-card-skeleton-details">
            <Skeleton width="100%" height="0.875rem" />
            <Skeleton width="80%" height="0.875rem" />
          </div>
        </div>
      ))}
    </div>
  )
})

// Skeleton for chart placeholder
export const ChartSkeleton = memo(function ChartSkeleton({ height = '200px' }) {
  return (
    <div className="chart-skeleton" style={{ height }} aria-busy="true" aria-label="Loading chart">
      <div className="chart-skeleton-bars">
        {[40, 65, 45, 80, 55, 70, 50, 75, 60, 85].map((h, i) => (
          <div
            key={i}
            className="chart-skeleton-bar"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <Skeleton width="100%" height="1px" className="chart-skeleton-axis" />
    </div>
  )
})

// Skeleton for COR/Ticket items
export const TicketSkeleton = memo(function TicketSkeleton({ count = 3 }) {
  return (
    <div className="ticket-skeleton-list" aria-busy="true" aria-label="Loading tickets">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ticket-skeleton-item">
          <div className="ticket-skeleton-header">
            <Skeleton width="100px" height="0.875rem" />
            <Skeleton width="80px" height="24px" borderRadius="12px" />
          </div>
          <Skeleton width="90%" height="1rem" />
          <div className="ticket-skeleton-footer">
            <Skeleton width="60px" height="0.75rem" />
            <Skeleton width="60px" height="0.75rem" />
            <Skeleton width="60px" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  )
})

// Skeleton for table rows (data fetching in tabular views)
export const TableRowSkeleton = memo(function TableRowSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="table-skeleton" aria-busy="true" aria-label="Loading table">
      <div className="table-skeleton-row table-skeleton-header">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${60 + ((i * 13) % 30)}%`} height="0.7rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="table-skeleton-row">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} width={`${55 + (((r + c) * 17) % 40)}%`} height="0.9rem" />
          ))}
        </div>
      ))}
    </div>
  )
})

// Full-panel skeleton for tab content switching: card-shaped pulsing blocks
// mirroring the common tab layout (KPI row + two content cards)
export const TabContentSkeleton = memo(function TabContentSkeleton() {
  return (
    <div className="tab-content-skeleton" aria-busy="true" aria-label="Loading tab">
      <div className="tab-content-skeleton-kpis">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} height="96px" borderRadius="12px" />
        ))}
      </div>
      <div className="tab-content-skeleton-main">
        <Skeleton height="280px" borderRadius="12px" />
        <Skeleton height="280px" borderRadius="12px" />
      </div>
      <Skeleton height="160px" borderRadius="12px" />
    </div>
  )
})

// Chart loading skeleton: static axis lines with a pulsing plot area
export const ChartAreaSkeleton = memo(function ChartAreaSkeleton({ height = '220px' }) {
  return (
    <div className="chart-area-skeleton" style={{ height }} aria-busy="true" aria-label="Loading chart">
      <div className="chart-area-skeleton-y" />
      <div className="chart-area-skeleton-plot">
        <div className="chart-area-skeleton-area" />
        <div className="chart-area-skeleton-x" />
      </div>
    </div>
  )
})

// Skeleton for hero metrics row
export const HeroMetricsSkeleton = memo(function HeroMetricsSkeleton() {
  return (
    <div className="hero-metrics-skeleton" aria-busy="true" aria-label="Loading metrics">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="hero-metric-skeleton">
          <Skeleton width="80px" height="0.75rem" className="skeleton-label" />
          <Skeleton width="120px" height="1.75rem" className="skeleton-value" />
          <Skeleton width="100%" height="4px" className="skeleton-bar" />
        </div>
      ))}
    </div>
  )
})

export default Skeleton
