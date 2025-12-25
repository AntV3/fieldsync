import { createClient } from '@supabase/supabase-js'
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
  addPendingAction,
  getPendingActionCount,
  syncPendingActions,
  ACTION_TYPES
} from './offlineManager'

// For demo purposes, we'll use a mock mode that falls back to localStorage
// In production, you would set these environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Check if Supabase is configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Initialize offline database
initOfflineDB().catch(err => console.error('Failed to init offline DB:', err))

// Create client only if configured
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Local storage fallback for demo mode
const STORAGE_KEY = 'fieldsync_data'
const USER_KEY = 'fieldsync_user'

const getLocalData = () => {
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : { projects: [], areas: [], users: [], assignments: [] }
}

const setLocalData = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const getLocalUser = () => {
  const user = localStorage.getItem(USER_KEY)
  return user ? JSON.parse(user) : null
}

const setLocalUser = (user) => {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_KEY)
  }
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
      // Demo mode - find local user
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
        console.log('Offline: returning cached projects')
        const cached = await getCachedProjects(companyId)
        if (includeArchived) return cached
        return cached.filter(p => p.status !== 'archived')
      }

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
      if (error) {
        // On error, try cache
        console.log('Error fetching projects, trying cache:', error.message)
        const cached = await getCachedProjects(companyId)
        if (cached.length > 0) return cached
        throw error
      }

      // Cache projects for offline use
      if (data?.length > 0) {
        cacheProjects(data).catch(err => console.error('Failed to cache projects:', err))
      }

      return data
    } else {
      const projects = getLocalData().projects
      if (includeArchived) return projects
      return projects.filter(p => p.status !== 'archived')
    }
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
      if (error) throw error
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

  // Update project
  async updateProject(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) {
        console.error('Error updating project:', error)
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

  async deleteProject(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
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
        console.log('Offline: returning cached areas')
        return getCachedAreas(projectId)
      }

      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })

      if (error) {
        // On error, try cache
        console.log('Error fetching areas, trying cache:', error.message)
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
      const { data, error } = await supabase
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

  async updateAreaStatus(id, status) {
    if (isSupabaseConfigured) {
      // If offline, update cache and queue action
      if (!getConnectionStatus()) {
        console.log('Offline: queuing area status update')
        const area = await updateCachedAreaStatus(id, status)
        await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: id, status })
        return area
      }

      const { data, error } = await supabase
        .from('areas')
        .update({ status })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        // If network error, queue for later
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          console.log('Network error: queuing area status update')
          const area = await updateCachedAreaStatus(id, status)
          await addPendingAction(ACTION_TYPES.UPDATE_AREA_STATUS, { areaId: id, status })
          return area
        }
        throw error
      }

      // Update cache with server response
      if (data) {
        updateCachedAreaStatus(id, status).catch(err =>
          console.error('Failed to update cached area:', err)
        )
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

  // Update area (name, weight, sort_order)
  async updateArea(id, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('areas')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
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

  // Delete area
  async deleteArea(id) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('areas')
        .delete()
        .eq('id', id)
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
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
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
          { event: 'INSERT', schema: 'public', table: 'injury_reports', filter: `company_id=eq.${companyId}` },
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

    // Subscribe to messages from any project
    projectIds.forEach(projectId => {
      channel.on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onMessage?.(payload)
      )
      channel.on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'material_requests', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onMaterialRequest?.(payload)
      )
      channel.on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 't_and_m_tickets', filter: `project_id=eq.${projectId}` },
        (payload) => callbacks.onTMTicket?.(payload)
      )
    })

    // Subscribe to injury reports company-wide
    channel.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'injury_reports', filter: `company_id=eq.${companyId}` },
      (payload) => callbacks.onInjuryReport?.(payload)
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
  // T&M Tickets
  // ============================================

  async getTMTickets(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
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
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    return []
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
      const { data, error } = await supabase
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

  async createTMTicket(ticket) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('t_and_m_tickets')
        .insert({
          project_id: ticket.project_id,
          work_date: ticket.work_date,
          ce_pco_number: ticket.ce_pco_number || null,
          notes: ticket.notes,
          photos: ticket.photos || [],
          status: 'pending',
          created_by_name: ticket.created_by_name || 'Field User'
        })
        .select()
        .single()
      if (error) throw error
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
      const { error } = await supabase
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
      const { error } = await supabase
        .from('t_and_m_items')
        .insert(itemsData)
      if (error) throw error
    }
  },

  async updateTMTicketStatus(ticketId, status) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
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

      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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

  async deleteTMTicket(ticketId) {
    if (isSupabaseConfigured) {
      // Workers and items cascade delete automatically
      const { error } = await supabase
        .from('t_and_m_tickets')
        .delete()
        .eq('id', ticketId)
      if (error) throw error
    }
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

  // Get all companies a user has access to
  async getUserCompanies(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          id,
          role,
          company_id,
          companies (
            id,
            name,
            code
          )
        `)
        .eq('user_id', userId)
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
        role: uc.role
      }))
    }
    return []
  },

  // ============================================
  // Photo Storage
  // ============================================

  async uploadPhoto(companyId, projectId, ticketId, file) {
    if (!isSupabaseConfigured) return null

    // Create unique filename
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(7)
    const extension = file.name?.split('.').pop() || 'jpg'
    const fileName = `${timestamp}-${randomId}.${extension}`
    
    // Path: company/project/ticket/filename
    const filePath = `${companyId}/${projectId}/${ticketId}/${fileName}`

    const { data, error } = await supabase.storage
      .from('tm-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) throw error

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('tm-photos')
      .getPublicUrl(filePath)

    return urlData.publicUrl
  },

  async uploadPhotoBase64(companyId, projectId, ticketId, base64Data, fileName = 'photo.jpg') {
    if (!isSupabaseConfigured) return null

    // Convert base64 to blob
    const base64Response = await fetch(base64Data)
    const blob = await base64Response.blob()

    // Create unique filename
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(7)
    const extension = fileName.split('.').pop() || 'jpg'
    const newFileName = `${timestamp}-${randomId}.${extension}`
    
    // Path: company/project/ticket/filename
    const filePath = `${companyId}/${projectId}/${ticketId}/${newFileName}`

    const { data, error } = await supabase.storage
      .from('tm-photos')
      .upload(filePath, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: blob.type
      })

    if (error) throw error

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('tm-photos')
      .getPublicUrl(filePath)

    return urlData.publicUrl
  },

  async deletePhoto(photoUrl) {
    if (!isSupabaseConfigured) return

    // Extract path from URL
    const url = new URL(photoUrl)
    const pathMatch = url.pathname.match(/\/tm-photos\/(.+)$/)
    if (!pathMatch) return

    const filePath = pathMatch[1]

    const { error } = await supabase.storage
      .from('tm-photos')
      .remove([filePath])

    if (error) throw error
  },

  // ============================================
  // Crew Check-In Functions
  // ============================================

  // Get today's crew check-in for a project
  async getCrewCheckin(projectId, date = null) {
    if (!isSupabaseConfigured) return null
    
    const checkDate = date || new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('crew_checkins')
      .select('*')
      .eq('project_id', projectId)
      .eq('check_in_date', checkDate)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error fetching crew checkin:', error)
    }
    return data
  },

  // Create or update crew check-in
  async saveCrewCheckin(projectId, workers, createdBy = null, date = null) {
    if (!isSupabaseConfigured) return null
    
    const checkDate = date || new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
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
      console.error('Error saving crew checkin:', error)
      throw error
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
    
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .eq('report_date', reportDate)
      .single()
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching daily report:', error)
    }
    return data
  },

  // Compile daily report data from other tables
  async compileDailyReport(projectId, date = null) {
    if (!isSupabaseConfigured) return null
    
    const reportDate = date || new Date().toISOString().split('T')[0]
    
    // Get crew check-in
    const crew = await this.getCrewCheckin(projectId, reportDate)
    
    // Get completed tasks for today
    const { data: areas } = await supabase
      .from('areas')
      .select('*')
      .eq('project_id', projectId)
    
    const completedToday = areas?.filter(a => 
      a.status === 'done' && 
      a.completed_at?.startsWith(reportDate)
    ) || []
    
    // Get T&M tickets for today
    const { data: tickets } = await supabase
      .from('t_and_m_tickets')
      .select('*')
      .eq('project_id', projectId)
      .eq('work_date', reportDate)
    
    // Count photos from tickets
    const photosCount = tickets?.reduce((sum, t) => sum + (t.photos?.length || 0), 0) || 0
    
    return {
      crew_count: crew?.workers?.length || 0,
      crew_list: crew?.workers || [],
      tasks_completed: completedToday.length,
      tasks_total: areas?.length || 0,
      completed_tasks: completedToday.map(a => ({ name: a.name, group: a.group_name })),
      tm_tickets_count: tickets?.length || 0,
      photos_count: photosCount
    }
  },

  // Save/update daily report
  async saveDailyReport(projectId, reportData, date = null) {
    if (!isSupabaseConfigured) return null
    
    const reportDate = date || new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
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
      console.error('Error saving daily report:', error)
      throw error
    }
    return data
  },

  // Submit daily report
  async submitDailyReport(projectId, submittedBy, date = null) {
    if (!isSupabaseConfigured) return null
    
    const reportDate = date || new Date().toISOString().split('T')[0]
    
    // First compile latest data
    const compiled = await this.compileDailyReport(projectId, reportDate)
    
    const { data, error } = await supabase
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
      console.error('Error submitting daily report:', error)
      throw error
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
      console.error('Error sending message:', error)
      throw error
    }
    return data
  },

  // Get messages for a project
  async getMessages(projectId, limit = 50) {
    if (!isSupabaseConfigured) return []
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      console.error('Error fetching messages:', error)
      return []
    }
    return data || []
  },

  // Get unread message count
  async getUnreadCount(projectId, viewerType) {
    if (!isSupabaseConfigured) return 0
    
    // Field sees office messages, office sees field messages
    const senderType = viewerType === 'field' ? 'office' : 'field'
    
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('sender_type', senderType)
      .eq('is_read', false)
    
    if (error) {
      console.error('Error getting unread count:', error)
      return 0
    }
    return count || 0
  },

  // Mark messages as read
  async markMessagesRead(projectId, viewerType) {
    if (!isSupabaseConfigured) return
    
    const senderType = viewerType === 'field' ? 'office' : 'field'
    
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('sender_type', senderType)
      .eq('is_read', false)
    
    if (error) {
      console.error('Error marking messages read:', error)
    }
  },

  // ============================================
  // Material Requests
  // ============================================

  // Create material request
  async createMaterialRequest(projectId, items, requestedBy, neededBy = null, priority = 'normal', notes = null) {
    if (!isSupabaseConfigured) return null
    
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

  // Generate a unique share token
  generateShareToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let token = ''
    for (let i = 0; i < 12; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return token
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

  // ============================================
  // Change Order Requests (COR)
  // ============================================

  // Create a new COR
  async createCOR(corData) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .insert({
          company_id: corData.company_id,
          project_id: corData.project_id,
          area_id: corData.area_id || null,
          cor_number: corData.cor_number,
          title: corData.title,
          description: corData.description || '',
          scope_of_work: corData.scope_of_work,
          period_start: corData.period_start,
          period_end: corData.period_end,
          status: 'draft',
          // Default markup percentages (basis points)
          labor_markup_percent: corData.labor_markup_percent ?? 1500,
          materials_markup_percent: corData.materials_markup_percent ?? 1500,
          equipment_markup_percent: corData.equipment_markup_percent ?? 1500,
          subcontractors_markup_percent: corData.subcontractors_markup_percent ?? 500,
          // Default fee percentages (basis points)
          liability_insurance_percent: corData.liability_insurance_percent ?? 144,
          bond_percent: corData.bond_percent ?? 100,
          license_fee_percent: corData.license_fee_percent ?? 10,
          created_by: corData.created_by || null
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Update COR fields (not line items)
  async updateCOR(corId, updates) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Delete COR (cascade deletes line items and associations)
  async deleteCOR(corId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_orders')
        .delete()
        .eq('id', corId)
      if (error) throw error
    }
  },

  // Get all CORs for a project
  async getCORs(projectId, filters = {}) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('change_orders')
        .select(`
          *,
          areas (id, name),
          labor_count:change_order_labor(count),
          materials_count:change_order_materials(count),
          equipment_count:change_order_equipment(count),
          subcontractors_count:change_order_subcontractors(count),
          tickets_count:change_order_ticket_associations(count)
        `)
        .eq('project_id', projectId)

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status)
      }
      if (filters.area_id) {
        query = query.eq('area_id', filters.area_id)
      }
      if (filters.date_start) {
        query = query.gte('period_start', filters.date_start)
      }
      if (filters.date_end) {
        query = query.lte('period_end', filters.date_end)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) throw error
      return data
    }
    return []
  },

  // Get single COR with all line items
  async getCORById(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .select(`
          *,
          areas (id, name),
          change_order_labor (*),
          change_order_materials (*),
          change_order_equipment (*),
          change_order_subcontractors (*),
          change_order_ticket_associations (
            *,
            t_and_m_tickets (
              id, work_date, ce_pco_number, status, notes
            )
          )
        `)
        .eq('id', corId)
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Get all CORs for a specific work area
  async getCORsByArea(projectId, areaId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .select('*')
        .eq('project_id', projectId)
        .eq('area_id', areaId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    return []
  },

  // Get next available COR number for project
  async getNextCORNumber(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .select('cor_number')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) throw error

      if (data && data.length > 0) {
        // Extract number from "COR #N" format
        const match = data[0].cor_number.match(/COR #(\d+)/)
        if (match) {
          return `COR #${parseInt(match[1]) + 1}`
        }
      }
      return 'COR #1'
    }
    return 'COR #1'
  },

  // ============================================
  // COR Line Items - Labor
  // ============================================

  async addCORLaborItem(corId, laborItem) {
    if (isSupabaseConfigured) {
      // Calculate totals
      const regularTotal = Math.round(laborItem.regular_hours * laborItem.regular_rate)
      const overtimeTotal = Math.round(laborItem.overtime_hours * laborItem.overtime_rate)
      const total = regularTotal + overtimeTotal

      const { data, error } = await supabase
        .from('change_order_labor')
        .insert({
          change_order_id: corId,
          labor_class: laborItem.labor_class,
          wage_type: laborItem.wage_type || 'standard',
          regular_hours: laborItem.regular_hours || 0,
          overtime_hours: laborItem.overtime_hours || 0,
          regular_rate: laborItem.regular_rate || 0,
          overtime_rate: laborItem.overtime_rate || 0,
          regular_total: regularTotal,
          overtime_total: overtimeTotal,
          total: total,
          sort_order: laborItem.sort_order || 0,
          source_ticket_id: laborItem.source_ticket_id || null
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCORLaborItem(itemId, updates) {
    if (isSupabaseConfigured) {
      // Recalculate totals if hours or rates changed
      let updateData = { ...updates }
      if (updates.regular_hours !== undefined || updates.regular_rate !== undefined ||
          updates.overtime_hours !== undefined || updates.overtime_rate !== undefined) {
        // Get current values if not provided
        const { data: current } = await supabase
          .from('change_order_labor')
          .select('regular_hours, overtime_hours, regular_rate, overtime_rate')
          .eq('id', itemId)
          .single()

        const regHours = updates.regular_hours ?? current?.regular_hours ?? 0
        const otHours = updates.overtime_hours ?? current?.overtime_hours ?? 0
        const regRate = updates.regular_rate ?? current?.regular_rate ?? 0
        const otRate = updates.overtime_rate ?? current?.overtime_rate ?? 0

        updateData.regular_total = Math.round(regHours * regRate)
        updateData.overtime_total = Math.round(otHours * otRate)
        updateData.total = updateData.regular_total + updateData.overtime_total
      }

      const { data, error } = await supabase
        .from('change_order_labor')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCORLaborItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_labor')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // COR Line Items - Materials
  // ============================================

  async addCORMaterialItem(corId, materialItem) {
    if (isSupabaseConfigured) {
      const total = Math.round(materialItem.quantity * materialItem.unit_cost)

      const { data, error } = await supabase
        .from('change_order_materials')
        .insert({
          change_order_id: corId,
          description: materialItem.description,
          quantity: materialItem.quantity || 1,
          unit: materialItem.unit || 'each',
          unit_cost: materialItem.unit_cost || 0,
          total: total,
          source_type: materialItem.source_type || 'custom',
          source_reference: materialItem.source_reference || null,
          source_ticket_id: materialItem.source_ticket_id || null,
          sort_order: materialItem.sort_order || 0
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCORMaterialItem(itemId, updates) {
    if (isSupabaseConfigured) {
      let updateData = { ...updates }
      if (updates.quantity !== undefined || updates.unit_cost !== undefined) {
        const { data: current } = await supabase
          .from('change_order_materials')
          .select('quantity, unit_cost')
          .eq('id', itemId)
          .single()

        const qty = updates.quantity ?? current?.quantity ?? 1
        const cost = updates.unit_cost ?? current?.unit_cost ?? 0
        updateData.total = Math.round(qty * cost)
      }

      const { data, error } = await supabase
        .from('change_order_materials')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCORMaterialItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_materials')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // COR Line Items - Equipment
  // ============================================

  async addCOREquipmentItem(corId, equipmentItem) {
    if (isSupabaseConfigured) {
      const total = Math.round(equipmentItem.quantity * equipmentItem.unit_cost)

      const { data, error } = await supabase
        .from('change_order_equipment')
        .insert({
          change_order_id: corId,
          description: equipmentItem.description,
          quantity: equipmentItem.quantity || 1,
          unit: equipmentItem.unit || 'day',
          unit_cost: equipmentItem.unit_cost || 0,
          total: total,
          source_type: equipmentItem.source_type || 'custom',
          source_reference: equipmentItem.source_reference || null,
          source_ticket_id: equipmentItem.source_ticket_id || null,
          sort_order: equipmentItem.sort_order || 0
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCOREquipmentItem(itemId, updates) {
    if (isSupabaseConfigured) {
      let updateData = { ...updates }
      if (updates.quantity !== undefined || updates.unit_cost !== undefined) {
        const { data: current } = await supabase
          .from('change_order_equipment')
          .select('quantity, unit_cost')
          .eq('id', itemId)
          .single()

        const qty = updates.quantity ?? current?.quantity ?? 1
        const cost = updates.unit_cost ?? current?.unit_cost ?? 0
        updateData.total = Math.round(qty * cost)
      }

      const { data, error } = await supabase
        .from('change_order_equipment')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCOREquipmentItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_equipment')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // COR Line Items - Subcontractors
  // ============================================

  async addCORSubcontractorItem(corId, subItem) {
    if (isSupabaseConfigured) {
      const total = Math.round(subItem.quantity * subItem.unit_cost)

      const { data, error } = await supabase
        .from('change_order_subcontractors')
        .insert({
          change_order_id: corId,
          description: subItem.description,
          quantity: subItem.quantity || 1,
          unit: subItem.unit || 'lump sum',
          unit_cost: subItem.unit_cost || 0,
          total: total,
          source_type: subItem.source_type || 'custom',
          source_reference: subItem.source_reference || null,
          sort_order: subItem.sort_order || 0
        })
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async updateCORSubcontractorItem(itemId, updates) {
    if (isSupabaseConfigured) {
      let updateData = { ...updates }
      if (updates.quantity !== undefined || updates.unit_cost !== undefined) {
        const { data: current } = await supabase
          .from('change_order_subcontractors')
          .select('quantity, unit_cost')
          .eq('id', itemId)
          .single()

        const qty = updates.quantity ?? current?.quantity ?? 1
        const cost = updates.unit_cost ?? current?.unit_cost ?? 0
        updateData.total = Math.round(qty * cost)
      }

      const { data, error } = await supabase
        .from('change_order_subcontractors')
        .update(updateData)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async deleteCORSubcontractorItem(itemId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('change_order_subcontractors')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    }
  },

  // ============================================
  // Bulk Line Item Operations
  // ============================================

  async addBulkLaborItems(corId, laborItems) {
    if (isSupabaseConfigured && laborItems.length > 0) {
      const items = laborItems.map((item, index) => {
        const regularTotal = Math.round(item.regular_hours * item.regular_rate)
        const overtimeTotal = Math.round(item.overtime_hours * item.overtime_rate)
        return {
          change_order_id: corId,
          labor_class: item.labor_class,
          wage_type: item.wage_type || 'standard',
          regular_hours: item.regular_hours || 0,
          overtime_hours: item.overtime_hours || 0,
          regular_rate: item.regular_rate || 0,
          overtime_rate: item.overtime_rate || 0,
          regular_total: regularTotal,
          overtime_total: overtimeTotal,
          total: regularTotal + overtimeTotal,
          sort_order: item.sort_order ?? index,
          source_ticket_id: item.source_ticket_id || null
        }
      })

      const { data, error } = await supabase
        .from('change_order_labor')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  async addBulkMaterialItems(corId, materialItems) {
    if (isSupabaseConfigured && materialItems.length > 0) {
      const items = materialItems.map((item, index) => ({
        change_order_id: corId,
        description: item.description,
        quantity: item.quantity || 1,
        unit: item.unit || 'each',
        unit_cost: item.unit_cost || 0,
        total: Math.round((item.quantity || 1) * (item.unit_cost || 0)),
        source_type: item.source_type || 'custom',
        source_reference: item.source_reference || null,
        source_ticket_id: item.source_ticket_id || null,
        sort_order: item.sort_order ?? index
      }))

      const { data, error } = await supabase
        .from('change_order_materials')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  async addBulkEquipmentItems(corId, equipmentItems) {
    if (isSupabaseConfigured && equipmentItems.length > 0) {
      const items = equipmentItems.map((item, index) => ({
        change_order_id: corId,
        description: item.description,
        quantity: item.quantity || 1,
        unit: item.unit || 'day',
        unit_cost: item.unit_cost || 0,
        total: Math.round((item.quantity || 1) * (item.unit_cost || 0)),
        source_type: item.source_type || 'custom',
        source_reference: item.source_reference || null,
        source_ticket_id: item.source_ticket_id || null,
        sort_order: item.sort_order ?? index
      }))

      const { data, error } = await supabase
        .from('change_order_equipment')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  async addBulkSubcontractorItems(corId, subItems) {
    if (isSupabaseConfigured && subItems.length > 0) {
      const items = subItems.map((item, index) => ({
        change_order_id: corId,
        description: item.description,
        quantity: item.quantity || 1,
        unit: item.unit || 'lump sum',
        unit_cost: item.unit_cost || 0,
        total: Math.round((item.quantity || 1) * (item.unit_cost || 0)),
        source_type: item.source_type || 'custom',
        source_reference: item.source_reference || null,
        sort_order: item.sort_order ?? index
      }))

      const { data, error } = await supabase
        .from('change_order_subcontractors')
        .insert(items)
        .select()
      if (error) throw error
      return data
    }
    return []
  },

  // ============================================
  // Ticket-COR Associations
  // ============================================

  async assignTicketToCOR(ticketId, corId) {
    if (isSupabaseConfigured) {
      // Create association
      const { data: assoc, error: assocError } = await supabase
        .from('change_order_ticket_associations')
        .insert({
          change_order_id: corId,
          ticket_id: ticketId,
          data_imported: false
        })
        .select()
        .single()
      if (assocError) throw assocError

      // Update ticket's assigned_cor_id
      const { error: ticketError } = await supabase
        .from('t_and_m_tickets')
        .update({ assigned_cor_id: corId })
        .eq('id', ticketId)
      if (ticketError) throw ticketError

      return assoc
    }
    return null
  },

  async unassignTicketFromCOR(ticketId, corId) {
    if (isSupabaseConfigured) {
      // Delete association
      const { error: assocError } = await supabase
        .from('change_order_ticket_associations')
        .delete()
        .eq('ticket_id', ticketId)
        .eq('change_order_id', corId)
      if (assocError) throw assocError

      // Clear ticket's assigned_cor_id
      const { error: ticketError } = await supabase
        .from('t_and_m_tickets')
        .update({ assigned_cor_id: null })
        .eq('id', ticketId)
      if (ticketError) throw ticketError
    }
  },

  async getTicketsForCOR(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_order_ticket_associations')
        .select(`
          *,
          t_and_m_tickets (
            *,
            t_and_m_workers (*),
            t_and_m_items (
              *,
              materials_equipment (name, unit, cost_per_unit, category)
            )
          )
        `)
        .eq('change_order_id', corId)
      if (error) throw error
      return data
    }
    return []
  },

  async getUnassignedTickets(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
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
        .is('assigned_cor_id', null)
        .order('work_date', { ascending: false })
      if (error) throw error
      return data
    }
    return []
  },

  async importTicketDataToCOR(ticketId, corId, companyId, workType, jobType) {
    if (isSupabaseConfigured) {
      // 1. Get ticket with workers and items
      const { data: ticket, error: ticketError } = await supabase
        .from('t_and_m_tickets')
        .select(`
          *,
          t_and_m_workers (*),
          t_and_m_items (
            *,
            materials_equipment (name, unit, cost_per_unit, category)
          )
        `)
        .eq('id', ticketId)
        .single()
      if (ticketError) throw ticketError

      // 2. Get labor rates for this company/work type/job type
      const { data: rates, error: ratesError } = await supabase
        .from('labor_rates')
        .select('*')
        .eq('company_id', companyId)
        .eq('work_type', workType || 'demolition')
        .eq('job_type', jobType || 'standard')
      if (ratesError) throw ratesError

      // Create rate lookup
      const rateLookup = {}
      rates?.forEach(rate => {
        rateLookup[rate.role.toLowerCase()] = rate
      })

      // 3. Group workers by role and sum hours
      const laborByRole = {}
      ticket.t_and_m_workers?.forEach(worker => {
        const role = (worker.role || 'laborer').toLowerCase()
        if (!laborByRole[role]) {
          laborByRole[role] = { regular_hours: 0, overtime_hours: 0 }
        }
        laborByRole[role].regular_hours += parseFloat(worker.hours) || 0
        laborByRole[role].overtime_hours += parseFloat(worker.overtime_hours) || 0
      })

      // 4. Create labor items
      const laborItems = Object.entries(laborByRole).map(([role, hours]) => {
        const rate = rateLookup[role] || { regular_rate: 0, overtime_rate: 0 }
        // Convert dollar rates to cents
        const regRate = Math.round((parseFloat(rate.regular_rate) || 0) * 100)
        const otRate = Math.round((parseFloat(rate.overtime_rate) || 0) * 100)
        return {
          labor_class: role.charAt(0).toUpperCase() + role.slice(1),
          wage_type: jobType || 'standard',
          regular_hours: hours.regular_hours,
          overtime_hours: hours.overtime_hours,
          regular_rate: regRate,
          overtime_rate: otRate,
          source_ticket_id: ticketId
        }
      })

      if (laborItems.length > 0) {
        await this.addBulkLaborItems(corId, laborItems)
      }

      // 5. Get materials/equipment from t_and_m_items
      const materialItems = []
      const equipmentItems = []

      ticket.t_and_m_items?.forEach(item => {
        const name = item.custom_name || item.materials_equipment?.name || 'Unknown Item'
        const category = item.custom_category || item.materials_equipment?.category || 'Other'
        const unit = item.materials_equipment?.unit || 'each'
        // Convert dollar cost to cents
        const unitCost = Math.round((parseFloat(item.materials_equipment?.cost_per_unit) || 0) * 100)

        const lineItem = {
          description: name,
          quantity: item.quantity || 1,
          unit: unit,
          unit_cost: unitCost,
          source_type: 'backup_sheet',
          source_ticket_id: ticketId
        }

        if (category === 'Equipment') {
          equipmentItems.push(lineItem)
        } else {
          materialItems.push(lineItem)
        }
      })

      if (materialItems.length > 0) {
        await this.addBulkMaterialItems(corId, materialItems)
      }
      if (equipmentItems.length > 0) {
        await this.addBulkEquipmentItems(corId, equipmentItems)
      }

      // 6. Mark association as data_imported
      const { error: updateError } = await supabase
        .from('change_order_ticket_associations')
        .update({
          data_imported: true,
          imported_at: new Date().toISOString()
        })
        .eq('change_order_id', corId)
        .eq('ticket_id', ticketId)
      if (updateError) throw updateError

      return { laborItems, materialItems, equipmentItems }
    }
    return null
  },

  async reimportTicketDataToCOR(ticketId, corId, companyId, workType, jobType) {
    if (isSupabaseConfigured) {
      // Delete existing line items from this ticket
      await supabase
        .from('change_order_labor')
        .delete()
        .eq('change_order_id', corId)
        .eq('source_ticket_id', ticketId)

      await supabase
        .from('change_order_materials')
        .delete()
        .eq('change_order_id', corId)
        .eq('source_ticket_id', ticketId)

      await supabase
        .from('change_order_equipment')
        .delete()
        .eq('change_order_id', corId)
        .eq('source_ticket_id', ticketId)

      // Re-import fresh data
      return this.importTicketDataToCOR(ticketId, corId, companyId, workType, jobType)
    }
    return null
  },

  // ============================================
  // COR Calculations
  // ============================================

  async recalculateCOR(corId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('recalculate_cor_totals', { cor_id: corId })
      if (error) throw error

      // Return updated COR
      return this.getCORById(corId)
    }
    return null
  },

  async updateCORMarkupPercentages(corId, percentages) {
    if (isSupabaseConfigured) {
      const updates = {}
      if (percentages.labor !== undefined) updates.labor_markup_percent = percentages.labor
      if (percentages.materials !== undefined) updates.materials_markup_percent = percentages.materials
      if (percentages.equipment !== undefined) updates.equipment_markup_percent = percentages.equipment
      if (percentages.subcontractors !== undefined) updates.subcontractors_markup_percent = percentages.subcontractors

      const { data, error } = await supabase
        .from('change_orders')
        .update(updates)
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error

      // Trigger recalculation happens via database trigger
      return data
    }
    return null
  },

  async updateCORFeePercentages(corId, percentages) {
    if (isSupabaseConfigured) {
      const updates = {}
      if (percentages.liabilityInsurance !== undefined) updates.liability_insurance_percent = percentages.liabilityInsurance
      if (percentages.bond !== undefined) updates.bond_percent = percentages.bond
      if (percentages.licenseFee !== undefined) updates.license_fee_percent = percentages.licenseFee

      const { data, error } = await supabase
        .from('change_orders')
        .update(updates)
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error

      // Trigger recalculation happens via database trigger
      return data
    }
    return null
  },

  // ============================================
  // COR Status & Workflow
  // ============================================

  async submitCORForApproval(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status: 'pending_approval',
          submitted_at: new Date().toISOString()
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async approveCOR(corId, userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString()
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async rejectCOR(corId, reason = null) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          status: 'rejected',
          rejection_reason: reason
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async markCORAsBilled(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({ status: 'billed' })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async closeCOR(corId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({ status: 'closed' })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  async saveCORSignature(corId, signatureData, signerName) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .update({
          gc_signature_data: signatureData,
          gc_signature_name: signerName,
          gc_signature_date: new Date().toISOString(),
          status: 'approved' // Auto-approve when signed
        })
        .eq('id', corId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // ============================================
  // COR Stats & Analytics
  // ============================================

  async getCORStats(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('change_orders')
        .select('status, cor_total')
        .eq('project_id', projectId)

      if (error) throw error

      const stats = {
        total_cors: data.length,
        draft_count: 0,
        pending_count: 0,
        approved_count: 0,
        rejected_count: 0,
        billed_count: 0,
        total_approved_value: 0,
        total_pending_value: 0,
        total_billed_value: 0
      }

      data.forEach(cor => {
        switch (cor.status) {
          case 'draft':
            stats.draft_count++
            break
          case 'pending_approval':
            stats.pending_count++
            stats.total_pending_value += cor.cor_total || 0
            break
          case 'approved':
            stats.approved_count++
            stats.total_approved_value += cor.cor_total || 0
            break
          case 'rejected':
            stats.rejected_count++
            break
          case 'billed':
          case 'closed':
            stats.billed_count++
            stats.total_billed_value += cor.cor_total || 0
            break
        }
      })

      return stats
    }
    return {
      total_cors: 0,
      draft_count: 0,
      pending_count: 0,
      approved_count: 0,
      rejected_count: 0,
      billed_count: 0,
      total_approved_value: 0,
      total_pending_value: 0,
      total_billed_value: 0
    }
  },

  // Subscribe to COR updates for a project
  subscribeToCORs(projectId, callback) {
    if (isSupabaseConfigured) {
      return supabase
        .channel(`change_orders:${projectId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'change_orders', filter: `project_id=eq.${projectId}` },
          callback
        )
        .subscribe()
    }
    return null
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
    console.log('Back online - syncing pending actions...')
    try {
      const results = await syncPendingActions(db)
      if (results.synced > 0) {
        console.log(`Synced ${results.synced} pending actions`)
      }
      if (results.failed > 0) {
        console.warn(`Failed to sync ${results.failed} actions`)
      }
    } catch (err) {
      console.error('Error syncing pending actions:', err)
    }
  }
})

