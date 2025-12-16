import { createClient } from '@supabase/supabase-js'

// For demo purposes, we'll use a mock mode that falls back to localStorage
// In production, you would set these environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// ============================================
// Multi-Company Configuration
// ============================================
// Auto-add new users to these companies
// To change which companies new users get added to, update these IDs:
const AUTO_ADD_COMPANIES = [
  { id: 'da92028d-3056-4b0c-a467-e3fbe4ce8466', name: 'GGG' },
  { id: 'bf01ee1a-e29e-4ef8-8742-53cda36d9452', name: 'Miller' }
]
// To disable auto-add, set AUTO_ADD_COMPANIES = []
// To add more companies, just add more objects to the array

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

  // Update project status
  async updateProjectStatus(id, status) {
    return this.updateProject(id, { status })
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
  // Companies
  // ============================================

  async getCompanyByCode(code) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .single()

      if (error) {
        console.error('Error fetching company by code:', {
          code,
          error: error.message,
          hint: error.hint,
          details: error.details
        })
        return null
      }
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
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          *,
          companies (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching user companies:', error)
        return []
      }

      return data?.map(uc => ({
        ...uc.companies,
        userRole: uc.role
      })) || []
    } catch (error) {
      console.error('Error fetching user companies:', error)
      return []
    }
  },

  // Get all users for a company
  async getUsersForCompany(companyId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          user_id,
          users (id, email, name, role)
        `)
        .eq('company_id', companyId)

      if (error) {
        console.error('Error fetching users for company:', error)
        return []
      }

      return data?.map(uc => uc.users).filter(Boolean) || []
    } catch (error) {
      console.error('Error fetching users for company:', error)
      return []
    }
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

    // Send notification to materials managers
    if (data) {
      try {
        // Get project info for notification
        const { data: project } = await supabase
          .from('projects')
          .select('name, company_id')
          .eq('id', projectId)
          .single()

        if (project) {
          // Determine notification type based on priority
          const notificationTypeKey = priority === 'urgent'
            ? 'material_request_urgent'
            : 'material_request_submitted'

          // Get all users with materials_manager role for this company
          const { data: roleUsers } = await supabase
            .from('user_notification_roles')
            .select(`
              user_id,
              notification_roles!inner(company_id, role_key)
            `)
            .eq('notification_roles.company_id', project.company_id)
            .eq('notification_roles.role_key', 'materials_manager')

          // Create notification for each materials manager
          if (roleUsers && roleUsers.length > 0) {
            const itemsList = items.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ')
            const title = priority === 'urgent'
              ? '🔴 Urgent Material Request'
              : '📦 New Material Request'
            const message = `${requestedBy} requested: ${itemsList} for ${project.name}`

            for (const ru of roleUsers) {
              await this.createNotification(
                project.company_id,
                notificationTypeKey,
                ru.user_id,
                title,
                message,
                `/projects/${projectId}`, // Link to project page
                {
                  request_id: data.id,
                  project_id: projectId,
                  priority,
                  items_count: items.length
                }
              )
            }
          }
        }
      } catch (notifError) {
        console.error('Error sending material request notification:', notifError)
        // Don't throw - material request was created successfully
      }
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
  // Dashboard Metrics & Analytics
  // ============================================

  // Get comprehensive dashboard metrics for office view
  async getDashboardMetrics(companyId) {
    if (!isSupabaseConfigured) {
      return {
        activeProjects: 0,
        crewToday: 0,
        pendingTMCount: 0,
        pendingTMValue: 0,
        urgentRequests: 0,
        unreadMessages: 0
      }
    }

    try {
      // ONLY query projects table - it's the only one that exists
      const { count: activeProjectsCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)

      return {
        activeProjects: activeProjectsCount || 0,
        crewToday: 0, // Will be enabled when crew_checkins table exists
        pendingTMCount: 0, // Will be enabled when t_and_m_tickets table exists
        pendingTMValue: 0,
        urgentRequests: 0, // Will be enabled when material_requests table exists
        unreadMessages: 0 // Will be enabled when messages table exists
      }
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error)
      return {
        activeProjects: 0,
        crewToday: 0,
        pendingTMCount: 0,
        pendingTMValue: 0,
        urgentRequests: 0,
        unreadMessages: 0
      }
    }
  },

  // Get project summaries with crew and pending items
  async getProjectSummaries(companyId) {
    if (!isSupabaseConfigured) {
      return []
    }

    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!projects) return []

      // Fetch areas for each project - ONLY query tables that exist
      const summaries = await Promise.all(projects.map(async (project) => {
        // Get areas for progress calculation
        const { data: areas } = await supabase
          .from('areas')
          .select('*')
          .eq('project_id', project.id)

        // Calculate progress
        const totalWeight = areas?.reduce((sum, a) => sum + parseFloat(a.weight || 0), 0) || 0
        const completedWeight = areas?.filter(a => a.status === 'done')
          .reduce((sum, a) => sum + parseFloat(a.weight || 0), 0) || 0
        const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

        // Determine status color based on progress
        let statusColor = 'green'
        if (progress < 30) statusColor = 'red'
        else if (progress < 70) statusColor = 'yellow'

        return {
          ...project,
          progress,
          crewToday: 0, // Will add when crew_checkins exists
          pendingItems: 0, // Will add when t_and_m/materials tables exist
          statusColor
        }
      }))

      return summaries
    } catch (error) {
      console.error('Error fetching project summaries:', error)
      return []
    }
  },

  // Get items needing attention
  async getNeedsAttention(companyId) {
    // Return empty for now - will enable when tables exist
    return {
      pendingTM: [],
      pendingMaterials: [],
      missingReports: [],
      overBudget: [],
      unreadMessages: []
    }
  },

  // Get recent activity across all projects
  async getRecentActivity(companyId, limit = 20) {
    // Return empty for now - will enable when tables exist
    return []
  },

  // ============================================
  // NOTIFICATION SYSTEM
  // ============================================

  // Get all notification roles for a company
  async getNotificationRoles(companyId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('notification_roles')
        .select('*')
        .eq('company_id', companyId)
        .order('role_name')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching notification roles:', error)
      return []
    }
  },

  // Get users assigned to a specific notification role
  async getUsersByNotificationRole(roleId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('user_notification_roles')
        .select(`
          *,
          users (id, email, name)
        `)
        .eq('role_id', roleId)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching users by role:', error)
      return []
    }
  },

  // Get all notification roles assigned to a user
  async getUserNotificationRoles(userId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('user_notification_roles')
        .select(`
          *,
          notification_roles (*)
        `)
        .eq('user_id', userId)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching user roles:', error)
      return []
    }
  },

  // Assign a user to a notification role
  async assignNotificationRole(userId, roleId, assignedBy) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('user_notification_roles')
        .insert({
          user_id: userId,
          role_id: roleId,
          assigned_by: assignedBy
        })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error assigning notification role:', error)
      return { success: false, error: error.message }
    }
  },

  // Remove a user from a notification role
  async removeNotificationRole(userId, roleId) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('user_notification_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error removing notification role:', error)
      return { success: false, error: error.message }
    }
  },

  // Create a new notification role
  async createNotificationRole(companyId, roleName, roleKey, description) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { data, error } = await supabase
        .from('notification_roles')
        .insert({
          company_id: companyId,
          role_name: roleName,
          role_key: roleKey,
          description: description
        })
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error creating notification role:', error)
      return { success: false, error: error.message }
    }
  },

  // Get all notification types
  async getNotificationTypes() {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('notification_types')
        .select('*')
        .order('category', { ascending: true })
        .order('type_name', { ascending: true })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching notification types:', error)
      return []
    }
  },

  // Get notification preferences for a user
  async getNotificationPreferences(userId, companyId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select(`
          *,
          notification_types (*)
        `)
        .eq('user_id', userId)
        .eq('company_id', companyId)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching notification preferences:', error)
      return []
    }
  },

  // Update notification preference
  async updateNotificationPreference(userId, companyId, notificationTypeId, preferences) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          company_id: companyId,
          notification_type_id: notificationTypeId,
          email_enabled: preferences.email_enabled,
          in_app_enabled: preferences.in_app_enabled,
          sms_enabled: preferences.sms_enabled || false,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error updating notification preference:', error)
      return { success: false, error: error.message }
    }
  },

  // Create a notification (this will be called by material requests, injury reports, etc.)
  async createNotification(companyId, notificationTypeKey, userId, title, message, linkUrl, metadata) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      // Get the notification type ID
      const { data: notificationType } = await supabase
        .from('notification_types')
        .select('id')
        .eq('type_key', notificationTypeKey)
        .single()

      if (!notificationType) {
        throw new Error(`Notification type ${notificationTypeKey} not found`)
      }

      // Create the notification
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          company_id: companyId,
          notification_type_id: notificationType.id,
          user_id: userId,
          title,
          message,
          link_url: linkUrl,
          metadata: metadata || {}
        })
        .select()
        .single()

      if (error) throw error

      // TODO: Trigger email sending here (Phase 4)
      // await this.sendNotificationEmail(data.id)

      return { success: true, data }
    } catch (error) {
      console.error('Error creating notification:', error)
      return { success: false, error: error.message }
    }
  },

  // Get unread notifications for a user
  async getUnreadNotifications(userId, limit = 50) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          notification_types (type_name, category)
        `)
        .eq('user_id', userId)
        .eq('in_app_read', false)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching unread notifications:', error)
      return []
    }
  },

  // Mark notification as read
  async markNotificationRead(notificationId) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          in_app_read: true,
          in_app_read_at: new Date().toISOString()
        })
        .eq('id', notificationId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error marking notification as read:', error)
      return { success: false, error: error.message }
    }
  },

  // Mark all notifications as read for a user
  async markAllNotificationsRead(userId) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          in_app_read: true,
          in_app_read_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('in_app_read', false)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      return { success: false, error: error.message }
    }
  },

  // Get users who should receive a notification for a specific type
  async getUsersForNotification(companyId, notificationTypeKey, roleKey) {
    if (!isSupabaseConfigured) return []

    try {
      // Get the role for this company
      const { data: role } = await supabase
        .from('notification_roles')
        .select('id')
        .eq('company_id', companyId)
        .eq('role_key', roleKey)
        .single()

      if (!role) return []

      // Get users assigned to this role
      const { data: userRoles } = await supabase
        .from('user_notification_roles')
        .select(`
          user_id,
          users (id, email, name)
        `)
        .eq('role_id', role.id)

      if (!userRoles) return []

      // Get notification type
      const { data: notificationType } = await supabase
        .from('notification_types')
        .select('id')
        .eq('type_key', notificationTypeKey)
        .single()

      if (!notificationType) return userRoles.map(ur => ur.users)

      // Filter by notification preferences
      const usersWithPreferences = await Promise.all(
        userRoles.map(async (ur) => {
          const { data: prefs } = await supabase
            .from('notification_preferences')
            .select('email_enabled, in_app_enabled')
            .eq('user_id', ur.user_id)
            .eq('company_id', companyId)
            .eq('notification_type_id', notificationType.id)
            .single()

          // If no preference exists, assume enabled (default behavior)
          const shouldNotify = !prefs || prefs.email_enabled || prefs.in_app_enabled

          return shouldNotify ? ur.users : null
        })
      )

      return usersWithPreferences.filter(u => u !== null)
    } catch (error) {
      console.error('Error getting users for notification:', error)
      return []
    }
  },

  // ============================================
  // EXTERNAL NOTIFICATION RECIPIENTS
  // ============================================

  // Get external recipients for a notification role
  async getExternalRecipientsByRole(roleId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('external_notification_recipients')
        .select('*')
        .eq('role_id', roleId)
        .order('email')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching external recipients:', error)
      return []
    }
  },

  // Add external email to notification role
  async addExternalRecipient(roleId, email, name, notes, createdBy) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { data, error } = await supabase
        .from('external_notification_recipients')
        .insert({
          role_id: roleId,
          email: email.toLowerCase().trim(),
          name: name?.trim() || null,
          notes: notes?.trim() || null,
          created_by: createdBy
        })
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error adding external recipient:', error)
      return { success: false, error: error.message }
    }
  },

  // Remove external recipient
  async removeExternalRecipient(recipientId) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('external_notification_recipients')
        .delete()
        .eq('id', recipientId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error removing external recipient:', error)
      return { success: false, error: error.message }
    }
  },

  // Get all recipients (users + external) for a notification
  async getAllRecipientsForNotification(companyId, notificationTypeKey, roleKey) {
    if (!isSupabaseConfigured) return { users: [], externalEmails: [] }

    try {
      // Get the role
      const { data: role } = await supabase
        .from('notification_roles')
        .select('id')
        .eq('company_id', companyId)
        .eq('role_key', roleKey)
        .single()

      if (!role) return { users: [], externalEmails: [] }

      // Get internal users
      const users = await this.getUsersForNotification(companyId, notificationTypeKey, roleKey)

      // Get external recipients
      const { data: externalRecipients } = await supabase
        .from('external_notification_recipients')
        .select('email, name')
        .eq('role_id', role.id)

      const externalEmails = externalRecipients?.map(r => ({
        email: r.email,
        name: r.name || r.email
      })) || []

      return { users, externalEmails }
    } catch (error) {
      console.error('Error getting all recipients:', error)
      return { users: [], externalEmails: [] }
    }
  },

  // ============================================
  // PROJECT-LEVEL PERMISSIONS
  // ============================================

  // Get project team members
  async getProjectTeam(projectId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('project_users')
        .select(`
          id,
          project_id,
          user_id,
          project_role,
          joined_at,
          invited_by,
          users:user_id (
            id,
            name,
            email,
            role
          )
        `)
        .eq('project_id', projectId)
        .order('joined_at')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching project team:', error)
      return []
    }
  },

  // Get user's project role
  async getUserProjectRole(userId, projectId) {
    if (!isSupabaseConfigured) return null

    try {
      const { data, error } = await supabase
        .from('project_users')
        .select('project_role')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single()

      if (error) throw error
      return data?.project_role || null
    } catch (error) {
      console.error('Error fetching user project role:', error)
      return null
    }
  },

  // Get user's projects
  async getUserProjects(userId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('project_users')
        .select(`
          id,
          project_role,
          joined_at,
          projects:project_id (
            id,
            name,
            location,
            status,
            created_at,
            companies:company_id (
              id,
              name
            )
          )
        `)
        .eq('user_id', userId)
        .order('joined_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching user projects:', error)
      return []
    }
  },

  // Invite user to project
  async inviteUserToProject(projectId, userId, projectRole, invitedBy) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { data, error } = await supabase
        .from('project_users')
        .insert({
          project_id: projectId,
          user_id: userId,
          project_role: projectRole,
          invited_by: invitedBy
        })
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error inviting user to project:', error)
      return { success: false, error: error.message }
    }
  },

  // Remove user from project
  async removeUserFromProject(projectUserId) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('project_users')
        .delete()
        .eq('id', projectUserId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error removing user from project:', error)
      return { success: false, error: error.message }
    }
  },

  // Update user's project role
  async updateUserProjectRole(projectUserId, newRole) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { data, error } = await supabase
        .from('project_users')
        .update({ project_role: newRole })
        .eq('id', projectUserId)
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error updating user project role:', error)
      return { success: false, error: error.message }
    }
  },

  // Get user's permissions for a project
  async getUserProjectPermissions(userId, projectId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('project_users')
        .select(`
          id,
          project_role,
          project_user_permissions (
            permission_key
          )
        `)
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single()

      if (error) throw error

      // Owners and managers have all permissions
      if (data?.project_role === 'owner' || data?.project_role === 'manager') {
        return ['*'] // Special marker for all permissions
      }

      // Return array of permission keys
      return data?.project_user_permissions?.map(p => p.permission_key) || []
    } catch (error) {
      console.error('Error fetching user project permissions:', error)
      return []
    }
  },

  // Check if user has specific permission
  async userHasProjectPermission(userId, projectId, permissionKey) {
    if (!isSupabaseConfigured) return false

    try {
      const permissions = await this.getUserProjectPermissions(userId, projectId)

      // Check for all permissions marker
      if (permissions.includes('*')) return true

      // Check for specific permission
      return permissions.includes(permissionKey)
    } catch (error) {
      console.error('Error checking permission:', error)
      return false
    }
  },

  // Grant permissions to user
  async grantProjectPermissions(projectUserId, permissionKeys, grantedBy) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      // Build array of permission objects
      const permissions = permissionKeys.map(key => ({
        project_user_id: projectUserId,
        permission_key: key,
        granted_by: grantedBy
      }))

      const { data, error } = await supabase
        .from('project_user_permissions')
        .insert(permissions)
        .select()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error granting permissions:', error)
      return { success: false, error: error.message }
    }
  },

  // Revoke permissions from user
  async revokeProjectPermissions(projectUserId, permissionKeys) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { error } = await supabase
        .from('project_user_permissions')
        .delete()
        .eq('project_user_id', projectUserId)
        .in('permission_key', permissionKeys)

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error revoking permissions:', error)
      return { success: false, error: error.message }
    }
  },

  // Set user permissions (replace all)
  async setProjectPermissions(projectUserId, permissionKeys, grantedBy) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      // First, remove all existing permissions
      await supabase
        .from('project_user_permissions')
        .delete()
        .eq('project_user_id', projectUserId)

      // Then add new permissions
      if (permissionKeys.length > 0) {
        const permissions = permissionKeys.map(key => ({
          project_user_id: projectUserId,
          permission_key: key,
          granted_by: grantedBy
        }))

        const { data, error } = await supabase
          .from('project_user_permissions')
          .insert(permissions)
          .select()

        if (error) throw error
        return { success: true, data }
      }

      return { success: true }
    } catch (error) {
      console.error('Error setting permissions:', error)
      return { success: false, error: error.message }
    }
  },

  // Get all available permissions
  async getAllPermissions() {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('project_permissions')
        .select('*')
        .order('category, permission_name')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching permissions:', error)
      return []
    }
  },

  // Get role templates
  async getRoleTemplates() {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('role_templates')
        .select('*')
        .order('role_name')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching role templates:', error)
      return []
    }
  },

  // Get role template by key
  async getRoleTemplate(roleKey) {
    if (!isSupabaseConfigured) return null

    try {
      const { data, error } = await supabase
        .from('role_templates')
        .select('*')
        .eq('role_key', roleKey)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error fetching role template:', error)
      return null
    }
  },

  // Get project-specific notification roles
  async getProjectNotificationRoles(projectId) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('notification_roles')
        .select('*')
        .eq('project_id', projectId)
        .order('role_name')

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching project notification roles:', error)
      return []
    }
  },

  // Create project-specific notification role
  async createProjectNotificationRole(projectId, roleName, roleKey, description) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      const { data, error } = await supabase
        .from('notification_roles')
        .insert({
          project_id: projectId,
          role_name: roleName,
          role_key: roleKey,
          description: description
        })
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error creating project notification role:', error)
      return { success: false, error: error.message }
    }
  },

  // ============================================
  // LOGIN SEPARATION FUNCTIONS
  // ============================================

  // Verify company name + office PIN
  async verifyCompanyOfficePin(companyName, officePin) {
    if (!isSupabaseConfigured) return null

    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, field_code')
        .ilike('name', companyName)
        .eq('office_pin', officePin)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error verifying company office PIN:', error)
      return null
    }
  },

  // Verify field code + project PIN
  async verifyFieldAccess(fieldCode, projectPin) {
    if (!isSupabaseConfigured) return null

    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          company_id,
          companies (
            id,
            name
          )
        `)
        .eq('companies.field_code', fieldCode)
        .eq('pin', projectPin)
        .single()

      if (error) throw error

      return {
        project_id: data.id,
        project_name: data.name,
        company_id: data.companies.id,
        company_name: data.companies.name
      }
    } catch (error) {
      console.error('Error verifying field access:', error)
      return null
    }
  },

  // Create office user account
  async createOfficeUser({ company_id, name, email, password, role }) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role
          }
        }
      })

      if (authError) throw authError

      // Create user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          company_id,
          name,
          email,
          role
        })
        .select()
        .single()

      if (userError) throw userError

      // MULTI-COMPANY: Automatically add user to configured companies
      if (AUTO_ADD_COMPANIES.length > 0) {
        const userCompaniesData = AUTO_ADD_COMPANIES.map(company => ({
          user_id: authData.user.id,
          company_id: company.id,
          role: role || 'user'
        }))

        const { error: ucError } = await supabase
          .from('user_companies')
          .insert(userCompaniesData)

        if (ucError) {
          console.warn('Could not add user to user_companies:', ucError)
          // Don't throw - user was created successfully, this is just a nice-to-have
        }
      }

      return { success: true, data: userData }
    } catch (error) {
      console.error('Error creating office user:', error)
      return { success: false, error: error.message }
    }
  },

  // Log field access (audit trail)
  async logFieldAccess({ company_id, project_id, foreman_name, company_code_used, project_pin_used }) {
    if (!isSupabaseConfigured) return { success: false }

    try {
      const { error } = await supabase
        .from('field_access_log')
        .insert({
          company_id,
          project_id,
          foreman_name,
          company_code_used,
          project_pin_used
        })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error logging field access:', error)
      return { success: false, error: error.message }
    }
  },

  // Log field activity (audit trail)
  async logFieldActivity({ project_id, foreman_name, activity_type, activity_id, description }) {
    if (!isSupabaseConfigured) return { success: false }

    try {
      const { error } = await supabase
        .from('field_activity_log')
        .insert({
          project_id,
          foreman_name,
          activity_type,
          activity_id,
          description
        })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Error logging field activity:', error)
      return { success: false, error: error.message }
    }
  },

  // Get field access history
  async getFieldAccessHistory(projectId, limit = 50) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('field_access_log')
        .select('*')
        .eq('project_id', projectId)
        .order('accessed_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching field access history:', error)
      return []
    }
  },

  // Get field activity history
  async getFieldActivityHistory(projectId, limit = 100) {
    if (!isSupabaseConfigured) return []

    try {
      const { data, error } = await supabase
        .from('field_activity_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching field activity history:', error)
      return []
    }
  },

  // ============================================
  // COMPANY REGISTRATION
  // ============================================

  // Create company with admin account (self-service registration)
  async createCompanyWithAdmin({ company_name, field_code, office_pin, admin_name, admin_email, admin_password }) {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase not configured' }

    try {
      // Check if field code already exists
      const { data: existingFieldCode } = await supabase
        .from('companies')
        .select('id')
        .eq('field_code', field_code)
        .single()

      if (existingFieldCode) {
        return { success: false, error: 'Field code already in use. Please choose another.' }
      }

      // Check if office PIN already exists
      const { data: existingPin } = await supabase
        .from('companies')
        .select('id')
        .eq('office_pin', office_pin)
        .single()

      if (existingPin) {
        return { success: false, error: 'Office PIN already in use. Please generate a new one.' }
      }

      // Create company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: company_name,
          field_code: field_code,
          office_pin: office_pin
        })
        .select()
        .single()

      if (companyError) throw companyError

      // Create admin auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: admin_email,
        password: admin_password,
        options: {
          data: {
            name: admin_name,
            role: 'admin'
          }
        }
      })

      if (authError) {
        // Rollback company creation
        await supabase.from('companies').delete().eq('id', company.id)
        throw authError
      }

      // Create admin user profile
      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          company_id: company.id,
          name: admin_name,
          email: admin_email,
          role: 'admin'
        })

      if (userError) {
        // Rollback company and auth
        await supabase.from('companies').delete().eq('id', company.id)
        throw userError
      }

      // MULTI-COMPANY: Automatically add admin to configured companies
      if (AUTO_ADD_COMPANIES.length > 0) {
        const userCompaniesData = AUTO_ADD_COMPANIES.map(company => ({
          user_id: authData.user.id,
          company_id: company.id,
          role: 'admin'
        }))

        const { error: ucError } = await supabase
          .from('user_companies')
          .insert(userCompaniesData)

        if (ucError) {
          console.warn('Could not add admin to user_companies:', ucError)
          // Don't throw - admin was created successfully
        }
      }

      return {
        success: true,
        company: company,
        admin: authData.user
      }
    } catch (error) {
      console.error('Error creating company with admin:', error)
      return { success: false, error: error.message }
    }
  }
}

