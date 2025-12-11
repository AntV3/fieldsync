import { useState, useEffect } from 'react'
import { isSupabaseConfigured, auth, supabase } from './lib/supabase'
import AppEntry from './components/AppEntry'
import ForemanView from './components/ForemanView'
import Dashboard from './components/Dashboard'
import Field from './components/Field'
import Setup from './components/Setup'
import Contracts from './components/Contracts'
import Settings from './components/Settings'
import Toast from './components/Toast'
import OfflineIndicator from './components/OfflineIndicator'
import ThemeToggle from './components/ThemeToggle'
import { initNetworkMonitoring } from './lib/networkStatus'
import { initializeUserContext, clearCurrentUserContext } from './lib/userContextManager'

export default function App() {
  const [view, setView] = useState('entry') // 'entry', 'foreman', 'office'
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [foremanProject, setForemanProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    // Initialize network monitoring for offline mode
    const cleanup = initNetworkMonitoring()

    checkAuth()

    return cleanup
  }, [])

  const checkAuth = async () => {
    try {
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // Get user record with company
      const { data: userData, error } = await supabase
        .from('users')
        .select('*, companies(*)')
        .eq('id', user.id)
        .single()

      if (userData && userData.companies) {
        setUser(userData)
        setCompany(userData.companies)
        setView('office')

        // Initialize user context for audit trails
        await initializeUserContext({
          id: userData.id,
          name: userData.full_name,
          email: userData.email,
          role: userData.role || 'office'
        })
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Foreman accessed project via PIN
  const handleForemanAccess = async (project, foremanName) => {
    setForemanProject(project)
    setView('foreman')

    // Initialize user context for foreman (for audit trails)
    await initializeUserContext({
      id: 'foreman-' + project.id,
      name: foremanName || 'Foreman',
      email: '',
      role: 'foreman'
    })
  }

  // Office login
  const handleOfficeLogin = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (error) {
        showToast(error.message || 'Invalid credentials', 'error')
        return
      }

      // Get user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*, companies(*)')
        .eq('id', data.user.id)
        .single()

      if (userError) {
        console.error('User fetch error:', userError)
        showToast('Error loading profile', 'error')
        return
      }

      if (userData) {
        setUser(userData)
        setCompany(userData.companies)
        setView('office')

        // Initialize user context for audit trails
        await initializeUserContext({
          id: userData.id,
          name: userData.full_name,
          email: userData.email,
          role: userData.role || 'office'
        })
      } else {
        showToast('Profile not found. Please contact admin.', 'error')
      }
    } catch (err) {
      console.error('Login error:', err)
      showToast('Login failed', 'error')
    }
  }

  const handleLogout = async () => {
    try {
      await auth.signOut()

      // Clear user context
      await clearCurrentUserContext()

      setUser(null)
      setCompany(null)
      setView('entry')
      setActiveTab('dashboard')
    } catch (error) {
      console.error('Logout error:', error)
      showToast('Error signing out', 'error')
    }
  }

  const handleExitForeman = async () => {
    setForemanProject(null)
    setView('entry')

    // Clear user context
    await clearCurrentUserContext()
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

  // Entry screen (Foreman / Office selection)
  if (view === 'entry') {
    return (
      <>
        <AppEntry
          onForemanAccess={handleForemanAccess}
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

  // Foreman View
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

        {/* Offline Indicator for Field Workers */}
        <OfflineIndicator />
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
              className={`nav-tab ${activeTab === 'contracts' ? 'active' : ''}`}
              onClick={() => setActiveTab('contracts')}
            >
              Contracts
            </button>
            <button
              className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
            <button
              className={`nav-tab ${activeTab === 'setup' ? 'active' : ''}`}
              onClick={() => setActiveTab('setup')}
            >
              + New Project
            </button>
          </div>
          <div className="nav-user">
            <ThemeToggle />
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
        {activeTab === 'contracts' && (
          <Contracts onShowToast={showToast} />
        )}
        {activeTab === 'settings' && (
          <Settings
            company={company}
            currentUser={user}
            onShowToast={showToast}
            onCompanyUpdated={checkAuth}
          />
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

      {/* Offline Indicator for Office (optional - shows sync status) */}
      <OfflineIndicator />
    </div>
  )
}


