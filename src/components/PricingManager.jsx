import { useState } from 'react'
import { HardHat, Wrench, Truck } from 'lucide-react'
import LaborRatesSection from './pricing/LaborRatesSection'
import MaterialsSection from './pricing/MaterialsSection'
import DumpSitesSection from './pricing/DumpSitesSection'

const PRICING_TABS = [
  { id: 'labor', label: 'Labor Rates', Icon: HardHat },
  { id: 'materials', label: 'Materials & Equipment', Icon: Wrench },
  { id: 'disposal', label: 'Disposal & Haul-Off', Icon: Truck }
]

export default function PricingManager({ company, onShowToast }) {
  const [activeTab, setActiveTab] = useState('labor')

  return (
    <div className="pricing-manager">
      <div className="pricing-header">
        <h1>Pricing Configuration</h1>
        <p className="pricing-subtitle">Set up labor rates, materials pricing, and disposal costs</p>
      </div>

      {/* Pricing Tabs */}
      <div className="pricing-tabs">
        {PRICING_TABS.map(tab => (
          <button
            key={tab.id}
            className={`pricing-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.Icon size={18} className="pricing-tab-icon" />
            <span className="pricing-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pricing-content">
        {activeTab === 'labor' && (
          <LaborRatesSection company={company} onShowToast={onShowToast} />
        )}
        {activeTab === 'materials' && (
          <MaterialsSection company={company} onShowToast={onShowToast} />
        )}
        {activeTab === 'disposal' && (
          <DumpSitesSection company={company} onShowToast={onShowToast} />
        )}
      </div>
    </div>
  )
}
