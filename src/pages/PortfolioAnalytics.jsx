import { useState, lazy, Suspense } from 'react'
import { BarChart2, DollarSign, Users, Target, FileText, Shield } from 'lucide-react'
import { ChartSkeleton } from '../components/ui'

// Lazy load each tab independently
const FinancialOverviewTab = lazy(() => import('../components/portfolio/FinancialOverviewTab'))
const LaborResourcesTab = lazy(() => import('../components/portfolio/LaborResourcesTab'))
const ProgressScheduleTab = lazy(() => import('../components/portfolio/ProgressScheduleTab'))
const ChangeOrdersTab = lazy(() => import('../components/portfolio/ChangeOrdersTab'))
const RiskMatrixTab = lazy(() => import('../components/portfolio/RiskMatrixTab'))

const TABS = [
  { id: 'financial', label: 'Financial Overview', icon: DollarSign },
  { id: 'labor', label: 'Labor & Resources', icon: Users },
  { id: 'progress', label: 'Progress & Schedule', icon: Target },
  { id: 'change-orders', label: 'Change Orders', icon: FileText },
  { id: 'risk', label: 'Risk Matrix', icon: Shield },
]

function TabSkeleton() {
  return (
    <div className="pa-tab-content">
      <div className="pa-metrics-row">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="pa-metric-card">
            <div className="skeleton" style={{ width: '60%', height: '0.75rem', marginBottom: 8 }} />
            <div className="skeleton" style={{ width: '80%', height: '1.75rem' }} />
          </div>
        ))}
      </div>
      <div className="pa-charts-grid">
        <div className="pa-chart-card"><ChartSkeleton /></div>
        <div className="pa-chart-card"><ChartSkeleton /></div>
      </div>
    </div>
  )
}

export default function PortfolioAnalytics({ company }) {
  const [activeTab, setActiveTab] = useState('financial')
  const companyId = company?.id

  const renderTab = () => {
    switch (activeTab) {
      case 'financial':
        return <FinancialOverviewTab companyId={companyId} />
      case 'labor':
        return <LaborResourcesTab companyId={companyId} />
      case 'progress':
        return <ProgressScheduleTab companyId={companyId} />
      case 'change-orders':
        return <ChangeOrdersTab companyId={companyId} />
      case 'risk':
        return <RiskMatrixTab companyId={companyId} />
      default:
        return <FinancialOverviewTab companyId={companyId} />
    }
  }

  return (
    <div className="pa-page">
      <div className="pa-header">
        <div className="pa-header-title">
          <BarChart2 size={24} />
          <h1>Portfolio Analytics</h1>
        </div>
        <p className="pa-header-sub">Cross-project metrics and insights for {company?.name || 'your company'}</p>
      </div>

      <div className="pa-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              className={`pa-tab ${activeTab === tab.id ? 'pa-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span className="pa-tab-label">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <Suspense fallback={<TabSkeleton />}>
        {renderTab()}
      </Suspense>
    </div>
  )
}
