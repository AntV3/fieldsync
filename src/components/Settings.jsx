import { useState } from 'react'
import TeamManagement from './TeamManagement'
import CompanySettings from './CompanySettings'

/**
 * Settings Component
 * Combines Team Management and Company Settings
 */
export default function Settings({ company, currentUser, onShowToast, onCompanyUpdated }) {
  const [activeTab, setActiveTab] = useState('team')

  return (
    <div className="settings-view">
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => setActiveTab('team')}
        >
          Team
        </button>
        <button
          className={`settings-tab ${activeTab === 'company' ? 'active' : ''}`}
          onClick={() => setActiveTab('company')}
        >
          Company
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'team' && (
          <TeamManagement
            company={company}
            currentUser={currentUser}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'company' && (
          <CompanySettings
            company={company}
            currentUser={currentUser}
            onShowToast={onShowToast}
            onCompanyUpdated={onCompanyUpdated}
          />
        )}
      </div>
    </div>
  )
}
