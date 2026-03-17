import { useState, useEffect } from 'react'
import { TrendingUp, DollarSign, Users, FileText, Zap, Wind, Layers, ArrowRight, Gauge, CheckCircle } from 'lucide-react'
import { useTradeConfig } from '../../lib/TradeConfigContext'
import { calculateAllKpis } from '../../lib/tradeKpis'
import { db } from '../../lib/supabase'

// Icon name to component mapping
const ICON_MAP = {
  TrendingUp, DollarSign, Users, FileText, Zap, Wind, Layers, ArrowRight, Gauge, CheckCircle
}

/**
 * TradeKPICard - Displays trade-specific KPIs for the dashboard.
 *
 * Props:
 * - projectId: UUID
 * - projectData: Project data object for built-in KPI calculations
 */
export default function TradeKPICard({ projectId, projectData }) {
  const { resolvedConfig } = useTradeConfig()
  const [customFieldData, setCustomFieldData] = useState({})
  const [loading, setLoading] = useState(true)

  const kpiDefs = resolvedConfig?.kpis || []

  // Load custom field data for KPI calculations
  useEffect(() => {
    if (!projectId || kpiDefs.length === 0) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        // Load daily report custom field data (most common source for KPIs)
        const data = await db.getCustomFieldDataBulk(projectId, 'daily_report')
        setCustomFieldData(data)
      } catch (error) {
        console.error('Error loading KPI data:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId, kpiDefs.length])

  if (kpiDefs.length === 0) return null

  const calculatedKpis = calculateAllKpis(kpiDefs, projectData, customFieldData)
  const tradeName = resolvedConfig?.trade_name || 'Trade'

  return (
    <div className="trade-kpi-card">
      <h3 className="trade-kpi-title">{tradeName} KPIs</h3>
      <div className="trade-kpi-grid">
        {calculatedKpis.map(kpi => {
          const IconComponent = ICON_MAP[kpi.icon] || TrendingUp
          return (
            <div key={kpi.id} className="trade-kpi-item">
              <div className="trade-kpi-icon">
                <IconComponent size={18} />
              </div>
              <div className="trade-kpi-info">
                <span className="trade-kpi-value">
                  {loading ? '...' : (kpi.value !== null ? kpi.value : '--')}
                  {kpi.value !== null && kpi.unit && (
                    <span className="trade-kpi-unit"> {kpi.unit}</span>
                  )}
                </span>
                <span className="trade-kpi-label">{kpi.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
