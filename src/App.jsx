import { useState, useEffect } from 'react'
import { isSupabaseConfigured, auth } from './lib/supabase'
import PinEntry from './components/PinEntry'
import Login from './components/Login'
import ForemanView from './components/ForemanView'
import Dashboard from './components/Dashboard'
import Field from './components/Field'
import Setup from './components/Setup'
import Toast from './components/Toast'

export default function App() {
  const [view, setView] = useState('pin') // 'pin', 'login', 'foreman', 'office'
  const [user, setUser] = useState(null)
  const [foremanProject, setForemanProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const profile = await auth.getProfile()
      if (profile) {
        setUser(profile)
        setView('office')
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleProjectAccess = (project) => {
    setForemanProject(project)
    setView('foreman')
  }

  const handleOfficeLogin = () => {
    setView('login')
  }

  const handleLogin = (profile) => {
    setUser(profile)
    setView('office')
  }

  const handleLogout = async () => {
    try {
      await auth.signOut()
      setUser(null)
      setView('pin')
      setActiveTab('dashboard')
    } catch (error) {
      console.error('Logout error:', error)
      showToast('Error signing out', 'error')
    }
  }

  const handleExitForeman = () => {
    setForemanProject(null)
    setView('pin')
  }

  const handleBackFromLogin = () => {
    setView('pin')
  }

  const showToast = (message, type = '') => {
    setToast({ message, type })
  }

  const handleProjectCreated = () => {
    setActiveTab('dashboard')
  }

  // Loading screen
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">Field<span>Sync</span></div>
        <div className="spinner"></div>
      </div>
    )
  }

  // PIN Entry (default screen)
  if (view === 'pin') {
    return (
      <>
        <PinEntry
          onProjectAccess={handleProjectAccess}
          onOfficeLogin={handleOfficeLogin}
          onShowToast={showToast}
        />
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </>
    )
  }

  // Office Login
  if (view === 'login') {
    return (
      <>
        <Login
          onLogin={handleLogin}
          onShowToast={showToast}
          onBack={handleBackFromLogin}
        />
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </>
    )
  }

  // Foreman View (PIN access)
  if (view === 'foreman' && foremanProject) {
    return (
      <>
        <ForemanView
          project={foremanProject}
          companyId={foremanProject.company_id}
          onShowToast={showToast}
          onExit={handleExitForeman}
        />
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </>
    )
  }

  // Office View (full dashboard)
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
              className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`nav-tab ${activeTab === 'field' ? 'active' : ''}`}
              onClick={() => setActiveTab('field')}
            >
              Field
            </button>
            <button
              className={`nav-tab ${activeTab === 'setup' ? 'active' : ''}`}
              onClick={() => setActiveTab('setup')}
            >
              + New Project
            </button>
          </div>
          <div className="nav-user">
            <span className="nav-user-name">{user?.full_name || user?.email}</span>
            <button className="nav-logout" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container">
        {activeTab === 'dashboard' && (
          <Dashboard onShowToast={showToast} />
        )}
        {activeTab === 'field' && (
          <Field onShowToast={showToast} />
        )}
        {activeTab === 'setup' && (
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

