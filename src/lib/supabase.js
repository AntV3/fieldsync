import {
  initOfflineDB,
  getConnectionStatus,
  onConnectionChange,
  cacheProjects,
  getCachedProjects,
  cacheAreas,
  getCachedAreas,
  updateCachedAreaStatus,
  cacheCrewCheckin,
  getCachedCrewCheckin,
  cacheTMTicket,
  getCachedTMTickets,
  generateTempId,
  cacheDailyReport,
  getCachedDailyReport,
  cacheMessage,
  getCachedMessages,
  addPendingAction,
  getPendingActionCount,
  syncPendingActions,
  ACTION_TYPES
} from './offlineManager'
// Import supabase client from separate file to avoid circular dependency with observability
import { supabase, isSupabaseConfigured } from './supabaseClient'
import { observe } from './observability'
// Import field session management from dedicated module
import {
  getFieldSession,
  setFieldSession,
  clearFieldSession,
  getFieldClient,
  getClient,
  getSupabaseClient,
  isFieldMode,
  getFieldProjectId,
  getFieldCompanyId
} from './fieldSession'
import { getLocalData, setLocalData, getLocalUser, setLocalUser } from './localStorageHelpers'
import { corOps } from './corOps'
import { equipmentOps } from './equipmentOps'
import { drawRequestOps } from './drawRequestOps'

// Re-export for other modules
export { supabase, isSupabaseConfigured }
export { clearFieldSession, getSupabaseClient, isFieldMode, getFieldProjectId, getFieldCompanyId }
export { equipmentOps, drawRequestOps }

// Initialize offline database (guard for SSR/test environments)
if (typeof window !== 'undefined') {
  initOfflineDB().catch(err => console.error('Failed to init offline DB:', err))
}

// ============================================
// Security Helpers
// ============================================

// Get or create a device ID for rate limiting
const getDeviceId = () => {
  const key = 'fieldsync_device_id'
  let deviceId = localStorage.getItem(key)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(key, deviceId)
  }
  return deviceId
}

// Simple retry with exponential backoff
const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      // Don't retry on auth errors or validation errors
      if (error.code === 'PGRST301' || error.code === '42501' || error.code === '23514') {
        throw error
      }
      // Wait with exponential backoff
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, i)))
      }
    }
  }
  throw lastError
}

// Input validation helpers
const validateAmount = (amount) => {
  if (amount === null || amount === undefined) return true
  const num = parseFloat(amount)
  return !isNaN(num) && num >= 0 && num < 10000000
}

const validateTextLength = (text, maxLength = 10000) => {
  if (!text) return true
  return text.length <= maxLength
}

const sanitizeText = (text) => {
  if (!text) return text
  // Remove null bytes and trim
  return text.replace(/\0/g, '').trim()
}

// ============================================
// Authentication
// ============================================

export const auth = {
  // Sign up new user
  async signUp(email, password, fullName, role) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: fullName,
            role: role
          }
        }
      })
      if (error) throw error
      return data
    } else {
      // Demo mode - create local user
      const localData = getLocalData()
      const user = {
        id: crypto.randomUUID(),
        email,
        name: fullName,
        role,
        created_at: new Date().toISOString()
      }
      localData.users.push(user)
      setLocalData(localData)
      setLocalUser(user)
      return { user }
    }
  },

  // Sign in existing user
  async signIn(email, password) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error
      return data
    } else {
      // Demo mode - find local user (password check skipped intentionally)
      if (import.meta.env.DEV) {
        console.warn('[auth] Demo mode: password validation is skipped. Do not use demo mode in production.')
      }
      const localData = getLocalData()
      const user = localData.users.find(u => u.email === email)
      if (!user) throw new Error('User not found')
      setLocalUser(user)
      return { user }
    }
  },

  // Sign out
  async signOut() {
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } else {
      setLocalUser(null)
    }
  },

  // Get current user
  async getUser() {
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    } else {
      return getLocalUser()
    }
  },

  // Get user profile with role
  async getProfile() {
    if (isSupabaseConfigured) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (error) {
        // Profile might not exist yet, return basic info
        return {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || '',
          role: user.user_metadata?.role || 'foreman'
        }
      }
      return data
    } else {
      return getLocalUser()
    }
  },

  // Update user role
  async updateRole(userId, newRole) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const user = localData.users.find(u => u.id === userId)
      if (user) {
        user.role = newRole
        setLocalData(localData)
        if (getLocalUser()?.id === userId) {
          setLocalUser(user)
        }
      }
      return user
    }
  },

  // Listen to auth changes
  onAuthStateChange(callback) {
    if (isSupabaseConfigured) {
      return supabase.auth.onAuthStateChange(callback)
    } else {
      // Demo mode - just call with current state
      const user = getLocalUser()
      callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', { user })
      return { data: { subscription: { unsubscribe: () => {} } } }
    }
  }
}

// Database operations with localStorage fallback
export const db = {
  // Projects
  async getProjects(companyId = null, includeArchived = false) {
    if (isSupabaseConfigured) {
      // If offline, return cached data
      if (!getConnectionStatus()) {
        const cached = await getCachedProjects(companyId)
        if (includeArchived) return cached
        return cached.filter(p => p.status !== 'archived')
      }

      const start = performance.now()
      try {
        let query = supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })

        if (companyId) {
          query = query.eq('company_id', companyId)
        }

        if (!includeArchived) {
          query = query.eq('status', 'active')
        }

        const { data, error } = await query
        const duration = Math.round(performance.now() - start)
        observe.query('getProjects', { duration, rows: data?.length, company_id: companyId })

        if (error) {
          observe.error('database', { message: error.message, operation: 'getProjects', company_id: companyId })
          // On error, try cache
          const cached = await getCachedProjects(companyId)
          if (cached.length > 0) return cached
          throw error
        }

        // Cache projects for offline use
        if (data?.length > 0) {
          cacheProjects(data).catch(err => console.error('Failed to cache projects:', err))
        }

        return data
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjects', company_id: companyId })
        throw error
      }
    } else {
      const projects = getLocalData().projects
      if (includeArchived) return projects
      return projects.filter(p => p.status !== 'archived')
    }
  },

  // Get projects with pagination for scalability (use for large project lists)
  async getProjectsPaginated(companyId, { page = 0, limit = 25, status = 'active' } = {}) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      try {
        let query = supabase
          .from('projects')
          .select('*', { count: 'exact' })
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1)

        if (status !== 'all') {
          query = query.eq('status', status)
        }

        const { data, error, count } = await query
        const duration = Math.round(performance.now() - start)
        observe.query('getProjectsPaginated', { duration, rows: data?.length, page, company_id: companyId })

        if (error) throw error

        return {
          projects: data || [],
          totalCount: count || 0,
          hasMore: (page + 1) * limit < (count || 0),
          page,
          limit
        }
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjectsPaginated', company_id: companyId })
        throw error
      }
    }
    // Demo mode fallback
    const projects = getLocalData().projects.filter(p =>
      p.company_id === companyId && (status === 'all' || p.status === status)
    )
    const start = page * limit
    return {
      projects: projects.slice(start, start + limit),
      totalCount: projects.length,
      hasMore: start + limit < projects.length,
      page,
      limit
    }
  },

  // Get projects with lightweight summary counts (optimized for dashboard)
  // This reduces the number of queries from 9 per project to a single batch query
  async getProjectsWithSummary(companyId) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      try {
        // Fetch projects with embedded counts using Supabase's aggregate functions
        const { data, error } = await supabase
          .from('projects')
          .select(`
            *,
            areas:areas(count),
            tickets:t_and_m_tickets(count),
            pending_tickets:t_and_m_tickets(count),
            daily_reports:daily_reports(count)
          `)
          .eq('company_id', companyId)
          .eq('status', 'active')
          .eq('pending_tickets.status', 'pending')
          .order('created_at', { ascending: false })

        const duration = Math.round(performance.now() - start)
        observe.query('getProjectsWithSummary', { duration, rows: data?.length, company_id: companyId })

        if (error) throw error

        // Transform the response to extract counts
        return (data || []).map(project => ({
          ...project,
          areaCount: project.areas?.[0]?.count || 0,
          ticketCount: project.tickets?.[0]?.count || 0,
          pendingTicketCount: project.pending_tickets?.[0]?.count || 0,
          reportCount: project.daily_reports?.[0]?.count || 0,
          // Remove the raw relation data
          areas: undefined,
          tickets: undefined,
          pending_tickets: undefined,
          daily_reports: undefined
        }))
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjectsWithSummary', company_id: companyId })
        // Fall back to regular getProjects on error
        return this.getProjects(companyId)
      }
    }
    return getLocalData().projects.filter(p => p.company_id === companyId && p.status === 'active')
  },

  // Get comprehensive project dashboard summary using server-side aggregation
  // This is the most optimized query - single RPC call returns all project metrics
  async getProjectDashboardSummary(companyId) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      try {
        const { data, error } = await supabase
          .rpc('get_project_dashboard_summary', { p_company_id: companyId })

        const duration = Math.round(performance.now() - start)
        observe.query('getProjectDashboardSummary', { duration, rows: data?.length, company_id: companyId })

        if (error) {
          // Fall back to getProjectsWithSummary if RPC doesn't exist yet
          if (error.message?.includes('function') || error.code === '42883') {
            return this.getProjectsWithSummary(companyId)
          }
          throw error
        }

        // Transform the snake_case response to camelCase for consistency
        return (data || []).map(p => ({
          id: p.project_id,
          name: p.project_name,
          status: p.project_status,
          job_number: p.project_number,
          address: p.project_address,
          pin: p.project_pin,
          created_at: p.created_at,
          start_date: p.start_date,
          end_date: p.end_date,
          // Financial fields
          contract_value: Number(p.contract_value) || 0,
          work_type: p.work_type || 'demolition',
          job_type: p.job_type || 'standard',
          general_contractor: p.general_contractor || '',
          // Metrics
          areaCount: Number(p.total_areas) || 0,
          completedAreas: Number(p.completed_areas) || 0,
          inProgressAreas: Number(p.in_progress_areas) || 0,
          pendingAreas: Number(p.pending_areas) || 0,
          ticketCount: Number(p.total_tickets) || 0,
          pendingTicketCount: Number(p.pending_tickets) || 0,
          submittedTicketCount: Number(p.submitted_tickets) || 0,
          approvedTicketCount: Number(p.approved_tickets) || 0,
          totalLaborHours: Number(p.total_labor_hours) || 0,
          todayLaborHours: Number(p.today_labor_hours) || 0,
          todayWorkerCount: Number(p.today_worker_count) || 0,
          lastActivityAt: p.last_activity_at,
          dailyReportsThisWeek: Number(p.daily_reports_this_week) || 0,
          corCount: Number(p.cor_count) || 0,
          pendingCorCount: Number(p.pending_cor_count) || 0,
          disposalLoadsToday: Number(p.disposal_loads_today) || 0
        }))
      } catch (error) {
        observe.error('database', { message: error.message, operation: 'getProjectDashboardSummary', company_id: companyId })
        // Fall back to getProjectsWithSummary on error
        return this.getProjectsWithSummary(companyId)
      }
    }
    // Demo mode - basic project list
    return getLocalData().projects.filter(p => p.company_id === companyId && p.status === 'active')
  },

  async getArchivedProjects(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'archived')
        .order('archived_at', { ascending: false })
      if (error) throw error
      return data
    } else {
      return getLocalData().projects.filter(p => p.status === 'archived')
    }
  },

  async getProjectCount(companyId) {
    if (isSupabaseConfigured) {
      const { count, error } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['active', 'archived'])
      if (error) throw error
      return count || 0
    } else {
      const projects = getLocalData().projects
      return projects.filter(p => p.company_id === companyId && p.status !== 'deleted').length
    }
  },

  // Universal Search - searches across projects, T&M tickets, CORs, and workers
  async universalSearch(companyId, query, limit = 10) {
    if (!isSupabaseConfigured || !query?.trim()) {
      return { projects: [], tickets: [], cors: [], workers: [] }
    }

    const searchQuery = query.trim().toLowerCase()
    const results = { projects: [], tickets: [], cors: [], workers: [] }

    try {
      // Search projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, job_number, address, status')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .or(`name.ilike.%${searchQuery}%,job_number.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
        .limit(limit)

      results.projects = projects || []

      // Search T&M tickets
      const { data: tickets } = await supabase
        .from('t_and_m_tickets')
        .select(`
          id, description, work_date, status, project_id,
          projects!inner(id, name, company_id)
        `)
        .eq('projects.company_id', companyId)
        .ilike('description', `%${searchQuery}%`)
        .order('work_date', { ascending: false })
        .limit(limit)

      results.tickets = (tickets || []).map(t => ({
        ...t,
        projectName: t.projects?.name || 'Unknown Project'
      }))

      // Search Change Orders
      const { data: cors } = await supabase
        .from('change_orders')
        .select(`
          id, cor_number, title, status, project_id,
          projects!inner(id, name, company_id)
        `)
        .eq('projects.company_id', companyId)
        .or(`title.ilike.%${searchQuery}%,cor_number.ilike.%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(limit)

      results.cors = (cors || []).map(c => ({
        ...c,
        projectName: c.projects?.name || 'Unknown Project'
      }))

      // Search workers from recent crew check-ins
      const { data: checkins } = await supabase
        .from('crew_checkins')
        .select(`
          workers,
          project_id,
          projects!inner(id, name, company_id)
        `)
        .eq('projects.company_id', companyId)
        .order('check_in_date', { ascending: false })
        .limit(50)

      // Extract unique workers matching query
      const workerMap = new Map()
      ;(checkins || []).forEach(checkin => {
        (checkin.workers || []).forEach(worker => {
          if (worker.name.toLowerCase().includes(searchQuery)) {
            const key = worker.name.toLowerCase()
            if (!workerMap.has(key)) {
              workerMap.set(key, {
                name: worker.name,
                role: worker.role,
                projectName: checkin.projects?.name,
                lastProject: checkin.projects
              })
            }
          }
        })
      })

      results.workers = Array.from(workerMap.values()).slice(0, limit)

      return results
    } catch (error) {
      console.error('Universal search error:', error)
      return results
    }
  },

  async archiveProject(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update({ 
          status: 'archived',
          archived_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === id)
      if (project) {
        project.status = 'archived'
        project.archived_at = new Date().toISOString()
        setLocalData(localData)
      }
      return project
    }
  },

  // Get estimated storage usage for a project (photos only - they're 95% of storage)
  async getProjectStorageStats(projectId) {
    if (!isSupabaseConfigured) return { photoCount: 0, estimatedMB: 0 }

    // Get all T&M tickets with photos
    const { data: tickets, error } = await supabase
      .from('t_and_m_tickets')
      .select('photos')
      .eq('project_id', projectId)

    if (error) throw error

    // Count photos across all tickets
    let photoCount = 0
    const photoUrls = []
    tickets?.forEach(ticket => {
      if (ticket.photos && Array.isArray(ticket.photos)) {
        photoCount += ticket.photos.length
        photoUrls.push(...ticket.photos)
      }
    })

    // Estimate: average photo is 1-2MB after compression
    const estimatedMB = photoCount * 1.5

    return { photoCount, estimatedMB, photoUrls }
  },

  // Deep archive: archive project AND delete photos to reclaim storage
  // Call this after user has exported their important documents
  async archiveProjectDeep(projectId, companyId) {
    if (!isSupabaseConfigured) return null

    // 1. Get all photo URLs for this project
    const { photoUrls } = await this.getProjectStorageStats(projectId)

    // 2. Delete all photos from storage
    if (photoUrls.length > 0) {
      const filePaths = photoUrls
        .map(url => {
          try {
            const urlObj = new URL(url)
            const match = urlObj.pathname.match(/\/tm-photos\/(.+)$/)
            return match ? match[1] : null
          } catch {
            return null
          }
        })
        .filter(Boolean)

      if (filePaths.length > 0) {
        // Delete in batches of 100
        for (let i = 0; i < filePaths.length; i += 100) {
          const batch = filePaths.slice(i, i + 100)
          await supabase.storage.from('tm-photos').remove(batch)
        }
      }
    }

    // 3. Clear photo arrays in tickets (keep ticket data for records)
    await supabase
      .from('t_and_m_tickets')
      .update({ photos: [] })
      .eq('project_id', projectId)

    // 4. Archive the project with cleanup flag
    const { data, error } = await supabase
      .from('projects')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        photos: [], // Clear project photos too
        storage_cleaned: true // Flag that photos were removed
      })
      .eq('id', projectId)
      .select()
      .single()

    if (error) throw error
    return { ...data, photosDeleted: photoUrls.length }
  },

  async restoreProject(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update({
          status: 'active',
          archived_at: null
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === id)
      if (project) {
        project.status = 'active'
        project.archived_at = null
        setLocalData(localData)
      }
      return project
    }
  },

  async getProject(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    } else {
      return getLocalData().projects.find(p => p.id === id)
    }
  },

  async createProject(project) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          ...project,
          status: 'active'
        })
        .select()
        .single()
      if (error) {
        console.error('Supabase createProject error:', error.message, error.details, error.hint)
        throw error
      }
      return data
    } else {
      const localData = getLocalData()
      const newProject = { 
        ...project, 
        id: crypto.randomUUID(),
        status: 'active',
        created_at: new Date().toISOString()
      }
      localData.projects.push(newProject)
      setLocalData(localData)
      return newProject
    }
  },

  // Get project by PIN (for foreman access) - only active projects
  // Note: For production, use getProjectByPinSecure which includes rate limiting
  async getProjectByPin(pin) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('pin', pin)
        .eq('status', 'active')
        .single()
      if (error) return null
      return data
    } else {
      const localData = getLocalData()
      return localData.projects.find(p => p.pin === pin && p.status === 'active') || null
    }
  },

  // Get project by PIN within a specific company (secure foreman access)
  async getProjectByPinAndCompany(pin, companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('pin', pin)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .single()
      if (error) return null
      return data
    } else {
      const localData = getLocalData()
      return localData.projects.find(p =>
        p.pin === pin &&
        p.company_id === companyId &&
        p.status === 'active'
      ) || null
    }
  },

  // Secure PIN lookup with rate limiting and session creation
  // Returns a session token that must be used for all subsequent requests
  async getProjectByPinSecure(pin, companyCode) {
    if (isSupabaseConfigured) {
      // CLIENT-SIDE RATE LIMITING (defense-in-depth)
      const rateLimitKey = `pin_attempts_${companyCode}`
      const lockoutKey = `pin_lockout_${companyCode}`
      const MAX_ATTEMPTS = 5
      const LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes

      // Check if currently locked out
      const lockoutUntil = localStorage.getItem(lockoutKey)
      if (lockoutUntil && Date.now() < parseInt(lockoutUntil)) {
        const remainingMs = parseInt(lockoutUntil) - Date.now()
        const remainingMins = Math.ceil(remainingMs / 60000)
        return {
          success: false,
          rateLimited: true,
          project: null,
          error: `Too many attempts. Please try again in ${remainingMins} minute${remainingMins > 1 ? 's' : ''}.`
        }
      }

      // Track attempts
      let attempts = parseInt(localStorage.getItem(rateLimitKey) || '0')
      attempts++
      localStorage.setItem(rateLimitKey, attempts.toString())

      // Lockout after MAX_ATTEMPTS
      if (attempts > MAX_ATTEMPTS) {
        localStorage.setItem(lockoutKey, (Date.now() + LOCKOUT_MS).toString())
        return {
          success: false,
          rateLimited: true,
          project: null,
          error: 'Too many failed attempts. Please try again in 5 minutes.'
        }
      }

      const deviceId = getDeviceId()

      // Use the new session-based validation
      const { data, error } = await supabase
        .rpc('validate_pin_and_create_session', {
          p_pin: pin,
          p_company_code: companyCode,
          p_device_id: deviceId,
          p_ip_address: null // IP is not available client-side
        })

      if (error) {
        console.error('[PIN Auth] RPC error')
        return { success: false, rateLimited: false, project: null, error: error.message }
      }

      if (!data || data.length === 0) {
        return { success: false, rateLimited: false, project: null }
      }

      const result = data[0]

      // Check error codes
      if (result.error_code === 'RATE_LIMITED') {
        return { success: false, rateLimited: true, project: null }
      }

      if (result.error_code === 'INVALID_COMPANY' || result.error_code === 'INVALID_PIN') {
        return { success: false, rateLimited: false, project: null }
      }

      // Check if successful
      if (!result.success || !result.project_id) {
        return { success: false, rateLimited: false, project: null }
      }

      // SUCCESS: Clear rate limit counters
      localStorage.removeItem(`pin_attempts_${companyCode}`)
      localStorage.removeItem(`pin_lockout_${companyCode}`)

      // Store the session for subsequent requests
      setFieldSession({
        token: result.session_token,
        projectId: result.project_id,
        companyId: result.company_id,
        projectName: result.project_name,
        companyName: result.company_name,
        createdAt: new Date().toISOString()
      })

      // Fetch full project details using the new session
      const client = getFieldClient()
      const { data: projectData, error: projectError } = await client
        .from('projects')
        .select('*')
        .eq('id', result.project_id)
        .single()

      return {
        success: true,
        rateLimited: false,
        sessionToken: result.session_token,
        project: projectData || {
          id: result.project_id,
          name: result.project_name,
          company_id: result.company_id,
          status: 'active'
        }
      }
    } else {
      // Demo mode - create mock session
      const localData = getLocalData()
      const companies = localData.companies || []
      const company = companies.find(c => c.code === companyCode)

      if (!company) {
        return { success: false, rateLimited: false, project: null }
      }

      const project = localData.projects.find(
        p => p.pin === pin && p.company_id === company.id && p.status === 'active'
      )

      if (project) {
        // Create mock session for demo mode
        const mockToken = `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`
        setFieldSession({
          token: mockToken,
          projectId: project.id,
          companyId: company.id,
          projectName: project.name,
          companyName: company.name,
          createdAt: new Date().toISOString()
        })
      }

      return {
        success: !!project,
        rateLimited: false,
        project: project || null
      }
    }
  },

  // Check if PIN is already in use
  async isPinAvailable(pin, excludeProjectId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('projects')
        .select('id')
        .eq('pin', pin)
      
      if (excludeProjectId) {
        query = query.neq('id', excludeProjectId)
      }
      
      const { data, error } = await query
      if (error) throw error
      return data.length === 0
    } else {
      const localData = getLocalData()
      return !localData.projects.some(p => p.pin === pin && p.id !== excludeProjectId)
    }
  },

  // Update project PIN
  async updateProjectPin(projectId, pin) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update({ pin })
        .eq('id', projectId)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === projectId)
      if (project) {
        project.pin = pin
        setLocalData(localData)
      }
      return project
    }
  },

  // Update project - requires companyId for cross-tenant security
  async updateProject(id, updates, companyId = null) {
    if (isSupabaseConfigured) {
      // SECURITY: Require companyId to prevent cross-tenant data access
      if (!companyId) {
        console.error('[Security] updateProject called without companyId - this is a security risk')
        throw new Error('Company ID is required for security verification')
      }

      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .eq('company_id', companyId)  // Always enforce cross-tenant security
        .select()
        .single()

      if (error) {
        console.error('Error updating project')
        throw error
      }
      return data
    } else {
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === id)
      if (project) {
        Object.assign(project, updates)
        setLocalData(localData)
      }
      return project
    }
  },

  // Delete project - requires companyId for cross-tenant security
  async deleteProject(id, companyId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('projects')
        .delete()
        .eq('id', id)

      // Add company_id check if provided (prevents cross-tenant access)
      if (companyId) {
        query = query.eq('company_id', companyId)
      }

      const { error } = await query
      if (error) throw error
    } else {
      const localData = getLocalData()
      localData.projects = localData.projects.filter(p => p.id !== id)
      localData.areas = localData.areas.filter(a => a.project_id !== id)
      setLocalData(localData)
    }
  },

  // Areas
  async getAreas(projectId) {
    if (isSupabaseConfigured) {
      // If offline, return cached data
      if (!getConnectionStatus()) {
        return getCachedAreas(projectId)
      }

      const client = getClient()
      const { data, error } = await client
        .from('areas')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      if (error) {
        // On error, try cache
        const cached = await getCachedAreas(projectId)
        if (cached.length > 0) return cached
        throw error
      }

      // Cache areas for offline use
      if (data?.length > 0) {
        cacheAreas(data).catch(err => console.error('Failed to cache areas:', err))
      }

      return data
    } else {
      return getLocalData().areas.filter(a => a.project_id === projectId)
    }
  },

  async createArea(area) {
    if (isSupabaseConfigured) {
      const client = getClient()
      const { data, error } = await client
        .from('areas')
        .insert(area)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const newArea = {
        ...area,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString()
      }
      localData.areas.push(newArea)
      setLocalData(localData)
      return newArea
    }
  },

  // Update area status - projectId optional for cross-tenant security
  async updateAreaStatus(id, status, projectId = null) {
    if (isSupabaseConfigured) {
      // If offline, update cache and queue action
      if (!getConnectionStatus()) {
        const area = await updateCachedAreaStatus(id, status)
        await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: id, status })
        return area
      }

      const client = getClient()
      let query = client
        .from('areas')
        .update({ status })
        .eq('id', id)

      // Add project_id check if provided (prevents cross-tenant access)
      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { data, error } = await query.select().single()

      if (error) {
        // If network error, queue for later
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          const area = await updateCachedAreaStatus(id, status)
          await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: id, status })
          return area
        }
        throw error
      }

      // Update cache with server response
      if (data) {
        updateCachedAreaStatus(id, status).catch(err => console.error('Failed to update cached area status:', err))
      }

      return data
    } else {
      const localData = getLocalData()
      const area = localData.areas.find(a => a.id === id)
      if (area) {
        area.status = status
        area.updated_at = new Date().toISOString()
      }
      setLocalData(localData)
      return area
    }
  },

  // Update area (name, weight, sort_order) - projectId optional for security
  async updateArea(id, updates, projectId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('areas')
        .update(updates)
        .eq('id', id)

      // Add project_id check if provided (prevents cross-tenant access)
      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      const area = localData.areas.find(a => a.id === id)
      if (area) {
        Object.assign(area, updates)
        area.updated_at = new Date().toISOString()
      }
      setLocalData(localData)
      return area
    }
  },

  // Delete area - projectId optional for cross-tenant security
  async deleteArea(id, projectId = null) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('areas')
        .delete()
        .eq('id', id)

      // Add project_id check if provided (prevents cross-tenant access)
      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { error } = await query
      if (error) throw error
    } else {
      const localData = getLocalData()
      localData.areas = localData.areas.filter(a => a.id !== id)
      setLocalData(localData)
    }
  },

  // Real-time subscriptions (Supabase only)
  subscribeToAreas(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`areas:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'areas', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to messages for a project (for live chat)
  subscribeToMessages(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`messages:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to material requests for a project
  subscribeToMaterialRequests(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`material_requests:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'material_requests', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to daily reports for a project
  subscribeToDailyReports(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`daily_reports:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'daily_reports', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to crew check-ins for a project
  subscribeToCrewCheckins(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`crew_checkins:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'crew_checkins', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to injury reports for a company (office-wide)
  subscribeToInjuryReports(companyId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`injury_reports:${companyId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'injury_reports', filter: `company_id=eq.${companyId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to T&M tickets for a project
  subscribeToTMTickets(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`tm_tickets:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 't_and_m_tickets', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // Subscribe to all company activity (for office notifications)
  subscribeToCompanyActivity(companyId, projectIds, callbacks) {
    if (!isSupabaseConfigured || !projectIds || projectIds.length === 0) return null

    const channel = supabase.channel(`company_activity:${companyId}`)

    // Subscribe to project-level changes
    // Use wildcard event '*' for all entities to capture INSERT, UPDATE, and DELETE
    projectIds.forEach(projectId => {
      // Messages
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onMessage?.(payload)
      )

      // Material requests
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_requests', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onMaterialRequest?.(payload)
      )

      // T&M Tickets
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 't_and_m_tickets', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onTMTicket?.(payload)
      )

      // Crew check-ins - critical for labor tracking
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'crew_checkins', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onCrewCheckin?.(payload)
      )

      // Area progress updates (INSERT, UPDATE, and DELETE)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'areas', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onAreaUpdate?.(payload)
      )

      // Change orders (CORs)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'change_orders', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onCORChange?.(payload)
      )

      // Project-level changes (name, dates, budget updates from office)
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
        (payload) => callbacks.onProjectChange?.(payload)
      )
    })

    // Subscribe to injury reports company-wide (INSERT, UPDATE, and DELETE)
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'injury_reports', filter: `company_id=eq.${companyId}` },
      (payload) => callbacks.onInjuryReport?.(payload)
    )

    // Subscribe to materials/equipment pricing changes company-wide
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'materials_equipment', filter: `company_id=eq.${companyId}` },
      (payload) => callbacks.onMaterialsEquipmentChange?.(payload)
    )

    // Subscribe to labor rate changes company-wide
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'labor_rates', filter: `company_id=eq.${companyId}` },
      (payload) => callbacks.onLaborRateChange?.(payload)
    )

    return channel.subscribe()
  },

  unsubscribe(subscription) {
    if (subscription && isSupabaseConfigured) {
      supabase.removeChannel(subscription)
    }
  },

  // ============================================
  // Project Assignments (for foremen)
  // ============================================

  async getAssignedProjects(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_assignments')
        .select(`
          project_id,
          projects (*)
        `)
        .eq('user_id', userId)
      if (error) throw error
      return data.map(a => a.projects)
    } else {
      const localData = getLocalData()
      const assignments = localData.assignments?.filter(a => a.user_id === userId) || []
      return assignments.map(a => localData.projects.find(p => p.id === a.project_id)).filter(Boolean)
    }
  },

  async assignUserToProject(projectId, userId, assignedBy) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_assignments')
        .insert({ project_id: projectId, user_id: userId, assigned_by: assignedBy })
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      const localData = getLocalData()
      if (!localData.assignments) localData.assignments = []
      const assignment = {
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: userId,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString()
      }
      localData.assignments.push(assignment)
      setLocalData(localData)
      return assignment
    }
  },

  async removeUserFromProject(projectId, userId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('project_assignments')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
      if (error) throw error
    } else {
      const localData = getLocalData()
      localData.assignments = localData.assignments?.filter(
        a => !(a.project_id === projectId && a.user_id === userId)
      ) || []
      setLocalData(localData)
    }
  },

  async getProjectAssignments(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_assignments')
        .select(`
          user_id,
          users (id, email, name, role)
        `)
        .eq('project_id', projectId)
      if (error) throw error
      return data.map(a => a.users)
    } else {
      const localData = getLocalData()
      const assignments = localData.assignments?.filter(a => a.project_id === projectId) || []
      return assignments.map(a => localData.users.find(u => u.id === a.user_id)).filter(Boolean)
    }
  },

  // Get all users (for assignment dropdowns)
  async getAllUsers() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    } else {
      return getLocalData().users || []
    }
  },

  // Get all foremen
  async getForemen() {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'foreman')
        .order('name')
      if (error) throw error
      return data
    } else {
      return (getLocalData().users || []).filter(u => u.role === 'foreman')
    }
  },

  // ============================================
  // Activity Logging
  // ============================================

  async logActivity(userId, projectId, areaId, action, oldValue, newValue) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('activity_log')
        .insert({
          user_id: userId,
          project_id: projectId,
          area_id: areaId,
          action,
          old_value: oldValue,
          new_value: newValue
        })
      if (error) console.error('Error logging activity:', error)
    }
    // In demo mode, we skip logging
  },

  async getProjectActivity(projectId, limit = 50) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('activity_log')
        .select(`
          *,
          users (name, email),
          areas (name)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    }
    return []
  },

  // ============================================
  // Materials & Equipment (Master List)
  // ============================================

  async getMaterialsEquipment(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('materials_equipment')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('category')
        .order('name')
      if (error) throw error
      return data
    }
    return []
  },

  async getMaterialsEquipmentByCategory(companyId, category) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []
      const { data, error } = await client
        .from('materials_equipment')
        .select('*')
        .eq('company_id', companyId)
        .eq('category', category)
        .eq('active', true)
        .order('name')
      if (error) throw error
      return data
    }
    return []
  },

  async getAllMaterialsEquipment(companyId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []
      const { data, error } = await client
        .from('materials_equipment')
        .select('*')
        .eq('company_id', companyId)
        .order('category')
        .order('name')
      if (error) throw error
      return data
    }
    return []
  },

  async createMaterialEquipment(item) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('materials_equipment')
        .insert(item)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateMaterialEquipment(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('materials_equipment')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteMaterialEquipment(id) {
    if (isSupabaseConfigured) {
      // Soft delete - just deactivate
      const { error } = await supabase
        .from('materials_equipment')
        .update({ active: false })
        .eq('id', id)
      if (error) throw error
    }
  },

  // ============================================
  // Labor Categories & Classes (Company-specific)
  // ============================================

  // Get all labor categories for a company
  async getLaborCategories(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_categories')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Create a new labor category
  async createLaborCategory(companyId, name, sortOrder = 0) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_categories')
        .insert({
          company_id: companyId,
          name,
          sort_order: sortOrder
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Update a labor category
  async updateLaborCategory(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Delete (soft) a labor category
  async deleteLaborCategory(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('labor_categories')
        .update({ active: false })
        .eq('id', id)
      if (error) throw error
    }
  },

  // Get all labor classes for a company (with category info)
  async getLaborClasses(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .select(`
          *,
          labor_categories (id, name)
        `)
        .eq('company_id', companyId)
        .eq('active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data || []
    }
    return []
  },

  // Get labor classes with categories in one call (office use - includes all data)
  async getLaborClassesWithCategories(companyId) {
    if (isSupabaseConfigured) {
      const [categoriesResult, classesResult] = await Promise.all([
        supabase
          .from('labor_categories')
          .select('*')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('sort_order')
          .order('name'),
        supabase
          .from('labor_classes')
          .select('*')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('sort_order')
          .order('name')
      ])

      if (categoriesResult.error) throw categoriesResult.error
      if (classesResult.error) throw classesResult.error

      return {
        categories: categoriesResult.data || [],
        classes: classesResult.data || []
      }
    }
    return { categories: [], classes: [] }
  },

  // Get labor classes for field users (NO RATES - names and categories only)
  // Use this for CrewCheckin and TMForm to prevent rate exposure
  async getLaborClassesForField(companyId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return { categories: [], classes: [] }

      // Use the secure RPC function that only returns non-sensitive fields
      const { data, error } = await client
        .rpc('get_labor_classes_for_field', { p_company_id: companyId })

      if (error) {
        console.error('Error loading field labor classes:', error)
        // Fallback to direct query if RPC not available (pre-migration)
        const [categoriesResult, classesResult] = await Promise.all([
          client
            .from('labor_categories')
            .select('id, name')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('name'),
          client
            .from('labor_classes')
            .select('id, name, category_id')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('name')
        ])

        return {
          categories: categoriesResult.data || [],
          classes: classesResult.data || []
        }
      }

      // Transform RPC result into categories + classes format
      const categoriesMap = new Map()
      const classes = []

      for (const row of (data || [])) {
        if (row.category_id && row.category_name && !categoriesMap.has(row.category_id)) {
          categoriesMap.set(row.category_id, { id: row.category_id, name: row.category_name })
        }
        classes.push({
          id: row.id,
          name: row.name,
          category_id: row.category_id
        })
      }

      return {
        categories: Array.from(categoriesMap.values()),
        classes
      }
    }
    return { categories: [], classes: [] }
  },

  // Create a new labor class
  async createLaborClass(companyId, categoryId, name, sortOrder = 0) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .insert({
          company_id: companyId,
          category_id: categoryId,
          name,
          sort_order: sortOrder
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Update a labor class
  async updateLaborClass(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Delete (soft) a labor class
  async deleteLaborClass(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('labor_classes')
        .update({ active: false })
        .eq('id', id)
      if (error) throw error
    }
  },

  // Get rates for a specific labor class
  async getLaborClassRates(laborClassId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_class_rates')
        .select('*')
        .eq('labor_class_id', laborClassId)
      if (error) throw error
      return data || []
    }
    return []
  },

  // Get all rates for all classes in a company
  async getAllLaborClassRates(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_classes')
        .select(`
          id,
          name,
          labor_class_rates (*)
        `)
        .eq('company_id', companyId)
        .eq('active', true)
      if (error) throw error
      return data || []
    }
    return []
  },

  // Save rates for a labor class (upsert)
  async saveLaborClassRates(laborClassId, rates) {
    if (isSupabaseConfigured) {
      // rates is an array of { work_type, job_type, regular_rate, overtime_rate }
      const ratesWithClassId = rates.map(r => ({
        ...r,
        labor_class_id: laborClassId
      }))

      // Upsert rates - will insert or update based on unique constraint
      const { error } = await supabase
        .from('labor_class_rates')
        .upsert(ratesWithClassId, {
          onConflict: 'labor_class_id,work_type,job_type'
        })
      if (error) throw error
    }
  },

  // Get rate for a specific class/work_type/job_type combo (for cost calculations)
  async getLaborClassRate(laborClassId, workType, jobType) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('labor_class_rates')
        .select('regular_rate, overtime_rate')
        .eq('labor_class_id', laborClassId)
        .eq('work_type', workType)
        .eq('job_type', jobType)
        .single()
      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
      return data || null
    }
    return null
  },

  // ============================================
  // T&M Tickets
  // ============================================

  async getTMTickets(projectId) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      const client = getClient()
      const inFieldMode = isFieldMode()

      // SECURITY: Exclude cost_per_unit for field users to protect pricing data
      const materialsSelect = inFieldMode
        ? 'materials_equipment (name, unit, category)' // No cost_per_unit for field users
        : 'materials_equipment (name, unit, cost_per_unit, category)' // Full data for office

      try {
        const { data, error } = await client
          .from('t_and_m_tickets')
          .select(`
            *,
            t_and_m_workers (*),
            t_and_m_items (
              *,
              ${materialsSelect}
            )
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })

        const duration = Math.round(performance.now() - start)
        observe.query('getTMTickets', { duration, rows: data?.length, project_id: projectId })

        if (error) throw error
        return data
      } catch (error) {
        observe.error('database', {
          message: error.message,
          operation: 'getTMTickets',
          project_id: projectId
        })
        throw error
      }
    }
    return []
  },

  // Get T&M tickets with pagination for scalability
  async getTMTicketsPaginated(projectId, { page = 0, limit = 25, status = null } = {}) {
    if (isSupabaseConfigured) {
      const start = performance.now()
      const client = getClient()
      const inFieldMode = isFieldMode()

      // SECURITY: Exclude cost_per_unit for field users to protect pricing data
      const materialsSelect = inFieldMode
        ? 'materials_equipment (name, unit, category)'
        : 'materials_equipment (name, unit, cost_per_unit, category)'

      try {
        let query = client
          .from('t_and_m_tickets')
          .select(`
            *,
            t_and_m_workers (*),
            t_and_m_items (
              *,
              ${materialsSelect}
            )
          `, { count: 'exact' })
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1)

        if (status) {
          query = query.eq('status', status)
        }

        const { data, error, count } = await query

        const duration = Math.round(performance.now() - start)
        observe.query('getTMTicketsPaginated', { duration, rows: data?.length, page, project_id: projectId })

        if (error) throw error

        return {
          tickets: data || [],
          totalCount: count || 0,
          hasMore: (page + 1) * limit < (count || 0),
          page,
          limit
        }
      } catch (error) {
        observe.error('database', {
          message: error.message,
          operation: 'getTMTicketsPaginated',
          project_id: projectId
        })
        throw error
      }
    }
    return { tickets: [], totalCount: 0, hasMore: false, page: 0, limit: 25 }
  },

  // Get change order totals for a project
  async getChangeOrderTotals(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('t_and_m_tickets')
        .select('ce_pco_number, change_order_value, status')
        .eq('project_id', projectId)
        .not('ce_pco_number', 'is', null)
        .neq('ce_pco_number', '')

      if (error) throw error

      // Group by CE/PCO number
      const changeOrders = {}
      let totalApproved = 0
      let totalPending = 0

      data?.forEach(ticket => {
        const ceNumber = ticket.ce_pco_number
        if (!changeOrders[ceNumber]) {
          changeOrders[ceNumber] = { approved: 0, pending: 0, count: 0 }
        }
        changeOrders[ceNumber].count++

        if (ticket.status === 'approved' || ticket.status === 'billed') {
          const value = parseFloat(ticket.change_order_value) || 0
          changeOrders[ceNumber].approved += value
          totalApproved += value
        } else if (ticket.status === 'pending') {
          totalPending++
        }
      })

      return {
        changeOrders,
        totalApprovedValue: totalApproved,
        pendingCount: totalPending
      }
    }
    return { changeOrders: {}, totalApprovedValue: 0, pendingCount: 0 }
  },

  async getTMTicketsByStatus(projectId, status) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []

      const { data, error } = await client
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (name, unit, cost_per_unit, category)
          )
        `)
        .eq('project_id', projectId)
        .eq('status', status)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    return []
  },

  // Get T&M tickets associated with a COR (for backup documentation)
  async getCORTickets(corId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) return []

      const { data, error } = await client
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (name, unit, cost_per_unit, category)
          )
        `)
        .eq('assigned_cor_id', corId)
        .order('work_date', { ascending: true })
      if (error) throw error
      return data || []
    }
    return []
  },

  async createTMTicket(ticket) {
    if (isSupabaseConfigured) {
      // If offline, cache ticket and queue action
      if (!getConnectionStatus()) {
        const tempTicket = {
          id: generateTempId(),
          project_id: ticket.project_id,
          work_date: ticket.work_date,
          ce_pco_number: ticket.ce_pco_number || null,
          assigned_cor_id: ticket.assigned_cor_id || null,
          notes: ticket.notes,
          photos: ticket.photos || [],
          status: 'pending_sync',
          created_by_name: ticket.created_by_name || 'Field User',
          created_at: new Date().toISOString(),
          _offline: true
        }
        await cacheTMTicket(tempTicket)
        await addPendingAction(ACTION_TYPES.CREATE_TM_TICKET, {
          ticket: tempTicket,
          workers: ticket._workers || [],
          items: ticket._items || []
        })
        return tempTicket
      }

      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .insert({
          project_id: ticket.project_id,
          work_date: ticket.work_date,
          ce_pco_number: ticket.ce_pco_number || null,
          assigned_cor_id: ticket.assigned_cor_id || null, // Link to COR if provided
          notes: ticket.notes,
          photos: ticket.photos || [],
          status: 'pending',
          created_by_name: ticket.created_by_name || 'Field User'
        })
        .select()
        .single()

      if (error) {
        // If network error, queue for later
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          const tempTicket = {
            id: generateTempId(),
            ...ticket,
            status: 'pending_sync',
            _offline: true
          }
          await cacheTMTicket(tempTicket)
          await addPendingAction(ACTION_TYPES.CREATE_TM_TICKET, {
            ticket: tempTicket,
            workers: ticket._workers || [],
            items: ticket._items || []
          })
          return tempTicket
        }
        throw error
      }
      return data
    }
    return null
  },

  async addTMWorkers(ticketId, workers) {
    if (isSupabaseConfigured) {
      const workersData = workers.map(w => ({
        ticket_id: ticketId,
        name: w.name,
        hours: w.hours,
        overtime_hours: w.overtime_hours || 0,
        time_started: w.time_started || null,
        time_ended: w.time_ended || null,
        role: w.role || 'Laborer'
      }))
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { error } = await client
        .from('t_and_m_workers')
        .insert(workersData)
      if (error) throw error
    }
  },

  async addTMItems(ticketId, items) {
    if (isSupabaseConfigured) {
      const itemsData = items.map(item => ({
        ticket_id: ticketId,
        material_equipment_id: item.material_equipment_id || null,
        custom_name: item.custom_name || null,
        custom_category: item.custom_category || null,
        quantity: item.quantity
      }))
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { error } = await client
        .from('t_and_m_items')
        .insert(itemsData)
      if (error) throw error
    }
  },

  // Get the most recent ticket's crew for "Same as Yesterday" feature
  async getPreviousTicketCrew(projectId, beforeDate) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) return null

    // Find the most recent ticket before the given date
    const { data: ticket, error } = await client
      .from('t_and_m_tickets')
      .select(`
        id,
        work_date,
        t_and_m_workers (*)
      `)
      .eq('project_id', projectId)
      .lt('work_date', beforeDate)
      .order('work_date', { ascending: false })
      .limit(1)
      .maybeSingle() // Use maybeSingle to return null instead of 406 when no previous tickets

    if (error || !ticket) return null

    // Group workers by role
    const workers = ticket.t_and_m_workers || []

    // Check if any workers have labor_class_id (indicates custom labor classes)
    const hasCustomClasses = workers.some(w => w.labor_class_id)

    // Build dynamic workers structure for custom labor classes
    const dynamicWorkers = {}
    if (hasCustomClasses) {
      workers.forEach(w => {
        if (w.labor_class_id) {
          if (!dynamicWorkers[w.labor_class_id]) {
            dynamicWorkers[w.labor_class_id] = []
          }
          dynamicWorkers[w.labor_class_id].push({
            name: w.name,
            hours: w.hours?.toString() || '',
            overtimeHours: w.overtime_hours?.toString() || '',
            timeStarted: w.time_started || '',
            timeEnded: w.time_ended || ''
          })
        }
      })
    }

    // Build legacy worker arrays
    const supervision = workers
      .filter(w => ['Foreman', 'General Foreman', 'Superintendent'].includes(w.role))
      .map(w => ({
        name: w.name,
        hours: w.hours?.toString() || '',
        overtimeHours: w.overtime_hours?.toString() || '',
        timeStarted: w.time_started || '',
        timeEnded: w.time_ended || '',
        role: w.role
      }))

    const operators = workers
      .filter(w => w.role === 'Operator')
      .map(w => ({
        name: w.name,
        hours: w.hours?.toString() || '',
        overtimeHours: w.overtime_hours?.toString() || '',
        timeStarted: w.time_started || '',
        timeEnded: w.time_ended || ''
      }))

    const laborers = workers
      .filter(w => w.role === 'Laborer')
      .map(w => ({
        name: w.name,
        hours: w.hours?.toString() || '',
        overtimeHours: w.overtime_hours?.toString() || '',
        timeStarted: w.time_started || '',
        timeEnded: w.time_ended || ''
      }))

    return {
      workDate: ticket.work_date,
      supervision: supervision.length > 0 ? supervision : null,
      operators: operators.length > 0 ? operators : null,
      laborers: laborers.length > 0 ? laborers : null,
      dynamicWorkers: Object.keys(dynamicWorkers).length > 0 ? dynamicWorkers : null,
      totalWorkers: workers.length
    }
  },

  async updateTMTicketStatus(ticketId, status) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({ status })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Approve T&M ticket (with certification and optional change order value)
  async approveTMTicket(ticketId, userId, userName, changeOrderValue = null) {
    if (isSupabaseConfigured) {
      const updateData = {
        status: 'approved',
        approved_by_user_id: userId,
        approved_by_name: userName,
        approved_at: new Date().toISOString(),
        // Clear any previous rejection
        rejected_by_user_id: null,
        rejected_by_name: null,
        rejected_at: null,
        rejection_reason: null
      }

      // Add change order value if provided (for tickets with CE/PCO)
      if (changeOrderValue !== null) {
        updateData.change_order_value = parseFloat(changeOrderValue) || 0
      }

      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Reject T&M ticket (with reason)
  async rejectTMTicket(ticketId, userId, userName, reason = '') {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({
          status: 'rejected',
          rejected_by_user_id: userId,
          rejected_by_name: userName,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
          // Clear any previous approval
          approved_by_user_id: null,
          approved_by_name: null,
          approved_at: null
        })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Check if user role can approve T&M tickets
  canApproveTickets(role) {
    const approverRoles = ['owner', 'admin', 'manager']
    return approverRoles.includes(role)
  },

  async updateTMTicketPhotos(ticketId, photos) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({ photos })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Save client signature directly to T&M ticket (on-site signing)
  async saveTMClientSignature(ticketId, signatureData) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      const { data, error } = await client
        .from('t_and_m_tickets')
        .update({
          client_signature_data: signatureData.signature,
          client_signature_name: signatureData.signerName,
          client_signature_title: signatureData.signerTitle,
          client_signature_company: signatureData.signerCompany,
          client_signature_date: signatureData.signedAt,
          client_signature_ip: null, // Not available in on-site signing
          status: 'client_signed' // Update status to indicate client has signed
        })
        .eq('id', ticketId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteTMTicket(ticketId) {
    if (isSupabaseConfigured) {
      const client = getClient()
      if (!client) {
        throw new Error('Database client not available')
      }
      // Workers and items cascade delete automatically
      const { error } = await client
        .from('t_and_m_tickets')
        .delete()
        .eq('id', ticketId)
      if (error) throw error
    }
  },

  // Check if a T&M ticket can be edited
  // Tickets are locked once their associated COR is approved/billed/closed
  async isTicketEditable(ticket) {
    // If no assigned COR, ticket is editable
    if (!ticket?.assigned_cor_id) {
      return { editable: true }
    }

    if (isSupabaseConfigured) {
      try {
        const { data: cor, error } = await supabase
          .from('change_orders')
          .select('id, status, cor_number')
          .eq('id', ticket.assigned_cor_id)
          .single()

        if (error || !cor) {
          // COR not found - allow editing
          return { editable: true }
        }

        // Only draft and pending_approval CORs allow ticket editing
        const editableStatuses = ['draft', 'pending_approval']
        const isEditable = editableStatuses.includes(cor.status)

        return {
          editable: isEditable,
          lockedBy: isEditable ? null : cor,
          reason: isEditable ? null : `This ticket is linked to ${cor.cor_number} which has been ${cor.status === 'approved' ? 'approved' : cor.status}`
        }
      } catch (err) {
        console.error('Error checking ticket editability:', err)
        // On error, allow editing to avoid blocking users
        return { editable: true }
      }
    }

    return { editable: true }
  },

  // ============================================
  // Companies
  // ============================================

  async getCompanyByCode(code) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('code', code)
        .single()
      if (error) return null
      return data
    }
    return null
  },

  async getCompany(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Get all companies a user has ACTIVE access to
  async getUserCompanies(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          id,
          access_level,
          company_id,
          status,
          companies (
            id,
            name,
            code
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching user companies:', error)
        return []
      }

      // Flatten the response
      return data.map(uc => ({
        id: uc.companies.id,
        name: uc.companies.name,
        code: uc.companies.code,
        access_level: uc.access_level
      }))
    }
    return []
  },

  // Get count of pending memberships for a user
  async getUserPendingMemberships(userId) {
    if (isSupabaseConfigured) {
      const { count, error } = await supabase
        .from('user_companies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending')

      if (error) {
        console.error('Error fetching pending memberships:', error)
        return 0
      }
      return count || 0
    }
    return 0
  },

  // Get all memberships for a company (for admin view)
  async getCompanyMemberships(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          id,
          access_level,
          company_role,
          status,
          created_at,
          approved_at,
          approved_by,
          removed_at,
          removed_by,
          users!user_companies_user_id_fkey (
            id,
            name,
            email
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching company memberships:', error)
        return []
      }
      return data || []
    }
    return []
  },

  // Approve a pending membership
  async approveMembership(membershipId, approvedBy) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .update({
          status: 'active',
          approved_at: new Date().toISOString(),
          approved_by: approvedBy
        })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Approve a pending membership with access level assignment (uses RPC for security)
  async approveMembershipWithRole(membershipId, approvedBy, accessLevel = 'member') {
    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('approve_membership_with_role', {
        membership_id: membershipId,
        approved_by_user: approvedBy,
        new_access_level: accessLevel
      })

      if (error) throw error
    }
  },

  // Reject a pending membership (hard delete)
  async rejectMembership(membershipId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .delete()
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Remove an active member (soft delete)
  async removeMember(membershipId, removedBy) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .update({
          status: 'removed',
          removed_at: new Date().toISOString(),
          removed_by: removedBy
        })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // ============================================
  // Project Team Management
  // ============================================

  // Get all team members assigned to a project
  async getProjectTeam(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_users')
        .select(`
          id,
          project_role,
          assigned_at,
          notes,
          users!project_users_user_id_fkey (
            id,
            name,
            email
          )
        `)
        .eq('project_id', projectId)
        .order('assigned_at', { ascending: true })

      if (error) {
        console.error('Error fetching project team:', error)
        return []
      }
      return data || []
    }
    return []
  },

  // Get all company members (for adding to project)
  async getCompanyMembers(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          id,
          access_level,
          users!user_companies_user_id_fkey (
            id,
            name,
            email
          )
        `)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching company members:', error)
        return []
      }
      return data || []
    }
    return []
  },

  // Add a user to a project with a role
  async addProjectMember(projectId, userId, projectRole, assignedBy) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_users')
        .insert({
          project_id: projectId,
          user_id: userId,
          project_role: projectRole,
          assigned_by: assignedBy
        })
        .select()
        .single()

      if (error) throw error
      return data
    }
    return null
  },

  // Update a project member's role
  async updateProjectMemberRole(projectId, userId, newRole) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('project_users')
        .update({ project_role: newRole })
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) throw error
    }
  },

  // Remove a user from a project
  async removeProjectMember(projectId, userId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('project_users')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) throw error
    }
  },

  // Update a member's access level
  async updateMemberAccessLevel(membershipId, newAccessLevel) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .update({ access_level: newAccessLevel })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Update a member's company role (job title)
  async updateMemberCompanyRole(membershipId, newCompanyRole) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .update({ company_role: newCompanyRole })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Repair legacy user - creates missing user_companies record
  // Called when user has company_id but no active memberships
  // Uses RPC function to bypass RLS restrictions
  async repairLegacyUser(userId, companyId, role = 'member') {
    if (!isSupabaseConfigured || !userId || !companyId) return false

    try {
      // Use RPC function which has SECURITY DEFINER to bypass RLS
      const { data, error } = await supabase.rpc('repair_legacy_user', {
        p_user_id: userId,
        p_company_id: companyId,
        p_role: role
      })

      if (error) {
        console.error('RPC repair_legacy_user failed:', error)
        return false
      }

      return data === true
    } catch (error) {
      console.error('Error repairing legacy user:', error)
      return false
    }
  },

  // Check if user is a legacy user (has company_id but no memberships)
  async isLegacyUser(userId) {
    if (!isSupabaseConfigured) return false

    try {
      // Get user's company_id
      const { data: user } = await supabase
        .from('users')
        .select('company_id, role')
        .eq('id', userId)
        .single()

      if (!user?.company_id) return false

      // Check if any user_companies records exist
      const { count } = await supabase
        .from('user_companies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      // Legacy user if has company_id but no memberships
      return count === 0
    } catch (error) {
      console.error('Error checking legacy user:', error)
      return false
    }
  },

  // ============================================
  // Disposal Load Tracking
  // ============================================

  // Load type options (matches database enum)
  DISPOSAL_LOAD_TYPES: [
    { value: 'concrete', label: 'Concrete' },
    { value: 'trash', label: 'Trash' },
    { value: 'metals', label: 'Metals' },
    { value: 'hazardous_waste', label: 'Hazardous Waste' }
  ],

  // Get disposal loads for a specific date
  async getDisposalLoads(projectId, date) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const start = performance.now()
    try {
      const { data, error } = await client
        .from('disposal_loads')
        .select('*')
        .eq('project_id', projectId)
        .eq('work_date', date)
        .order('created_at', { ascending: false })

      const duration = Math.round(performance.now() - start)
      observe.query('getDisposalLoads', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getDisposalLoads', project_id: projectId })
      throw error
    }
  },

  // Get disposal loads history for the last N days
  async getDisposalLoadsHistory(projectId, days = 14) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const start = performance.now()
    try {
      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data, error } = await client
        .from('disposal_loads')
        .select('*')
        .eq('project_id', projectId)
        .gte('work_date', startDate.toISOString().split('T')[0])
        .lte('work_date', endDate.toISOString().split('T')[0])
        .order('work_date', { ascending: false })

      const duration = Math.round(performance.now() - start)
      observe.query('getDisposalLoadsHistory', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      // Map work_date to load_date for compatibility
      return (data || []).map(d => ({ ...d, load_date: d.work_date }))
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getDisposalLoadsHistory', project_id: projectId })
      throw error
    }
  },

  // Add a new disposal load entry
  async addDisposalLoad(projectId, userId, workDate, loadType, loadCount, notes = null) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { data, error } = await client
      .from('disposal_loads')
      .insert({
        project_id: projectId,
        user_id: userId,
        work_date: workDate,
        load_type: loadType,
        load_count: loadCount,
        notes
      })
      .select()
      .single()

    if (error) {
      observe.error('database', { message: error.message, operation: 'addDisposalLoad', project_id: projectId })
      throw error
    }
    return data
  },

  // Update an existing disposal load entry
  async updateDisposalLoad(id, loadType, loadCount, notes = null) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { data, error } = await client
      .from('disposal_loads')
      .update({
        load_type: loadType,
        load_count: loadCount,
        notes
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      observe.error('database', { message: error.message, operation: 'updateDisposalLoad' })
      throw error
    }
    return data
  },

  // Delete a disposal load entry
  async deleteDisposalLoad(id) {
    if (!isSupabaseConfigured) return false

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { error } = await client
      .from('disposal_loads')
      .delete()
      .eq('id', id)

    if (error) {
      observe.error('database', { message: error.message, operation: 'deleteDisposalLoad' })
      throw error
    }
    return true
  },

  // Get disposal summary for burn rate view
  async getDisposalSummary(projectId, startDate = null, endDate = null) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const start = performance.now()
    try {
      // Use RPC function for efficient aggregation
      const { data, error } = await client.rpc('get_disposal_summary', {
        p_project_id: projectId,
        p_start_date: startDate,
        p_end_date: endDate
      })

      const duration = Math.round(performance.now() - start)
      observe.query('getDisposalSummary', { duration, rows: data?.length, project_id: projectId })

      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'getDisposalSummary', project_id: projectId })
      // Fallback to direct query if RPC doesn't exist
      return this.getDisposalSummaryFallback(projectId, startDate, endDate)
    }
  },

  // Fallback aggregation (if RPC not available)
  async getDisposalSummaryFallback(projectId, startDate, endDate) {
    const client = getClient() || supabase
    let query = client
      .from('disposal_loads')
      .select('load_type, load_count, work_date')
      .eq('project_id', projectId)

    if (startDate) {
      query = query.gte('work_date', startDate)
    }
    if (endDate) {
      query = query.lte('work_date', endDate)
    }

    const { data, error } = await query
    if (error) throw error

    // Aggregate in JS
    const summary = {}
    data?.forEach(row => {
      if (!summary[row.load_type]) {
        summary[row.load_type] = { load_type: row.load_type, total_loads: 0, days: new Set() }
      }
      summary[row.load_type].total_loads += row.load_count
      summary[row.load_type].days.add(row.work_date)
    })

    return Object.values(summary).map(s => ({
      load_type: s.load_type,
      total_loads: s.total_loads,
      days_with_activity: s.days.size
    }))
  },

  // Get weekly disposal summary for charts
  async getWeeklyDisposalSummary(projectId, weeks = 4) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    if (!client) return []

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (weeks * 7))

    const { data, error } = await client
      .from('disposal_loads')
      .select('load_type, load_count, work_date')
      .eq('project_id', projectId)
      .gte('work_date', startDate.toISOString().split('T')[0])
      .lte('work_date', endDate.toISOString().split('T')[0])
      .order('work_date', { ascending: true })

    if (error) throw error

    // Group by week and load type
    const weeklyData = {}
    data?.forEach(row => {
      const date = new Date(row.work_date)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { week: weekKey, concrete: 0, trash: 0, metals: 0, hazardous_waste: 0 }
      }
      weeklyData[weekKey][row.load_type] += row.load_count
    })

    return Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week))
  },

  // ============================================
  // Photo Storage
  // ============================================

  async uploadPhoto(companyId, projectId, ticketId, file) {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const start = performance.now()
    const fileSize = file.size || 0

    // Create unique filename with secure random ID
    const timestamp = Date.now()
    const array = new Uint8Array(6)
    crypto.getRandomValues(array)
    const randomId = Array.from(array, b => b.toString(36)).join('')
    const extension = file.name?.split('.').pop() || 'jpg'
    const fileName = `${timestamp}-${randomId}.${extension}`

    // Path: company/project/ticket/filename
    const filePath = `${companyId}/${projectId}/${ticketId}/${fileName}`

    try {
      const { data, error } = await client.storage
        .from('tm-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      const duration = Math.round(performance.now() - start)
      observe.storage('upload', {
        company_id: companyId,
        project_id: projectId,
        size: fileSize,
        duration,
        success: !error
      })

      if (error) throw error

      // Return the storage path. Callers store this in the DB.
      // Use db.resolvePhotoUrl(path) to get a displayable signed URL.
      return filePath
    } catch (error) {
      observe.error('storage', {
        message: error.message,
        operation: 'uploadPhoto',
        company_id: companyId,
        project_id: projectId
      })
      throw error
    }
  },

  async uploadPhotoBase64(companyId, projectId, ticketId, base64Data, fileName = 'photo.jpg') {
    if (!isSupabaseConfigured) return null

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    // Convert base64 to blob
    const base64Response = await fetch(base64Data)
    const blob = await base64Response.blob()

    // Create unique filename with secure random ID
    const timestamp = Date.now()
    const array = new Uint8Array(6)
    crypto.getRandomValues(array)
    const randomId = Array.from(array, b => b.toString(36)).join('')
    const extension = fileName.split('.').pop() || 'jpg'
    const newFileName = `${timestamp}-${randomId}.${extension}`

    // Path: company/project/ticket/filename
    const filePath = `${companyId}/${projectId}/${ticketId}/${newFileName}`

    const { data, error } = await client.storage
      .from('tm-photos')
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: blob.type
      })

    if (error) throw error

    // Return the storage path (bucket is now private; use resolvePhotoUrl for display).
    return filePath
  },

  // Convert a stored photo URL or storage path to a signed URL (1-hour expiry).
  // Handles both old public URLs ("https://…/public/tm-photos/…") and
  // new storage paths ("companyId/projectId/ticketId/file.jpg") transparently.
  async resolvePhotoUrl(urlOrPath) {
    if (!urlOrPath || !isSupabaseConfigured) return urlOrPath
    let filePath
    if (urlOrPath.startsWith('http')) {
      try {
        const urlObj = new URL(urlOrPath)
        const match = urlObj.pathname.match(/\/(?:public\/)?tm-photos\/(.+)$/)
        if (!match) return urlOrPath
        filePath = decodeURIComponent(match[1])
      } catch { return urlOrPath }
    } else {
      filePath = urlOrPath
    }
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.storage.from('tm-photos').createSignedUrl(filePath, 3600)
      if (error || !data?.signedUrl) return urlOrPath
      return data.signedUrl
    } catch { return urlOrPath }
  },

  // Batch-convert an array of stored photo URLs/paths to signed URLs (1-hour expiry).
  async resolvePhotoUrls(urlsOrPaths) {
    if (!isSupabaseConfigured || !urlsOrPaths?.length) return urlsOrPaths || []
    const paths = []
    const indices = []
    for (let i = 0; i < urlsOrPaths.length; i++) {
      const v = urlsOrPaths[i]
      if (!v) continue
      let fp
      if (v.startsWith('http')) {
        try {
          const urlObj = new URL(v)
          const match = urlObj.pathname.match(/\/(?:public\/)?tm-photos\/(.+)$/)
          if (match) fp = decodeURIComponent(match[1])
        } catch { /* skip */ }
      } else {
        fp = v
      }
      if (fp) { paths.push(fp); indices.push(i) }
    }
    if (!paths.length) return urlsOrPaths
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.storage.from('tm-photos').createSignedUrls(paths, 3600)
      if (error || !data) return urlsOrPaths
      const result = [...urlsOrPaths]
      data.forEach((item, j) => {
        if (item.signedUrl) result[indices[j]] = item.signedUrl
      })
      return result
    } catch { return urlsOrPaths }
  },

  async deletePhoto(photoUrlOrPath) {
    if (!isSupabaseConfigured || !photoUrlOrPath) return

    let filePath
    if (photoUrlOrPath.startsWith('http')) {
      // Legacy: extract path from a full public URL
      try {
        const url = new URL(photoUrlOrPath)
        const pathMatch = url.pathname.match(/\/tm-photos\/(.+)$/)
        if (!pathMatch) return
        filePath = pathMatch[1]
      } catch { return }
    } else {
      // New format: already a storage path
      filePath = photoUrlOrPath
    }

    const { error } = await supabase.storage
      .from('tm-photos')
      .remove([filePath])

    if (error) throw error
  },

  // ============================================
  // Photo Verification & Reliability
  // ============================================

  // Verify that a photo URL is accessible (exists in storage)
  async verifyPhotoAccessible(photoUrl) {
    if (!isSupabaseConfigured || !photoUrl) return { accessible: false, error: 'Invalid URL' }

    try {
      // Try a HEAD request to check if the photo exists
      const response = await fetch(photoUrl, { method: 'HEAD' })
      return {
        accessible: response.ok,
        status: response.status,
        error: response.ok ? null : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        accessible: false,
        error: error.message || 'Network error'
      }
    }
  },

  // Verify all photos for a ticket and update verification status
  async verifyTicketPhotos(ticketId) {
    if (!isSupabaseConfigured) return { verified: false, issues: [] }

    try {
      // Get ticket with photos
      const { data: ticket, error: ticketError } = await supabase
        .from('t_and_m_tickets')
        .select('photos')
        .eq('id', ticketId)
        .single()

      if (ticketError) throw ticketError
      if (!ticket?.photos || ticket.photos.length === 0) {
        // No photos - mark as empty
        await supabase
          .from('t_and_m_tickets')
          .update({
            photos_verified_at: new Date().toISOString(),
            photos_verification_status: 'empty',
            photos_issue_count: 0
          })
          .eq('id', ticketId)

        return { verified: true, status: 'empty', issues: [] }
      }

      // Verify each photo
      const issues = []
      for (const photoUrl of ticket.photos) {
        const result = await this.verifyPhotoAccessible(photoUrl)
        if (!result.accessible) {
          issues.push({ url: photoUrl, error: result.error })
        }
      }

      // Update verification status
      const status = issues.length === 0 ? 'verified' : 'issues'
      await supabase
        .from('t_and_m_tickets')
        .update({
          photos_verified_at: new Date().toISOString(),
          photos_verification_status: status,
          photos_issue_count: issues.length
        })
        .eq('id', ticketId)

      return {
        verified: issues.length === 0,
        status,
        totalPhotos: ticket.photos.length,
        issues
      }
    } catch (error) {
      console.error('Error verifying ticket photos:', error)
      return { verified: false, error: error.message, issues: [] }
    }
  },

  // Add entry to photo upload queue for reliable upload tracking
  async queuePhotoUpload(ticketId, tempId, fileName, fileSize) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('photo_upload_queue')
      .insert({
        ticket_id: ticketId,
        temp_id: tempId,
        file_name: fileName,
        file_size_bytes: fileSize,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error queueing photo upload:', error)
      return null
    }
    return data
  },

  // Confirm a queued photo upload (calls database function)
  async confirmQueuedUpload(queueId, uploadedUrl, storagePath) {
    if (!isSupabaseConfigured) return false

    const { data, error } = await supabase.rpc('confirm_photo_upload', {
      p_queue_id: queueId,
      p_uploaded_url: uploadedUrl,
      p_storage_path: storagePath
    })

    if (error) {
      console.error('Error confirming photo upload:', error)
      return false
    }
    return data === true
  },

  // Mark a queued photo upload as failed
  async markQueuedUploadFailed(queueId, errorMessage) {
    if (!isSupabaseConfigured) return false

    const { data, error } = await supabase.rpc('mark_photo_upload_failed', {
      p_queue_id: queueId,
      p_error: errorMessage
    })

    if (error) {
      console.error('Error marking photo upload failed:', error)
      return false
    }
    return data === true
  },

  // Get pending photo uploads for a ticket
  async getPendingPhotoUploads(ticketId) {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase.rpc('get_pending_photo_uploads', {
      p_ticket_id: ticketId
    })

    if (error) {
      console.error('Error getting pending photo uploads:', error)
      return []
    }
    return data || []
  },

  // Log photo operation for audit trail
  async logPhotoOperation(ticketId, operation, details = {}) {
    if (!isSupabaseConfigured) return

    try {
      await supabase
        .from('photo_audit_log')
        .insert({
          ticket_id: ticketId,
          cor_id: details.corId || null,
          operation,
          photo_url: details.photoUrl || null,
          storage_path: details.storagePath || null,
          details: details.metadata ? details.metadata : null,
          error_message: details.error || null,
          triggered_by: details.triggeredBy || 'system'
        })
    } catch (error) {
      // Don't fail the main operation if logging fails
      console.error('Error logging photo operation:', error)
    }
  },

  // ============================================
  // COR Export Snapshots (Dispute-Ready Exports)
  // ============================================

  // Save a COR export snapshot for dispute/audit purposes
  async saveExportSnapshot(corId, snapshot, options = {}) {
    if (!isSupabaseConfigured) return null

    const {
      exportType = 'pdf',
      exportReason = null,
      clientEmail = null,
      clientName = null
    } = options

    try {
      const { data, error } = await supabase
        .from('cor_export_snapshots')
        .insert({
          cor_id: corId,
          export_type: exportType,
          export_reason: exportReason,
          cor_data: snapshot.cor_data,
          tickets_data: snapshot.tickets_data,
          photos_manifest: snapshot.photos_manifest,
          totals_snapshot: snapshot.totals_snapshot,
          checksum: snapshot.checksum,
          client_email: clientEmail,
          client_name: clientName
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error saving export snapshot:', error)
      return null
    }
  },

  // Get export history for a COR
  async getExportSnapshots(corId) {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('cor_export_snapshots')
      .select('id, exported_at, export_type, export_reason, client_name, client_email, checksum')
      .eq('cor_id', corId)
      .order('exported_at', { ascending: false })

    if (error) {
      console.error('Error fetching export snapshots:', error)
      return []
    }
    return data || []
  },

  // Get a specific export snapshot with full data
  async getExportSnapshot(snapshotId) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('cor_export_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single()

    if (error) {
      console.error('Error fetching export snapshot:', error)
      return null
    }
    return data
  },

  // ============================================
  // COR Export Jobs (Async Pipeline)
  // ============================================

  // Request a COR export (idempotent - returns existing job if key matches)
  async requestCORExport(corId, idempotencyKey, options = {}) {
    if (!isSupabaseConfigured) return null

    try {
      const user = await supabase.auth.getUser()
      const { data, error } = await supabase.rpc('request_cor_export', {
        p_cor_id: corId,
        p_idempotency_key: idempotencyKey,
        p_options: options,
        p_requested_by: user?.data?.user?.id || null
      })

      if (error) throw error
      return data?.[0] || null
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'requestCORExport', extra: { corId } })
      throw error
    }
  },

  // Get export job status
  async getExportJob(jobId) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('cor_export_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) {
      console.error('Error fetching export job:', error)
      return null
    }
    return data
  },

  // Get export jobs for a COR
  async getExportJobs(corId, limit = 10) {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('cor_export_jobs')
      .select('*')
      .eq('cor_id', corId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching export jobs:', error)
      return []
    }
    return data || []
  },

  // Update export job status
  async updateExportJobStatus(jobId, status, details = {}) {
    if (!isSupabaseConfigured) return null

    try {
      const { data, error } = await supabase.rpc('update_export_job_status', {
        p_job_id: jobId,
        p_status: status,
        p_snapshot_id: details.snapshotId || null,
        p_pdf_url: details.pdfUrl || null,
        p_error: details.error || null,
        p_error_details: details.errorDetails || null,
        p_metrics: details.metrics || null
      })

      if (error) throw error
      return data
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'updateExportJobStatus', extra: { jobId, status } })
      throw error
    }
  },

  // Get current valid snapshot for a COR (if exists and not stale)
  async getCurrentCORSnapshot(corId) {
    if (!isSupabaseConfigured) return null

    // First check if COR has been modified since last snapshot
    const { data: cor } = await supabase
      .from('change_orders')
      .select('version, last_snapshot_version')
      .eq('id', corId)
      .single()

    // If version changed, snapshot is stale
    if (!cor || cor.version !== cor.last_snapshot_version) {
      return null
    }

    // Get current snapshot
    const { data: snapshot } = await supabase
      .from('cor_export_snapshots')
      .select('*')
      .eq('cor_id', corId)
      .eq('is_current', true)
      .single()

    return snapshot || null
  },

  // Save a new snapshot and mark as current
  async saveCORSnapshot(snapshot, jobId) {
    if (!isSupabaseConfigured) return null

    try {
      // Mark previous snapshots as not current
      await supabase
        .from('cor_export_snapshots')
        .update({ is_current: false })
        .eq('cor_id', snapshot.corId)

      const user = await supabase.auth.getUser()

      // Insert new snapshot
      const { data, error } = await supabase
        .from('cor_export_snapshots')
        .insert({
          id: snapshot.snapshotId,
          cor_id: snapshot.corId,
          job_id: jobId,
          cor_version: snapshot.corVersion,
          cor_data: snapshot.corData,
          tickets_data: snapshot.ticketsData,
          photos_manifest: snapshot.photoManifest,
          totals_snapshot: snapshot.totals,
          checksum: snapshot.checksum,
          is_current: true,
          exported_by: user?.data?.user?.id || null
        })
        .select()
        .single()

      if (error) throw error

      // Update COR's last snapshot version
      await supabase
        .from('change_orders')
        .update({ last_snapshot_version: snapshot.corVersion })
        .eq('id', snapshot.corId)

      return data
    } catch (error) {
      observe.error('database', { message: error.message, operation: 'saveCORSnapshot', extra: { corId: snapshot.corId } })
      throw error
    }
  },

  // Update COR aggregated stats (call after ticket changes)
  async updateCORAggregatedStats(corId) {
    if (!isSupabaseConfigured) return

    try {
      await supabase.rpc('update_cor_aggregated_stats', { p_cor_id: corId })
    } catch (error) {
      console.error('Error updating COR aggregated stats:', error)
    }
  },

  // ============================================
  // Crew Check-In Functions
  // ============================================

  // Get today's crew check-in for a project
  async getCrewCheckin(projectId, date = null) {
    if (!isSupabaseConfigured) return null

    const checkDate = date || new Date().toISOString().split('T')[0]
    const client = getClient()

    const { data, error } = await client
      .from('crew_checkins')
      .select('*')
      .eq('project_id', projectId)
      .eq('check_in_date', checkDate)
      .maybeSingle() // Use maybeSingle to return null instead of 406 when no rows

    if (error) {
      console.error('Error fetching crew checkin:', error)
    }
    return data
  },

  // Create or update crew check-in
  async saveCrewCheckin(projectId, workers, createdBy = null, date = null) {
    if (!isSupabaseConfigured) return null

    const checkDate = date || new Date().toISOString().split('T')[0]

    // If offline, cache and queue action
    if (!getConnectionStatus()) {
      const checkin = {
        id: generateTempId(),
        project_id: projectId,
        check_in_date: checkDate,
        workers: workers,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
        _offline: true
      }
      await cacheCrewCheckin(checkin)
      await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
        projectId,
        workers,
        checkInDate: checkDate
      })
      return checkin
    }

    const client = getClient()
    if (!client) {
      // Offline fallback - queue for later
      const checkin = {
        id: generateTempId(),
        project_id: projectId,
        check_in_date: checkDate,
        workers: workers,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
        _offline: true
      }
      await cacheCrewCheckin(checkin)
      await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
        projectId,
        workers,
        checkInDate: checkDate
      })
      return checkin
    }

    const { data, error } = await client
      .from('crew_checkins')
      .upsert({
        project_id: projectId,
        check_in_date: checkDate,
        workers: workers,
        created_by: createdBy,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,check_in_date'
      })
      .select()
      .single()

    if (error) {
      // If network error, queue for later
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const checkin = {
          id: generateTempId(),
          project_id: projectId,
          check_in_date: checkDate,
          workers: workers,
          _offline: true
        }
        await cacheCrewCheckin(checkin)
        await addPendingAction(ACTION_TYPES.SAVE_CREW_CHECKIN, {
          projectId,
          workers,
          checkInDate: checkDate
        })
        return checkin
      }
      console.error('Error saving crew checkin:', error)
      throw error
    }

    // Update cache with server response
    if (data) {
      cacheCrewCheckin(data).catch(err => console.error('Failed to cache checkin:', err))
    }
    return data
  },

  // Add a worker to today's check-in
  async addCrewMember(projectId, worker, createdBy = null) {
    if (!isSupabaseConfigured) return null
    
    const existing = await this.getCrewCheckin(projectId)
    const workers = existing?.workers || []
    
    // Check if already exists
    if (!workers.find(w => w.name.toLowerCase() === worker.name.toLowerCase())) {
      workers.push(worker)
      return await this.saveCrewCheckin(projectId, workers, createdBy)
    }
    return existing
  },

  // Remove a worker from today's check-in
  async removeCrewMember(projectId, workerName) {
    if (!isSupabaseConfigured) return null
    
    const existing = await this.getCrewCheckin(projectId)
    if (!existing) return null
    
    const workers = existing.workers.filter(
      w => w.name.toLowerCase() !== workerName.toLowerCase()
    )
    return await this.saveCrewCheckin(projectId, workers, existing.created_by)
  },

  // Get crew check-ins for a project (for office view)
  async getCrewCheckinHistory(projectId, limit = 30) {
    if (!isSupabaseConfigured) return []
    
    const { data, error } = await supabase
      .from('crew_checkins')
      .select('*')
      .eq('project_id', projectId)
      .order('check_in_date', { ascending: false })
      .limit(limit)
    
    if (error) {
      console.error('Error fetching crew history:', error)
      return []
    }
    return data || []
  },

  // Get unique recent workers from past check-ins (for quick-add feature)
  async getRecentWorkers(projectId, limit = 30) {
    if (!isSupabaseConfigured) return []

    const history = await this.getCrewCheckinHistory(projectId, limit)

    // Extract unique workers from all check-ins
    const workerMap = new Map()
    history.forEach(checkin => {
      (checkin.workers || []).forEach(worker => {
        const key = worker.name.toLowerCase()
        if (!workerMap.has(key)) {
          workerMap.set(key, {
            name: worker.name,
            role: worker.role,
            labor_class_id: worker.labor_class_id || null,
            lastSeen: checkin.check_in_date
          })
        }
      })
    })

    // Return as array sorted by name
    return Array.from(workerMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  },

  // Get labor rates for a company (for man day calculations)
  async getLaborRates(companyId, workType = null, jobType = null) {
    if (!isSupabaseConfigured) return []

    let query = supabase
      .from('labor_rates')
      .select('*')
      .eq('company_id', companyId)

    if (workType) query = query.eq('work_type', workType)
    if (jobType) query = query.eq('job_type', jobType)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching labor rates:', error)
      return []
    }
    return data || []
  },

  // Calculate man day costs for a project
  async calculateManDayCosts(projectId, companyId, workType, jobType) {
    if (!isSupabaseConfigured) return { totalCost: 0, totalManDays: 0, breakdown: [] }

    // Get crew check-in history
    const crewHistory = await this.getCrewCheckinHistory(projectId, 365)

    // Get labor rates for this work/job type
    const laborRates = await this.getLaborRates(companyId, workType, jobType)

    // Build rates lookup: { role: regularRate }
    const ratesLookup = {}
    laborRates.forEach(rate => {
      ratesLookup[rate.role.toLowerCase()] = parseFloat(rate.regular_rate) || 0
    })

    // Calculate costs
    let totalCost = 0
    let totalManDays = 0
    const byRole = {}
    const byDate = []

    crewHistory.forEach(checkin => {
      const workers = checkin.workers || []
      let dayCost = 0
      const dayBreakdown = {}

      workers.forEach(worker => {
        const role = (worker.role || 'laborer').toLowerCase()
        const rate = ratesLookup[role] || 0

        if (!dayBreakdown[role]) {
          dayBreakdown[role] = { count: 0, cost: 0 }
        }
        dayBreakdown[role].count++
        dayBreakdown[role].cost += rate
        dayCost += rate

        // Track by role totals
        if (!byRole[role]) {
          byRole[role] = { count: 0, cost: 0, rate }
        }
        byRole[role].count++
        byRole[role].cost += rate
      })

      totalCost += dayCost
      totalManDays += workers.length

      byDate.push({
        date: checkin.check_in_date,
        workers: workers.length,
        cost: dayCost,
        breakdown: dayBreakdown
      })
    })

    return {
      totalCost,
      totalManDays,
      byRole,
      byDate,
      daysWorked: crewHistory.length
    }
  },

  // ============================================
  // Daily Field Reports
  // ============================================

  // Get or create today's report for a project
  async getDailyReport(projectId, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]
    const client = getClient()

    const { data, error } = await client
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .eq('report_date', reportDate)
      .maybeSingle() // Use maybeSingle to return null instead of 406 when no report exists

    if (error) {
      console.error('Error fetching daily report:', error)
    }
    return data
  },

  // Compile daily report data from other tables (parallelized for speed)
  async compileDailyReport(projectId, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]
    const client = getClient()

    // Run all queries in parallel for faster loading
    const [crew, areasResult, ticketsResult] = await Promise.all([
      this.getCrewCheckin(projectId, reportDate),
      client.from('areas').select('*').eq('project_id', projectId),
      client.from('t_and_m_tickets').select('*').eq('project_id', projectId).eq('work_date', reportDate)
    ])

    const areas = areasResult?.data || []
    const tickets = ticketsResult?.data || []

    const completedToday = areas.filter(a =>
      a.status === 'done' &&
      a.completed_at?.startsWith(reportDate)
    )

    const photosCount = tickets.reduce((sum, t) => sum + (t.photos?.length || 0), 0)

    return {
      crew_count: crew?.workers?.length || 0,
      crew_list: crew?.workers || [],
      tasks_completed: completedToday.length,
      tasks_total: areas.length,
      completed_tasks: completedToday.map(a => ({ name: a.name, group: a.group_name })),
      tm_tickets_count: tickets.length,
      photos_count: photosCount
    }
  },

  // Save/update daily report
  async saveDailyReport(projectId, reportData, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]

    // If offline, cache and queue action
    if (!getConnectionStatus()) {
      const report = {
        id: generateTempId(),
        project_id: projectId,
        report_date: reportDate,
        ...reportData,
        updated_at: new Date().toISOString(),
        _offline: true
      }
      await cacheDailyReport(report)
      // Note: saveDailyReport alone doesn't queue - submitDailyReport handles the full flow
      return report
    }

    const client = getClient()
    const { data, error } = await client
      .from('daily_reports')
      .upsert({
        project_id: projectId,
        report_date: reportDate,
        ...reportData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,report_date'
      })
      .select()
      .single()

    if (error) {
      // If network error, cache locally
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const report = {
          id: generateTempId(),
          project_id: projectId,
          report_date: reportDate,
          ...reportData,
          _offline: true
        }
        await cacheDailyReport(report)
        return report
      }
      console.error('Error saving daily report:', error)
      throw error
    }

    // Update cache with server response
    if (data) {
      cacheDailyReport(data).catch(err => console.error('Failed to cache report:', err))
    }
    return data
  },

  // Submit daily report
  async submitDailyReport(projectId, submittedBy, date = null) {
    if (!isSupabaseConfigured) return null

    const reportDate = date || new Date().toISOString().split('T')[0]

    // If offline, queue the submission
    if (!getConnectionStatus()) {
      // Try to get cached report data
      const cachedReport = await getCachedDailyReport(projectId, reportDate)
      const report = {
        id: generateTempId(),
        project_id: projectId,
        report_date: reportDate,
        ...(cachedReport || {}),
        status: 'pending_sync',
        submitted_by: submittedBy,
        submitted_at: new Date().toISOString(),
        _offline: true
      }
      await cacheDailyReport(report)
      await addPendingAction(ACTION_TYPES.SUBMIT_DAILY_REPORT, {
        projectId,
        reportData: cachedReport || {},
        submittedBy
      })
      return report
    }

    // First compile latest data
    const compiled = await this.compileDailyReport(projectId, reportDate)

    const client = getClient()
    if (!client) {
      throw new Error('Database client not available')
    }

    const { data, error } = await client
      .from('daily_reports')
      .upsert({
        project_id: projectId,
        report_date: reportDate,
        ...compiled,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: submittedBy,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,report_date'
      })
      .select()
      .single()

    if (error) {
      // If network error, queue for later
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const report = {
          id: generateTempId(),
          project_id: projectId,
          report_date: reportDate,
          ...compiled,
          status: 'pending_sync',
          submitted_by: submittedBy,
          _offline: true
        }
        await cacheDailyReport(report)
        await addPendingAction(ACTION_TYPES.SUBMIT_DAILY_REPORT, {
          projectId,
          reportData: compiled,
          submittedBy
        })
        return report
      }
      console.error('Error submitting daily report:', error)
      throw error
    }

    // Update cache
    if (data) {
      cacheDailyReport(data).catch(err => console.error('Failed to cache report:', err))
    }
    return data
  },

  // Get daily reports for office view
  async getDailyReports(projectId, limit = 30) {
    if (!isSupabaseConfigured) return []
    
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
      .limit(limit)
    
    if (error) {
      console.error('Error fetching daily reports:', error)
      return []
    }
    return data || []
  },

  // ============================================
  // Messages (Two-way communication)
  // ============================================

  // Send a message
  async sendMessage(projectId, message, senderType, senderName, senderUserId = null, photoUrl = null, messageType = 'general', parentId = null) {
    if (!isSupabaseConfigured) return null

    // If offline, cache and queue message
    if (!getConnectionStatus()) {
      const msg = {
        id: generateTempId(),
        project_id: projectId,
        sender_type: senderType,
        sender_name: senderName,
        sender_user_id: senderUserId,
        message: message,
        photo_url: photoUrl,
        message_type: messageType,
        parent_message_id: parentId,
        created_at: new Date().toISOString(),
        _offline: true
      }
      await cacheMessage(msg)
      await addPendingAction(ACTION_TYPES.SEND_MESSAGE, {
        projectId,
        senderType,
        senderName,
        content: message
      })
      return msg
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        project_id: projectId,
        sender_type: senderType,
        sender_name: senderName,
        sender_user_id: senderUserId,
        message: message,
        photo_url: photoUrl,
        message_type: messageType,
        parent_message_id: parentId
      })
      .select()
      .single()

    if (error) {
      // If network error, queue for later
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const msg = {
          id: generateTempId(),
          project_id: projectId,
          sender_type: senderType,
          sender_name: senderName,
          message: message,
          created_at: new Date().toISOString(),
          _offline: true
        }
        await cacheMessage(msg)
        await addPendingAction(ACTION_TYPES.SEND_MESSAGE, {
          projectId,
          senderType,
          senderName,
          content: message
        })
        return msg
      }
      console.error('Error sending message:', error)
      throw error
    }
    return data
  },

  // Get messages for a project
  async getMessages(projectId, limit = 50) {
    if (!isSupabaseConfigured) return []

    const client = getClient()
    const { data, error } = await client
      .from('messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return []
    }
    return data || []
  },

  // Get unread message count
  async getUnreadCount(projectId, viewerType) {
    if (!isSupabaseConfigured) return 0

    const client = getClient()
    // Field sees office messages, office sees field messages
    const senderType = viewerType === 'field' ? 'office' : 'field'

    const { count, error } = await client
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('sender_type', senderType)
      .eq('is_read', false)

    if (error) {
      return 0
    }
    return count || 0
  },

  // Mark messages as read
  async markMessagesRead(projectId, viewerType) {
    if (!isSupabaseConfigured) return

    const client = getClient()
    const senderType = viewerType === 'field' ? 'office' : 'field'

    await client
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('sender_type', senderType)
      .eq('is_read', false)
  },

  // ============================================
  // Material Requests
  // ============================================

  // Create material request
  async createMaterialRequest(projectId, items, requestedBy, neededBy = null, priority = 'normal', notes = null) {
    if (!isSupabaseConfigured) return null

    // If offline, queue the request
    if (!getConnectionStatus()) {
      const request = {
        id: generateTempId(),
        project_id: projectId,
        items: items,
        requested_by: requestedBy,
        needed_by: neededBy,
        priority: priority,
        notes: notes,
        status: 'pending_sync',
        created_at: new Date().toISOString(),
        _offline: true
      }
      await addPendingAction(ACTION_TYPES.CREATE_MATERIAL_REQUEST, {
        projectId,
        items,
        requestedBy,
        neededBy,
        priority,
        notes
      })
      return request
    }

    const { data, error } = await supabase
      .from('material_requests')
      .insert({
        project_id: projectId,
        items: items,
        requested_by: requestedBy,
        needed_by: neededBy,
        priority: priority,
        notes: notes
      })
      .select()
      .single()

    if (error) {
      // If network error, queue for later
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        const request = {
          id: generateTempId(),
          project_id: projectId,
          items: items,
          requested_by: requestedBy,
          status: 'pending_sync',
          _offline: true
        }
        await addPendingAction(ACTION_TYPES.CREATE_MATERIAL_REQUEST, {
          projectId,
          items,
          requestedBy,
          neededBy,
          priority,
          notes
        })
        return request
      }
      console.error('Error creating material request:', error)
      throw error
    }
    return data
  },

  // Get material requests for a project
  async getMaterialRequests(projectId, status = null) {
    if (!isSupabaseConfigured) return []
    
    let query = supabase
      .from('material_requests')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    
    if (status) {
      query = query.eq('status', status)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching material requests:', error)
      return []
    }
    return data || []
  },

  // Get pending requests count (for badge)
  async getPendingRequestsCount(projectId) {
    if (!isSupabaseConfigured) return 0
    
    const { count, error } = await supabase
      .from('material_requests')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'pending')
    
    if (error) return 0
    return count || 0
  },

  // Update material request status (office action)
  async updateMaterialRequest(requestId, status, respondedBy, responseNotes = null, expectedDelivery = null) {
    if (!isSupabaseConfigured) return null
    
    const updateData = {
      status: status,
      responded_by: respondedBy,
      responded_at: new Date().toISOString(),
      response_notes: responseNotes,
      updated_at: new Date().toISOString()
    }
    
    if (expectedDelivery) {
      updateData.expected_delivery = expectedDelivery
    }
    
    if (status === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
    }
    
    const { data, error } = await supabase
      .from('material_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating material request:', error)
      throw error
    }
    return data
  },

  // ============================================
  // Project Shares (Read-only Portal)
  // ============================================

  // Generate a unique share token using crypto for security
  generateShareToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const array = new Uint8Array(12)
    crypto.getRandomValues(array)
    return Array.from(array, b => chars[b % chars.length]).join('')
  },

  // Create a new project share
  async createProjectShare(projectId, createdBy, permissions, expiresAt = null) {
    if (!isSupabaseConfigured) {
      // Demo mode - store in localStorage
      const localData = getLocalData()
      if (!localData.projectShares) localData.projectShares = []

      const share = {
        id: crypto.randomUUID(),
        project_id: projectId,
        share_token: this.generateShareToken(),
        created_by: createdBy,
        expires_at: expiresAt,
        is_active: true,
        permissions: permissions,
        view_count: 0,
        last_viewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      localData.projectShares.push(share)
      setLocalData(localData)
      return share
    }

    // Use database function to generate unique token
    const { data: tokenData, error: tokenError } = await supabase.rpc('generate_share_token')
    if (tokenError) {
      console.error('Error generating share token:', tokenError)
      throw tokenError
    }

    const { data, error } = await supabase
      .from('project_shares')
      .insert({
        project_id: projectId,
        share_token: tokenData,
        created_by: createdBy,
        expires_at: expiresAt,
        permissions: permissions
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating project share:', error)
      throw error
    }
    return data
  },

  // Get share by token (public access)
  async getShareByToken(token) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return null

      const share = localData.projectShares.find(s =>
        s.share_token === token &&
        s.is_active &&
        (!s.expires_at || new Date(s.expires_at) > new Date())
      )

      if (share) {
        // Increment view count
        share.view_count++
        share.last_viewed_at = new Date().toISOString()
        setLocalData(localData)
      }

      return share
    }

    const { data, error } = await supabase
      .from('project_shares')
      .select('*, projects(*)')
      .eq('share_token', token)
      .eq('is_active', true)
      .single()

    if (error) {
      console.error('Error fetching share by token:', error)
      return null
    }

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return null
    }

    // Increment view count
    await supabase.rpc('increment_share_view_count', { token })

    return data
  },

  // Get all shares for a project
  async getProjectShares(projectId) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return []

      return localData.projectShares.filter(s => s.project_id === projectId)
    }

    const { data, error } = await supabase
      .from('project_shares')
      .select('*, users(name, email)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching project shares:', error)
      return []
    }
    return data || []
  },

  // Update share (e.g., change permissions or expiration)
  async updateProjectShare(shareId, updates) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return null

      const shareIndex = localData.projectShares.findIndex(s => s.id === shareId)
      if (shareIndex === -1) return null

      localData.projectShares[shareIndex] = {
        ...localData.projectShares[shareIndex],
        ...updates,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.projectShares[shareIndex]
    }

    const { data, error } = await supabase
      .from('project_shares')
      .update(updates)
      .eq('id', shareId)
      .select()
      .single()

    if (error) {
      console.error('Error updating project share:', error)
      throw error
    }
    return data
  },

  // Revoke a share (deactivate)
  async revokeProjectShare(shareId) {
    return this.updateProjectShare(shareId, { is_active: false })
  },

  // Delete a share permanently
  async deleteProjectShare(shareId) {
    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      if (!localData.projectShares) return

      localData.projectShares = localData.projectShares.filter(s => s.id !== shareId)
      setLocalData(localData)
      return
    }

    const { error } = await supabase
      .from('project_shares')
      .delete()
      .eq('id', shareId)

    if (error) {
      console.error('Error deleting project share:', error)
      throw error
    }
  },

  // Get public project data (filtered by permissions)
  async getPublicProjectData(shareToken) {
    const share = await this.getShareByToken(shareToken)
    if (!share) return null

    const projectId = share.project_id || share.projects?.id

    if (!isSupabaseConfigured) {
      // Demo mode
      const localData = getLocalData()
      const project = localData.projects.find(p => p.id === projectId)
      if (!project) return null

      const areas = localData.areas.filter(a => a.project_id === projectId)

      // Calculate progress
      const totalWeight = areas.reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      const completedWeight = areas
        .filter(a => a.status === 'done')
        .reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

      return {
        share,
        project,
        progress,
        areas: share.permissions.progress ? areas : [],
        photos: [],
        dailyReports: [],
        tmTickets: []
      }
    }

    // Get project details
    const project = share.projects || await this.getProject(projectId)
    if (!project) return null

    // Build response based on permissions
    const result = {
      share,
      project,
      areas: [],
      photos: [],
      dailyReports: [],
      tmTickets: []
    }

    // Get areas for progress calculation
    if (share.permissions.progress) {
      result.areas = await this.getAreas(projectId)

      // Calculate progress
      const totalWeight = result.areas.reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      const completedWeight = result.areas
        .filter(a => a.status === 'done')
        .reduce((sum, area) => sum + parseFloat(area.weight || 0), 0)
      result.progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
    }

    // Get photos if permitted
    if (share.permissions.photos) {
      const { data: tickets } = await supabase
        .from('t_and_m_tickets')
        .select('photos, work_date')
        .eq('project_id', projectId)
        .not('photos', 'is', null)
        .order('work_date', { ascending: false })
        .limit(20)

      result.photos = tickets?.flatMap(t =>
        (t.photos || []).map(photo => ({
          url: photo,
          date: t.work_date
        }))
      ) || []
    }

    // Get daily reports if permitted
    if (share.permissions.daily_reports) {
      const { data: reports } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false })
        .limit(10)

      result.dailyReports = reports || []
    }

    // Get T&M tickets if permitted
    if (share.permissions.tm_tickets) {
      result.tmTickets = await this.getTMTickets(projectId)
    }

    return result
  },

  // ============================================
  // Injury Reports
  // ============================================

  // Create an injury report
  async createInjuryReport(reportData) {
    if (!isSupabaseConfigured) {
      // Demo mode - store in localStorage
      const localData = getLocalData()
      if (!localData.injuryReports) localData.injuryReports = []

      const report = {
        id: crypto.randomUUID(),
        ...reportData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      localData.injuryReports.push(report)
      setLocalData(localData)
      return report
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .insert(reportData)
      .select()
      .single()

    if (error) {
      console.error('Error creating injury report:', error)
      throw error
    }
    return data
  },

  // Get all injury reports for a project
  async getInjuryReports(projectId) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return []
      return localData.injuryReports
        .filter(r => r.project_id === projectId)
        .sort((a, b) => new Date(b.incident_date) - new Date(a.incident_date))
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('incident_date', { ascending: false })

    if (error) {
      console.error('Error fetching injury reports:', error)
      return []
    }
    return data || []
  },

  // Get all injury reports for a company
  async getCompanyInjuryReports(companyId, status = null) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return []
      let reports = localData.injuryReports.filter(r => r.company_id === companyId)
      if (status) {
        reports = reports.filter(r => r.status === status)
      }
      return reports.sort((a, b) => new Date(b.incident_date) - new Date(a.incident_date))
    }

    let query = supabase
      .from('injury_reports')
      .select('*, projects(name)')
      .eq('company_id', companyId)
      .order('incident_date', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching company injury reports:', error)
      return []
    }
    return data || []
  },

  // Get a single injury report
  async getInjuryReport(reportId) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null
      return localData.injuryReports.find(r => r.id === reportId)
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .select('*, projects(name, pin), users(name, email)')
      .eq('id', reportId)
      .single()

    if (error) {
      console.error('Error fetching injury report:', error)
      return null
    }
    return data
  },

  // Update an injury report
  async updateInjuryReport(reportId, updates) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null

      const reportIndex = localData.injuryReports.findIndex(r => r.id === reportId)
      if (reportIndex === -1) return null

      localData.injuryReports[reportIndex] = {
        ...localData.injuryReports[reportIndex],
        ...updates,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.injuryReports[reportIndex]
    }

    const { data, error } = await supabase
      .from('injury_reports')
      .update(updates)
      .eq('id', reportId)
      .select()
      .single()

    if (error) {
      console.error('Error updating injury report:', error)
      throw error
    }
    return data
  },

  // Close an injury report
  async closeInjuryReport(reportId, userId) {
    return this.updateInjuryReport(reportId, {
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: userId
    })
  },

  // Delete an injury report
  async deleteInjuryReport(reportId) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return

      localData.injuryReports = localData.injuryReports.filter(r => r.id !== reportId)
      setLocalData(localData)
      return
    }

    const { error } = await supabase
      .from('injury_reports')
      .delete()
      .eq('id', reportId)

    if (error) {
      console.error('Error deleting injury report:', error)
      throw error
    }
  },

  // Get injury statistics for a company
  async getInjuryStatistics(companyId, startDate = null, endDate = null) {
    if (!isSupabaseConfigured) {
      // Demo mode - calculate locally
      const localData = getLocalData()
      if (!localData.injuryReports) {
        return {
          total_incidents: 0,
          minor_injuries: 0,
          serious_injuries: 0,
          critical_injuries: 0,
          near_misses: 0,
          osha_recordable: 0,
          total_days_away: 0,
          total_restricted_days: 0
        }
      }

      let reports = localData.injuryReports.filter(r => r.company_id === companyId)

      if (startDate) {
        reports = reports.filter(r => new Date(r.incident_date) >= new Date(startDate))
      }
      if (endDate) {
        reports = reports.filter(r => new Date(r.incident_date) <= new Date(endDate))
      }

      return {
        total_incidents: reports.length,
        minor_injuries: reports.filter(r => r.injury_type === 'minor').length,
        serious_injuries: reports.filter(r => r.injury_type === 'serious').length,
        critical_injuries: reports.filter(r => r.injury_type === 'critical').length,
        near_misses: reports.filter(r => r.injury_type === 'near_miss').length,
        osha_recordable: reports.filter(r => r.osha_recordable).length,
        total_days_away: reports.reduce((sum, r) => sum + (r.days_away_from_work || 0), 0),
        total_restricted_days: reports.reduce((sum, r) => sum + (r.restricted_work_days || 0), 0)
      }
    }

    const { data, error } = await supabase.rpc('get_injury_statistics', {
      comp_id: companyId,
      start_date: startDate,
      end_date: endDate
    })

    if (error) {
      console.error('Error fetching injury statistics:', error)
      return null
    }
    return data[0] || null
  },

  // Add a witness to an injury report
  async addWitness(reportId, witness) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null

      const reportIndex = localData.injuryReports.findIndex(r => r.id === reportId)
      if (reportIndex === -1) return null

      const report = localData.injuryReports[reportIndex]
      const witnesses = report.witnesses || []
      witnesses.push(witness)

      localData.injuryReports[reportIndex] = {
        ...report,
        witnesses,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.injuryReports[reportIndex]
    }

    const report = await this.getInjuryReport(reportId)
    if (!report) return null

    const witnesses = report.witnesses || []
    witnesses.push(witness)

    return this.updateInjuryReport(reportId, { witnesses })
  },

  // Remove a witness from an injury report
  async removeWitness(reportId, witnessIndex) {
    if (!isSupabaseConfigured) {
      const localData = getLocalData()
      if (!localData.injuryReports) return null

      const reportIndex = localData.injuryReports.findIndex(r => r.id === reportId)
      if (reportIndex === -1) return null

      const report = localData.injuryReports[reportIndex]
      const witnesses = report.witnesses || []
      witnesses.splice(witnessIndex, 1)

      localData.injuryReports[reportIndex] = {
        ...report,
        witnesses,
        updated_at: new Date().toISOString()
      }
      setLocalData(localData)
      return localData.injuryReports[reportIndex]
    }

    const report = await this.getInjuryReport(reportId)
    if (!report) return null

    const witnesses = report.witnesses || []
    witnesses.splice(witnessIndex, 1)

    return this.updateInjuryReport(reportId, { witnesses })
  },

  // ============================================
  // Notification Preferences
  // ============================================

  // Get all users in a company (for notification settings)
  async getCompanyUsers(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          user_id,
          role,
          users (
            id,
            name,
            email
          )
        `)
        .eq('company_id', companyId)

      if (error) {
        console.error('Error fetching company users:', error)
        return []
      }
      return data?.map(uc => ({
        id: uc.user_id,
        name: uc.users?.name || uc.users?.email,
        email: uc.users?.email,
        role: uc.role
      })) || []
    }
    return []
  },

  // Get notification preferences for a project
  async getProjectNotificationPreferences(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select(`
          *,
          users (
            id,
            name,
            email
          )
        `)
        .eq('project_id', projectId)

      if (error) {
        console.error('Error fetching notification preferences:', error)
        return []
      }
      return data || []
    }
    // Demo mode - use localStorage
    const localData = getLocalData()
    if (!localData.notificationPreferences) return []
    return localData.notificationPreferences.filter(np => np.project_id === projectId)
  },

  // Get notification preferences for a user across all projects
  async getUserNotificationPreferences(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select(`
          *,
          projects (
            id,
            name
          )
        `)
        .eq('user_id', userId)

      if (error) {
        console.error('Error fetching user notification preferences:', error)
        return []
      }
      return data || []
    }
    const localData = getLocalData()
    if (!localData.notificationPreferences) return []
    return localData.notificationPreferences.filter(np => np.user_id === userId)
  },

  // Set notification preferences for a user on a project
  async setNotificationPreference(projectId, userId, notificationTypes) {
    if (isSupabaseConfigured) {
      // Upsert - update if exists, insert if not
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert({
          project_id: projectId,
          user_id: userId,
          notification_types: notificationTypes,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'project_id,user_id'
        })
        .select()
        .single()

      if (error) {
        console.error('Error setting notification preference:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPreferences) {
      localData.notificationPreferences = []
    }

    const existingIndex = localData.notificationPreferences.findIndex(
      np => np.project_id === projectId && np.user_id === userId
    )

    const pref = {
      id: existingIndex >= 0 ? localData.notificationPreferences[existingIndex].id : crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      notification_types: notificationTypes,
      created_at: existingIndex >= 0 ? localData.notificationPreferences[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (existingIndex >= 0) {
      localData.notificationPreferences[existingIndex] = pref
    } else {
      localData.notificationPreferences.push(pref)
    }

    setLocalData(localData)
    return pref
  },

  // Remove notification preferences for a user on a project
  async removeNotificationPreference(projectId, userId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('notification_preferences')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) {
        console.error('Error removing notification preference:', error)
        throw error
      }
      return true
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPreferences) return true
    localData.notificationPreferences = localData.notificationPreferences.filter(
      np => !(np.project_id === projectId && np.user_id === userId)
    )
    setLocalData(localData)
    return true
  },

  // Bulk set notification preferences for multiple users on a project
  async setProjectNotificationPreferences(projectId, userPreferences) {
    // userPreferences is an array of { userId, notificationTypes }
    const results = []
    for (const pref of userPreferences) {
      if (pref.notificationTypes && pref.notificationTypes.length > 0) {
        const result = await this.setNotificationPreference(projectId, pref.userId, pref.notificationTypes)
        results.push(result)
      } else {
        await this.removeNotificationPreference(projectId, pref.userId)
      }
    }
    return results
  },

  // ============================================
  // Notification Presets (Company-wide roles)
  // ============================================

  // Get notification presets for a company
  async getNotificationPresets(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_presets')
        .select('*')
        .eq('company_id', companyId)
        .order('name')

      if (error) {
        console.error('Error fetching notification presets:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) {
      // Return default presets
      return [
        { id: 'preset-1', name: 'Project Manager', notification_types: ['message', 'material_request', 'injury_report', 'tm_ticket'], company_id: companyId },
        { id: 'preset-2', name: 'Safety Officer', notification_types: ['injury_report'], company_id: companyId },
        { id: 'preset-3', name: 'Purchasing', notification_types: ['material_request'], company_id: companyId },
        { id: 'preset-4', name: 'Accounting', notification_types: ['tm_ticket'], company_id: companyId }
      ]
    }
    return localData.notificationPresets.filter(np => np.company_id === companyId)
  },

  // Create a notification preset
  async createNotificationPreset(companyId, name, notificationTypes) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_presets')
        .insert({
          company_id: companyId,
          name,
          notification_types: notificationTypes
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating notification preset:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) {
      localData.notificationPresets = []
    }
    const preset = {
      id: crypto.randomUUID(),
      company_id: companyId,
      name,
      notification_types: notificationTypes,
      created_at: new Date().toISOString()
    }
    localData.notificationPresets.push(preset)
    setLocalData(localData)
    return preset
  },

  // Update a notification preset
  async updateNotificationPreset(presetId, name, notificationTypes) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('notification_presets')
        .update({
          name,
          notification_types: notificationTypes,
          updated_at: new Date().toISOString()
        })
        .eq('id', presetId)
        .select()
        .single()

      if (error) {
        console.error('Error updating notification preset:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) return null
    const index = localData.notificationPresets.findIndex(p => p.id === presetId)
    if (index === -1) return null
    localData.notificationPresets[index] = {
      ...localData.notificationPresets[index],
      name,
      notification_types: notificationTypes,
      updated_at: new Date().toISOString()
    }
    setLocalData(localData)
    return localData.notificationPresets[index]
  },

  // Delete a notification preset
  async deleteNotificationPreset(presetId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('notification_presets')
        .delete()
        .eq('id', presetId)

      if (error) {
        console.error('Error deleting notification preset:', error)
        throw error
      }
      return true
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.notificationPresets) return true
    localData.notificationPresets = localData.notificationPresets.filter(p => p.id !== presetId)
    setLocalData(localData)
    return true
  },

  // ============================================
  // Dump Sites & Haul-Off Tracking
  // ============================================

  // Get all dump sites for a company
  async getDumpSites(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_sites')
        .select(`
          *,
          dump_site_rates (*)
        `)
        .eq('company_id', companyId)
        .eq('active', true)
        .order('name')

      if (error) {
        console.error('Error fetching dump sites:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.dumpSites || []).filter(ds => ds.company_id === companyId && ds.active)
  },

  // Create a new dump site
  async createDumpSite(companyId, name, address = '', notes = '') {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_sites')
        .insert({
          company_id: companyId,
          name,
          address,
          notes,
          active: true
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating dump site:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.dumpSites) localData.dumpSites = []
    const dumpSite = {
      id: crypto.randomUUID(),
      company_id: companyId,
      name,
      address,
      notes,
      active: true,
      created_at: new Date().toISOString(),
      dump_site_rates: []
    }
    localData.dumpSites.push(dumpSite)
    setLocalData(localData)
    return dumpSite
  },

  // Update a dump site
  async updateDumpSite(dumpSiteId, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_sites')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', dumpSiteId)
        .select()
        .single()

      if (error) {
        console.error('Error updating dump site:', error)
        throw error
      }
      return data
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.dumpSites) return null
    const index = localData.dumpSites.findIndex(ds => ds.id === dumpSiteId)
    if (index === -1) return null
    localData.dumpSites[index] = { ...localData.dumpSites[index], ...updates }
    setLocalData(localData)
    return localData.dumpSites[index]
  },

  // Delete (soft) a dump site
  async deleteDumpSite(dumpSiteId) {
    return this.updateDumpSite(dumpSiteId, { active: false })
  },

  // Set rate for a waste type at a dump site
  async setDumpSiteRate(dumpSiteId, wasteType, estimatedCostPerLoad, unit = 'load') {
    if (isSupabaseConfigured) {
      // First check if rate exists
      const { data: existing } = await supabase
        .from('dump_site_rates')
        .select('id')
        .eq('dump_site_id', dumpSiteId)
        .eq('waste_type', wasteType)
        .maybeSingle()

      if (existing) {
        // Update existing rate
        const { data, error } = await supabase
          .from('dump_site_rates')
          .update({
            estimated_cost_per_load: estimatedCostPerLoad,
            unit
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) {
          console.error('Error updating dump site rate:', error)
          throw error
        }
        return data
      } else {
        // Insert new rate
        const { data, error } = await supabase
          .from('dump_site_rates')
          .insert({
            dump_site_id: dumpSiteId,
            waste_type: wasteType,
            estimated_cost_per_load: estimatedCostPerLoad,
            unit
          })
          .select()
          .single()

        if (error) {
          console.error('Error inserting dump site rate:', error)
          throw error
        }
        return data
      }
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.dumpSiteRates) localData.dumpSiteRates = []
    const existingIndex = localData.dumpSiteRates.findIndex(
      r => r.dump_site_id === dumpSiteId && r.waste_type === wasteType
    )
    const rate = {
      id: existingIndex >= 0 ? localData.dumpSiteRates[existingIndex].id : crypto.randomUUID(),
      dump_site_id: dumpSiteId,
      waste_type: wasteType,
      estimated_cost_per_load: estimatedCostPerLoad,
      unit,
      created_at: new Date().toISOString()
    }
    if (existingIndex >= 0) {
      localData.dumpSiteRates[existingIndex] = rate
    } else {
      localData.dumpSiteRates.push(rate)
    }
    setLocalData(localData)
    return rate
  },

  // Get rates for a dump site
  async getDumpSiteRates(dumpSiteId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('dump_site_rates')
        .select('*')
        .eq('dump_site_id', dumpSiteId)

      if (error) {
        console.error('Error fetching dump site rates:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.dumpSiteRates || []).filter(r => r.dump_site_id === dumpSiteId)
  },

  // Get all haul-offs for a project
  async getHaulOffs(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('haul_offs')
        .select(`
          *,
          dump_sites (name)
        `)
        .eq('project_id', projectId)
        .order('work_date', { ascending: false })

      if (error) {
        console.error('Error fetching haul-offs:', error)
        return []
      }
      return data || []
    }
    // Demo mode
    const localData = getLocalData()
    return (localData.haulOffs || [])
      .filter(h => h.project_id === projectId)
      .sort((a, b) => new Date(b.work_date) - new Date(a.work_date))
  },

  // Create a haul-off event
  async createHaulOff(projectId, data) {
    const haulOff = {
      project_id: projectId,
      dump_site_id: data.dumpSiteId,
      waste_type: data.wasteType,
      loads: data.loads,
      hauling_company: data.haulingCompany || '',
      work_date: data.workDate,
      notes: data.notes || '',
      estimated_cost: data.estimatedCost || 0,
      created_by: data.createdBy || ''
    }

    if (isSupabaseConfigured) {
      const { data: result, error } = await supabase
        .from('haul_offs')
        .insert(haulOff)
        .select()
        .single()

      if (error) {
        console.error('Error creating haul-off:', error)
        throw error
      }
      return result
    }
    // Demo mode
    const localData = getLocalData()
    if (!localData.haulOffs) localData.haulOffs = []
    const newHaulOff = {
      ...haulOff,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    }
    localData.haulOffs.push(newHaulOff)
    setLocalData(localData)
    return newHaulOff
  },

  // Calculate haul-off costs for burn rate
  async calculateHaulOffCosts(projectId) {
    const haulOffs = await this.getHaulOffs(projectId)

    let totalCost = 0
    let totalLoads = 0
    const byWasteType = {}
    const byDate = []

    // Group by date for daily breakdown
    const dateMap = {}

    haulOffs.forEach(h => {
      const cost = parseFloat(h.estimated_cost) || 0
      const loads = parseInt(h.loads) || 0

      totalCost += cost
      totalLoads += loads

      // By waste type
      if (!byWasteType[h.waste_type]) {
        byWasteType[h.waste_type] = { loads: 0, cost: 0 }
      }
      byWasteType[h.waste_type].loads += loads
      byWasteType[h.waste_type].cost += cost

      // By date
      if (!dateMap[h.work_date]) {
        dateMap[h.work_date] = { date: h.work_date, loads: 0, cost: 0 }
      }
      dateMap[h.work_date].loads += loads
      dateMap[h.work_date].cost += cost
    })

    // Convert dateMap to sorted array
    Object.values(dateMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(d => byDate.push(d))

    const daysWithHaulOff = byDate.length

    return {
      totalCost,
      totalLoads,
      byWasteType,
      byDate,
      daysWithHaulOff,
      avgDailyHaulOffCost: daysWithHaulOff > 0 ? totalCost / daysWithHaulOff : 0
    }
  },

  // Subscribe to haul-off updates for a project
  subscribeToHaulOffs(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`haul_offs:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'haul_offs', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
  },

  // COR, Signature, Invoice, and Project Cost operations (extracted to corOps.js)
  ...corOps,
  // ============================================
  // DOCUMENT MANAGEMENT
  // ============================================

  // ---- FOLDER MANAGEMENT ----

  /**
   * Create a new document folder
   */
  async createFolder(companyId, projectId, folderData) {
    const client = getClient()

    const { data, error } = await client
      .from('document_folders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        name: folderData.name,
        description: folderData.description || null,
        icon: folderData.icon || 'folder',
        color: folderData.color || 'blue',
        sort_order: folderData.sort_order || 0,
        created_by: (await client.auth.getUser()).data.user?.id
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Get all folders for a project
   */
  async getProjectFolders(projectId) {
    const client = getClient()

    const { data, error } = await client
      .from('document_folders')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    // Get document counts for each folder
    const folderIds = data.map(f => f.id)
    if (folderIds.length > 0) {
      const { data: counts, error: countError } = await client
        .from('documents')
        .select('folder_id')
        .in('folder_id', folderIds)
        .is('archived_at', null)
        .eq('is_current', true)

      if (!countError && counts) {
        const countMap = {}
        counts.forEach(doc => {
          countMap[doc.folder_id] = (countMap[doc.folder_id] || 0) + 1
        })
        data.forEach(folder => {
          folder.document_count = countMap[folder.id] || 0
        })
      }
    }

    return data
  },

  /**
   * Update a folder
   */
  async updateFolder(folderId, updates) {
    const client = getClient()

    const { data, error } = await client
      .from('document_folders')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', folderId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Delete a folder (moves documents to unfiled)
   */
  async deleteFolder(folderId) {
    const client = getClient()

    // First, unassign all documents from this folder
    await client
      .from('documents')
      .update({ folder_id: null })
      .eq('folder_id', folderId)

    // Then delete the folder
    const { error } = await client
      .from('document_folders')
      .delete()
      .eq('id', folderId)

    if (error) throw error
    return true
  },

  /**
   * Reorder folders
   */
  async reorderFolders(projectId, folderOrder) {
    const client = getClient()

    // folderOrder is array of { id, sort_order }
    const updates = folderOrder.map(({ id, sort_order }) =>
      client
        .from('document_folders')
        .update({ sort_order, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('project_id', projectId)
    )

    await Promise.all(updates)
    return true
  },

  /**
   * Get documents in a specific folder
   */
  async getFolderDocuments(folderId, options = {}) {
    const client = getClient()
    const { page = 0, limit = 25 } = options

    let query = client
      .from('documents')
      .select('*', { count: 'exact' })
      .eq('folder_id', folderId)
      .is('archived_at', null)
      .eq('is_current', true)
      .order('uploaded_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    const { data, error, count } = await query

    if (error) throw error

    return {
      documents: data || [],
      totalCount: count || 0,
      hasMore: (count || 0) > (page + 1) * limit
    }
  },

  /**
   * Move document to folder
   */
  async moveDocumentToFolder(documentId, folderId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .update({ folder_id: folderId })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Get unfiled documents (no folder assigned)
   */
  async getUnfiledDocuments(projectId, options = {}) {
    const client = getClient()
    const { page = 0, limit = 25 } = options

    const { data, error, count } = await client
      .from('documents')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .is('folder_id', null)
      .is('archived_at', null)
      .eq('is_current', true)
      .order('uploaded_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (error) throw error

    return {
      documents: data || [],
      totalCount: count || 0,
      hasMore: (count || 0) > (page + 1) * limit
    }
  },

  // ---- DOCUMENT CRUD ----

  /**
   * Upload a document to project storage
   */
  async uploadDocument(companyId, projectId, file, metadata = {}) {
    const client = getClient()
    const startTime = Date.now()

    // Check project storage limit (250 MB default)
    const STORAGE_LIMIT = 250 * 1024 * 1024 // 250 MB
    const { data: usageData } = await client
      .from('documents')
      .select('file_size_bytes')
      .eq('project_id', projectId)
      .is('archived_at', null)

    const currentUsage = usageData?.reduce((sum, doc) => sum + (doc.file_size_bytes || 0), 0) || 0
    if (currentUsage + file.size > STORAGE_LIMIT) {
      const usedMB = Math.round(currentUsage / 1024 / 1024)
      const limitMB = Math.round(STORAGE_LIMIT / 1024 / 1024)
      throw new Error(`Project storage limit reached (${usedMB}/${limitMB} MB). Contact support to upgrade.`)
    }

    // Generate secure filename
    const timestamp = Date.now()
    const randomBytes = new Uint8Array(6)
    crypto.getRandomValues(randomBytes)
    const randomId = Array.from(randomBytes, b => b.toString(36)).join('')
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const fileName = `${timestamp}-${randomId}.${ext}`
    const storagePath = `${companyId}/${projectId}/documents/${fileName}`

    try {
      // Upload to storage
      const { data: storageData, error: storageError } = await client.storage
        .from('project-documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (storageError) throw storageError

      // Get public URL
      const { data: urlData } = client.storage
        .from('project-documents')
        .getPublicUrl(storagePath)

      const uploadedUrl = urlData.publicUrl

      // Determine approval status (contracts need approval)
      const approvalStatus = metadata.category === 'contracts' ? 'pending' : 'approved'

      // Create document record
      const { data: document, error: docError } = await client
        .from('documents')
        .insert({
          company_id: companyId,
          project_id: projectId,
          name: metadata.name || file.name.replace(/\.[^/.]+$/, ''),
          description: metadata.description || null,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
          storage_path: storagePath,
          folder_id: metadata.folderId || null,
          category: metadata.category || 'general',
          tags: metadata.tags || [],
          visibility: metadata.visibility || 'all',
          approval_status: approvalStatus,
          resource_type: metadata.resourceType || null,
          resource_id: metadata.resourceId || null,
          uploaded_by: (await client.auth.getUser()).data?.user?.id
        })
        .select()
        .single()

      if (docError) throw docError

      const duration = Date.now() - startTime
      observe.storage('document_upload', {
        company_id: companyId,
        project_id: projectId,
        file_size: file.size,
        mime_type: file.type,
        duration,
        success: true
      })

      return { ...document, url: uploadedUrl }
    } catch (error) {
      observe.error('storage', {
        message: error.message,
        operation: 'uploadDocument',
        company_id: companyId,
        project_id: projectId
      })
      throw error
    }
  },

  /**
   * Get documents for a project
   */
  async getProjectDocuments(projectId, { category = null, page = 0, limit = 25, includeArchived = false } = {}) {
    const client = getClient()

    let query = client
      .from('documents')
      .select('*', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('is_current', true)
      .order('uploaded_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (!includeArchived) {
      query = query.is('archived_at', null)
    }

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data, error, count } = await query

    if (error) throw error

    return {
      documents: data || [],
      totalCount: count || 0,
      hasMore: (page + 1) * limit < (count || 0),
      page,
      limit
    }
  },

  /**
   * Get a single document by ID
   */
  async getDocument(documentId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (error) throw error
    return data
  },

  /**
   * Get all versions of a document
   */
  async getDocumentVersions(documentId) {
    const client = getClient()

    // First get the document to find parent or self
    const { data: doc, error: docError } = await client
      .from('documents')
      .select('id, parent_document_id')
      .eq('id', documentId)
      .single()

    if (docError) throw docError

    // Get all versions (parent + all children with same parent)
    const parentId = doc.parent_document_id || documentId

    const { data, error } = await client
      .from('documents')
      .select('*')
      .or(`id.eq.${parentId},parent_document_id.eq.${parentId}`)
      .order('version', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Upload a new version of an existing document
   */
  async uploadDocumentVersion(parentDocumentId, companyId, projectId, file, metadata = {}) {
    const client = getClient()

    // Get the parent document to copy metadata and determine version
    const { data: parentDoc, error: parentError } = await client
      .from('documents')
      .select('*')
      .eq('id', parentDocumentId)
      .single()

    if (parentError) throw parentError

    // Get highest version number
    const { data: versions } = await client
      .from('documents')
      .select('version')
      .or(`id.eq.${parentDocumentId},parent_document_id.eq.${parentDocumentId}`)
      .order('version', { ascending: false })
      .limit(1)

    const newVersion = (versions?.[0]?.version || 1) + 1

    // Mark all previous versions as not current
    await client
      .from('documents')
      .update({ is_current: false })
      .or(`id.eq.${parentDocumentId},parent_document_id.eq.${parentDocumentId}`)

    // Upload the new version
    const result = await this.uploadDocument(companyId, projectId, file, {
      name: metadata.name || parentDoc.name,
      description: metadata.description || parentDoc.description,
      category: parentDoc.category,
      visibility: parentDoc.visibility,
      tags: parentDoc.tags,
      resourceType: parentDoc.resource_type,
      resourceId: parentDoc.resource_id
    })

    // Update the new document with version info
    const { data: updatedDoc, error: updateError } = await client
      .from('documents')
      .update({
        version: newVersion,
        is_current: true,
        parent_document_id: parentDocumentId
      })
      .eq('id', result.id)
      .select()
      .single()

    if (updateError) throw updateError

    // Log version creation
    await client.from('document_audit_log').insert({
      document_id: result.id,
      project_id: projectId,
      company_id: companyId,
      operation: 'version_created',
      details: { version: newVersion, parent_id: parentDocumentId },
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })

    return { ...result, ...updatedDoc }
  },

  /**
   * Update document metadata
   */
  async updateDocument(documentId, updates) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .update({
        name: updates.name,
        description: updates.description,
        category: updates.category,
        visibility: updates.visibility,
        tags: updates.tags
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Archive (soft delete) a document
   */
  async archiveDocument(documentId) {
    const client = getClient()
    const userId = (await client.auth.getUser()).data?.user?.id

    const { data, error } = await client
      .from('documents')
      .update({
        archived_at: new Date().toISOString(),
        archived_by: userId
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the deletion
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: data.project_id,
      company_id: data.company_id,
      operation: 'deleted',
      triggered_by: 'user',
      user_id: userId
    })

    return data
  },

  /**
   * Restore an archived document
   */
  async restoreDocument(documentId) {
    const client = getClient()
    const userId = (await client.auth.getUser()).data?.user?.id

    const { data, error } = await client
      .from('documents')
      .update({
        archived_at: null,
        archived_by: null
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the restoration
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: data.project_id,
      company_id: data.company_id,
      operation: 'restored',
      triggered_by: 'user',
      user_id: userId
    })

    return data
  },

  /**
   * Permanently delete a document (admin only)
   */
  async deleteDocumentPermanently(documentId) {
    const client = getClient()

    // Get document to find storage path
    const { data: doc, error: docError } = await client
      .from('documents')
      .select('storage_path, company_id, project_id')
      .eq('id', documentId)
      .single()

    if (docError) throw docError

    // Delete from storage
    if (doc.storage_path) {
      await client.storage
        .from('project-documents')
        .remove([doc.storage_path])
    }

    // Delete from database
    const { error } = await client
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (error) throw error
    return true
  },

  /**
   * Link a document to a resource (COR, T&M ticket, etc.)
   */
  async linkDocumentToResource(documentId, resourceType, resourceId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .update({
        resource_type: resourceType,
        resource_id: resourceId
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the link
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: data.project_id,
      company_id: data.company_id,
      operation: 'linked',
      details: { resource_type: resourceType, resource_id: resourceId },
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })

    return data
  },

  /**
   * Unlink a document from a resource
   */
  async unlinkDocumentFromResource(documentId) {
    const client = getClient()

    const { data: doc } = await client
      .from('documents')
      .select('resource_type, resource_id, project_id, company_id')
      .eq('id', documentId)
      .single()

    const { data, error } = await client
      .from('documents')
      .update({
        resource_type: null,
        resource_id: null
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the unlink
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: doc.project_id,
      company_id: doc.company_id,
      operation: 'unlinked',
      details: { resource_type: doc.resource_type, resource_id: doc.resource_id },
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })

    return data
  },

  /**
   * Get documents linked to a specific resource
   */
  async getResourceDocuments(resourceType, resourceId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .is('archived_at', null)
      .order('uploaded_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Approve a document (admin only)
   */
  async approveDocument(documentId) {
    const client = getClient()

    const { data, error } = await client.rpc('approve_document', {
      p_document_id: documentId
    })

    if (error) throw error
    return data
  },

  /**
   * Reject a document (admin only)
   */
  async rejectDocument(documentId, reason) {
    const client = getClient()

    const { data, error } = await client.rpc('reject_document', {
      p_document_id: documentId,
      p_reason: reason
    })

    if (error) throw error
    return data
  },

  /**
   * Get pending documents for approval
   */
  async getPendingDocuments(companyId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('*, project:projects(name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'pending')
      .is('archived_at', null)
      .order('uploaded_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Search documents by name/description
   */
  async searchDocuments(projectId, query) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .is('archived_at', null)
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order('uploaded_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return data || []
  },

  /**
   * Log document download/view
   */
  async logDocumentAccess(documentId, operation = 'downloaded') {
    const client = getClient()

    const { data: doc } = await client
      .from('documents')
      .select('project_id, company_id')
      .eq('id', documentId)
      .single()

    if (!doc) return

    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: doc.project_id,
      company_id: doc.company_id,
      operation,
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })
  }
}

// ============================================
// Offline Support Exports
// ============================================

// Re-export offline utilities for UI components
export {
  getConnectionStatus,
  onConnectionChange,
  getPendingActionCount,
  syncPendingActions
}

// Sync pending actions when coming back online
onConnectionChange(async (online) => {
  if (online && isSupabaseConfigured) {
    try {
      await syncPendingActions(db)
    } catch (err) {
      console.error('Error syncing pending actions:', err)
    }
  }
})

