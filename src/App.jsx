import { useState } from 'react'
import { isSupabaseConfigured } from './lib/supabase'
import Dashboard from './components/Dashboard'
import Field from './components/Field'
import Setup from './components/Setup'
import Toast from './components/Toast'

export default function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const [toast, setToast] = useState(null)

  const showToast = (message, type = '') => {
    setToast({ message, type })
  }

  const handleProjectCreated = () => {
    setActiveView('dashboard')
  }

  return (
    <div>
      {/* Demo Banner */}
      {!isSupabaseConfigured && (
        <div className="demo-banner">
          Demo Mode - Data saved locally in your browser
        </div>
      )}

      {/* Navigation */}
      <nav className="nav">
        <div className="nav-content">
          <div className="logo">Field<span>Sync</span></div>
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeView === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveView('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`nav-tab ${activeView === 'field' ? 'active' : ''}`}
              onClick={() => setActiveView('field')}
            >
              Field
            </button>
            <button
              className={`nav-tab ${activeView === 'setup' ? 'active' : ''}`}
              onClick={() => setActiveView('setup')}
            >
              + New Project
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container">
        {activeView === 'dashboard' && (
          <Dashboard onShowToast={showToast} />
        )}
        {activeView === 'field' && (
          <Field onShowToast={showToast} />
        )}
        {activeView === 'setup' && (
          <Setup 
            onProjectCreated={handleProjectCreated} 
            onShowToast={showToast} 
          />
        )}
      </div>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
