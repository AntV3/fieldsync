import { useState, useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { animationConfig, formatChartCurrency } from './chartConfig'
import { buildCostDistribution } from '../../lib/chartDataTransforms'

/**
 * Cost Distribution Donut Chart
 * Shows breakdown of costs by category with interactive segments
 */
export default function CostDonut({
  laborCost = 0,
  haulOffCost = 0,
  customCosts = [],
  onSegmentClick,
}) {
  const [activeIndex, setActiveIndex] = useState(null)

  // Build the donut segments
  const segments = useMemo(() => {
    return buildCostDistribution(laborCost, haulOffCost, customCosts)
  }, [laborCost, haulOffCost, customCosts])

  // Calculate total
  const totalCost = useMemo(() => {
    return segments.reduce((sum, s) => sum + s.value, 0)
  }, [segments])

  // Handle segment hover
  const handleMouseEnter = (_, index) => {
    setActiveIndex(index)
  }

  const handleMouseLeave = () => {
    setActiveIndex(null)
  }

  // Handle segment click
  const handleClick = (data, index) => {
    if (onSegmentClick) {
      onSegmentClick(segments[index])
    }
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) {
      return null
    }

    const data = payload[0].payload
    return (
      <div className="chart-tooltip donut-tooltip">
        <div className="chart-tooltip-row">
          <span className="chart-tooltip-label">
            <span
              className="chart-tooltip-dot"
              style={{ backgroundColor: data.color }}
            />
            {data.name}
          </span>
          <span className="chart-tooltip-value">
            {formatChartCurrency(data.value)}
          </span>
        </div>
        <div className="donut-tooltip-pct">
          {data.percentage}% of total costs
        </div>
        {data.items && data.items.length > 0 && (
          <div className="donut-tooltip-items">
            <div className="donut-tooltip-items-label">
              {data.items.length} item{data.items.length > 1 ? 's' : ''}
            </div>
          </div>
        )}
        {onSegmentClick && (
          <div className="chart-tooltip-hint">
            Click to view details
          </div>
        )}
      </div>
    )
  }

  // Custom legend
  const renderLegend = (props) => {
    const { payload } = props
    return (
      <div className="donut-legend">
        {payload.map((entry, index) => (
          <div
            key={`legend-${index}`}
            className={`donut-legend-item ${activeIndex === index ? 'active' : ''}`}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={() => handleClick(null, index)}
          >
            <span
              className="donut-legend-color"
              style={{ backgroundColor: entry.payload.color }}
            />
            <span className="donut-legend-name">{entry.value}</span>
            <span className="donut-legend-value">
              {formatChartCurrency(entry.payload.value)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (!segments.length || totalCost === 0) {
    return (
      <div className="cost-donut empty">
        <div className="chart-empty-state">
          <p>No cost data available.</p>
          <span>Add labor, disposal, or custom costs to see breakdown.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="cost-donut">
      <div className="donut-chart-container">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={segments}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              animationDuration={animationConfig.duration}
              animationEasing="ease-out"
            >
              {segments.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="var(--card-bg)"
                  strokeWidth={2}
                  style={{
                    filter: activeIndex === index ? 'brightness(1.1)' : 'none',
                    cursor: onSegmentClick ? 'pointer' : 'default',
                    transform: activeIndex === index ? 'scale(1.05)' : 'scale(1)',
                    transformOrigin: 'center',
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label showing total */}
        <div className="donut-center-label">
          <span className="donut-center-value">
            {formatChartCurrency(totalCost)}
          </span>
          <span className="donut-center-text">Total</span>
        </div>
      </div>
    </div>
  )
}
