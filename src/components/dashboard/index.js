/**
 * Dashboard Components
 *
 * Redesigned dashboard components with:
 * - Actionable insights
 * - Accessibility compliance
 * - User-centric design
 */

// Status & Badges
export {
  AccessibleStatusBadge,
  OnTrackBadge,
  AtRiskBadge,
  OverBudgetBadge,
  CompleteBadge,
  PendingBadge,
  DraftBadge,
  ProjectHealthBadge
} from './AccessibleStatusBadge'

// Trends & Sparklines
export {
  TrendIndicator,
  TrendIndicatorWithCalculation,
  Sparkline,
  calculateTrend
} from './TrendIndicator'

// Metric Cards
export {
  MetricCard,
  MetricGrid,
  ProgressBar,
  EarnedRevenueCard,
  TotalCostsCard,
  ProfitMarginCard,
  ContractValueCard,
  ProgressCard
} from './MetricCard'

// Risk Score
export {
  RiskScoreGauge,
  RiskScoreBadge,
  RiskLevelLabel
} from './RiskScoreGauge'

// Smart Alerts
export {
  SmartAlerts,
  SmartAlertCard,
  AlertSummaryBanner,
  NoAlertsMessage,
  aggregateAlerts
} from './SmartAlerts'

// Projections
export {
  ProjectionCard,
  ProjectionsPanel,
  ProjectionSummary
} from './ProjectionCard'

// Threshold Configuration
export {
  ThresholdConfig,
  ThresholdConfigCompact,
  useSavedThresholds
} from './ThresholdConfig'

// Benchmark Comparison
export {
  BenchmarkComparison,
  BenchmarkIndicator,
  useCompanyAverages,
  INDUSTRY_BENCHMARKS
} from './BenchmarkComparison'
