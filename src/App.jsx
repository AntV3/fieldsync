import { useState, useEffect } from 'react'
import { isSupabaseConfigured, auth, supabase } from './lib/supabase'
import { BrandingProvider } from './lib/BrandingContext'
import AppEntry from './components/AppEntry'
import ForemanView from './components/ForemanView'
import Dashboard from './components/Dashboard'
import Field from './components/Field'
import Setup from './components/Setup'
import BrandingSettings from './components/BrandingSettings'
import PublicView from './components/PublicView'
import Toast from './components/Toast'
import Logo from './components/Logo'

export default function App() {
  const [view, setView] = useState('entry') // 'entry', 'foreman', 'office', 'public'
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [foremanProject, setForemanProject] = useState(null)
  const [shareToken, setShareToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    // Check if this is a public share link
    const path = window.location.pathname
    const shareMatch = path.match(/^\/view\/([a-zA-Z0-9]+)$/)

    if (shareMatch) {
      setShareToken(shareMatch[1])
      setView('public')
      setLoading(false)
    } else {
      checkAuth()
    }
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

  const showToast = (message, type = '') => {
    setToast({ message, type })
  }

  const handleProjectCreated = () => {
    setActiveTab('dashboard')
  }

  // Loading screen
  if (loading) {
    return (
      <BrandingProvider companyId={company?.id}>
        <div className="loading-screen">
          <Logo className="loading-logo" />
          <div className="spinner"></div>
        </div>
      </BrandingProvider>
    )
  }

  // Entry screen (Foreman / Office selection)
  if (view === 'entry') {
    return (
      <BrandingProvider>
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
      </BrandingProvider>
    )
  }

  // Public View (Share Link - No Authentication Required)
  if (view === 'public' && shareToken) {
    return (
      <BrandingProvider>
        <PublicView shareToken={shareToken} />
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </BrandingProvider>
    )
  }

  // Foreman View
  if (view === 'foreman' && foremanProject) {
    return (
      <BrandingProvider companyId={foremanProject.company_id}>
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
      </BrandingProvider>
    )
  }

  // Office View (full dashboard)
  return (
    <BrandingProvider companyId={company?.id}>
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
            <Logo />
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
                className={`nav-tab ${activeTab === 'branding' ? 'active' : ''}`}
                onClick={() => setActiveTab('branding')}
              >
                Branding
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
          {activeTab === 'branding' && (
            <BrandingSettings
              company={company}
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
    </BrandingProvider>
  )
}


