// ============================================
// Chart Configuration
// ============================================
// Centralized theme colors, animations, and styles
// for all financial dashboard charts.
// ============================================

// Chart color palette - matches app theme
export const chartColors = {
  // Financial lines
  contract: '#3b82f6',     // Blue - contract ceiling
  revenue: '#10b981',      // Green - earned revenue
  costs: '#f59e0b',        // Amber - spending
  profit: '#22c55e',       // Emerald - positive profit
  loss: '#ef4444',         // Red - negative/loss

  // Extra work
  tmValue: '#8b5cf6',      // Purple - T&M ticket value
  corValue: '#14b8a6',     // Teal - COR approved value

  // Cost categories
  labor: '#6366f1',        // Indigo
  disposal: '#14b8a6',     // Teal
  equipment: '#f97316',    // Orange
  materials: '#a855f7',    // Purple
  subcontractor: '#ec4899', // Pink
  other: '#6b7280',        // Gray

  // UI
  grid: 'var(--border-color)',
  text: 'var(--text-secondary)',
  background: 'var(--bg-card)',
}

// Animation configuration
export const animationConfig = {
  duration: 800,
  easing: 'ease-out',
}

// Common tooltip styles
export const tooltipStyle = {
  contentStyle: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    padding: '12px 16px',
  },
  labelStyle: {
    color: 'var(--text-primary)',
    fontWeight: 600,
    marginBottom: '8px',
  },
  itemStyle: {
    color: 'var(--text-secondary)',
    padding: '2px 0',
  },
}

// Cost category configuration
export const costCategories = {
  labor: {
    label: 'Labor',
    color: chartColors.labor,
    icon: 'HardHat',
  },
  disposal: {
    label: 'Disposal',
    color: chartColors.disposal,
    icon: 'Trash2',
  },
  equipment: {
    label: 'Equipment',
    color: chartColors.equipment,
    icon: 'Truck',
  },
  materials: {
    label: 'Materials',
    color: chartColors.materials,
    icon: 'Package',
  },
  subcontractor: {
    label: 'Subcontractor',
    color: chartColors.subcontractor,
    icon: 'Users',
  },
  other: {
    label: 'Other',
    color: chartColors.other,
    icon: 'MoreHorizontal',
  },
}

// Time range options for charts
export const timeRanges = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: 'all', label: 'All', days: null },
]

// Format currency for chart labels
export const formatChartCurrency = (value) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

// Format date for chart axis
export const formatChartDate = (dateStr) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Gradient definitions for area charts
export const gradientDefs = {
  revenue: {
    id: 'revenueGradient',
    color: chartColors.revenue,
    startOpacity: 0.3,
    endOpacity: 0,
  },
  costs: {
    id: 'costsGradient',
    color: chartColors.costs,
    startOpacity: 0.3,
    endOpacity: 0,
  },
  tmValue: {
    id: 'tmValueGradient',
    color: chartColors.tmValue,
    startOpacity: 0.2,
    endOpacity: 0,
  },
}
