import { useState, useEffect } from 'react'
import { isSupabaseConfigured, auth, supabase } from './lib/supabase'
import AppEntry from './components/AppEntry'
import ForemanView from './components/ForemanView'
import Dashboard from './components/Dashboard'
import Field from './components/Field'
import Setup from './components/Setup'
import Toast from './components/Toast'

export default function App() {
  const [view, setView] = useState('entry') // 'entry', 'foreman', 'office'
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
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
      if (profile && profile.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('*')
          .eq('id', profile.company_id)
          .single()
        
        setUser(profile)
        setCompany(companyData)
        setView('office')
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Foreman accessed project via PIN
  const handleForemanAccess = (project) => {
    setForemanProject(project)
    setView('foreman')
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
      setUser(null)
      setCompany(null)
      setView('entry')
      setActiveTab('dashboard')
    } catch (error) {
      console.error('Logout error:', error)
      showToast('Error signing out', 'error')
    }
  }

  const handleExitForeman = () => {
    setForemanProject(null)
    setView('entry')
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


