import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, db } from './supabase'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session
    checkSession()

    // Listen for auth changes
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          await loadUserData(session.user.id)
        } else {
          setUser(null)
          setCompany(null)
          setSubscription(null)
        }
        setLoading(false)
      }
    )

    return () => {
      authSubscription?.unsubscribe()
    }
  }, [])

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await loadUserData(session.user.id)
      }
    } catch (error) {
      console.error('Session check error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUserData = async (userId) => {
    try {
      // Get user with company
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          *,
          companies (*)
        `)
        .eq('id', userId)
        .single()

      if (userError) throw userError

      setUser(userData)
      setCompany(userData.companies)

      // Get subscription
      if (userData.company_id) {
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*, promo_codes(*)')
          .eq('company_id', userData.company_id)
          .single()

        setSubscription(subData)
      }
    } catch (error) {
      console.error('Error loading user data:', error)
    }
  }

  // Sign up new company
  const signUpCompany = async ({ email, password, name, companyName, promoCode }) => {
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password
      })

      if (authError) throw authError

      // 2. Check promo code if provided
      let promoData = null
      if (promoCode) {
        const { data: promo, error: promoError } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('code', promoCode.toUpperCase())
          .eq('is_active', true)
          .single()

        if (promoError || !promo) {
          throw new Error('Invalid promo code')
        }

        // Check if expired
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
          throw new Error('Promo code has expired')
        }

        // Check max uses
        if (promo.max_uses && promo.times_used >= promo.max_uses) {
          throw new Error('Promo code has reached maximum uses')
        }

        promoData = promo
      }

      // 3. Generate company code
      const companyCode = Math.random().toString(36).substring(2, 8).toUpperCase()

      // 4. Create company
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyName,
          code: companyCode
        })
        .select()
        .single()

      if (companyError) throw companyError

      // 5. Create user record
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          name,
          company_id: companyData.id,
          role: 'owner',
          password_hash: 'managed_by_supabase_auth'
        })
        .select()
        .single()

      if (userError) throw userError

      // 6. Update company with owner
      await supabase
        .from('companies')
        .update({ owner_user_id: userData.id })
        .eq('id', companyData.id)

      // 7. Create subscription
      let tier = 'free'
      if (promoData) {
        if (promoData.type === 'lifetime_free' || promoData.tier_override) {
          tier = promoData.tier_override || 'enterprise'
        }
      }

      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          company_id: companyData.id,
          tier,
          status: 'active',
          promo_code_id: promoData?.id
        })

      if (subError) throw subError

      // 8. Increment promo code usage
      if (promoData) {
        await supabase
          .from('promo_codes')
          .update({ times_used: promoData.times_used + 1 })
          .eq('id', promoData.id)
      }

      // 9. Initialize usage tracking
      await supabase
        .from('usage_monthly')
        .insert({
          company_id: companyData.id,
          month: new Date().toISOString().slice(0, 8) + '01'
        })

      return { user: userData, company: companyData }
    } catch (error) {
      console.error('Signup error:', error)
      throw error
    }
  }

  // Join existing company - supports both new users and existing users joining additional companies
  const joinCompany = async ({ email, password, name, companyCode }) => {
    try {
      const normalizedEmail = email.toLowerCase().trim()

      // 1. Find company by code
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('code', companyCode.toUpperCase())
        .single()

      if (companyError || !companyData) {
        throw new Error('Invalid company code')
      }

      // 2. Check user limit
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('tier')
        .eq('company_id', companyData.id)
        .single()

      const { data: limits } = await supabase
        .from('subscription_limits')
        .select('max_users')
        .eq('tier', subData?.tier || 'free')
        .single()

      const { count: userCount } = await supabase
        .from('user_companies')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyData.id)

      if (limits?.max_users !== -1 && userCount >= limits?.max_users) {
        throw new Error('Company has reached maximum users for their plan')
      }

      // 3. Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', normalizedEmail)
        .maybeSingle()

      let userId
      let userData

      if (existingUser) {
        // EXISTING USER - verify password and add to new company
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        })

        if (signInError) {
          throw new Error('Account exists with this email. Enter correct password to join.')
        }

        userId = authData.user.id

        // Check if already in this company (any status)
        const { data: existingMembership } = await supabase
          .from('user_companies')
          .select('id, status')
          .eq('user_id', userId)
          .eq('company_id', companyData.id)
          .maybeSingle()

        if (existingMembership) {
          if (existingMembership.status === 'active') {
            throw new Error('You already belong to this company')
          } else if (existingMembership.status === 'pending') {
            throw new Error('Your request is still pending approval')
          } else {
            throw new Error('Your membership was removed. Contact the company admin.')
          }
        }

        // Add to user_companies with PENDING status
        await supabase
          .from('user_companies')
          .insert({
            user_id: userId,
            company_id: companyData.id,
            role: 'member',
            status: 'pending'
          })

        userData = existingUser

      } else {
        // NEW USER - create auth account and user record
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password
        })

        if (authError) throw authError

        userId = authData.user.id

        // Create user record
        const { data: newUserData, error: userError } = await supabase
          .from('users')
          .insert({
            id: userId,
            email: normalizedEmail,
            name,
            company_id: companyData.id,
            role: 'member',
            password_hash: 'managed_by_supabase_auth'
          })
          .select()
          .single()

        if (userError) throw userError

        userData = newUserData

        // Add to user_companies junction table with PENDING status
        await supabase
          .from('user_companies')
          .insert({
            user_id: userId,
            company_id: companyData.id,
            role: 'member',
            status: 'pending'
          })
      }

      return { user: userData, company: companyData }
    } catch (error) {
      console.error('Join error:', error)
      throw error
    }
  }

  // Sign in
  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) throw error

    await loadUserData(data.user.id)
    return data
  }

  // Sign out
  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setCompany(null)
    setSubscription(null)
  }

  // Check subscription limits
  const checkLimit = async (limitType) => {
    if (!company || !subscription) return { allowed: false, reason: 'No subscription' }

    const { data: limits } = await supabase
      .from('subscription_limits')
      .select('*')
      .eq('tier', subscription.tier)
      .single()

    if (!limits) return { allowed: false, reason: 'Unknown tier' }

    const { data: usage } = await supabase
      .from('usage_monthly')
      .select('*')
      .eq('company_id', company.id)
      .eq('month', new Date().toISOString().slice(0, 8) + '01')
      .single()

    switch (limitType) {
      case 'projects':
        if (limits.max_projects === -1) return { allowed: true }
        return {
          allowed: (usage?.projects_count || 0) < limits.max_projects,
          current: usage?.projects_count || 0,
          max: limits.max_projects,
          reason: 'Project limit reached'
        }

      case 'tickets':
        if (limits.max_tickets_per_month === -1) return { allowed: true }
        return {
          allowed: (usage?.tickets_count || 0) < limits.max_tickets_per_month,
          current: usage?.tickets_count || 0,
          max: limits.max_tickets_per_month,
          reason: 'Monthly ticket limit reached'
        }

      case 'storage':
        if (limits.max_storage_bytes === -1) return { allowed: true }
        return {
          allowed: (usage?.storage_bytes || 0) < limits.max_storage_bytes,
          current: usage?.storage_bytes || 0,
          max: limits.max_storage_bytes,
          reason: 'Storage limit reached'
        }

      case 'users':
        if (limits.max_users === -1) return { allowed: true }
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id)
        return {
          allowed: count < limits.max_users,
          current: count,
          max: limits.max_users,
          reason: 'User limit reached'
        }

      default:
        return { allowed: true }
    }
  }

  // Check feature access
  const hasFeature = (feature) => {
    if (!subscription) return false

    const features = {
      free: { excel_export: false, api_access: false, priority_support: false, custom_branding: false },
      pro: { excel_export: true, api_access: false, priority_support: false, custom_branding: false },
      business: { excel_export: true, api_access: true, priority_support: true, custom_branding: true }
    }

    return features[subscription.tier]?.[feature] || false
  }

  const value = {
    user,
    company,
    subscription,
    loading,
    signUpCompany,
    joinCompany,
    signIn,
    signOut,
    checkLimit,
    hasFeature,
    refreshUser: () => loadUserData(user?.id)
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

