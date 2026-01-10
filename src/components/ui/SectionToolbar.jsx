import { useState, useRef, useEffect } from 'react'
import {
  ChevronDown,
  LayoutGrid,
  List,
  Table2,
  BarChart3,
  Download,
  FileText,
  FileSpreadsheet,
  Filter,
  Calendar,
  X
} from 'lucide-react'

/**
 * SectionToolbar - Unified toolbar for all financials sections
 * Provides consistent View, Filter, Time Range, and Actions
 */

// Dropdown component for consistent styling
function ToolbarDropdown({
  label,
  icon: Icon,
  value,
  children,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div className={`toolbar-dropdown ${className}`} ref={dropdownRef}>
      <button
        className={`toolbar-dropdown-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {Icon && <Icon size={16} />}
        <span className="toolbar-dropdown-label">{label}</span>
        {value && <span className="toolbar-dropdown-value">{value}</span>}
        <ChevronDown size={14} className={`toolbar-chevron ${isOpen ? 'rotated' : ''}`} />
      </button>
      {isOpen && (
        <div className="toolbar-dropdown-menu">
          {typeof children === 'function' ? children(() => setIsOpen(false)) : children}
        </div>
      )}
    </div>
  )
}

// View mode options with icons
const VIEW_ICONS = {
  cards: LayoutGrid,
  list: List,
  table: Table2,
  analytics: BarChart3
}

export default function SectionToolbar({
  // View options
  viewMode,
  onViewModeChange,
  viewOptions = [], // [{ value: 'cards', label: 'Cards' }, ...]

  // Filter options
  filters = [], // [{ key: 'status', label: 'Status', value: 'all', options: [...] }, ...]
  onFilterChange,

  // Time range
  timeRange,
  onTimeRangeChange,
  timeRangeOptions = [
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'all', label: 'All Time' },
    { value: 'custom', label: 'Custom Range' }
  ],
  customDateRange,
  onCustomDateChange,

  // Export
  onExportPDF,
  onExportExcel,
  exportDisabled = false,

  // Primary action
  primaryAction, // { label: '+ New COR', onClick: fn, icon: Plus }

  // Additional actions
  secondaryActions = [], // [{ label: 'Select', onClick: fn, icon: CheckSquare }]

  // Compact mode for smaller screens
  compact = false,

  // Custom class
  className = ''
}) {
  const [showCustomDates, setShowCustomDates] = useState(timeRange === 'custom')

  const handleTimeRangeChange = (value, closeMenu) => {
    if (value === 'custom') {
      setShowCustomDates(true)
    } else {
      setShowCustomDates(false)
    }
    onTimeRangeChange?.(value)
    if (value !== 'custom') {
      closeMenu?.()
    }
  }

  const activeFiltersCount = filters.filter(f => f.value && f.value !== 'all').length

  return (
    <div className={`section-toolbar ${compact ? 'compact' : ''} ${className}`}>
      <div className="toolbar-left">
        {/* View Mode Dropdown */}
        {viewOptions.length > 0 && (
          <ToolbarDropdown
            icon={VIEW_ICONS[viewMode] || LayoutGrid}
            label="View"
            value={viewOptions.find(v => v.value === viewMode)?.label}
          >
            {(closeMenu) => (
              <div className="toolbar-menu-section">
                {viewOptions.map(option => {
                  const OptionIcon = VIEW_ICONS[option.value] || LayoutGrid
                  return (
                    <button
                      key={option.value}
                      className={`toolbar-menu-item ${viewMode === option.value ? 'active' : ''}`}
                      onClick={() => {
                        onViewModeChange?.(option.value)
                        closeMenu()
                      }}
                    >
                      <OptionIcon size={16} />
                      <span>{option.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </ToolbarDropdown>
        )}

        {/* Filter Dropdown */}
        {filters.length > 0 && (
          <ToolbarDropdown
            icon={Filter}
            label="Filter"
            value={activeFiltersCount > 0 ? `${activeFiltersCount} active` : null}
            className={activeFiltersCount > 0 ? 'has-active' : ''}
          >
            {(closeMenu) => (
              <div className="toolbar-filter-menu">
                {filters.map(filter => (
                  <div key={filter.key} className="toolbar-filter-group">
                    <label className="toolbar-filter-label">{filter.label}</label>
                    <div className="toolbar-filter-options">
                      {filter.options.map(option => (
                        <button
                          key={option.value}
                          className={`toolbar-filter-chip ${filter.value === option.value ? 'active' : ''}`}
                          onClick={() => {
                            onFilterChange?.(filter.key, option.value)
                          }}
                        >
                          {option.label}
                          {option.count !== undefined && (
                            <span className="toolbar-filter-count">{option.count}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {activeFiltersCount > 0 && (
                  <button
                    className="toolbar-clear-filters"
                    onClick={() => {
                      filters.forEach(f => onFilterChange?.(f.key, 'all'))
                      closeMenu()
                    }}
                  >
                    <X size={14} /> Clear All Filters
                  </button>
                )}
              </div>
            )}
          </ToolbarDropdown>
        )}

        {/* Time Range Dropdown */}
        {onTimeRangeChange && (
          <ToolbarDropdown
            icon={Calendar}
            label="Time"
            value={timeRangeOptions.find(t => t.value === timeRange)?.label}
          >
            {(closeMenu) => (
              <div className="toolbar-menu-section">
                {timeRangeOptions.map(option => (
                  <button
                    key={option.value}
                    className={`toolbar-menu-item ${timeRange === option.value ? 'active' : ''}`}
                    onClick={() => handleTimeRangeChange(option.value, closeMenu)}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
                {showCustomDates && (
                  <div className="toolbar-custom-dates">
                    <div className="toolbar-date-inputs">
                      <input
                        type="date"
                        value={customDateRange?.start || ''}
                        onChange={(e) => onCustomDateChange?.({ ...customDateRange, start: e.target.value })}
                        placeholder="Start"
                      />
                      <span className="toolbar-date-separator">to</span>
                      <input
                        type="date"
                        value={customDateRange?.end || ''}
                        onChange={(e) => onCustomDateChange?.({ ...customDateRange, end: e.target.value })}
                        placeholder="End"
                      />
                    </div>
                    <button
                      className="toolbar-apply-dates"
                      onClick={closeMenu}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}
          </ToolbarDropdown>
        )}

        {/* Export Dropdown */}
        {(onExportPDF || onExportExcel) && (
          <ToolbarDropdown
            icon={Download}
            label="Export"
            className="toolbar-export"
          >
            {(closeMenu) => (
              <div className="toolbar-menu-section">
                {onExportPDF && (
                  <button
                    className="toolbar-menu-item"
                    onClick={() => {
                      onExportPDF()
                      closeMenu()
                    }}
                    disabled={exportDisabled}
                  >
                    <FileText size={16} />
                    <span>Export as PDF</span>
                  </button>
                )}
                {onExportExcel && (
                  <button
                    className="toolbar-menu-item"
                    onClick={() => {
                      onExportExcel()
                      closeMenu()
                    }}
                    disabled={exportDisabled}
                  >
                    <FileSpreadsheet size={16} />
                    <span>Export as Excel</span>
                  </button>
                )}
              </div>
            )}
          </ToolbarDropdown>
        )}
      </div>

      <div className="toolbar-right">
        {/* Secondary Actions */}
        {secondaryActions.map((action, index) => {
          const ActionIcon = action.icon
          return (
            <button
              key={index}
              className={`toolbar-btn toolbar-btn-secondary ${action.active ? 'active' : ''}`}
              onClick={action.onClick}
              title={action.title || action.label}
            >
              {ActionIcon && <ActionIcon size={16} />}
              {!compact && <span>{action.label}</span>}
            </button>
          )
        })}

        {/* Primary Action */}
        {primaryAction && (
          <button
            className="toolbar-btn toolbar-btn-primary"
            onClick={primaryAction.onClick}
          >
            {primaryAction.icon && <primaryAction.icon size={16} />}
            <span>{primaryAction.label}</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Export the dropdown for reuse
export { ToolbarDropdown }
