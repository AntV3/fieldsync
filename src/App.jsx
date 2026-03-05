import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import { isSupabaseConfigured, db } from './lib/supabase'
import { BrandingProvider } from './lib/BrandingContext'
import { ThemeProvider } from './lib/ThemeContext'
import { useToast } from './lib/ToastContext'
import useAuthState from './hooks/useAuthState'
import LoginChooser from './components/auth/LoginChooser'
import FieldLogin from './components/auth/FieldLogin'
import OfficeLogin from './components/auth/OfficeLogin'
import JoinCompany from './components/auth/JoinCompany'
import RegisterCompany from './components/auth/RegisterCompany'
import Logo from './components/Logo'
import ThemeToggle from './components/ThemeToggle'
import ErrorBoundary from './components/ErrorBoundary'
import OfflineIndicator from './components/OfflineIndicator'
import InstallPrompt from './components/InstallPrompt'
import MFAChallenge from './components/MFAChallenge'
// ForemanView imported directly to avoid lazy loading bundling issues
import ForemanView from './components/ForemanView'

// Lazy load large components for code splitting
const Dashboard = lazy(() => import('./components/Dashboard'))
const Setup = lazy(() => import('./components/Setup'))
const BrandingSettings = lazy(() => import('./components/BrandingSettings'))
const PricingManager = lazy(() => import('./components/PricingManager'))
const PublicView = lazy(() => import('./components/PublicView'))
const SignaturePage = lazy(() => import('./components/SignaturePage'))
const MembershipManager = lazy(() => import('./components/MembershipManager'))
const LandingPage = lazy(() => import('./components/landing/LandingPage'))

// Loading fallback component
function PageLoader() {
  return (
    <div className="page-loader">
      <Logo className="loading-logo" />
      <div className="spinner"></div>
    </div>
  )
}

// Pending approval screen with auto-polling
function PendingApprovalScreen({ pendingCompanyName, userName, onCheckStatus, onLogout }) {
  const [checking, setChecking] = useState(false)

  // Auto-check status every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      onCheckStatus()
    }, 30000)
    return () => clearInterval(interval)
  }, [onCheckStatus])

  const handleManualCheck = async () => {
    setChecking(true)
    await onCheckStatus()
    setTimeout(() => setChecking(false), 1000)
  }

  return (
    <div className="pending-approval-screen">
      <Logo className="pending-logo" />
      <div className="pending-pulse-ring">
        <div className="pending-pulse-dot" />
      </div>
      <h2>Awaiting Approval</h2>
      {pendingCompanyName && (
        <div className="pending-company-name">{pendingCompanyName}</div>
      )}
      <p className="pending-message">
        {userName ? `Hi ${userName.split(' ')[0]}, your` : 'Your'} membership request has been submitted.
        A company administrator will review and approve your access.
      </p>
      <p className="pending-auto-check">We'll automatically check for updates</p>
      <div className="pending-actions">
        <button className="btn btn-secondary" onClick={onLogout}>Sign Out</button>
        <button className="btn btn-primary" onClick={handleManualCheck} disabled={checking}>
          {checking ? 'Checking...' : 'Check Status'}
        </button>
      </div>
    </div>
  )
}

// Wrapper for public view that reads token from URL params
function PublicViewRoute() {
  const { token } = useParams()
  return (
    <Suspense fallback={<PageLoader />}>
      <PublicView shareToken={token} />
    </Suspense>
  )
}

// Wrapper for signature page that reads token from URL params
function SignatureRoute() {
  const { token } = useParams()
  return (
    <Suspense fallback={<PageLoader />}>
      <SignaturePage signatureToken={token} />
    </Suspense>
  )
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()

  const {
    user,
    company,
    userCompanies,
    authReady,
    loading,
    mfaPending,
    mfaFactorId,
    pendingCompanyName,
    foremanProject,
    foremanName,
    checkAuth,
    handleOfficeLogin,
    handleSwitchCompany,
    handleLogout,
    handleForemanAccess,
    handleExitForeman,
    handleMfaVerified,
    handleMfaCancel,
  } = useAuthState({ navigate, locationPathname: location.pathname, showToast })

  const [, setProjects] = useState([])
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [navigateToProjectId, setNavigateToProjectId] = useState(null)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)

  const handleProjectCreated = () => {
    navigate('/dashboard')
    if (company?.id) loadProjects()
  }

  const loadProjects = async () => {
    if (!company?.id) return
    try {
      const projectList = await db.getProjects(company.id)
      setProjects(projectList)
    } catch (error) {
      console.error('Error loading projects:', error)
    }
  }

  useEffect(() => {
    if (company?.id && authReady) {
      loadProjects()
      loadPendingRequestCount()
    }
  }, [company?.id, authReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPendingRequestCount = async () => {
    if (!company?.id) return
    try {
      const memberships = await db.getCompanyMemberships(company.id)
      const pendingCount = memberships.filter(m => m.status === 'pending').length
      setPendingRequestCount(pendingCount)
    } catch (error) {
      console.error('Error loading pending count:', error)
    }
  }

  const handleProjectNavigated = useCallback(() => {
    setNavigateToProjectId(null)
  }, [])

  // Check admin status
  const currentMembership = userCompanies.find(uc => uc.id === company?.id)
  const accessLevel = currentMembership?.access_level
  const isAdmin = accessLevel === 'administrator' || company?.owner_user_id === user?.id

  // Loading screen
  if (loading) {
    return (
      <ThemeProvider>
        <BrandingProvider companyId={company?.id}>
          <div className="loading-screen">
            <Logo className="loading-logo" />
            <div className="spinner"></div>
          </div>
        </BrandingProvider>
      </ThemeProvider>
    )
  }

  // MFA Challenge screen
  if (mfaPending) {
    return (
      <ThemeProvider>
        <BrandingProvider companyId={company?.id}>
          <ErrorBoundary>
            <MFAChallenge
              factorId={mfaFactorId}
              onVerified={handleMfaVerified}
              onCancel={handleMfaCancel}
            />
          </ErrorBoundary>
        </BrandingProvider>
      </ThemeProvider>
    )
  }

  // Auth guard for office routes
  const requireAuth = (element) => {
    if (!user || !company || !authReady) return <Navigate to="/login" replace />
    return element
  }

  // Auth redirect for login routes (redirect if already authenticated)
  const guestOnly = (element) => {
    if (user && company && authReady) return <Navigate to="/dashboard" replace />
    return <ErrorBoundary>{element}</ErrorBoundary>
  }

  // Office layout: nav + content + offline indicator
  const officeLayout = (content) => (
    <div>
      {!isSupabaseConfigured && (
        <div className="demo-banner">Demo Mode - Data saved locally in your browser</div>
      )}

      <nav className="nav">
        <div className="nav-content">
          <Logo />
          <div className="nav-tabs nav-tabs-desktop">
            <button className={`nav-tab ${location.pathname === '/dashboard' ? 'active' : ''}`} onClick={() => navigate('/dashboard')}>Dashboard</button>
            <button className={`nav-tab ${location.pathname === '/projects/new' ? 'active' : ''}`} onClick={() => navigate('/projects/new')}>+ New Project</button>
            <button className={`nav-tab ${location.pathname === '/pricing' ? 'active' : ''}`} onClick={() => navigate('/pricing')}>Pricing</button>
            {isAdmin && (
              <button className={`nav-tab ${location.pathname === '/branding' ? 'active' : ''}`} onClick={() => navigate('/branding')}>Branding</button>
            )}
            {isAdmin && (
              <button className={`nav-tab ${location.pathname === '/team' ? 'active' : ''}`} onClick={() => navigate('/team')}>
                Team
                {pendingRequestCount > 0 && <span className="nav-tab-badge">{pendingRequestCount}</span>}
              </button>
            )}
          </div>
          <div className="nav-user nav-user-desktop">
            <ThemeToggle compact />
            <div className="mobile-menu">
              <button className="mobile-menu-btn" onClick={() => setShowMobileMenu(!showMobileMenu)} aria-label="User menu">&#x22EE;</button>
              {showMobileMenu && (
                <div className="mobile-menu-dropdown">
                  <div className="mobile-menu-info">
                    <div className="mobile-menu-user">{user?.name || user?.email}</div>
                    {company && <div className="mobile-menu-company">{company.name}</div>}
                  </div>
                  <button className="mobile-menu-logout" onClick={() => { setShowMobileMenu(false); handleLogout() }}>Sign Out</button>
                </div>
              )}
            </div>
            {userCompanies.length > 1 && (
              <div className="company-switcher">
                <button className="company-switcher-btn" onClick={() => setShowCompanySwitcher(!showCompanySwitcher)}>
                  {company?.name || 'Select Company'}
                  <span className="switcher-arrow">&#x25BC;</span>
                </button>
                {showCompanySwitcher && (
                  <div className="company-dropdown">
                    {userCompanies.map(c => (
                      <button key={c.id} className={`company-option ${c.id === company?.id ? 'active' : ''}`} onClick={() => { handleSwitchCompany(c.id); setShowCompanySwitcher(false) }}>
                        {c.name}
                        {c.id === company?.id && <span className="check">&#x2713;</span>}
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
            <button className="nav-logout" onClick={handleLogout}>Sign Out</button>
          </div>
          <button className="mobile-menu-btn" onClick={() => setShowMobileMenu(true)} aria-label="Open menu">
            <span className="hamburger-icon"><span></span><span></span><span></span></span>
          </button>
        </div>
      </nav>

      {showMobileMenu && (
        <div className="mobile-drawer-overlay" onClick={() => setShowMobileMenu(false)}>
          <div className="mobile-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <Logo />
              <button className="mobile-drawer-close" onClick={() => setShowMobileMenu(false)} aria-label="Close menu">&#x2715;</button>
            </div>
            <div className="mobile-drawer-user">
              <div className="mobile-user-avatar">{(user?.name || user?.email || 'U')[0].toUpperCase()}</div>
              <div className="mobile-user-info">
                <span className="mobile-user-name">{user?.name || user?.email}</span>
                <span className="mobile-user-company">{company?.name}</span>
              </div>
            </div>
            {userCompanies.length > 1 && (
              <div className="mobile-drawer-section">
                <div className="mobile-section-title">Switch Company</div>
                <div className="mobile-company-list">
                  {userCompanies.map(c => (
                    <button key={c.id} className={`mobile-company-option ${c.id === company?.id ? 'active' : ''}`} onClick={() => { handleSwitchCompany(c.id); setShowMobileMenu(false) }}>
                      <span className="mobile-company-name">{c.name}</span>
                      {c.id === company?.id && <span className="mobile-company-check">&#x2713;</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mobile-drawer-section">
              <div className="mobile-section-title">Navigation</div>
              <div className="mobile-nav-list">
                <button className={`mobile-nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`} onClick={() => { navigate('/dashboard'); setShowMobileMenu(false) }}>Dashboard</button>
                <button className={`mobile-nav-item ${location.pathname === '/projects/new' ? 'active' : ''}`} onClick={() => { navigate('/projects/new'); setShowMobileMenu(false) }}>+ New Project</button>
                <button className={`mobile-nav-item ${location.pathname === '/pricing' ? 'active' : ''}`} onClick={() => { navigate('/pricing'); setShowMobileMenu(false) }}>Pricing</button>
                {isAdmin && (
                  <button className={`mobile-nav-item ${location.pathname === '/branding' ? 'active' : ''}`} onClick={() => { navigate('/branding'); setShowMobileMenu(false) }}>Branding</button>
                )}
                {isAdmin && (
                  <button className={`mobile-nav-item ${location.pathname === '/team' ? 'active' : ''}`} onClick={() => { navigate('/team'); setShowMobileMenu(false) }}>
                    Team
                    {pendingRequestCount > 0 && <span className="mobile-nav-badge">{pendingRequestCount}</span>}
                  </button>
                )}
              </div>
            </div>
            <div className="mobile-drawer-section">
              <div className="mobile-section-title">Appearance</div>
              <div className="mobile-theme-toggle"><ThemeToggle /></div>
            </div>
            <div className="mobile-drawer-footer">
              <button className="mobile-logout-btn" onClick={() => { handleLogout(); setShowMobileMenu(false) }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}

      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <div className="container" key={company?.id}>
            {content}
          </div>
        </Suspense>
      </ErrorBoundary>

      <OfflineIndicator />
      <InstallPrompt />
    </div>
  )

  return (
    <ThemeProvider>
      <BrandingProvider companyId={company?.id}>
        <Routes>
          {/* Public routes - no auth required */}
          <Route path="/view/:token" element={
            <ErrorBoundary><PublicViewRoute /></ErrorBoundary>
          } />
          <Route path="/sign/:token" element={
            <ErrorBoundary><SignatureRoute /></ErrorBoundary>
          } />

          {/* Login / Entry — split into separate routes */}
          <Route path="/login" element={guestOnly(<LoginChooser />)} />
          <Route path="/login/field" element={guestOnly(
            <FieldLogin onForemanAccess={handleForemanAccess} onShowToast={showToast} />
          )} />
          <Route path="/login/office" element={guestOnly(
            <OfficeLogin onOfficeLogin={handleOfficeLogin} onShowToast={showToast} />
          )} />
          <Route path="/login/office/join" element={guestOnly(
            <JoinCompany onShowToast={showToast} />
          )} />
          <Route path="/register" element={guestOnly(
            <RegisterCompany onShowToast={showToast} />
          )} />

          {/* Pending approval */}
          <Route path="/pending" element={
            <ErrorBoundary>
              <PendingApprovalScreen pendingCompanyName={pendingCompanyName} userName={user?.name} onCheckStatus={checkAuth} onLogout={handleLogout} />
            </ErrorBoundary>
          } />

          {/* Foreman / Field view */}
          <Route path="/field" element={
            foremanProject ? (
              <BrandingProvider companyId={foremanProject.company_id}>
                <ErrorBoundary>
                  <ForemanView project={foremanProject} companyId={foremanProject.company_id} foremanName={foremanName} onShowToast={showToast} onExit={handleExitForeman} />
                </ErrorBoundary>
                <OfflineIndicator />
              </BrandingProvider>
            ) : (
              <Navigate to="/login" replace />
            )
          } />

          {/* Office routes - require auth */}
          <Route path="/dashboard" element={requireAuth(officeLayout(
            <Dashboard company={company} user={user} isAdmin={isAdmin} onShowToast={showToast} navigateToProjectId={navigateToProjectId} onProjectNavigated={handleProjectNavigated} />
          ))} />
          <Route path="/projects/new" element={requireAuth(officeLayout(
            <Setup company={company} user={user} onProjectCreated={handleProjectCreated} onShowToast={showToast} />
          ))} />
          <Route path="/pricing" element={requireAuth(officeLayout(
            <PricingManager company={company} onShowToast={showToast} />
          ))} />
          <Route path="/branding" element={requireAuth(officeLayout(
            <BrandingSettings company={company} onShowToast={showToast} />
          ))} />
          <Route path="/team" element={requireAuth(
            isAdmin
              ? officeLayout(<MembershipManager company={company} user={user} onShowToast={showToast} />)
              : <Navigate to="/dashboard" replace />
          )} />

          {/* Root — Landing page for new visitors, fast-track for returning users */}
          <Route path="/" element={
            user && company && authReady
              ? <Navigate to="/dashboard" replace />
              : localStorage.getItem('fieldsync-has-visited')
                ? <Navigate to="/login" replace />
                : (
                  <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <LandingPage />
                    </Suspense>
                  </ErrorBoundary>
                )
          } />

          {/* 404 catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrandingProvider>
    </ThemeProvider>
  )
}
