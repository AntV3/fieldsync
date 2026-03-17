import { lazy } from 'react'

/**
 * Widget Registry - Maps widget IDs to lazy-loaded components and metadata.
 *
 * Each widget has:
 * - id: Unique identifier
 * - label: Display name
 * - component: Lazy-loaded React component
 * - category: Widget category for grouping in the picker
 * - defaultSize: 'full' | 'half' | 'third'
 */

export const WIDGET_REGISTRY = {
  // ============================================
  // Core Widgets (available to all trades)
  // ============================================
  progress_gauge: {
    id: 'progress_gauge',
    label: 'Progress Gauge',
    category: 'overview',
    defaultSize: 'third',
    description: 'Visual progress indicator for project completion'
  },
  financial_card: {
    id: 'financial_card',
    label: 'Financial Summary',
    category: 'overview',
    defaultSize: 'third',
    description: 'Contract value, billed amount, and financial health'
  },
  crew_metrics: {
    id: 'crew_metrics',
    label: 'Crew Metrics',
    category: 'overview',
    defaultSize: 'third',
    description: 'Today\'s crew count and check-in status'
  },
  earned_value: {
    id: 'earned_value',
    label: 'Earned Value',
    category: 'analytics',
    defaultSize: 'half',
    description: 'Earned value analysis chart'
  },
  photo_timeline: {
    id: 'photo_timeline',
    label: 'Photo Timeline',
    category: 'overview',
    defaultSize: 'full',
    description: 'Recent site photos in chronological order'
  },
  punch_list: {
    id: 'punch_list',
    label: 'Punch List',
    category: 'overview',
    defaultSize: 'full',
    description: 'Open punch list items and status'
  },
  attention_items: {
    id: 'attention_items',
    label: 'Needs Attention',
    category: 'overview',
    defaultSize: 'full',
    description: 'Items requiring immediate action'
  },
  quick_actions: {
    id: 'quick_actions',
    label: 'Quick Actions',
    category: 'overview',
    defaultSize: 'full',
    description: 'Common action buttons (export, reports, etc.)'
  },

  // ============================================
  // Trade KPI Widgets (configured per company)
  // ============================================
  trade_kpis: {
    id: 'trade_kpis',
    label: 'Trade KPIs',
    category: 'analytics',
    defaultSize: 'full',
    description: 'Trade-specific key performance indicators'
  },
  custom_field_summary: {
    id: 'custom_field_summary',
    label: 'Custom Field Summary',
    category: 'analytics',
    defaultSize: 'half',
    description: 'Summary of trade-specific field data'
  }
}

/**
 * Get all available widgets grouped by category
 */
export function getWidgetsByCategory() {
  const categories = {}
  for (const widget of Object.values(WIDGET_REGISTRY)) {
    if (!categories[widget.category]) {
      categories[widget.category] = []
    }
    categories[widget.category].push(widget)
  }
  return categories
}

/**
 * Get widget metadata by ID
 */
export function getWidget(id) {
  return WIDGET_REGISTRY[id] || null
}

/**
 * Default widget layout for new projects/companies
 */
export const DEFAULT_WIDGETS = [
  'attention_items',
  'progress_gauge',
  'financial_card',
  'crew_metrics',
  'earned_value',
  'quick_actions'
]
