import { useState, useEffect, useCallback, useRef } from 'react'
import { isSupabaseConfigured, auth, supabase, db, clearFieldSession } from '../lib/supabase'

/**
 * useAuthState - Centralized auth state management.
 *
 * Consolidates the duplicated auth logic that was previously spread across
 * checkAuth() and handleOfficeLogin() in App.jsx.
 */
export default function useAuthState({ navigate, locationPathname, showToast }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [userCompanies, setUserCompanies] = useState([])
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mfaPending, setMfaPending] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState(null)
  const [pendingCompanyName, setPendingCompanyName] = useState('')
  const [foremanProject, setForemanProject] = useState(null)
  const [foremanName, setForemanName] = useState('')

  const loginInProgressRef = useRef(false)
  const checkInProgressRef = useRef(false)

  // Shared logic: load user profile, companies, and select active company
  const loadUserAndCompany = useCallback(async (authUserId) => {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .single()

    if (userError || !userData) return null

    setUser(userData)

    let companies = await db.getUserCompanies(authUserId)

    if (companies.length === 0 && userData.company_id) {
      const repaired = await db.repairLegacyUser(
        authUserId, userData.company_id, userData.role || 'member'
      )
      if (repaired) {
        companies = await db.getUserCompanies(authUserId)
      }
    }

    setUserCompanies(companies)

    if (companies.length === 0) {
      const pendingCount = await db.getUserPendingMemberships(authUserId)
      if (pendingCount > 0) {
        try {
          const { data: pendingMemberships } = await supabase
            .from('user_companies')
            .select('company_id, companies(name)')
            .eq('user_id', authUserId)
            .eq('status', 'pending')
            .limit(1)
          if (pendingMemberships?.[0]?.companies?.name) {
            setPendingCompanyName(pendingMemberships[0].companies.name)
          }
        } catch (_e) {
          // Non-critical
        }
        return { pending: true }
      }
      return { noAccess: true }
    }

    // Select saved or first company
    const savedCompanyId = localStorage.getItem('selectedCompanyId')
    let selectedCompany = null
    if (savedCompanyId && companies.find(c => c.id === savedCompanyId)) {
      selectedCompany = companies.find(c => c.id === savedCompanyId)
    } else if (companies.length > 0) {
      selectedCompany = companies[0]
    }

    if (!selectedCompany) return { noAccess: true }

    // If getUserCompanies already returned full company data, use it directly
    // to avoid a redundant query
    const fullCompany = selectedCompany.name && selectedCompany.id
      ? selectedCompany
      : await supabase
          .from('companies')
          .select('*')
          .eq('id', selectedCompany.id)
          .single()
          .then(res => res.data)

    setCompany(fullCompany)
    setAuthReady(true)

    return { company: fullCompany, userData }
  }, [])

  // checkAuth: called on mount and auth state changes
  const checkAuth = useCallback(async () => {
    // Prevent concurrent auth checks (avoids duplicate 406 requests from stale tokens)
    if (checkInProgressRef.current) return
    checkInProgressRef.current = true

    try {
      if (!isSupabaseConfigured) {
        setLoading(false)
        return
      }

      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser?.id) {
        // If there's an auth error (e.g., invalid refresh token), clean up the stale session
        if (authError) {
          console.warn('[auth] Session invalid, clearing:', authError.message)
          await supabase.auth.signOut({ scope: 'local' })
        }
        setLoading(false)
        return
      }

      const result = await loadUserAndCompany(authUser.id)
      if (!result) return

      if (result.pending) {
        navigate('/pending', { replace: true })
        return
      }

      if (result.noAccess) {
        showToast('No company access. Join a company to continue.', 'error')
        await auth.signOut()
        return
      }

      // Navigate to dashboard if on login/root (preserve existing office routes)
      const isPublicRoute = locationPathname.startsWith('/view/') || locationPathname.startsWith('/sign/')
      const isOfficeRoute = ['/dashboard', '/projects/new', '/pricing', '/branding', '/team', '/account'].includes(locationPathname)
      if (!isPublicRoute && !isOfficeRoute && locationPathname !== '/field') {
        navigate('/dashboard', { replace: true })
      }
    } catch (error) {
      console.error('Auth check error:', error)
    } finally {
      setLoading(false)
      checkInProgressRef.current = false
    }
  }, [navigate, locationPathname, loadUserAndCompany, showToast])

  // handleOfficeLogin: called from OfficeLogin component
  const handleOfficeLogin = useCallback(async (email, password) => {
    loginInProgressRef.current = true
    try {
      await clearFieldSession()
      localStorage.setItem('fieldsync-has-visited', 'true')
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        showToast(error.message || 'Invalid credentials', 'error')
        return
      }

      if (!data?.user?.id) {
        showToast('Login failed — no user returned', 'error')
        return
      }

      const result = await loadUserAndCompany(data.user.id)

      if (!result) {
        showToast('Profile not found. Please contact admin.', 'error')
        return
      }

      if (result.pending) {
        navigate('/pending')
        return
      }

      if (result.noAccess) {
        showToast('No company access. Please contact admin.', 'error')
        return
      }

      // Check MFA
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verifiedFactor = factors?.totp?.find(f => f.status === 'verified')
      if (verifiedFactor) {
        setMfaFactorId(verifiedFactor.id)
        setMfaPending(true)
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      console.error('Login error:', err)
      showToast('Login failed', 'error')
    } finally {
      loginInProgressRef.current = false
    }
  }, [navigate, loadUserAndCompany, showToast])

  // Initial auth check
  useEffect(() => {
    const path = locationPathname
    if (path.startsWith('/view/') || path.startsWith('/sign/')) {
      setLoading(false)
    } else {
      checkAuth()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for auth state changes
  useEffect(() => {
    if (!isSupabaseConfigured) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          const path = locationPathname
          if (path.startsWith('/sign/') || path.startsWith('/view/')) return
          setUser(null)
          setCompany(null)
          setUserCompanies([])
          setAuthReady(false)
          navigate('/login', { replace: true })
        } else if (event === 'TOKEN_REFRESHED' && !session) {
          // Refresh token was invalid/expired — force sign out
          console.warn('[auth] Token refresh failed, signing out')
          await auth.signOut()
          setUser(null)
          setCompany(null)
          setUserCompanies([])
          setAuthReady(false)
          navigate('/login', { replace: true })
        } else if (event === 'SIGNED_IN' && !user && !loginInProgressRef.current) {
          const path = locationPathname
          if (!path.startsWith('/sign/') && !path.startsWith('/view/')) {
            checkAuth()
          }
        }
      }
    )

    return () => { subscription?.unsubscribe() }
  }, [user, checkAuth, navigate, locationPathname])

  const handleSwitchCompany = useCallback(async (companyId) => {
    try {
      const { data: fullCompany } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single()

      if (fullCompany) {
        setCompany(fullCompany)
        localStorage.setItem('selectedCompanyId', companyId)
        navigate('/dashboard')
        showToast(`Switched to ${fullCompany.name}`, 'success')
      }
    } catch (err) {
      console.error('Switch company error:', err)
      showToast('Error switching company', 'error')
    }
  }, [navigate, showToast])

  const handleLogout = useCallback(async () => {
    try {
      await auth.signOut()
      setUser(null)
      setCompany(null)
      setUserCompanies([])
      setAuthReady(false)
      localStorage.removeItem('selectedCompanyId')
      navigate('/login')
    } catch (error) {
      console.error('Logout error:', error)
      showToast('Error signing out', 'error')
    }
  }, [navigate, showToast])

  const handleForemanAccess = useCallback((project, name = '') => {
    localStorage.setItem('fieldsync-has-visited', 'true')
    setForemanProject(project)
    setForemanName(name)
    navigate('/field')
  }, [navigate])

  const handleExitForeman = useCallback(async () => {
    await clearFieldSession()
    setForemanProject(null)
    setForemanName('')
    navigate('/login')
  }, [navigate])

  const handleMfaVerified = useCallback(() => {
    setMfaPending(false)
    navigate('/dashboard')
  }, [navigate])

  const handleMfaCancel = useCallback(async () => {
    setMfaPending(false)
    setMfaFactorId(null)
    await auth.signOut()
    setUser(null)
    setCompany(null)
    setUserCompanies([])
    setAuthReady(false)
    navigate('/login')
  }, [navigate])

  return {
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
  }
}
