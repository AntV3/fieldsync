import { createClient } from '@supabase/supabase-js'

// For demo purposes, we'll use a mock mode that falls back to localStorage
// In production, you would set these environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Check if Supabase is configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

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
      if (error) throw error
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
      if (error) throw error
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
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true })
      if (error) throw error
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
      const { data, error } = await supabase
        .from('areas')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
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
        .update({ ...updates, updated_at: new Date().toISOString() })
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

  // Approve T&M ticket (with certification)
  async approveTMTicket(ticketId, userId, userName) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('t_and_m_tickets')
        .update({ 
          status: 'approved',
          approved_by_user_id: userId,
          approved_by_name: userName,
          approved_at: new Date().toISOString(),
          // Clear any previous rejection
          rejected_by_user_id: null,
          rejected_by_name: null,
          rejected_at: null,
          rejection_reason: null
        })
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
  // Budget Tracking
  // ============================================

  // Calculate actual costs from approved T&M tickets
  async getProjectBudgetActuals(projectId) {
    if (!isSupabaseConfigured) {
      return {
        labor_actual: 0,
        materials_actual: 0,
        equipment_actual: 0,
        other_actual: 0,
        total_actual: 0
      }
    }

    // Get project to retrieve labor rate
    const project = await this.getProject(projectId)
    const laborRate = project?.company_labor_rate || 0

    // Get all approved T&M tickets with workers and items
    const { data: tickets, error } = await supabase
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
      .eq('status', 'approved')

    if (error) throw error

    let laborActual = 0
    let materialsActual = 0
    let equipmentActual = 0
    let otherActual = 0

    // Calculate labor costs
    tickets?.forEach(ticket => {
      ticket.t_and_m_workers?.forEach(worker => {
        const regularHours = parseFloat(worker.hours || 0)
        const overtimeHours = parseFloat(worker.overtime_hours || 0)
        // Overtime typically 1.5x rate
        laborActual += (regularHours * laborRate) + (overtimeHours * laborRate * 1.5)
      })

      // Calculate materials and equipment costs
      ticket.t_and_m_items?.forEach(item => {
        const quantity = parseFloat(item.quantity || 0)
        const costPerUnit = parseFloat(item.materials_equipment?.cost_per_unit || 0)
        const itemCost = quantity * costPerUnit
        const category = item.materials_equipment?.category || item.custom_category || 'Other'

        if (category === 'Equipment') {
          equipmentActual += itemCost
        } else if (['Containment', 'PPE', 'Disposal'].includes(category)) {
          materialsActual += itemCost
        } else {
          otherActual += itemCost
        }
      })
    })

    const totalActual = laborActual + materialsActual + equipmentActual + otherActual

    return {
      labor_actual: Math.round(laborActual * 100) / 100,
      materials_actual: Math.round(materialsActual * 100) / 100,
      equipment_actual: Math.round(equipmentActual * 100) / 100,
      other_actual: Math.round(otherActual * 100) / 100,
      total_actual: Math.round(totalActual * 100) / 100
    }
  },

  // Get budget summary with budget vs actual comparison
  async getProjectBudgetSummary(projectId) {
    const project = await this.getProject(projectId)
    const actuals = await this.getProjectBudgetActuals(projectId)

    if (!project) return null

    const calculatePercentage = (actual, budget) => {
      if (!budget || budget === 0) return 0
      return Math.round((actual / budget) * 100)
    }

    const calculateVariance = (actual, budget) => {
      return Math.round((actual - budget) * 100) / 100
    }

    return {
      project_id: projectId,
      project_name: project.name,

      // Labor
      labor_budget: parseFloat(project.labor_budget || 0),
      labor_actual: actuals.labor_actual,
      labor_percentage: calculatePercentage(actuals.labor_actual, project.labor_budget),
      labor_variance: calculateVariance(actuals.labor_actual, project.labor_budget),

      // Materials
      materials_budget: parseFloat(project.materials_budget || 0),
      materials_actual: actuals.materials_actual,
      materials_percentage: calculatePercentage(actuals.materials_actual, project.materials_budget),
      materials_variance: calculateVariance(actuals.materials_actual, project.materials_budget),

      // Equipment
      equipment_budget: parseFloat(project.equipment_budget || 0),
      equipment_actual: actuals.equipment_actual,
      equipment_percentage: calculatePercentage(actuals.equipment_actual, project.equipment_budget),
      equipment_variance: calculateVariance(actuals.equipment_actual, project.equipment_budget),

      // Other
      other_budget: parseFloat(project.other_budget || 0),
      other_actual: actuals.other_actual,
      other_percentage: calculatePercentage(actuals.other_actual, project.other_budget),
      other_variance: calculateVariance(actuals.other_actual, project.other_budget),

      // Total
      total_budget: parseFloat(project.total_budget || 0),
      total_actual: actuals.total_actual,
      total_percentage: calculatePercentage(actuals.total_actual, project.total_budget),
      total_variance: calculateVariance(actuals.total_actual, project.total_budget)
    }
  },

  // Get budget status (for alerts)
  getBudgetStatus(percentage) {
    if (percentage >= 100) return 'over'
    if (percentage >= 90) return 'warning'
    return 'good'
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
  }
}

