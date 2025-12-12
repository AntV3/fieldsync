import { useState, useEffect } from 'react'
import { isSupabaseConfigured, auth, supabase } from './lib/supabase'
import AppEntry from './components/AppEntry'
import ForemanView from './components/ForemanView'
import Dashboard from './components/Dashboard'
import Field from './components/Field'
import Setup from './components/Setup'
import Toast from './components/Toast'
import NotificationBell from './components/NotificationBell'
import NotificationDropdown from './components/NotificationDropdown'
import NotificationSettings from './components/NotificationSettings'

export default function App() {
  const [view, setView] = useState('entry') // 'entry', 'foreman', 'office'
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [foremanProject, setForemanProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [companyUsers, setCompanyUsers] = useState([])

  useEffect(() => {
    checkAuth()
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

  const loadCompanyUsers = async () => {
    if (!company?.id) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('company_id', company.id)

      if (!error && data) {
        setCompanyUsers(data.map(u => ({
          id: u.id,
          name: u.full_name,
          email: u.email
        })))
      }
    } catch (error) {
      console.error('Error loading company users:', error)
    }
  }

  const showToast = (message, type = '') => {
    setToast({ message, type })
  }

  const handleProjectCreated = () => {
    setActiveTab('dashboard')
  }

  const handleNotificationNavigate = (link) => {
    // Navigate to the linked page
    // For now, just close the dropdown
    // TODO: implement routing based on link_to
    setNotificationsOpen(false)
  }

  // Load company users when company is set
  useEffect(() => {
    if (company?.id) {
      loadCompanyUsers()
    }
  }, [company])

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
            <button
              className={`nav-tab ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              Settings
            </button>
          </div>
          <div className="nav-user">
            <div style={{ position: 'relative' }}>
              <NotificationBell
                userId={user?.id}
                onOpenNotifications={() => setNotificationsOpen(!notificationsOpen)}
              />
              <NotificationDropdown
                userId={user?.id}
                isOpen={notificationsOpen}
                onClose={() => setNotificationsOpen(false)}
                onNavigate={handleNotificationNavigate}
              />
            </div>
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
        {activeTab === 'notifications' && (
          <NotificationSettings
            companyId={company?.id}
            companyUsers={companyUsers}
            onClose={() => setActiveTab('dashboard')}
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


