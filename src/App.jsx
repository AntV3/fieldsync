import { useState, useEffect } from 'react'
import { isSupabaseConfigured, auth, supabase, db } from './lib/supabase'
import { BrandingProvider } from './lib/BrandingContext'
import AppEntry from './components/AppEntry'
import ForemanView from './components/ForemanView'
import Dashboard from './components/Dashboard'
import Field from './components/Field'
import Setup from './components/Setup'
import BrandingSettings from './components/BrandingSettings'
import MaterialsManager from './components/MaterialsManager'
import PublicView from './components/PublicView'
import Toast from './components/Toast'
import Logo from './components/Logo'

export default function App() {
  const [view, setView] = useState('entry') // 'entry', 'foreman', 'office', 'public'
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [userCompanies, setUserCompanies] = useState([]) // All companies user can access
  const [foremanProject, setForemanProject] = useState(null)
  const [shareToken, setShareToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false)

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

      // Get user record
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (userData) {
        setUser(userData)

        // Fetch all companies user has access to
        const companies = await db.getUserCompanies(user.id)
        setUserCompanies(companies)

        // Use saved company or first available
        const savedCompanyId = localStorage.getItem('selectedCompanyId')
        let selectedCompany = null

        if (savedCompanyId && companies.find(c => c.id === savedCompanyId)) {
          selectedCompany = companies.find(c => c.id === savedCompanyId)
        } else if (companies.length > 0) {
          selectedCompany = companies[0]
        } else if (userData.company_id) {
          // Fallback to user's default company
          const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', userData.company_id)
            .single()
          selectedCompany = companyData
        }

        if (selectedCompany) {
          // Fetch full company data
          const { data: fullCompany } = await supabase
            .from('companies')
            .select('*')
            .eq('id', selectedCompany.id)
            .single()

          setCompany(fullCompany)
          setView('office')
        }
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
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (userError) {
        console.error('User fetch error:', userError)
        showToast('Error loading profile', 'error')
        return
      }

      if (userData) {
        setUser(userData)

        // Fetch all companies user has access to
        const companies = await db.getUserCompanies(data.user.id)
        setUserCompanies(companies)

        // Use saved company or first available
        const savedCompanyId = localStorage.getItem('selectedCompanyId')
        let selectedCompany = null

        if (savedCompanyId && companies.find(c => c.id === savedCompanyId)) {
          selectedCompany = companies.find(c => c.id === savedCompanyId)
        } else if (companies.length > 0) {
          selectedCompany = companies[0]
        } else if (userData.company_id) {
          // Fallback to user's default company
          const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', userData.company_id)
            .single()
          selectedCompany = companyData
        }

        if (selectedCompany) {
          // Fetch full company data
          const { data: fullCompany } = await supabase
            .from('companies')
            .select('*')
            .eq('id', selectedCompany.id)
            .single()

          setCompany(fullCompany)
          setView('office')
        } else {
          showToast('No company access. Please contact admin.', 'error')
        }
      } else {
        showToast('Profile not found. Please contact admin.', 'error')
      }
    } catch (err) {
      console.error('Login error:', err)
      showToast('Login failed', 'error')
    }
  }

  // Switch company
  const handleSwitchCompany = async (companyId) => {
    try {
      const { data: fullCompany } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single()

      if (fullCompany) {
        setCompany(fullCompany)
        localStorage.setItem('selectedCompanyId', companyId)
        setShowCompanySwitcher(false)
        setActiveTab('dashboard') // Reset to dashboard when switching
        showToast(`Switched to ${fullCompany.name}`, 'success')
      }
    } catch (err) {
      console.error('Switch company error:', err)
      showToast('Error switching company', 'error')
    }
  }

  const handleLogout = async () => {
    try {
      await auth.signOut()
      setUser(null)
      setCompany(null)
      setUserCompanies([])
      setView('entry')
      setActiveTab('dashboard')
      localStorage.removeItem('selectedCompanyId')
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
                className={`nav-tab ${activeTab === 'pricing' ? 'active' : ''}`}
                onClick={() => setActiveTab('pricing')}
              >
                Pricing
              </button>
              <button
                className={`nav-tab ${activeTab === 'branding' ? 'active' : ''}`}
                onClick={() => setActiveTab('branding')}
              >
                Branding
              </button>
            </div>
            <div className="nav-user">
              {/* Company Switcher */}
              {userCompanies.length > 1 && (
                <div className="company-switcher">
                  <button
                    className="company-switcher-btn"
                    onClick={() => setShowCompanySwitcher(!showCompanySwitcher)}
                  >
                    {company?.name || 'Select Company'}
                    <span className="switcher-arrow">▼</span>
                  </button>
                  {showCompanySwitcher && (
                    <div className="company-dropdown">
                      {userCompanies.map(c => (
                        <button
                          key={c.id}
                          className={`company-option ${c.id === company?.id ? 'active' : ''}`}
                          onClick={() => handleSwitchCompany(c.id)}
                        >
                          {c.name}
                          {c.id === company?.id && <span className="check">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {userCompanies.length <= 1 && company && (
                <span className="nav-company-name">{company.name}</span>
              )}
              <span className="nav-user-name">{user?.name || user?.email}</span>
              <button className="nav-logout" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <div className="container" key={company?.id}>
          {activeTab === 'dashboard' && (
            <Dashboard company={company} onShowToast={showToast} />
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
          {activeTab === 'pricing' && (
            <MaterialsManager
              company={company}
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


